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


def title(s: str) -> str:
    s = re.sub(r"\s+", " ", s).strip()
    keep = re.compile(r"^(LLC|LP|LLP|LTD|INC|NA|II|III|IV|USA|TX|[A-Z]{1,2}\d+|\d+[A-Z]?)$")
    out = []
    for w in s.split(" "):
        core = w.strip(",.&()")
        out.append(w if keep.match(core.upper().replace(".", "")) and core.isupper() else w.capitalize() if w.isupper() else w)
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
                "AND", "CITY", "DALLAS", "COUNTY", "TEXAS", "UNIT", "NO"}
# Consumer-mortgage markers: a notice carrying one is a home loan whatever
# parcel its legal description seems to match.
CONSUMER = re.compile(r"Loan\s+Type\s*:?\s*(?:FHA|VA|USDA|Conventional)|MORTGAGE\s+ELECTRONIC\s+REGISTRATION|\bMERS\b|"
                      r"reverse\s+mortgage|home\s+equity|homestead|Freedom\s+Mortgage|PennyMac|Rocket\s+Mortgage|"
                      r"Lakeview\s+Loan|NewRez|Shellpoint|Carrington\s+Mortgage|Nationstar|Mr\.?\s+Cooper|LoanCare|"
                      r"Midland\s+Mortgage|Cenlar|Selene\s+Finance|Specialized\s+Loan\s+Servicing|Select\s+Portfolio", re.I)

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


def match_parcel(text: str, roll: Roll, office_addrs: set) -> tuple[dict | None, str]:
    """The commercial parcel a notice describes, and how it was matched."""
    up = text.upper()
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
    for m in re.finditer(r"\bLO[T1]S?\.?\s*(\d+[A-Z]?)\W{1,4}(?:IN\s+)?BLO?CK\.?\s*([A-Z0-9]{1,4})\b", up):
        near = up[m.end(): m.end() + 200]
        if re.match(r"\s*/\s*\d{3,5}", near):  # a Dallas city block: handled above
            continue
        for a in roll.by_blklot.get((m.group(2), m.group(1)), []):
            words = [w for w in re.findall(r"[A-Z]{3,}", roll.parcels[a]["subdivision"].upper()) if w not in SUBDIV_NOISE]
            if words and all(w in near for w in words):
                hits.setdefault(a, "subdivision block and lot")
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


AMOUNT = re.compile(r"original\s+(?:principal\s+)?(?:amount|sum)\s+of\s+\$\s?([\d,]+(?:\.\d{2})?)", re.I)
AMOUNT_AFTER = re.compile(r"\$\s?([\d,]{5,}(?:\.\d{2})?)\s+in\s+the\s+original\s+principal", re.I)
PAYEE = re.compile(r"payable\s+to\s+the\s+order\s+of\s+([A-Z0-9][A-Za-z0-9 ,.&'\-]{3,80}?(?:L\.?L\.?C\.?|Inc\.?|N\.A\.|Bank|L\.?P\.?|Corporation|Company|Trust))\b")
LENDER_LABEL = re.compile(r"(?:Current\s+(?:Beneficiary|Mortgagee)[^:\n]*|Lender|Beneficiary|Mortgagee|Holder)\s*:\s*([^\n]{4,90})", re.I)


def notice_fields(text: str) -> dict:
    out: dict = {}
    m = AMOUNT.search(re.sub(r"\s+", " ", text)) or AMOUNT_AFTER.search(re.sub(r"\s+", " ", text))
    if m:
        v = float(m.group(1).replace(",", ""))
        if v >= 10000:
            out["originalAmount"] = v
    flat = re.sub(r"\s+", " ", text)
    for m in [*LENDER_LABEL.finditer(text), *PAYEE.finditer(flat)]:
        name = clean_business(m.group(1).split("  ")[0])
        if name and not re.search(r"MORTGAGE ELECTRONIC|MERS", name, re.I):
            out["lender"] = name
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
        name = title(re.sub(r"\s*\(.*?\)", "", parcel["name"])) if parcel["name"] and not GENERIC_NAME.search(parcel["name"]) and not re.match(r"\d", parcel["name"]) else ""
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
    # A street address in many notices is a trustee's or law firm's office
    # (or the courthouse, where sales are held), never the property's.
    seen: dict[tuple, set] = {}
    for post, pages in texts:
        for m in re.finditer(r"\b(\d{2,6})\s+([A-Za-z][A-Za-z .]{2,30})", "\n".join(pages)):
            seen.setdefault((m.group(1), norm_street(m.group(2))), set()).add(post["url"])
    office = {k for k, n in seen.items() if len(n) >= 3}
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
                "propertyName": title(dba) if dba and not GENERIC_NAME.search(dba) else "", "propertyType": ptype,
                "use": label, "sqft": int(float(p.get("GBA") or 0)) or None, "units": int(units.group(1)) if units else None,
                "yearBuilt": int(float(p.get("YrBlt") or 0)) or None, "owner": clean_business(str(p.get("Owner") or "")),
                "lender": "", "originalAmount": None, "parcel": str(int(p["PropID"])),
                "parcelUrl": f"https://bexar.trueautomation.com/clientdb/Property.aspx?cid=110&prop_id={int(p['PropID'])}",
                "parcels": 1, "matchedBy": "the notice's mapped location", "docNumber": str(a.get("DOC_NUMBER") or ""),
                "postingUrl": "https://maps.bexar.org/foreclosures/", "postingPage": None, "postingLabel": "",
            })
        print(f"  Bexar {year}-{month:02d}: {len(feats)} notices, {new} new", flush=True)
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pdf-dir", help="parse local Dallas PDFs named <Month>_<City>_N.pdf instead of fetching")
    ap.add_argument("--only", help="run one source (dallas, bexar)")
    args = ap.parse_args()
    today = dt.date.today()
    prev = json.loads(OUT.read_text()) if OUT.exists() else {"properties": [], "processed": []}
    processed = set(prev.get("processed", []))
    sources = {"dallas": lambda: dallas_source(today, processed, args.pdf_dir), "bexar": lambda: bexar_source(today, processed)}
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
