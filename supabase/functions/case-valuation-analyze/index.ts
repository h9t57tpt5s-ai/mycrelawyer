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
// ANALYSIS PIPELINE -- the AI does real, independent analysis; the
// deterministic engine is a secondary reference point, not a cage:
//   1. Extraction pass (Haiku 4.5, no thinking, structured JSON output)
//      -- pulls the same category-specific facts out of the uploaded
//      document that the manual-entry form on case-valuation.html asks
//      for by hand (see CATEGORY_FIELDS below, kept in sync with
//      QUESTIONS in js/case-valuation.js), plus which side the
//      document was filed by/represents. Cheap, used to (a) pre-fill
//      the manual form fields for review and (b) feed the deterministic
//      engine for a baseline figure.
//   2. The SAME deterministic rules engine the manual-entry tool uses
//      (ported below from js/case-valuation-engine.js) runs against the
//      extracted facts, producing a "baseline" estimate -- identical
//      math to the manual tool, useful as a mechanical cross-check, but
//      it can ONLY see the fixed set of checkbox-style fields per
//      category. It is passed to the next step as a reference data
//      point, not the final answer.
//   3. Comprehensive analysis pass (Opus 5, adaptive thinking, xhigh
//      effort, structured JSON output) -- this is the real analysis,
//      and the point of uploading a document instead of just filling
//      out the form. Reads the FULL original document text directly
//      (not the extracted checkbox facts) and reasons like a litigator
//      reviewing the file: identifies every claim, defense, and issue
//      actually present in the record -- not limited to what the fixed
//      baseline model's field set can capture -- and reaches its OWN
//      probability-weighted conclusion on exposure/recovery, which may
//      agree with, refine, or depart from the baseline. Grounding
//      requirement: it may cite ONLY real cases from that category's
//      full citation pool (collectCategoryCitationPool), copied exactly
//      by name -- never invents a citation. That's enforced twice: once
//      in the prompt, and again in code afterward (resolveCitations),
//      which drops any cited name that doesn't exactly match a real
//      entry rather than trusting the model's compliance. Framed
//      explicitly as a probability-weighted prediction, not styled as
//      an adjudication (see the system prompt below) -- preserves the
//      analytical depth while staying clear of unauthorized-practice-
//      of-law exposure.
//
// Model choice / cost: Haiku 4.5 extraction (~$0.02/analysis) + Opus 5
// comprehensive analysis at xhigh effort (larger prompt -- full document
// text plus the category's full citation pool -- and more output) runs
// roughly $0.15-0.40/analysis in Claude API cost, still healthy margin
// against a $4.90/credit price point ($49 / 10 credits). Drop the
// analysis model to claude-sonnet-5 below for a wider margin if needed;
// extraction should stay on Haiku regardless.
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

// Browser CORS -- this function is called cross-origin, from
// credocket.com's own JS, to a *.supabase.co URL. Without these headers
// every call fails at the preflight OPTIONS request before this function's
// own logic ever runs, surfacing to the browser as a bare "NetworkError
// when attempting to fetch resource" / "Failed to fetch" -- no HTTP status,
// no response body, nothing this function's own error handling can catch
// or explain, because the browser never lets the real request through.
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
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
  citations: Record<string, { caseName: string; url: string; year?: number; dollarAmount?: number }[]>;
  stateLawModifiers: Record<string, {
    mitigationDuty?: string; holdoverStatutoryPenalty?: boolean; selfHelpAvailable?: string;
    wrongfulLockoutRemedyType?: string; wrongfulLockoutRemedyValue?: number | null; wrongfulLockoutCitation?: string;
  }>;
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
  citations: { caseName: string; url: string; year?: number; dollarAmount?: number }[];
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

// Present value of a level (non-escalating) monthly payment stream --
// standard ordinary-annuity PV formula. `totalUndiscounted` is the sum of
// all payments over `months`; converted to an implied level monthly
// payment internally. Required once future rent is accelerated (see the
// cited case in accelerated_rent's citations).
function pvOfLevelStream(totalUndiscounted: number, months: number, annualRate: number): number {
  if (!months || totalUndiscounted <= 0) return 0;
  const monthlyAmt = totalUndiscounted / months;
  const r = annualRate / 12;
  if (r === 0) return totalUndiscounted;
  return monthlyAmt * (1 - Math.pow(1 + r, -months)) / r;
}

// State-specific wrongful-lockout statutory remedy: branches on the actual
// remedy MECHANISM for the property's state (multiplier / per-day penalty /
// statutory floor / actual-damages-only), rather than assuming every state
// uses the same enhancement. Mirrors js/case-valuation-engine.js.
function computeWrongfulLockoutDamages(f: Facts): { low: number; high: number; note: string } {
  const actual = num(f, "wrongfulLockoutDamages");
  const type = str(f, "wrongfulLockoutRemedyType");
  const value = f.wrongfulLockoutRemedyValue;
  const numValue = typeof value === "number" ? value : 0;
  const citation = str(f, "wrongfulLockoutCitation");
  const citeSuffix = citation ? ` (${citation})` : "";
  if (type === "multiplier" && numValue) {
    return { low: actual, high: actual * numValue, note: `State statute allows up to a ${numValue}x multiplier on these damages${citeSuffix}.` };
  }
  if (type === "per-day" && numValue) {
    const days = num(f, "daysLockedOut");
    if (!(days > 0)) {
      return { low: actual, high: actual * 1.15, note: `This state has a $${numValue}/day statutory penalty${citeSuffix} -- enter days locked out to include it; showing actual damages only for now.` };
    }
    const penalty = numValue * days;
    return { low: actual + penalty, high: actual * 1.25 + penalty, note: `Adds a $${numValue}/day statutory penalty over ${days} day(s)${citeSuffix}.` };
  }
  if (type === "floor" && numValue) {
    const floorAmt = Math.max(num(f, "monthlyRent"), numValue);
    return { low: actual + floorAmt, high: actual + floorAmt, note: `Adds the statutory floor -- the greater of one month's rent or $${numValue}${citeSuffix}.` };
  }
  return { low: actual, high: actual * 1.15, note: `No confirmed state statutory enhancement — actual damages only (conservative default)${citeSuffix}.` };
}

