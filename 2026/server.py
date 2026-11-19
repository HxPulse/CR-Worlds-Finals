#%%
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent

DECKS_FILE = HERE / "decks.json"
with DECKS_FILE.open("r", encoding="utf-8") as f:
    DECKS = json.load(f)

class Handler(SimpleHTTPRequestHandler):
    """Serves static files plus the /api/decks JSON endpoint."""

    def do_GET(self):
        if self.path.split("?", 1)[0] == "/api/decks":
            body = json.dumps(DECKS).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        else:
            super().do_GET()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="127.0.0.1")
    args, _ = parser.parse_known_args()

    handler = partial(Handler, directory=str(HERE))
    with ThreadingHTTPServer((args.host, args.port), handler) as httpd:
        print(f"{len(DECKS)} decks loaded. Open http://{args.host}:{args.port}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")

main()
#%%