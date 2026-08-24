// =========================================================
// CREdocket -- Litigation Value Estimator: AI document analysis
//
// COST-PROTECTION DESIGN -- read before changing the order of checks:
// 1. Verify the caller's identity from their Supabase auth token.
// 2. Compute their remaining credit balance: sum(credits_granted)
//    across every case_valuation_purchases row for this user, minus
//    all-time usage from case_valuation_analyses. Zero purchased ->
//    402 payment_required. Balance exhausted -> 402
//    no_credits_remaining. Either way, no Claude call is ever made.
//    (One-time credits are cumulative and never expire; a future
//    monthly-subscription plan_type would check usage within the
//    current billing period instead -- not wired up yet.)
// 3. Separately, a small daily burst cap (not tied to credits) guards
//    against a compromised account or scripting bug hammering this
//    endpoint faster than any real user would, even with real credits
//    remaining. Over the cap -> 429, no Claude call is ever made.
// 4. Only after BOTH checks pass does this function log the attempt
//    (consuming one credit) and call Claude. The log write happens
//    before the Claude call (reserving the slot), not after -- a
//    failed analysis still consumes a credit. That's a deliberate
//    choice: it's safer to slightly under-serve a legitimate user on
//    a bad day than to leave a retry loop able to mint free credits.
//
// ANALYSIS PIPELINE -- numbers are deterministic, only the writeup is AI:
//   1. Extraction pass (Haiku 4.5, no thinking, structured JSON output)
//      -- pulls the same category-specific facts out of the uploaded
//      document that the manual-entry form on case-valuation.html asks
//      for by hand (see CATEGORY_FIELDS below, kept in sync with
//      QUESTIONS in js/case-valuation.js), plus which side the
//      document was filed by/represents.
//   2. The SAME deterministic rules engine the manual-entry tool uses
//      (ported below from js/case-valuation-engine.js -- do not let
//      these drift apart) runs against the extracted facts. This is
//      the load-bearing design choice: probabilities, damages ranges,
//      and case citations are computed identically whether a user
//      fills out the form by hand or uploads a document -- Claude
//      never invents a number or a citation.
//   3. Narrative pass (Opus 5, adaptive thinking, structured JSON
//      output) -- given ONLY the already-computed claims/citations/net
//      position, writes the reasoned, judgment-style explanation the
//      user actually asked for: facts, reasoning tied to the cited
//      precedent, a clear bottom-line call. Framed explicitly as a
//      probability-weighted prediction, not styled as an adjudication
//      (see the system prompt below) -- this is deliberate, not a
//      hedge: it preserves the analytical depth the user wanted while
//      staying clear of unauthorized-practice-of-law exposure.
//
// Model choice / cost: Haiku 4.5 extraction (~$0.02/analysis) + Opus 5
// narrative (~$0.03-0.06/analysis) comes to roughly $0.05-0.08 in
// Claude API cost against a $4.90/credit price point ($49 / 10
// credits) -- healthy margin even at Opus-tier quality for the
// reasoning pass, which is the part users are actually paying to see.
// Drop the narrative model to claude-sonnet-5 below if you want a
// wider margin instead; extraction should stay on Haiku regardless.
//
// Deploy: Supabase Dashboard -> Edge Functions -> case-valuation-analyze
//   -> Code tab -> select all, delete, paste this file's contents, deploy.
//
// Secrets needed (Dashboard -> Edge Functions -> Secrets, project-wide):
//   ANTHROPIC_API_KEY -- from console.anthropic.com, your own account.
//                        Not set -> this function 501s with a clear
//                        "not configured" message, the safe failure mode.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// DAILY_BURST_CAP below is a burst-abuse governor, separate from the
// actual credit balance -- adjust once real usage patterns are visible.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "npm:@anthropic-ai/sdk@0.120";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const DAILY_BURST_CAP = 15;
const MAX_DOC_CHARS = 50000; // server-side mirror of the client-side cap -- never trust the client alone
const CASE_DATA_URL = "https://credocket.com/js/case-valuation-data.js";
const NARRATIVE_MODEL = "claude-opus-5"; // swap to "claude-sonnet-5" for a wider cost margin
const EXTRACTION_MODEL = "claude-haiku-4-5";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// =========================================================
// Case data (spec + real citations + state-law modifiers) -- fetched
// live from the deployed site rather than duplicated here, so this
// function never drifts out of sync with the ~2,300-line dataset the
// manual-entry tool ships (regenerated by the digest/research process
// independently of this file). Cached per warm instance.
// =========================================================
type CaseData = {
  spec: { categories: Record<string, { label: string; roles: { sideA: string; sideB: string }; claimTypes: Record<string, { side: string }> }> };
  citations: Record<string, { caseName: string; sourceUrl: string; year?: number; dollarAmount?: number }[]>;
  stateLawModifiers: Record<string, { mitigationDuty?: string; holdoverStatutoryPenalty?: boolean; selfHelpAvailable?: string }>;
};

let cachedCaseData: CaseData | null = null;
async function loadCaseData(): Promise<CaseData> {
  if (cachedCaseData) return cachedCaseData;
  const res = await fetch(CASE_DATA_URL);
  if (!res.ok) throw new Error(`Could not load case data (${res.status})`);
  const raw = await res.text();
  const jsonStr = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
  cachedCaseData = JSON.parse(jsonStr) as CaseData;
  return cachedCaseData;
}

