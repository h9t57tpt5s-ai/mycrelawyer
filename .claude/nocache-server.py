#!/usr/bin/env python3
"""Static file server for local preview that disables all caching.

Plain `python -m http.server` sends no Cache-Control header, so browsers
apply their own heuristic caching and can serve stale files for hours —
this became a real source of confusion while iterating on the site.
This wrapper forces every response to be revalidated on every request.
"""
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    http.server.test(HandlerClass=NoCacheHandler, port=port)
