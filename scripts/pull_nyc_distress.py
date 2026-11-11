#!/usr/bin/env python3
"""NYC Commercial Distress (2026-11-11): foreclosure sales and other plainly
distress documents recorded against New York City commercial property, from
the City Register's ACRIS records as published on NYC Open Data (keyless).

What ACRIS can and cannot show. ACRIS is the Department of Finance's Office
of the City Register (Manhattan, Bronx, Brooklyn, Queens; Staten Island
records are kept by the Richmond County Clerk). Its Document Control Codes
(dataset 7isb-wh4c, 126 codes) have NO lis pendens / notice of pendency code:
a foreclosure's notice of pendency is filed with the County Clerk under
CPLR 6511, not recorded in ACRIS, so the start of a New York foreclosure is
not in this data. What ACRIS does record is the END of one:

  * Referee's deed (doc type DEED or DEEDO whose grantor party is named as a
    referee). In New York a court-appointed referee conveys property after a
    judicial foreclosure sale (RPAPL 1351) or, less often, a partition sale
    (RPAPL 911); the deed alone does not say which, so rows are labeled
    "referee's deed (court-ordered sale)". The consideration on the deed is
    the sale price. Timeshare deeds (DEED, TS) are never read.
  * Lien of common charges (LOCC): a condominium board's lien for unpaid
    common charges (Real Property Law 339-z), kept only on commercial condo
    units (office, retail, hotel, industrial).
  * Tax lien sale certificate (TLS): the City has sold the lot's unpaid tax
    or water lien. Rare (17 a year recently) but unambiguous.

Codes left out on purpose: JUDG (judgment) and CTOR (court order) record all
sorts of matters (probate, partitions, bankruptcy orders), so their meaning is
not determinable from the code; VAC (vacate order) is a handful a year with no
stated subject; assignments of mortgage (ASST) and deeds in lieu are ordinary
deeds and assignments with no distress marker; DTL (discharge of tax lien) is
a resolution, not distress; federal tax liens are against the taxpayer, not
the parcel, and live in the personal-property files; CODP (condemnation) is
eminent domain, not distress.

Commercial filter. Each document's lots (Real Property Legals, 8h5j-fqxa) are
matched to PLUTO (64uk-42ks) for whole tax lots and to the Department of
Finance assessment roll (8y4t-faws) for condominium units, and kept only when
the Finance building class is on the BUILDING_CLASSES allowlist below.
Apartment buildings count only with 20+ residential units and a business
owner (a commercial multifamily owner is CRE; homes, co-op and condo
apartments, and small walk-ups are not). Unlisted classes are dropped.

Only business names are kept: the owner of record (PLUTO / assessment roll),
the deed's grantee (buyer at the sale) or the condo board. People, referees
and personal trusts are never stored. Each row links to the ACRIS document.

The Open Data copy of ACRIS lags the live register: on 2026-11-11 the newest
recording in it was 2026-10-30 (good-through 2026-10-31).

  python3 scripts/pull_nyc_distress.py              # fetch new documents, merge
  python3 scripts/pull_nyc_distress.py --days 90 --dry-run   # print, don't write
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ingest_court_filings import slugify  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "ops" / "nyc-commercial-distress.json"
UA = "CREdocket NYC commercial distress admin@credocket.com"
API = "https://data.cityofnewyork.us/resource"
MASTER, LEGALS, PARTIES = "bnx9-e6tj", "8h5j-fqxa", "636b-3b5g"
PLUTO, ROLL = "64uk-42ks", "8y4t-faws"
ACRIS_DOC = "https://a836-acris.nyc.gov/DS/DocumentSearch/DocumentDetail?doc_id={}"
KEEP_DAYS = 400
MIN_MF_UNITS = 20

BOROUGH = {"1": "Manhattan", "2": "Bronx", "3": "Brooklyn", "4": "Queens", "5": "Staten Island"}
DOC_LABEL = {
    "REFEREE": "Referee's deed (court-ordered sale)",
    "LOCC": "Lien of common charges (condo board)",
    "TLS": "Tax lien sale certificate",
}
REFEREE_DEED_TYPES = {"DEED", "DEEDO"}

# Department of Finance building classes kept, mapped to the site's
# propertyType vocabulary ("" = commercial with no matching type; the row then
# shows its Finance class label). A class not listed here is dropped, so new
# or unfamiliar classes stay out until someone adds them. Deliberately absent:
# A*/B* one- and two-family homes, C0/C2/C3 small walk-ups, C6/C8/D0/D4 co-ops,
# CM mobile homes, S* one-to-six family homes with a store, residential condo
# units (R1-R4, R6-R9, RR, RS, RT, RG, RP), HR single-room-occupancy, G0
# residential garages, V0/V3 residential land, and every institutional,
# religious, government, utility and transportation class (I except I5/I6,
# M, N, P, Q, T, U, W, Y, Z).
BUILDING_CLASSES = {
    **{f"O{i}": ("Office", "Office building") for i in range(1, 10)},
    **{f"K{i}": ("Retail", "Store building") for i in range(1, 10)},
    **{f"H{i}": ("Hospitality", "Hotel") for i in range(1, 10)},
    "HB": ("Hospitality", "Boutique hotel"), "HH": ("Hospitality", "Hostel"), "HS": ("Hospitality", "Extended-stay hotel"),
    **{f"E{i}": ("Industrial", "Warehouse") for i in (1, 2, 9)},
    "E7": ("Self-Storage", "Self-storage warehouse"),
    **{f"F{i}": ("Industrial", "Factory / industrial") for i in range(1, 10)},
    "G1": ("", "Parking garage"), "G2": ("Industrial", "Auto body / collision shop"),
    "G3": ("", "Parking lot with improvements"), "G4": ("Retail", "Gas station with service"),
    "G5": ("Retail", "Gas station"), "G6": ("", "Licensed parking lot"), "G7": ("", "Parking lot"),
    "G8": ("Retail", "Car sales / rental"), "G9": ("", "Garage, miscellaneous"), "GU": ("Retail", "Car sales, unimproved lot"),
    "GW": ("Retail", "Car wash"),
    **{f"L{i}": ("Mixed-Use", "Loft building") for i in (1, 2, 3, 8, 9)},
    **{f"J{i}": ("Retail", "Theater") for i in range(1, 10)},
    "I5": ("Medical Office", "Health center / clinic"), "I6": ("Senior Living", "Nursing home"),
    "V1": ("Land/Development", "Vacant land zoned commercial"),
    "V2": ("Land/Development", "Vacant land zoned commercial"),
    # Commercial condominium units (assessment-roll class of the unit itself).
    "RB": ("Office", "Office condo unit"), "RK": ("Retail", "Retail condo unit"), "RH": ("Hospitality", "Hotel condo unit"),
    "RW": ("Industrial", "Industrial condo unit"), "RC": ("Mixed-Use", "Commercial condo unit (office and retail)"),
    "RI": ("Industrial", "Industrial / commercial condo unit"), "R5": ("", "Commercial condo unit"),
    # Apartment buildings: only with MIN_MF_UNITS+ units and a business owner.
    "C1": ("Multifamily", "Walk-up apartments"), "C4": ("Multifamily", "Walk-up apartments (old law)"),
    "C5": ("Multifamily", "Converted apartments"), "C7": ("Multifamily", "Walk-up apartments with stores"),
    "C9": ("Multifamily", "Garden apartments"), "D1": ("Multifamily", "Elevator apartments"),
    "D3": ("Multifamily", "Elevator apartments"), "D5": ("Multifamily", "Converted elevator apartments"),
    "D6": ("Multifamily", "Elevator apartments with stores"), "D7": ("Multifamily", "Elevator apartments with stores"),
    "D8": ("Multifamily", "Luxury elevator apartments"), "D9": ("Multifamily", "Elevator apartments"),
    "RM": ("Mixed-Use", "Mixed residential / commercial condo"),
}
# Second check, per lot: the property type the filer declared on the ACRIS
# cover page (Property Types Codes, 94g4-w6xz). A lot declared as a home,
# residential condo or co-op unit, timeshare, residential parking space or
# HDFC property is dropped even if its building class is on the allowlist.
RESIDENTIAL_ACRIS_TYPES = {"D1", "D2", "D3", "D4", "D5", "D6", "F1", "F4", "F5", "FS", "SC", "MC", "SP", "MP", "TS", "CK",
                           "MR", "SR", "PS", "SA", "CA", "SM", "RG", "RP", "RV", "GR", "VR", "VI", "HC", "R1"}
# Timeshare and residence-club charges are consumer debts, never kept.
TIMESHARE = re.compile(r"\b(TIME ?SHARE|RESIDENCE CLUB|VACATION|CLUB INTEREST|INTERVAL)\b", re.I)
MIN_AMOUNT = 10000  # a referee's deed often states a nominal consideration ($1,000); not shown as a price

# V1 is "zoned commercial or Manhattan residential": in Manhattan it can be
# residential land, so it counts only outside Manhattan.
MANHATTAN_AMBIGUOUS = {"V1"}
# RM on a unit lot can be an apartment; keep it only as a whole building.
WHOLE_LOT_ONLY = {"RM"}

BUSINESS = re.compile(
    r"\b(L\.?L\.?C|L\.?P|L\.?L\.?P|INC|INCORPORATED|CORP|CORPORATION|COMPANY|CO|LTD|LIMITED|TRUST|N\.?A|BANK|"
    r"ASSOCIATION|ASSN|PARTNERS|PARTNERSHIP|HOLDINGS|PROPERTIES|INVESTMENTS|VENTURES|CAPITAL|FUND|REIT|"
    r"ENTERPRISES|GROUP|DEVELOPMENT|REALTY|FINANCIAL|FUNDING|LENDING|CREDIT UNION|SERVICES|CONDOMINIUM|"
    r"BOARD OF MANAGERS|FSB|MORTGAGE|SAVINGS|ASSOCIATES|MANAGEMENT|OWNER|BORROWER|LENDER|SERVICING)\b\.?", re.I)
NOT_BUSINESS = re.compile(r"\b(REFEREE|ESQ|ESQUIRE|LIVING TRUST|FAMILY TRUST|REVOCABLE|IRREVOCABLE|TRUSTEE|"
                          r"ESTATE OF|EXECUTOR|EXECUTRIX|ADMINISTRATOR|UNAVAILABLE OWNER|UNKNOWN|HEIRS)\b", re.I)
GOV = re.compile(r"\b(CITY OF NEW YORK|NYC |NEW YORK CITY|STATE OF NEW YORK|UNITED STATES|HOUSING AUTHORITY|"
                 r"DEPARTMENT OF|DEPT OF|DCAS|HPD|MTA|PORT AUTHORITY)\b", re.I)


def get_json(dataset: str, params: dict, timeout: int = 180) -> list[dict]:
    url = f"{API}/{dataset}.json?" + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception:
            if attempt == 3:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def get_all(dataset: str, params: dict, page: int = 50000) -> list[dict]:
    out, offset = [], 0
    while True:
        rows = get_json(dataset, {**params, "$limit": page, "$offset": offset, "$order": ":id"})
        out.extend(rows)
        if len(rows) < page:
            return out
        offset += page
        time.sleep(1)  # data.cityofnewyork.us robots.txt: Crawl-delay 1


def where_in(field: str, values) -> str:
    return f"{field} in(" + ",".join("'" + str(v).replace("'", "''") + "'" for v in values) + ")"


def chunks(seq, n):
    seq = list(seq)
    for i in range(0, len(seq), n):
        yield seq[i:i + n]


def business(name: str) -> str:
    """A business name, or "" for a person, a referee, a personal trust or a
    government body. ACRIS writes people as "LAST, FIRST"."""
    s = re.sub(r"\s+", " ", name or "").strip(" ,;:&-")
    if not s or NOT_BUSINESS.search(s) or GOV.search(s) or not BUSINESS.search(s):
        return ""
    if re.search(r"[^A-Za-z0-9 &.,'\-/()#]", s) or len(s) > 90 or len(s) < 4:
        return ""
    return s


def num(v, kind=float):
    try:
        x = kind(float(v))
        return x if x else None
    except (TypeError, ValueError):
        return None


def bbl_of(leg: dict) -> str:
    return f"{int(leg['borough'])}{int(leg['block']):05d}{int(leg['lot']):04d}"


# ---------------------------------------------------------------- documents

def candidate_documents(start: dt.date, end: dt.date, processed: set) -> dict[str, dict]:
    """Master rows for the kept doc types recorded in [start, end]."""
    lo, hi = start.isoformat(), (end + dt.timedelta(days=1)).isoformat()
    docs: dict[str, dict] = {}
    # Referee's deeds: find the referee grantors first (a few hundred a
    # quarter), then confirm doc type and recording date on the master row.
    # Document ids begin with the submission date, which precedes recording.
    id_lo = (start - dt.timedelta(days=120)).strftime("%Y%m%d")
    refs = get_all(PARTIES, {"$select": "document_id", "$where":
                             f"party_type='1' and upper(name) like '%REFEREE%' and document_id between '{id_lo}' and '2999'"})
    ref_ids = sorted({r["document_id"] for r in refs} - processed)
    for ids in chunks(ref_ids, 150):
        for m in get_json(MASTER, {"$where": where_in("document_id", ids) + f" and recorded_datetime between '{lo}' and '{hi}'",
                                   "$limit": 1000}):
            if m.get("doc_type") in REFEREE_DEED_TYPES:
                docs[m["document_id"]] = {**m, "kind": "REFEREE"}
        time.sleep(1)
    # LOCC (condo board liens for unpaid charges) and TLS (tax lien sales) are
    # collections of a debt, not a foreclosure: left out under the site's
    # no-debt-collection rule (CLAUDE.md). The code paths stay for reference.
    for code in LIEN_CODES:
        for m in get_all(MASTER, {"$where": f"doc_type='{code}' and recorded_datetime between '{lo}' and '{hi}'"}):
            if m["document_id"] not in processed:
                docs[m["document_id"]] = {**m, "kind": code}
    return docs


LIEN_CODES: tuple[str, ...] = ()


def fetch_by_doc(dataset: str, ids, select: str | None = None) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for part in chunks(ids, 150):
        params = {"$where": where_in("document_id", part), "$limit": 50000}
        if select:
            params["$select"] = select
        for r in get_json(dataset, params):
            out.setdefault(r["document_id"], []).append(r)
        time.sleep(1)
    return out


# ---------------------------------------------------------------- property data

def pluto_lots(bbls) -> dict[str, dict]:
    out = {}
    for part in chunks(sorted(bbls), 150):
        for r in get_json(PLUTO, {"$where": "bbl in(" + ",".join(part) + ")", "$limit": 5000}):
            out[str(int(float(r["bbl"])))] = r
        time.sleep(1)
    return out


def pluto_condos(keys) -> dict[tuple, dict]:
    """PLUTO's condominium billing lot, keyed by (borough, condo number)."""
    out = {}
    for boro, nos in {b: [n for bb, n in keys if bb == b] for b, _ in keys}.items():
        rows = get_json(PLUTO, {"$where": f"borocode='{boro}' and " + where_in("condono", nos), "$limit": 5000})
        for r in rows:
            out[(boro, str(int(float(r["condono"]))))] = r
        time.sleep(1)
    return out


