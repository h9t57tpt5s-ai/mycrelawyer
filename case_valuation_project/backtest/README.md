# Case Value Calculator backtest

Purpose: measure whether the calculator's predicted range contains what a
commercial real estate case actually resolved for, on cases whose outcome
is public. Results are published, good or bad.

## Protocol

1. **Cases come from published court opinions** hosted by the court itself
   (TAMES, a state supreme court site, or similar). Each case in
   `cases.json` records the opinion's URL under `source`.
2. **The calculator receives only pre-outcome facts.** `input.documentText`
   is a verbatim excerpt of the opinion's facts and procedural background,
   cut off before any sentence that states a verdict, judgment amount,
   award, or the appellate holding. `input.description` states the side
   being valued and nothing else. No paraphrasing that could smuggle the
   result in.
3. **The outcome is stored separately** under `outcome`: the amount awarded
   or agreed at trial (before appellate adjustment unless the appeal
   changed it, in which case both are recorded), the date, and a one-line
   description. `scripts/backtest_case_valuation.py` refuses to run a case
   whose outcome amount appears anywhere in its input text.
4. **Every case is run through the live Edge Function**, not a copy of its
   prompt, so the result is what a user would have received.
5. **Scoring.** Two comparisons are reported for every case, because the
   calculator's top-line range includes a contractual attorney's-fee claim
   when one is pleaded and court awards are usually reported without it:
   - **Ex-fees:** the sum of the calculator's per-issue expected values
     for every issue except those labeled as fees, against the trial award
     on the main claim (`outcome.amount`, which excludes fees).
   - **All-in:** the calculator's top-line `damagesRange` and
     `bestGuessValue` against the whole trial judgment including fees
     (`outcome.amount + outcome.attorneysFeesAtTrial`).
   A case is a hit when the actual figure falls inside the range, and the
   best-guess error is `(predicted - actual) / actual`. Appellate changes
   are recorded but scored separately, since the tool is asked what a
   trial court will do. Cases where the calculator returns no range
   (`whatIsNeededForEstimate` set) are reported as "declined", not
   dropped.
6. Results live in `results/<id>.json`, one file per case, written the
   moment the call returns. A case is never re-run once a result exists.

## Known limits

- Appellate opinions describe facts in the court's own words after the
  fact; a real user's input is messier. This tests the model, not the
  intake form.
- Only cases with a stated dollar outcome can be scored, which skews the
  set toward damages disputes that reached judgment.
- Cases in the calculator's own citation database are excluded, since
  the model has seen their outcomes.
