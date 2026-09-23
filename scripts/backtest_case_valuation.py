#!/usr/bin/env python3
"""Run resolved cases through the live Case Value Calculator and record what
it predicted, so its calibration can be measured against real outcomes.

Input: a JSON file of cases (see case_valuation_project/backtest/README.md
for the protocol). Each case carries ONLY pre-outcome facts as the
calculator input; the real outcome is stored separately and never sent.
Output: one JSON result per case in case_valuation_project/backtest/results/,
written immediately so an interrupted run loses nothing.

Every call spends real Claude API credit through the function, so the
runner asks for --confirm and stops after --limit cases.

  AUTOMATION_SECRET=... python3 scripts/backtest_case_valuation.py cases.json --limit 1 --confirm
"""

import argparse
import datetime as dt
import json
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

FUNCTION_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/case-valuation-analyze"
ANON_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f"
RESULTS_DIR = pathlib.Path("case_valuation_project/backtest/results")
FORBIDDEN_INPUT_KEYS = {"outcome", "actual", "actualOutcome", "judgment", "verdict"}


def validate(case):
    for key in ("id", "input", "outcome"):
        if key not in case:
            raise ValueError(f"case missing '{key}'")
    inp = case["input"]
    if not (inp.get("description") or inp.get("documentText")):
        raise ValueError(f"{case['id']}: input has no description or documentText")
    if FORBIDDEN_INPUT_KEYS & set(inp):
        raise ValueError(f"{case['id']}: outcome data must never be inside input")
    # A crude but real guard against leaking the answer into the prompt.
    # A case may state that the court awarded exactly what was demanded;
    # the demand is a legitimate pre-outcome fact, so that case opts out.
    amount = case["outcome"].get("amount")
    if amount and not case["outcome"].get("amountIsTheRequestedAmount"):
        text = (inp.get("description") or "") + (inp.get("documentText") or "")
        if f"{amount:,.2f}" in text or f"{int(amount):,}" in text:
            raise ValueError(f"{case['id']}: the outcome amount appears in the input text")


def call_calculator(secret, inp):
    body = {k: v for k, v in inp.items() if k in ("description", "documentText", "userSide", "expectToTrial")}
    req = urllib.request.Request(
        FUNCTION_URL, data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "apikey": ANON_KEY,
                 "Authorization": f"Bearer {ANON_KEY}", "x-automation-secret": secret},
    )
    try:
        with urllib.request.urlopen(req, timeout=300) as resp:
            return resp.status, json.load(resp)
    except urllib.error.HTTPError as err:
        raw = err.read().decode(errors="replace")
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, {"error": raw[:500]}


def summarize(analysis):
    return {
        "model": analysis.get("model"),
        "category": analysis.get("category"),
        "roleLabel": analysis.get("roleLabel"),
        "damagesRange": analysis.get("damagesRange"),
        "bestGuessValue": analysis.get("bestGuessValue"),
        "whatIsNeededForEstimate": analysis.get("whatIsNeededForEstimate"),
        "likelyOutcome": analysis.get("likelyOutcome"),
        "issues": [
            {"label": i.get("label"), "probabilityRange": i.get("probabilityRange"), "damagesRange": i.get("damagesRange")}
            for i in analysis.get("issues", [])
        ],
        "citationCoverage": analysis.get("citationCoverage"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cases")
    ap.add_argument("--limit", type=int, default=1)
    ap.add_argument("--confirm", action="store_true", help="required; each call spends API credit")
    ap.add_argument("--only", default="", help="comma-separated case ids")
    args = ap.parse_args()

    secret = os.environ.get("AUTOMATION_SECRET", "").strip()
    if not secret:
        sys.exit("AUTOMATION_SECRET is required.")
    if not args.confirm:
        sys.exit("Refusing to run without --confirm: every case is a real Claude API call.")

    cases = json.load(open(args.cases))
    for c in cases:
        validate(c)
    wanted = set(filter(None, args.only.split(",")))
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    ran = 0
    for c in cases:
        if wanted and c["id"] not in wanted:
            continue
        out_path = RESULTS_DIR / f"{c['id']}.json"
        if out_path.exists():
            # A completed analysis is final; a failed call (upstream error,
            # timeout) is retried on the next run.
            if json.loads(out_path.read_text()).get("status") == 200:
                print(f"skip {c['id']}: result exists")
                continue
            print(f"retry {c['id']}: previous attempt failed")
        if ran >= args.limit:
            break
        print(f"running {c['id']} ...", flush=True)
        status, body = call_calculator(secret, c["input"])
        record = {
            "id": c["id"], "ranAt": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "status": status,
            "prediction": summarize(body.get("analysis", {})) if status == 200 else None,
            "error": None if status == 200 else body,
            "outcome": c["outcome"],
            "source": c.get("source"),
        }
        out_path.write_text(json.dumps(record, indent=1))
        ran += 1
        if status == 200:
            p = record["prediction"]
            print(f"  {p['category']} | range {p['damagesRange']} | best {p['bestGuessValue']} | actual {c['outcome'].get('amount')}")
        else:
            print(f"  HTTP {status}: {body}")
        time.sleep(3)
    print(f"done: {ran} case(s) run")


if __name__ == "__main__":
    main()
