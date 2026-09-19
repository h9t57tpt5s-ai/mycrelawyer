#!/usr/bin/env python3
"""Daily counterparty-surveillance pull from CourtListener.

Pulls every new Chapter 11 petition in a rolling window, then searches each
saved portfolio entity as a party in new federal filings, and hands the
results to the ingest-court-filings Edge Function, which stores, matches
and emails. Standard library only.

Nature-of-suit is blank on freshly filed dockets (verified 2026-09-18), so
there is no usable "all new CRE suits" query; civil coverage is driven by
entity names instead.

  python3 scripts/ingest_court_filings.py --dry-run --entities "Harbor Group Management;Simon Property Group"
"""

import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

CL_SEARCH = "https://www.courtlistener.com/api/rest/v4/search/"
EDGAR_SEARCH = "https://efts.sec.gov/LATEST/search-index"
# The SEC asks automated callers to identify themselves with a contact
# address; set SEC_USER_AGENT to a monitored mailbox.
SEC_USER_AGENT = os.environ.get("SEC_USER_AGENT", "CREdocket no-reply@credocket.com")
# Form 8-K items worth a counterparty's attention, under the SEC's own item
# titles. An item code names the TYPE of event, not its cause: 2.04 also
# covers a healthy company redeeming its own notes early, and 3.01 also
# covers a voluntary transfer between exchanges. Only 1.03 is unambiguous,
# so only 1.03 is ever shown publicly (see the 20260919b migration).
SEC_ITEMS = {
    "1.03": "Bankruptcy or Receivership",
    "2.04": "Triggering Events That Accelerate or Increase a Direct Financial Obligation",
    "3.01": "Notice of Delisting or Failure to Satisfy a Continued Listing Rule; Transfer of Listing",
}
MAX_EDGAR_PAGES = 5
CL_SITE = "https://www.courtlistener.com"
USER_AGENT = "CREdocket-surveillance/1.0 (+https://credocket.com)"
DEFAULT_FUNCTION_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/ingest-court-filings"
# CourtListener documents 5 requests/minute; 13s keeps us under it.
SECONDS_BETWEEN_REQUESTS = 13
MAX_CH11_PAGES = 10
DESIGNATORS = {"llc", "inc", "incorporated", "corp", "corporation", "co", "company",
               "lp", "llp", "lllp", "ltd", "limited", "pllc", "pc", "pa", "na", "plc"}


class BudgetExhausted(Exception):
    pass


class CourtListener:
    def __init__(self, token, budget):
        self.token = token
        self.remaining = budget
        self.last_request = 0.0

    def get(self, url):
        if self.remaining <= 0:
            raise BudgetExhausted()
        wait = SECONDS_BETWEEN_REQUESTS - (time.time() - self.last_request)
        if wait > 0:
            time.sleep(wait)
        headers = {"User-Agent": USER_AGENT}
        if self.token:
            headers["Authorization"] = f"Token {self.token}"
        self.remaining -= 1
        self.last_request = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as resp:
                return json.load(resp)
        except urllib.error.HTTPError as err:
            if err.code == 429:
                print("CourtListener rate limit hit (429); stopping pulls for this run.", file=sys.stderr)
                raise BudgetExhausted() from err
            raise

    def search(self, query):
        params = urllib.parse.urlencode({"type": "r", "order_by": "dateFiled desc", "q": query})
        return self.get(f"{CL_SEARCH}?{params}")


def to_filing(result, filing_type, date_from, date_to):
    date_filed = result.get("dateFiled") or ""
    docket_id = result.get("docket_id")
    path = result.get("docket_absolute_url") or ""
    case_name = (result.get("caseName") or "").strip()
    # The archive contains records with impossible dates (e.g. 2079); never
    # trust a row outside the window we asked for.
    if not (date_from <= date_filed <= date_to) or not isinstance(docket_id, int) or not path.startswith("/docket/") or not case_name:
        return None
    return {
        "source_docket_id": docket_id,
        "filing_type": filing_type,
        "court_id": result.get("court_id") or "",
        "court_name": result.get("court") or "",
        "docket_number": result.get("docketNumber") or "",
        "case_name": case_name,
        "date_filed": date_filed,
        "parties": [p for p in (result.get("party") or []) if isinstance(p, str) and p.strip()],
        "docket_url": CL_SITE + path,
    }


