#!/usr/bin/env python3
"""CMBS realized losses on liquidated loans, from SEC Form ABS-EE (2026-11-20).

For calculator calibration in lending/foreclosure matters: when a commercial
mortgage in a CMBS trust is foreclosed and the property sold, how much of the
loan did the lender lose, and how did the sale proceeds compare with the
property's last appraisal? Item 1125 of Regulation AB, Schedule AL, Item
2(h) "Realized loss to trust" (realizedLossToTrustAmount): "the difference
between net proceeds (after liquidation expenses) and the scheduled or stated
principal of the loan as of the beginning of the reporting period."

A trust's monthly loan tape keeps a row for each loan that has left the pool,
with its liquidation date and realized loss. So the latest tape of each trust
lists its losses; the tape for the last month the loan was still outstanding
gives the balance, most recent appraisal, property type and state.

  severity        = realized loss / balance at the last report before liquidation
  proceedsToValue = (that balance - realized loss) / most recent appraisal,
                    i.e. net proceeds against the appraisal (approximate:
                    the definition uses the balance at the start of the
                    liquidation month, and accrued advances are not separated)

Only sec.gov and data.sec.gov, within the SEC fair-access limit (the
pacing in pull_cmbs_distress.get). Output, totals plus one row per loss for
de-duplication, goes to case_valuation_project/data/research/cmbs/
(gitignored; never git add). Cooperative housing and securities collateral
are dropped.

  python3 scripts/cmbs_realized_losses.py [--days 35]
"""

from __future__ import annotations

import argparse
import json
import pathlib
import statistics
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import pull_cmbs_distress as p  # noqa: E402

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "case_valuation_project" / "data" / "research" / "cmbs"
NS = p.NS


def trust_filings(cik: int) -> list[str]:
    sub = json.loads(p.get(f"https://data.sec.gov/submissions/CIK{cik:010d}.json"))
    r = sub["filings"]["recent"]
    return [a for f, a in zip(r["form"], r["accessionNumber"]) if f in ("ABS-EE", "ABS-EE/A")]


def losses_in(xml: bytes) -> dict[str, dict]:
    out = {}
    for a in ET.fromstring(xml).iter(NS + "assets"):
        loss = p.num(a, "realizedLossToTrustAmount")
        if loss and loss >= 1000:
            out[p.txt(a, "assetNumber")] = {"loss": loss, "liquidationCode": p.txt(a, "liquidationPrepaymentCode"),
                                            "liquidationDate": p.iso(p.txt(a, "liquidationPrepaymentDate")),
                                            "originalLoanAmount": p.num(a, "originalLoanAmount")}
    return out


def outstanding(xml: bytes) -> dict[str, dict]:
    out = {}
    for a in ET.fromstring(xml).iter(NS + "assets"):
        # Beginning-of-period balance: the base the realized-loss definition uses.
        bal = p.num(a, "reportPeriodBeginningScheduleLoanBalanceAmount") or p.num(a, "reportPeriodEndActualBalanceAmount")
        if not bal or bal <= 0:
            continue
        props = a.findall(NS + "property")
        first = props[0] if props else None
        out[p.txt(a, "assetNumber")] = {
            "balance": bal, "periodEnd": p.iso(p.txt(a, "reportingPeriodEndDate")),
            # Valuations are reported per property (Item 2(d)(16)-(18)); a multi-property loan sums them.
            "valuation": sum(p.num(x, "mostRecentValuationAmount") or 0 for x in props) or None,
            "valuationDate": max((p.iso(p.txt(x, "mostRecentValuationDate")) for x in props), default=""),
            "valuationAtSecuritization": sum(p.num(x, "valuationSecuritizationAmount") or 0 for x in props) or None,
            "workout": p.WORKOUT.get(p.txt(a, "workoutStrategyCode")),
            "specialServicingSince": p.iso(p.txt(a, "mostRecentSpecialServicerTransferDate")),
            "typeCode": p.txt(first, "propertyTypeCode") if first is not None else "",
            "state": p.txt(first, "propertyState") if first is not None else "",
            "propertyName": p.txt(first, "propertyName") if first is not None else "",
            "propertyCount": len(props),
        }
    return out


