#!/usr/bin/env python3
"""Regenerate sitemap.xml from the real pages.

Root pages: every *.html except account.html and pages marked
<meta name="robots" content="noindex">, lastmod from each file's own
`git log -1` date (today if the file has uncommitted changes), keeping the
priority each page already had. Matter pages (matters/<id>.html, built by
scripts/build_matter_pages.ts): lastmod is the date the matter was added
or last corrected, so a daily rebuild of an unchanged page does not look
like new content. Chapter 11 pages (chapter-11/<slug>.html, built by
scripts/build_ch11_pages.ts): lastmod is the latest of the filing date and
the newest docket entry shown.

Run by .github/workflows/prerender.yml; locally: python3 scripts/build_sitemap.py
"""

import datetime as dt
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
from check_case_fields import load_cases  # noqa: E402

SITE = "https://credocket.com"
today = dt.date.today().isoformat()


def git_date(path):
    rel = str(path.relative_to(ROOT))
    dirty = subprocess.run(["git", "status", "--porcelain", "--", rel], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    if dirty:
        return today
    out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", rel], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    return out or today


def main():
    current = (ROOT / "sitemap.xml").read_text() if (ROOT / "sitemap.xml").exists() else ""
    priority = dict(re.findall(r"<loc>https://credocket\.com/([^<]*)</loc>\s*<lastmod>[^<]*</lastmod>\s*<priority>([^<]*)</priority>", current))
    urls = []
    for f in sorted(ROOT.glob("*.html")):
        text = f.read_text(errors="ignore")
        if f.name == "account.html" or re.search(r'<meta name="robots" content="noindex', text):
            continue
        loc = "" if f.name == "index.html" and "" in priority else f.name
        default = "0.5" if f.name.startswith(("judge-", "company-")) else "0.7"
        urls.append((loc, git_date(f), priority.get(loc, default)))

    fixed = {}
    for e in json.loads((ROOT / "js" / "corrections.json").read_text())["entries"]:
        if e.get("caseId"):
            fixed[e["caseId"]] = max(fixed.get(e["caseId"], ""), e["date"])
    for c in sorted(load_cases(), key=lambda c: c["id"]):
        if (ROOT / "matters" / f"{c['id']}.html").exists():
            last = max(c.get("addedDate") or c.get("date") or today, fixed.get(c["id"], ""))
            urls.append((f"matters/{c['id']}.html", last, "0.6"))

    petitions = json.loads((ROOT / "ops" / "ch11-petitions.json").read_text()).get("filings", []) \
        if (ROOT / "ops" / "ch11-petitions.json").exists() else []
    activity = json.loads((ROOT / "ops" / "ch11-activity.json").read_text()).get("dockets", {}) \
        if (ROOT / "ops" / "ch11-activity.json").exists() else {}
    for r in petitions:
        if (ROOT / "chapter-11" / f"{r['slug']}.html").exists():
            last = max(r["dateFiled"], (activity.get(str(r.get("docketId"))) or {}).get("lastEntryDate") or "")
            urls.append((f"chapter-11/{r['slug']}.html", last, "0.5"))

    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, last, pri in urls:
        lines += ["  <url>", f"    <loc>{SITE}/{loc}</loc>", f"    <lastmod>{last}</lastmod>", f"    <priority>{pri}</priority>", "  </url>"]
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n")
    print(f"{len(urls)} urls ({sum(1 for u in urls if u[0].startswith('matters/'))} matter pages, "
          f"{sum(1 for u in urls if u[0].startswith('chapter-11/'))} Chapter 11 pages)")


if __name__ == "__main__":
    main()
