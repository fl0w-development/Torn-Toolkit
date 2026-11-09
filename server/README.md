# Shared Faction Chain — server setup

Torn Toolkit's Faction Chain is a *separate, optional* shared plan. Everyone in a faction sees the same published order, while the original Solo Chain stays private on their own device. The service must be running before sharing works.

## Authentication and security

The service checks the user's Torn API key against Torn API v2: key/info for verified user/faction ID, faction/{id}/members for current membership, and faction/{id}/basic for leader/co-leader IDs. Only verified leaders/co-leaders can publish; everyone else in the faction is read-only. Publishing has version/conflict protection.

The user explicitly clicks **Connect faction** before their existing Torn API key is sent over HTTPS to the configured service. The server passes the key to Torn and does not save it. An unpredictable short-lived bearer token (15 minutes) is stored on the user's device for subsequent reads. Faction ID, user ID, editor permission and expiration are kept in memory on the server, and the published order is stored in SQLite.

Membership/leadership is rechecked at the next connection. Changes made during a 15-minute session may remain valid until expiration. To require immediate revocation, add server-side permission checks on every request using a separately managed service API key.

The API docs require transparency about key sharing. Never ask for Full Access; the public API endpoints are sufficient for this feature. Do not let a web proxy or HTTP debugger log key-bearing requests or bearer tokens.

## Deploy to the Windows VPS

Requires Python 3.11 or newer (no third-party packages), an HTTPS hostname pointing at the VPS, and a trusted reverse proxy.

1. Clone the Torn Toolkit repository on the VPS.
2. Start the server from the repository directory using PowerShell: py -3 server/faction_chain.py
3. The server binds only to 127.0.0.1:8787. **Do not expose this HTTP port directly to the internet.**
4. Put an HTTPS reverse proxy in front of the server. For example, a Caddyfile with a real domain of your choice:

~~~caddyfile
toolkit.example.com {
    reverse_proxy 127.0.0.1:8787
}
~~~

Replace the example domain, configure DNS and TLS, and run the proxy as a maintained Windows service. Enforce HTTPS and avoid request-body logging.

5. Give your faction members the real HTTPS service URL. Each member opens Torn Toolkit → Settings → Faction Chain service, enters that URL, saves it, and goes to the Faction Chain tab to click Connect faction.
6. The Torn faction leader or co-leader can create an order, add player IDs, rearrange them or import their own private Solo Chain, then select Publish faction order. Members see the current numbered order and manual Attack links. The open Faction Chain tab refreshes about once a minute.
7. Back up the SQLite database stored by default at server/.data/chains.sqlite3. Protect this directory from public access.

Every member must connect to the *same HTTPS service*. A single service can safely host several factions because each member's Torn faction ID determines which plan they can read.

Use an HTTPS origin only; the script rejects HTTP addresses and URLs with paths, query strings or credentials. The server permits browser requests from https://www.torn.com and https://torn.com by default. If your supported Torn client uses a different origin, explicitly add it with the TORN_TOOLKIT_ORIGINS environment variable after verifying its safety.

Optional environment variables: TORN_TOOLKIT_PORT, TORN_TOOLKIT_DB, and TORN_TOOLKIT_ORIGINS.

## API routes

- GET /health — public health check.
- POST /v1/session — accepts a JSON object containing key, validates Torn identity, returns token, expires_at, user_id, faction_id, editor.
- GET /v1/plan — requires Bearer token, returns the current plan for that member's faction.
- PUT /v1/plan — leader/co-leader only; requires JSON revision and entries array of player IDs. A stale revision returns HTTP 409 rather than overwriting another leader's update.

Only a published order is shared; unsaved drafts remain in a leader's current browser session. No action automatically attacks, heals or skips a player.

## Tests

From the repository root:

~~~powershell
py -3 -m unittest discover -s server -p "test_*.py" -v
~~~

## Deployment status

The GitHub source does not automatically deploy or activate a service. Before members can see each other's plans, deploy the server, configure HTTPS and enter its URL in the userscript. No payment or Premium system is included.
