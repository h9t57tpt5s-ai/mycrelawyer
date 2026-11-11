#!/usr/bin/env python3
"""Texas Foreclosure Sales (2026-11-06): commercial properties posted for a
non-judicial foreclosure sale by a Texas county clerk.

Most Texas real estate foreclosures never reach a court. The lender's
trustee files a notice of sale with the county clerk at least 21 days before
the sale, which is held on the first Tuesday of the month (Tex. Prop. Code
51.002), and the larger counties post every notice online. That is three
weeks' warning of a forced sale, from a primary public record, free.

Most notices are for houses, including "commercial" (business-purpose) loans
on houses, so the loan's wording never decides scope. A notice is kept only
when its property matches a parcel that the county appraisal district itself
classifies as commercial, industrial, apartment or commercial/industrial
land (PTAD state codes B1 apartments, C2/C3 commercial and industrial vacant
land, F1 commercial, F2 industrial; Dallas CAD writes them B11, C12, C13,
F10, F20). Matching uses the notice's legal description (city block and lot,
subdivision block and lot, or survey abstract and acreage) or a street
address given as the property's. Everything else is dropped unread.

Counties (2026-11-11): Dallas (old PDF postings), Bexar (ArcGIS map service),
Harris (clerk search + OCR, HCAD parcels), Collin (Blazor app, the county's
own Commercial flag), Fort Bend (the clerk's monthly list PDF, Fort Bend CAD's
public parcel layer) and Williamson (the clerk's text index and scanned
notices, Williamson CAD's open data portal).

Only business names are kept (borrower as the notice and the appraisal roll
name it, foreclosing lender). Individuals, trustees and law firms are never
stored. Each row links to the clerk's own posting.

  python3 scripts/pull_tx_foreclosures.py                 # fetch new postings, merge
  python3 scripts/pull_tx_foreclosures.py --pdf-dir DIR   # parse local PDFs (testing)
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import io
import json
import pathlib
import re
import sys
import time
import urllib.parse
import urllib.request
import zipfile

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ingest_court_filings import slugify  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "ops" / "tx-foreclosures.json"
CACHE = pathlib.Path.home() / ".cache" / "credocket-cad"
UA = "CREdocket Texas foreclosure sales admin@credocket.com"
KEEP_DAYS = 400
CAD_MAX_AGE_DAYS = 7

# Appraisal-roll uses that are commercial real estate, mapped to the site's
# propertyType vocabulary ("" = commercial, no matching type: shown by its
# appraisal-district use). Uses not listed here (governmental buildings,
# barns, residential garages) are dropped.
USE_TYPE = {
    "OFFICE BUILDING": "Office", "OFFICE/SHOWROOM": "Office", "SALES OFFICE": "Office", "BANK": "Office",
    "DRIVE-IN BANK": "Office", "LOFT BUILDING": "Office", "TECHNICAL BUILDING": "Office",
    "CONVERTED RESIDENCE (FRAME EXTERIOR)": "Office", "CONVERTED RESIDENCE (BRICK EXTERIOR)": "Office",
    "MEDICAL OFFICE BUILDING": "Medical Office", "URGENT CARE CLINIC": "Medical Office",
    "OUTPATIENT SURGICAL CENTER": "Medical Office", "HOSPITAL": "Medical Office", "VETERINARY HOSPITAL": "Medical Office",
    "RETAIL STRIP": "Retail", "FREE STANDING RETAIL STORE": "Retail", "FAST FOOD RESTAURANT": "Retail",
    "RESTAURANT": "Retail", "CAFETERIA RESTAURANT": "Retail", "CONVENIENCE STORE": "Retail",
    "MINI-MART/GAS SERVICE STATION": "Retail", "SERVICE STATION": "Retail", "CANOPY SERVICE STATION": "Retail",
    "CONVERTED  SERVICE STATION": "Retail", "BAYLESS SERVICE STATION": "Retail", "AUTOMOTIVE SERVICE": "Retail",
    "AUTOMOTIVE DISPLAY": "Retail", "MINI LUBES": "Retail", "SELF SERVE CAR WASHES": "Retail",
    "AUTOMATIC CAR WASHES": "Retail", "DRIVE THRU CAR WASHES": "Retail", "CAR WASH": "Retail",
    "SUPERMARKET": "Retail", "DISCOUNT STORE": "Retail", "DEPARTMENT STORE": "Retail", "SHOPPING CENTER": "Retail",
    "SHOPPING MALL": "Retail", "MALL AREA": "Retail", "COCKTAIL LOUNGE": "Retail", "BARBER SHOP/BEAUTY SHOP": "Retail",
    "LAUNDROMAT": "Retail", "LAUNDRY/DRY CLEANING": "Retail", "HEALTH SPA": "Retail", "THEATER": "Retail",
    "BOWLING ALLEY": "Retail", "DINING PLAY ROOM": "Retail", "BANQUET HALL": "Retail", "FUNERAL HOME": "Retail",
    "DAY NURSERY": "Retail",
    "STORAGE WAREHOUSE": "Industrial", "DISTRIBUTION WAREHOUSE": "Industrial", "LIGHT INDUSTRIAL": "Industrial",
    "HEAVY INDUSTRIAL": "Industrial", "SHIPPING DOCK/TRUCK TERMINAL": "Industrial", "COLD STORAGE": "Industrial",
    "FOOD PROCESSING": "Industrial", "LUMBER STORAGE": "Industrial", "HANGAR": "Industrial", "T-HANGAR": "Industrial",
    "MINI-WAREHOUSE": "Self-Storage",
    "HOTEL": "Hospitality", "MOTEL": "Hospitality",
    "APARTMENT (BRICK EXTERIOR)": "Multifamily", "APARTMENT (FRAME EXTERIOR)": "Multifamily", "DORMITORY": "Multifamily",
    "SENIOR CITIZEN HOUSING": "Senior Living", "ELDERLY ASSISTED LIVING": "Senior Living",
    "RETIREMENT COMMUNITY COMPLEX": "Senior Living", "CONVALESCENT HOSP/NURSING HOME": "Senior Living",
    "COMPUTER DATA CENTER": "Data Center", "HIGH-RISE COMPUTER DATA CENTER": "Data Center",
    "LAND ONLY": "Land/Development",
    "CHURCH BUILDING": "", "SCHOOL": "", "RECREATION BUILDING": "", "FRATERNAL BUILDING": "", "COUNTRY CLUB": "",
    "AUDITORIUM": "", "PARKING GARAGE": "", "SPECIAL": "", "GREENHOUSE": "", "CANOPY": "",
}
GOV_OWNER = re.compile(r"\b(CITY OF|COUNTY OF|STATE OF|UNITED STATES|INDEPENDENT SCHOOL|\bISD\b|HOUSING AUTHORITY|DART\b)", re.I)
BUSINESS = re.compile(
    r"\b(L\.?L\.?C|L\.?P|L\.?L\.?P|INC|INCORPORATED|CORP|CORPORATION|COMPANY|CO|LTD|LIMITED|TRUST|N\.?A|BANK|"
    r"ASSOCIATION|PARTNERS|PARTNERSHIP|HOLDINGS|PROPERTIES|INVESTMENTS|VENTURES|CAPITAL|FUND|REIT|CHURCH|MINISTRIES|"
    r"FOUNDATION|ENTERPRISES|GROUP|DEVELOPMENT|REALTY|FINANCIAL|FUNDING|LENDING|CREDIT UNION|SERVICES)\b\.?", re.I)
PERSONAL_TRUST = re.compile(r"\b(LIVING|FAMILY|REVOCABLE|IRREVOCABLE)\s+TRUST\b|\bTRUSTEE\b|\bESTATE OF\b", re.I)

SUFFIX = {"STREET": "ST", "DRIVE": "DR", "ROAD": "RD", "AVENUE": "AVE", "BOULEVARD": "BLVD", "LANE": "LN",
          "PARKWAY": "PKWY", "FREEWAY": "FWY", "HIGHWAY": "HWY", "COURT": "CT", "CIRCLE": "CIR", "PLACE": "PL",
          "TRAIL": "TRL", "EXPRESSWAY": "EXPY", "NORTH": "N", "SOUTH": "S", "EAST": "E", "WEST": "W"}
# Words around an address that make it the property's, not a trustee's,
# servicer's or law firm's office.
PROPERTY_CUE = re.compile(r"(property\s+address|commonly\s+known\s+as|also\s+known\s+as|known\s+as|located\s+at|"
                          r"street\s+address\s+of\s+the\s+property|address\s+of\s+(?:the\s+)?property|property:)", re.I)

OFFICE_CONTEXT = re.compile(r"trustee|appoint|servicer|mortgagee|beneficiary|attorney|law\s+(?:firm|office)|\bllp\b|\bp\.?c\.?,|"
                            r"ballroom|event\s+center|courthouse|offices?\b", re.I)


def office_addresses(texts: list[str]) -> set:
    """A street address in many notices is a trustee's or law firm's office
    (or the courthouse, where sales are held), never the property's."""
    seen: dict[tuple, int] = {}
    for t in texts:
        keys = set()
        for m in re.finditer(r"\b(\d{2,6})\s+([A-Za-z][A-Za-z .]{2,30})", t):
            ws = norm_street(m.group(2)).split()
            # Every leading run of words, so "5177 Richmond Ave Suite 1230"
            # also marks "5177 Richmond Ave", the form an address match uses.
            keys |= {(m.group(1), " ".join(ws[:k])) for k in range(1, len(ws) + 1)}
        for k in keys:
            seen[k] = seen.get(k, 0) + 1
    return {k for k, n in seen.items() if n >= 3}


def get(url: str, timeout: int = 120) -> bytes:
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def norm_street(s: str) -> str:
    s = re.sub(r"[^A-Z0-9 ]", " ", s.upper())
    return " ".join(SUFFIX.get(w, w) for w in s.split())


def title(s: str, name: bool = False) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    keep = re.compile(r"^(LLC|LP|LLP|LTD|INC|NA|II|III|IV|USA|TX|[A-Z]{1,2}\d+|\d+[A-Z]?)$")
    out = []
    for w in s.split(" "):
        core = w.strip(",.&()")
        # All-capital words with no vowel are initials ("DFW"), not words.
        acronym = (name and core.isalpha() and core.isupper() and len(core) >= 3 and not re.search(r"[AEIOUY]", core)
                   and core not in {"BLDG", "BLVD", "HWY", "FWY", "PKWY", "STE", "PLZ", "CTR"})
        out.append(w if (keep.match(core.upper().replace(".", "")) or acronym) and core.isupper() else w.capitalize() if w.isupper() else w)
    return " ".join(out).replace(" Llc", " LLC").replace(" Lp", " LP")


def clean_business(s: str) -> str:
    """A business name from the appraisal roll or a notice, or "" if it is a
    person's name, a personal trust, or too garbled by OCR to print."""
    s = re.sub(r"\s+", " ", s).strip(" ,;:&-")
    s = re.sub(r"\s*&$", "", s)
    if not s or not BUSINESS.search(s) or PERSONAL_TRUST.search(s):
        return ""
    if re.search(r"[^A-Za-z0-9 &.,'\-/()]", s) or len(s) > 90 or len(s) < 5:
        return ""
    return s


# ---------------------------------------------------------------- appraisal roll

def first_tuesday(year: int, month: int) -> dt.date:
    d = dt.date(year, month, 1)
    return d + dt.timedelta(days=(1 - d.weekday()) % 7)