// =========================================================
// Deterministic valuation engine -- a straight port of
// js/case-valuation-engine.js. KEEP THESE IN SYNC: if the rules
// engine changes on the client, mirror the change here too, or the
// AI-assisted path and the manual-entry path will silently disagree.
// =========================================================
type Facts = Record<string, unknown>;
type Claim = {
  claimKey: string;
  label: string;
  probability: [number, number];
  damagesRange: [number, number] | null;
  expectedValueRange: [number, number] | null;
  note: string;
  isBenchmark: boolean;
  citations: { caseName: string; sourceUrl: string; year?: number; dollarAmount?: number }[];
};

function num(f: Facts, k: string): number {
  const v = f[k];
  return typeof v === "number" && !Number.isNaN(v) ? v : 0;
}
function bool(f: Facts, k: string): boolean {
  return f[k] === true;
}
function str(f: Facts, k: string): string | undefined {
  const v = f[k];
  return typeof v === "string" ? v : undefined;
}

function makeResult(
  citations: CaseData["citations"],
  claimKey: string, label: string, probRange: [number, number],
  damagesLow: number | null, damagesHigh: number | null, note?: string, isBenchmark?: boolean,
): Claim {
  return {
    claimKey, label,
    probability: probRange,
    damagesRange: damagesLow != null ? [damagesLow, damagesHigh as number] : null,
    expectedValueRange: damagesLow != null ? [probRange[0] * damagesLow, probRange[1] * (damagesHigh as number)] : null,
    note: note || "",
    isBenchmark: !!isBenchmark,
    citations: citations[claimKey] || [],
  };
}

function evalLeaseDisputes(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string, b?: boolean) => R2(cit, k, l, p, lo, hi, n, b);
  if (num(f, "unpaidRentAmount") > 0) {
    let p: [number, number] = [0.90, 0.97];
    if (bool(f, "tenantDisputesDebt")) p = [0.55, 0.75];
    else if (f.hasWrittenLease === false) p = [0.40, 0.60];
    out.push(R("unpaid_rent", "Unpaid Rent", p, num(f, "unpaidRentAmount"), num(f, "unpaidRentAmount")));
  }
  if (bool(f, "leaseTerminated") && num(f, "remainingMonths") > 0 && num(f, "monthlyRent") > 0) {
    const p: [number, number] = str(f, "hasAccelerationClause") === "yes" ? [0.65, 0.90] : [0.15, 0.30];
    const base = num(f, "remainingMonths") * num(f, "monthlyRent");
    let lowOffset = 0.05, highOffset = 0.50;
    if (str(f, "mitigationDuty") === "No") { lowOffset = 0; highOffset = 0.05; }
    else if (str(f, "mitigationDuty") === "Unclear") { lowOffset = 0.15; highOffset = 0.35; }
    let low = base * (1 - highOffset), high = base * (1 - lowOffset);
    if (bool(f, "hasRelet") && num(f, "reletRentAmount") >= 0) {
      low = high = base - num(f, "reletRentAmount");
    }
    out.push(R("accelerated_rent", "Accelerated / Future Rent", p, Math.max(0, low), Math.max(0, high)));
  }
  if (bool(f, "heldOverAfterTerm") && bool(f, "holdoverStatutoryPenalty") && num(f, "monthlyRent") > 0 && num(f, "holdoverMonths") > 0) {
    out.push(R("holdover_damages", "Statutory Holdover Damages", [0.80, 0.95],
      num(f, "monthlyRent") * 2 * num(f, "holdoverMonths"), num(f, "monthlyRent") * 3 * num(f, "holdoverMonths"),
      "Uses a 2x-3x statutory multiplier range as a placeholder -- the exact multiplier is state-specific and should be confirmed against that state's chapter."));
  }
  if (num(f, "propertyDamageAmount") > 0) {
    out.push(R("property_damage", "Property Damage / Repairs", [0.70, 0.90],
      num(f, "propertyDamageAmount") * 0.80, num(f, "propertyDamageAmount") * 0.90,
      "Reduced for a typical 10-20% normal-wear-and-tear haircut."));
  }
  if (bool(f, "selfHelpUsed")) {
    const sh = str(f, "selfHelpAvailable");
    let p: [number, number];
    if (sh === "Not Available") p = [0.85, 0.95];
    else if ((sh === "Available" || sh === "Conditional") && str(f, "selfHelpProcessFollowed") === "yes") p = [0.10, 0.25];
    else if (sh === "Conditional" && str(f, "selfHelpProcessFollowed") === "no") p = [0.60, 0.80];
    else p = [0.30, 0.60];
    if (num(f, "wrongfulLockoutDamages") > 0) {
      out.push(R("wrongful_lockout", "Wrongful Eviction / Unlawful Lockout", p,
        num(f, "wrongfulLockoutDamages"), num(f, "wrongfulLockoutDamages") * (bool(f, "holdoverStatutoryPenalty") ? 2 : 1.3),
        "High end assumes a state statutory penalty multiplier applies -- confirm against that state's chapter."));
    } else {
      out.push(R("wrongful_lockout", "Wrongful Eviction / Unlawful Lockout", p, null, null,
        "No damages amount entered -- probability shown reflects state self-help law and whether statutory process was followed."));
    }
  }
  if (bool(f, "repairFailureOrInterferenceClaimed")) {
    const p: [number, number] = bool(f, "gaveCureNoticeLandlordFailedToAct") ? [0.50, 0.80] : [0.40, 0.65];
    out.push(R("quiet_enjoyment_breach", "Breach of Quiet Enjoyment / Constructive Eviction", p, null, null,
      "Fact-intensive claim, informed by comparable cases rather than a formula -- see cited cases."));
  }
  if (num(f, "depositAmount") > 0 && bool(f, "depositDisputed")) {
    const p: [number, number] = !bool(f, "landlordProvidedItemization") ? [0.65, 0.90] : [0.55, 0.80];
    out.push(R("security_deposit", "Wrongfully Withheld Security Deposit", p, num(f, "depositAmount"), num(f, "depositAmount"),
      "Most states have no commercial-specific deposit statute -- this is usually a straight lease-terms question, not a statutory one."));
  }
  if (bool(f, "hasFeeShiftingClause") && out.length) {
    const avgP = out.reduce((s, c) => s + (c.probability[0] + c.probability[1]) / 2, 0) / out.length;
    const principalLow = out.reduce((s, c) => s + (c.damagesRange ? c.damagesRange[0] : 0), 0);
    const principalHigh = out.reduce((s, c) => s + (c.damagesRange ? c.damagesRange[1] : 0), 0);
    out.push(R("attorney_fees", "Attorney's Fees", [avgP * 0.9, Math.min(0.97, avgP * 1.05)],
      principalLow * 0.15, principalHigh * 0.40, "Ratio-of-principal heuristic (15-40% of the other claims' damages) -- refine against comparable-case fee awards."));
  }
  return out;
}

