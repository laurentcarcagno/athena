import json
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer

from athena_sdk import AthenaClient, AthenaError

CALLS = []


class Handler(BaseHTTPRequestHandler):
    def _reply(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length).decode("utf-8") if length else None
        CALLS.append({"method": self.command, "path": self.path, "auth": self.headers.get("Authorization"), "body": body})
        if self.path.startswith("/v1/me/tokens") and self.headers.get("Authorization") != "Bearer athp_secret":
            payload, status = {"error": "forbidden"}, 403
        elif self.command == "DELETE":
            self.send_response(204)
            self.end_headers()
            return
        else:
            payload, status = {"ok": True, "path": self.path}, 200
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    do_GET = do_POST = do_DELETE = _reply

    def log_message(self, *args):
        pass


class ClientTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.server.server_port

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def test_get_avec_jeton_porteur_et_requete(self):
        client = AthenaClient(self.base, "athp_secret")
        result = client.search.search(query={"q": "status = Open", "limit": 10, "absent": None})
        self.assertTrue(result["ok"])
        self.assertEqual(CALLS[-1]["auth"], "Bearer athp_secret")
        self.assertIn("q=status+%3D+Open", CALLS[-1]["path"])
        self.assertNotIn("absent", CALLS[-1]["path"])

    def test_post_avec_corps_json_et_delete_sans_contenu(self):
        client = AthenaClient(self.base, "athp_secret")
        client.pat.create(body={"name": "CI", "scope": "read", "expiresInDays": 30})
        self.assertEqual(CALLS[-1]["method"], "POST")
        self.assertEqual(json.loads(CALLS[-1]["body"]), {"name": "CI", "scope": "read", "expiresInDays": 30})
        self.assertIsNone(client.pat.revoke("a/b c"))
        self.assertEqual(CALLS[-1]["path"], "/v1/me/tokens/a%2Fb%20c")

    def test_statut_non_2xx_leve_athena_error(self):
        client = AthenaClient(self.base, "mauvais")
        with self.assertRaises(AthenaError) as raised:
            client.pat.list()
        self.assertEqual(raised.exception.status, 403)
        self.assertEqual(raised.exception.body, {"error": "forbidden"})


if __name__ == "__main__":
    unittest.main()
