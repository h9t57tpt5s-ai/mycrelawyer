#!/usr/bin/env python3
"""State court filings for the public State Court Watch (2026-11-05).

Jeff, 2026-11-05: state coverage is "a critical blind spot that has to be
addressed"; paid state data is not an option. This pulls new commercial
real estate filings from free state and county sources whose terms allow
automated use, and writes ops/state-filings.json, from which
scripts/build_state_pages.ts builds state-cases/<slug>.html and
state-court-watch.html.

Publishing rule: a case type on an ALLOWLIST of real-property case types;
every plaintiff a business or government; the first-named defendant a
business; and no residential marker anywhere in the caption (HUD,
residential mortgage servicers, homeowners' or condominium associations).
Individuals named further down (guarantors, occupants) are dropped, never
stored or published: business and government names only, never the
caption (CLAUDE.md). A description of the property itself ("1.970 acres of
land") is not a party.

Sources (each a function returning rows; add more as they are verified):
  fulton_ga        Fulton County, GA Superior Court, "Current Pending Cases"
                   open data (sharefulton.fultoncountyga.gov, dataset u8gi-zru8,
                   CC BY 4.0, refreshed daily).
  hillsborough_fl  Hillsborough County, FL Clerk daily civil filing CSVs
                   (publicrec.hillsclerk.com/Civil/dailyfilings/; open directory,
                   already pulled privately for Monitor since 2026-09-19).
                   Commercial case types only (HILLSBOROUGH_CASE_TYPES).
  harris_jp_tx     Harris County, TX justice courts Public Data Extract:
                   evictions where both landlord and tenant are businesses.

  python3 scripts/pull_state_filings.py            # last 21 days, merge
  python3 scripts/pull_state_filings.py --days 120 # backfill
"""

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ingest_court_filings import (GOVERNMENT_NAME, HARRIS_JP_CASE_TYPES, HARRIS_JP_DATA, HARRIS_JP_FORM,  # noqa: E402
                                  HILLSBOROUGH_CASE_TYPES, HILLSBOROUGH_DIR, NOT_CRE_PARTY, RESIDENTIAL_NAME,
                                  http_get, is_business_name, slugify, us_date)
import csv  # noqa: E402
import http.cookiejar  # noqa: E402
import io  # noqa: E402
import signal  # noqa: E402
import time  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parent.parent / "ops" / "state-filings.json"
UA = "CREdocket state court watch (credocket.com; jeff@credocket.com)"

# Parties that make a case residential or consumer, beyond NOT_CRE_PARTY.
RESIDENTIAL_PARTY = re.compile(
    r"residential|home ?loans?|homes? (?:inc|llc)|mortgage electronic registration|\bmers\b|midfirst|"
    r"condominium|condo assoc|townhome|homeowners?|property owners assoc|community assoc|villas assoc|"
    r"\bhoa\b|credit union|consumer|auto|motors?\b|finance co|secretary of housing|housing and urban|\bhud\b|"
    r"united wholesale mortgage|planet home lending|home group|\bhomes\b|homebuyers?|home buyers|crashpad|furnished|apartments?|\bapts?\b|\bestates\b|villas?\b|townhomes?|residences?|mobile home|manufactured home|student living|senior living|mortgage services|loan servicing|heir at law|estate of", re.I)
# A description of the property, not a party ("1.970 acres of land",
# "certain easement rights", "a tract of land known as ...", "real property").
PROPERTY_DESCRIPTOR = re.compile(r"\bacres? of land\b|easement rights|access rights|tract of land|real property|"
                                 r"^\s*certain\b|\bparcel\b", re.I)
SUFFIX = re.compile(r"^(llc|l\.l\.c\.?|inc\.?|incorporated|corp\.?|corporation|co\.?|company|lp|l\.p\.?|llp|"
                    r"l\.l\.p\.?|ltd\.?|limited|pllc|p\.c\.?|na|n\.a\.?|plc|trust|et al\.?)$", re.I)