function evalLendingForeclosure(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string) => R2(cit, k, l, p, lo, hi, n);
  if (num(f, "loanBalance") > 0 && bool(f, "foreclosureFiled")) {
    const p: [number, number] = bool(f, "borrowerDisputesDefault") ? [0.60, 0.80] : [0.85, 0.97];
    const advances = num(f, "lenderAdvances");
    const proceeds = num(f, "saleProceeds");
    const gross = num(f, "loanBalance") + advances;
    out.push(R("foreclosure_deficiency_judgment", "Foreclosure / Deficiency Judgment", p,
      Math.max(0, gross - proceeds), Math.max(0, gross - proceeds * 0.5),
      "Recovery against the judgment varies enormously by asset quality -- real sample ranged from ~0% to ~100% of claimed debt."));
  }
  if (bool(f, "receivershipMotionFiled")) {
    out.push(R("receivership_dispute", "Receivership Grant/Denial", [0.65, 0.85], null, null,
      "Not a dollar claim -- operational-control relief. 5 of 6 sampled real matters resulted in a receiver appointed."));
  }
  if (bool(f, "guarantyTriggerAlleged") && num(f, "guaranteedBalance") > 0) {
    out.push(R("guaranty_enforcement", "Guaranty Enforcement", [0.70, 0.92],
      num(f, "guaranteedBalance") * 0.85, num(f, "guaranteedBalance"),
      "Once a carve-out trigger is credibly found, sampled real cases show guarantors held fully liable even for technical/non-fraud breaches."));
  }
  if (bool(f, "lenderMisconductAlleged")) {
    out.push(R("lender_liability_claim", "Lender Liability (borrower-asserted)", [0.15, 0.35], null, null,
      "Historically borrower-unfriendly absent clear bad faith; recent real cases trend toward procedural wins rather than dollar outcomes."));
  }
  return out;
}

function evalReitSecurities(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string) => R2(cit, k, l, p, lo, hi, n);
  if (bool(f, "stockDropAlleged") && num(f, "estimatedInvestorLosses") > 0) {
    const tier = bool(f, "hasCriminalConductOrAuditorOrControllingShareholder");
    const pctRange: [number, number] = tier ? [0.10, 0.25] : [0.03, 0.08];
    out.push(R("securities_fraud_10b5", "Securities Fraud (Rule 10b-5)", [0.35, 0.55],
      num(f, "estimatedInvestorLosses") * pctRange[0], num(f, "estimatedInvestorLosses") * pctRange[1],
      tier ? "Criminal conduct / auditor / controlling-shareholder self-dealing present -- settlements run an order of magnitude higher than a clean case." : "Clean stock-drop fact pattern -- typical range is 3-8% of estimated investor losses."));
  }
  if (bool(f, "boardBreachAlleged")) {
    const specific = bool(f, "tiedToConcreteSelfDealingTransaction");
    const p: [number, number] = specific ? [0.55, 0.80] : [0.05, 0.15];
    out.push(R("breach_fiduciary_duty_derivative", "Breach of Fiduciary Duty (Derivative)", p, null, null,
      specific ? "Tied to a concrete, quantifiable self-dealing transaction -- real recoveries in this pattern ran $15M-$90M." : "Generic governance complaint with no specific self-dealing transaction -- real cases in this pattern settled for governance changes only, with no disclosed cash recovery."));
  }
  if (bool(f, "proxyOmissionAlleged")) {
    const specific = bool(f, "specificInsiderStakeAlleged");
    const p: [number, number] = specific ? [0.55, 0.80] : [0.10, 0.25];
    out.push(R("proxy_disclosure_claim", "Proxy Disclosure Claim", p, null, null,
      specific ? "A specific, quantifiable undisclosed insider stake was alleged -- this pattern survived dismissal and drew real cash settlements in the research sample." : "Only a generic, already-disclosed industry risk is alleged -- this pattern was dismissed for lack of materiality in the research sample."));
  }
  if (bool(f, "mergerObjection")) {
    out.push(R("merger_objection_suit", "Merger Objection Suit", [0.10, 0.25], 75000, 500000,
      "Real recovery is rare; when a settlement happens it's typically a 'mootness fee' to plaintiff's counsel, not a per-share shareholder payout."));
  }
  return out;
}

