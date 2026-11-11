#!/usr/bin/env python3
"""Market Pulse: commercial real estate credit indicators (2026-11-11).

Pulls a small set of commercial real estate credit-market indicators from
official, free, keyless sources and writes them to ops/market-pulse.json for
the homepage, the market page and the weekly email:

  * FRED (Federal Reserve Bank of St. Louis), through its keyless CSV
    download (fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES), fetched
    with the system curl (see get_curl). Only series
    published by the Federal Reserve Board are used; FRED series reprinted
    from copyrighted third-party sources (for example the IMF commercial
    property price series) are deliberately left out.
  * FDIC BankFind Suite financials API (api.fdic.gov/banks/financials), the
    Call Report data for every FDIC-insured institution. From it this script
    computes the industry noncurrent rate on commercial real estate loans for
    the latest quarter, the prior quarter and the year-earlier quarter, and a
    list of the 25 banks over $1 billion in assets with the highest share of
    their commercial real estate loans noncurrent.

Every figure is the source's own number or simple arithmetic on the source's
own numbers (sums and ratios); nothing is estimated. Every indicator carries
a sourceUrl where a reader can see the same number.

FDIC field meanings were taken from the API's definitions file
(api.fdic.gov/banks/docs/risview_properties.yaml) and checked against the
data (e.g. NCRENRES == NCRENROW + NCRENROT == P9RENRES + NARENRES):
  LNRECONS  construction and land development loans
  LNREMULT  loans secured by multifamily properties
  LNRENRES  loans secured by nonfarm nonresidential properties
            (= LNRENROW owner-occupied + LNRENROT other)
  NCRECONS / NCREMULT / NCRENRES
            noncurrent (90+ days past due plus nonaccrual) amounts of each
  RBC       total risk-based capital
  EQ        total equity capital
  ASSET     total assets
All FDIC dollar amounts are reported in thousands; this script converts them
to dollars.

"Commercial real estate loans" here = construction and land development +
multifamily + nonfarm nonresidential, the same three categories that make up
the Federal Reserve's "commercial real estate loans (excluding farmland)"
series. If a source fails, the previous run's values for that source are kept
and marked stale, so one outage never blanks the feed.

  python3 scripts/pull_market_pulse.py [--out ops/market-pulse.json]
"""

import argparse
import csv
import datetime as dt
import io
import json
import pathlib
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "ops" / "market-pulse.json"
UA = {"User-Agent": "CREdocket market pulse (credocket.com)"}

FRED_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv?id={}&cosd={}"
FRED_PAGE = "https://fred.stlouisfed.org/series/{}"
FDIC_API = "https://api.fdic.gov/banks/financials"
FDIC_BANK_PAGE = "https://banks.data.fdic.gov/bankfind-suite/bankfind/details/{}"

CHARGEOFF = ("Federal Reserve Board, Charge-Off and Delinquency Rates on Loans and Leases at Commercial Banks "
             "(seasonally adjusted)")
H8 = "Federal Reserve Board, H.8 Assets and Liabilities of Commercial Banks in the United States (seasonally adjusted)"
SLOOS = "Federal Reserve Board, Senior Loan Officer Opinion Survey on Bank Lending Practices"

