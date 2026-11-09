#!/usr/bin/env python3
"""Torn Toolkit faction chain plan service.

Run behind an HTTPS reverse proxy. Binds to 127.0.0.1 only.
Never saves or logs a Torn API key; login sends it to Torn once and creates
a short-lived, random bearer token for subsequent requests.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import threading
import time
from collections import defaultdict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

HOST = "127.0.0.1"
PORT = int(os.environ.get("TORN_TOOLKIT_PORT", "8787"))
DB_PATH = Path(os.environ.get("TORN_TOOLKIT_DB", str(Path(__file__).parent / ".data" / "chains.sqlite3")))
ALLOWED_ORIGINS = frozenset(o.strip().rstrip("/") for o in
    os.environ.get("TORN_TOOLKIT_ORIGINS", "https://www.torn.com,https://torn.com").split(",") if o.strip())
TORN_API = "https://api.torn.com/v2/"
MAX_BODY = 16_384
MAX_ENTRIES = 150
SESSION_SECONDS = 900  # stale faction membership/leadership limited to 15 minutes
_sessions: dict[str, dict] = {}
_sessions_lock = threading.Lock()
_login_attempts: dict[str, deque] = defaultdict(deque)


class ServiceError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH, timeout=10) as db:
        db.execute("PRAGMA journal_mode=WAL")
        db.execute("""CREATE TABLE IF NOT EXISTS faction_chains (
            faction_id INTEGER PRIMARY KEY,
            revision INTEGER NOT NULL,
            entries TEXT NOT NULL,
            updated_by INTEGER,
            updated_at INTEGER NOT NULL
        )""")


def call_torn(api_key: str, path: str) -> dict:
    req = Request(TORN_API + path, headers={
        "Authorization": "ApiKey " + api_key,
        "Accept": "application/json",
        "User-Agent": "TornToolkitFactionChains/0.1",
    })
    try:
        with urlopen(req, timeout=10) as response:
            body = response.read(300_000)
        result = json.loads(body)
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise ServiceError(502, "Could not verify account with Torn right now.") from exc
    if not isinstance(result, dict) or result.get("error"):
        raise ServiceError(401, "Torn rejected this key or API permission.")
    return result


def verify_key(api_key: str) -> dict:
    if not isinstance(api_key, str) or len(api_key) != 16 or not api_key.isalnum():
        raise ServiceError(400, "Use a valid 16-character Torn API key.")
    info = call_torn(api_key, "key/info").get("info", {})
    user = info.get("user") if isinstance(info, dict) else None
    if not isinstance(user, dict):
        raise ServiceError(401, "Key owner could not be verified.")
    try:
        user_id = int(user["id"])
        faction_id = int(user["faction_id"])
    except (KeyError, TypeError, ValueError):
        raise ServiceError(403, "Join a Torn faction before connecting.") from None
    if user_id <= 0 or faction_id <= 0:
        raise ServiceError(403, "A valid faction membership is required.")
    basic = call_torn(api_key, f"faction/{faction_id}/basic").get("basic", {})
    roster = call_torn(api_key, f"faction/{faction_id}/members").get("members", [])
    if not isinstance(basic, dict) or int(basic.get("id", 0)) != faction_id:
        raise ServiceError(401, "Torn faction details could not be verified.")
    if not isinstance(roster, list) or not any(
        isinstance(member, dict) and str(member.get("id")) == str(user_id) for member in roster
    ):
        raise ServiceError(403, "Your account is not on the faction roster.")
    editor = str(user_id) in {str(basic.get("leader_id")), str(basic.get("co_leader_id"))}
    return {"user_id": user_id, "faction_id": faction_id, "editor": editor}


def session_for(token: str) -> dict:
    if not isinstance(token, str) or len(token) < 32:
        raise ServiceError(401, "Connect your faction account.")
    digest = hashlib.sha256(token.encode("ascii", errors="ignore")).hexdigest()
    with _sessions_lock:
        entry = _sessions.get(digest)
        if not entry or entry["expires_at"] <= int(time.time()):
            _sessions.pop(digest, None)
            raise ServiceError(401, "Faction connection expired. Reconnect.")
        return dict(entry)


def create_session(key: str, ip: str) -> dict:
    now = time.time()
    with _sessions_lock:
        attempts = _login_attempts[ip]
        while attempts and now - attempts[0] >= 60:
            attempts.popleft()
        if len(attempts) >= 120:
            raise ServiceError(429, "Too many connection attempts. Try again shortly.")
        attempts.append(now)
    identity = verify_key(key)
    token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + SESSION_SECONDS
    with _sessions_lock:
        _sessions[hashlib.sha256(token.encode()).hexdigest()] = {
            **identity, "expires_at": expires_at
        }
        for digest, entry in list(_sessions.items()):
            if entry["expires_at"] <= int(time.time()):
                _sessions.pop(digest, None)
    return {**identity, "token": token, "expires_at": expires_at}


def validate_entries(value: object) -> list[dict]:
    if not isinstance(value, list) or len(value) > MAX_ENTRIES:
        raise ServiceError(400, "Chain must contain 0 to 150 targets.")
    result = []
    for item in value:
        if not isinstance(item, dict):
            raise ServiceError(400, "Each chain target must be an object.")
        player_id = str(item.get("id", "")).strip()
        if not player_id.isascii() or not player_id.isdigit() or not (0 < int(player_id) <= 9_999_999_999):
            raise ServiceError(400, "Chain contains an invalid Torn player ID.")
        result.append({"id": str(int(player_id))})
    return result


def current_plan(faction_id: int) -> dict:
    with sqlite3.connect(DB_PATH, timeout=10) as db:
        row = db.execute("SELECT revision, entries, updated_by, updated_at FROM faction_chains WHERE faction_id=?",
                         (faction_id,)).fetchone()
    if not row:
        return {"revision": 0, "entries": [], "updated_by": None, "updated_at": 0}
    return {"revision": row[0], "entries": json.loads(row[1]),
            "updated_by": row[2], "updated_at": row[3]}


def publish_plan(identity: dict, revision: object, entries: object) -> dict:
    if not identity.get("editor"):
        raise ServiceError(403, "Only the faction leader or co-leader may publish.")
    if type(revision) is not int or revision < 0:
        raise ServiceError(400, "Invalid plan revision.")
    valid = validate_entries(entries)
    faction_id = identity["faction_id"]
    now = int(time.time())
    with sqlite3.connect(DB_PATH, timeout=10) as db:
        db.execute("BEGIN IMMEDIATE")
        previous = db.execute("SELECT revision FROM faction_chains WHERE faction_id=?",
                              (faction_id,)).fetchone()
        expected = previous[0] if previous else 0
        if expected != revision:
            raise ServiceError(409, "Another leader published a newer plan. Reload before publishing.")
        updated = expected + 1
        db.execute("""INSERT INTO faction_chains(faction_id,revision,entries,updated_by,updated_at)
            VALUES (?,?,?,?,?) ON CONFLICT(faction_id)
            DO UPDATE SET revision=excluded.revision, entries=excluded.entries,
            updated_by=excluded.updated_by, updated_at=excluded.updated_at""",
            (faction_id, updated, json.dumps(valid, separators=(",", ":")), identity["user_id"], now))
    return current_plan(faction_id)


class Handler(BaseHTTPRequestHandler):
    server_version = "TornToolkitChainService/0.1"

    def log_message(self, format: str, *args: object) -> None:
        # No request headers, URLs, payloads, API keys, or session tokens in logs.
        pass

    def _origin(self) -> str | None:
        origin = self.headers.get("Origin")
        if origin and origin.rstrip("/") not in ALLOWED_ORIGINS:
            raise ServiceError(403, "Origin not allowed.")
        return origin.rstrip("/") if origin else None

    def _respond(self, status: int, payload: dict, origin: str | None = None) -> None:
        encoded = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ServiceError(400, "Invalid request length.") from None
        if length <= 0 or length > MAX_BODY:
            raise ServiceError(413, "Request body exceeds limit.")
        try:
            result = json.loads(self.rfile.read(length))
        except (UnicodeError, ValueError):
            raise ServiceError(400, "Invalid JSON.") from None
        if not isinstance(result, dict):
            raise ServiceError(400, "Expected a JSON object.")
        return result

    def _identity(self) -> dict:
        authorization = self.headers.get("Authorization", "")
        if not authorization.startswith("Bearer "):
            raise ServiceError(401, "Connect your faction account.")
        return session_for(authorization[7:])

    def _handle(self, method: str) -> None:
        origin = None
        try:
            origin = self._origin()
            path = self.path
            if method == "GET" and path == "/health":
                self._respond(200, {"status": "ok"}, origin)
            elif method == "POST" and path == "/v1/session":
                data = self._body()
                # Key exists only for this authentication call; never persisted.
                self._respond(200, create_session(data.get("key"), self.client_address[0]), origin)
            elif method == "GET" and path == "/v1/plan":
                identity = self._identity()
                self._respond(200, {"faction_id": identity["faction_id"], "editor": identity["editor"],
                                     **current_plan(identity["faction_id"])}, origin)
            elif method == "PUT" and path == "/v1/plan":
                identity = self._identity()
                data = self._body()
                updated = publish_plan(identity, data.get("revision"), data.get("entries"))
                self._respond(200, {"faction_id": identity["faction_id"], "editor": identity["editor"],
                                     **updated}, origin)
            else:
                raise ServiceError(404, "Route not found.")
        except ServiceError as exc:
            self._respond(exc.status, {"error": exc.message}, origin)
        except Exception:
            self._respond(500, {"error": "Internal server error."}, origin)

    def do_OPTIONS(self) -> None:
        try:
            origin = self._origin()
        except ServiceError:
            self.send_response(403)
            self.end_headers()
            return
        self.send_response(204)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type")
            self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self) -> None:
        self._handle("GET")

    def do_POST(self) -> None:
        self._handle("POST")

    def do_PUT(self) -> None:
        self._handle("PUT")


if __name__ == "__main__":
    init_db()
    print(f"Torn Toolkit faction chain service on http://{HOST}:{PORT}")
    print("Do not expose this HTTP port. Put an HTTPS reverse proxy in front of it.")
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