def quartiles(xs):
    if len(xs) < 4:
        return None
    q = statistics.quantiles(xs, n=4)
    return [round(q[0], 3), round(statistics.median(xs), 3), round(q[2], 3)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=35)
    args = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    ciks = {}
    for f in p.abs_ee_filings(args.days).values():
        cik = max(f["ciks"])
        ciks[cik] = f["ciks"][cik]
    print(f"{len(ciks)} ABS-EE filers in the last {args.days} days")
    rows, trusts_cmbs, failed = [], 0, 0
    for i, (cik, name) in enumerate(sorted(ciks.items()), 1):
        try:
            accs = trust_filings(cik)
            if not accs:
                continue
            url = p.exhibit_102(cik, accs[0])
            if not url:
                continue  # not a CMBS trust
            trusts_cmbs += 1
            lost = losses_in(p.get(url))
            if not lost:
                continue
            cache = {}

            def tape_at(i):
                if i not in cache:
                    u = p.exhibit_102(cik, accs[i]) if 0 < i < len(accs) else None
                    cache[i] = outstanding(p.get(u)) if u else {}
                return cache[i]

            for key, v in lost.items():
                # Newest tape in which the loan still had a balance: tapes are newest first, and a loan
                # outstanding in tape i is outstanding in every older one, so binary-search the boundary.
                # (The liquidation date can trail the loan's exit by months, so it is not used.)
                lo, hi, hit = 1, len(accs) - 1, None
                while lo <= hi:
                    mid = (lo + hi) // 2
                    if key in tape_at(mid):
                        hit, hi = mid, mid - 1
                    else:
                        lo = mid + 1
                row = dict(tape_at(hit)[key]) if hit else {"balance": None}
                if hit and not row.get("valuation") and key in tape_at(hit + 1):
                    older = tape_at(hit + 1)[key]
                    row.update({k: older[k] for k in ("valuation", "valuationDate", "workout")})
                rows.append({"trust": name, "trustCik": cik, "assetNumber": key, **v, **row})
        except Exception as e:
            failed += 1
            print(f"  {cik} {name[:40]}: {e}", file=sys.stderr)
        if i % 25 == 0:
            print(f"  {i}/{len(ciks)} filers, {trusts_cmbs} CMBS, {len(rows)} losses")

    rows = [r for r in rows if r.get("typeCode") not in ("CH", "SE")]
    for r in rows:
        b = r.get("balance")
        r["severity"] = round(r["loss"] / b, 4) if b else None
        v = r.get("valuation")
        r["proceedsToValue"] = round((b - r["loss"]) / v, 4) if b and v and v > 0 else None
        vs = r.get("valuationAtSecuritization")
        r["proceedsToSecuritizationValue"] = round((b - r["loss"]) / vs, 4) if b and vs and vs > 0 else None
        r["propertyType"] = p.PROPERTY_TYPES.get(r.get("typeCode", ""), "Unknown")
    # Pari passu pieces of one loan sit in several trusts: count each property/liquidation once.
    seen, unique = set(), []
    for r in sorted(rows, key=lambda r: -(r.get("balance") or 0)):
        k = (p.norm(r.get("propertyName") or r["assetNumber"] + r["trust"]), r.get("state"), r["liquidationDate"])
        if k in seen:
            continue
        seen.add(k)
        unique.append(r)

    def summary(group):
        sev = [r["severity"] for r in group if r["severity"] is not None]
        ptv = [r["proceedsToValue"] for r in group if r["proceedsToValue"] is not None]
        pts = [r["proceedsToSecuritizationValue"] for r in group if r["proceedsToSecuritizationValue"] is not None]
        return {"loans": len(group), "withBalance": len(sev), "severityQuartiles": quartiles(sev),
                "totalLossOver100PctOfBalance": sum(1 for s in sev if s >= 1.0),
                "proceedsToLastAppraisalQuartiles": quartiles(ptv), "withAppraisal": len(ptv),
                "proceedsToSecuritizationValueQuartiles": quartiles(pts), "withSecuritizationValue": len(pts),
                "medianLoss": round(statistics.median([r["loss"] for r in group])) if group else None}

    by_type, by_year = {}, {}
    for r in unique:
        by_type.setdefault(r["propertyType"], []).append(r)
        by_year.setdefault((r["liquidationDate"] or "????")[:4], []).append(r)
    result = {
        "source": "SEC Form ABS-EE Exhibit 102 (Reg AB Item 1125 Schedule AL), latest tape of each CMBS trust filing in the window, plus the last tape before each liquidation.",
        "caveats": ["Severity is realized loss over the balance at the last report before liquidation; proceeds-to-value is approximate.",
                    "A loss that a trust reports only in its liquidation month and later drops would be missed.",
                    "Covers trusts still filing (issued 2017 or later), so it tilts toward recent liquidations.",
                    "Pari passu pieces de-duplicated by property name, state and liquidation date."],
        "counts": {"filers": len(ciks), "cmbsTrusts": trusts_cmbs, "lossRows": len(rows), "uniqueLosses": len(unique), "failedTrusts": failed},
        "all": summary(unique),
        "byPropertyType": {k: summary(v) for k, v in sorted(by_type.items(), key=lambda kv: -len(kv[1]))},
        "byLiquidationYear": {k: summary(v) for k, v in sorted(by_year.items())},
    }
    (OUT / "realized-losses.json").write_text(json.dumps(result, indent=1))
    (OUT / "realized-loss-rows.json").write_text(json.dumps(unique, indent=1))
    print(json.dumps({k: result[k] for k in ("counts", "all")}, indent=1))
    for k, v in result["byPropertyType"].items():
        print(f"{k:18} n={v['loans']:4} severity={v['severityQuartiles']} proceeds/appraisal={v['proceedsToLastAppraisalQuartiles']} proceeds/orig-value={v['proceedsToSecuritizationValueQuartiles']}")


if __name__ == "__main__":
    main()