# id, plain-English label, unit, frequency, source release. Each ID and its
# title, units and frequency were confirmed on its FRED series page.
FRED_SERIES = [
    ("DRCRELEXFACBS", "Delinquency rate on commercial real estate loans (excluding farmland), all U.S. commercial banks",
     "percent", "quarterly", CHARGEOFF),
    ("DRCRELEXFT100S", "Delinquency rate on commercial real estate loans (excluding farmland), 100 largest U.S. banks by assets",
     "percent", "quarterly", CHARGEOFF),
    ("DRCRELEXFOBS", "Delinquency rate on commercial real estate loans (excluding farmland), banks outside the 100 largest",
     "percent", "quarterly", CHARGEOFF),
    ("CORCREXFACBS", "Net charge-off rate on commercial real estate loans (excluding farmland), all U.S. commercial banks, annualized",
     "percent", "quarterly", CHARGEOFF),
    ("CREACBW027SBOG", "Commercial real estate loans held by U.S. commercial banks",
     "billions of USD", "weekly", H8),
    ("CLDACBW027SBOG", "Construction and land development loans held by U.S. commercial banks",
     "billions of USD", "weekly", H8),
    ("SMPACBW027SBOG", "Loans secured by multifamily properties held by U.S. commercial banks",
     "billions of USD", "weekly", H8),
    ("SNFACBW027SBOG", "Loans secured by nonfarm nonresidential properties held by U.S. commercial banks",
     "billions of USD", "weekly", H8),
    ("SUBLPDRCSN", "Net percentage of banks tightening standards for commercial real estate loans secured by nonfarm nonresidential structures",
     "percent", "quarterly", SLOOS),
    ("SUBLPDRCSM", "Net percentage of banks tightening standards for commercial real estate loans secured by multifamily structures",
     "percent", "quarterly", SLOOS),
    ("SUBLPDRCSC", "Net percentage of banks tightening standards for construction and land development loans",
     "percent", "quarterly", SLOOS),
    ("DGS10", "10-year U.S. Treasury yield (constant maturity)",
     "percent", "daily", "Federal Reserve Board, H.15 Selected Interest Rates"),
]

FDIC_FIELDS = ("CERT,NAME,CITY,STALP,REPDTE,ASSET,EQ,RBC,LNRECONS,LNREMULT,LNRENRES,LNRENROT,"
               "NCRECONS,NCREMULT,NCRENRES")
MIN_ASSETS_K = 1_000_000   # $1 billion, in FDIC thousands
MIN_CRE_K = 100_000        # $100 million of CRE loans, so tiny books don't top the list
TOP_N = 25
MIN_BANKS_FOR_QUARTER = 3000  # a quarter counts as published once most filers are in
QUARTER_ENDS = ("0331", "0630", "0930", "1231")


