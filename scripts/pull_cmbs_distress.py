#!/usr/bin/env python3
"""CMBS Distress Watch (2026-11-06): commercial properties that a CMBS
trust's servicer newly reports as in foreclosure, bank-owned (REO), in
bankruptcy or taken by deed in lieu of foreclosure.

Jeff, 2026-11-05: state court coverage is "a critical blind spot that has to
be addressed". Most of that is out of reach for free, but every CMBS trust
issued since 2017 files its whole loan tape with the SEC each month (Form
ABS-EE, Exhibit 102, Regulation AB Item 1125 Schedule AL). Comparing a
trust's report with its previous one shows each property whose loan has
just moved into foreclosure, bankruptcy or REO, with the property's name and
address, nationwide, from a public filing. These are servicer-reported loan
events, not court filings: no case number, and a month or two behind the
underlying event.

Codes (SEC EDGAR ABS XML Technical Specification, eis_ABS_CMBSAssetData.xsd):
  workoutStrategyCode  Item 2(j): 2 Foreclosure, 3 Bankruptcy, 7 REO,
                       10 Deed-in-lieu of Foreclosure
  propertyStatusCode   Item 2(d)(22): 1 In Foreclosure, 2 REO
  propertyTypeCode     Item 2(d)(7); CH (cooperative housing) and SE
                       (securities) are not commercial property and are dropped.

Only data.sec.gov and www.sec.gov are read, within the SEC's fair-access
limit (under 10 requests a second, contact in the User-Agent). The output
carries property and trust names only: no borrower, guarantor or tenant.

  python3 scripts/pull_cmbs_distress.py            # last 10 days of filings, merge
  python3 scripts/pull_cmbs_distress.py --days 60  # backfill
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from ingest_court_filings import slugify  # noqa: E402

OUT = pathlib.Path(__file__).resolve().parent.parent / "ops" / "cmbs-distress.json"
UA = "CREdocket CMBS distress watch admin@credocket.com"  # SEC requires a contact in the User-Agent
KEEP_DAYS = 400
NS = "{http://www.sec.gov/edgar/document/absee/cmbs/assetdata}"

WORKOUT = {"2": "foreclosure", "3": "bankruptcy", "7": "reo", "10": "deed-in-lieu"}
PROPERTY_STATUS = {"1": "foreclosure", "2": "reo"}
# Later stages outrank earlier ones when a loan and its property disagree.
RANK = {"bankruptcy": 1, "foreclosure": 2, "deed-in-lieu": 3, "reo": 4}
EVENT_LABEL = {
    "foreclosure": "In foreclosure",
    "bankruptcy": "Borrower in bankruptcy",
    "deed-in-lieu": "Deed in lieu of foreclosure",
    "reo": "Bank-owned (REO)",
}
PAYMENT_STATUS = {  # Item 2(e)(17)
    "0": "Current", "1": "30-59 days delinquent", "2": "60-89 days delinquent", "3": "90+ days delinquent",
    "4": "Matured balloon, performing", "5": "Matured balloon, not performing",
    "A": "Payment not yet due or in grace period", "B": "Late, under 30 days",
}
PROPERTY_TYPES = {
    "HC": "Healthcare", "IN": "Industrial", "LO": "Hospitality", "MF": "Multifamily",
    "MH": "Manufactured housing community", "MU": "Mixed-Use", "OF": "Office", "RT": "Retail",
    "SS": "Self-Storage", "WH": "Industrial", "ZZ": "Not stated", "98": "Other",
}

_last = 0.0


def get(url: str, limit: int | None = None) -> bytes:
    """GET with the SEC's fair-access spacing; `limit` reads only the first bytes."""
    global _last
    wait = 0.15 - (time.monotonic() - _last)
    if wait > 0:
        time.sleep(wait)
    _last = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.read(limit) if limit else r.read()
        except Exception:
            if attempt == 2:
                raise
            time.sleep(5 * (attempt + 1))
    raise RuntimeError("unreachable")


def abs_ee_filings(days: int) -> dict[str, dict]:
    """ABS-EE filings in the EDGAR daily form indexes, keyed by accession number."""
    found: dict[str, dict] = {}
    today = dt.date.today()
    for n in range(days, -1, -1):
        d = today - dt.timedelta(days=n)
        if d.weekday() >= 5:
            continue
        q = (d.month - 1) // 3 + 1
        url = f"https://www.sec.gov/Archives/edgar/daily-index/{d.year}/QTR{q}/form.{d:%Y%m%d}.idx"
        try:
            text = get(url).decode("latin-1")
        except Exception:
            continue  # holiday or not yet posted
        for line in text.splitlines():
            if not line.startswith("ABS-EE"):
                continue
            m = re.match(r"(ABS-EE(?:/A)?)\s+(.+?)\s{2,}(\d+)\s+(\d{8})\s+(\S+)", line)
            if not m:
                continue
            form, name, cik, filed, path = m.groups()
            acc = pathlib.Path(path).stem
            row = found.setdefault(acc, {"accession": acc, "form": form, "filed": f"{filed[:4]}-{filed[4:6]}-{filed[6:]}", "ciks": {}})
            row["ciks"][int(cik)] = name.strip()
    return found


