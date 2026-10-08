#!/usr/bin/env python3
"""Leads for the research routine from two free, public sources (2026-10-07).

1. SEC full-text search: litigation that public real estate companies
   disclose themselves (10-K, 10-Q, 8-K, including state-court cases we
   cannot otherwise reach). Filtered to real estate industry codes; each
   hit is opened once and the sentences around the litigation phrase are
   kept verbatim with the filing's URL, so the routine can cite the SEC
   filing as a primary source. -> ops/sec-litigation-leads.json
2. Press-release wires: plaintiff firms announce securities class actions
   the day they file. Only headlines and links are kept (never the release
   text), and only for public real estate companies.
   -> ops/securities-suit-leads.json

The list of public real estate companies (CIK, ticker, name, SIC) comes from
EDGAR and is refreshed weekly -> ops/re-public-companies.json.

These are leads, not publications: the digest routine (STEP 1D) decides
what is commercial real estate, verifies it and writes it up.

  python3 scripts/pull_leads.py [--days 3] [--max-docs 25] [--dry-run]
"""

import argparse
import datetime as dt
import html
import json
import pathlib
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
COMPANIES = ROOT / "ops" / "re-public-companies.json"
SEC_LEADS = ROOT / "ops" / "sec-litigation-leads.json"
WIRE_LEADS = ROOT / "ops" / "securities-suit-leads.json"
SEC_UA = "CREdocket research admin@credocket.com"  # SEC requires a contact in the User-Agent
WIRE_UA = "Mozilla/5.0 (compatible; CREdocket/1.0; +https://credocket.com)"
KEEP_DAYS = 120

# Real estate industry codes: REITs, real estate operators and lessors,
# agents and managers, land subdividers and developers, hotels.
RE_SICS = ["6798", "6500", "6510", "6512", "6513", "6519", "6531", "6552", "7011"]
FORMS = "10-K,10-Q,8-K"  # adding the /A forms makes the search return nothing
PHRASES = ["filed a complaint", "filed a lawsuit", "filed suit", "commenced an action", "filed a petition",
           "foreclosure action", "appointment of a receiver", "receiver was appointed", "putative class action",
           "deed in lieu of foreclosure"]
CAPTION = re.compile(r"\b([A-Z][\w.,&'’-]*(?:\s+[\w.,&'’-]+){0,8}\s+v\.\s+[A-Z][\w.,&'’-]*(?:\s+[\w.,&'’-]+){0,8})")
COURT = re.compile(r"\b((?:United States )?(?:District|Bankruptcy|Superior|Circuit|Supreme|Chancery|County|Civil|Business) Court"
                   r"(?:\s+(?:of|for)(?:\s+the)?(?:\s+(?:[A-Z][\w.]*|of|and)){1,7})?|Court of Chancery(?:\s+of\s+the\s+State\s+of\s+[A-Z]\w+)?)")

# Contract exhibits (indentures, credit agreements, guaranties: ex4.x,
# ex10.x...) define "filing a petition" and "appointment of a receiver" as
# defaults; they are not lawsuits. Press-release exhibits (ex99) are kept.
CONTRACT_EXHIBIT = re.compile(r"ex(?!99)\d", re.I)
BOILERPLATE = re.compile(r"shall mean|\bmeans\b|event of default|act of insolvency|hereunder|herein|hereof|aggregate principal amount|"
                         r"noteholders|indenture|"
                         r"may be subject to|could be subject to|from time to time,? (?:we|the company) (?:are|is|may be)", re.I)

WIRE_FEEDS = [
    "https://www.globenewswire.com/RssFeed/keyword/class%20action",
    "https://www.globenewswire.com/RssFeed/keyword/securities%20fraud",
    "https://www.globenewswire.com/RssFeed/keyword/REIT",
    "https://www.globenewswire.com/RssFeed/keyword/real%20estate%20investment%20trust",
]
LAWSUIT_WORDS = re.compile(r"class action|securities fraud|lawsuit|investor alert|investigation|files suit|sued", re.I)