function evalConstructionDefect(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string) => R2(cit, k, l, p, lo, hi, n);
  if (bool(f, "contractorDefectAlleged") && num(f, "repairCostEstimate") > 0) {
    const catastrophic = bool(f, "catastrophicOrLifeSafety");
    out.push(R("contractor_breach_negligence", "Contractor Breach / Negligence",
      [catastrophic ? 0.70 : 0.55, catastrophic ? 0.90 : 0.80],
      num(f, "repairCostEstimate") * 0.85, num(f, "repairCostEstimate") * 0.95,
      catastrophic ? "Catastrophic/life-safety failures anchor the top of the real-case range ($39M-$997M in the research sample)." : "Post-occupancy latent defects clustered $10M-$116M in the research sample; defect pervasiveness across units mattered more than unit count."));
  }
  if (bool(f, "designErrorAlleged") && num(f, "repairCostEstimate") > 0) {
    out.push(R("design_professional_malpractice", "Design Professional Malpractice", [0.35, 0.60],
      num(f, "repairCostEstimate") * 0.6, num(f, "repairCostEstimate") * 0.9,
      "Harder to prove than a workmanship defect -- expert-testimony-dependent standard-of-care question."));
  }
  if (bool(f, "multiplePartiesIndemnityExists") && num(f, "repairCostEstimate") > 0) {
    out.push(R("indemnification_contribution_claim", "Indemnification / Contribution", [0.40, 0.70],
      num(f, "repairCostEstimate") * 0.10, num(f, "repairCostEstimate") * 0.88,
      "Real allocation example: an 88%/10%/2% subcontractor/GC/owner split when the defect traced to specific subcontractor workmanship."));
  }
  if (bool(f, "insurerDeniedCoverage")) {
    out.push(R("insurance_coverage_defect_dispute", "Insurance Coverage Dispute (CGL)", [0.45, 0.65], null, null,
      "Coverage disputes usually resolve the legal question (duty to defend/indemnify) rather than a dollar figure -- treat this as a coverage yes/no signal."));
  }
  return out;
}

function evalEnvironmental(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string, b?: boolean) => R2(cit, k, l, p, lo, hi, n, b);
  if (num(f, "cleanupCostsIncurred") > 0) {
    out.push(R("cercla_cost_recovery", "CERCLA Cost Recovery", [0.65, 0.85], num(f, "cleanupCostsIncurred") * 0.5, num(f, "cleanupCostsIncurred"),
      "Liability is strict/joint/several once PRP status attaches -- allocation share is the real question, not whether liability exists at all."));
  }
  if (bool(f, "multiplePRPs") && num(f, "cleanupCostsIncurred") > 0) {
    out.push(R("cercla_contribution_claim", "CERCLA Contribution (PRP vs. PRP)", [0.55, 0.80],
      num(f, "cleanupCostsIncurred") * 0.20, num(f, "cleanupCostsIncurred") * 0.60,
      "Courts apply equitable factors that typically REDUCE a mechanically-calculated share, and an unrecoverable 'orphan share' for defunct/judgment-proof historical operators is common."));
  }
  if (bool(f, "stateConsentDecree")) {
    out.push(R("state_cleanup_consent_decree", "State Cleanup Order / Consent Decree", [1, 1], null, null,
      "Benchmark only, not an adversarial probability -- nearly all consent decrees are negotiated.", true));
  }
  if (bool(f, "insurerDeniedEnvCoverage")) {
    out.push(R("environmental_insurance_coverage_dispute", "Environmental Insurance Coverage Dispute", [0.25, 0.45], null, null,
      "Sample skewed toward insurers winning on pollution-exclusion grounds. Outcome is usually binary (coverage owed / not owed), not a dollar figure."));
  }
  return out;
}

function evalEminentDomain(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string) => R2(cit, k, l, p, lo, hi, n);
  if (num(f, "initialOffer") > 0) {
    const severance = bool(f, "severanceOrBusinessValueDispute");
    const [loMult, hiMult] = severance ? [2.0, 5.0] : [0.5, 1.0];
    out.push(R("just_compensation_valuation", "Just Compensation Valuation", [1, 1],
      num(f, "initialOffer") * (1 + loMult), num(f, "initialOffer") * (1 + hiMult),
      severance
        ? "Severance/access/business-value disputes ran 2x-5x+ above the initial offer in the research sample (one case ~49x)."
        : "Routine comparable-sales-driven disputes ran ~50-100% above the initial offer in the research sample."));
  }
  if (bool(f, "challengingTheTaking")) {
    out.push(R("quick_take_challenge", "Quick-Take / Public-Use Challenge", [0.05, 0.15], null, null,
      "Courts are highly deferential to public-use determinations post-Kelo -- this rarely blocks a taking outright."));
  }
  if (bool(f, "opposingSurveyAccess")) {
    out.push(R("pre_condemnation_access_dispute", "Pre-Condemnation Survey/Access Dispute", [0.05, 0.20], null, null,
      "Courts consistently allowed survey access once the entity showed a plausible path to eminent-domain authority."));
  }
  if (bool(f, "regulatoryTakingAlleged")) {
    const fmv = num(f, "propertyFairMarketValue");
    out.push(R("regulatory_taking", "Regulatory Taking (Penn Central/Lucas)", [0.10, 0.25],
      fmv > 0 ? fmv * 0.9 : null, fmv > 0 ? fmv : null,
      "Rarely succeeds absent a near-total wipeout of economic value; when it does, damages tend toward full pre-regulation value."));
  }
  return out;
}