def roll_units(bbls) -> dict[str, dict]:
    """Latest Department of Finance assessment-roll row for each unit lot."""
    out: dict[str, dict] = {}
    for part in chunks(sorted(bbls), 100):
        rows = get_json(ROLL, {"$where": where_in("parid", part), "$limit": 5000,
                               "$select": "parid,year,period,bldg_class,owner,housenum_lo,street_name,zip_code,"
                                          "gross_sqft,yrbuilt,units,condo_number"})
        for r in sorted(rows, key=lambda r: (r.get("year", ""), r.get("period", ""))):
            out[r["parid"]] = r
        time.sleep(1)
    return out


def describe(bbl: str, plut: dict, roll: dict, condo_bill: dict) -> dict | None:
    """Building facts for one lot, or None if it is not on the allowlist."""
    lot = int(bbl[-4:])
    unit = 1001 <= lot <= 7499
    if unit:
        r = roll.get(bbl)
        if not r:
            return None
        cls = (r.get("bldg_class") or "").upper()
        cn = (r.get("condo_number") or "")[1:].lstrip("0")
        bill = condo_bill.get((bbl[0], cn), {})
        facts = {"buildingClass": cls, "address": " ".join(x for x in (r.get("housenum_lo"), r.get("street_name")) if x),
                 "zip": r.get("zip_code") or bill.get("zipcode") or "", "buildingArea": num(r.get("gross_sqft"), int),
                 "units": None, "yearBuilt": num(r.get("yrbuilt"), int), "ownerRaw": r.get("owner") or "",
                 "lat": num(bill.get("latitude")), "lon": num(bill.get("longitude")), "condoUnit": True}
    else:
        p = plut.get(bbl)
        if not p:
            return None
        cls = (p.get("bldgclass") or "").upper()
        facts = {"buildingClass": cls, "address": p.get("address") or "", "zip": p.get("zipcode") or "",
                 "buildingArea": num(p.get("bldgarea"), int), "units": num(p.get("unitsres"), int),
                 "yearBuilt": num(p.get("yearbuilt"), int), "ownerRaw": p.get("ownername") or "",
                 "lat": num(p.get("latitude")), "lon": num(p.get("longitude")), "condoUnit": False,
                 "ownerType": p.get("ownertype") or ""}
    if cls not in BUILDING_CLASSES:
        return None
    if cls in MANHATTAN_AMBIGUOUS and bbl[0] == "1":
        return None
    if cls in WHOLE_LOT_ONLY and unit:
        return None
    if facts.get("ownerType") in ("C", "M", "O", "X"):  # city, mixed city, other public, tax-exempt
        return None
    ptype, label = BUILDING_CLASSES[cls]
    facts["owner"] = business(facts["ownerRaw"])
    if ptype == "Multifamily" and ((facts["units"] or 0) < MIN_MF_UNITS or not facts["owner"]):
        return None
    facts.update(propertyType=ptype, use=label)
    return facts