def split_parties(side):
    """'ABC, LLC, John Doe, City of Atlanta' -> ['ABC, LLC', 'John Doe', 'City of Atlanta']."""
    out = []
    for tok in re.split(r"\s*[,;]\s*|\s+and\s+(?=[A-Z])", side):
        tok = tok.strip(" .")
        if not tok:
            continue
        if out and SUFFIX.match(tok):
            out[-1] = f"{out[-1]}, {tok}"
        else:
            out.append(tok)
    return [re.sub(r",?\s+et\.?\s*al\.?$", "", p, flags=re.I).strip() for p in out if p]


def clean_name(name):
    name = re.sub(r"\s+(?:and )?all (?:other )?occupants\b.*$", "", name, flags=re.I)  # eviction boilerplate
    name = re.sub(r"\s+case no\..*$", "", name, flags=re.I)  # index artifacts
    return re.sub(r"\s+", " ", name).strip(" ,.")


# Utility and telecom suits (road-cut and line-damage claims) are not CRE on their face.
UTILITY_PARTY = re.compile(r"telecommunications|bellsouth|\bat&t\b|comcast|spectrum|\butilit(y|ies)\b|electric company|power company|gas company", re.I)
# A business suffix followed by a bare word ("Vash LLC Hansen") means a
# person's name was run into the field: the case is dropped, not cleaned.
PERSON_TAIL = re.compile(r"\b(llc|l\.l\.c|inc|corp|ltd|lp|llp)\.?\s+(?!d/?b/?a\b|dba\b)[a-z]+$", re.I)


def is_org_name(p):
    return bool(is_business_name(p) or GOVERNMENT_NAME.search(p))


def classify(plaintiffs, defendants):
    """(plaintiffs, defendants) as business/government names to publish, or None."""
    pl = [clean_name(p) for p in plaintiffs if clean_name(p) and not PROPERTY_DESCRIPTOR.search(p)]
    df = [clean_name(p) for p in defendants if clean_name(p) and not PROPERTY_DESCRIPTOR.search(p)]
    if not pl or not df:
        return None
    if any(NOT_CRE_PARTY.search(p) or RESIDENTIAL_PARTY.search(p) or PERSON_TAIL.search(p) or UTILITY_PARTY.search(p) for p in pl + df):
        return None
    if not all(is_org_name(p) for p in pl) or not is_business_name(df[0]):
        return None
    df = [p for p in df if is_org_name(p)]  # individuals are dropped, never stored
    return pl, df


def get_json(url, params):
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


# ---- Fulton County, GA ------------------------------------------------------
FULTON = "https://sharefulton.fultoncountyga.gov/resource/u8gi-zru8.json"
FULTON_TYPES = {
    # case type -> label shown on the page
    "FORECLOSURE": "Foreclosure",
    "JUDICIAL FORECLOSURE": "Judicial foreclosure",
    "CONFIRMATION OF FORECLOSURE SALE": "Confirmation of foreclosure sale",
    "RECEIVERSHIP": "Receivership",
    "CONDEMNATION OF LAND": "Condemnation",
    "TITLE TO LAND/CONDEMNATION": "Condemnation",
}


def pull_fulton(date_from):
    types = ",".join(f"'{t}'" for t in FULTON_TYPES)
    rows = get_json(FULTON, {"$select": "casenbr,casetypedesc,datefiled,style",
                             "$where": f"datefiled >= '{date_from}' AND casetypedesc in ({types})",
                             "$limit": "5000"})
    out = []
    for r in rows:
        style = re.sub(r"\s+", " ", r.get("style") or "")
        parts = re.split(r"\s+VS?\s*\.?\s+", style, maxsplit=1, flags=re.I)
        if len(parts) != 2:
            continue
        kept = classify(split_parties(parts[0]), split_parties(parts[1]))
        if not kept:
            continue
        pl, df = kept
        number = (r.get("casenbr") or "").strip()
        name = f"{pl[0]} v. {df[0]}" + (" et al." if len(df) > 1 else "")
        out.append({
            "source": "fulton_ga", "state": "GA", "county": "Fulton",
            "court": "Superior Court of Fulton County, Georgia",
            "caseNumber": number, "caseType": FULTON_TYPES[r["casetypedesc"]],
            "dateFiled": (r.get("datefiled") or "")[:10],
            "caseName": name, "plaintiffs": pl, "defendants": df,
            "sourceName": "Fulton County open data, Superior Court pending cases (CC BY 4.0)",
            "sourceUrl": f"{FULTON}?casenbr={urllib.parse.quote(number)}",
            "slug": f"{slugify(name)[:70].strip('-')}-ga-fulton-{slugify(number)}",
        })
    return out


