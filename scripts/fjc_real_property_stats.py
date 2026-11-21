#!/usr/bin/env python3
"""Federal real-property case outcomes from the FJC Integrated Database (2026-11-20).

For calculator calibration (Jeff: "the calculator actually needs state court
judgments ... and appellate rulings"; item 2 of the plan). Reads the Federal
Judicial Center's public civil file (cv88on.zip, from
fjc.gov/research/idb) as a stream and tallies how federal real-property
suits between businesses ended: settled, dismissed, default, judgment on
motion, trial, and for whom.

Scope, kept commercial on its face as far as this data allows:
  - nature of suit 210 condemnation, 220 foreclosure, 230 rent/lease/
    ejectment, 240 torts to land, 245 tort product liability, 290 other
    real property;
  - filed 2000 or later and terminated;
  - first-listed plaintiff AND defendant both look like businesses (LLC,
    Inc, bank, trust, partnership...); the federal government as plaintiff
    and individuals on either side drop out. Residential cases are mostly
    individuals, so this removes most of them, though not provably all.

Not used: AMTREC (amount received), which the FJC itself advises against
using, and DEMANDED is reported only as a rough indication (in thousands,
capped at 9999, not reliably reported). No party names are written out;
the output (case_valuation_project/data/research/fjc/, gitignored) is
totals only.

  python3 scripts/fjc_real_property_stats.py
"""

import collections
import json
import pathlib
import re
import statistics
import subprocess
from datetime import date

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / "case_valuation_project" / "data" / "research" / "fjc"
NOS = {"210": "condemnation", "220": "foreclosure", "230": "rent-lease-ejectment", "240": "torts-to-land",
       "245": "tort-product-liability", "290": "other-real-property"}
DISTRICT_STATE = {
    "00": "ME", "01": "MA", "02": "NH", "03": "RI", "04": "PR", "05": "CT", "06": "NY", "07": "NY", "08": "NY", "09": "NY",
    "10": "VT", "11": "DE", "12": "NJ", "13": "PA", "14": "PA", "15": "PA", "16": "MD", "17": "NC", "18": "NC", "19": "NC",
    "20": "SC", "22": "VA", "23": "VA", "24": "WV", "25": "WV", "26": "AL", "27": "AL", "28": "AL", "29": "FL", "3A": "FL",
    "3C": "FL", "3E": "GA", "3G": "GA", "3J": "GA", "3L": "LA", "3N": "LA", "36": "LA", "37": "MS", "38": "MS", "39": "TX",
    "40": "TX", "41": "TX", "42": "TX", "43": "KY", "44": "KY", "45": "MI", "46": "MI", "47": "OH", "48": "OH", "49": "TN",
    "50": "TN", "51": "TN", "52": "IL", "53": "IL", "54": "IL", "55": "IN", "56": "IN", "57": "WI", "58": "WI", "60": "AR",
    "61": "AR", "62": "IA", "63": "IA", "64": "MN", "65": "MO", "66": "MO", "67": "NE", "68": "ND", "69": "SD", "7-": "AK",
    "70": "AZ", "71": "CA", "72": "CA", "73": "CA", "74": "CA", "75": "HI", "76": "ID", "77": "MT", "78": "NV", "79": "OR",
    "80": "WA", "81": "WA", "82": "CO", "83": "KS", "84": "NM", "85": "OK", "86": "OK", "87": "OK", "88": "UT", "89": "WY",
    "90": "DC", "91": "VI", "93": "GU", "94": "MP"}
BUSINESS = re.compile(r"\b(LLC|L\.L\.C|INC|CORP|CORPORATION|CO|COMPANY|BANK|N\.?A|FSB|TRUST|TRUSTEE|LP|L\.P|LLP|LTD|PARTNERS|"
                      r"PARTNERSHIP|HOLDINGS?|ASSOCIATES|REALTY|PROPERT(Y|IES)|GROUP|FUND|CAPITAL|MORTGAGE|CREDIT UNION|"
                      r"INVESTMENTS?|DEVELOPMENT|VENTURES?|ENTERPRISES|MANAGEMENT|FINANCIAL|INSURANCE|ASSN|ASSOCIATION)\b")
