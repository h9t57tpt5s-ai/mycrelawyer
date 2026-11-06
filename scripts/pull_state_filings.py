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
  fulton_ga  Fulton County, GA Superior Court, "Current Pending Cases"
             open data (sharefulton.fultoncountyga.gov, dataset u8gi-zru8,
             CC BY 4.0, refreshed daily).

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
from ingest_court_filings import GOVERNMENT_NAME, NOT_CRE_PARTY, is_business_name, slugify  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parent.parent / "ops" / "state-filings.json"
UA = "CREdocket state court watch (credocket.com; jeff@credocket.com)"

# Parties that make a case residential or consumer, beyond NOT_CRE_PARTY.
RESIDENTIAL_PARTY = re.compile(
    r"residential|home ?loans?|homes? (?:inc|llc)|mortgage electronic registration|\bmers\b|midfirst|"
    r"condominium|condo assoc|townhome|homeowners?|property owners assoc|community assoc|villas assoc|"
    r"\bhoa\b|credit union|consumer|auto|motors?\b|finance co|secretary of housing|housing and urban|\bhud\b|"
    r"united wholesale mortgage|planet home lending|home group|\bhomes\b|homebuyers?|home buyers|mortgage services|loan servicing|heir at law|estate of", re.I)
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
    return re.sub(r"\s+", " ", name).strip(" ,.")


def is_org_name(p):
    return bool(is_business_name(p) or GOVERNMENT_NAME.search(p))


def classify(plaintiffs, defendants):
    """(plaintiffs, defendants) as business/government names to publish, or None."""
    pl = [clean_name(p) for p in plaintiffs if clean_name(p) and not PROPERTY_DESCRIPTOR.search(p)]
    df = [clean_name(p) for p in defendants if clean_name(p) and not PROPERTY_DESCRIPTOR.search(p)]
    if not pl or not df:
        return None
    if any(NOT_CRE_PARTY.search(p) or RESIDENTIAL_PARTY.search(p) for p in pl + df):
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


SOURCES = {"fulton_ga": pull_fulton}


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
    for name, fn in SOURCES.items():
        try:
            rows = fn(date_from)
            print(f"{name}: {len(rows)} filing(s) since {date_from}")
            fresh.update({r["slug"]: r for r in rows})
        except Exception as e:  # one source failing must not drop the others' rows
            print(f"{name}: FAILED ({e}); keeping its earlier rows", file=sys.stderr)
    merged = {**old, **fresh}
    filings = sorted(merged.values(), key=lambda r: (r["dateFiled"], r["caseName"]), reverse=True)
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
