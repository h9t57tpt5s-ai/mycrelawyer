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
import signal
import os
import pathlib
import sys
import time
import urllib.error
import urllib.request

FUNCTION_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/case-valuation-analyze"
ANON_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f"
# --local points at scripts/run_local_calculator.sh on this Mac (no Supabase).
LOCAL_URL = "http://localhost:8000"
TARGET_URL = FUNCTION_URL
RESULTS_ROOT = pathlib.Path("case_valuation_project/backtest")
RESULTS_DIR = RESULTS_ROOT / "results"
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


def call_calculator(secret, inp, variant="", valuation_date=None, baseline_only=False):
    body = {k: v for k, v in inp.items() if k in ("description", "documentText", "userSide", "expectToTrial")}
    if baseline_only:  # formula engine only, no analysis model (backtest requests only)
        body["baselineOnly"] = True
    if variant:  # candidate instructions, honored only for backtest requests
        body["promptVariant"] = variant
    if valuation_date:  # v6 accrues interest to this date
        body["valuationDate"] = valuation_date
    req = urllib.request.Request(
        TARGET_URL, data=json.dumps(body).encode(), method="POST",
        headers={"Content-Type": "application/json", "apikey": ANON_KEY,
                 "Authorization": f"Bearer {ANON_KEY}", "x-automation-secret": secret},
    )
    # The function heartbeats while it waits, so the socket timeout alone
    # never fires; run locally (no Supabase 400s wall clock) a hung
    # Anthropic stream held one case for 2.5 hours on 2026-10-18. Cap the
    # whole call at 10 minutes.
    def _deadline(signum, frame):
        raise TimeoutError("no answer within 600s")
    old_handler = signal.signal(signal.SIGALRM, _deadline)
    signal.alarm(600)
    try:
        with urllib.request.urlopen(req, timeout=450) as resp:
            body = json.load(resp)
            # A slow request streams back as HTTP 200 with the real status
            # in the body (see the Deno.serve wrapper in the function).
            if isinstance(body, dict) and "analysis" not in body and body.get("httpStatus"):
                return body["httpStatus"], body
            return resp.status, body
    except urllib.error.HTTPError as err:
        raw = err.read().decode(errors="replace")
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, {"error": raw[:500]}
    except TimeoutError as err:
        return 504, {"error": f"Request timed out: {err}"}
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, old_handler)


def summarize(analysis):
    return {
        "model": analysis.get("model"),
        "analysisVersion": analysis.get("analysisVersion") or "v1",
        "cost": analysis.get("cost"),
        "category": analysis.get("category"),
        "roleLabel": analysis.get("roleLabel"),
        "damagesRange": analysis.get("damagesRange"),
        "bestGuessValue": analysis.get("bestGuessValue"),
        "whatIsNeededForEstimate": analysis.get("whatIsNeededForEstimate"),
        "likelyOutcome": analysis.get("likelyOutcome"),
        "issues": [
            {"label": i.get("label"), "probabilityRange": i.get("probabilityRange"), "damagesRange": i.get("damagesRange"),
             "claimant": i.get("claimant"), "liabilityStatus": i.get("liabilityStatus"), "supportedCeiling": i.get("supportedCeiling"),
             "kind": i.get("kind"), "claimType": i.get("claimType"), "strength": i.get("strength"),
             "figures": i.get("figures"), "droppedFigures": i.get("droppedFigures"), "basis": i.get("basis"),
             "interest": i.get("interest")}
            for i in analysis.get("issues", [])
        ],
        "citationCoverage": analysis.get("citationCoverage"),
        # v6: outcome scenarios, missing deciding facts, valuation date.
        "scenarios": analysis.get("scenarios"),
        "missingFacts": analysis.get("missingFacts"),
        "valuationDate": analysis.get("valuationDate"),
        # formula-only runs: the deterministic engine's claims and the facts
        # the extraction model filled in.
        "baseline": analysis.get("baseline"),
        "extractedFacts": analysis.get("extractedFacts"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cases")
    ap.add_argument("--limit", type=int, default=1)
    ap.add_argument("--confirm", action="store_true", help="required; each call spends API credit")
    ap.add_argument("--only", default="", help="comma-separated case ids")
    ap.add_argument("--version", default="v1", help="results directory: v1 -> results/, v2 -> results-v2/")
    ap.add_argument("--variant", default="", help="candidate prompt variant to request, e.g. v4.5 (backtest only)")
    ap.add_argument("--baseline-only", action="store_true", help="score the fixed per-category formula engine alone (no analysis model, ~$0.005 a case)")
    ap.add_argument("--local", action="store_true", help="run against the local function (scripts/run_local_calculator.sh), secret 'local-test'")
    args = ap.parse_args()
    global RESULTS_DIR
    RESULTS_DIR = RESULTS_ROOT / ("results" if args.version == "v1" else f"results-{args.version}")

    global TARGET_URL
    if args.local:
        TARGET_URL = LOCAL_URL
        os.environ.setdefault("AUTOMATION_SECRET", "local-test")
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
            prev = json.loads(out_path.read_text())
            if prev.get("status") == 200 and not prev.get("void"):
                print(f"skip {c['id']}: result exists")
                continue
            print(f"retry {c['id']}: previous attempt {'was voided' if prev.get('void') else 'failed'}")
        if ran >= args.limit:
            break
        print(f"running {c['id']} ...", flush=True)
        # v6 values each case as of its decision date, so interest accrues to
        # about when the court ruled (the date, never the amount, is used).
        vdate = (c.get("outcome") or {}).get("date") or (c.get("source") or {}).get("decided")
        status, body = call_calculator(secret, c["input"], args.variant, vdate if args.variant == "v6" else None, args.baseline_only)
        # A dropped network (the Mac sleeping, Wi-Fi lost) fails every case
        # before it reaches the API; 86 of 96 overnight v6 calls failed that
        # way on 2026-10-18. Wait and retry the same case instead of marking
        # the rest of the run failed.
        for wait in (30, 120, 300):
            if status != 502 or "connection" not in json.dumps(body).lower():
                break
            print(f"  network error; retrying in {wait}s", flush=True)
            time.sleep(wait)
            status, body = call_calculator(secret, c["input"], args.variant, vdate if args.variant == "v6" else None, args.baseline_only)
        # A variant run must come back labeled with that variant, or the
        # deployed function did not apply it and the result would be
        # mislabeled (2026-10-17).
        got = (body.get("analysis") or {}).get("analysisVersion") if status == 200 else None
        if status == 200 and args.variant and got != args.variant:
            status, body = 409, {"error": f"asked for variant {args.variant!r} but the calculator ran {got!r}; deploy the function first"}
        # The calculator's sideA/sideB are fixed per category (lease disputes:
        # Landlord/Tenant; lending: Lender/Borrower), so a case whose input
        # names the wrong side is valued for the other party. Refuse to
        # record that as a result (found 2026-09-24 on Shaw and Hurt).
        role = (body.get("analysis") or {}).get("roleLabel") if status == 200 else None
        if status == 200 and c.get("expectedRole") and role != c["expectedRole"]:
            status, body = 409, {"error": f"valued as {role!r}, but the client is the {c['expectedRole']!r}; fix userSide"}
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
            # An empty prepaid balance fails every remaining case the same
            # way (70 in a row on 2026-10-18); stop until credit is added.
            if "credit balance is too low" in json.dumps(body):
                print("stopping: the Anthropic account is out of credit (console.anthropic.com > Billing)")
                break
        time.sleep(3)
    print(f"done: {ran} case(s) run")


if __name__ == "__main__":
    main()