GOVERNMENT = re.compile(r"\b(UNITED STATES|USA|U\.S\.A|AMERICA|SECRETARY|HUD|USDA|SMALL BUSINESS ADMIN|FDIC|RESOLUTION TRUST)\b")
# Residential markers (2026-11-20 spot check): Nevada HOA-sale quiet-title suits, home-loan servicers,
# GSEs, MERS and RMBS trusts. A case with either party matching is dropped.
RESIDENTIAL = re.compile(r"\b(SFR INVESTMENTS|SATICOY|HOMEOWNERS|HOME OWNERS|HOA|OWNERS ASS|COMMUNITY ASS|CONDOMINIUM|CONDO|"
                         r"NATIONSTAR|OCWEN|PHH|CARRINGTON|LAKEVIEW LOAN|SHELLPOINT|SPECIALIZED LOAN|BAYVIEW|SELECT PORTFOLIO|"
                         r"DITECH|NEWREZ|MR\.? COOPER|PENNYMAC|QUICKEN|ROCKET MORTGAGE|LOANCARE|CENLAR|RUSHMORE|FAY SERVICING|"
                         r"ROUNDPOINT|SETERUS|GREEN TREE|HOME LOAN|HOME MORTGAGE|FEDERAL NATIONAL MORT|FANNIE|FEDERAL HOME LOAN MORT|"
                         r"FREDDIE|MORTGAGE ELECTRONIC|MERS|PASS[- ]THROUGH|CERTIFICATEHOLDERS|ASSET[- ]BACKED|SECURITIES CORP|"
                         r"MORTGAGE LOAN TRUST|MORTGAGE TRUST|LOAN SERVICING|REVERSE MORTGAGE|HOMES?\b)")
DISP = {"13": "settled", "12": "dismissed-voluntarily", "2": "dismissed-want-of-prosecution", "3": "dismissed-lack-of-jurisdiction",
        "14": "dismissed-other", "4": "default-judgment", "5": "consent-judgment", "6": "judgment-on-motion", "7": "jury-verdict",
        "8": "directed-verdict", "9": "court-trial", "15": "arbitration-award", "16": "stayed-for-bankruptcy", "17": "judgment-other",
        "18": "statistical-closing", "1": "remanded-to-state-court", "0": "transferred", "10": "mdl-transfer"}
JUDGMENT_DISP = {"4", "5", "6", "7", "8", "9", "15", "17"}
WINNER = {"1": "plaintiff", "2": "defendant", "3": "both"}


def is_business(name):
    n = (name or "").upper()
    return bool(BUSINESS.search(n)) and not GOVERNMENT.search(n)