def exhibit_102(cik: int, acc: str) -> str | None:
    """URL of the filing's Exhibit 102 XML, if it is a CMBS asset data file."""
    base = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc.replace('-', '')}"
    items = json.loads(get(base + "/index.json"))["directory"]["item"]
    names = [i["name"] for i in items if i["name"].lower().endswith(".xml") and "102" in i["name"]]
    if not names:
        return None
    url = f"{base}/{names[0]}"
    head = get(url, limit=1500).decode("latin-1", "replace")
    return url if "absee/cmbs/assetdata" in head else None


def earlier_abs_ee(cik: int, acc: str) -> list[str]:
    """The trust's ABS-EE filings (amendments included) filed before `acc`, newest first."""
    sub = json.loads(get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json"))
    r = sub["filings"]["recent"]
    accs = [a for f, a in zip(r["form"], r["accessionNumber"]) if f in ("ABS-EE", "ABS-EE/A")]
    return accs[accs.index(acc) + 1:] if acc in accs else []


def period_end(tape: dict[str, dict]) -> str:
    ends = [l["periodEnd"] for l in tape.values() if l["periodEnd"]]
    return max(set(ends), key=ends.count) if ends else ""


def txt(el, tag: str) -> str:
    x = el.find(NS + tag)
    return (x.text or "").strip() if x is not None and x.text else ""


def num(el, tag: str) -> float | None:
    try:
        return float(txt(el, tag))
    except ValueError:
        return None


def iso(us: str) -> str:
    m = re.match(r"(\d{2})-(\d{2})-(\d{4})$", us)
    return f"{m.group(3)}-{m.group(1)}-{m.group(2)}" if m else ""


def loan_tape(xml: bytes) -> dict[str, dict]:
    """assetNumber -> the loan's distress stage and properties."""
    root = ET.fromstring(xml)
    loans: dict[str, dict] = {}
    for a in root.iter(NS + "assets"):
        key = txt(a, "assetNumber")
        props = []
        for p in a.findall(NS + "property"):
            props.append({
                "name": txt(p, "propertyName"), "address": txt(p, "propertyAddress"), "city": txt(p, "propertyCity"),
                "state": txt(p, "propertyState"), "zip": txt(p, "propertyZip")[:5], "county": txt(p, "propertyCounty"),
                "typeCode": txt(p, "propertyTypeCode"), "status": PROPERTY_STATUS.get(txt(p, "propertyStatusCode")),
            })
        stages = [s for s in [WORKOUT.get(txt(a, "workoutStrategyCode"))] + [p["status"] for p in props] if s]
        loans[key] = {
            "stage": max(stages, key=RANK.get) if stages else None,
            "properties": props,
            "periodEnd": iso(txt(a, "reportingPeriodEndDate")),
            "balance": num(a, "reportPeriodEndActualBalanceAmount"),
            "originalLoanAmount": num(a, "originalLoanAmount"),
            "paidThrough": iso(txt(a, "paidThroughDate")),
            "paymentStatus": PAYMENT_STATUS.get(txt(a, "paymentStatusLoanCode"), ""),
            "specialServicingSince": iso(txt(a, "mostRecentSpecialServicerTransferDate")),
            "valuation": num(a, "mostRecentValuationAmount"),
            "valuationDate": iso(txt(a, "mostRecentValuationDate")),
        }
    return loans


def events_for(filing: dict) -> list[dict]:
    # A depositor and its trust can share one accession; the trust is the newer (higher) CIK.
    cik = max(filing["ciks"])
    trust = filing["ciks"][cik]
    cur_url = exhibit_102(cik, filing["accession"])
    if not cur_url:
        return []
    cur = loan_tape(get(cur_url))
    end = period_end(cur)
    # The report for the month before: trusts sometimes file two months a day
    # apart, or amend a month, so match on the reporting period, not the order.
    prev = None
    for acc in earlier_abs_ee(cik, filing["accession"])[:4]:
        url = exhibit_102(cik, acc)
        tape = loan_tape(get(url)) if url else None
        if tape and period_end(tape) and period_end(tape) < end:
            prev = tape
            break
    if prev is None:
        return []  # a first report: nothing to say what is new
    out = []
    for key, loan in cur.items():
        stage = loan["stage"]
        before = prev.get(key)
        if not stage or before is None or before["stage"] == stage or before["stage"] == "reo":
            continue
        props = [p for p in loan["properties"] if p["typeCode"] not in ("CH", "SE")]
        if not props or not props[0]["name"]:
            continue
        first = props[0]
        out.append({
            "event": stage, "eventLabel": EVENT_LABEL[stage], "previous": before["stage"],
            "propertyName": first["name"], "address": first["address"], "city": first["city"].title() if first["city"].isupper() else first["city"],
            "state": first["state"], "zip": first["zip"], "county": first["county"],
            "propertyType": PROPERTY_TYPES.get(first["typeCode"], "Other"),
            "propertyCount": len(props),
            "otherProperties": [f'{p["name"]}, {p["city"]}, {p["state"]}' for p in props[1:11]],
            "trust": trust, "trustCik": cik, "loanId": key,
            "balance": loan["balance"], "originalLoanAmount": loan["originalLoanAmount"],
            "paidThrough": loan["paidThrough"], "paymentStatus": loan["paymentStatus"], "specialServicingSince": loan["specialServicingSince"],
            "valuation": loan["valuation"], "valuationDate": loan["valuationDate"],
            "reportingPeriodEnd": loan["periodEnd"], "filed": filing["filed"], "accession": filing["accession"],
            "filingUrl": f"https://www.sec.gov/Archives/edgar/data/{cik}/{filing['accession'].replace('-', '')}/",
        })
    return out


def norm(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


NAME_NOISE = {"the", "at", "of", "and", "by", "hilton", "marriott", "inn", "suites", "hotel", "apartments", "center",
              "office", "building", "plaza", "portfolio", "wisconsin", "tower"}


def same_property(a: dict, b: dict) -> bool:
    """Two trusts' reports of one property: same city and state, and the same
    street number or most of the same distinctive name words (servicers spell
    names differently: "Summit Place" / "SUMMIT PLACE WISCONSIN")."""
    if norm(a["city"]) != norm(b["city"]) or a["state"] != b["state"] or not a["state"]:
        return False
    na, nb = re.match(r"\d+", a["address"].strip()), re.match(r"\d+", b["address"].strip())
    if na and nb:
        return na.group() == nb.group()
    wa = {w for w in re.findall(r"[a-z0-9]+", a["propertyName"].lower()) if w not in NAME_NOISE and len(w) > 1}
    wb = {w for w in re.findall(r"[a-z0-9]+", b["propertyName"].lower()) if w not in NAME_NOISE and len(w) > 1}
    return bool(wa and wb) and len(wa & wb) >= max(1, min(len(wa), len(wb)) * 0.6)


def merge_pari_passu(rows: list[dict]) -> list[dict]:
    """One property event, reported once: the same loan reported twice by one
    trust, or a large loan split across several trusts that report it within
    a few months of one another."""
    kept: list[dict] = []
    for r in sorted(rows, key=lambda r: (r["filed"], r["accession"])):
        filed = dt.date.fromisoformat(r["filed"])
        match = next((k for k in kept if k["event"] == r["event"] and (
            (k["trustCik"] == r["trustCik"] and k["loanId"] == r["loanId"]) or
            (abs((dt.date.fromisoformat(k["filed"]) - filed).days) <= 75 and same_property(k, r)))), None)
        if match is None:
            r["alsoIn"] = []
            kept.append(r)
        elif match["trustCik"] != r["trustCik"] and all(x["trust"] != r["trust"] for x in match["alsoIn"]):
            match["alsoIn"].append({"trust": r["trust"], "trustCik": r["trustCik"], "loanId": r["loanId"], "balance": r["balance"],
                                    "filingUrl": r["filingUrl"], "accession": r["accession"], "filed": r["filed"]})
    for r in kept:
        r["slug"] = slugify(f'{r["propertyName"]} {r["city"]} {r["state"]} {r["event"]} {r["reportingPeriodEnd"][:7]}')
    return kept


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=10)
    args = ap.parse_args()
    old = json.loads(OUT.read_text()) if OUT.exists() else {"events": [], "processed": []}
    done = set(old.get("processed", []))
    filings = [f for a, f in abs_ee_filings(args.days).items() if a not in done]
    print(f"{len(filings)} new ABS-EE filing(s) to check")
    rows, checked, failed = [], [], 0
    for i, f in enumerate(filings, 1):
        try:
            rows += events_for(f)
            checked.append(f["accession"])
        except Exception as e:  # one bad filing never stops the run; it is retried next time
            failed += 1
            print(f"  {f['accession']} {max(f['ciks'].values(), key=len)[:40]}: {e}", file=sys.stderr)
        if i % 50 == 0:
            print(f"  {i}/{len(filings)} checked, {len(rows)} event(s)")
    # Keep earlier events (each carries its own accession) and re-merge with the new ones.
    raw = [r for e in old.get("events", []) for r in [e] + [
        {**e, **{k: x[k] for k in ("trust", "trustCik", "loanId", "balance", "filingUrl", "accession", "filed") if k in x}}
        for x in e.get("alsoIn", [])]] + rows
    for r in raw:
        r["alsoIn"] = []
    cutoff = (dt.date.today() - dt.timedelta(days=KEEP_DAYS)).isoformat()
    events = [e for e in merge_pari_passu(raw) if e["filed"] >= cutoff]
    events.sort(key=lambda e: (e["filed"], e["propertyName"]), reverse=True)
    processed = sorted(done | set(checked))[-6000:]
    OUT.write_text(json.dumps({"generated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                               "events": events, "processed": processed}, indent=1) + "\n")
    print(f"wrote {OUT.name}: {len(events)} event(s); {len(checked)} filing(s) checked, {failed} failed")


if __name__ == "__main__":
    main()