def pull_chapter_11(cl, date_from, date_to):
    filings, expected = [], None
    page = cl.search(f"chapter:11 AND dateFiled:[{date_from} TO {date_to}]")
    for _ in range(MAX_CH11_PAGES):
        if expected is None:
            expected = page.get("count")
        for r in page.get("results", []):
            if str(r.get("chapter")) != "11":
                continue
            f = to_filing(r, "bankruptcy_ch11", date_from, date_to)
            if f:
                filings.append(f)
        if not page.get("next"):
            break
        page = cl.get(page["next"])
    else:
        print(f"Chapter 11: stopped at {MAX_CH11_PAGES} pages; window may be incomplete.", file=sys.stderr)
    return filings, expected


def search_phrase(entity_name):
    tokens = re.sub(r"[^A-Za-z0-9&' -]", " ", entity_name.replace(".", "")).split()
    while tokens and tokens[-1].lower() in DESIGNATORS:
        tokens.pop()
    return " ".join(tokens)


def pull_entity(cl, entity_name, date_from, date_to):
    phrase = search_phrase(entity_name)
    # One-word phrases ("Summit") return mostly noise and cannot match anyway
    # unless identical; still searched, since an identical party is a real hit.
    if len(phrase) < 3:
        return []
    page = cl.search(f'party:"{phrase}" AND dateFiled:[{date_from} TO {date_to}]')
    out = []
    for r in page.get("results", []):
        kind = "bankruptcy_ch11" if str(r.get("chapter")) == "11" else "civil"
        f = to_filing(r, kind, date_from, date_to)
        if f:
            out.append(f)
    return out


def sec_company_name(display_name):
    # "Synergy CHC Corp.  (SNYR)  (CIK 0001562733)" -> "Synergy CHC Corp."
    return re.sub(r"\s*\([^()]*\)\s*", " ", display_name).strip()