class Roll:
    """Commercial parcels of one county's appraisal roll, indexed by the
    keys a notice's legal description or property address can produce."""

    def __init__(self) -> None:
        self.parcels: dict[str, dict] = {}
        self.by_addr: dict[tuple, list[str]] = {}
        self.by_cityblock: dict[tuple, list[str]] = {}
        self.by_blklot: dict[tuple, list[str]] = {}
        self.by_abstract: dict[str, list[str]] = {}
        self.by_reserve: dict[tuple, list[str]] = {}

    def add(self, acct: str, p: dict) -> None:
        self.parcels[acct] = p
        if p["num"] and p["street"]:
            self.by_addr.setdefault((p["num"], norm_street(p["street"])), []).append(acct)
        legal = p["legal"].upper()
        m_blk = re.search(r"\bBLK\s+([A-Z0-9]{0,4})/(\d{3,5})", legal)
        m_lot = re.search(r"\bLTS?\s+(\d+[A-Z]?)", legal)
        if m_blk and m_lot:
            self.by_cityblock.setdefault((m_blk.group(2), m_lot.group(1)), []).append(acct)
        else:
            m_b = re.search(r"\bBLK\s+([A-Z0-9]{1,4})\b", legal)
            if m_b and m_lot:
                self.by_blklot.setdefault((m_b.group(1), m_lot.group(1)), []).append(acct)
        # Commercial plats in Harris County number "unrestricted reserves":
        # "RES A BLK 1" on the roll, "Reserve A, Block 1" in a notice.
        m_res = re.search(r"\bRES(?:ERVE)?\s+([A-Z0-9]{1,3})\b(?:\s+BLK\s+([A-Z0-9]{1,4}))?", legal)
        if m_res:
            self.by_reserve.setdefault((m_res.group(1), m_res.group(2) or ""), []).append(acct)
        m_ab = re.search(r"\bABST?\s+(\d{2,5})\b", legal)
        if m_ab:
            self.by_abstract.setdefault(m_ab.group(1), []).append(acct)


def dallas_roll() -> Roll:
    """Dallas CAD's free 'Data Files (No Values - Most Current Ownership)'
    download (dallascad.org/DataProducts.aspx), cached for a week."""
    page = get("https://www.dallascad.org/DataProducts.aspx").decode("utf-8", "replace")
    links = re.findall(r'href="(ViewPDFs\.aspx\?type=3&(?:amp;)?id=[^"]*DCAD(\d{4})_CURRENT\.zip)"', page, re.I)
    if not links:
        raise RuntimeError("Dallas CAD data file link not found")
    href, _year = max(links, key=lambda x: x[1])
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "dallas.zip"
    if not path.exists() or time.time() - path.stat().st_mtime > CAD_MAX_AGE_DAYS * 86400:
        url = "https://www.dallascad.org/" + href.replace("&amp;", "&").replace(" ", "%20")
        path.write_bytes(get(url, timeout=900))
    keep = {"B11", "C12", "C13", "F10", "F20"}
    z = zipfile.ZipFile(path)

    def rows(name: str):
        with z.open(name) as f:
            yield from csv.DictReader(io.TextIOWrapper(f, encoding="latin-1", newline=""))

    code = {r["ACCOUNT_NUM"]: r["SPTD_CODE"].strip() for r in rows("ACCOUNT_APPRL_YEAR.CSV") if r["SPTD_CODE"].strip() in keep}
    com: dict[str, dict] = {}
    for r in rows("COM_DETAIL.CSV"):
        a = r["ACCOUNT_NUM"]
        if a in code and a not in com:
            com[a] = {"name": r["PROPERTY_NAME"].strip(), "use": r["BLDG_CLASS_DESC"].strip(),
                      "sqft": int(float(r["GROSS_BLDG_AREA"] or 0)), "units": int(float(r["NUM_UNITS"] or 0)),
                      "yearBuilt": int(float(r["YEAR_BUILT"] or 0))}
    roll = Roll()
    for r in rows("ACCOUNT_INFO.CSV"):
        a = r["ACCOUNT_NUM"]
        if a not in code:
            continue
        c = com.get(a) or {}
        use = c.get("use") or ("LAND ONLY" if code[a] in ("C12", "C13") else "")
        if use not in USE_TYPE or GOV_OWNER.search(r["OWNER_NAME1"]):
            continue
        city = re.sub(r"\s*\(.*\)$", "", r["PROPERTY_CITY"].strip())
        roll.add(a, {
            "account": a, "code": code[a], "use": use, "type": USE_TYPE[use],
            "name": c.get("name", ""), "sqft": c.get("sqft", 0), "units": c.get("units", 0), "yearBuilt": c.get("yearBuilt", 0),
            "num": r["STREET_NUM"].strip(), "street": r["FULL_STREET_NAME"].strip(), "city": city,
            "zip": r["PROPERTY_ZIPCODE"].strip()[:5], "owner": r["OWNER_NAME1"].strip(),
            "legal": " ".join(x.strip() for x in (r["LEGAL1"], r["LEGAL2"], r["LEGAL3"], r["LEGAL4"]) if x.strip()),
            "subdivision": r["LEGAL1"].strip(),
            "url": f"https://www.dallascad.org/AcctDetailCom.aspx?ID={a}",
        })
    return roll


# ---------------------------------------------------------------- notices

SUBDIV_NOISE = {"ADDITION", "ADDN", "ADD", "PHASE", "SECTION", "SEC", "INST", "INSTALLMENT", "REVISED", "REPLAT", "THE",
                "AND", "CITY", "DALLAS", "COUNTY", "TEXAS", "UNIT", "NO", "AMENDING", "AMEND", "PARTIAL", "RES", "RESERVE",
                "BLK", "BLOCK", "LOT", "LTS", "HOUSTON", "HARRIS", "SUBDIVISION", "SUBD", "PLAT", "ESTATES", "CTR",
                "CENTER", "TRS", "IMPS", "UNDIV", "INT", "THRU", "AMENDED", "REPLAT", "PARTIAL", "MAP", "RECORDS", "PAR"}
# Words that end a plat name in a legal description ("Turner Court, in
# Harris County"; "South Acres Subdivision"), and words too common in plat
# names to identify one alone.
PLAT_END = SUBDIV_NOISE | {"ACCORDING", "BEING", "RECORDED", "VOLUME", "VOL", "FILM", "CODE", "OUT", "SURVEY", "ABSTRACT",
                           "WHICH", "CONTAINING", "SAID", "MORE", "COMMONLY", "KNOWN", "ADDITIONAL", "TOGETHER", "FILED"}
PLAT_COMMON = {"PLACE", "PARK", "OAKS", "OAK", "HEIGHTS", "VILLAGE", "ACRES", "GARDENS", "GARDEN", "TERRACE", "MANOR",
               "HILLS", "HILL", "WOODS", "LAKE", "LAKES", "CREEK", "NORTH", "SOUTH", "EAST", "WEST", "PLAZA", "SQUARE",
               "COURT", "GROVE", "MEADOWS", "RIDGE", "POINT", "POINTE", "CROSSING", "COMMONS", "BUSINESS", "INDUSTRIAL",
               "OFFICE", "COMMERCIAL", "RETAIL", "SHOPPING", "TOWN", "COUNTRY", "CLUB", "SPRINGS", "VALLEY", "FOREST"}
# Consumer-mortgage markers: a notice carrying one is a home loan whatever
# parcel its legal description seems to match.
CONSUMER = re.compile(r"Loan\s+Type\s*:?\s*(?:FHA|VA|USDA|Conventional)|MORTGAGE\s+ELECTRONIC\s+REGISTRATION|\bMERS\b|"
                      r"reverse\s+mortgage|home\s+equity|homestead|Freedom\s+Mortgage|PennyMac|Rocket\s+Mortgage|"
                      r"Lakeview\s+Loan|NewRez|Shellpoint|Carrington\s+Mortgage|Nationstar|Mr\.?\s+Cooper|LoanCare|"
                      r"Midland\s+Mortgage|Cenlar|Selene\s+Finance|Specialized\s+Loan\s+Servicing|Select\s+Portfolio|"
                      r"Freddie\s+Mac|Federal\s+Home\s+Loan\s+Mortgage|Fannie\s+Mae|Federal\s+National\s+Mortgage|"
                      r"husband\s+and\s+wife", re.I)

# "LOT TWENTY-FIVE (25), IN BLOCK ONE (1)" -> "LOT 25, IN BLOCK 1".
_NUM = r"(?:ONE|TWO|THREE|FOUR|FIVE|SIX|SEVEN|EIGHT|NINE|TEN|ELEVEN|TWELVE|THIRTEEN|FOURTEEN|FIFTEEN|SIXTEEN|SEVENTEEN|EIGHTEEN|NINETEEN|TWENTY|THIRTY|FORTY|FIFTY|SIXTY|SEVENTY|EIGHTY|NINETY|HUNDRED)"
NUMBER_WORDS = re.compile(rf"\b{_NUM}(?:[\s\-]+(?:AND\s+)?{_NUM})*\s*\.?\s*\(\s*([0-9]+[A-Z]?)\s*\)")

# Appraisal-roll property names that describe a use, not a property.
GENERIC_NAME = re.compile(r"^(LAND( ONLY)?|VACANT( LAND| LOT)?|CONDOMINIUM|APARTMENTS?|OFFICE|RETAIL|WAREHOUSE|PARKING|"
                          r"CHURCH|COMMERCIAL|INDUSTRIAL|UNASSIGNED|N/?A)$", re.I)

START = re.compile(r"NOTICE\s+OF\s+(?:\[?SUBSTITUTE\]?\s+)?(?:TRUSTEE|FORECLOSURE|ACCELERATION|SUBSTITUTE|SALE)", re.I)


def split_notices(pages: list[str]) -> list[tuple[int, str]]:
    """(first page number, text) for each notice in a clerk's PDF: a notice
    starts on a page whose top carries a notice-of-sale heading; exhibit and
    certificate pages belong to the notice before them."""
    out: list[tuple[int, list[str]]] = []
    for i, t in enumerate(pages):
        head = "\n".join(t.splitlines()[:30])
        if START.search(head) and not re.search(r"CERTIFICATE\s+OF\s+POSTING", head[:200], re.I) or not out:
            out.append((i + 1, [t]))
        else:
            out[-1][1].append(t)
    return [(p, "\n".join(ts)) for p, ts in out]


