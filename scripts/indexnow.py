#!/usr/bin/env python3
"""Tell search engines (Bing, Yandex, Seznam, Naver...) about changed pages
through IndexNow, so a new or updated matter is picked up in minutes
instead of on the next crawl. Google does not take part; it reads the
sitemap (submitted in Search Console 2026-10-03).

The key file is <KEY>.txt at the site root. Only pages listed in
sitemap.xml are submitted, so noindex pages and account.html never are.

  python3 scripts/indexnow.py <git-range>    e.g. abc123..HEAD
  python3 scripts/indexnow.py --urls https://credocket.com/matters/live-201.html ...
  python3 scripts/indexnow.py --all
"""

import argparse
import json
import pathlib
import re
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
SITE = "https://credocket.com"
KEY = "66c0f4102a8220ab258d5282c163966f"


def sitemap_urls():
    return set(re.findall(r"<loc>([^<]+)</loc>", (ROOT / "sitemap.xml").read_text()))


def changed_urls(git_range):
    out = subprocess.run(["git", "diff", "--name-only", git_range], cwd=ROOT, capture_output=True, text=True)
    if out.returncode:
        sys.exit(f"git diff failed: {out.stderr.strip()}")
    urls = set()
    for f in out.stdout.split():
        if not f.endswith(".html"):
            continue
        urls.add(f"{SITE}/" if f == "index.html" else f"{SITE}/{f}")
    return urls


def submit(urls):
    body = {"host": "credocket.com", "key": KEY, "keyLocation": f"{SITE}/{KEY}.txt", "urlList": sorted(urls)[:10000]}
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, ""
    except urllib.error.HTTPError as err:
        return err.code, err.read().decode(errors="replace")[:300]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("range", nargs="?", help="git range of changes to announce")
    ap.add_argument("--urls", nargs="*", default=[])
    ap.add_argument("--all", action="store_true", help="announce every page in the sitemap")
    args = ap.parse_args()
    known = sitemap_urls()
    wanted = set(known) if args.all else set(args.urls) | (changed_urls(args.range) if args.range else set())
    urls = wanted & known
    if not urls:
        print("No sitemap pages changed; nothing to announce.")
        return
    status, detail = submit(urls)
    print(f"IndexNow: {len(urls)} url(s), HTTP {status} {detail}")
    # 200/202 accepted; 422 can mean the key file is not live yet.
    if status not in (200, 202):
        sys.exit(1)


if __name__ == "__main__":
    main()
