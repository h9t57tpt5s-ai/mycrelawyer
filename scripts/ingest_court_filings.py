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
import csv
import datetime as dt
import hashlib
import http.cookiejar
import io
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

# --- State trial courts -----------------------------------------------------
# Only two official sources were found that publish new filings with party
# names and need no login, no CAPTCHA and carry no bar on automated use
# (researched 2026-09-19; most big-county portals fail at least one test).
#
# SCOPE AND PRIVACY for both: these files are dominated by residential evictions
# and consumer debt suits against individuals. Storing or alerting on those
# would risk making CREdocket a tenant-screening service under the Fair
# Credit Reporting Act. So a case is kept ONLY if a defendant is clearly a
# business, ONLY business names are stored, and the caption (which can name
# individuals) is never stored.
HILLSBOROUGH_DIR = "https://publicrec.hillsclerk.com/Civil/dailyfilings/"
HILLSBOROUGH_SEARCH = "https://hover.hillsclerk.com/html/home.html"
HARRIS_JP_FORM = "https://jpwebsite.harriscountytx.gov/PublicExtracts/search.jsp"
HARRIS_JP_DATA = "https://jpwebsite.harriscountytx.gov/PublicExtracts/GetExtractData"
# Evictions only, and only where the tenant is a business. Small Claims
# (mostly tenants suing apartment owners) and Debt Claim (consumer debt) are
# residential or debt-collection matters and are deliberately not pulled.
HARRIS_JP_CASE_TYPES = {"8464": "Eviction"}

# SCOPE (Jeff, 2026-09-19): "I want nothing residential and no debt
# collection matters. That is not what this site is about." So case types
# are an ALLOWLIST: a type that is not named here is dropped, including any
# new type a clerk adds later. Deliberately excluded: every residential
# landlord-tenant and homestead/non-homestead foreclosure type, every Debt
# Owed / Accounts / county-court and small-claims contract tier, negligence,
# insurance, PIP, windshield, replevin, condominium and family matters.
#   value False -> a business DEFENDANT is enough.
#   value True  -> a business PLAINTIFF is required too, which removes
#                  consumers and homeowners suing a business.
HILLSBOROUGH_CASE_TYPES = [
    (re.compile(r"^LT Non-Residential\b", re.I), False),
    (re.compile(r"^Mortgage Foreclosure - Commercial\b", re.I), False),
    (re.compile(r"^Premises Liability-Commercial$", re.I), False),
    (re.compile(r"^Eminent Domain$", re.I), False),
    (re.compile(r"^Construction Defect$", re.I), True),
    # Circuit-court (over $50,000) contract suits between two businesses,
    # which is where commercial lease and guaranty disputes are filed.
    # "Contract & Indebtedness" is NOT included: in practice it is commercial
    # debt collection (merchant-cash-advance lenders, banks suing on notes).
    # "Business Transactions" is NOT included: it is structured-settlement
    # transfer petitions against insurers.
    (re.compile(r"^(Breach of Contract|Business Torts)$", re.I), True),
]
# Justice-court evictions are not labeled commercial or residential, so an
# eviction brought by what is plainly a housing operator is dropped.
RESIDENTIAL_NAME = re.compile(r"\b(apartments?|apts?|lofts?|villas?|townhomes?|town ?houses?|residences?|residential|"
                              r"mobile home|manufactured home|housing|homes|manor|senior living|student living)\b", re.I)

STATE_UA = "CREdocket-surveillance/1.0 (+https://credocket.com)"
BUSINESS_NAME = re.compile(
    r"\b(llc|l\.l\.c|inc|incorporated|corp|corporation|company|co\.|l\.?p\.?|llp|ltd|limited|pllc|"
    r"partners|partnership|holdings|group|associates|enterprises|properties|ventures|fund|bank|n\.a\.|"
    r"association|hospital|insurance|stores?|markets?|restaurants?|university|church|authority)\b", re.I)
NOT_A_BUSINESS = re.compile(r"\b(estate of|unknown|john doe|jane doe|tenant|occupant|any and all|heirs)\b", re.I)


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


def pull_chapter_11(cl, date_from, date_to, max_pages=MAX_CH11_PAGES):
    filings, expected = [], None
    page = cl.search(f"chapter:11 AND dateFiled:[{date_from} TO {date_to}]")
    for _ in range(max_pages):
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
        print(f"Chapter 11: stopped at {max_pages} pages; window may be incomplete.", file=sys.stderr)
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


def is_business_name(name):
    return bool(name) and bool(BUSINESS_NAME.search(name)) and not NOT_A_BUSINESS.search(name)


def stable_id(source, case_number):
    # court_filings keys on an integer; 52 bits stays exact in JSON numbers.
    return int(hashlib.sha256(f"{source}:{case_number}".encode()).hexdigest()[:13], 16)