function evalZoningLandUse(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string) => R2(cit, k, l, p, lo, hi, n);
  if (bool(f, "varianceOrPermitDenied")) {
    out.push(R("variance_permit_denial_appeal", "Variance / Permit Denial Appeal", [0.25, 0.45], null, null,
      "Zoning boards get significant judicial deference; reversal requires a clear legal or procedural error."));
  }
  if (bool(f, "spotZoningAlleged")) {
    out.push(R("spot_zoning_challenge", "Spot Zoning Challenge", [0.30, 0.50], null, null,
      "Small research sample skewed favorably (3 of 3 succeeded) -- treat cautiously as possibly outcome-selection-biased."));
  }
  if (bool(f, "arbitraryOrDiscriminatoryDenialAlleged")) {
    let p: [number, number] = [0.10, 0.20];
    if (bool(f, "vestedRightPlusBadFaith")) p = [0.45, 0.70];
    else if (bool(f, "longPatternShiftingDemands")) p = [0.35, 0.55];
    else if (bool(f, "noNoticeOrHearing")) p = [0.40, 0.60];
    else if (bool(f, "discriminatoryIntentEvidence")) p = [0.30, 0.50];
    const lostVal = num(f, "lostValueEstimate");
    out.push(R("section_1983_zoning_claim", "Section 1983 Civil Rights Claim", p,
      lostVal > 0 ? lostVal * 0.7 : null, lostVal > 0 ? lostVal : null,
      "Ordinary administrative error is not enough -- only 2 of 8 sampled real cases produced a disclosed recovery. Mandatory fee-shifting under 42 U.S.C. Section 1988 stacks on top of a merits win."));
  }
  if (bool(f, "developmentAgreementBreached") && num(f, "lostValueEstimate") > 0) {
    out.push(R("development_agreement_breach", "Development Agreement Breach", [0.45, 0.70],
      num(f, "lostValueEstimate") * 0.6, num(f, "lostValueEstimate"),
      "Small, success-skewed research sample -- treat the probability range as directional."));
  }
  return out;
}

function R2(cit: CaseData["citations"], claimKey: string, label: string, probRange: [number, number], damagesLow: number | null, damagesHigh: number | null, note?: string, isBenchmark?: boolean): Claim {
  return makeResult(cit, claimKey, label, probRange, damagesLow, damagesHigh, note, isBenchmark);
}

const EVALUATORS: Record<string, (f: Facts, cit: CaseData["citations"]) => Claim[]> = {
  "lease-disputes": evalLeaseDisputes,
  "lending-foreclosure": evalLendingForeclosure,
  "reit-securities": evalReitSecurities,
  "construction-defect": evalConstructionDefect,
  "environmental": evalEnvironmental,
  "eminent-domain": evalEminentDomain,
  "zoning-land-use": evalZoningLandUse,
};

function evaluate(categorySlug: string, facts: Facts, data: CaseData) {
  const fn = EVALUATORS[categorySlug];
  const catSpec = data.spec.categories[categorySlug];
  if (!fn || !catSpec) return { claims: [] as Claim[], sideATotal: [0, 0] as [number, number], sideBTotal: [0, 0] as [number, number], roles: null, categoryLabel: categorySlug };
  const claims = fn(facts, data.citations);
  const sideATotal: [number, number] = [0, 0], sideBTotal: [number, number] = [0, 0];
  for (const c of claims) {
    if (!c.expectedValueRange || c.isBenchmark) continue;
    const claimSpec = catSpec.claimTypes[c.claimKey];
    const side = claimSpec ? claimSpec.side : "sideA";
    if (side === "sideA") { sideATotal[0] += c.expectedValueRange[0]; sideATotal[1] += c.expectedValueRange[1]; }
    else if (side === "sideB") { sideBTotal[0] += c.expectedValueRange[0]; sideBTotal[1] += c.expectedValueRange[1]; }
  }
  return { claims, sideATotal, sideBTotal, roles: catSpec.roles, categoryLabel: catSpec.label };
}

function fmtMoney(n: number): string {
  return n < 0 ? "-$" + Math.round(-n).toLocaleString("en-US") : "$" + Math.round(n).toLocaleString("en-US");
}

// =========================================================
// Per-category extraction fields -- mirrors QUESTIONS in
// js/case-valuation.js. KEEP THESE IN SYNC if that object changes.
// =========================================================
type FieldDef = { key: string; type: "boolean" | "number" | "select" | "state"; label: string; options?: string[] };

const STATE_CODES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia",
  "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland",
  "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey",
  "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia",
];