# ---------------------------------------------------------------- main

def build_rows(docs: dict[str, dict], processed: set) -> list[dict]:
    ids = sorted(docs)
    legals = fetch_by_doc(LEGALS, ids, "document_id,borough,block,lot,property_type")
    parties = fetch_by_doc(PARTIES, ids, "document_id,party_type,name")
    whole, units = set(), set()
    for legs in legals.values():
        for leg in legs:
            try:
                b = bbl_of(leg)
            except (KeyError, ValueError):
                continue
            (units if 1001 <= int(b[-4:]) <= 7499 else whole).add(b)
    plut = pluto_lots(whole) if whole else {}
    roll = roll_units(units) if units else {}
    condo_keys = {(b[0], (r.get("condo_number") or "")[1:].lstrip("0")) for b, r in roll.items() if r.get("condo_number")}
    condo_bill = pluto_condos(condo_keys) if condo_keys else {}

    rows = []
    for did in ids:
        m = docs[did]
        kind = m["kind"]
        kept = []
        for leg in legals.get(did, []):
            try:
                b = bbl_of(leg)
            except (KeyError, ValueError):
                continue
            if (leg.get("property_type") or "").upper() in RESIDENTIAL_ACRIS_TYPES:
                continue
            f = describe(b, plut, roll, condo_bill)
            if f and kind == "LOCC" and not f["condoUnit"]:
                f = None  # a common-charge lien is on a unit; a whole-lot class says nothing about it
            if f:
                kept.append((b, f))
        processed.add(did)
        if not kept:
            continue
        p1 = [p["name"] for p in parties.get(did, []) if p.get("party_type") == "1"]
        p2 = [p["name"] for p in parties.get(did, []) if p.get("party_type") == "2"]
        if any(TIMESHARE.search(n or "") for n in p1 + p2):
            continue
        debtor = next((business(n) for n in p1 if business(n)), "")
        if kind == "LOCC" and not debtor:
            continue  # a unit owned by a person: not shown
        if kind == "REFEREE":
            filer, role = next((business(n) for n in p2 if business(n)), ""), "grantee (buyer at the referee's sale)"
        elif kind == "LOCC":
            filer, role = next((business(n) for n in p2 if business(n)), ""), "condominium board (lienholder)"
        else:
            filer, role = next((business(n) for n in p2 if business(n)), ""), "lien purchaser"
        # A tax lien certificate can cover many lots: one row per lot. A deed
        # or condo lien is one row, on its largest kept lot.
        groups = [[k] for k in kept] if kind == "TLS" else [sorted(kept, key=lambda k: -(k[1]["buildingArea"] or 0))]
        for grp in groups:
            b, f = grp[0]
            owner = f["owner"]
            if kind == "LOCC":  # the debtor on the lien is the unit owner
                owner = debtor
            amt = num(m.get("document_amt"))
            boro = BOROUGH.get(b[0], "")
            rec = (m.get("recorded_datetime") or "")[:10]
            rows.append({
                "docType": m["doc_type"] if kind != "REFEREE" else "REFEREE DEED",
                "docTypeLabel": DOC_LABEL[kind],
                "acrisDocType": m["doc_type"],
                "recordedDate": rec,
                "documentDate": (m.get("document_date") or "")[:10],
                "documentId": did,
                "bbl": b,
                "otherBbls": [k[0] for k in grp[1:]],
                "address": re.sub(r"\s+", " ", f["address"]).strip().title(),
                "borough": boro,
                "zip": f["zip"],
                "buildingClass": f["buildingClass"],
                "propertyType": f["propertyType"],
                "use": f["use"],
                "condoUnit": f["condoUnit"],
                "buildingArea": f["buildingArea"],
                "units": f["units"],
                "yearBuilt": f["yearBuilt"],
                "owner": owner,
                "filer": filer,
                "filerRole": role if filer else "",
                "amount": amt if amt and amt >= MIN_AMOUNT else None,
                "amountLabel": ("" if not amt or amt < MIN_AMOUNT else
                                "consideration stated on the deed" if kind == "REFEREE" else "amount stated on the document"),
                "lat": f["lat"],
                "lon": f["lon"],
                "acrisUrl": ACRIS_DOC.format(did),
            })
    return rows


