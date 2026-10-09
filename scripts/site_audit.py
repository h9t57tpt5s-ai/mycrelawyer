#!/usr/bin/env python3
"""Audit the static site for problems a visitor or a search engine would hit
(2026-10-08). Read by the daily self-improvement routine, which fixes the
most important finding; written by .github/workflows/metrics-snapshot.yml.

Checks every page in the repo root, matters/, chapter-11/ and federal-cases/:
  - internal links and assets that point at a file that does not exist
  - missing or overlong <title>, missing or weak meta description, missing canonical
  - duplicate titles among root pages
  - root pages that no other page links to (orphans)
  - indexable root pages missing from sitemap.xml, and sitemap URLs with no file
  - images without alt text
  - very heavy pages
  - data freshness: newest matter added, newest Chapter 11 petition and federal case

  python3 scripts/site_audit.py            -> writes ops/metrics/audit.json
  python3 scripts/site_audit.py --print    -> prints the summary only
"""

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
from collections import Counter, defaultdict
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "ops" / "metrics" / "audit.json"
SITE = "https://credocket.com"
FOLDERS = ["matters", "chapter-11", "federal-cases"]
EXAMPLES = 25
HEAVY_BYTES = 600_000

sys.path.insert(0, str(ROOT / "scripts"))
from check_case_fields import load_cases  # noqa: E402


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links, self.title, self.desc, self.canonical, self.robots = [], None, None, None, ""
        self.imgs_no_alt, self._in_title = 0, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("a", "link") and a.get("href"):
            if tag == "link" and a.get("rel") == "canonical":
                self.canonical = a["href"]
            elif tag == "a" or a.get("rel") in ("stylesheet", "icon", "manifest"):
                self.links.append(a["href"])
        elif tag in ("script", "img", "source") and a.get("src"):
            self.links.append(a["src"])
        if tag == "img" and not (a.get("alt") or "").strip() and a.get("aria-hidden") != "true" and a.get("alt") != "":
            self.imgs_no_alt += 1
        if tag == "meta" and a.get("name") == "description":
            self.desc = a.get("content", "")
        if tag == "meta" and a.get("name") == "robots":
            self.robots = a.get("content", "")
        if tag == "title":
            self._in_title = True

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False

    def handle_data(self, data):
        if self._in_title:
            self.title = (self.title or "") + data


def pages():
    files = sorted(ROOT.glob("*.html"))
    for folder in FOLDERS:
        files += sorted((ROOT / folder).glob("*.html"))
    return files