def parse_date(s):
    try:
        m, d, y = s.split("/")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def main():
    proc = subprocess.Popen(["unzip", "-p", str(DIR / "cv88on.zip")], stdout=subprocess.PIPE, text=True, encoding="latin-1")
    header = proc.stdout.readline().rstrip("\n").split("\t")
    ix = {h: i for i, h in enumerate(header)}
    latest = {}
    rows = 0
    for line in proc.stdout:
        rows += 1
        f = line.rstrip("\n").split("\t")
        if len(f) < len(header) or f[ix["NOS"]] not in NOS:
            continue
        filed = parse_date(f[ix["FILEDATE"]])
        if not filed or filed.year < 2000:
            continue
        key = (f[ix["DISTRICT"]], f[ix["OFFICE"]], f[ix["DOCKET"]], f[ix["FILEDATE"]])
        tape = f[ix["TAPEYEAR"]]
        if key not in latest or tape >= latest[key][0]:
            latest[key] = (tape, f)
    proc.wait()
    print(f"{rows:,} rows read; {len(latest):,} real-property cases filed since 2000")

    def blank():
        return {"cases": 0, "disposition": collections.Counter(), "judgments": 0, "winner": collections.Counter(),
                "days": [], "demanded_thousands": [], "trial": 0}

    total = collections.defaultdict(blank)
    by_state = collections.defaultdict(blank)
    kept = skipped_parties = residential = pending = 0
    for tape, f in latest.values():
        disp = f[ix["DISP"]]
        term = parse_date(f[ix["TERMDATE"]])
        if not term or disp in ("-8", ""):
            pending += 1
            continue
        if not (is_business(f[ix["PLT"]]) and is_business(f[ix["DEF"]])):
            skipped_parties += 1
            continue
        if RESIDENTIAL.search(f[ix["PLT"]].upper()) or RESIDENTIAL.search(f[ix["DEF"]].upper()):
            residential += 1
            continue
        kept += 1
        nos = NOS[f[ix["NOS"]]]
        state = DISTRICT_STATE.get(f[ix["DISTRICT"]].strip().zfill(2) if f[ix["DISTRICT"]].strip().isdigit() else f[ix["DISTRICT"]].strip(), "?")
        for bucket in (total[nos], by_state[(nos, state)]):
            bucket["cases"] += 1
            bucket["disposition"][DISP.get(disp, "other")] += 1
            if disp in JUDGMENT_DISP:
                bucket["judgments"] += 1
                w = WINNER.get(f[ix["JUDGMENT"]])
                if w:
                    bucket["winner"][w] += 1
            if disp in ("7", "8", "9"):
                bucket["trial"] += 1
            filed = parse_date(f[ix["FILEDATE"]])
            if filed and term >= filed:
                bucket["days"].append((term - filed).days)
            try:
                dem = int(f[ix["DEMANDED"]])
                if 0 < dem < 9999:
                    bucket["demanded_thousands"].append(dem)
            except ValueError:
                pass

    def finish(b):
        n = b["cases"]
        decided = sum(b["winner"].values())
        out = {"cases": n,
               "disposition_pct": {k: round(100 * v / n, 1) for k, v in b["disposition"].most_common()},
               "judgments": b["judgments"],
               "judgment_winner_pct": {k: round(100 * v / decided, 1) for k, v in b["winner"].most_common()} if decided else {},
               "winner_known": decided,
               "trial_pct": round(100 * b["trial"] / n, 1) if n else None,
               "median_days_to_close": int(statistics.median(b["days"])) if b["days"] else None}
        if len(b["demanded_thousands"]) >= 20:
            q = statistics.quantiles(b["demanded_thousands"], n=4)
            out["demanded_thousands_quartiles"] = [round(q[0]), round(statistics.median(b["demanded_thousands"])), round(q[2])]
            out["demanded_n"] = len(b["demanded_thousands"])
        return out

    result = {
        "source": "FJC Integrated Database, civil cases 1988-present (cv88on.zip, file dated 2026-08-26); filed 2000+, terminated; first-listed plaintiff and defendant both businesses; government plaintiffs excluded.",
        "caveats": ["DEMANDED is in thousands, capped at 9999 and not reliably reported; treat as rough.",
                    "AMTREC (amount received) not used: the FJC advises against it.",
                    "Business-name filter plus residential markers (HOA-sale suits, home-loan servicers, GSEs, MERS, RMBS trusts) keep mostly commercial cases, but not provably all."],
        "counts": {"kept": kept, "skipped_not_business_v_business": skipped_parties,
                   "skipped_residential_markers": residential, "pending_or_no_disposition": pending},
        "by_case_type": {k: finish(v) for k, v in sorted(total.items())},
        "by_case_type_and_state": {f"{k[0]}|{k[1]}": finish(v) for k, v in sorted(by_state.items()) if v["cases"] >= 30},
    }
    (DIR / "real-property-stats.json").write_text(json.dumps(result, indent=1))
    print(json.dumps({"counts": result["counts"], "by_case_type": result["by_case_type"]}, indent=1))
    print(f"{len(result['by_case_type_and_state'])} case-type/state slices with 30+ cases")


if __name__ == "__main__":
    main()
