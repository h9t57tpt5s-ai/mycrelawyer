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

    for data_file, activity_file, folder in (("ch11-petitions.json", "ch11-activity.json", "chapter-11"),
                                             ("federal-suits.json", "suit-activity.json", "federal-cases")):
        records = json.loads((ROOT / "ops" / data_file).read_text()).get("filings", []) \
            if (ROOT / "ops" / data_file).exists() else []
        activity = json.loads((ROOT / "ops" / activity_file).read_text()).get("dockets", {}) \
            if (ROOT / "ops" / activity_file).exists() else {}
        for r in records:
            if (ROOT / folder / f"{r['slug']}.html").exists():
                last = max(r["dateFiled"], (activity.get(str(r.get("docketId"))) or {}).get("lastEntryDate") or "")
                urls.append((f"{folder}/{r['slug']}.html", last, "0.5"))

    # Company, agency and property landing pages (build_entity_pages.ts):
    # lastmod is the file's last commit, which changes only when its matters do.
    for folder in ("parties", "properties"):
        for f in sorted((ROOT / folder).glob("*.html")) if (ROOT / folder).exists() else []:
            urls.append((f"{folder}/{f.name}", git_date(f), "0.6"))

    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, last, pri in urls:
        lines += ["  <url>", f"    <loc>{SITE}/{loc}</loc>", f"    <lastmod>{last}</lastmod>", f"    <priority>{pri}</priority>", "  </url>"]
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n")
    write_news_sitemap()
    print(f"{len(urls)} urls ({sum(1 for u in urls if u[0].startswith('matters/'))} matter pages, "
          f"{sum(1 for u in urls if u[0].startswith('chapter-11/'))} Chapter 11 pages, "
          f"{sum(1 for u in urls if u[0].startswith('federal-cases/'))} federal case pages)")


def write_news_sitemap():
    """news-sitemap.xml: matter pages added in the last two days, in Google's
    news sitemap format, so same-day write-ups are found for Google News and
    Top Stories quickly (Google reads only the last 48 hours of a news sitemap).
    Listed in robots.txt."""
    from xml.sax.saxutils import escape
    cutoff = (dt.date.today() - dt.timedelta(days=2)).isoformat()
    recent = [c for c in load_cases() if (c.get("addedDate") or "") >= cutoff
              and (ROOT / "matters" / f"{c['id']}.html").exists()]
    recent.sort(key=lambda c: (c.get("addedDate"), c["id"]), reverse=True)
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
             'xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">']
    for c in recent[:1000]:
        lines += ["  <url>", f"    <loc>{SITE}/matters/{c['id']}.html</loc>", "    <news:news>",
                  "      <news:publication><news:name>CREdocket</news:name><news:language>en</news:language></news:publication>",
                  f"      <news:publication_date>{c['addedDate']}</news:publication_date>",
                  f"      <news:title>{escape(c['title'])}</news:title>", "    </news:news>", "  </url>"]
    lines.append("</urlset>")
    (ROOT / "news-sitemap.xml").write_text("\n".join(lines) + "\n")
    print(f"news sitemap: {len(recent)} matter pages added since {cutoff}")


if __name__ == "__main__":
    main()