def resolve(href, page_path):
    """Repo file a link points at, or None when it is external or not a file link."""
    if re.match(r"^(mailto:|tel:|javascript:|data:|#|sms:)", href):
        return None
    if href.startswith(SITE):
        href = href[len(SITE):] or "/"
    elif re.match(r"^(https?:)?//", href):
        return None
    path = re.split(r"[?#]", href, 1)[0]
    if not path or path.startswith("/_vercel"):
        return None
    if path == "/":
        return "index.html"
    if path.startswith("/"):
        target = path.lstrip("/")
    else:
        target = str((page_path.parent / path).resolve().relative_to(ROOT)) if (page_path.parent / path).resolve().is_relative_to(ROOT) else path
    if target.endswith("/"):
        target += "index.html"
    return target


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", action="store_true")
    args = ap.parse_args()

    files = pages()
    existing = {str(f.relative_to(ROOT)) for f in ROOT.rglob("*") if f.is_file() and ".git/" not in str(f)}
    broken, no_title, long_title, no_desc, weak_desc, no_canon, no_alt, heavy = ([] for _ in range(8))
    titles, inbound = defaultdict(list), Counter()
    root_pages = {}
    for f in files:
        rel = str(f.relative_to(ROOT))
        raw = f.read_text(errors="ignore")
        p = Page()
        try:
            p.feed(raw)
        except Exception as err:  # noqa: BLE001
            broken.append({"page": rel, "link": f"(parse error: {err})"})
            continue
        if len(raw.encode()) > HEAVY_BYTES:
            heavy.append({"page": rel, "kb": round(len(raw.encode()) / 1024)})
        title = re.sub(r"\s+", " ", (p.title or "")).strip()
        if not title:
            no_title.append(rel)
        elif len(title) > 75 and "/" not in rel:
            long_title.append({"page": rel, "chars": len(title), "title": title})
        if "/" not in rel:
            titles[title].append(rel)
            root_pages[rel] = "noindex" in p.robots
        if p.desc is None or not p.desc.strip():
            no_desc.append(rel)
        elif len(p.desc) < 70 or len(p.desc) > 320:
            weak_desc.append({"page": rel, "chars": len(p.desc)})
        if not p.canonical and "noindex" not in p.robots and rel != "account.html":
            no_canon.append(rel)
        if p.imgs_no_alt:
            no_alt.append({"page": rel, "images": p.imgs_no_alt})
        for href in set(p.links):
            target = resolve(href, f)
            if target is None:
                continue
            if target.endswith(".html"):
                inbound[target] += 0 if target == rel else 1
            if target not in existing:
                broken.append({"page": rel, "link": href})

    sitemap = (ROOT / "sitemap.xml").read_text() if (ROOT / "sitemap.xml").exists() else ""
    in_sitemap = {u[len(SITE) + 1:] or "index.html" for u in re.findall(r"<loc>([^<]+)</loc>", sitemap)}
    missing_from_sitemap = [p for p, noindex in root_pages.items()
                            if not noindex and p not in in_sitemap and p not in ("account.html", "404.html")]
    sitemap_without_file = sorted(u for u in in_sitemap if u not in existing)
    orphans = [p for p, noindex in root_pages.items() if not noindex and inbound[p] == 0 and p != "index.html"]
    dup_titles = {t: ps for t, ps in titles.items() if t and len(ps) > 1}

    today = dt.date.today()
    cases = load_cases()
    newest_added = max((c.get("addedDate") or c.get("date") or "") for c in cases)
    def newest(path):
        try:
            rows = json.loads((ROOT / "ops" / path).read_text()).get("filings", [])
            return max((r["dateFiled"] for r in rows), default=None), len(rows)
        except (FileNotFoundError, ValueError):
            return None, 0
    ch11_newest, ch11_n = newest("ch11-petitions.json")
    suit_newest, suit_n = newest("federal-suits.json")
    days = lambda d: (today - dt.date.fromisoformat(d)).days if d else None

    findings = {
        "brokenLinks": broken, "missingTitle": no_title, "longTitle": long_title, "missingDescription": no_desc,
        "weakDescription": weak_desc, "missingCanonical": no_canon, "duplicateTitles": dup_titles,
        "orphanPages": orphans, "missingFromSitemap": missing_from_sitemap, "sitemapUrlsWithoutFile": sitemap_without_file,
        "imagesWithoutAlt": no_alt, "heavyPages": heavy,
    }
    summary = {k: len(v) for k, v in findings.items()}
    out = {
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "pagesChecked": len(files),
        "pagesByFolder": {"root": sum(1 for f in files if f.parent == ROOT), **{d: sum(1 for f in files if f.parent.name == d) for d in FOLDERS}},
        "summary": summary,
        "freshness": {
            "matters": len(cases), "newestMatterAdded": newest_added, "daysSinceNewestMatter": days(newest_added),
            "ch11Petitions": ch11_n, "newestCh11Petition": ch11_newest, "daysSinceNewestCh11": days(ch11_newest),
            "federalSuits": suit_n, "newestFederalSuit": suit_newest, "daysSinceNewestSuit": days(suit_newest),
        },
        "findings": {k: (v[:EXAMPLES] if isinstance(v, list) else dict(list(v.items())[:EXAMPLES])) for k, v in findings.items()},
    }
    print(json.dumps({"pagesChecked": out["pagesChecked"], "summary": summary, "freshness": out["freshness"]}, indent=1))
    if not args.print:
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(out, indent=1) + "\n")


if __name__ == "__main__":
    main()