def get(url, ua, accept="application/json", timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": ua, "Accept": accept})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except urllib.error.HTTPError as err:
            if err.code in (429, 500, 502, 503) and attempt < 2:
                time.sleep(5 * (attempt + 1))
                continue
            raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == 2:
                raise
            time.sleep(5)


def load(path):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return {}


# ---------- public real estate companies ----------

def refresh_companies(today):
    cur = load(COMPANIES)
    if cur.get("updatedAt", "")[:10] >= (today - dt.timedelta(days=7)).isoformat() and cur.get("companies"):
        return cur["companies"]
    tickers = json.loads(get("https://www.sec.gov/files/company_tickers.json", SEC_UA))
    by_cik = {}
    for t in tickers.values():
        by_cik.setdefault(int(t["cik_str"]), []).append(t)
    out = {}
    for sic in RE_SICS:
        start = 0
        while True:
            url = (f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&SIC={sic}&type=10-Q&owner=include"
                   f"&count=100&output=atom&start={start}")
            page = get(url, SEC_UA, accept="application/atom+xml").decode("utf-8", "replace")
            ciks = [int(c) for c in re.findall(r"<cik>(\d+)</cik>", page)]
            for cik in ciks:
                for t in by_cik.get(cik, []):  # listed companies only
                    out[t["ticker"]] = {"cik": cik, "ticker": t["ticker"], "name": t["title"], "sic": sic}
            time.sleep(0.25)
            if 'rel="next"' not in page or not ciks or start > 3000:
                break
            start += 100
    companies = sorted(out.values(), key=lambda c: c["ticker"])
    COMPANIES.write_text(json.dumps({"updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                                     "about": "Listed companies filing under real estate SIC codes " + ", ".join(RE_SICS) + " (EDGAR). Used to pick real estate companies out of press-release feeds.",
                                     "companies": companies}, indent=1) + "\n")
    print(f"Real estate companies: {len(companies)} listed")
    return companies


# ---------- SEC litigation disclosures ----------

def doc_text(raw):
    t = raw.decode("utf-8", "replace")
    t = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", t)
    t = re.sub(r"(?s)<[^>]+>", " ", t)
    return re.sub(r"\s+", " ", html.unescape(t)).strip()


def excerpts(text, phrase, limit=3, width=600):
    out = []
    for m in re.finditer(re.escape(phrase), text, re.I):
        a = text.rfind(". ", 0, max(0, m.start() - width // 2))
        b = text.find(". ", m.end() + width // 2)
        chunk = text[(a + 2 if a >= 0 else max(0, m.start() - width // 2)):(b + 1 if b >= 0 else m.end() + width // 2)].strip()
        if not any(chunk[:80] in o for o in out):
            out.append(chunk[:1200])
        if len(out) >= limit:
            break
    return out


def pull_sec(today, days, max_docs, prev):
    start = (today - dt.timedelta(days=days)).isoformat()
    hits = {}
    # The search's own industry filter is ignored by the server (tested
    # 2026-10-07), so page through every hit and keep real estate SIC codes.
    for phrase in PHRASES:
        offset = 0
        while True:
            q = urllib.parse.urlencode({"q": f'"{phrase}"', "forms": FORMS, "dateRange": "custom", "startdt": start,
                                        "enddt": today.isoformat(), "from": offset}, quote_via=urllib.parse.quote)
            data = json.loads(get(f"https://efts.sec.gov/LATEST/search-index?{q}", SEC_UA))
            page = data.get("hits", {}).get("hits", [])
            for h in page:
                src = h["_source"]
                if not set(src.get("sics") or []) & set(RE_SICS):
                    continue
                adsh, fname = h["_id"].split(":", 1)
                if CONTRACT_EXHIBIT.search(fname):
                    continue
                key = f"{adsh}:{fname}"
                e = hits.setdefault(key, {"key": key, "adsh": adsh, "file": fname, "phrases": set(), "src": src})
                e["phrases"].add(phrase)
            time.sleep(0.25)
            offset += len(page)
            if not page or offset >= min(data.get("hits", {}).get("total", {}).get("value", 0), 1000):
                break
    known = {l["key"] for l in prev.get("leads", [])}
    # Companies repeat the same lawsuit in every quarterly report; once its
    # case names are on file for that company, later repeats are skipped.
    told = {}
    for l in prev.get("leads", []):
        told.setdefault(l.get("cik"), set()).update(l.get("captions") or [])
    fresh = [h for k, h in hits.items() if k not in known]
    fresh.sort(key=lambda h: h["src"].get("file_date", ""), reverse=True)
    leads = []
    for h in fresh[:max_docs]:
        src = h["src"]
        cik = (src.get("ciks") or [""])[0].lstrip("0")
        url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{h['adsh'].replace('-', '')}/{h['file']}"
        try:
            text = doc_text(get(url, SEC_UA, accept="text/html", timeout=90))
        except (urllib.error.URLError, TimeoutError) as err:
            print(f"  could not open {url}: {err}")
            continue
        time.sleep(0.25)
        quotes = [q for p in sorted(h["phrases"]) for q in excerpts(text, p) if not BOILERPLATE.search(q)][:4]
        if not quotes:
            continue
        joined = " ".join(quotes)
        captions = sorted(set(m.strip(" ,.;") for m in CAPTION.findall(joined)))[:8]
        if captions and set(captions) <= told.get(cik, set()):
            continue
        told.setdefault(cik, set()).update(captions)
        name = re.sub(r"\s+\(CIK \d+\)$", "", (src.get("display_names") or [""])[0]).strip()
        leads.append({
            "key": h["key"], "company": name, "cik": cik, "sic": (src.get("sics") or [""])[0],
            "form": src.get("form"), "filed": src.get("file_date"), "periodEnding": src.get("period_ending"),
            "url": url, "phrases": sorted(h["phrases"]), "excerpts": quotes,
            "captions": captions,
            "courts": sorted(set(re.sub(r"(\s+(and|of|the))+$", "", m.strip(" ,.;")) for m in COURT.findall(joined)))[:6],
            "firstSeen": today.isoformat(),
        })
    print(f"SEC: {len(hits)} filing hits in {days} days, {len(fresh)} new, {len(leads)} opened and kept")
    return leads


# ---------- press-release wires ----------

def pull_wires(today, companies):
    by_ticker = {c["ticker"].upper(): c for c in companies}
    names = [(re.sub(r"[^a-z0-9 ]", "", c["name"].lower()).replace(" inc", "").replace(" corp", "").strip(), c) for c in companies]
    leads, seen = [], 0
    for feed in WIRE_FEEDS:
        try:
            xml = get(feed, WIRE_UA, accept="application/rss+xml").decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError) as err:
            print(f"  feed failed {feed}: {err}")
            continue
        for item in re.findall(r"<item>(.*?)</item>", xml, re.S):
            seen += 1
            field = lambda tag: html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", (re.search(rf"<{tag}>(.*?)</{tag}>", item, re.S) or [None, ""])[1])).strip()
            title, link, pub = field("title"), field("link"), field("pubDate")
            if not LAWSUIT_WORDS.search(title):
                continue
            company = None
            for tok in re.findall(r"\b[A-Z]{1,5}\b", title):
                if tok in by_ticker and re.search(rf"(\(|NYSE|NASDAQ|^|\b){tok}\b", title):
                    company = by_ticker[tok]
                    break
            if not company:
                low = re.sub(r"[^a-z0-9 ]", "", title.lower())
                company = next((c for n, c in names if len(n) > 5 and n in low), None)
            if not company:
                continue
            firm = re.search(r"([A-Z][\w&.,' ]{2,60}?(?:LLP|LLC|P\.C\.|Law Firm|Law Group|PLLC))", title)
            leads.append({"key": link, "title": title, "url": link, "published": pub, "ticker": company["ticker"],
                          "company": company["name"], "cik": company["cik"], "firm": firm.group(1).strip() if firm else None,
                          "source": urllib.parse.urlparse(feed).netloc, "firstSeen": today.isoformat()})
        time.sleep(1)
    print(f"Wires: {seen} items read, {len(leads)} about public real estate companies")
    return leads


def merge(path, new, today, about):
    prev = load(path)
    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    rows = {l["key"]: l for l in prev.get("leads", []) if l.get("firstSeen", "") >= cutoff}
    added = 0
    for l in new:
        if l["key"] not in rows:
            rows[l["key"]] = l
            added += 1
    out = sorted(rows.values(), key=lambda l: (l.get("firstSeen", ""), l.get("filed") or l.get("published") or ""), reverse=True)
    return {"updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"), "about": about, "leads": out}, added


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=3)
    ap.add_argument("--max-docs", type=int, default=25)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    today = dt.date.today()
    errors = []
    try:
        companies = refresh_companies(today)
    except (urllib.error.URLError, TimeoutError, ValueError) as err:
        companies = load(COMPANIES).get("companies", [])
        errors.append(f"company list: {err}")
    try:
        sec = pull_sec(today, args.days, args.max_docs, load(SEC_LEADS))
    except (urllib.error.URLError, TimeoutError, ValueError) as err:
        sec = []
        errors.append(f"SEC search: {err}")
    wires = pull_wires(today, companies)
    sec_out, sec_added = merge(SEC_LEADS, sec, today, "Litigation that public real estate companies disclosed in SEC filings (full-text search, real estate SIC codes). Excerpts are verbatim from the filing at url. Leads for the digest routine's STEP 1D; not published as is.")
    wire_out, wire_added = merge(WIRE_LEADS, wires, today, "Press-release headlines announcing securities suits or investigations of public real estate companies (GlobeNewswire feeds). Headlines and links only. Leads for the digest routine's STEP 1D; not published as is.")
    print(f"New leads: {sec_added} SEC, {wire_added} wire")
    for e in errors:
        print(f"::warning::{e}")
    if args.dry_run:
        for l in sec[:5]:
            print(json.dumps({k: l[k] for k in ("company", "form", "filed", "url", "captions", "courts")}), "\n  ", l["excerpts"][0][:300])
        for l in wires[:5]:
            print(l["ticker"], "|", l["title"][:120])
        return
    SEC_LEADS.write_text(json.dumps(sec_out, indent=1) + "\n")
    WIRE_LEADS.write_text(json.dumps(wire_out, indent=1) + "\n")
    if errors and not sec and not wires:
        sys.exit("Every lead source failed.")


if __name__ == "__main__":
    main()