const CATEGORY_FIELDS: Record<string, FieldDef[]> = {
  "lease-disputes": [
    { key: "state", type: "state", label: "Property state" },
    { key: "unpaidRentAmount", type: "number", label: "Unpaid rent accrued to date ($)" },
    { key: "tenantDisputesDebt", type: "boolean", label: "Does the tenant dispute the debt (e.g. claims rent abatement)?" },
    { key: "hasWrittenLease", type: "boolean", label: "Is there a written lease?" },
    { key: "leaseTerminated", type: "boolean", label: "Has the lease been terminated / tenant vacated?" },
    { key: "remainingMonths", type: "number", label: "Months remaining on the lease term at termination" },
    { key: "monthlyRent", type: "number", label: "Monthly rent ($)" },
    { key: "hasAccelerationClause", type: "select", label: "Does the lease have an acceleration clause?", options: ["yes", "no", "unsure"] },
    { key: "hasRelet", type: "boolean", label: "Has the landlord already re-let the space?" },
    { key: "reletRentAmount", type: "number", label: "If re-let, new rent received over the overlapping period ($)" },
    { key: "heldOverAfterTerm", type: "boolean", label: "Did the tenant hold over after the lease term expired?" },
    { key: "holdoverMonths", type: "number", label: "Months held over" },
    { key: "propertyDamageAmount", type: "number", label: "Property damage / repair costs claimed ($)" },
    { key: "selfHelpUsed", type: "boolean", label: "Did the landlord use self-help (change locks, etc.)?" },
    { key: "selfHelpProcessFollowed", type: "select", label: "If self-help was used, was the state's required process followed?", options: ["yes", "no", "unclear"] },
    { key: "wrongfulLockoutDamages", type: "number", label: "If wrongful lockout: tenant's actual damages claimed ($)" },
    { key: "repairFailureOrInterferenceClaimed", type: "boolean", label: "Is the tenant alleging failure to repair / interference with use?" },
    { key: "gaveCureNoticeLandlordFailedToAct", type: "boolean", label: "Did the tenant give notice and the landlord fail to act?" },
    { key: "depositAmount", type: "number", label: "Security deposit amount ($)" },
    { key: "depositDisputed", type: "boolean", label: "Is the deposit withheld/disputed?" },
    { key: "landlordProvidedItemization", type: "boolean", label: "Did the landlord provide an itemization of deductions?" },
    { key: "hasFeeShiftingClause", type: "boolean", label: "Does the lease have an attorney's-fees (fee-shifting) clause?" },
  ],
  "lending-foreclosure": [
    { key: "loanBalance", type: "number", label: "Outstanding loan balance ($)" },
    { key: "foreclosureFiled", type: "boolean", label: "Has a foreclosure action been filed?" },
    { key: "borrowerDisputesDefault", type: "boolean", label: "Does the borrower dispute the default itself?" },
    { key: "lenderAdvances", type: "number", label: "Lender protective advances -- taxes/insurance paid ($)" },
    { key: "saleProceeds", type: "number", label: "Foreclosure sale proceeds, if known ($)" },
    { key: "receivershipMotionFiled", type: "boolean", label: "Has a receivership motion been filed?" },
    { key: "guarantyTriggerAlleged", type: "boolean", label: "Is a guaranty carve-out trigger event alleged?" },
    { key: "guaranteedBalance", type: "number", label: "Guaranteed loan balance ($)" },
    { key: "lenderMisconductAlleged", type: "boolean", label: "Does the borrower allege lender misconduct?" },
  ],
  "reit-securities": [
    { key: "stockDropAlleged", type: "boolean", label: "Is a stock-price drop tied to a misrepresentation/omission alleged?" },
    { key: "estimatedInvestorLosses", type: "number", label: "Estimated aggregate investor losses ($)" },
    { key: "hasCriminalConductOrAuditorOrControllingShareholder", type: "boolean", label: "Is there criminal conduct, an auditor co-defendant, or controlling-shareholder self-dealing alleged?" },
    { key: "boardBreachAlleged", type: "boolean", label: "Is a board/sponsor fiduciary-duty breach alleged?" },
    { key: "tiedToConcreteSelfDealingTransaction", type: "boolean", label: "Is it tied to a specific, quantifiable self-dealing transaction?" },
    { key: "proxyOmissionAlleged", type: "boolean", label: "Is a material omission in proxy/vote materials alleged?" },
    { key: "specificInsiderStakeAlleged", type: "boolean", label: "Is a specific undisclosed insider financial stake alleged?" },
    { key: "mergerObjection", type: "boolean", label: "Is this a merger/sale-terms objection suit?" },
  ],
  "construction-defect": [
    { key: "contractorDefectAlleged", type: "boolean", label: "Is a defect alleged against the general contractor?" },
    { key: "repairCostEstimate", type: "number", label: "Estimated repair cost ($)" },
    { key: "catastrophicOrLifeSafety", type: "boolean", label: "Is this a catastrophic/structural/life-safety failure?" },
    { key: "designErrorAlleged", type: "boolean", label: "Is a design error alleged against the architect/engineer?" },
    { key: "multiplePartiesIndemnityExists", type: "boolean", label: "Are there multiple responsible parties with an indemnity clause?" },
    { key: "insurerDeniedCoverage", type: "boolean", label: "Has a CGL insurer denied or disputed coverage?" },
  ],
  "environmental": [
    { key: "cleanupCostsIncurred", type: "number", label: "Cleanup/remediation costs incurred or estimated ($)" },
    { key: "contaminationScale", type: "select", label: "Contamination scale", options: ["single-parcel", "multi-decade/waterway", "small-commercial-penalty"] },
    { key: "multiplePRPs", type: "boolean", label: "Are there multiple potentially responsible parties (PRPs)?" },
    { key: "stateConsentDecree", type: "boolean", label: "Is this a state cleanup enforcement action / consent decree?" },
    { key: "insurerDeniedEnvCoverage", type: "boolean", label: "Has an insurer denied environmental coverage?" },
  ],
  "eminent-domain": [
    { key: "initialOffer", type: "number", label: "Condemning authority's initial offer ($)" },
    { key: "severanceOrBusinessValueDispute", type: "boolean", label: "Does the dispute involve severance damages, access loss, or business value?" },
    { key: "challengingTheTaking", type: "boolean", label: "Is the owner challenging the taking itself?" },
    { key: "opposingSurveyAccess", type: "boolean", label: "Is this a pre-condemnation survey/access dispute?" },
    { key: "regulatoryTakingAlleged", type: "boolean", label: "Is a regulatory taking alleged?" },
    { key: "propertyFairMarketValue", type: "number", label: "Property's fair market value, if a regulatory taking is alleged ($)" },
  ],
  "zoning-land-use": [
    { key: "varianceOrPermitDenied", type: "boolean", label: "Was a variance or permit denied and appealed?" },
    { key: "spotZoningAlleged", type: "boolean", label: "Is a rezoning being challenged as improper spot zoning?" },
    { key: "arbitraryOrDiscriminatoryDenialAlleged", type: "boolean", label: "Is an arbitrary or discriminatory zoning denial alleged?" },
    { key: "vestedRightPlusBadFaith", type: "boolean", label: "Was a permit issued, money spent, then the code changed to kill the project?" },
    { key: "longPatternShiftingDemands", type: "boolean", label: "Is there a long pattern of repeated, shifting requirements?" },
    { key: "noNoticeOrHearing", type: "boolean", label: "Was there a complete absence of notice or hearing?" },
    { key: "discriminatoryIntentEvidence", type: "boolean", label: "Is there direct evidence of discriminatory intent?" },
    { key: "lostValueEstimate", type: "number", label: "Estimated lost project/development value ($)" },
    { key: "developmentAgreementBreached", type: "boolean", label: "Is a development agreement alleged to have been breached?" },
  ],
};

