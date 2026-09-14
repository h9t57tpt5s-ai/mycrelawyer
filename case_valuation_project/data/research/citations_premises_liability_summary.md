# Premises-liability citation research (2026-09-13)

## Why this exists

A 10-agent premium-readiness review's AI-tools-maturity pass found that the
premises-liability category's 5 claim types (`slip_and_fall_hazardous_condition`,
`inadequate_security_third_party_crime`, `negligent_maintenance_structural_failure`,
`dangerous_condition_failure_to_warn`, `premises_punitive_damages`) had **zero**
entries in the citation bench, unlike every other category. Confirmed directly:
none of these keys appear in `claim_citations.json`, `claim_citations_v2.json`, or
`claim_citations_final.json`, and no `citations_premises_liability.json` existed
under `research/` the way every other category has one. This directly contradicted
the product's own "grounded in real cited outcomes" claim for this category.

Real, per-state *doctrine* research already existed and is live
(`js/case-valuation-data.js`'s `premisesLiabilityStateModifiers`, backed by
`research/premises_merged_final.json` and related files) — the gap was
specifically the *outcome/dollar-amount citation bench* used for damages
calibration and shown to users, not the legal-doctrine research.

## Process

Four parallel research passes, one per claim type (`premises_punitive_damages`
skipped — it's a cross-cutting damages enhancement, not its own fact pattern, and
no directly-on-point punitive-damages-in-premises-liability case distinct from the
underlying claim types turned up). Each pass ran ~15 targeted WebSearch queries
varying fact pattern, venue, and framing, then used WebFetch to independently load
and verify every candidate source before including it — matching the same
verify-before-including discipline as the rest of the citation bench.

**Result: 14 real, sourced citations across the 4 claim types** (4 slip-and-fall, 4
inadequate-security, 3 negligent-maintenance, 3 failure-to-warn). See
`citations_premises_liability.json` for the full entries in the standard
`{caseName, citation, year, outcome, dollarAmount, sourceUrl, confidence}` shape.

## What was rejected, and why

Every research pass rejected multiple candidates rather than pad the count:
- Cases where the only source was a law firm's own case-results page with facts
  that contradicted an attempted independent corroboration (e.g. Valenti v.
  Central Parking System — excluded outright).
- Cases matching a searched headline but not the actual claim-type theory on
  closer reading (e.g. several "failure to warn" leads that turned out, on
  verification, to be ordinary failure-to-maintain claims; the Lowe's Oregon
  verdict where the shooter was the store's own security guard, not a third
  party).
- Widely-repeated dollar figures with no locatable primary or independently
  fetchable source at all.
- Residential-only fact patterns (apartment complexes), screened out since this
  bench is for *commercial* premises liability specifically — several strong
  $3.5M-$50M apartment-complex negligent-security verdicts were found and
  deliberately excluded on this basis.

## Confidence levels and known limitations

- **High confidence (8 of 14)**: independently corroborated across 2+ unrelated
  sources (news outlets, court records, or a real appellate reporter citation).
  Wosinski v. Advance Cast Stone Co. is the only entry with a full appellate
  opinion citation (2017 WI App 51) — the others resolved as jury verdicts or
  settlements with no published opinion to cite.
- **Medium confidence (5 of 14)**: real, plausible, and internally consistent,
  but sourced only through a single law firm's own case-results page or a
  paywalled primary source verified only via a secondary quote, with no
  independent docket number located.
- **Low confidence (1 of 14)**: the Kroger settlement — self-reported by the
  handling firm, no docket number, no exact date, no independent corroboration.
  Kept (rather than dropped) because the fact pattern and figure are specific
  and plausible, but flagged clearly for whoever reviews this before it's
  merged into the live citation bench.
- The Kinkisharyo slip-and-fall entry ($58.4M) is a genuine outlier — an
  industrial (not retail) facility, with a large punitive-damages component tied
  to an employment-status dispute — flagged in its own `outcome` text as not a
  typical comp.

## What still needs to happen before this is live

This file is research output only — it is NOT yet in the live citation bench the
Case Value Calculator's edge function actually reads from (`private_case_citations`,
a private RLS-locked Supabase table; see
`supabase/migrations/20260911_private_case_citations_schema.sql`). Merging it in
requires reading the table's CURRENT live contents first (not just assuming this
repo's local `claim_citations_final.json` is still an exact match) and writing a
single UPSERT that replaces the whole `citations` column with the old data plus
these 14 new entries merged in — getting that merge wrong would silently overwrite
every other category's real research, not just add to this one. See the parent
conversation for the exact SQL Jeff needs to run.