// Posture-tiered flat-dollar attorney's-fee model -- fees are driven by
// procedural effort, not claim size, per counsel-of-record review. Mirrors
// js/case-valuation-engine.js. Shared across lease-disputes and
// lending-foreclosure.
function feesByPosture(f: Facts, isContested: boolean): [number, number, string] {
  let posture = str(f, "litigationPosture");
  if (!posture) posture = isContested ? "contested-msj" : "answered-passive";
  const tiers: Record<string, [number, number, string]> = {
    "default": [5000, 10000, "no response filed -- default judgment"],
    "answered-passive": [15000, 25000, "an answer was filed but the matter wasn't actively contested"],
    "contested-msj": [20000, 45000, "actively contested, resolved on summary judgment"],
    "trial": [50000, 200000, "went to trial"],
  };
  const [low, high, label] = tiers[posture] || tiers["contested-msj"];
  return [low, high, `Posture-tiered flat-dollar estimate (${label}) -- fees are driven by procedural effort, not claim size, for a typical matter in this range; a large or unusually complex matter can run higher.`];
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
    const grossFutureRent = num(f, "remainingMonths") * num(f, "monthlyRent");
    // Net of actual/anticipated replacement-tenant rent (dollar-for-dollar,
    // BEFORE discounting) if re-let; otherwise a modest haircut reflecting
    // mitigation-duty uncertainty, not a guess at the eventual relet amount.
    let netLow = grossFutureRent, netHigh = grossFutureRent;
    if (bool(f, "hasRelet") && num(f, "reletRentAmount") >= 0) {
      netLow = netHigh = Math.max(0, grossFutureRent - num(f, "reletRentAmount"));
    } else if (str(f, "mitigationDuty") === "Yes") {
      netLow = grossFutureRent * 0.80; netHigh = grossFutureRent * 0.98;
    } else if (str(f, "mitigationDuty") === "Unclear") {
      netLow = grossFutureRent * 0.88; netHigh = grossFutureRent;
    }
    // Present-value discount (5%-9% annual) -- required once future rent is
    // accelerated; see the cited case, which used a 6.0% rate reflecting the
    // anticipated creditworthiness of a replacement tenant.
    const low = pvOfLevelStream(netLow, num(f, "remainingMonths"), 0.09);
    const high = pvOfLevelStream(netHigh, num(f, "remainingMonths"), 0.05);
    out.push(R("accelerated_rent", "Accelerated / Future Rent", p, Math.max(0, low), Math.max(0, high),
      "Discounted to present value using a 5%-9% annual rate range (industry/court practice, not a flat percentage haircut)." +
      (bool(f, "hasRelet") ? " Net of actual/anticipated replacement-tenant rent." : "")));
  }
  if (num(f, "releaseWorkCosts") > 0) {
    out.push(R("releasing_mitigation_costs", "Re-Leasing / Mitigation Costs", [0.60, 0.85],
      num(f, "releaseWorkCosts") * 0.85, num(f, "releaseWorkCosts"),
      "Landlord's work, tenant-improvement allowances, and leasing commissions incurred to re-lease the space -- usually actual, invoiced costs, so recovery tends to run close to the amount claimed."));
  }
  if (bool(f, "heldOverAfterTerm") && bool(f, "holdoverStatutoryPenalty") && num(f, "monthlyRent") > 0 && num(f, "holdoverMonths") > 0) {
    out.push(R("holdover_damages", "Statutory Holdover Damages", [0.80, 0.95],
      num(f, "monthlyRent") * 1.5 * num(f, "holdoverMonths"), num(f, "monthlyRent") * 2 * num(f, "holdoverMonths"),
      "Per counsel-of-record review: highly fact/lease specific, but a flat 3x multiplier is uncommon in practice; 1.5x-2x is more realistic. Also note a holdover fact pattern is a relatively rare subtype of lease dispute -- most lease disputes are nonpayment or abandonment, not holdover."));
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
      const enhanced = computeWrongfulLockoutDamages(f);
      out.push(R("wrongful_lockout", "Wrongful Eviction / Unlawful Lockout", p,
        enhanced.low, enhanced.high, enhanced.note));
    } else {
      out.push(R("wrongful_lockout", "Wrongful Eviction / Unlawful Lockout", p, null, null,
        "No damages amount entered -- probability shown reflects state self-help law and whether statutory process was followed."));
    }
    if (bool(f, "selfHelpDisruptedThirdPartyContracts") && num(f, "lostProfitsFromInterference") > 0) {
      out.push(R("tortious_interference_lost_profits", "Tortious Interference with Contract (Lost Profits)", [0.25, 0.55],
        num(f, "lostProfitsFromInterference") * 0.4, num(f, "lostProfitsFromInterference") * 0.9,
        "A separate theory from the wrongful-lockout claim above: if the lockout disrupted the tenant's contracts with its own customers, suppliers, or employees (not just its occupancy), that can independently support tortious interference with contract, opening lost-profits exposure. Requires proving intent/improper means and a specific disrupted business expectancy -- fact-intensive, no case citation grounded here yet."));
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
    // SUPERSEDES the earlier percentage-of-principal model. Per
    // counsel-of-record review, fees are driven overwhelmingly by procedural
    // effort/posture, not claim size -- see feesByPosture().
    const isContested = bool(f, "tenantDisputesDebt") ||
      out.some((c) => c.claimKey === "wrongful_lockout" || c.claimKey === "quiet_enjoyment_breach");
    const [feeLow, feeHigh, postureNote] = feesByPosture(f, isContested);
    out.push(R("attorney_fees", "Attorney's Fees", [avgP * 0.9, Math.min(0.97, avgP * 1.05)],
      feeLow, feeHigh, postureNote));
  }
  return out;
}