def names_plat(plat: str, near: str) -> bool:
    """A notice's text right after a lot/block or reserve names the parcel's
    plat: every distinctive word of a one- or two-word name, two thirds of
    a longer one. A name made only of common words ("Center Place" is just
    "Place" once "Center" is dropped) must appear whole, and the notice's
    name must not run on past the parcel's ("Oakcrest North" is a different
    plat from "Oakcrest")."""
    words = [w for w in re.findall(r"[A-Z]{3,}", plat.upper()) if w not in SUBDIV_NOISE]
    if not words:
        return False
    found = [w for w in words if re.search(rf"\b{w}\b", near)]
    if len(found) != len(words) if len(words) <= 2 else len(found) < max(2, -(-2 * len(words) // 3)):
        return False
    flat = " ".join(re.findall(r"[A-Z0-9]+", near))
    if all(w in PLAT_COMMON for w in words) and " ".join(re.findall(r"[A-Z]{3,}", plat.upper())) not in flat:
        return False
    m = re.search(rf"\b{found[-1]}\b\W*([A-Z]+)", near)
    if m and len(m.group(1)) >= 3 and m.group(1) not in PLAT_END and m.group(1) not in plat.upper():
        return False
    return True


_UNITS = {w: i for i, w in enumerate("ZERO ONE TWO THREE FOUR FIVE SIX SEVEN EIGHT NINE TEN ELEVEN TWELVE THIRTEEN FOURTEEN "
                                     "FIFTEEN SIXTEEN SEVENTEEN EIGHTEEN NINETEEN".split())}
_TENS = {w: 10 * i for i, w in enumerate("_ _ TWENTY THIRTY FORTY FIFTY SIXTY SEVENTY EIGHTY NINETY".split()) if i >= 2}


def _spelled(m: re.Match) -> str:
    """The spelled-out number of a NUMBER_WORDS match ("SIX (5)" -> "6")."""
    total = 0
    for w in re.findall(r"[A-Z]+", m.group(0).split("(")[0]):
        if w == "HUNDRED":
            total = max(total, 1) * 100
        else:
            total += _UNITS.get(w, 0) + _TENS.get(w, 0)
    return str(total) if total else m.group(1)


def match_parcel(text: str, roll: Roll, office_addrs: set) -> tuple[dict | None, str]:
    """The commercial parcel a notice describes, and how it was matched. The
    digits in "BLOCK SIX (6)" are used first; when they find nothing, the
    words are (OCR has read "Six (6)" as "Six (5)")."""
    up = NUMBER_WORDS.sub(r"\1", text.upper())
    found = _match_parcel(up, text, roll, office_addrs)
    if not found[0] and found[1] != "ambiguous":
        alt = NUMBER_WORDS.sub(_spelled, text.upper())
        if alt != up:
            found = _match_parcel(alt, text, roll, office_addrs)
    return found


def _match_parcel(up: str, text: str, roll: Roll, office_addrs: set) -> tuple[dict | None, str]:
    hits: dict[str, str] = {}
    # 1. Dallas city block and lot: "LOT 28, BLOCK A/7648".
    # City blocks are numbered across the whole City of Dallas, so block and
    # lot identify the parcel; a block letter, when both give one, must agree.
    def city_block(blk: str, lot: str, letter: str) -> None:
        for a in roll.by_cityblock.get((blk, lot), []):
            m_l = re.search(r"\bBLK\s+([A-Z0-9]{1,4})/", roll.parcels[a]["legal"].upper())
            if letter and m_l and m_l.group(1) != letter:
                continue
            hits.setdefault(a, "city block and lot")
    for m in re.finditer(r"\bLO[T1]S?\.?\s*(\d+[A-Z]?)\b[^/]{0,60}?(?:BLO?CK\.?\s*([A-Z0-9]{1,4})\s*)?/\s*(\d{4})\b", up):
        city_block(m.group(3), m.group(1), m.group(2) or "")
    for m in re.finditer(r"(?:BLO?CK\.?\s*([A-Z0-9]{1,4})\s*)?/\s*(\d{4})\b[^\n]{0,40}?\bLO[T1]S?\.?\s*(\d+[A-Z]?)\b", up):
        city_block(m.group(2), m.group(3), m.group(1) or "")
    # 2. Subdivision block and lot, confirmed by the subdivision's name.
    # The name must follow within the same legal description (the next 200
    # characters), not merely appear somewhere in the notice.
    for m in re.finditer(r"\bLO[T1]S?\.?\s*(\d+[A-Z]?)\W{1,4}(?:[A-Z]{1,2}\s+)?BLO?CK\.?\s*([A-Z0-9]{1,4})\b", up):
        near = up[m.end(): m.end() + 200]
        if re.match(r"\s*/\s*\d{3,5}", near):  # a Dallas city block: handled above
            continue
        for a in roll.by_blklot.get((m.group(2), m.group(1)), []):
            if names_plat(roll.parcels[a]["subdivision"], near):
                hits.setdefault(a, "subdivision block and lot")
    # 2b. Unrestricted reserve (and block), confirmed by the subdivision's name.
    for m in re.finditer(r"\bRESERVE\s+[\"'(]?([A-Z0-9]{1,3})\b[\"')]?(?:\W{1,4}(?:[A-Z]{1,2}\s+)?BLO?CK\.?\s*([A-Z0-9]{1,4})\b)?", up):
        near = up[m.end(): m.end() + 200]
        for a in roll.by_reserve.get((m.group(1), m.group(2) or ""), []):
            if names_plat(roll.parcels[a]["subdivision"], near):
                hits.setdefault(a, "reserve and subdivision")
    # 3. Survey abstract and acreage: "ABSTRACT NO. 1026 ... 17.1956 ACRES".
    acres = {round(float(x), 2) for x in re.findall(r"(\d{1,4}\.\d{2,4})\s*(?:ACRES?|AC\b)", up)}
    if acres:
        for ab in set(re.findall(r"ABSTRACT\s*(?:NO\.?|NUMBER)?\s*(\d{2,5})\b", up)):
            for a in roll.by_abstract.get(ab, []):
                m = re.search(r"ACS\s+([\d.]+)", roll.parcels[a]["legal"])
                if m and any(abs(float(m.group(1)) - x) <= max(0.02, 0.01 * x) for x in acres):
                    hits.setdefault(a, "survey abstract and acreage")
    # 4. A street address given as the property's.
    for cue in PROPERTY_CUE.finditer(text):
        # "AVT Title Services, LLC, located at 5177 Richmond Avenue" is the
        # substitute trustee's office; "located at 9401 Knight Road" after the
        # ballroom is where the sale is held. Neither is the property.
        if OFFICE_CONTEXT.search(text[max(0, cue.start() - 100): cue.start()]):
            continue
        seg = text[cue.end(): cue.end() + 120]
        m = re.search(r"\b(\d{2,6})\s+((?:[NSEW]\.?\s+)?[A-Za-z0-9][A-Za-z0-9 .]{2,40}?)\s*(?:,|\n|\s(?:Dallas|DALLAS|Texas|TEXAS|TX)\b)", seg)
        if not m:
            continue
        num, ws = m.group(1), norm_street(m.group(2)).split()
        for k in range(len(ws), 0, -1):
            key = (num, " ".join(ws[:k]))
            if key in roll.by_addr and key not in office_addrs:
                for a in roll.by_addr[key]:
                    hits.setdefault(a, "property address")
                break
    if not hits:
        return None, ""
    accts = sorted(hits)
    # One parcel, or several parcels of one property: keep the largest
    # building, and treat parcels that disagree on owner as no match.
    owners = {roll.parcels[a]["owner"] for a in accts}
    if len(owners) > 1:
        return None, "ambiguous"
    best = max(accts, key=lambda a: (roll.parcels[a]["sqft"], roll.parcels[a]["units"]))
    p = dict(roll.parcels[best])
    p["parcels"] = len(accts)
    return p, hits[best]


# "original principal amount of $400,000.00", "...amount of ONE HUNDRED SEVEN
# THOUSAND AND NO/100 DOLLARS ($107,000.00)", "Principal Amount: $4,042,005.80",
# "Original amount of Secured Indebtedness: $120,000.00" ("or..nal" allows
# for OCR's "orgunal").
AMOUNT = re.compile(r"(?:or[a-z]{1,4}nal\s+(?:principal\s+)?(?:amount|sum)(?:\s+of\s+secured\s+indebtedness)?|principal\s+amount)"
                    r"\s*(?:of|:)\s*[^$]{0,120}?\$\s?([\d,]+(?:\.\d{1,2})?)", re.I)
AMOUNT_AFTER = re.compile(r"\$\s?([\d,]{5,}(?:\.\d{2})?)\s+in\s+the\s+original\s+principal", re.I)
PAYEE = re.compile(r"payable\s+to\s+the\s+order\s+of\s+([A-Z0-9][A-Za-z0-9 ,.&'\-]{3,80}?(?:L\.?L\.?C\.?|Inc\.?|N\.A\.|Bank|L\.?P\.?|Corporation|Company|Trust))\b")
# '"Original Noteholder" means MF1 Capital LLC'; 'indebted to Spring Branch
# Funding, LLC ("Lender")' (OCR can read "Lender" as "Tender").
LENDER_DEFINED = re.compile(r"(?:Original\s+Noteholder|Lender)[\"”']?\s+means\s+([A-Z0-9][A-Za-z0-9 ,.&'\-]{3,80}?(?:L\.?L\.?C\.?|Inc\.?|N\.A\.|Bank|L\.?P\.?|Corporation|Company))\b|"
                            r"indebted\s+to\s+([A-Z0-9][A-Za-z0-9 ,.&'\-]{3,80}?(?:L\.?L\.?C\.?|Inc\.?|N\.A\.|Bank|L\.?P\.?|Corporation|Company))\s*\(\s*[\"“']?(?:the\s+)?[\"“']?[LT]ender", re.I)
BUSINESS_MARK = re.compile(r"\b(?:L\.?L\.?C|Inc|Incorporated|Corp|Corporation|Company|Co|N\.A\b|L\.?P|LLP|Ltd|Bank|Bancorp|Trust|"
                           r"Capital|Credit\s+Union|Fund|Funding|Financial|Finance|Lending|Loans?|Mortgage|Insurance|Association|"
                           r"Partners|Holdings|Investments?|Investors|Equities|Properties|Realty|Group|Servicing|FSB|Federal|National|Savings)\b", re.I)
LENDER_LABEL = re.compile(r"(?:Current\s+(?:Beneficiary|Mortgagee)[^:\n]*|Lender|Beneficiary|Mortgagee|Holder)(?:\((?:s|ies)\))?\s*:\s*([^\n]{4,90})", re.I)


def notice_fields(text: str) -> dict:
    out: dict = {}
    m = AMOUNT.search(re.sub(r"\s+", " ", text)) or AMOUNT_AFTER.search(re.sub(r"\s+", " ", text))
    if m:
        v = float(m.group(1).replace(",", ""))
        if v >= 10000:
            out["originalAmount"] = v
    flat = re.sub(r"\s+", " ", text)
    labels = list(LENDER_LABEL.finditer(text))
    # A "Lender:" or "Current Beneficiary:" line names the lender now; an
    # earlier "Beneficiary:" line can be the loan's original holder.
    labels.sort(key=lambda m: 0 if re.match(r"\s*(?:Current|Lender)", m.group(0), re.I)
                and not re.search(r"Orig\w*\s*$", text[max(0, m.start() - 12): m.start()], re.I) else 1)
    for m in [*labels, *PAYEE.finditer(flat), *LENDER_DEFINED.finditer(flat)]:
        raw = (m.group(1) or m.group(2) if m.re is LENDER_DEFINED else m.group(1)).split("  ")[0]
        # "..., LLC, a Delaware limited liability company": the name ends
        # before its form of organization.
        raw = re.split(r",?\s+an?\s+(?:[A-Z][a-z]+\s+){0,2}(?:limited|corporation|general|state|national|banking|federal|statutory|business|nonprofit)\b",
                       raw, flags=re.I)[0]
        name = clean_business(raw)
        # "City Bank as the successor in interest to ...": the name ends
        # where its capacity begins.
        name = re.split(r"\s+as\s+(?:the|a|an|such|current|successor|trustee|nominee|agent|assignee|servicer)\b|\s+pursuant\b|,?\s+its\s+successors|,?\s+as$", name or "", flags=re.I)[0].strip(" ,;")
        # Business names only (never an individual's) and never an OCR
        # fragment that starts mid-word ("eal Estate Capital, LLC").
        if name and (not name[0].isupper() and not name[0].isdigit() or not BUSINESS_MARK.search(name)):
            continue
        if name and not re.search(r"MORTGAGE ELECTRONIC|MERS", name, re.I):
            # OCR's "SPRING. BRANCH FUNDING" and "Spring, Branch Funding": a
            # stray mark inside a name, not before its LLC or N.A.
            name = re.sub(r"(?<=[A-Za-z]{3})[.,]\s+(?!(?:LLC|L\.L\.C|Inc|N\.A|L\.?P\b|Ltd|Corp|Co\b|National|FSB|PLLC|LLP))(?=[A-Z])",
                          " ", name, flags=re.I)
            out["lender"] = title(name, name=True) if name.isupper() else name
            break
    dates = []
    for m in re.finditer(r"\b(\d{1,2})/(\d{1,2})/(20\d\d)\b", text):
        try:
            dates.append(dt.date(int(m.group(3)), int(m.group(1)), int(m.group(2))))
        except ValueError:
            pass
    for m in re.finditer(r"\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(20\d\d)", text):
        try:
            dates.append(dt.datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y").date())
        except ValueError:
            pass
    out["_dates"] = dates
    return out


def sale_date(month_name: str, dates: list[dt.date], fallback_year: int) -> str:
    """First Tuesday of the clerk's sale month; the year is the one a date in
    the notice gives for a first Tuesday of that month."""
    month = dt.datetime.strptime(month_name[:3], "%b").month
    for d in dates:
        if d.month == month and d == first_tuesday(d.year, month):
            return d.isoformat()
    years = sorted({d.year for d in dates if d.month == month}, reverse=True)
    return first_tuesday(years[0] if years else fallback_year, month).isoformat()


# ---------------------------------------------------------------- counties

def dallas_postings() -> list[dict]:
    """Dallas County Clerk posts each sale month's notices as PDFs per city."""
    page = get("https://www.dallascounty.org/government/county-clerk/recording/foreclosures.php").decode("utf-8", "replace")
    out = []
    for href in sorted(set(re.findall(r'href="(/department/countyclerk/media/foreclosure/[^"]+\.pdf)"', page, re.I))):
        m = re.search(r"/foreclosure/([A-Za-z]+)/([^/]+)\.pdf$", href)
        if not m:
            continue
        out.append({"county": "Dallas", "month": m.group(1), "label": m.group(2),
                    "url": "https://www.dallascounty.org" + urllib.parse.quote(href)})
    return out


def pdf_pages(data: bytes) -> list[str]:
    import pypdf
    r = pypdf.PdfReader(io.BytesIO(data))
    return [(p.extract_text() or "") for p in r.pages]


def parse_posting(post: dict, pages: list[str], roll: Roll, office_addrs: set, today: dt.date) -> list[dict]:
    rows = []
    city = re.sub(r"[_\s]*\d.*$", "", post["label"]).replace("-", " ").replace("_", " ").strip().upper()
    for page, text in split_notices(pages):
        if CONSUMER.search(text):
            continue
        parcel, how = match_parcel(text, roll, office_addrs)
        if not parcel:
            continue
        # The clerk files each notice under the property's city ("Other" for
        # the rest); a parcel in another city is a false match.
        pcity = parcel["city"].upper()
        if city != "OTHER" and pcity != city:
            continue
        # A long notice can repeat its heading on every page.
        if rows and rows[-1]["parcel"] == parcel["account"]:
            continue
        f = notice_fields(text)
        sale = sale_date(post["month"], f.pop("_dates"), today.year)
        owner = clean_business(parcel["owner"])
        addr = " ".join(x for x in (parcel["num"], title(parcel["street"])) if x)
        name = title(re.sub(r"\s*\(.*?\)", "", parcel["name"]), name=True) if parcel["name"] and not GENERIC_NAME.search(parcel["name"]) and not re.match(r"\d", parcel["name"]) else ""
        rows.append({
            "county": post["county"], "state": "TX", "saleDate": sale,
            "address": addr, "city": title(parcel["city"]), "zip": parcel["zip"],
            "propertyName": name, "propertyType": parcel["type"], "use": parcel["use"].title(),
            "sqft": parcel["sqft"] or None, "units": parcel["units"] or None, "yearBuilt": parcel["yearBuilt"] or None,
            "owner": owner, "lender": f.get("lender", ""), "originalAmount": f.get("originalAmount"),
            "parcel": parcel["account"], "parcelUrl": parcel["url"], "parcels": parcel["parcels"], "matchedBy": how,
            "postingUrl": post["url"], "postingPage": page, "postingLabel": re.sub(r"[_\s]*\d.*$", "", post["label"]).replace("-", " ").replace("_", " ").strip(),
        })
    return rows


def slug_for(r: dict) -> str:
    base = r["propertyName"] or r["address"] or r["parcel"]
    return slugify(f"{base} {r['city']} tx {r['saleDate'][:7]}")


def dallas_source(today: dt.date, processed: set, pdf_dir: str | None) -> list[dict]:
    """Dallas posted notices as PDFs until February 24, 2026; later notices are
    only on dallas.tx.publicsearch.us, whose robots.txt disallows all but its
    homepage, so this reads only what the old page still lists."""
    if pdf_dir:
        work = []
        for p in sorted(pathlib.Path(pdf_dir).glob("*.pdf")):
            month, _, label = p.stem.partition("_")
            work.append(({"county": "Dallas", "month": month, "label": label, "url": f"file:{p.name}"}, p.read_bytes()))
    else:
        work = []
        for post in dallas_postings():
            if post["url"] in processed:
                continue
            try:
                work.append((post, get(post["url"])))
            except Exception as e:  # one bad PDF never stops the run
                print(f"  skip {post['url']}: {e}", flush=True)
            time.sleep(1)
    if not work:
        return []
    roll = dallas_roll()
    print(f"dallas: {len(roll.parcels)} commercial parcels on the appraisal roll", flush=True)
    texts = []
    for post, data in work:
        try:
            texts.append((post, pdf_pages(data)))
        except Exception as e:
            print(f"  unreadable {post['url']}: {e}", flush=True)
    office = office_addresses(["\n".join(pages) for _, pages in texts])
    rows = []
    for post, pages in texts:
        found = parse_posting(post, pages, roll, office, today)
        rows.extend(found)
        print(f"  Dallas {post['month']} {post['label']}: {len(pages)} pages, {len(found)} commercial", flush=True)
        processed.add(post["url"])
    return rows


BEXAR = "https://maps.bexar.org/arcgis/rest/services"
# Bexar CAD's own codes (seen 2026-11-06): F1/F2 commercial and industrial
# improvements; B2 with use 800 is an apartment complex (B1 is a duplex or
# house). Use 001 is residential, which also marks condominium regimes coded F1.
BEXAR_USE = {"400": ("Office", "Office"), "800": ("Apartments", "Multifamily")}


def bexar_source(today: dt.date, processed: set) -> list[dict]:
    """Bexar County's foreclosure map (Mortgage layer) gives each posted
    notice's address, document number and point; Bexar's Parcels layer at that
    point gives the appraisal roll's state code, use, owner and building."""
    rows = []
    months = [(today.year + (today.month - 1 + k) // 12, (today.month - 1 + k) % 12 + 1) for k in (-1, 0, 1, 2)]
    for year, month in months:
        q = urllib.parse.urlencode({"where": f"YEAR={year} AND MONTH={month}", "outFields": "*", "returnGeometry": "true",
                                    "outSR": "4326", "f": "json"})
        feats = json.loads(get(f"{BEXAR}/CC/ForeclosuresProd/MapServer/0/query?{q}", timeout=90)).get("features", [])
        new = 0
        for f in feats:
            a, g = f["attributes"], f.get("geometry") or {}
            key = f"bexar:{a.get('DOC_NUMBER')}"
            if key in processed or "x" not in g:
                continue
            new += 1
            pq = urllib.parse.urlencode({"geometry": f"{g['x']},{g['y']}", "geometryType": "esriGeometryPoint", "inSR": "4326",
                                         "spatialRel": "esriSpatialRelIntersects", "returnGeometry": "false", "f": "json",
                                         "outFields": "PropID,Situs,Owner,State_cd,PropUse,GBA,YrBlt,DBA"})
            try:
                parcels = json.loads(get(f"{BEXAR}/Parcels/MapServer/0/query?{pq}", timeout=90)).get("features", [])
            except Exception as e:
                print(f"  bexar parcel lookup failed for {a.get('DOC_NUMBER')}: {e}", flush=True)
                continue
            processed.add(key)
            time.sleep(0.3)
            if len(parcels) != 1:
                continue
            p = parcels[0]["attributes"]
            code, use = str(p.get("State_cd") or "").strip(), str(p.get("PropUse") or "").strip()
            if use == "001" or not (code in ("F1", "F2") or (code == "B2" and use == "800")):
                continue
            dba = re.sub(r"\s*\(.*?\)\s*", " ", str(p.get("DBA") or "")).strip()
            units = re.search(r"\((\d+)\s+UNITS?\)", str(p.get("DBA") or ""), re.I)
            label, ptype = BEXAR_USE.get(use, ("Industrial" if code == "F2" else "Commercial", "Industrial" if code == "F2" else ""))
            situs = str(p.get("Situs") or "").split("\n")[0].strip() or a.get("ADDRESS", "")
            rows.append({
                "county": "Bexar", "state": "TX", "saleDate": first_tuesday(year, month).isoformat(),
                "address": title(situs), "city": title(a.get("CITY") or ""), "zip": str(a.get("ZIP") or ""),
                "propertyName": title(dba, name=True) if dba and not GENERIC_NAME.search(dba) else "", "propertyType": ptype,
                "use": label, "sqft": int(float(p.get("GBA") or 0)) or None, "units": int(units.group(1)) if units else None,
                "yearBuilt": int(float(p.get("YrBlt") or 0)) or None, "owner": clean_business(str(p.get("Owner") or "")),
                "lender": "", "originalAmount": None, "parcel": str(int(p["PropID"])),
                "parcelUrl": f"https://bexar.trueautomation.com/clientdb/Property.aspx?cid=110&prop_id={int(p['PropID'])}",
                "parcels": 1, "matchedBy": "the notice's mapped location", "docNumber": str(a.get("DOC_NUMBER") or ""),
                "postingUrl": "https://maps.bexar.org/foreclosures/", "postingPage": None, "postingLabel": "",
            })
        print(f"  Bexar {year}-{month:02d}: {len(feats)} notices, {new} new", flush=True)
    return rows


HCAD = "https://arcweb.hcad.org/server/rest/services/public/public_query/MapServer/0/query"
# Harris CAD state classes: B1 apartments (B2-B4 are duplexes to fourplexes),
# C2 commercial vacant land, F1 commercial, F2 industrial.
HCAD_CLASS = {"B1": ("Apartments", "Multifamily"), "C2": ("Commercial land", "Land/Development"),
              "F1": ("Commercial", ""), "F2": ("Industrial", "Industrial")}


def harris_roll() -> Roll:
    """Every Harris CAD parcel in a commercial state class, from HCAD's public
    parcel map service (2,000 per request), cached for a week."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "harris.json"
    if path.exists() and time.time() - path.stat().st_mtime < CAD_MAX_AGE_DAYS * 86400:
        rows = json.loads(path.read_text())
    else:
        rows, last = [], -1
        where = "state_class IN ('B1','C2','F1','F2')"
        while True:
            q = urllib.parse.urlencode({"where": f"{where} AND OBJECTID > {last}", "orderByFields": "OBJECTID",
                                        "outFields": "OBJECTID,HCAD_NUM,owner,address,city,zip,state_class,legal_lines",
                                        "returnGeometry": "false", "resultRecordCount": 2000, "f": "json"})
            feats = json.loads(get(f"{HCAD}?{q}", timeout=120)).get("features", [])
            if not feats:
                break
            rows.extend(f["attributes"] for f in feats)
            last = feats[-1]["attributes"]["OBJECTID"]
            time.sleep(0.5)
        path.write_text(json.dumps(rows))
    roll = Roll()
    for r in rows:
        label, ptype = HCAD_CLASS.get(r.get("state_class") or "", ("", None))
        if ptype is None or GOV_OWNER.search(r.get("owner") or ""):
            continue
        addr = (r.get("address") or "").strip()
        m = re.match(r"(\d+)\s+(.+?)(?:\s+#.*)?$", addr)
        segs = [x.strip() for x in (r.get("legal_lines") or "").split("|") if x.strip()]
        # The plat name is the last segment's words after its lot, block,
        # reserve and tract numbers ("LT 7 BLK 2 SOUTHMONT SEC 3" -> SOUTHMONT).
        plat = re.sub(r"\(.*?\)", " ", segs[-1]) if segs else ""
        plat = re.sub(r"\b(LTS?|BLKS?|RES|TRS?|UNITS?|PT|ABST)\s+[A-Z0-9\-./&]+(\s*(&|THRU)\s*[A-Z0-9\-./]+)*", " ", plat)
        roll.add(r["HCAD_NUM"], {
            "account": r["HCAD_NUM"], "code": r.get("state_class"), "use": label, "type": ptype, "name": "",
            "sqft": 0, "units": 0, "yearBuilt": 0, "num": m.group(1) if m else "", "street": m.group(2) if m else "",
            "city": (r.get("city") or "").strip(), "zip": str(r.get("zip") or "")[:5], "owner": (r.get("owner") or "").strip(),
            "legal": " ".join(segs), "subdivision": plat, "url": "",
        })
    return roll


HARRIS_LIST = "https://www.cclerk.hctx.net/Applications/WebSearch/FRCL_R.aspx"


def harris_notices(months: list[tuple[int, int]]) -> tuple[list[dict], object]:
    """Every notice the Harris County Clerk lists for the given sale months:
    an ASP.NET form, so the search is a postback (year first, then month),
    then one postback per page of 20."""
    import html as htmlmod
    import http.cookiejar
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [("User-Agent", UA)]

    def hidden(page: str) -> dict:
        return {m.group(1): htmlmod.unescape(m.group(2))
                for m in re.finditer(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', page)}

    def fetch(data: bytes | None = None) -> str:
        for attempt in range(4):
            try:
                time.sleep(1)
                return op.open(HARRIS_LIST, data, timeout=120).read().decode("utf-8", "replace")
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(15 * (attempt + 1))
        raise RuntimeError("unreachable")

    def post(page: str, extra: dict) -> str:
        f = hidden(page)
        f.update(extra)
        return fetch(urllib.parse.urlencode(f).encode())

    out = []
    for year, month in months:
        page = fetch()
        form = {"ctl00$ContentPlaceHolder1$rbtlDate": "SaleDate", "ctl00$ContentPlaceHolder1$ddlYear": str(year),
                "ctl00$ContentPlaceHolder1$txtFileNo": "", "ctl00$ContentPlaceHolder1$btnSearch": "Search"}
        page = post(page, {**form, "ctl00$ContentPlaceHolder1$ddlMonth": "Select -"})
        if f'<option value="{month}"' not in page and f'<option selected="selected" value="{month}"' not in page:
            continue  # no notices posted yet for that sale month
        page = post(page, {**form, "ctl00$ContentPlaceHolder1$ddlMonth": str(month)})
        seen_pages = {1}
        while True:
            for m in re.finditer(r'href="(ViewECdocs\.aspx\?ID=[^"]+)"[^>]*>(FRCL-\d{4}-\d+)</a>[\s\S]*?lblSaleDate">([\d/]+)<[\s\S]*?lblFileDate">([\d/]+)<[\s\S]*?lblPages">(\d+)<', page):
                out.append({"doc": m.group(2), "url": urllib.parse.urljoin(HARRIS_LIST, htmlmod.unescape(m.group(1))),
                            "sale": dt.datetime.strptime(m.group(3), "%m/%d/%Y").date().isoformat(),
                            "filed": m.group(4), "pages": int(m.group(5))})
            nxt = sorted(int(n) for n in re.findall(r"Page\$(\d+)", page) if int(n) not in seen_pages)
            if not nxt:
                break
            seen_pages.add(nxt[0])
            page = post(page, {"__EVENTTARGET": "ctl00$ContentPlaceHolder1$GridView1", "__EVENTARGUMENT": f"Page${nxt[0]}"})
    return out, op


def ocr_pdf(data: bytes, max_pages: int = 4) -> list[str]:
    """Text of a scanned PDF's first pages: Tesseract (with pdftoppm) where
    installed, as on the GitHub runner; otherwise the program named by
    CREDOCKET_OCR, which takes a PDF path and page count and prints
    '===== PAGE n' sections (a local stand-in for testing)."""
    import os
    import shutil
    import subprocess
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        pdf = os.path.join(td, "n.pdf")
        open(pdf, "wb").write(data)
        if shutil.which("tesseract") and shutil.which("pdftoppm"):
            subprocess.run(["pdftoppm", "-r", "300", "-gray", "-l", str(max_pages), "-png", pdf, os.path.join(td, "p")],
                           check=True, capture_output=True, timeout=300)
            pages = []
            for img in sorted(pathlib.Path(td).glob("p-*.png")):
                r = subprocess.run(["tesseract", str(img), "stdout", "--psm", "4"], capture_output=True, timeout=300, text=True)
                pages.append(r.stdout)
            return pages
        tool = os.environ.get("CREDOCKET_OCR")
        if not tool:
            raise RuntimeError("no OCR available (install tesseract-ocr and poppler-utils)")
        r = subprocess.run([tool, pdf, str(max_pages)], capture_output=True, timeout=300, text=True)
        return [p.split("\n", 1)[1] if "\n" in p else "" for p in r.stdout.split("===== PAGE ")[1:]]


def harris_source(today: dt.date, processed: set, limit: int | None) -> list[dict]:
    """Harris County Clerk notices are scanned images: each new notice's first
    pages are read by OCR and matched to the HCAD commercial parcels."""
    months = [(today.year + (today.month - 1 + k) // 12, (today.month - 1 + k) % 12 + 1) for k in (0, 1, 2)]
    notices, op = harris_notices(months)
    new = [n for n in notices if f"harris:{n['doc']}" not in processed and n["sale"] >= today.isoformat()]
    print(f"  Harris: {len(notices)} notices listed, {len(new)} new", flush=True)
    if limit:
        new = new[:limit]
    if not new:
        return []
    roll = harris_roll()
    print(f"harris: {len(roll.parcels)} commercial parcels on the appraisal roll", flush=True)
    rows, texts, read = [], [], 0
    for n in new:
        try:
            time.sleep(1)
            data = b""
            for attempt in range(3):
                try:
                    data = op.open(urllib.request.Request(n["url"], headers={"User-Agent": UA}), timeout=120).read()
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(15 * (attempt + 1))
            if not data.startswith(b"%PDF"):
                raise RuntimeError("not a PDF")
            pages = ocr_pdf(data, max_pages=min(n["pages"], 6))
        except Exception as e:
            print(f"  Harris {n['doc']}: {e}", flush=True)
            continue
        processed.add(f"harris:{n['doc']}")
        read += 1
        texts.append((n, "\n".join(pages)))
    office = office_addresses([t for _, t in texts])
    for n, text in texts:
        if CONSUMER.search(text):
            continue
        parcel, how = match_parcel(text, roll, office)
        if not parcel:
            continue
        f = notice_fields(text)
        f.pop("_dates", None)
        rows.append({
            "county": "Harris", "state": "TX", "saleDate": n["sale"],
            "address": " ".join(x for x in (parcel["num"], title(parcel["street"])) if x), "city": title(parcel["city"]),
            "zip": parcel["zip"], "propertyName": "", "propertyType": parcel["type"], "use": parcel["use"],
            "sqft": None, "units": None, "yearBuilt": None, "owner": clean_business(parcel["owner"]),
            "lender": f.get("lender", ""), "originalAmount": f.get("originalAmount"), "parcel": parcel["account"],
            "parcelUrl": "", "parcels": parcel["parcels"], "matchedBy": how, "docNumber": n["doc"],
            # The scanned notice opens only inside a search session, so the
            # link is the clerk's search, labeled with what to look up there.
            "postingUrl": HARRIS_LIST, "postingPage": None, "postingLabel": "",
            "sourceLabel": f"Harris County Clerk foreclosure notice search, {dt.date.fromisoformat(n['sale']):%B %Y} sales, document {n['doc']}",
        })
        print(f"  Harris {n['doc']}: {rows[-1]['address']}, {rows[-1]['city']} ({parcel['code']}, {how})", flush=True)
    print(f"  Harris: {read} notices read, {len(rows)} commercial", flush=True)
    return rows


COLLIN = "https://apps2.collincountytx.gov/ForeclosureNotices"
# Collin CAD state codes that are never commercial real estate: houses,
# townhomes and condos (A), mobile homes (M), residential inventory (O),
# farm and ranch (D, E) and residential vacant lots (C1).
COLLIN_RESIDENTIAL = re.compile(r"^(A|M|O|D|E|C1)")


def collin_cards() -> list[dict]:
    """Collin County's notice list is a Blazor app that only renders in a
    browser: read every page of cards (address, sale date, CAD property type)
    and the map markers that carry each notice's detail-page ID."""
    from playwright.sync_api import sync_playwright
    cards: dict[str, dict] = {}
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(user_agent=UA)
        pg.goto(COLLIN, wait_until="load", timeout=120000)
        for _ in range(60):
            if pg.evaluate("() => typeof markers !== 'undefined' && markers && markers.getLayers().length > 0"):
                break
            time.sleep(1)
        ids = pg.evaluate("""() => markers.getLayers().map(m => (m.getPopup() && m.getPopup().getContent()) || '')""")
        for page_no in range(1, 60):
            text = pg.inner_text("body")
            for m in re.finditer(r"\n([0-9][^\n]+?, TX \d{5})\s*\n[\s\S]*?Sale Date:\s*(\d\d/\d\d/\d{4})[\s\S]*?Property Type:\s*([^\n]*)", text):
                cards[m.group(1).strip().upper()] = {"address": m.group(1).strip(), "sale": m.group(2), "type": m.group(3).strip()}
            nxt = pg.query_selector('button[aria-label="Next page"]')
            if not nxt or nxt.is_disabled():
                break
            nxt.click()
            time.sleep(2)
        b.close()
    out = []
    for html_ in ids:
        m = re.search(r"DetailPage/(\d+)>([^<]+)<", html_)
        if not m:
            continue
        key = re.sub(r"\s+", " ", m.group(2)).strip().upper()
        card = cards.get(key) or next((c for k, c in cards.items() if re.sub(r"\s+", " ", k) == key), None)
        if card:
            out.append({**card, "entry": m.group(1)})
    return out


def collin_source(today: dt.date, processed: set) -> list[dict]:
    """Each Collin notice whose CAD type is not residential is opened; its
    detail page carries the county's own Commercial True/False flag."""
    cards: list[dict] = []
    for attempt in range(3):  # the map's markers sometimes fail to load
        cards = collin_cards()
        if cards:
            break
        time.sleep(30)
    if not cards:
        raise RuntimeError("Collin notice list did not load")
    rows, opened = [], 0
    for c in cards:
        sale = dt.datetime.strptime(c["sale"], "%m/%d/%Y").date()
        code = re.search(r"\(([A-Z0-9]+)\)\s*$", c["type"])
        key = f"collin:{c['entry']}"
        if code and COLLIN_RESIDENTIAL.match(code.group(1)):
            processed.add(key)  # residential: never opened
            continue
        if key in processed or sale < today - dt.timedelta(days=60) or not code:
            continue
        time.sleep(1)
        page = get(f"{COLLIN}/DetailPage/{c['entry']}", timeout=120).decode("utf-8", "replace")
        opened += 1
        processed.add(key)
        page = re.sub(r"data:image[^\"']+", "", page)
        text = re.sub(r"\n\s*\n+", "\n", re.sub(r"<[^>]+>", "\n", page)).replace("&#xD;&#xA;", " | ")
        field = lambda name: (re.search(rf"\n{name}\n([^\n]+)", text) or [None, ""])[1].strip()
        if field("Commercial") != "True":
            continue
        state_code = field("State Property Code")
        use = re.sub(r"\s*\([A-Z0-9]+\)$", "", field("Type")) or "Commercial"
        cad = re.search(r'href="(https?://www\.collincad\.org/propertysearch\?prop_id=\d+)"', page)
        num = lambda v: int(re.sub(r"[^\d]", "", v)) if re.search(r"\d", v or "") else None
        owner = re.sub(r"\bLlc\b", "LLC", re.split(r"(?i)\s*c/o\b", html_unescape(field("Name")))[0])
        street, _, place = html_unescape(field("Address")).partition("|")
        m_addr = re.match(r"\s*(.+?),\s*TX\s+(\d{5})", place)
        m_addr = (street.strip(), m_addr.group(1), m_addr.group(2)) if m_addr else None
        rows.append({
            "county": "Collin", "state": "TX", "saleDate": sale.isoformat(),
            "address": m_addr[0] if m_addr else street.strip(), "city": m_addr[1] if m_addr else "",
            "zip": m_addr[2] if m_addr else "", "propertyName": "", "propertyType": COLLIN_TYPE.get(use, ""),
            "use": "Commercial condominium" if use == "Condominium" else use, "sqft": num(field("Improvement Area")), "units": None, "yearBuilt": num(field("Year Built")),
            "owner": clean_business(owner), "lender": "", "originalAmount": None,
            "parcel": cad.group(1).rsplit("=", 1)[1] if cad else c["entry"], # The county's CAD link opens Collin CAD's general search page, not
            # the account (checked 2026-11-09), so the account is shown unlinked.
            "parcelUrl": "",
            "parcels": 1, "matchedBy": "the county's own link to the parcel, which the appraisal district classifies as commercial"
                         + (f" (state code {code.group(1)})" if (code := re.search(r"\(([A-Z0-9]+)\)\s*$", state_code)) else ""),
            "postingUrl": f"{COLLIN}/DetailPage/{c['entry']}", "postingPage": None, "postingLabel": "",
        })
        print(f"  Collin {c['entry']}: {rows[-1]['address']}, {rows[-1]['city']} ({use})", flush=True)
    print(f"  Collin: {len(cards)} notices listed, {opened} opened, {len(rows)} commercial", flush=True)
    return rows


def html_unescape(s: str) -> str:
    import html as htmlmod
    return re.sub(r"\s+", " ", htmlmod.unescape(s)).strip()


# Collin CAD "Type" labels to the site's property types.
COLLIN_TYPE = {"Office": "Office", "Retail": "Retail", "Warehouse": "Industrial", "Industrial": "Industrial",
               "Apartment": "Multifamily", "Apartments": "Multifamily", "Hotel": "Hospitality", "Motel": "Hospitality",
               "Medical Office": "Medical Office", "Mini Warehouse": "Self-Storage", "Commercial Vacant": "Land/Development"}


def ocr_available() -> bool:
    import os
    import shutil
    return bool(shutil.which("tesseract") and shutil.which("pdftoppm") or os.environ.get("CREDOCKET_OCR"))


def _addr_key(num: str, street: str) -> tuple[str, str]:
    ws = [w for w in norm_street(street).split() if w not in ("N", "S", "E", "W")]
    return num, ws[0] if ws else ""


def stated_addresses(text: str, zips: set) -> set:
    """(number, first street word) of every address in a notice that could be
    the property's: one after a property cue ("commonly known as"), or any
    street address in a ZIP code of the county's roll ("15835 RIDGEROE LN,
    HOUSTON, TX 77053" printed under the attorney's signature)."""
    out = set()
    for cue in PROPERTY_CUE.finditer(text):
        if OFFICE_CONTEXT.search(text[max(0, cue.start() - 100): cue.start()]):
            continue
        m = re.search(r"\b(\d{2,6})\s+((?:[NSEW]\.?\s+)?[A-Za-z0-9][A-Za-z0-9 .]{2,40}?)\s*(?:,|\n)", text[cue.end(): cue.end() + 120])
        if m:
            out.add(_addr_key(m.group(1), m.group(2)))
    for m in re.finditer(r"\b(\d{2,6})\s+((?:[NSEW]\.?\s+)?[A-Za-z][A-Za-z0-9 .]{2,40}?),?\s+[A-Za-z][A-Za-z .]{2,25}?,?\s+(?:TX|TEXAS)\.?\s+(\d{5})", text, re.I):
        if m.group(3) in zips:
            out.add(_addr_key(m.group(1), m.group(2)))
    return out


def _name_key(s: str) -> str:
    return " ".join(re.sub(r"[^A-Z0-9 ]", " ", s.upper()).split())


BORROWER_CONTEXT = re.compile(r"BORROWER|GRANTOR|MORTGAGOR|EXECUTED\s+BY|DEBTOR|TRUSTOR")
LENDER_CONTEXT = re.compile(r"LENDER|HOLDER|MORTGAGEE|BENEFICIARY|PAYABLE\s+TO|ORDER\s+OF|BENEFIT\s+OF|SERVICER")


def match_borrower(text: str, roll: Roll) -> tuple[dict | None, str]:
    """The parcel whose appraisal-roll owner is the business the notice names
    as borrower or grantor ("Borrower: Sugar Creek Center Houston, TX. LLC"),
    when that business owns one commercial property in the county (at most
    three parcels, all on one street) and no other owner is so named. For
    notices whose legal description is only an exhibit OCR could not read."""
    if not hasattr(roll, "by_owner"):
        roll.by_owner = {}
        for a, p in roll.parcels.items():
            k = _name_key(clean_business(p["owner"]))
            if len(k) >= 10 and len(k.split()) >= 3:
                roll.by_owner.setdefault(k, []).append(a)
    flat = _name_key(text)
    hits = []
    for k, accts in roll.by_owner.items():
        # Several parcels count only as one property on one street
        # (an apartment complex split across two accounts).
        if len(accts) > 3 or len({norm_street(roll.parcels[a]["street"]) for a in accts}) != 1:
            continue
        for m in re.finditer(rf"\b{re.escape(k)}\b", flat):
            before, after = flat[max(0, m.start() - 60): m.start()], flat[m.end(): m.end() + 40]
            if BORROWER_CONTEXT.search(before + " " + after) and not LENDER_CONTEXT.search(before[-30:]):
                hits.append(accts)
                break
    if len(hits) != 1:
        return None, "ambiguous" if hits else ""
    best = max(hits[0], key=lambda a: (roll.parcels[a]["sqft"], roll.parcels[a]["units"]))
    p = dict(roll.parcels[best])
    p["parcels"] = len(hits[0])
    return p, "the notice's borrower, the parcel's owner of record"


def match_notice(text: str, roll: Roll, office_addrs: set) -> tuple[dict | None, str]:
    """match_parcel with three checks for the newer counties. A parcel
    matched by street address must be in a city or ZIP code the notice names
    (the same number and street can exist in two towns). A parcel matched by
    its legal description must not contradict a street address the notice
    gives for the property (plat names repeat across sections, and Fort Bend's
    include whole towns). A survey match must be on the notice's first
    acreage, the tract's own: metes and bounds name the neighbors' acreages."""
    parcel, how = match_parcel(text, roll, office_addrs)
    if not parcel and how != "ambiguous":
        parcel, how = match_borrower(text, roll)
    if not parcel:
        return parcel, how
    up = text.upper()
    if how == "property address":
        if not (parcel["city"] and parcel["city"].upper() in up or parcel["zip"] and parcel["zip"] in up):
            return None, ""
        return parcel, how
    if how == "survey abstract and acreage":
        first = re.search(r"(\d{1,4}\.\d{2,4})\s*(?:ACRES?|AC\b)", NUMBER_WORDS.sub(r"\1", up))
        own = re.search(r"ACS\s+([\d.]+)", parcel["legal"])
        if not first or not own or abs(float(own.group(1)) - float(first.group(1))) > max(0.02, 0.01 * float(first.group(1))):
            return None, ""
    if not hasattr(roll, "zips"):
        roll.zips = {p["zip"] for p in roll.parcels.values() if p["zip"]}
    zips = roll.zips
    office = {(a[0], a[1].split()[0]) for a in office_addrs if a[1]}
    stated = {a for a in stated_addresses(text, zips) if a not in office}
    if stated and _addr_key(parcel["num"], parcel["street"]) not in stated:
        return None, ""
    return parcel, how


def notice_row(county: str, sale: str, parcel: dict, how: str, f: dict, **extra) -> dict:
    """One output row for a notice matched to a commercial parcel."""
    return {
        "county": county, "state": "TX", "saleDate": sale,
        "address": " ".join(x for x in (parcel["num"], title(parcel["street"])) if x), "city": title(parcel["city"]),
        "zip": parcel["zip"], "propertyName": "", "propertyType": parcel["type"], "use": parcel["use"],
        "sqft": parcel.get("sqft") or None, "units": None, "yearBuilt": None, "owner": clean_business(parcel["owner"]),
        "lender": f.get("lender", ""), "originalAmount": f.get("originalAmount"), "parcel": parcel["account"],
        "parcelUrl": parcel.get("url", ""), "parcels": parcel["parcels"], "matchedBy": how,
        "docNumber": "", "postingUrl": "", "postingPage": None, "postingLabel": "", **extra,
    }


# ---------------------------------------------------------------- Fort Bend

FBCAD = "https://gisweb.fbcad.org/arcgis/rest/services/Hosted/FBCADPublicData/FeatureServer/0/query"
FORT_BEND_LIST = "https://www.fortbendcountytx.gov/i-want-to/foreclosures"
# Fort Bend CAD codes (seen 2026-11-11). Improvement (building_sptb_code):
# F1 commercial, F2 industrial, B1 apartments, F1M and F1V commercial
# variants; F1H (homeowner-association amenities) and F1X (exempt owners)
# are left out, as are duplexes to fourplexes (B2, B3) and every residential,
# farm and mobile-home code. A parcel with no building counts when its land
# is coded F1 or F2 (commercial or industrial land).
FBCAD_BUILDING = {"F1": ("Commercial", ""), "F1M": ("Commercial", ""), "F1V": ("Commercial", ""),
                  "F2": ("Industrial", "Industrial"), "B1": ("Apartments", "Multifamily")}


def fbcad_legal(legal: str) -> tuple[str, str]:
    """Fort Bend CAD writes 'QUAIL VALLEY SEC 2, BLOCK 2, LOT 74' and
    '0193 JAS HODGE, ACRES 0.6461': rewritten in the roll's LT/BLK/RES/ABST
    form, with the plat name (the part before the first comma)."""
    up = re.sub(r"[\"'“”]", "", legal.upper())
    # The plat name, without the county's own name ("Fort Bend Town Center"
    # would otherwise be named by every notice's "Fort Bend County").
    plat = re.sub(r"\bFORT\s+BEND\b", " ", up.split(",")[0]).strip()
    blk = re.search(r"\b(?:BLOCK|BLK)\s+([A-Z0-9]{1,4})\b", up)
    lot = re.search(r"\bLOTS?\s+(\d+[A-Z]?)\b", up)
    res = re.search(r"\b(?:RESERVE|RES)\s+([A-Z0-9]{1,3})\b", up)
    acres = re.search(r"\bACRES\s+([\d.]+)", up)
    parts = []
    if lot and blk:
        parts.append(f"LT {lot.group(1)} BLK {blk.group(1)}")
    if res:
        parts.append(f"RES {res.group(1)}" + (f" BLK {blk.group(1)}" if blk else ""))
    m = re.match(r"(\d{3,4})\s+[A-Z]", up)
    if m:  # a survey: the leading number is the abstract
        parts.append(f"ABST {int(m.group(1))}")
        plat = ""
    if acres:
        parts.append(f"ACS {acres.group(1)}")
    return " ".join(parts), plat


def fort_bend_roll() -> Roll:
    """Commercial parcels from Fort Bend CAD's public parcel layer
    (gisweb.fbcad.org, FBCADPublicData), cached for a week."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "fortbend.json"
    if path.exists() and time.time() - path.stat().st_mtime < CAD_MAX_AGE_DAYS * 86400:
        rows = json.loads(path.read_text())
    else:
        rows, last = [], -1
        where = ("(building_sptb_code IN ('F1','F1M','F1V','F2','B1') OR "
                 "(building_sptb_code IS NULL AND land_state_code IN ('F1','F2')))")
        while True:
            q = urllib.parse.urlencode({
                "where": f"{where} AND objectid > {last}", "orderByFields": "objectid",
                "outFields": "objectid,quickrefid,propnumber,ownername,situs,situssno,situsprdir,situssnm,situsstp,situspodir,"
                             "legal,land_state_code,building_sptb_code,impvalue,landsizeac",
                "returnGeometry": "false", "resultRecordCount": 2000, "f": "json"})
            feats = json.loads(get(f"{FBCAD}?{q}", timeout=300)).get("features", [])
            if not feats:
                break
            rows.extend(f["attributes"] for f in feats)
            last = feats[-1]["attributes"]["objectid"]
            time.sleep(0.5)
        path.write_text(json.dumps(rows))
    roll = Roll()
    for r in rows:
        bcode, lcode = r.get("building_sptb_code"), r.get("land_state_code")
        if bcode:
            label, ptype = FBCAD_BUILDING.get(bcode, ("", None))
        elif lcode in ("F1", "F2") and not r.get("impvalue"):
            label, ptype = "Commercial land", "Land/Development"
        else:
            label, ptype = ("Industrial", "Industrial") if lcode == "F2" else ("Commercial", "")
        owner = (r.get("ownername") or "").strip()
        if ptype is None or GOV_OWNER.search(owner) or not r.get("quickrefid"):
            continue
        situs = r.get("situs") or ""
        m_city = re.search(r",\s*([^,]+?),\s*TX\s+(\d{5})", situs)
        street = " ".join(x for x in (r.get("situsprdir"), r.get("situssnm"), r.get("situsstp"), r.get("situspodir")) if x)
        num = (r.get("situssno") or "").strip()
        if not re.fullmatch(r"\d+", num):
            # Some parcels carry the number only in the situs line ("1 Sugar
            # Creek Center BLVD, Sugar Land"; "1601-1631 Austin ST").
            m_num = re.match(r"(\d+)(?:-\d+)?\s+(.+)$", situs.split(",")[0].strip())
            num, street = (m_num.group(1), m_num.group(2)) if m_num else ("", street)
        legal, plat = fbcad_legal(r.get("legal") or "")
        roll.add(r["quickrefid"], {
            "account": r["quickrefid"], "code": bcode or lcode, "use": label, "type": ptype, "name": "",
            "sqft": 0, "units": 0, "yearBuilt": 0, "num": num, "street": street,
            "city": m_city.group(1).strip() if m_city else "", "zip": m_city.group(2) if m_city else "", "owner": owner,
            "legal": legal, "subdivision": plat, "url": f"https://esearch.fbcad.org/Property/View/{r['quickrefid']}",
        })
    return roll


def fort_bend_source(today: dt.date, processed: set) -> list[dict]:
    """The Fort Bend County Clerk posts each sale month's notices as one PDF
    (the notices as filed, with a text layer), on or before the 20th of the
    month before the sale."""
    page = get(FORT_BEND_LIST).decode("utf-8", "replace")
    posts = []
    for href in sorted(set(re.findall(r'href="(https://www\.fortbendcountytx\.gov/sites/default/files/[^"]*/research-foreclosures/[^"]+\.pdf)"', page))):
        m = re.search(r"/([A-Za-z]+)-(\d{4})(?:_\d+)?\.pdf$", href)
        if not m:
            continue
        try:
            month = dt.datetime.strptime(m.group(1)[:3], "%b").month
        except ValueError:
            continue
        sale = first_tuesday(int(m.group(2)), month)
        if href in processed or sale < today - dt.timedelta(days=45):
            continue
        posts.append((href, sale, f"{m.group(1)} {m.group(2)}"))
    if not posts:
        return []
    roll = fort_bend_roll()
    print(f"fort bend: {len(roll.parcels)} commercial parcels on the appraisal roll", flush=True)
    rows = []
    for href, sale, label in posts:
        try:
            pages = pdf_pages(get(href, timeout=600))
        except Exception as e:
            print(f"  Fort Bend {label}: {e}", flush=True)
            continue
        notices = split_notices(pages)
        office = office_addresses([t for _, t in notices])
        found = 0
        for pg, text in notices:
            if CONSUMER.search(text):
                continue
            parcel, how = match_notice(text, roll, office)
            if not parcel:
                continue
            if rows and rows[-1]["parcel"] == parcel["account"] and rows[-1]["saleDate"] == sale.isoformat():
                continue  # a long notice can repeat its heading on a later page
            f = notice_fields(text)
            f.pop("_dates", None)
            rows.append(notice_row("Fort Bend", sale.isoformat(), parcel, how, f, postingUrl=href, postingPage=pg,
                                   sourceLabel=f"Fort Bend County Clerk foreclosure list, {label} sales, page {pg}"))
            found += 1
            print(f"  Fort Bend p{pg}: {rows[-1]['address']}, {rows[-1]['city']} ({parcel['code']}, {how})", flush=True)
        print(f"  Fort Bend {label}: {len(pages)} pages, {len(notices)} notices, {found} commercial", flush=True)
        processed.add(href)
    return rows


# ---------------------------------------------------------------- Williamson

WILCO = "https://apps.wilco.org/countyclerk/trustee_sales/"
WCAD = "https://data.wcad.org/resource"
# Williamson CAD state codes (data.wcad.org, seen 2026-11-11): F1 commercial,
# F2 industrial, B1 apartments, C5 commercial vacant land (WCAD's land type
# "Commercial"). A property also carrying a residential, farm, mobile-home,
# inventory or exempt code (A, D, E, M, O, X) is left out.
WCAD_KEEP = ("F1", "F2", "B1", "C5")
WCAD_DROP = re.compile(r"^[ADEMOX]")
# Williamson County cities as the clerk's index writes them.
WILCO_CITIES = ("ROUND ROCK", "CEDAR PARK", "LIBERTY HILL", "GEORGETOWN", "LEANDER", "HUTTO", "TAYLOR", "JARRELL",
                "AUSTIN", "FLORENCE", "GRANGER", "THRALL", "BARTLETT", "COUPLAND", "THORNDALE", "WEIR", "SPICEWOOD",
                "PFLUGERVILLE", "SCHWERTNER", "WALBURG", "NO CITY")


WCAD_USES = [
    (r"\bAPTS?\b|APARTMENT", ("Apartments", "Multifamily")),
    # WCAD often writes the flag instead of the use ("LA QUINTA").
    (r"\bHOTEL|\bMOTEL|\bINN\b|SUITES|LA QUINTA|HAMPTON|MARRIOTT|HILTON|HYATT|BEST WESTERN|SUPER 8|RED ROOF|"
     r"EXTENDED STAY|STAYBRIDGE|CANDLEWOOD|HOMEWOOD|TOWNEPLACE|SPRINGHILL|FAIRFIELD|RAMADA|WINGATE", ("Hotel", "Hospitality")),
    (r"MINI.?STORAGE|SELF.?STORAGE|MINI.?WAREHOUSE", ("Self storage", "Self-Storage")),
    (r"MEDICAL|DENTAL|CLINIC|SURGERY|HOSPITAL|VETERINAR", ("Medical office", "Medical Office")),
    (r"^(?!.*(?:WAREHOUSE|WHSE)).*(?:OFFICE|\bOFC\b|\bBANK\b)", ("Office", "Office")),
    (r"WAREHOUSE|WHSE|INDUSTRIAL|MANUFACTUR|HANGA?E?R", ("Industrial", "Industrial")),
    (r"RETAIL|STRIP|SHOPPING|RESTAURANT|STORE|CAR WASH|SERVICE STATION|CONVENIENCE|FAST FOOD", ("Retail", "Retail")),
    (r"\bMHP\b|MH PARK|MOBILE HOME|\bRV\b", ("Mobile home / RV park", "")),
]


def wcad_type(codes: set, desc: str, nbhd: str, built: bool) -> tuple[str, str]:
    """A property type from WCAD's own words: the main commercial building's
    description first ("LA QUINTA", "OFFICE WAREHOUSE"), then the appraisal
    neighborhood's ("R20EF - Fast Food Restaurant-e Round Rock")."""
    if not built and "C5" in codes:
        return "Commercial land", "Land/Development"
    if "B1" in codes:
        return "Apartments", "Multifamily"
    for text in (desc.upper(), "F2" if "F2" in codes else "", re.sub(r"^\S+\s+-\s+", "", nbhd).upper()):
        if text == "F2":
            return "Industrial", "Industrial"
        for pat, out in WCAD_USES:
            if text and re.search(pat, text):
                return out
    return "Commercial", ""


def williamson_roll() -> Roll:
    """Commercial properties from Williamson CAD's open data portal
    (data.wcad.org): land and improvement state codes, the property export
    (situs, legal description) and parcel owners, cached for a week."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / "williamson.json"

    def soda(ds: str, params: dict) -> list:
        time.sleep(0.3)
        return json.loads(get(f"{WCAD}/{ds}.json?" + urllib.parse.urlencode({"$limit": 50000, **params}), timeout=300))

    if path.exists() and time.time() - path.stat().st_mtime < CAD_MAX_AGE_DAYS * 86400:
        props = json.loads(path.read_text())
    else:
        keep = ",".join(f"'{c}'" for c in WCAD_KEEP)
        land = soda("2ckt-cqwj", {"$select": "propertyid,statecode", "$where": f"statecode in ({keep})"})
        props = {}
        for r in land:
            props.setdefault(r["propertyid"], {"codes": [], "imps": []})["codes"].append(r["statecode"])
        ids = sorted(props)
        for i in range(0, len(ids), 300):
            where = "propertyid in (" + ",".join(f"'{x}'" for x in ids[i:i + 300]) + ")"
            for r in soda("2ckt-cqwj", {"$select": "propertyid,statecode", "$where": f"{where} AND statecode not in ({keep})"}):
                props[r["propertyid"]]["codes"].append(r.get("statecode") or "")
            for r in soda("2huh-jk3y", {"$select": "propertyid,fsptb,fdescription,vtsgimp_comtotbldarea", "$where": where}):
                props[r["propertyid"]]["imps"].append([r.get("fsptb") or "", r.get("fdescription") or "",
                                                        float(r.get("vtsgimp_comtotbldarea") or 0)])
            for r in soda("ij43-xknu", {"$select": "propertyid,quickrefid,legaldesc,legallocationdesc,subblock,sublot,legalacres,"
                                                   "situsstreetnumber,situspredirectional,situsstreetname,situsstreetsuffix,"
                                                   "situspostdirectional,situscity,situszip,nbhddesc", "$where": where}):
                props[r["propertyid"]].update(r)
            for r in soda("an3x-cnmw", {"$select": "propertyid,ownernme1", "$where": where}):
                props[r["propertyid"]]["owner"] = r.get("ownernme1") or ""
        path.write_text(json.dumps(props))
    roll = Roll()
    for pid, p in props.items():
        codes = {c for c in p["codes"]} | {i[0] for i in p["imps"] if i[0]}
        owner = (p.get("owner") or "").strip()
        if not codes & set(WCAD_KEEP) or any(WCAD_DROP.match(c) for c in codes if c) or GOV_OWNER.search(owner) or not p.get("quickrefid"):
            continue
        com = [i for i in p["imps"] if i[0] in WCAD_KEEP]
        main = max(com, key=lambda i: i[2]) if com else ["", "", 0]
        label, ptype = wcad_type(codes, main[1], p.get("nbhddesc") or "", bool(com))
        street = " ".join(x for x in (p.get("situspredirectional"), p.get("situsstreetname"), p.get("situsstreetsuffix"),
                                      p.get("situspostdirectional")) if x)
        plat = re.sub(r"^[A-Z]{1,2}\d+\s*-\s*", "", p.get("legallocationdesc") or "", flags=re.I)
        legal = " ".join(x for x in (f"LT {p['sublot']}" if p.get("sublot") else "", f"BLK {p['subblock']}" if p.get("subblock") else "",
                                     plat.upper()) if x)
        m_ab = re.match(r"A[A-Z]?(\d{2,5})\b", p.get("legallocationdesc") or "")
        if m_ab and re.search(r"\bSUR\b", (p.get("legallocationdesc") or "").upper()):
            legal += f" ABST {int(m_ab.group(1))}" + (f" ACS {p['legalacres']}" if p.get("legalacres") else "")
            plat = ""
        roll.add(p["quickrefid"], {
            "account": p["quickrefid"], "code": "/".join(sorted(codes & set(WCAD_KEEP))), "use": label, "type": ptype, "name": "",
            "sqft": int(sum(i[2] for i in com)), "units": 0, "yearBuilt": 0,
            "num": (p.get("situsstreetnumber") or "").strip(), "street": street, "city": (p.get("situscity") or "").strip(),
            "zip": (p.get("situszip") or "")[:5], "owner": owner, "legal": legal, "subdivision": plat,
            "url": f"https://search.wcad.org/Property-Detail/PropertyQuickRefID/{p['quickrefid']}",
        })
    return roll


def williamson_index(pages: list[str]) -> list[dict]:
    """Rows of the clerk's alphabetical index (File_IDX): entry, owner's last
    name, file number, filing date, address, city, legal description."""
    text = "\n".join(pages)
    text = re.sub(r"(?m)^.*NOTICE OF FORECLOSURES\s*$|^ENTRY\s*$|^NO OWNER'S LAST NAME.*$|^DATE ADDRESS CITY LEGAL DESCRIPTION\s*$", "", text)
    text = re.sub(r"(?m)^(\d{1,3})\n", r"\1 ", text)  # an entry number can sit on a line of its own
    starts = list(re.finditer(r"(?m)^(\d{1,3})\s+([^\n]*?)\s(\d{1,3})\s(\d{1,2})/(\d{1,2})/(20\d\d)\s", text))
    out = []
    for k, m in enumerate(starts):
        rest = re.sub(r"\s+", " ", text[m.end(): starts[k + 1].start() if k + 1 < len(starts) else len(text)]).strip()
        # The city column is the first city name in the row ("NO CITY" when
        # there is none); a later one belongs to the legal description
        # ("LEGENDS OF HUTTO", "CITY OF BARTLETT").
        m_city = re.search(r"\b(" + "|".join(WILCO_CITIES) + r")\b", rest)
        city = m_city.group(1) if m_city else ""
        addr, legal = (rest[:m_city.start()], rest[m_city.end():]) if m_city else ("", rest)
        out.append({"entry": m.group(1), "owner": m.group(2).strip(), "file": int(m.group(3)),
                    "filed": f"{int(m.group(4)):02d}-{int(m.group(5)):02d}-{m.group(6)}",
                    "address": addr.strip(" ,"), "city": "" if city == "NO CITY" else city, "legal": legal.strip(" ,")})
    return out


def williamson_source(today: dt.date, processed: set) -> list[dict]:
    """The Williamson County Clerk posts each sale month's notices (scanned
    PDFs) with a text index giving each notice's address, city and legal
    description. The index is matched to the commercial roll; a matched
    notice, or one whose index entry gives nothing to match, is read by OCR
    for its lender, its loan and its property description."""
    page = get(WILCO).decode("utf-8", "replace")
    months = []
    for m in re.finditer(r'href="([A-Za-z]+)/files\.aspx"[^>]*>\s*([A-Z][a-z]+ \d{1,2}, \d{4})\s*<', page):
        sale = dt.datetime.strptime(m.group(2), "%B %d, %Y").date()
        if today - dt.timedelta(days=45) <= sale <= today + dt.timedelta(days=75):
            months.append((m.group(1), sale))
    can_ocr = ocr_available()
    roll = None
    rows, skipped = [], 0
    for folder, sale in months:
        base = urllib.parse.urljoin(WILCO, f"{folder}/")
        listing = get(base + "files.aspx").decode("utf-8", "replace")
        files = set(re.findall(r'HREF="(\d\d-\d\d-\d{4}_File_\w+\.pdf)"', listing, re.I))
        idx = sorted((f for f in files if f.upper().endswith("_FILE_IDX.PDF")),
                     key=lambda f: dt.datetime.strptime(f[:10], "%m-%d-%Y"))
        if not idx:
            continue
        entries = williamson_index(pdf_pages(get(base + idx[-1])))
        new = [e for e in entries if f"williamson:{e['filed']}_File_{e['file']:03d}" not in processed]
        print(f"  Williamson {sale}: {len(entries)} notices indexed, {len(new)} new", flush=True)
        if not new:
            continue
        if roll is None:
            roll = williamson_roll()
            print(f"williamson: {len(roll.parcels)} commercial parcels on the appraisal roll", flush=True)
        for e in new:
            name = f"{e['filed']}_File_{e['file']:03d}"
            if f"{name}.pdf" not in files:
                continue  # not posted yet (or renamed): try again next run
            key, url = f"williamson:{name}", base + f"{name}.pdf"
            has_addr = bool(re.match(r"\d", e["address"]))
            text = (f"Property address: {e['address']}, {e['city']}, Texas\n" if has_addr else "") + e["legal"]
            parcel, how = match_parcel(text, roll, set())
            if parcel and e["city"] and parcel["city"].upper() != e["city"]:
                parcel = None
            # "NO ADDRESS ... SEE INSTRUMENT": the index gives nothing to
            # match, so the notice itself is read.
            vague = not has_addr and not re.search(r"\b(?:LOT|UNIT|TRACT)\b", e["legal"])
            if not parcel and not vague:
                processed.add(key)  # residential, or not on the commercial roll
                continue
            # The notice itself is read before anything is kept: it can show a
            # home loan (CONSUMER) on a parcel coded commercial. Without OCR
            # the entry waits for a run that has it.
            if not can_ocr:
                skipped += 1
                continue
            try:
                time.sleep(1)
                notice = "\n".join(ocr_pdf(get(url), max_pages=4))
            except Exception as ex:
                print(f"  Williamson {name}: {ex}", flush=True)
                continue
            processed.add(key)
            if CONSUMER.search(notice):
                continue
            if not parcel:
                parcel, how = match_notice(notice, roll, set())
                if not parcel:
                    continue
            f = notice_fields(notice)
            f.pop("_dates", None)
            rows.append(notice_row("Williamson", sale.isoformat(), parcel, how, f, docNumber=name.replace("_", " "),
                                   postingUrl=url, sourceLabel=f"Williamson County Clerk notice of trustee's sale, {sale:%B %Y} sales, {name.replace('_', ' ')}"))
            print(f"  Williamson {name}: {rows[-1]['address']}, {rows[-1]['city']} ({parcel['code']}, {how})", flush=True)
    if skipped:
        print(f"  Williamson: {skipped} notices left unread (no OCR available)", flush=True)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", help="parse local Dallas PDFs named <Month>_<City>_N.pdf instead of fetching")
    ap.add_argument("--only", help="run one source (dallas, bexar, harris, collin, fortbend, williamson)")
    ap.add_argument("--limit", type=int, help="read at most this many new Harris notices (testing)")
    args = ap.parse_args()
    today = dt.date.today()
    prev = json.loads(OUT.read_text()) if OUT.exists() else {"properties": [], "processed": []}
    processed = set(prev.get("processed", []))
    sources = {"dallas": lambda: dallas_source(today, processed, args.pdf_dir), "bexar": lambda: bexar_source(today, processed),
               "harris": lambda: harris_source(today, processed, args.limit), "collin": lambda: collin_source(today, processed),
               "fortbend": lambda: fort_bend_source(today, processed), "williamson": lambda: williamson_source(today, processed)}
    rows, failed = [], []
    for name, fn in sources.items():
        if args.only and name != args.only:
            continue
        try:
            rows.extend(fn())
        except Exception as e:  # one county's outage never stops the others
            print(f"{name}: FAILED {e}", flush=True)
            failed.append(name)
    # Merge with earlier runs: one row per parcel and sale date.
    by_key = {(r["parcel"], r["saleDate"]): r for r in prev.get("properties", [])}
    for r in rows:
        r["slug"] = slug_for(r)
        r["firstSeen"] = by_key.get((r["parcel"], r["saleDate"]), {}).get("firstSeen", today.isoformat())
        by_key[(r["parcel"], r["saleDate"])] = r
    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    props = sorted((r for r in by_key.values() if r["saleDate"] >= cutoff), key=lambda r: (r["saleDate"], r["city"], r["address"]), reverse=True)
    if args.pdf_dir:
        print(json.dumps(props, indent=1))
        return
    OUT.write_text(json.dumps({"generated": today.isoformat(), "properties": props, "processed": sorted(processed)[-8000:]}, indent=1) + "\n")
    print(f"wrote {OUT.name}: {len(props)} properties", flush=True)
    if failed:
        sys.exit(f"failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
