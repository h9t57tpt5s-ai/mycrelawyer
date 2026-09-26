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
5. **Scoring, primary: the ultimate outcome.** Each case is scored first
   against `outcome.finalAmount`, the figure after appeal, because the
   tool is asked what a case is worth and a trial result later corrected
   on appeal was not that. A trial-level miss that becomes a hit after
   appellate correction counts as a hit and is labeled as corrected. A
   case reversed and remanded with no final figure is pending, not scored.
   The trial-level comparisons below are secondary. Two further comparisons are reported for every case, because the
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

## Side check (added 2026-09-24)

The calculator's two sides are fixed per category: in lease disputes side A is the landlord and side B the tenant; in lending, side A is the lender and side B the borrower. A case whose `userSide` names the wrong one is valued for the other party. Every case now carries `expectedRole`, and the runner (and the registry script) refuse to record a result whose `roleLabel` differs from it.

Two cases were found run for the wrong side: Shaw (the client is the tenant) and Hurt (the client is the optionee, the tenant side). Their original results are kept in the files with a `void` note and excluded from scoring. Version 2 was re-run with the side corrected; version 1 cannot be re-run because its prompt is no longer deployed.

## Version 3 (2026-09-24)

Approved by Jeff after the version 2 re-test. Two changes:

1. **Best guess.** Each represented issue contributes its midpoint probability times the high end of its own damages range; each opposing issue its midpoint probability times its midpoint damages. Four candidate formulas were compared on the 19 cases that are not held out, scored against the ultimate outcome; this one had the smallest median error. The six held-out cases were looked at only after the choice was made.
2. **One-sided backstop.** If the other side's claims are priced and none of the client's are, while the client has an unpriced affirmative claim, the calculator declines to give a net figure and names what is missing. Each issue now carries `kind` (claim or defense) so a defense-only case still gets its exposure figure.

Results are in `results-v3/`. The range formula is unchanged from version 2, so range hits should move only through run-to-run variation and the backstop.

## Version 5 expansion (2026-09-26)

46 cases added, taking the backtest from 25 to 71 and covering all eight calculator categories (leases 27, eminent domain 12, construction 9, lending 9, premises 5, zoning 4, environmental 3, REIT securities 2, counting the original 25). Research agents found and prepared them; `scripts/intake_backtest_cases.py` admitted a case only if:

- its source is the court's own opinion (or a court PDF copy), linked by a working https URL;
- its side matches the category's fixed roles (`expectedRole`, `userSide`);
- neither the trial nor the final amount appears in the input in any written form, unless it is a party's own stated demand or valuation (`amountIsTheRequestedAmount`);
- every sentence of `documentText` is found word for word in the saved opinion text, allowing only PDF artifacts (page numbers, running headers, footnote markers) between pieces of a sentence, never an added word;
- it is not a duplicate and not in the calculator's citation database.

Ten candidates were excluded: nine whose excerpts could not be matched word for word without judgment calls (Service Steel, RSS MSBAM, two Marchbanks cases, LMMM Houston, Stapas, Wortham, Landis+Gyr, Hudson Holeyfield Banks), and Mimi's v. BAI Riverwalk, whose court link no longer resolves. The opinion text each case was checked against is in `sources/`.

One case in five was held out by a hash of its id before any run (`holdout: true`). Outcome judgment calls are recorded in each case's `finalNote`: e.g. Exxon Mobil's final figure is pending because its appeal status could not be verified, Burns Concrete's is pending because the court remanded for recalculation, and Donegal's final is the tenant's net loss after the landlord's counterclaim.

## Version 4.4 (2026-09-26): fixes found by replaying the saved runs, no new API calls

1. **A lone "competing" figure is itemized.** "Competing" means two or more alternative values; a single disputed figure listed that way (Packard Square's $54M original-principal theory, Donegal's $5M punitive demand) had been treated as certain, putting most of it into the low end. It can now be lost entirely, like any disputed figure.
2. **The scorer mirrors the requested-relief cap.** The live calculator caps what the user sees at the amount a party actually requested; the fees-excluded score now applies the same cap. That made IGCFCO a hit (capped exactly at the award) and Holcomb a miss (capped at the $130,000 requested, below the $133,900 awarded).

Replayed on the saved runs: the 46 new cases go from 19 to 23 of 38 trial awards in range and 17 to 19 of 32 final outcomes (held-out 4 of 7); the original 25 are unchanged. Published scores stay tied to real runs; version 4.4's live results will be recorded on its next paid run.