def slug_for(r: dict, taken: set) -> str:
    base = slugify(f"{r['address'] or r['bbl']} {r['borough']} ny {r['recordedDate'][:7]}")
    s = base if base not in taken else f"{base}-{r['documentId'][-7:]}"
    taken.add(s)
    return s


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=90, help="look back this many days from the newest recording")
    ap.add_argument("--dry-run", action="store_true", help="print the new rows; write nothing")
    args = ap.parse_args()
    today = dt.date.today()
    prev = json.loads(OUT.read_text()) if OUT.exists() else {"filings": [], "processed": []}
    processed = set(prev.get("processed", []))
    newest = get_json(MASTER, {"$select": "max(recorded_datetime) as d"})[0]["d"][:10]
    end = dt.date.fromisoformat(newest)
    start = min(end, today) - dt.timedelta(days=args.days)
    docs = candidate_documents(start, end, processed if not args.dry_run else set())
    print(f"ACRIS newest recording {newest}; {len(docs)} candidate documents since {start}", flush=True)
    rows = build_rows(docs, processed)
    if args.dry_run:
        print(json.dumps(rows, indent=1))
        print(f"{len(rows)} rows", file=sys.stderr)
        return
    by_key = {(r["documentId"], r["bbl"]): r for r in prev.get("filings", [])}
    for r in rows:
        r["firstSeen"] = by_key.get((r["documentId"], r["bbl"]), {}).get("firstSeen", today.isoformat())
        by_key[(r["documentId"], r["bbl"])] = r
    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    filings = sorted((r for r in by_key.values() if r["recordedDate"] >= cutoff),
                     key=lambda r: (r["recordedDate"], r["documentId"], r["bbl"]), reverse=True)
    taken: set = set()
    for r in sorted(filings, key=lambda r: (r["firstSeen"], r["documentId"], r["bbl"])):
        r["slug"] = r.get("slug") or ""
        if r["slug"] and r["slug"] not in taken:
            taken.add(r["slug"])
        else:
            r["slug"] = slug_for(r, taken)
    about = ("New York City commercial property distress documents recorded with the City Register (ACRIS, via NYC Open Data): "
             "referee's deeds after court-ordered sales (usually foreclosures). Kept only when the Department of Finance building class is commercial "
             "(office, retail, hotel, industrial, garage, commercial land and condo units) or an apartment building of "
             f"{MIN_MF_UNITS}+ units owned by a business. Business names only. ACRIS does not record lis pendens (filed with the "
             f"County Clerk). Open Data copy is current through {newest}.")
    OUT.write_text(json.dumps({"generated": today.isoformat(), "acrisThrough": newest, "about": about, "filings": filings,
                               "processed": sorted(processed)[-20000:]}, indent=1) + "\n")
    print(f"wrote {OUT.name}: {len(filings)} filings ({len(rows)} new)", flush=True)


if __name__ == "__main__":
    main()