# ---- Hillsborough County, FL ----------------------------------------------
# One CSV per filing day, one row per party; a FirstName marks an individual.
HILLSBOROUGH_LABELS = [("lt non-residential", "Commercial eviction"), ("mortgage foreclosure - commercial", "Commercial foreclosure"),
                       ("premises liability-commercial", "Commercial premises liability"), ("eminent domain", "Eminent domain"),
                       ("construction defect", "Construction defect")]


def pull_hillsborough(date_from):
    listing = http_get(HILLSBOROUGH_DIR)
    stamps = sorted(f for f in set(re.findall(r"CivilFiling_(\d{8})\.csv", listing)) if f >= date_from.replace("-", ""))
    out = []
    for stamp in stamps:
        time.sleep(1)
        url = f"{HILLSBOROUGH_DIR}CivilFiling_{stamp}.csv"
        cases = {}
        try:
            text = http_get(url)
        except Exception as e:  # one slow day must not sink the backfill; the next run retries it
            print(f"  hillsborough_fl: skipped {stamp} ({e})", file=sys.stderr)
            continue
        for row in csv.DictReader(io.StringIO(text)):
            if (row.get("CaseCategory") or "").strip() != "CV":
                continue
            number = (row.get("CaseNumber") or "").strip()
            c = cases.setdefault(number, {"type": "", "date": "", "pl": [], "df": [], "person_pl": False, "person_df": False})
            c["type"] = (row.get("CaseTypeDescription") or "").strip()
            c["date"] = us_date(row.get("FilingDate") or "")
            role = (row.get("PartyType") or "").strip()
            person = bool((row.get("FirstName") or "").strip())
            name = (row.get("LastName/CompanyName") or "").strip()
            if role in ("Plaintiff", "Petitioner"):
                c["person_pl"] |= person
                if not person:
                    c["pl"].append(name)
            elif role in ("Defendant", "Respondent"):
                c["person_df"] |= person
                if not person:
                    c["df"].append(name)
        for number, c in cases.items():
            if not any(p.search(c["type"]) for p, _ in HILLSBOROUGH_CASE_TYPES):
                continue
            if c["person_pl"] or not c["pl"] or not c["df"] or not number or not c["date"]:
                continue  # every plaintiff must be a business or government; individuals are never published
            kept = classify(c["pl"], c["df"])
            if not kept:
                continue
            pl, df = kept
            label = next((lbl for key, lbl in HILLSBOROUGH_LABELS if c["type"].lower().startswith(key)), c["type"])
            name = f"{pl[0]} v. {df[0]}" + (" et al." if len(df) > 1 else "")
            out.append({
                "source": "hillsborough_fl", "state": "FL", "county": "Hillsborough",
                "court": "Thirteenth Judicial Circuit, Hillsborough County, Florida",
                "caseNumber": number, "caseType": label, "dateFiled": c["date"],
                "caseName": name, "plaintiffs": pl, "defendants": df,
                "sourceName": f"Hillsborough County Clerk, daily civil filings, {c['date']}",
                "sourceUrl": url,
                "slug": f"{slugify(name)[:70].strip('-')}-fl-hillsborough-{slugify(number)}",
            })
    return out