function evalLendingForeclosure(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string) => R2(cit, k, l, p, lo, hi, n);
  const guarantorDisputes = bool(f, "guarantorAssertsCounterclaimOrOffset");
  const isContested = bool(f, "borrowerDisputesDefault") || guarantorDisputes;
  if (num(f, "loanBalance") > 0 && bool(f, "foreclosureFiled")) {
    const p: [number, number] = bool(f, "borrowerDisputesDefault") ? [0.60, 0.80] : [0.85, 0.97];
    const advances = num(f, "lenderAdvances");
    const proceeds = num(f, "saleProceeds");
    const gross = num(f, "loanBalance") + advances;
    const deficiency = Math.max(0, gross - proceeds);
    out.push(R("foreclosure_deficiency_judgment", "Foreclosure / Deficiency Judgment", p,
      deficiency, deficiency,
      "This is the legal deficiency the court would enter judgment for, not a prediction of what will actually be collected. Whether a judgment is ultimately collectable depends heavily on the borrower/guarantor's post-judgment asset picture and is outside the scope of this estimator -- treat this figure as case value, not a collection forecast."));
  }
  if (bool(f, "receivershipMotionFiled")) {
    out.push(R("receivership_dispute", "Receivership Grant/Denial", [0.65, 0.85], null, null,
      "Not a dollar claim -- operational-control relief. 5 of 6 sampled real matters resulted in a receiver appointed."));
  }
  if (bool(f, "guarantyTriggerAlleged") && num(f, "guaranteedBalance") > 0) {
    if (guarantorDisputes) {
      out.push(R("guaranty_enforcement", "Guaranty Enforcement", [0.45, 0.70],
        num(f, "guaranteedBalance") * 0.50, num(f, "guaranteedBalance") * 0.85,
        "A counterclaim or offset has been pled against the guaranty, which meaningfully reduces both the odds of full recovery and the likely dollar outcome -- this becomes a genuinely contested fact question rather than a clean carve-out breach."));
    } else {
      out.push(R("guaranty_enforcement", "Guaranty Enforcement", [0.80, 0.97],
        num(f, "guaranteedBalance") * 0.95, num(f, "guaranteedBalance"),
        "Once a carve-out (\"bad boy\") trigger is credibly found and undisputed -- no counterclaim or offset pled -- sampled real cases show guarantors held liable for close to the full guaranteed balance, even for technical/non-fraud breaches. The harder question -- proving the trigger occurred in the first place -- isn't modeled as a separate probability here."));
    }
  }
  if (bool(f, "lenderMisconductAlleged")) {
    const claimed = num(f, "lenderLiabilityDamagesClaimed");
    const egregious = bool(f, "egregiousConductAlleged");
    const p: [number, number] = egregious ? [0.20, 0.40] : [0.10, 0.25];
    const low = claimed > 0 ? claimed * (egregious ? 0.35 : 0.20) : null;
    const high = claimed > 0 ? claimed * (egregious ? 1.5 : 0.55) : null;
    out.push(R("lender_liability_claim", "Lender Liability (borrower-asserted)", p, low, high,
      egregious
        ? "Historically borrower-unfriendly absent clear bad faith, but egregious conduct changes the calculus -- damages here can include contract damages, lost profits, out-of-pocket costs, and potentially exemplary/punitive damages, which is reflected in the wider high end."
        : "Historically borrower-unfriendly absent clear bad faith; recent real cases trend toward procedural wins rather than dollar outcomes. Damages, if any, are typically limited to contract damages and out-of-pocket costs."));
  }
  if (bool(f, "hasFeeShiftingClause") && out.length) {
    const avgP = out.reduce((s, c) => s + (c.probability[0] + c.probability[1]) / 2, 0) / out.length;
    const [feeLow, feeHigh, postureNote] = feesByPosture(f, isContested);
    out.push(R("attorney_fees", "Attorney's Fees", [avgP * 0.9, Math.min(0.97, avgP * 1.05)],
      feeLow, feeHigh, postureNote));
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

// Every real citation known for a category, across ALL its claim types --
// not just the ones the fixed-formula engine happened to trigger. This is
// the comprehensive-analysis pass's reference library: it may cite ANY of
// these (grounding requirement), but nothing outside this list -- validated
// server-side after the call, not just prompted.
function collectCategoryCitationPool(category: string, data: CaseData) {
  const catSpec = data.spec.categories[category];
  const pool: { caseName: string; url: string; year?: number; dollarAmount?: number }[] = [];
  const seen = new Set<string>();
  if (!catSpec) return pool;
  for (const claimKey of Object.keys(catSpec.claimTypes)) {
    for (const cit of data.citations[claimKey] || []) {
      if (seen.has(cit.caseName)) continue;
      seen.add(cit.caseName);
      pool.push(cit);
    }
  }
  return pool;
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
    { key: "daysLockedOut", type: "number", label: "If wrongful lockout: number of days the tenant was locked out (for per-day statutory penalty states)" },
    { key: "selfHelpDisruptedThirdPartyContracts", type: "boolean", label: "Did the lockout disrupt the tenant's contracts with its own customers/suppliers/employees (not just occupancy)?" },
    { key: "lostProfitsFromInterference", type: "number", label: "If so: tenant's lost profits claimed from that third-party contract disruption ($)" },
    { key: "repairFailureOrInterferenceClaimed", type: "boolean", label: "Is the tenant alleging failure to repair / interference with use?" },
    { key: "gaveCureNoticeLandlordFailedToAct", type: "boolean", label: "Did the tenant give notice and the landlord fail to act?" },
    { key: "depositAmount", type: "number", label: "Security deposit amount ($)" },
    { key: "depositDisputed", type: "boolean", label: "Is the deposit withheld/disputed?" },
    { key: "landlordProvidedItemization", type: "boolean", label: "Did the landlord provide an itemization of deductions?" },
    { key: "releaseWorkCosts", type: "number", label: "Costs incurred/anticipated to re-lease the space -- landlord's work, tenant-improvement allowance, leasing commissions ($)" },
    { key: "hasFeeShiftingClause", type: "boolean", label: "Does the lease have an attorney's-fees (fee-shifting) clause?" },
    { key: "litigationPosture", type: "select", label: "Litigation posture (for attorney's-fees estimate)", options: ["default", "answered-passive", "contested-msj", "trial"] },
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
    { key: "guarantorAssertsCounterclaimOrOffset", type: "boolean", label: "Does the guarantor assert a counterclaim or offset against the guaranty?" },
    { key: "lenderMisconductAlleged", type: "boolean", label: "Does the borrower allege lender misconduct?" },
    { key: "egregiousConductAlleged", type: "boolean", label: "If lender misconduct alleged: is it egregious / clear bad faith (opens exemplary damages)?" },
    { key: "lenderLiabilityDamagesClaimed", type: "number", label: "If lender misconduct alleged: borrower's claimed damages (contract, lost profits, out-of-pocket) ($)" },
    { key: "hasFeeShiftingClause", type: "boolean", label: "Does the loan/guaranty documentation have an attorney's-fees (fee-shifting) clause?" },
    { key: "litigationPosture", type: "select", label: "Litigation posture (for attorney's-fees estimate)", options: ["default", "answered-passive", "contested-msj", "trial"] },
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

// Anthropic's structured-output schema validator rejects the "array-form
// type + enum containing null" shorthand -- `{type: ["string","null"],
// enum: [...values, null]}` -- with a 400 ("Enum value '…' does not match
// declared type"), even though every enum member IS a member of one of the
// declared types. The correct, accepted way to express a nullable enum is
// `anyOf: [{type: "string", enum: [...values]}, {type: "null"}]` --
// confirmed against the actual API error text, not just documentation.
function nullableEnum(values: (string | null)[]) {
  return { anyOf: [{ type: "string", enum: values }, { type: "null" }] };
}

// Anthropic also caps a single schema at 16 union/nullable-typed
// properties ("too many parameters with union types ... exponential
// compilation cost") -- confirmed against the actual API error text.
// Every field in these extraction schemas is nullable by design (the
// model should say null for anything not found, never guess), so a
// category with more than ~15 fields (lease-disputes has 27) genuinely
// cannot fit in one schema/call. Split into chunks and run one extraction
// call per chunk instead of narrowing what gets extracted.
const MAX_UNION_FIELDS_PER_SCHEMA = 15; // leaves room for filingParty (1) in the first chunk, staying under the 16 cap

function chunkFields(fields: FieldDef[]): FieldDef[][] {
  const chunks: FieldDef[][] = [];
  for (let i = 0; i < fields.length; i += MAX_UNION_FIELDS_PER_SCHEMA) {
    chunks.push(fields.slice(i, i + MAX_UNION_FIELDS_PER_SCHEMA));
  }
  return chunks.length ? chunks : [[]];
}

// Builds one schema for a SUBSET of a category's fields (see chunking
// above). `includeFilingParty` is only true for the first chunk, so it's
// asked for -- and merged back in -- exactly once.
function buildExtractionSchema(fields: FieldDef[], includeFilingParty: boolean) {
  const properties: Record<string, unknown> = {};
  if (includeFilingParty) {
    properties.filingParty = {
      ...nullableEnum(["sideA", "sideB"]),
      description: "Which side the uploaded document was filed by or represents the perspective of",
    };
  }
  for (const f of fields) {
    if (f.type === "boolean") properties[f.key] = { type: ["boolean", "null"], description: f.label };
    else if (f.type === "number") properties[f.key] = { type: ["number", "null"], description: f.label };
    else if (f.type === "select") properties[f.key] = { ...nullableEnum(f.options || []), description: f.label };
    else if (f.type === "state") properties[f.key] = { ...nullableEnum(STATE_CODES), description: f.label };
  }
  // Anthropic's structured-output json_schema format also requires
  // additionalProperties:false on every object AND every key in
  // `properties` to also appear in `required` (nullable types, via the
  // `[type, "null"]` unions/anyOf above, are how an individual field is
  // allowed to come back empty -- "required" here means "present in the
  // output, possibly as null", not "the model must find a value").
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

Deno.serve(async (req) => {
  // The browser sends this before the real POST whenever the request has
  // custom headers (Authorization, apikey) -- must succeed with the CORS
  // headers below, or the browser blocks the actual request and never
  // even shows this function's own error responses.
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
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

  // ---- Step 4: validate the request, THEN (and only then) call Claude ----
  // A credit is logged/consumed only once an analysis actually completes
  // and a real result is about to be returned (see the success path at
  // the bottom of the try block below) -- NOT here, before Claude is even
  // called. This used to reserve the slot up front on the theory that
  // "safer to slightly under-serve a user on a bad day than let a retry
  // loop mint free credits" -- but the daily burst cap above already
  // guards against abusive retries independently of the credit balance,
  // and charging a credit for a request that was always going to fail
  // (a malformed schema, a missing API key, a network/CORS problem that
  // never even reached this function) isn't "serving a user on a bad
  // day," it's charging them for a bug. Confirmed this was happening in
  // practice: several consecutive schema-validation failures during
  // debugging each still logged a row here and burned a real credit.
  let requestBody: { documentText?: string; category?: string; userSide?: "sideA" | "sideB" | null; expectToTrial?: boolean; settlementOnTable?: number | null };
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

  if (!ANTHROPIC_API_KEY || !anthropic) {
    // Safe failure mode: the gate above is fully live and correct even
    // though the actual analysis isn't wired up yet.
    return jsonResponse({
      error: "Document analysis isn't fully configured yet — the access/payment gate is live, the AI call is not.",
      code: "not_configured",
    }, 501);
  }

  // ---- Step 5: keep everything from here on comfortably inside
  // Supabase's hard wall-clock execution ceiling (150s free tier / 400s
  // Pro) -- confirmed directly against Supabase's own troubleshooting
  // docs that sending partial response bytes does NOT reset or extend
  // that timer ("the supervisor monitors wall clock and CPU independently
  // of what the function sends over the network"), so an earlier
  // heartbeat-streaming attempt at working around this was addressing the
  // wrong mechanism entirely and has been reverted -- back to a plain
  // request/response, real HTTP status codes throughout, no streaming
  // complexity that wasn't actually buying anything.
  try {
    const data = await loadCaseData();
    const catSpec = data.spec.categories[category];
    if (!catSpec) throw new Error("Category not found in case data");

    // ---- 4a. Extraction pass (Haiku 4.5, structured JSON, no thinking) ----
    // documentText may contain more than one filing (e.g. the original
    // petition AND an answer/counterclaim), concatenated client-side with
    // "=== Document N: filename ===" section headers -- read across all
    // of them and synthesize one consistent set of facts, since a fact
    // like "does the tenant dispute the debt" typically only shows up in
    // the answer, not the petition.
    //
    // Every field is nullable by design (the model should say null for
    // anything not found, never guess) -- but Anthropic caps a single
    // schema at 16 union/nullable-typed properties, and several
    // categories (lease-disputes has 27 fields) exceed that. Split into
    // chunks of <=15 fields (plus filingParty in the first chunk only)
    // and run one extraction call per chunk in parallel, then merge.
    const fieldChunks = chunkFields(CATEGORY_FIELDS[category] || []);
    const baseSystemPrompt =
      `You extract structured facts from commercial real estate litigation document(s) for the "${catSpec.label}" category. ` +
      `The user message may contain multiple filings from the same matter (e.g. an original petition and a later answer or counterclaim), separated by "=== Document N: ... ===" headers -- read all of them together as one case record and synthesize a single consistent set of facts; a later filing can add or update facts the earlier one didn't cover. ` +
      `Only extract facts explicitly stated or very clearly implied in the document(s) — output null for anything you can't determine, never guess.`;
    const filingPartyPrompt =
      ` Also determine "filingParty": whether the ORIGINAL/first document represents the "${catSpec.roles.sideA}" side or the "${catSpec.roles.sideB}" side (e.g. captions like "Plaintiff [name], as Landlord, alleges..." indicate sideA here is the ${catSpec.roles.sideA}). If the user has told you separately which side they represent, that takes precedence over your own read of the caption.` +
      (requestBody.userSide ? ` The user has stated they represent the "${requestBody.userSide === "sideA" ? catSpec.roles.sideA : catSpec.roles.sideB}" side — set filingParty to "${requestBody.userSide}" accordingly.` : "");

    const extractionResults = await Promise.all(fieldChunks.map((chunk, i) => {
      const includeFilingParty = i === 0;
      return anthropic!.messages.create({
        model: EXTRACTION_MODEL,
        max_tokens: 2048,
        system: baseSystemPrompt + (includeFilingParty ? filingPartyPrompt : ""),
        messages: [{ role: "user", content: documentText }],
        output_config: { format: { type: "json_schema", schema: buildExtractionSchema(chunk, includeFilingParty) } },
      });
    }));
    const extractedFacts: Facts = {};
    for (const extraction of extractionResults) {
      const extractionText = extraction.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      if (!extractionText) throw new Error("Extraction pass returned no output");
      Object.assign(extractedFacts, JSON.parse(extractionText));
    }

    // Merge state-law modifiers for lease-disputes, same as the client does
    if (category === "lease-disputes") {
      const stateVal = str(extractedFacts, "state");
      const mods = stateVal ? data.stateLawModifiers[stateVal] : undefined;
      if (mods) {
        extractedFacts.mitigationDuty = mods.mitigationDuty;
        extractedFacts.holdoverStatutoryPenalty = mods.holdoverStatutoryPenalty;
        extractedFacts.selfHelpAvailable = mods.selfHelpAvailable;
        extractedFacts.wrongfulLockoutRemedyType = mods.wrongfulLockoutRemedyType;
        extractedFacts.wrongfulLockoutRemedyValue = mods.wrongfulLockoutRemedyValue;
        extractedFacts.wrongfulLockoutCitation = mods.wrongfulLockoutCitation;
      }
    }

    // ---- 4b. Deterministic engine — identical math to the manual tool ----
    const evalResult = evaluate(category, extractedFacts, data);
    // An explicit userSide from the form always wins over the AI's read of
    // the document captions -- defense in depth beyond the prompt instruction above.
    const filingParty = requestBody.userSide === "sideB" || requestBody.userSide === "sideA"
      ? requestBody.userSide
      : (extractedFacts.filingParty === "sideB" ? "sideB" : "sideA");
    const mySide = filingParty === "sideA" ? evalResult.sideATotal : evalResult.sideBTotal;
    const otherSide = filingParty === "sideA" ? evalResult.sideBTotal : evalResult.sideATotal;
    const netPosition: [number, number] = [mySide[0] - otherSide[1], mySide[1] - otherSide[0]];
    const roleLabel = evalResult.roles ? (filingParty === "sideA" ? evalResult.roles.sideA : evalResult.roles.sideB) : filingParty;

    const baselineCitedCasesMap = new Map<string, { caseName: string; url: string; year?: number; dollarAmount?: number }>();
    for (const c of evalResult.claims) for (const cit of c.citations) baselineCitedCasesMap.set(cit.caseName, cit);

    // ---- 4c. Comprehensive analysis pass (Opus 5, adaptive thinking, xhigh
    // effort, structured JSON) -- this is the real analysis. It reads the
    // FULL document text directly (not just the extracted checkbox-style
    // facts) and reasons like a litigator reviewing the file: identifies
    // whatever claims, defenses, and issues are actually IN THE RECORD --
    // not limited to the fixed set of fields the deterministic engine
    // checks -- and reaches its OWN probability-weighted conclusion on
    // exposure/recovery. The deterministic engine's output is passed in
    // as ONE reference data point (a mechanical baseline), not a cage --
    // the model's own reasoning drives the final assessment, and it is
    // free to diverge from the baseline and say so.
    //
    // Grounding requirement (hallucination guardrail): the model may cite
    // ONLY cases from citationPool below, by exact name -- never invent a
    // case. This is enforced twice: once in the prompt, and again in code
    // afterward (validateCitations), which drops anything that doesn't
    // exactly match a real entry rather than trusting the model's compliance.
    const citationPool = collectCategoryCitationPool(category, data);
    const citationPoolText = citationPool
      .map((c) => `- ${c.caseName}${c.year ? ` (${c.year})` : ""}${c.dollarAmount ? ` — ${fmtMoney(c.dollarAmount)}` : ""}`)
      .join("\n");

    const baselineSummary = evalResult.claims.length
      ? evalResult.claims.map((c) => ({
          label: c.label,
          probabilityPct: `${Math.round(c.probability[0] * 100)}-${Math.round(c.probability[1] * 100)}%`,
          damagesRange: c.damagesRange ? `${fmtMoney(c.damagesRange[0])} - ${fmtMoney(c.damagesRange[1])}` : null,
        }))
      : "none -- the fixed-formula model found no matching claims from the extracted checkbox-style facts, but the actual document may still contain real claims or issues outside that fixed field set. Analyze the document itself, not just this baseline.";

    // A [low, high] pair as a JSON Schema array (minItems/maxItems: 2) is
    // rejected outright -- Anthropic's structured-output validator only
    // accepts minItems/maxItems of 0 or 1 ("'minItems' values other than 0
    // or 1 are not supported"), confirmed against the actual API error
    // text. Expressed as a {low, high} object instead, which sidesteps
    // array-size constraints entirely using the same object shape
    // (properties/required/additionalProperties:false) already confirmed
    // to work elsewhere in this file. Parsed back into a [low, high] tuple
    // right after the API call returns (see rangeToTuple below), so
    // nothing downstream of that -- including the client -- sees this
    // object shape; it exists only in what gets sent TO Claude.
    const rangeSchema = (description: string) => ({
      type: "object",
      properties: { low: { type: "number" }, high: { type: "number" } },
      required: ["low", "high"],
      additionalProperties: false,
      description,
    });
    const nullableRangeSchema = (description: string) => ({
      anyOf: [
        { type: "object", properties: { low: { type: "number" }, high: { type: "number" } }, required: ["low", "high"], additionalProperties: false },
        { type: "null" },
      ],
      description,
    });

    const analysisSchema = {
      type: "object",
      properties: {
        narrative: { type: "string", description: "A comprehensive, detailed reasoned analysis of the actual document(s): the key facts, every claim/defense/issue you identify (not limited to the baseline model's fixed categories), how the cited precedent applies, evidentiary or procedural weaknesses on either side, and how it all nets out for the filing party. Write like a sharp litigator's case assessment memo -- direct, specific, thorough." },
        likelyOutcome: { type: "string", description: "A short (2-3 sentence) bottom-line summary of the likely outcome and why." },
        damagesRange: rangeSchema("YOUR OWN independent probability-weighted net exposure/recovery range for the filing party, in dollars (low/high) -- informed by the baseline but not bound by it. Never a single point estimate."),
        bestGuessValue: { type: "number", description: "A single best-guess point estimate of net case value in dollars, positioned inside damagesRange above. This is NOT simply the midpoint of the range -- weight it toward whichever end the actual balance of probabilities and damages evidence favors, the same way you'd give a client one number to plan around after already giving them the honest range. Reason from the same per-issue probability x damages assessment you use in `issues` below." },
        issues: {
          type: "array",
          description: "Every distinct claim, defense, or issue you identified in the actual document(s) -- may include ones the fixed baseline model doesn't capture at all (e.g. a specific factual dispute, an evidentiary weakness, a procedural defect, a defense actually raised in an answer). Order by significance.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short name for this claim/issue." },
              analysis: { type: "string", description: "Your reasoning on this specific issue: the facts supporting it, how cited precedent applies (if any), and its strength." },
              probabilityRangePct: nullableRangeSchema("Low/high percent likelihood this issue is resolved in the filing party's favor, if quantifiable."),
              damagesRange: nullableRangeSchema("Low/high dollar range for this specific issue, if it has an independent dollar value."),
              citedCaseNames: { type: "array", items: { type: "string" }, description: "Exact case name(s) from the reference list below that support this issue -- ONLY names copied exactly from that list, or an empty array if none apply." },
            },
            // Structured-output schemas require every property in
            // `required` (nullable types carry the real "optional"
            // semantics) plus additionalProperties:false on every object,
            // same as the top-level schema below -- both were missing
            // here, which the API rejects.
            required: ["label", "analysis", "probabilityRangePct", "damagesRange", "citedCaseNames"],
            additionalProperties: false,
          },
        },
      },
      required: ["narrative", "likelyOutcome", "damagesRange", "bestGuessValue", "issues"],
      additionalProperties: false,
    };

    // Confirmed directly against Supabase's own docs: sending partial
    // response bytes does NOT reset or extend their hard wall-clock
    // execution ceiling (150s free tier / 400s Pro) -- that ceiling is
    // enforced independently of network activity, so a heartbeat-
    // streaming attempt to work around it (tried, reverted) could never
    // have worked. The only real lever is keeping this call's actual
    // running time well under that ceiling. Streamed to Anthropic
    // (client.messages.stream + finalMessage()) purely to avoid an SDK-
    // level timeout on the long-running call itself -- unrelated to, and
    // not a fix for, the Supabase-side ceiling.
    const analysisStream = anthropic.messages.stream({
      model: NARRATIVE_MODEL,
      // Cut from 32000 -> 16000: still generous headroom over the
      // 8192 that caused an earlier "no output" failure (thinking
      // starving the final answer), but a smaller ceiling bounds worst-
      // case generation time further.
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      // Cut from "xhigh" -> "high" -> now "medium": xhigh and high were
      // each tried and the request still failed to complete before
      // Supabase's hard wall-clock ceiling. "medium" trades some depth
      // of reasoning for a real, meaningful reduction in thinking time --
      // the actual lever that matters here, since streaming/heartbeats do
      // not extend that ceiling at all.
      output_config: { effort: "medium", format: { type: "json_schema", schema: analysisSchema } },
      system:
        "You are an experienced commercial real estate litigator producing a probability-weighted case assessment -- not a legal opinion, not an adjudication, and not legal advice. " +
        `Read the actual document(s) provided and do a comprehensive analysis for the "${catSpec.label}" category: identify every claim, defense, and issue actually present in the record -- not just what a fixed checklist would catch. Weigh evidentiary strength, procedural posture, and any defenses or counterclaims raised. ` +
        "GROUNDING REQUIREMENT: you may cite ONLY cases from the reference list below, copied EXACTLY by name -- never invent, alter, or guess at a case name, citation, or outcome. If no listed case supports a point, make the point without a citation rather than fabricating one. " +
        "A fixed-formula baseline model's mechanical output is provided as ONE reference data point -- it is not the answer key. Use your own judgment from the actual document; you may agree with, refine, or depart from the baseline, and should say which and why. " +
        "Every dollar range must be a range, never a single number -- EXCEPT bestGuessValue, which is deliberately the one point estimate in this whole analysis: after laying out the honest range, commit to the single number inside it you'd actually tell the client to plan around, reasoned from the same probability-weighting you used for the range and issues, not just its arithmetic midpoint. Write like a sharp litigator's internal case assessment memo for a client deciding whether to settle or fight -- direct and specific, not hedged into vagueness.",
      messages: [{
        role: "user",
        content:
          `Category: ${catSpec.label}\n` +
          `Filing party's role: ${roleLabel}\n` +
          `Expect trial: ${requestBody.expectToTrial ? "yes" : "no (settlement/motion practice expected)"}\n` +
          (requestBody.settlementOnTable ? `Settlement currently on the table: ${fmtMoney(requestBody.settlementOnTable)}\n` : "") +
          `\nFixed-formula baseline model output (reference only, not authoritative):\n${JSON.stringify(baselineSummary, null, 2)}\n` +
          `\nReal cited precedent you may draw on (cite ONLY from this list, by exact name):\n${citationPoolText}\n` +
          `\n=== The document(s) to analyze ===\n${documentText}`,
      }],
    });
    const analysis = await analysisStream.finalMessage();
    const analysisText = analysis.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
    if (!analysisText) {
      // TEMPORARY (same debug-scaffolding pattern as the outer catch
      // block): include stop_reason and the actual content block types
      // returned, so if raising max_tokens above doesn't fully fix this,
      // the next report says exactly why instead of needing another
      // guess-and-redeploy round.
      throw new Error(
        `Analysis pass returned no output (stop_reason: ${analysis.stop_reason}, content block types: [${analysis.content.map((b) => b.type).join(", ")}])`
      );
    }
    const analysisParsed = JSON.parse(analysisText);

    // Validate every cited case name against the real pool -- drop anything
    // that isn't an exact match rather than trusting the prompt instruction.
    const poolByName = new Map(citationPool.map((c) => [c.caseName, c]));
    const resolveCitations = (names: unknown): { caseName: string; url: string; year?: number; dollarAmount?: number }[] => {
      if (!Array.isArray(names)) return [];
      const out: { caseName: string; url: string; year?: number; dollarAmount?: number }[] = [];
      for (const n of names) {
        const match = typeof n === "string" ? poolByName.get(n) : undefined;
        if (match) out.push(match);
      }
      return out;
    };

    // Claude returns {low, high} objects (see rangeSchema/nullableRangeSchema
    // above) -- convert back to the [low, high] tuple shape every other
    // part of this app (and the client) already expects, right here at the
    // boundary, so nothing downstream needs to know the wire format to
    // Claude ever differed from the wire format to the browser.
    const rangeToTuple = (r: unknown): [number, number] | null => {
      if (!r || typeof r !== "object") return null;
      const { low, high } = r as { low?: unknown; high?: unknown };
      if (typeof low !== "number" || typeof high !== "number") return null;
      return [low, high];
    };

    const issues = Array.isArray(analysisParsed.issues) ? analysisParsed.issues.map((iss: Record<string, unknown>) => {
      const probTuple = rangeToTuple(iss.probabilityRangePct);
      return {
        label: typeof iss.label === "string" ? iss.label : "Issue",
        analysis: typeof iss.analysis === "string" ? iss.analysis : "",
        probabilityRange: probTuple ? [probTuple[0] / 100, probTuple[1] / 100] : null,
        damagesRange: rangeToTuple(iss.damagesRange),
        citations: resolveCitations(iss.citedCaseNames),
      };
    }) : [];

    const allCitedMap = new Map<string, { caseName: string; url: string; year?: number; dollarAmount?: number }>();
    for (const iss of issues) for (const cit of iss.citations) allCitedMap.set(cit.caseName, cit);
    for (const cit of baselineCitedCasesMap.values()) allCitedMap.set(cit.caseName, cit);

    const aiDamagesRange: [number, number] = rangeToTuple(analysisParsed.damagesRange) ?? netPosition;

    // Clamp rather than trust blindly -- a structured-output number field
    // has no schema-level way to constrain it to fall inside another
    // field's range, so enforce that here instead of shipping a "best
    // guess" that could land outside the range it's supposed to pin down.
    const rawBestGuess = typeof analysisParsed.bestGuessValue === "number" ? analysisParsed.bestGuessValue : null;
    const bestGuessValue = rawBestGuess === null
      ? (aiDamagesRange[0] + aiDamagesRange[1]) / 2
      : Math.min(Math.max(rawBestGuess, aiDamagesRange[0]), aiDamagesRange[1]);

    // Only NOW, with a real completed analysis about to go back to the
    // user, does this consume a credit -- see the note at Step 4 above.
    // Deliberately not awaited-and-checked as fatally as the other
    // Supabase calls in this function: the analysis itself already
    // succeeded and cost real Claude API spend, so a logging hiccup here
    // shouldn't throw away a good result the user is about to receive.
    // It does mean a user could in rare cases get one extra free analysis
    // if this specific insert fails -- an acceptable trade given the
    // alternative (silently eating a successful, paid-for result) is worse.
    const { error: logError } = await supabaseAdmin
      .from("case_valuation_analyses")
      .insert({ user_id: userId, category });
    if (logError) console.error("Failed to log completed analysis (credit not deducted):", logError);

    return jsonResponse({
      extractedFacts,
      analysis: {
        narrative: analysisParsed.narrative,
        likelyOutcome: analysisParsed.likelyOutcome,
        damagesRange: aiDamagesRange,
        bestGuessValue,
        roleLabel,
        categoryLabel: evalResult.categoryLabel,
        issues,
        citedCases: [...allCitedMap.values()],
        baseline: {
          damagesRange: netPosition,
          claims: evalResult.claims,
        },
      },
    }, 200);
  } catch (err) {
    // TEMPORARY: surfacing the real upstream error text/status in the
    // response body (not just server logs) while tracking down a 502
    // that several prior fixes (CORS, schema additionalProperties, the
    // nullable-enum shape, the union-field cap, minItems, a too-small
    // max_tokens) haven't fully resolved -- none independently confirmed
    // since this environment has no way to call the Anthropic API or
    // read Supabase function logs directly. Root-caused (schema validity,
    // then the effort/token/timing tuning) and confirmed working end to
    // end -- debug field removed from the user-facing response now that
    // it's done its job; console.error below still logs the real error
    // server-side for anything unexpected going forward.
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
