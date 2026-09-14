# Claim Valuation Rules — Design Doc (v2: All 8 CRE Litigation Categories)

This defines the actual probability/damages logic before it gets encoded into
the JS engine. Every base rate below is a starting estimate to be refined once
the research agents' comparable-case data is in — nothing here is final.

v2 note: the tool now covers all 8 categories tracked on CREdocket, not just
lease/eviction disputes. The user picks their category first; only that
category's claim types and role labels (sideA/sideB) are shown. The full
machine-readable spec lives in engine_spec.json, nested under
`categories.<slug>.claimTypes` — this doc is the human-readable rationale
behind those numbers. The original "landlord-side"/"tenant-side" claims below
are the lease-disputes category; the other 6 categories are documented in
their own sections further down.

## Methodology stance (for the tool's own "how this works" page)
This is a structured, rules-based expected-value model, calibrated against
verified state law and real cited case outcomes — not a black-box statistical
prediction. That's a deliberate choice: with the data actually available
(public case law, not a licensed analytics platform), a transparent,
explainable framework is both more honest and more defensible than a fake-precise
ML number. Every probability and damages range in the output should be
traceable to (a) the specific state-law rule driving it, and/or (b) a cited
comparable case.

## Claims modeled (v1)

### Landlord-side
1. `unpaid_rent` — accrued, undisputed rent
2. `accelerated_rent` — future/remaining-term rent
3. `holdover_damages` — statutory double/treble rent for overstaying
4. `attorney_fees` — contractual fee-shifting
5. `property_damage` — repair costs beyond normal wear

### Tenant-side
6. `wrongful_lockout` — unlawful self-help / improper statutory process
7. `quiet_enjoyment_breach` — constructive eviction / failure to repair / interference
8. `security_deposit` — wrongfully withheld deposit

## Per-claim logic

