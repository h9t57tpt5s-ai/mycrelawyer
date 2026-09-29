#!/usr/bin/env python3
"""Verify queued Market Signals against their sources, then publish them.

The digest routine runs where it can search the web but not open pages,
so it cannot check a figure against its source. It queues each drafted
signal as ops/pending-signals/<id>.json:

  {"trend": {id, title, category, date, scope, metric, sourceUrl,
             summary, significance, tags},
   "verification": [{"claim": "...", "quote": "...", "url": "..."}]}

This script (run by .github/workflows/verify-signals.yml, which can open
pages) fetches every url, and publishes the signal into js/data.js only if
  - every quote is found word for word on its page (letters and digits
    compared, so spacing, punctuation and HTML do not matter), and
  - every figure in the title, metric, summary and significance appears
    in at least one verified quote.
A signal that fails is moved to ops/pending-signals/rejected/ with the
reasons. No page text is stored.

  python3 scripts/verify_signals.py [--dry-run]
"""

import argparse
import html
import json
import pathlib
import re
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
QUEUE = ROOT / "ops" / "pending-signals"
REJECTED = QUEUE / "rejected"
DATA = ROOT / "js" / "data.js"
CATEGORIES = {"landlord-tenant", "zoning-land-use", "reit-securities", "construction-defect", "lending-foreclosure",
              "environmental", "eminent-domain", "lease-disputes", "premises-liability"}
FIELDS = ["id", "title", "category", "date", "scope", "metric", "source", "sourceUrl", "summary", "significance", "tags"]
UA = "Mozilla/5.0 (compatible; CREdocket source check; +https://credocket.com/methodology.html)"


def key(text):
    return re.sub(r"[^a-z0-9]", "", html.unescape(text).lower())


def page_text(url, cache):
    if url not in cache:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml"})
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read().decode("utf-8", errors="replace")
        raw = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", raw)
        cache[url] = key(re.sub(r"<[^>]+>", " ", raw))
    return cache[url]


def figures(text):
    """Figures a reader would check: anything with $, %, a decimal point
    or a thousands comma, or a whole number of 100 or more that is not a
    year. Returned as digit strings so "$3.16B" matches "$3.16 billion"."""
    out = set()
    for m in re.finditer(r"(\$?)(\d[\d,]*(?:\.\d+)?)(\s*%|\s*percent)?", text):
        num = m.group(2).rstrip(",.")
        plain = num.replace(",", "")
        is_year = re.fullmatch(r"(19|20)\d\d", plain) and not m.group(1) and not m.group(3)
        if m.group(1) or m.group(3) or "." in num or "," in num or (plain.isdigit() and int(plain) >= 100 and not is_year):
            out.add(re.sub(r"\D", "", plain))
    return out


def check(item, cache):
    problems = []
    t = item.get("trend") or {}
    ver = item.get("verification") or []
    for f in ("id", "title", "category", "date", "scope", "sourceUrl", "summary", "significance", "tags"):
        if not t.get(f):
            problems.append(f"missing {f}")
    if t.get("category") and t["category"] not in CATEGORIES:
        problems.append(f"unknown category {t['category']!r}")
    if not re.fullmatch(r"trend-\d{3}", t.get("id", "")):
        problems.append("id must look like trend-NNN")
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", t.get("date", "")):
        problems.append("date must be YYYY-MM-DD")
    if not ver:
        problems.append("no verification quotes")
    verified = []
    for v in ver:
        url, quote = v.get("url") or t.get("sourceUrl"), v.get("quote") or ""
        if len(key(quote)) < 20:
            problems.append(f"quote too short to check: {quote!r}")
            continue
        try:
            text = page_text(url, cache)
        except Exception as err:
            problems.append(f"could not open {url}: {err}")
            continue
        if key(quote) in text:
            verified.append(quote)
        else:
            problems.append(f"quote not found on {url}: {quote[:100]!r}")
    if t.get("sourceUrl") and not any((v.get("url") or t["sourceUrl"]) == t["sourceUrl"] for v in ver):
        problems.append("no quote comes from the sourceUrl itself")
    backed = set().union(*(figures(q) for q in verified)) if verified else set()
    claimed = set().union(*(figures(t.get(f) or "") for f in ("title", "metric", "summary", "significance")))
    for num in sorted(claimed - backed):
        problems.append(f"figure {num} is not in any verified quote")
    return problems


def publish(trend):
    s = DATA.read_text()
    if f'id: "{trend["id"]}"' in s:
        raise ValueError(f"{trend['id']} already exists in js/data.js")
    if trend["sourceUrl"] in s[s.index("trends: ["):]:
        raise ValueError("a signal with this sourceUrl is already published")
    start = s.index("trends: [")
    end = s.index("\n  ]", start)
    trend = dict(trend, source="live")
    body = ",\n".join(f"      {k}: {json.dumps(trend[k], ensure_ascii=False)}" for k in FIELDS if trend.get(k) not in (None, ""))
    s = s[:end] + ",\n    {\n" + body + "\n    }" + s[end:]
    DATA.write_text(s)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    files = sorted(QUEUE.glob("*.json"))
    if not files:
        print("Nothing queued.")
        return
    cache, published, rejected = {}, [], []
    for f in files:
        try:
            item = json.loads(f.read_text())
            problems = check(item, cache)
        except Exception as err:
            item, problems = {}, [f"unreadable: {err}"]
        if not problems and not args.dry_run:
            try:
                publish(item["trend"])
            except ValueError as err:
                problems = [str(err)]
        if problems:
            rejected.append((f, problems))
            print(f"REJECTED {f.name}:")
            for p in problems:
                print(f"  - {p}")
            if not args.dry_run:
                REJECTED.mkdir(exist_ok=True)
                item = item or {}
                item["rejected"] = problems
                (REJECTED / f.name).write_text(json.dumps(item, indent=1, ensure_ascii=False) + "\n")
                f.unlink()
        else:
            published.append(f)
            print(f"VERIFIED {f.name}: {item['trend']['title']}")
            if not args.dry_run:
                f.unlink()
    print(f"{len(published)} published, {len(rejected)} rejected")


if __name__ == "__main__":
    sys.exit(main())