def edgar_hits(url):
    # EDGAR full-text search intermittently answers 500; retry briefly.
    for attempt in range(4):
        time.sleep(1 + attempt * 3)
        try:
            req = urllib.request.Request(url, headers={"User-Agent": SEC_USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.load(resp).get("hits", {}).get("hits", [])
        except urllib.error.HTTPError as err:
            if err.code < 500 or attempt == 3:
                raise
            print(f"EDGAR HTTP {err.code}, retry {attempt + 1}/3", file=sys.stderr)


def pull_sec_8k(date_from, date_to):
    """Public-company 8-K event disclosures from EDGAR full-text search.

    A phrase search for "Item 1.03" also returns documents that merely
    mention it (verified 2026-09-19: 6 real filings among 39 hits), so a hit
    counts only if the filing's own item codes include the item and the
    document is the 8-K itself rather than an exhibit.
    """
    by_adsh = {}
    for item in SEC_ITEMS:
        for page in range(MAX_EDGAR_PAGES):
            params = urllib.parse.urlencode({
                "q": f'"Item {item}"', "forms": "8-K", "dateRange": "custom",
                "startdt": date_from, "enddt": date_to, "from": page * 100,
            })
            hits = edgar_hits(f"{EDGAR_SEARCH}?{params}")
            for h in hits:
                src = h.get("_source", {})
                adsh, ciks, names = src.get("adsh") or "", src.get("ciks") or [], src.get("display_names") or []
                file_date = src.get("file_date") or ""
                if item not in (src.get("items") or []) or src.get("file_type") != "8-K":
                    continue
                if not re.fullmatch(r"\d{10}-\d{2}-\d{6}", adsh) or not ciks or not names or not (date_from <= file_date <= date_to):
                    continue
                codes = sorted(set(src.get("items") or []) & set(SEC_ITEMS))
                by_adsh[adsh] = {
                    "source": "sec_edgar",
                    "source_docket_id": int(adsh.replace("-", "")),
                    "filing_type": "sec_8k",
                    "court_id": "sec",
                    "court_name": "SEC Form 8-K",
                    "docket_number": "; ".join(f"Item {c}: {SEC_ITEMS[c]}" for c in codes),
                    "case_name": sec_company_name(names[0]),
                    "date_filed": file_date,
                    "parties": [sec_company_name(n) for n in names],
                    "docket_url": f"https://www.sec.gov/Archives/edgar/data/{int(ciks[0])}/{adsh.replace('-', '')}/{adsh}-index.htm",
                }
            if len(hits) < 100:
                break
        else:
            print(f"SEC Item {item}: stopped at {MAX_EDGAR_PAGES} pages; window may be incomplete.", file=sys.stderr)
    return list(by_adsh.values())


def call_function(url, anon_key, secret, payload):
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {anon_key}",
                 "apikey": anon_key, "x-automation-secret": secret},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as err:
        body = err.read().decode(errors="replace")
        try:
            return err.code, json.loads(body)
        except ValueError:
            return err.code, {"error": body[:500]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="pull and print; never call the Edge Function")
    ap.add_argument("--entities", default="", help="semicolon-separated names (dry-run only)")
    ap.add_argument("--window-days", type=int, default=int(os.environ.get("WINDOW_DAYS", "3")))
    ap.add_argument("--budget", type=int, default=None, help="max CourtListener requests this run")
    args = ap.parse_args()

    token = os.environ.get("COURTLISTENER_TOKEN", "").strip()
    # 125/day documented for a token; stay well under it. Anonymous limits
    # are undocumented, so keep anonymous runs small.
    budget = args.budget if args.budget is not None else (110 if token else 30)
    cl = CourtListener(token, budget)

    today = dt.datetime.now(dt.timezone.utc).date()
    date_from, date_to = (today - dt.timedelta(days=args.window_days)).isoformat(), today.isoformat()
    function_url = os.environ.get("INGEST_FUNCTION_URL", DEFAULT_FUNCTION_URL)
    anon_key, secret = os.environ.get("SUPABASE_ANON_KEY", ""), os.environ.get("AUTOMATION_SECRET", "")

    if args.dry_run:
        entities = [e for e in (s.strip() for s in args.entities.split(";")) if e]
    else:
        if not anon_key or not secret:
            sys.exit("SUPABASE_ANON_KEY and AUTOMATION_SECRET are required (or use --dry-run).")
        status, body = call_function(function_url, anon_key, secret, {"action": "entities", "limit": max(budget - MAX_CH11_PAGES, 1)})
        if status != 200:
            sys.exit(f"Could not load entities (HTTP {status}): {body}")
        entities = body.get("entities", [])

    print(f"Window {date_from}..{date_to} | token={'yes' if token else 'no'} | budget={budget} | entities={len(entities)}")

    filings, searched = {}, []
    try:
        ch11, expected = pull_chapter_11(cl, date_from, date_to)
        for f in ch11:
            filings[f["source_docket_id"]] = f
        print(f"Chapter 11: kept {len(ch11)} of {expected} reported")
        for name in entities:
            hits = pull_entity(cl, name, date_from, date_to)
            for f in hits:
                filings.setdefault(f["source_docket_id"], f)
            searched.append(name)
            if hits:
                print(f"  {name!r}: {len(hits)} filing(s)")
    except BudgetExhausted:
        print(f"Request budget used up after {len(searched)} of {len(entities)} entities; the rest roll to the next run.")

    try:
        sec_rows = pull_sec_8k(date_from, date_to)
        print(f"SEC 8-K event disclosures: {len(sec_rows)}")
    except (urllib.error.URLError, ValueError) as err:
        sec_rows = []
        print(f"SEC pull failed, continuing without it: {err}", file=sys.stderr)

    rows = list(filings.values())
    if args.dry_run:
        for f in sec_rows[:10]:
            print(f"  {f['date_filed']} sec_8k          {f['case_name'][:44]:<44} {f['docket_number'][:60]}")
        for f in rows[:15]:
            print(f"  {f['date_filed']} {f['filing_type']:<15} {f['court_id']:<6} {f['case_name'][:70]}")
        print(f"DRY RUN: {len(rows)} court filings and {len(sec_rows)} SEC disclosures pulled, {len(searched)} entities searched, {budget - cl.remaining} requests used. Nothing sent.")
        return

    total_new = 0
    for i in range(0, max(len(rows), 1), 400):
        payload = {"action": "ingest", "filings": rows[i:i + 400], "searchedEntities": searched if i == 0 else []}
        status, body = call_function(function_url, anon_key, secret, payload)
        if status != 200:
            sys.exit(f"Ingest failed (HTTP {status}): {body}")
        total_new += body.get("newMatches", 0)
        print(f"Ingested batch: {body}")
    # Sent separately and allowed to fail: until the 20260919b migration is
    # run the database rejects sec_8k rows, and that must not block the
    # court filings above.
    if sec_rows:
        status, body = call_function(function_url, anon_key, secret, {"action": "ingest", "filings": sec_rows, "searchedEntities": []})
        if status == 200:
            total_new += body.get("newMatches", 0)
            print(f"Ingested SEC batch: {body}")
        else:
            print(f"::warning::SEC batch not stored (HTTP {status}): {body}")
    print(f"Done: {len(rows)} court filings and {len(sec_rows)} SEC disclosures sent, {total_new} new portfolio match(es).")


if __name__ == "__main__":
    main()