### unpaid_rent
- Applies if: landlord role, unpaid rent amount > 0
- Base probability: 0.90–0.97 (undisputed debt on a written lease is close to open-and-shut)
- Modifier: tenant disputes the debt (e.g., claims rent abatement due to landlord breach) → 0.55–0.75
- Modifier: no written lease → 0.40–0.60
- Damages: = user-entered accrued unpaid rent (not itself a range — it's a stated fact); the *probability* is what's uncertain, not the amount

### accelerated_rent
- Applies if: landlord role, lease terminated/tenant vacated, remaining term > 0
- Gate: lease has acceleration clause (user input yes/no/unsure)
  - No/unsure → base probability 0.15–0.30 (courts are reluctant to imply acceleration)
  - Yes → base probability 0.65–0.90, per state acceleration enforceability note
- Damages base: remaining_months × monthly_rent
- Damages modifier: state `mitigationDuty` = Yes → apply a mitigation offset (default 30–50% reduction, refine from comparable cases showing actual re-letting outcomes); `mitigationDuty` = No → little/no offset; `Unclear` → moderate offset with a flag to confirm locally
- Damages modifier: if landlord has already re-let (user input) → offset by actual new rent received over the overlapping period, not the estimated default

### holdover_damages
- Applies if: landlord role, tenant held over after term expired, state `holdoverStatutoryPenalty` = true
- Base probability: 0.80–0.95 (statutory, fact usually clear-cut once holdover is established)
- Damages: monthly_rent × statutory_multiplier (2x or 3x, from the specific state's rule — pull exact multiplier from handbook chapter text, don't assume) × holdover_months

### attorney_fees
- Applies if: lease has fee-shifting clause (user input)
- Probability: tied to a weighted average of the probabilities of the *other* claims being pursued in the same matter (fees typically follow success on the merits)
- Damages: ratio-of-principal heuristic from comparable cases (design note: research the actual typical ratio; don't invent one) applied to the sum of the other claims' expected damages

### property_damage
- Applies if: landlord role, damage amount entered > 0
- Base probability: 0.70–0.90 (photographic/inspection evidence typically strong, but normal-wear-and-tear disputes are common)
- Damages: user-entered estimate, minus a normal-wear-and-tear haircut (default 10–20%)

### wrongful_lockout
- Applies if: tenant role, self-help/lockout occurred
- Base probability driven almost entirely by state `selfHelpAvailable`:
  - `Not Available` and landlord used self-help → 0.85–0.95
  - `Available`/`Conditional` and landlord followed the statutory process correctly (user confirms notice requirements met) → 0.10–0.25
  - `Conditional` and process NOT followed correctly → 0.60–0.80
  - `Uncertain` (we flagged this in the handbook itself) → wide range, 0.30–0.60, with an explicit "state law on this point is itself unsettled" note
- Damages: actual damages (relocation, lost inventory, provable lost profits — subject to any lease waiver of consequential damages) + statutory penalty multiplier if the state imposes one (pull exact multiplier from handbook chapter)

### quiet_enjoyment_breach
- Applies if: tenant role, failure-to-repair/interference facts entered
- Base probability: 0.40–0.65 (fact-intensive, generally harder than a clean self-help violation)
- Modifier: tenant gave landlord notice and opportunity to cure, landlord failed to act → +0.10–0.15
- Damages: informed by comparable cases; lost-profits component zeroed out and flagged if lease has a consequential-damages waiver (user input)

### security_deposit
- Applies if: tenant role, deposit amount entered, withheld without (or with disputed) itemization
- Note: unlike residential deposits, most states do NOT have a specific commercial-security-deposit statute — this claim is usually a straight breach-of-lease-terms question, not a statutory one. Keep the model lease-driven, not state-driven, and say so explicitly in the UI.
- Base probability: 0.55–0.80, adjusted by whether landlord provided any itemization at all
- Damages: = deposit amount; note any state that does impose a doubling penalty for bad-faith withholding (check per state before asserting one exists)

## Category: Lending & Foreclosure (`sideA` = Lender, `sideB` = Borrower/Guarantor)

### foreclosure_deficiency_judgment
- Applies if: lender role, loan in default, foreclosure filed
- Base probability: 0.85–0.97 (very high once default is undisputed, same logic as unpaid_rent)
- Modifier: borrower disputes the default itself (payment-application dispute, alleged lender breach) → 0.60–0.80
- Damages: outstanding balance + accrued interest/fees, minus foreclosure-sale proceeds. Note: deficiency-judgment AVAILABILITY itself varies by state and foreclosure method (some states bar it after a non-judicial/power-of-sale foreclosure) — this needs a state-law modifier, same pattern as the eviction handbook's self-help availability.

### receivership_dispute
- Applies if: lender role, receivership motion filed
- Base probability GRANTED: 0.55–0.80 (wide range — PRELIMINARY, refine heavily; grant rates likely track each state's receivership statute and how clear the dissipation/endangerment showing is)
- Not a damages claim — operational-control relief, not a dollar figure

### guaranty_enforcement
- Applies if: lender role, guaranty carve-out trigger event alleged
- Base probability: 0.40–0.65 — wide because the guaranty's enforceability once triggered isn't usually contested; PROVING the trigger event (fraud, waste, unauthorized transfer, environmental event) is the real fight
- Damages: full guaranteed balance (full-recourse) or trigger-specific loss amount (springing/partial carve-out)

### lender_liability_claim
- Applies if: borrower role, alleging lender misconduct (fraud, bad-faith, wrongful acceleration)
- Base probability: 0.15–0.35 (lender-liability doctrine is historically borrower-unfriendly absent clear bad faith)
- Damages: comparable-case-informed range; consequential/lost-profit damages often capped by loan-agreement waivers

## Category: REIT & Real Estate Securities (`sideA` = Shareholder/Class, `sideB` = REIT/Board/Sponsor)

### securities_fraud_10b5
- Applies if: alleging material misrepresentation/omission causing a stock-price drop
- Base probability: 0.35–0.55 (blends a meaningful motion-to-dismiss dismissal rate with a very high settlement rate for cases that survive)
- Damages: settlement as a percentage of estimated investor losses, roughly 2–8% (PRELIMINARY — smaller cases historically settle for a higher percentage than mega-cases; refine by claim size)
- Primary real-data source: Stanford Securities Class Action Clearinghouse (securities.stanford.edu) — a free, comprehensive database of actual settlement figures. This is the strongest free real-data source anywhere in this whole tool.

### breach_fiduciary_duty_derivative
- Applies if: shareholders derivatively alleging board/sponsor breach
- Base probability of a CASH recovery: 0.20–0.40 (business-judgment-rule deference means many derivative suits resolve as "disclosure-only"/governance-therapeutics settlements with no cash to the REIT)
- Damages: cash recovery to the entity if any; note the non-cash-resolution possibility explicitly in the UI

### proxy_disclosure_claim
- Applies if: alleging a material omission in proxy/vote materials (e.g. the Lightstone REIT liquidity-vote matter already tracked on this site)
- Base probability: 0.30–0.55
- Damages: injunctive (block/delay the vote) pre-vote, or investor-loss-based damages post-vote

### merger_objection_suit
- Applies if: objecting to merger/sale terms
- Base probability of REAL shareholder recovery: 0.10–0.25 — most of these resolve via a "mootness fee" to plaintiff's counsel (often $75K–$500K) rather than any actual per-share shareholder recovery; flag this distinction explicitly in the UI so it isn't misread as a shareholder payout

## Category: Construction Defect (`sideA` = Owner/Developer, `sideB` = Contractor/Design Professional)

### contractor_breach_negligence
- Applies if: defect alleged against the general contractor
- Base probability: 0.55–0.80 (physical/inspection evidence usually strong)
- Damages: repair-cost estimate minus a normal-wear/pre-existing-condition haircut (5–15%)

### design_professional_malpractice
- Applies if: design error alleged against architect/engineer
- Base probability: 0.35–0.60 (harder than a workmanship defect — expert-testimony-dependent professional-standard-of-care question)
- Damages: repair + redesign cost estimate

### indemnification_contribution_claim
- Applies if: multiple responsible parties, indemnity clause exists
- Base probability: 0.40–0.70 (heavily contract-language-dependent; some states restrict or void broad-form indemnity by statute)
- Damages: allocated share of the underlying defect damages

### insurance_coverage_defect_dispute
- Applies if: insurer denied/disputed CGL coverage
- Base probability coverage found: 0.45–0.65 ("occurrence" and business-risk-exclusion interpretation varies significantly by state)
- Damages: covered portion of the underlying defect damages

## Category: Environmental (`sideA` = Owner/PRP, `sideB` = Government/Other PRPs/Insurer)

### cercla_cost_recovery
- Applies if: contamination identified, cleanup costs incurred
- Base probability of at least partial recovery: 0.65–0.85 (CERCLA liability is strict/joint/several once PRP status attaches — allocation share is the contested question, not liability itself)
- Damages: total cleanup cost × allocation share (equitable factors under CERCLA § 113(f) — fact-specific, refine typical allocation patterns from research)

### cercla_contribution_claim
- Applies if: multiple PRPs, one paid a disproportionate share
- Base probability: 0.55–0.80
- Damages: total cleanup cost × co-defendant's equitable share

### state_cleanup_consent_decree
- Not an adversarial win/lose claim — nearly all consent decrees are cooperative, negotiated resolutions. Model as a cleanup-cost BENCHMARK lookup by contamination type/site size (from EPA/DOJ settlement data), not a probability × damages calculation. Example already tracked on this site: Columbia Falls Aluminum, $57.6M consent decree.

### environmental_insurance_coverage_dispute
- Applies if: insurer denied environmental coverage
- Base probability coverage found: 0.30–0.55 (pollution-exclusion and "sudden and accidental" language interpretation varies significantly by jurisdiction and policy era)
- Damages: covered portion of cleanup costs

## Category: Eminent Domain (`sideA` = Property Owner, `sideB` = Condemning Authority)

### just_compensation_valuation
- Best modeled as a VALUATION-UPLIFT BENCHMARK, not a win/lose probability — the property is being taken either way; the litigated question is how much more than the initial offer the owner ultimately recovers.
- Formula: `finalAward = initialOffer × (1 + upliftPercentage)`, upliftPercentage 15–55% (PRELIMINARY — this is the single most important number in this whole category, refine heavily from real condemnation-award research)

### quick_take_challenge
- Applies if: owner challenges the taking itself (not just valuation) — public-use/necessity challenge
- Base probability of blocking the taking: 0.05–0.15 (courts are highly deferential post-Kelo)
- Not a damages claim — injunctive relief blocking/delaying the taking

### pre_condemnation_access_dispute
- Applies if: owner opposes a survey/access request (e.g. the PSEG Renewable Transmission v. Arentz Family matter already tracked on this site)
- Base probability of successfully blocking access: 0.10–0.25 — courts have generally allowed pre-condemnation survey access under state right-of-entry statutes
- Not typically a damages claim pre-taking

### regulatory_taking
- Applies if: alleging a regulatory action eliminated or severely impaired value (Penn Central/Lucas-style)
- Base probability: 0.10–0.25 (rarely succeeds absent a near-total wipeout of economic value)
- Damages: fair market value of the interest taken

## Category: Zoning & Land Use (`sideA` = Property Owner/Developer, `sideB` = Municipality)

### variance_permit_denial_appeal
- Applies if: variance/permit denied, appeal filed
- Base probability of reversal: 0.25–0.45 (zoning boards get significant judicial deference)
- Not typically a damages claim — injunctive relief (permit ordered granted) or remand

### spot_zoning_challenge
- Applies if: a zoning change is challenged as improper spot zoning
- Base probability: 0.15–0.35
- Not typically a damages claim — declaratory relief invalidating the change

### section_1983_zoning_claim
- Applies if: alleging an arbitrary or discriminatory zoning action, brought as a federal civil-rights claim
- Base probability: 0.10–0.25 (qualified immunity + rational-basis review make these hard to win)
- Damages: compensatory (lost value/profits) + attorney's fees — MANDATORY fee-shifting under 42 U.S.C. § 1988 for a prevailing plaintiff, which materially changes the expected-value math versus a routine zoning appeal

### development_agreement_breach
- Applies if: a development agreement is allegedly breached (by either the developer or the municipality)
- Base probability: 0.45–0.70 (ordinary contract-law dynamics)
- Damages: comparable-case-informed range (lost development profit, cost overruns, or reliance damages depending on posture)

## Aggregation
- `expected_value(claim) = probability_range × damages_range` → produces a range, not a point estimate
- User picks their category first; only that category's claim types and sideA/sideB role labels apply
- `sideA_total = sum of sideA-favoring claims' expected values` (within the selected category)
- `sideB_total = sum of sideB-favoring claims' expected values`
- `net_position = sideA_total - sideB_total` (presented from whichever side the user identified as)
- Claims marked "benchmark only" (currently just `state_cleanup_consent_decree`) are shown as a comparable-outcome range alongside the main result, not folded into the net-position math — they're negotiated/cooperative resolutions, not adversarial win/lose outcomes
- Always present as a range (low/mid/high), never a single number, and always show the per-claim breakdown driving it
