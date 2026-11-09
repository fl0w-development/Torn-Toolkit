"""Torn Toolkit shared-faction-chain service tests. Run with unittest discover."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("faction_chain", Path(__file__).with_name("faction_chain.py"))
service = importlib.util.module_from_spec(spec)
spec.loader.exec_module(service)

def torn_stub(key, path):
    if path == "key/info":
        owners = {"leaderkeyleader1": 10, "memberkeymember1": 12, "strangerkey12345": 13}
        return {"info": {"user": {"id": owners.get(key), "faction_id": 321}}}
    if path == "faction/321/basic":
        return {"basic": {"id": 321, "leader_id": 10, "co_leader_id": 11}}
    if path == "faction/321/members":
        return {"members": [{"id": 10}, {"id": 11}, {"id": 12}]}
    raise AssertionError("Unexpected Torn API endpoint")

class FactionChainTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_db = service.DB_PATH
        service.DB_PATH = Path(self.temp.name) / "chains.sqlite3"
        service.init_db()

    def tearDown(self):
        service.DB_PATH = self.previous_db
        self.temp.cleanup()

    def test_editor_only_publish_and_preserved_duplicates(self):
        with patch.object(service, "call_torn", torn_stub):
            leader = service.verify_key("leaderkeyleader1")
            member = service.verify_key("memberkeymember1")
        self.assertTrue(leader["editor"])
        self.assertFalse(member["editor"])
        saved = service.publish_plan(leader, 0, [{"id": "123"}, {"id": "456"}, {"id": "123"}])
        self.assertEqual(saved["revision"], 1)
        self.assertEqual(saved["entries"], [{"id": "123"}, {"id": "456"}, {"id": "123"}])
        with self.assertRaises(service.ServiceError) as exc:
            service.publish_plan(member, 1, [{"id": "789"}])
        self.assertEqual(exc.exception.status, 403)
        self.assertEqual(service.current_plan(321)["revision"], 1)

    def test_refuses_non_member(self):
        with patch.object(service, "call_torn", torn_stub):
            with self.assertRaises(service.ServiceError) as exc:
                service.verify_key("strangerkey12345")
        self.assertEqual(exc.exception.status, 403)

    def test_revision_conflict_is_atomic(self):
        leader = {"user_id": 10, "faction_id": 321, "editor": True}
        service.publish_plan(leader, 0, [{"id": "111"}])
        with self.assertRaises(service.ServiceError) as exc:
            service.publish_plan(leader, 0, [{"id": "999"}])
        self.assertEqual(exc.exception.status, 409)
        self.assertEqual(service.current_plan(321)["entries"], [{"id": "111"}])

    def test_invalid_entries_rejected(self):
        for value in ([None], [{"id":"-1"}], [{"id":"abc"}], [{}], [{"id":"1"}]*151):
            with self.assertRaises(service.ServiceError):
                service.validate_entries(value)

    def test_session_has_no_api_key(self):
        with patch.object(service, "call_torn", torn_stub):
            info = service.create_session("leaderkeyleader1", "198.51.100.1")
        checked = service.session_for(info["token"])
        self.assertEqual(checked["user_id"], 10)
        self.assertNotIn("key", checked)
        self.assertTrue(checked["editor"])
        with self.assertRaises(service.ServiceError):
            service.session_for("invalid")

    def test_rejects_untrusted_browser_origin(self):
        handler = object.__new__(service.Handler)
        handler.headers = {"Origin": "https://www.torn.com"}
        self.assertEqual(handler._origin(), "https://www.torn.com")
        handler.headers = {"Origin": "https://attacker.example"}
        with self.assertRaises(service.ServiceError) as exc:
            handler._origin()
        self.assertEqual(exc.exception.status, 403)

if __name__ == "__main__":
    unittest.main()