# ---- Harris County, TX justice courts ---------------------------------------
def pull_harris_jp(date_from):
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    http_get(HARRIS_JP_FORM, opener=opener, timeout=60)  # the extract hangs without this session cookie
    fmt = lambda iso: dt.date.fromisoformat(iso).strftime("%m/%d/%Y")
    out = []
    for code, label in HARRIS_JP_CASE_TYPES.items():
        time.sleep(2)
        params = urllib.parse.urlencode({"extractCaseType": "CV", "extract": "7", "court": "300", "casetype": code,
                                         "format": "csv", "fdate": fmt(date_from), "tdate": fmt(dt.date.today().isoformat())})
        text = http_get(f"{HARRIS_JP_DATA}?{params}", opener=opener, referer=HARRIS_JP_FORM, timeout=180)
        if text.lstrip().startswith("<"):  # e.g. "Down for Maintenance": a failure, not zero filings
            raise RuntimeError("extract returned an HTML page instead of CSV")
        for raw in csv.DictReader(io.StringIO(text)):
            row = {k.strip(): (v or "").strip() for k, v in raw.items() if k is not None}  # None holds overflow columns
            pl = [n for n in (row.get("Plaintiff Name", ""), row.get("Second Plaintiff Name", "")) if n]
            df = [n for n in (row.get("Defendant Name", ""), row.get("Second Defendant Name", "")) if n]
            if any(RESIDENTIAL_NAME.search(n) for n in pl):
                continue
            kept = classify(pl, df)
            number, filed = row.get("Case Number", ""), us_date(row.get("Case File Date", ""))
            if not kept or not number or not filed:
                continue
            pl, df = kept
            name = f"{pl[0]} v. {df[0]}" + (" et al." if len(df) > 1 else "")
            out.append({
                "source": "harris_jp_tx", "state": "TX", "county": "Harris",
                "court": f"Harris County Justice Court{', ' + row['Court'] if row.get('Court') else ''}, Texas",
                "caseNumber": number, "caseType": "Commercial eviction", "dateFiled": filed,
                "caseName": name, "plaintiffs": pl, "defendants": df,
                "sourceName": "Harris County Justice Courts, Public Data Extract",
                "sourceUrl": HARRIS_JP_FORM,
                "slug": f"{slugify(name)[:70].strip('-')}-tx-harris-{slugify(number)}",
            })
    return out


def collapse(rows):
    """One landlord filing against one tenant on one day under several case
    numbers (Harris JP files one per unit or claim) is shown as one filing."""
    out, by_key = [], {}
    for r in rows:
        key = (r["source"], r["plaintiffs"][0].lower(), r["defendants"][0].lower(), r["dateFiled"])
        first = by_key.get(key)
        if first is None:
            by_key[key] = r
            r.pop("relatedCaseNumbers", None)
            out.append(r)
        else:
            first.setdefault("relatedCaseNumbers", []).append(r["caseNumber"])
    return out


SOURCES = {"fulton_ga": pull_fulton, "hillsborough_fl": pull_hillsborough, "harris_jp_tx": pull_harris_jp}


SOURCE_LIMIT = 900  # seconds per source


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=21)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    date_from = (dt.date.today() - dt.timedelta(days=args.days)).isoformat()
    old = {}
    if OUT.exists():
        old = {r["slug"]: r for r in json.loads(OUT.read_text()).get("filings", [])}
    fresh = {}
    def too_slow(*_):
        raise TimeoutError(f"no result after {SOURCE_LIMIT}s")
    signal.signal(signal.SIGALRM, too_slow)
    for name, fn in SOURCES.items():
        signal.alarm(SOURCE_LIMIT)  # a stalled stream (seen on Harris) must not hang the twice-daily job
        try:
            rows = fn(date_from)
            print(f"{name}: {len(rows)} filing(s) since {date_from}")
            fresh.update({r["slug"]: r for r in rows})
        except Exception as e:  # one source failing must not drop the others' rows
            print(f"{name}: FAILED ({e}); keeping its earlier rows", file=sys.stderr)
        finally:
            signal.alarm(0)
    merged = {**old, **fresh}
    filings = collapse(sorted(merged.values(), key=lambda r: (r["dateFiled"], r["caseName"], r["caseNumber"]), reverse=True))
    if args.dry_run:
        for r in filings[:40]:
            print(f"  {r['dateFiled']} {r['caseType']:<22} {r['caseName']}")
        return
    OUT.write_text(json.dumps({
        "updatedAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "about": "Commercial real estate filings from free state and county court data whose terms allow automated use. "
                 "Business and government parties only; built by scripts/pull_state_filings.py.",
        "filings": filings}, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {OUT.name}: {len(filings)} filing(s)")


if __name__ == "__main__":
    main()
