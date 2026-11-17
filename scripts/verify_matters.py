#!/usr/bin/env python3
"""Verification gate for new tracker matters (2026-11-16).

An audit of about 250 published write-ups found errors in nearly every
one: wrong owners and parties, publication dates used as filing dates,
figures and claims no source contains. Jeff: "These write-ups need to be
vetted." From GATE_FROM on, a matter is published only if it passes
both checks below; scripts/add_matters.py calls check() and refuses a
matter that fails.

1. Source quotes. The matter carries a `factCheck` list, one item per
   figure, party, date and court: {"claim", "quote", "url"}, where quote
   is the source's own sentence, word for word. This script opens every
   url and requires the quote on the page (letters and digits compared,
   so spacing, punctuation and HTML do not matter). Then:
     - at least one quote comes from the matter's sourceUrl;
     - every figure in the title, brief, summary, significance, body,
       amount and SEO text appears in a verified quote ($, %, decimals,
       thousands commas, whole numbers of 100 or more except years);
     - every party name appears in a verified quote.
   Some sources refuse automated readers (The Real Deal, nycourts.gov,
   CourtListener). A quote from such a page counts only if the
   independent checker (2) opened the page itself and lists the exact
   quote in `confirmedQuotes`.
2. Independent check. The matter carries `secondCheck`, written by a
   separate fact-checker agent that did not write the matter and that
   opened the sources itself: {"verdict": "pass", "checker": "...",
   "urlsOpened": [...], "problems": [], "confirmedQuotes": [...]}.
   Anything but a clean "pass" holds the matter.

A passing matter is recorded in ops/matter-verification.json (committed:
id, date, urls, counts, the checker's verdict). Its quotes are kept
locally under .task-tmp/factcheck/ and never published.

  python3 scripts/verify_matters.py FILE.json   # dry check of drafted matters
"""

import html
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
LEDGER = ROOT / "ops" / "matter-verification.json"
LOCAL = ROOT / ".task-tmp" / "factcheck"
GATE_FROM = "2026-11-17"
UA = "Mozilla/5.0 (compatible; CREdocket source check; +https://credocket.com/methodology.html)"
TEXT_FIELDS = ("title", "brief", "summary", "significance", "amount", "seoTitle", "seoDescription")


def key(text):
    return re.sub(r"[^a-z0-9]", "", html.unescape(text or "").lower())


def page_text(url, cache):
    """Page text as a comparison key; '' when the page cannot be read."""
    if url in cache:
        return cache[url]
    raw = ""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml,application/pdf"})
        with urllib.request.urlopen(req, timeout=45) as r:
            raw = r.read().decode("utf-8", errors="replace")
    except Exception:
        # A second try with curl, which some sites treat differently.
        try:
            raw = subprocess.run(["curl", "-s", "-L", "--max-time", "45", "-A", UA, url],
                                 capture_output=True, text=True, timeout=60).stdout
        except Exception:
            raw = ""
    raw = re.sub(r"(?is)<(script|style|noscript)\b.*?</\1>", " ", raw)
    cache[url] = key(re.sub(r"<[^>]+>", " ", raw))
    return cache[url]


def figures(text):
    out = set()
    for m in re.finditer(r"(\$?)(\d[\d,]*(?:\.\d+)?)(\s*%|\s*percent)?", text or ""):
        num = m.group(2).rstrip(",.")
        plain = num.replace(",", "")
        is_year = re.fullmatch(r"(19|20)\d\d", plain) and not m.group(1) and not m.group(3)
        if m.group(1) or m.group(3) or "." in num or "," in num or (plain.isdigit() and int(plain) >= 100 and not is_year):
            out.add(re.sub(r"\D", "", plain))
    return out


def check(m, cache=None):
    """(problems, verified_quotes) for one drafted matter."""
    cache = {} if cache is None else cache
    problems, verified = [], []
    second = m.get("secondCheck") or {}
    if second.get("verdict") != "pass":
        problems.append("no passing independent check (secondCheck.verdict must be 'pass')")
    if second.get("problems"):
        problems.append("independent check listed problems: " + "; ".join(map(str, second["problems"]))[:400])
    if not second.get("urlsOpened"):
        problems.append("independent check opened no sources")
    confirmed = {key(q) for q in second.get("confirmedQuotes") or []}
    fc = m.get("factCheck") or []
    if not fc:
        problems.append("no factCheck quotes")
    for item in fc:
        url, quote = item.get("url") or m.get("sourceUrl"), item.get("quote") or ""
        k = key(quote)
        if len(k) < 20:
            problems.append(f"quote too short to check: {quote[:60]!r}")
            continue
        text = page_text(url, cache)
        if k and k in text:
            verified.append(item)
        elif k in confirmed:
            verified.append(dict(item, confirmedBy="secondCheck"))
        elif not text:
            problems.append(f"could not open {url} and the independent checker did not confirm the quote")
        else:
            problems.append(f"quote not found on {url}: {quote[:90]!r}")
    if m.get("sourceUrl") and not any((v.get("url") or m["sourceUrl"]) == m["sourceUrl"] for v in verified):
        problems.append("no verified quote comes from the sourceUrl itself")
    backed_text = " ".join(v["quote"] for v in verified)
    backed = figures(backed_text)
    claimed = set().union(*(figures(m.get(f) or "") for f in TEXT_FIELDS), *(figures(p) for p in m.get("body") or []))
    for num in sorted(claimed - backed):
        problems.append(f"figure {num} is not in any verified quote")
    bk = key(backed_text)
    for p in m.get("parties") or []:
        name = re.sub(r"\s*\(.*?\)\s*", " ", p.get("name") or "")
        if key(name) and key(name) not in bk:
            problems.append(f"party {p.get('name')!r} is not in any verified quote")
    return problems, verified


def record(m, verified):
    """Ledger entry (committed) plus the quotes (local only)."""
    ledger = json.loads(LEDGER.read_text()) if LEDGER.exists() else {"note": "Matters that passed scripts/verify_matters.py. Quotes are kept locally, not here.", "matters": {}}
    ledger["matters"][m["id"]] = {
        "verifiedOn": m.get("addedDate"),
        "sourceUrl": m.get("sourceUrl"),
        "urls": sorted({v.get("url") or m.get("sourceUrl") for v in verified}),
        "quotes": len(verified),
        "confirmedByChecker": sum(1 for v in verified if v.get("confirmedBy")),
        "secondCheck": {k: (m.get("secondCheck") or {}).get(k) for k in ("verdict", "checker", "urlsOpened")},
    }
    LEDGER.write_text(json.dumps(ledger, indent=1, ensure_ascii=False) + "\n")
    LOCAL.mkdir(parents=True, exist_ok=True)
    (LOCAL / f"{m['id']}.json").write_text(json.dumps({"factCheck": m.get("factCheck"), "secondCheck": m.get("secondCheck")}, indent=1, ensure_ascii=False))


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    cache, bad = {}, 0
    for m in json.loads(pathlib.Path(sys.argv[1]).read_text()):
        problems, verified = check(m, cache)
        print(("PASS " if not problems else "HOLD ") + (m.get("title") or "?")[:80] + f"  ({len(verified)} quotes verified)")
        for p in problems:
            print("  - " + p)
        bad += bool(problems)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