function buildExtractionSchema(categorySlug: string) {
  const fields = CATEGORY_FIELDS[categorySlug] || [];
  const properties: Record<string, unknown> = {
    filingParty: {
      type: ["string", "null"],
      enum: ["sideA", "sideB", null],
      description: "Which side the uploaded document was filed by or represents the perspective of",
    },
  };
  for (const f of fields) {
    if (f.type === "boolean") properties[f.key] = { type: ["boolean", "null"], description: f.label };
    else if (f.type === "number") properties[f.key] = { type: ["number", "null"], description: f.label };
    else if (f.type === "select") properties[f.key] = { type: ["string", "null"], enum: [...(f.options || []), null], description: f.label };
    else if (f.type === "state") properties[f.key] = { type: ["string", "null"], enum: [...STATE_CODES, null], description: f.label };
  }
  return { type: "object", properties, required: ["filingParty"] };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---- Step 1: identify the caller ----------------------------------
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) {
    return jsonResponse({ error: "Missing Authorization header" }, 401);
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return jsonResponse({ error: "Invalid or expired session — please sign in again" }, 401);
  }
  const userId = userData.user.id;

  // ---- Step 2: compute remaining credits (NO Claude call yet) --------
  const { data: purchases, error: purchaseError } = await supabaseAdmin
    .from("case_valuation_purchases")
    .select("credits_granted")
    .eq("user_id", userId);

  if (purchaseError) {
    return jsonResponse({ error: "Could not verify access — try again" }, 500);
  }
  const totalCredits = (purchases ?? []).reduce((sum, p) => sum + (p.credits_granted ?? 0), 0);
  if (totalCredits === 0) {
    return jsonResponse({
      error: "This feature requires purchasing analysis credits for the Litigation Value Estimator.",
      code: "payment_required",
    }, 402);
  }

  const { count: usedCount, error: usedError } = await supabaseAdmin
    .from("case_valuation_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (usedError) {
    return jsonResponse({ error: "Could not verify usage — try again" }, 500);
  }
  const remainingCredits = totalCredits - (usedCount ?? 0);
  if (remainingCredits <= 0) {
    return jsonResponse({
      error: "You've used all your purchased analysis credits. Purchase more to continue.",
      code: "no_credits_remaining",
    }, 402);
  }

  // ---- Step 3: burst-abuse governor, separate from the credit balance -
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: todayCount, error: todayError } = await supabaseAdmin
    .from("case_valuation_analyses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", oneDayAgo);

  if (todayError) {
    return jsonResponse({ error: "Could not verify usage — try again" }, 500);
  }
  if ((todayCount ?? 0) >= DAILY_BURST_CAP) {
    return jsonResponse({
      error: `You've hit the ${DAILY_BURST_CAP}-per-day request limit. Try again tomorrow.`,
      code: "rate_limited",
    }, 429);
  }

  // ---- Step 4: reserve the slot, THEN (and only then) call Claude ----
  let requestBody: { documentText?: string; category?: string; expectToTrial?: boolean; settlementOnTable?: number | null };
  try {
    requestBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  if (!requestBody.documentText) {
    return jsonResponse({ error: "No document text provided" }, 400);
  }
  const category = requestBody.category ?? "";
  if (!CATEGORY_FIELDS[category]) {
    return jsonResponse({ error: "Unrecognized litigation category" }, 400);
  }
  const documentText = requestBody.documentText.slice(0, MAX_DOC_CHARS);

  const { error: logError } = await supabaseAdmin
    .from("case_valuation_analyses")
    .insert({ user_id: userId, category });
  if (logError) {
    return jsonResponse({ error: "Could not log this analysis — try again" }, 500);
  }

  if (!ANTHROPIC_API_KEY || !anthropic) {
    // Safe failure mode: the gate above is fully live and correct even
    // though the actual analysis isn't wired up yet.
    return jsonResponse({
      error: "Document analysis isn't fully configured yet — the access/payment gate is live, the AI call is not.",
      code: "not_configured",
    }, 501);
  }

  try {
    const data = await loadCaseData();
    const catSpec = data.spec.categories[category];
    if (!catSpec) throw new Error("Category not found in case data");

    // ---- 4a. Extraction pass (Haiku 4.5, structured JSON, no thinking) ----
    const extraction = await anthropic.messages.create({
      model: EXTRACTION_MODEL,
      max_tokens: 2048,
      system:
        `You extract structured facts from a commercial real estate litigation document for the "${catSpec.label}" category. ` +
        `Only extract facts explicitly stated or very clearly implied in the document — output null for anything you can't determine, never guess. ` +
        `Also determine "filingParty": whether the document was filed by/represents the "${catSpec.roles.sideA}" side or the "${catSpec.roles.sideB}" side (e.g. captions like "Plaintiff [name], as Landlord, alleges..." indicate sideA here is the ${catSpec.roles.sideA}).`,
      messages: [{ role: "user", content: documentText }],
      output_config: { format: { type: "json_schema", schema: buildExtractionSchema(category) } },
    });
    const extractionText = extraction.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!extractionText) throw new Error("Extraction pass returned no output");
    const extractedFacts: Facts = JSON.parse(extractionText);

    // Merge state-law modifiers for lease-disputes, same as the client does
    if (category === "lease-disputes") {
      const stateVal = str(extractedFacts, "state");
      const mods = stateVal ? data.stateLawModifiers[stateVal] : undefined;
      if (mods) {
        extractedFacts.mitigationDuty = mods.mitigationDuty;
        extractedFacts.holdoverStatutoryPenalty = mods.holdoverStatutoryPenalty;
        extractedFacts.selfHelpAvailable = mods.selfHelpAvailable;
      }
    }

    // ---- 4b. Deterministic engine — identical math to the manual tool ----
    const evalResult = evaluate(category, extractedFacts, data);
    const filingParty = extractedFacts.filingParty === "sideB" ? "sideB" : "sideA";
    const mySide = filingParty === "sideA" ? evalResult.sideATotal : evalResult.sideBTotal;
    const otherSide = filingParty === "sideA" ? evalResult.sideBTotal : evalResult.sideATotal;
    const netPosition: [number, number] = [mySide[0] - otherSide[1], mySide[1] - otherSide[0]];
    const roleLabel = evalResult.roles ? (filingParty === "sideA" ? evalResult.roles.sideA : evalResult.roles.sideB) : filingParty;

    const citedCasesMap = new Map<string, { caseName: string; sourceUrl: string; year?: number; dollarAmount?: number }>();
    for (const c of evalResult.claims) for (const cit of c.citations) citedCasesMap.set(cit.caseName, cit);
    const citedCases = [...citedCasesMap.values()];

    if (!evalResult.claims.length) {
      return jsonResponse({
        extractedFacts,
        analysis: {
          narrative: "No claims applied based on the facts extracted from this document. This can happen with a short or incomplete filing, or one that doesn't allege the kinds of facts this category's model looks for.",
          likelyOutcome: "Not enough extracted facts to generate an estimate.",
          damagesRange: [0, 0],
          roleLabel, categoryLabel: evalResult.categoryLabel,
          claims: [], citedCases: [],
        },
      }, 200);
    }

    // ---- 4c. Narrative pass (Opus 5, adaptive thinking, structured JSON) --
    const claimsSummary = evalResult.claims.map((c) => ({
      label: c.label,
      probabilityPct: `${Math.round(c.probability[0] * 100)}-${Math.round(c.probability[1] * 100)}%`,
      damagesRange: c.damagesRange ? `${fmtMoney(c.damagesRange[0])} - ${fmtMoney(c.damagesRange[1])}` : null,
      note: c.note,
      citations: c.citations.map((ci) => `${ci.caseName}${ci.year ? ` (${ci.year})` : ""}`),
    }));

    const narrative = await anthropic.messages.create({
      model: NARRATIVE_MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      output_config: { effort: "high", format: { type: "json_schema", schema: {
        type: "object",
        properties: {
          narrative: { type: "string", description: "A detailed, reasoned writeup: the key facts, the reasoning behind each applicable claim tied to the cited precedent, and how they combine into the net position." },
          likelyOutcome: { type: "string", description: "A short (1-2 sentence) bottom-line summary of the likely outcome and why." },
        },
        required: ["narrative", "likelyOutcome"],
      } } },
      system:
        "You are writing a probability-weighted PREDICTION for a commercial real estate litigation matter — not a legal opinion, not an adjudication, and not legal advice. " +
        "Every probability, damages figure, and case citation below has ALREADY been computed by a deterministic rules engine — use ONLY these numbers and citations; do not invent, alter, or add any new figure or case. " +
        "Your job is the reasoning and the writing: explain how the facts map to each applicable claim, why the cited precedent supports the given range, and how it nets out for the filing party. " +
        "Write like a detailed, reasoned analysis a sharp litigator would give a client deciding whether to settle or fight — direct, specific, grounded in the numbers given, never hedged into vagueness.",
      messages: [{
        role: "user",
        content:
          `Category: ${evalResult.categoryLabel}\n` +
          `Filing party's role: ${roleLabel}\n` +
          `Net position for the filing party: ${fmtMoney(netPosition[0])} to ${fmtMoney(netPosition[1])}\n` +
          `Expect trial: ${requestBody.expectToTrial ? "yes" : "no (settlement/motion practice expected)"}\n` +
          (requestBody.settlementOnTable ? `Settlement currently on the table: ${fmtMoney(requestBody.settlementOnTable)}\n` : "") +
          `\nComputed claims:\n${JSON.stringify(claimsSummary, null, 2)}`,
      }],
    });
    const narrativeText = narrative.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!narrativeText) throw new Error("Narrative pass returned no output");
    const narrativeParsed = JSON.parse(narrativeText);

    return jsonResponse({
      extractedFacts,
      analysis: {
        narrative: narrativeParsed.narrative,
        likelyOutcome: narrativeParsed.likelyOutcome,
        damagesRange: netPosition,
        roleLabel,
        categoryLabel: evalResult.categoryLabel,
        claims: evalResult.claims,
        citedCases,
      },
    }, 200);
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error("Anthropic auth error — check ANTHROPIC_API_KEY:", err);
      return jsonResponse({ error: "Analysis is temporarily unavailable — try again shortly.", code: "upstream_auth_error" }, 502);
    }
    if (err instanceof Anthropic.RateLimitError) {
      return jsonResponse({ error: "The analysis service is busy — try again in a minute.", code: "upstream_rate_limited" }, 503);
    }
    if (err instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", err);
      return jsonResponse({ error: "Analysis failed — try again.", code: "upstream_error" }, 502);
    }
    console.error("case-valuation-analyze error:", err);
    return jsonResponse({ error: "Something went wrong analyzing this document — try again.", code: "internal_error" }, 500);
  }
});