def get(url, tries=4, timeout=60):
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8")
        except Exception as e:  # network errors, 5xx, throttling
            last = e
            time.sleep(5 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def get_curl(url, tries=3):
    """FRED's CSV download stalls connections from clients it doesn't
    recognize (Python's urllib times out with zero bytes, 2026-11-11) but
    serves the standard curl client normally, so FRED is fetched with the
    system curl (preinstalled on macOS and GitHub's ubuntu runners), sending
    curl's own default User-Agent. HTTP/1.1 because FRED's HTTP/2 front end
    intermittently resets streams."""
    last = None
    for i in range(tries):
        p = subprocess.run(["curl", "-sS", "--http1.1", "--fail", "-m", "60", url],
                           capture_output=True, text=True)
        if p.returncode == 0 and p.stdout:
            return p.stdout
        last = (p.stderr or "").strip() or f"curl exit {p.returncode}"
        time.sleep(5 * (i + 1))
    raise RuntimeError(f"{url}: {last}")


def quarter_label(d):
    return f"Q{(d.month - 1) // 3 + 1} {d.year}"


def year_earlier(d):
    try:
        return d.replace(year=d.year - 1)
    except ValueError:  # Feb 29
        return d.replace(year=d.year - 1, day=28)


def on_or_before(obs, target):
    """Latest (date, value) in obs (sorted) with date <= target, or None."""
    best = None
    for d, v in obs:
        if d <= target:
            best = (d, v)
        else:
            break
    return best


def comparison(label, point, latest_value, unit):
    if point is None:
        return None
    d, v = point
    change = latest_value - v
    out = {"label": label, "date": d.isoformat(), "value": v, "change": round(change, 4)}
    if unit == "percent":
        out["changeUnit"] = "percentage points"
    else:
        out["changeUnit"] = unit
        if v:
            out["changePct"] = round(change / v * 100, 2)
    return out


def fred_indicator(series_id, label, unit, freq, source, today):
    start = (today - dt.timedelta(days=800)).isoformat()
    text = get_curl(FRED_CSV.format(series_id, start))
    rows = list(csv.reader(io.StringIO(text)))
    if not rows or len(rows[0]) < 2 or rows[0][1].strip() != series_id:
        raise RuntimeError(f"unexpected CSV header {rows[:1]}")
    obs = []
    for r in rows[1:]:
        if len(r) < 2 or r[1].strip() in ("", "."):
            continue
        obs.append((dt.date.fromisoformat(r[0].strip()), float(r[1])))
    if not obs:
        raise RuntimeError("no observations")
    obs.sort()
    last_d, last_v = obs[-1]
    prev = obs[-2] if len(obs) > 1 else None
    if freq == "daily":
        comps = [comparison("previous observation", prev, last_v, unit),
                 comparison("1 week earlier", on_or_before(obs, last_d - dt.timedelta(days=7)), last_v, unit),
                 comparison("1 year earlier", on_or_before(obs, year_earlier(last_d)), last_v, unit)]
    elif freq == "weekly":
        comps = [comparison("previous week", prev, last_v, unit),
                 comparison("1 year earlier", on_or_before(obs, last_d - dt.timedelta(days=364)), last_v, unit)]
    else:  # quarterly: FRED dates a quarter by its first day
        ye = year_earlier(last_d)
        comps = [comparison("previous quarter", prev, last_v, unit),
                 comparison("same quarter a year earlier", next(((d, v) for d, v in obs if d == ye), None), last_v, unit)]
    comps = [c for c in comps if c]
    if freq == "quarterly":
        for c in comps:
            c["period"] = quarter_label(dt.date.fromisoformat(c["date"]))
    ind = {
        "id": f"fred-{series_id.lower()}",
        "seriesId": series_id,
        "label": label,
        "value": last_v,
        "unit": unit,
        "frequency": freq,
        "asOf": last_d.isoformat(),
    }
    if freq == "quarterly":
        ind["period"] = quarter_label(last_d)
        ind["asOfNote"] = "FRED dates a quarterly observation by the first day of the quarter."
    ind.update({
        "comparisons": comps,
        "source": f"{source}, via FRED (Federal Reserve Bank of St. Louis)",
        "sourceUrl": FRED_PAGE.format(series_id),
    })
    return ind


# ---------------------------------------------------------------- FDIC

def fdic_query(params):
    return json.loads(get(FDIC_API + "?" + urllib.parse.urlencode(params)))


def fdic_count(repdte):
    j = fdic_query({"filters": f"REPDTE:{repdte}", "fields": "CERT", "limit": 1})
    return int(j.get("meta", {}).get("total", 0))


def fdic_quarter_rows(repdte):
    rows, offset = [], 0
    while True:
        j = fdic_query({"filters": f"REPDTE:{repdte}", "fields": FDIC_FIELDS, "limit": 10000,
                        "offset": offset, "sort_by": "CERT", "sort_order": "ASC"})
        batch = [d["data"] for d in j.get("data", [])]
        rows.extend(batch)
        total = int(j.get("meta", {}).get("total", 0))
        offset += len(batch)
        if not batch or offset >= total:
            break
    if not rows:
        raise RuntimeError(f"no FDIC rows for {repdte}")
    return rows


def prev_quarter_end(repdte):
    y, md = int(repdte[:4]), repdte[4:]
    i = QUARTER_ENDS.index(md)
    return f"{y - 1}1231" if i == 0 else f"{y}{QUARTER_ENDS[i - 1]}"


def rep_date(repdte):
    return dt.date(int(repdte[:4]), int(repdte[4:6]), int(repdte[6:]))


def latest_fdic_quarter():
    j = fdic_query({"fields": "REPDTE", "sort_by": "REPDTE", "sort_order": "DESC", "limit": 1})
    rep = j["data"][0]["data"]["REPDTE"]
    for _ in range(3):
        if fdic_count(rep) >= MIN_BANKS_FOR_QUARTER:
            return rep
        rep = prev_quarter_end(rep)
    raise RuntimeError("no recent quarter with a full set of filers")


def num(r, k):
    v = r.get(k)
    return float(v) if isinstance(v, (int, float)) else 0.0


def cre_figures(r):
    cons, mult, nres = num(r, "LNRECONS"), num(r, "LNREMULT"), num(r, "LNRENRES")
    nc_cons, nc_mult, nc_nres = num(r, "NCRECONS"), num(r, "NCREMULT"), num(r, "NCRENRES")
    return {
        "cre": cons + mult + nres, "nc": nc_cons + nc_mult + nc_nres,
        "cons": cons, "mult": mult, "nres": nres,
        "nc_cons": nc_cons, "nc_mult": nc_mult, "nc_nres": nc_nres,
        "nonOwnerOcc": cons + mult + num(r, "LNRENROT"),
    }


def pct(a, b, places=4):
    return round(a / b * 100, places) if b else None


def usd(k):
    return round(k * 1000)


def industry(rows):
    tot = dict.fromkeys(("cre", "nc", "cons", "mult", "nres", "nc_cons", "nc_mult", "nc_nres"), 0.0)
    for r in rows:
        f = cre_figures(r)
        for k in tot:
            tot[k] += f[k]
    return {
        "institutions": len(rows),
        "creLoans": usd(tot["cre"]),
        "noncurrentCre": usd(tot["nc"]),
        "noncurrentRate": pct(tot["nc"], tot["cre"]),
        "byType": {
            "constructionAndLand": {"loans": usd(tot["cons"]), "noncurrent": usd(tot["nc_cons"]),
                                    "noncurrentRate": pct(tot["nc_cons"], tot["cons"])},
            "multifamily": {"loans": usd(tot["mult"]), "noncurrent": usd(tot["nc_mult"]),
                            "noncurrentRate": pct(tot["nc_mult"], tot["mult"])},
            "nonfarmNonresidential": {"loans": usd(tot["nres"]), "noncurrent": usd(tot["nc_nres"]),
                                      "noncurrentRate": pct(tot["nc_nres"], tot["nres"])},
        },
    }


def api_url(rep):
    return FDIC_API + "?" + urllib.parse.urlencode({"filters": f"REPDTE:{rep}", "fields": FDIC_FIELDS, "limit": 10000})


ALL_BANKS: list = []  # every eligible bank, for js/bank-cre.json (bank-cre-stress.html)
BANKS_OUT = ROOT / "js" / "bank-cre.json"


def write_bank_list(banks: dict) -> None:
    """Every eligible bank, compact, for the Bank CRE Stress page."""
    def share(e, k):
        t = e["byType"][k]
        return round(100 * t["noncurrent"] / t["loans"], 2) if t["loans"] else None
    rows = [{
        "n": e["name"], "c": e["city"], "s": e["state"], "cert": e["cert"], "a": e["totalAssets"], "cre": e["creLoans"],
        "nc": e["noncurrentCre"], "sh": e["noncurrentCreShare"], "ya": (e.get("yearEarlier") or {}).get("noncurrentCreShare"),
        "ca": e["creToTotalAssets"], "rbc": e["nonOwnerOccCreToRiskBasedCapital"], "eq": e["nonOwnerOccCreToEquity"],
        "con": share(e, "constructionAndLand"), "mf": share(e, "multifamily"), "nnr": share(e, "nonfarmNonresidential"),
    } for e in ALL_BANKS]
    doc = {"quarter": banks["quarter"], "asOf": banks["asOf"], "criteria": banks["criteria"], "fieldNotes": banks["fieldNotes"],
           "source": banks["source"], "sourceUrl": banks["sourceUrl"], "banks": rows}
    old = BANKS_OUT.read_text() if BANKS_OUT.exists() else ""
    new = json.dumps(doc, separators=(",", ":")) + "\n"
    if new != old:
        BANKS_OUT.write_text(new)
        print(f"Wrote {BANKS_OUT}: {len(rows)} banks.")


def fdic_section():
    latest = latest_fdic_quarter()
    prevq = prev_quarter_end(latest)
    yago = f"{int(latest[:4]) - 1}{latest[4:]}"
    cur_rows, prev_rows, yago_rows = (fdic_quarter_rows(r) for r in (latest, prevq, yago))
    cur, prev, ya = industry(cur_rows), industry(prev_rows), industry(yago_rows)
    q = quarter_label(rep_date(latest))

    def comp(label, rep, d):
        return {"label": label, "date": rep_date(rep).isoformat(), "period": quarter_label(rep_date(rep)),
                "value": d["noncurrentRate"], "change": round(cur["noncurrentRate"] - d["noncurrentRate"], 4),
                "changeUnit": "percentage points"}

    ind = {
        "id": "fdic-noncurrent-cre-rate",
        "label": ("Share of commercial real estate loans noncurrent (90+ days past due or nonaccrual), "
                  "all FDIC-insured institutions"),
        "value": cur["noncurrentRate"],
        "unit": "percent",
        "frequency": "quarterly",
        "asOf": rep_date(latest).isoformat(),
        "period": q,
        "comparisons": [comp("previous quarter", prevq, prev), comp("same quarter a year earlier", yago, ya)],
        "detail": {"latest": cur, "previousQuarter": prev, "yearEarlier": ya},
        "method": ("Sum of noncurrent construction and land development, multifamily and nonfarm nonresidential "
                   "loans (Call Report fields NCRECONS + NCREMULT + NCRENRES) divided by the sum of those loans "
                   "(LNRECONS + LNREMULT + LNRENRES) across every FDIC-insured institution filing that quarter. "
                   "Computed by CREdocket from FDIC data; dollar amounts in USD."),
        "source": "FDIC BankFind Suite financial data (Call Reports), computed by CREdocket",
        "sourceUrl": api_url(latest),
    }

    ya_by_cert = {r.get("CERT"): r for r in yago_rows}
    ranked = []
    for r in cur_rows:
        f = cre_figures(r)
        if num(r, "ASSET") <= MIN_ASSETS_K or f["cre"] < MIN_CRE_K:
            continue
        rbc = num(r, "RBC")
        entry = {
            "name": r.get("NAME"),
            "city": r.get("CITY"),
            "state": r.get("STALP"),
            "cert": r.get("CERT"),
            "quarter": q,
            "asOf": rep_date(latest).isoformat(),
            "totalAssets": usd(num(r, "ASSET")),
            "creLoans": usd(f["cre"]),
            "noncurrentCre": usd(f["nc"]),
            "noncurrentCreShare": pct(f["nc"], f["cre"], 2),
            "byType": {
                "constructionAndLand": {"loans": usd(f["cons"]), "noncurrent": usd(f["nc_cons"])},
                "multifamily": {"loans": usd(f["mult"]), "noncurrent": usd(f["nc_mult"])},
                "nonfarmNonresidential": {"loans": usd(f["nres"]), "noncurrent": usd(f["nc_nres"])},
            },
            "creToTotalAssets": pct(f["cre"], num(r, "ASSET"), 2),
            "nonOwnerOccCreToRiskBasedCapital": pct(f["nonOwnerOcc"], rbc, 1) if rbc > 0 else None,
            "nonOwnerOccCreToEquity": pct(f["nonOwnerOcc"], num(r, "EQ"), 1) if num(r, "EQ") > 0 else None,
            "sourceUrl": FDIC_BANK_PAGE.format(r.get("CERT")),
        }
        prior = ya_by_cert.get(r.get("CERT"))
        if prior:
            pf = cre_figures(prior)
            if pf["cre"] > 0:
                entry["yearEarlier"] = {"asOf": rep_date(yago).isoformat(),
                                        "noncurrentCreShare": pct(pf["nc"], pf["cre"], 2),
                                        "noncurrentCre": usd(pf["nc"])}
        ranked.append(entry)
    ranked.sort(key=lambda e: (-e["noncurrentCreShare"], -e["noncurrentCre"]))
    ALL_BANKS[:] = ranked
    top = [dict(e) for e in ranked[:TOP_N]]
    for i, e in enumerate(top, 1):
        e["rank"] = i
    banks = {
        "label": f"Banks over $1 billion in assets with the highest share of commercial real estate loans noncurrent, {q}",
        "quarter": q,
        "asOf": rep_date(latest).isoformat(),
        "eligibleBanks": len(ranked),
        "criteria": ("FDIC-insured institutions with total assets over $1 billion and at least $100 million of "
                     "commercial real estate loans (construction and land development + multifamily + nonfarm "
                     "nonresidential), ranked by the noncurrent (90+ days past due or nonaccrual) share of those loans."),
        "fieldNotes": {
            "creToTotalAssets": "Commercial real estate loans as a percent of total assets (ASSET).",
            "nonOwnerOccCreToRiskBasedCapital": ("Construction and land development + multifamily + non-owner-occupied "
                                                 "nonfarm nonresidential loans (LNRECONS + LNREMULT + LNRENROT) as a "
                                                 "percent of total risk-based capital (RBC); null when the bank "
                                                 "reports no total risk-based capital figure (banks that elected "
                                                 "the Community Bank Leverage Ratio framework do not)."),
            "nonOwnerOccCreToEquity": ("The same loans as a percent of total equity capital (EQ), available for "
                                       "every bank."),
            "yearEarlier": "The same bank's noncurrent share in the same quarter a year earlier, when it filed then.",
            "amounts": "USD (FDIC reports in thousands; converted).",
        },
        "source": "FDIC BankFind Suite financial data (Call Reports), computed by CREdocket",
        "sourceUrl": api_url(latest),
        "top": top,
    }
    return ind, banks


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()
    out = pathlib.Path(args.out)
    previous = {}
    if out.exists():
        try:
            previous = json.loads(out.read_text())
        except ValueError:
            previous = {}
    prev_inds = {i.get("id"): i for i in previous.get("indicators", [])}

    today = dt.date.today()
    indicators, errors = [], []
    for series_id, label, unit, freq, source in FRED_SERIES:
        try:
            indicators.append(fred_indicator(series_id, label, unit, freq, source, today))
        except Exception as e:
            errors.append(f"FRED {series_id}: {e}")
            old = prev_inds.get(f"fred-{series_id.lower()}")
            if old:
                indicators.append(dict(old, stale=True))
        time.sleep(1)

    banks = previous.get("banks")
    try:
        fdic_ind, banks = fdic_section()
        indicators.append(fdic_ind)
        write_bank_list(banks)
    except Exception as e:
        errors.append(f"FDIC: {e}")
        old = prev_inds.get("fdic-noncurrent-cre-rate")
        if old:
            indicators.append(dict(old, stale=True))
        if banks:
            banks = dict(banks, stale=True)

    fresh = [i for i in indicators if not i.get("stale")]
    if not fresh:
        print("No source could be reached; leaving the file unchanged.", file=sys.stderr)
        for e in errors:
            print("  " + e, file=sys.stderr)
        return 1

    doc = {
        "generated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "about": ("Commercial real estate credit indicators from the Federal Reserve (via FRED) and FDIC Call Report "
                  "data. Values are the sources' own figures; FDIC aggregates and bank ratios are sums and ratios of "
                  "FDIC-reported fields. Built by scripts/pull_market_pulse.py."),
        "indicators": indicators,
        "banks": banks,
        "errors": errors,
    }
    # Don't churn the file when only the timestamp would change.
    if previous and dict(previous, generated=None) == dict(doc, generated=None):
        print("No change in the data.")
        return 0
    out.write_text(json.dumps(doc, indent=2) + "\n")
    print(f"Wrote {out}: {len(indicators)} indicators ({len(fresh)} fresh), "
          f"{len((banks or {}).get('top', []))} banks, {len(errors)} errors.")
    for e in errors:
        print("  " + e)
    return 0


if __name__ == "__main__":
    sys.exit(main())