def us_date(value):
    try:
        return dt.datetime.strptime(value.strip()[:10], "%m/%d/%Y").date().isoformat()
    except ValueError:
        return ""


def state_filing(source, court_id, court_name, case_number, case_type, date_filed, defendants, plaintiffs, url,
                 need_business_plaintiff=False):
    biz_defendants = [n for n in defendants if is_business_name(n)]
    biz_plaintiffs = [n for n in plaintiffs if is_business_name(n)]
    if not biz_defendants or not case_number or not date_filed:
        return None
    if need_business_plaintiff and not biz_plaintiffs:
        return None
    return {
        "source": source,
        "source_docket_id": stable_id(source, case_number),
        "filing_type": "civil",
        "court_id": court_id,
        "court_name": court_name,
        "docket_number": case_number,
        "case_name": f"{case_type or 'Civil case'} -- defendant: {biz_defendants[0]}",
        "date_filed": date_filed,
        "parties": list(dict.fromkeys(biz_defendants + biz_plaintiffs)),
        "docket_url": url,
    }


def hillsborough_rule(case_type):
    """None if the case type is out of scope, else whether a business plaintiff is required."""
    for pattern, need_plaintiff in HILLSBOROUGH_CASE_TYPES:
        if pattern.search(case_type or ""):
            return need_plaintiff
    return None


def http_get(url, opener=None, referer=None, timeout=120):
    headers = {"User-Agent": STATE_UA}
    if referer:
        headers["Referer"] = referer
    req = urllib.request.Request(url, headers=headers)
    with (opener.open(req, timeout=timeout) if opener else urllib.request.urlopen(req, timeout=timeout)) as resp:
        return resp.read().decode("utf-8-sig", errors="replace")


def pull_hillsborough(date_from, date_to):
    listing = http_get(HILLSBOROUGH_DIR)
    wanted = sorted({f for f in re.findall(r"CivilFiling_(\d{8})\.csv", listing)
                     if date_from.replace("-", "") <= f <= date_to.replace("-", "")})
    out = {}
    for stamp in wanted:
        time.sleep(1)
        cases = {}
        for row in csv.DictReader(io.StringIO(http_get(f"{HILLSBOROUGH_DIR}CivilFiling_{stamp}.csv"))):
            if (row.get("CaseCategory") or "").strip() != "CV":
                continue
            case = cases.setdefault((row.get("CaseNumber") or "").strip(), {"type": "", "date": "", "def": [], "pl": []})
            case["type"] = (row.get("CaseTypeDescription") or "").strip()
            case["date"] = us_date(row.get("FilingDate") or "")
            # A first name marks an individual; never treat those as businesses.
            if (row.get("FirstName") or "").strip():
                continue
            name = (row.get("LastName/CompanyName") or "").strip()
            role = (row.get("PartyType") or "").strip()
            if role in ("Defendant", "Respondent"):
                case["def"].append(name)
            elif role in ("Plaintiff", "Petitioner"):
                case["pl"].append(name)
        for number, c in cases.items():
            need_plaintiff = hillsborough_rule(c["type"])
            if need_plaintiff is None:
                continue
            f = state_filing("hillsborough_fl", "fl-hillsborough", "Hillsborough County Circuit/County Civil Court, Florida",
                             number, c["type"], c["date"], c["def"], c["pl"], HILLSBOROUGH_SEARCH, need_plaintiff)
            if f:
                out[f["source_docket_id"]] = f
    return list(out.values()), len(wanted)


