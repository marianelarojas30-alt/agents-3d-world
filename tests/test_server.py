import http.client
import importlib.util
import json
import pathlib
import threading
import unittest
from http.server import ThreadingHTTPServer

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("server", ROOT / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

LOCAL_HOST = f"127.0.0.1:{server.PORT}"


class ServerSecurityTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def request(self, method, path, host=LOCAL_HOST, origin=None, body=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Host": host}
        if origin:
            headers["Origin"] = origin
        data = None
        if body is not None:
            data = body if isinstance(body, bytes) else json.dumps(body).encode()
            headers["Content-Type"] = "application/json"
            headers["Content-Length"] = str(len(data))
        conn.request(method, path, body=data, headers=headers)
        res = conn.getresponse()
        payload = res.read()
        conn.close()
        return res, payload

    def test_allowlists_follow_port(self):
        self.assertIn(f"localhost:{server.PORT}", server.ALLOWED_HOSTS)
        self.assertIn(f"http://127.0.0.1:{server.PORT}", server.ALLOWED_ORIGINS)

    def test_foreign_host_is_rejected(self):
        res, _ = self.request("GET", "/api/backends", host="evil.example")
        self.assertEqual(res.status, 403)

    def test_rebinding_host_with_local_port_is_rejected(self):
        res, _ = self.request("GET", "/api/backends", host=f"evil.example:{server.PORT}")
        self.assertEqual(res.status, 403)

    def test_cross_site_origin_is_rejected(self):
        res, _ = self.request("POST", "/api/chat", origin="https://evil.example", body={"backend": "codex"})
        self.assertEqual(res.status, 403)

    def test_static_paths_cannot_escape(self):
        for path in ("/assets/faces/../../server.py", "/assets/faces/a/b.png", "/server.py"):
            with self.subTest(path=path):
                res, _ = self.request("GET", path)
                self.assertEqual(res.status, 404)

    def test_non_object_bodies_get_400_not_a_crash(self):
        for body in ([1, 2], "text", {"backend": 5}, {"backend": "codex", "worker": "x"}):
            with self.subTest(body=body):
                res, payload = self.request("POST", "/api/chat", body=body)
                self.assertEqual(res.status, 400)
                self.assertEqual(json.loads(payload), {"error": "bad request"})

    def test_unknown_backend_is_rejected(self):
        res, _ = self.request("POST", "/api/chat", body={"backend": "remote:gpt", "worker": {}, "message": "hi"})
        self.assertEqual(res.status, 400)

    def test_oversized_request_is_rejected(self):
        res, _ = self.request("POST", "/api/chat", body=b"x" * (server.MAX_REQUEST_BYTES + 1))
        self.assertEqual(res.status, 413)


if __name__ == "__main__":
    unittest.main()
