import importlib.util
import io
import json
import os
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("audit_server", ROOT / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class TransportBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.requests = []
        requests = self.requests
        class Sink(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_POST(self):
                body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
                requests.append((self.path, body))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"message":{"content":"fixture"}}')
            def do_GET(self):
                requests.append((self.path, b""))
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"models":[{"name":"fixture"}]}')
        self.sink = ThreadingHTTPServer(("127.0.0.1", 0), Sink)
        threading.Thread(target=self.sink.serve_forever, daemon=True).start()
        self.sink_url = "http://127.0.0.1:" + str(self.sink.server_port)

    def tearDown(self):
        self.sink.shutdown()
        self.sink.server_close()

    def test_environment_proxy_cannot_receive_local_chat(self):
        # Both the synthetic proxy and destination are loopback; no external traffic.
        with mock.patch.dict(os.environ, {"http_proxy": self.sink_url, "HTTP_PROXY": self.sink_url,
                                         "no_proxy": "", "NO_PROXY": ""}):
            with mock.patch.object(server, "OLLAMA_URL", self.sink_url):
                server.urllib.request._opener = None
                try:
                    self.assertEqual(server.call_ollama("fixture", {}, "SYNTHETIC-PRIVATE"), "fixture")
                finally:
                    server.urllib.request._opener = None
        self.assertEqual(self.requests[0][0], "/api/chat", "Request was routed via the environment proxy")

    def test_local_discovery_does_not_follow_redirects(self):
        sink_url = self.sink_url
        class Redirect(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass
            def do_GET(self):
                self.send_response(302)
                self.send_header("Location", sink_url + "/capture")
                self.end_headers()
        origin = ThreadingHTTPServer(("127.0.0.1", 0), Redirect)
        threading.Thread(target=origin.serve_forever, daemon=True).start()
        try:
            with mock.patch.object(server, "OLLAMA_URL", "http://127.0.0.1:" + str(origin.server_port)):
                self.assertEqual(server.list_ollama_models(), [])
            self.assertEqual(self.requests, [])
        finally:
            origin.shutdown()
            origin.server_close()


class StaticFileBoundaryTests(unittest.TestCase):
    @unittest.skipUnless(os.name == "posix", "symlink fixture")
    def test_static_asset_symlink_does_not_disclose_outside_file(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            web = root / "web"
            asset = web / "assets/faces/avatar.png"
            asset.parent.mkdir(parents=True)
            private = root / "private.txt"
            private.write_bytes(b"SYNTHETIC-PRIVATE-DATA")
            asset.symlink_to(private)
            handler = object.__new__(server.Handler)
            handler.wfile = io.BytesIO()
            handler.send_response = mock.Mock()
            handler.send_header = mock.Mock()
            handler.end_headers = mock.Mock()
            with mock.patch.object(server, "ROOT", str(web)):
                handler._send_file("assets/faces/avatar.png", "image/png")
            self.assertNotIn(b"SYNTHETIC-PRIVATE-DATA", handler.wfile.getvalue())
            self.assertIn(handler.send_response.call_args.args[0], (403, 404))