def pull_harris_jp(date_from, date_to):
    # The extract endpoint hangs without the session cookie the form page sets.
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    http_get(HARRIS_JP_FORM, opener=opener, timeout=60)
    fmt = lambda iso: dt.date.fromisoformat(iso).strftime("%m/%d/%Y")
    out, seen = {}, 0
    for code, label in HARRIS_JP_CASE_TYPES.items():
        time.sleep(2)
        params = urllib.parse.urlencode({"extractCaseType": "CV", "extract": "7", "court": "300", "casetype": code,
                                         "format": "csv", "fdate": fmt(date_from), "tdate": fmt(date_to)})
        text = http_get(f"{HARRIS_JP_DATA}?{params}", opener=opener, referer=HARRIS_JP_FORM, timeout=180)
        for raw in csv.DictReader(io.StringIO(text)):
            row = {(k or "").strip(): (v or "").strip() for k, v in raw.items()}
            seen += 1
            landlords = [row.get("Plaintiff Name", ""), row.get("Second Plaintiff Name", "")]
            if any(RESIDENTIAL_NAME.search(n) for n in landlords if n):
                continue
            f = state_filing("harris_jp_tx", "tx-harris-jp", "Harris County Justice Court, Texas",
                             row.get("Case Number", ""), row.get("Case Type", "") or label, us_date(row.get("Case File Date", "")),
                             [row.get("Defendant Name", ""), row.get("Second Defendant Name", "")],
                             [row.get("Plaintiff Name", ""), row.get("Second Plaintiff Name", "")], HARRIS_JP_FORM)
            if f:
                out[f["source_docket_id"]] = f
    return list(out.values()), seen


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
    # ~25 petitions a day at 20 per page; a backfill window needs more pages.
    ch11_pages = max(MAX_CH11_PAGES, args.window_days * 2)

    today = dt.datetime.now(dt.timezone.utc).date()
    date_from, date_to = (today - dt.timedelta(days=args.window_days)).isoformat(), today.isoformat()
    function_url = os.environ.get("INGEST_FUNCTION_URL", DEFAULT_FUNCTION_URL)
    anon_key, secret = os.environ.get("SUPABASE_ANON_KEY", ""), os.environ.get("AUTOMATION_SECRET", "")

    if args.dry_run:
        entities = [e for e in (s.strip() for s in args.entities.split(";")) if e]
    else:
        if not anon_key or not secret:
            sys.exit("SUPABASE_ANON_KEY and AUTOMATION_SECRET are required (or use --dry-run).")
        status, body = call_function(function_url, anon_key, secret, {"action": "entities", "limit": max(budget - ch11_pages, 1)})
        if status != 200:
            sys.exit(f"Could not load entities (HTTP {status}): {body}")
        entities = body.get("entities", [])

    print(f"Window {date_from}..{date_to} | token={'yes' if token else 'no'} | budget={budget} | entities={len(entities)}")

    filings, searched = {}, []
    try:
        ch11, expected = pull_chapter_11(cl, date_from, date_to, ch11_pages)
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

    state_rows, state_batches = [], []
    for label, pull in (("Hillsborough FL", pull_hillsborough), ("Harris County TX justice courts", pull_harris_jp)):
        try:
            got, scanned = pull(date_from, date_to)
            state_rows += got
            state_batches.append((label, got, scanned))
            print(f"{label}: kept {len(got)} in-scope commercial cases ({scanned} {'daily files' if 'Hills' in label else 'cases'} scanned)")
        except (urllib.error.URLError, ValueError, OSError) as err:
            # No batch is recorded for a failed pull, so nothing is pruned.
            print(f"::warning::{label} pull failed, continuing without it: {err}")

    rows = list(filings.values())
    if args.dry_run:
        for f in state_rows[:12]:
            print(f"  {f['date_filed']} {f['court_id']:<16} {f['docket_number']:<14} {f['case_name'][:80]}")
        for f in sec_rows[:10]:
            print(f"  {f['date_filed']} sec_8k          {f['case_name'][:44]:<44} {f['docket_number'][:60]}")
        for f in rows[:15]:
            print(f"  {f['date_filed']} {f['filing_type']:<15} {f['court_id']:<6} {f['case_name'][:70]}")
        print(f"DRY RUN: {len(rows)} federal filings, {len(state_rows)} state-court cases and {len(sec_rows)} SEC disclosures pulled, {len(searched)} entities searched, {budget - cl.remaining} requests used. Nothing sent.")
        return

    total_new = 0
    for i in range(0, max(len(rows), 1), 400):
        payload = {"action": "ingest", "filings": rows[i:i + 400], "searchedEntities": searched if i == 0 else []}
        status, body = call_function(function_url, anon_key, secret, payload)
        if status != 200:
            sys.exit(f"Ingest failed (HTTP {status}): {body}")
        total_new += body.get("newMatches", 0)
        print(f"Ingested batch: {body}")
    # One call per state source carrying its COMPLETE in-scope set for the
    # window, so the function can remove anything else stored for it.
    for label, got, scanned in state_batches:
        if len(got) > 450:
            print(f"::warning::{label}: {len(got)} cases is more than one call can carry; not sent. Narrow the window.")
            continue
        source = {"Hillsborough FL": "hillsborough_fl", "Harris County TX justice courts": "harris_jp_tx"}[label]
        payload = {"action": "ingest", "filings": got, "searchedEntities": []}
        # Prune only when the source really returned data: an empty or error
        # page would otherwise read as "nothing in scope" and wipe good rows.
        if scanned > 0:
            payload["pruneState"] = {"source": source, "dateFrom": date_from, "dateTo": date_to}
        else:
            print(f"::warning::{label}: nothing scanned, so no cleanup was requested.")
        status, body = call_function(function_url, anon_key, secret, payload)
        if status == 200:
            total_new += body.get("newMatches", 0)
            print(f"Ingested {label}: {body}")
        else:
            print(f"::warning::{label} batch not stored (HTTP {status}): {body}")

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
    print(f"Done: {len(rows)} federal filings, {len(state_rows)} state-court cases and {len(sec_rows)} SEC disclosures sent, {total_new} new portfolio match(es).")


if __name__ == "__main__":
    main()
