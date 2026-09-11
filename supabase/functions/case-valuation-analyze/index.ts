// =========================================================
// CREdocket -- Case Value Calculator: AI document analysis
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
const MAX_DESCRIPTION_CHARS = 8000; // the user's own freeform case description -- shorter cap than documents, but still a real source of facts, never trust the client alone
const CASE_DATA_URL = "https://credocket.com/js/case-valuation-data.js";
const NARRATIVE_MODEL = "claude-opus-5"; // swap to "claude-sonnet-5" for a wider cost margin
const EXTRACTION_MODEL = "claude-haiku-4-5";

// Per-million-token pricing, for the cost-estimate logging below only --
// keep in sync with https://claude.com/pricing if pricing changes. Not
// used for anything user-facing or billing-critical, purely visibility
// into real per-analysis Claude API spend (the in-code estimate above --
// "$0.15-0.40/analysis" -- predates the effort/max_tokens tuning further
// down and was never based on measured tokens).
const MODEL_PRICING_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
function logUsage(
  label: string,
  model: string,
  usage: { input_tokens?: number; output_tokens?: number } | undefined,
): number {
  const inTok = usage?.input_tokens ?? 0;
  const outTok = usage?.output_tokens ?? 0;
  const pricing = MODEL_PRICING_PER_MTOK[model];
  const cost = pricing ? (inTok / 1_000_000) * pricing.input + (outTok / 1_000_000) * pricing.output : 0;
  console.log(`[cv-cost] ${label} model=${model} input_tokens=${inTok} output_tokens=${outTok} est_cost=$${cost.toFixed(4)}`);
  return cost;
}

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
  premisesLiabilityStateModifiers?: Record<string, {
    faultRule?: string; faultRuleCitation?: string;
    punitiveDamagesStandard?: string; punitiveDamagesCap?: string;
    openAndObviousDoctrine?: string; openAndObviousRule?: string; openAndObviousCitation?: string;
    negligentSecurityForeseeabilityTest?: string; negligentSecurityTestNormalized?: string; negligentSecurityCitation?: string;
    modeOfOperationRuleAdopted?: boolean | "partial"; modeOfOperationCitation?: string;
    premisesLiabilityDistinctFromOrdinaryNegligence?: boolean; premisesLiabilityDistinctNote?: string;
  }>;
  foreclosureStateModifiers?: Record<string, {
    nonJudicialDominant?: boolean;
    deficiencyBarredIfNonJudicial?: boolean;
    deficiencyConditionalIfNonJudicial?: boolean;
    deficiencyBarredForBorrowerButGuarantorAvailable?: boolean;
    fairValueOffsetApplies?: boolean;
    procedureTrap?: string | null;
    citation?: string;
    note?: string;
  }>;
  constructionIndemnityStateModifiers?: Record<string, {
    indemnityForm?: "broad" | "broad-capped" | "intermediate" | "limited";
    citation?: string;
    confidence?: string;
    note?: string;
  }>;
};

let cachedCaseData: CaseData | null = null;
async function loadCaseData(): Promise<CaseData> {
  if (cachedCaseData) return cachedCaseData;
  const res = await fetch(CASE_DATA_URL);
  if (!res.ok) throw new Error(`Could not load case data (${res.status})`);
  const raw = await res.text();
  // js/case-valuation-data.js is genuine JavaScript (`const
  // CASE_VALUATION_DATA = {...};`), not JSON -- it contains legitimate JS
  // block comments between some top-level keys (e.g. before
  // stateLawModifiers), which is valid JS but breaks JSON.parse outright.
  // A naive text-slice + JSON.parse here appeared to work only because
  // cachedCaseData masked it between cold starts -- the moment a redeploy
  // forces a fresh fetch, it throws "Expected double-quoted property
  // name" on the first comment it hits, for every category, not just a
  // newly added one. Execute the file as real JavaScript instead of
  // force-fitting it through JSON.parse, so any valid JS syntax in it
  // (comments, trailing commas, etc.) is handled correctly.
  const fn = new Function(`${raw}\nreturn CASE_VALUATION_DATA;`);
  const publicData = fn() as Omit<CaseData, "citations">;

  // SECURITY (2026-09): the actual case-citation bench (real
  // settlement/verdict outcomes with dollar amounts and sources) used to
  // live inside the public file fetched above -- which meant the entire
  // proprietary research asset grounding this tool was one unauthenticated
  // `curl` away from anyone. It's now a private, RLS-locked table
  // (`private_case_citations`) readable only by this service-role client,
  // never by the anon/publishable key or an end user's session. The public
  // file above still holds the state-law-modifier tables and the
  // category/claimType spec -- real research too, but a restatement of
  // public law, not the hard-won dataset -- and several free guide pages
  // still fetch it directly client-side for exactly that content.
  const { data: citationsRow, error: citationsErr } = await supabaseAdmin
    .from("private_case_citations")
    .select("citations")
    .eq("id", "main")
    .single();
  if (citationsErr || !citationsRow) {
    throw new Error(
      `Could not load private case citations (run the private_case_citations migration if this is a fresh project): ${citationsErr?.message ?? "no row found"}`
    );
  }

  cachedCaseData = { ...publicData, citations: citationsRow.citations } as CaseData;
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

// Applies this loan's state's real deficiency-judgment law (merged from
// js/case-valuation-data.js's 51-jurisdiction foreclosureStateModifiers
// table into flattened `foreclosure*` facts by the request handler, the
// same pattern used for premises-liability's state modifiers above) to the
// flat debt-minus-proceeds deficiency calculation, instead of applying
// that flat formula unconditionally regardless of state law. Bars/zeroes
// the deficiency outright in states whose dominant non-judicial method
// forfeits it (or forfeits it only against the borrower entity, leaving a
// guarantor claim open), flags the states where deficiency rights survive
// non-judicial foreclosure only on an extra procedural step, and applies
// the fair-value offset (credit = the GREATER of sale proceeds or a
// court-determined/appraised fair value, per every researched state's own
// note -- mathematically identical to the "debtor gets the LESSER of the
// two resulting deficiencies" phrasing some of those notes use) when a
// fair-value figure has actually been entered. Falls back to the flat,
// unadjusted formula for a state that hasn't been researched, or when no
// state was identified at all.
function computeDeficiencyStateAdjustment(f: Facts, debt: number, proceeds: number): { deficiency: number; note: string } {
  const flat = Math.max(0, debt - proceeds);
  const state = str(f, "state");
  const citation = str(f, "foreclosureStateCitation");
  if (!state || !citation) {
    return {
      deficiency: flat,
      note: state
        ? `${state}'s deficiency-judgment rules haven't been separately researched for this tool -- using the flat formula (loan balance + lender advances, minus sale proceeds), with no state-law adjustment.`
        : "No state was identified for this loan -- using the flat formula (loan balance + lender advances, minus sale proceeds). Provide the property's state so this state's actual deficiency-judgment law can be applied.",
    };
  }
  const stateNote = str(f, "foreclosureStateNote");
  const nonJudicialDominant = bool(f, "foreclosureNonJudicialDominant");
  const methodInput = str(f, "foreclosureMethod");
  const method: "judicial" | "non-judicial" = methodInput === "judicial" || methodInput === "non-judicial"
    ? methodInput
    : (nonJudicialDominant ? "non-judicial" : "judicial");
  const assumedSuffix = methodInput ? "" : ` (foreclosure method not specified -- assumed ${method}, ${state}'s dominant method)`;

  if (method === "non-judicial" && bool(f, "foreclosureDeficiencyBarredIfNonJudicial")) {
    return {
      deficiency: 0,
      note: `${state} bars a deficiency judgment outright following its dominant non-judicial foreclosure method${assumedSuffix} (${citation}).${stateNote ? " " + stateNote : ""}`,
    };
  }
  if (method === "non-judicial" && bool(f, "foreclosureDeficiencyBarredForBorrowerButGuarantorAvailable")) {
    return {
      deficiency: 0,
      note: `${state}'s non-judicial route generally bars a deficiency claim against the borrower entity itself${assumedSuffix} (${citation}) -- a claim against a personal guarantor may still be available; cross-reference the separate Guaranty Enforcement claim.${stateNote ? " " + stateNote : ""}`,
    };
  }

  let deficiency = flat;
  let note = `${state}'s deficiency-judgment rules were applied${assumedSuffix} (${citation}).`;
  const procedureTrap = str(f, "foreclosureProcedureTrap");
  if (method === "non-judicial" && bool(f, "foreclosureDeficiencyConditionalIfNonJudicial")) {
    note += ` Deficiency rights here are conditional on an extra procedural step${procedureTrap ? ": " + procedureTrap : ""} -- if the lender missed it, the deficiency shown here would instead be barred entirely.`;
  } else if (procedureTrap) {
    note += ` Procedural trap to flag: ${procedureTrap}`;
  }
  if (bool(f, "foreclosureFairValueOffsetApplies")) {
    const fairValue = num(f, "courtDeterminedFairValue");
    if (fairValue > proceeds) {
      deficiency = Math.max(0, debt - fairValue);
      note += ` A fair-value offset applies here -- the entered court-determined/appraised fair value (${fmtMoney(fairValue)}) exceeds the sale proceeds, so it controls the credit against the debt instead of the lower sale price.`;
    } else {
      note += ` A fair-value offset applies here (the credit against the debt is the greater of sale proceeds or a court-determined fair value) -- enter a fair-value figure if one has been determined and it exceeds the sale proceeds, which would reduce this deficiency.`;
    }
  }
  return { deficiency, note };
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
    const { deficiency, note: stateAdjustmentNote } = computeDeficiencyStateAdjustment(f, gross, proceeds);
    out.push(R("foreclosure_deficiency_judgment", "Foreclosure / Deficiency Judgment", p,
      deficiency, deficiency,
      `This is the legal deficiency the court would enter judgment for, not a prediction of what will actually be collected. Whether a judgment is ultimately collectable depends heavily on the borrower/guarantor's post-judgment asset picture and is outside the scope of this calculator -- treat this figure as case value, not a collection forecast. ${stateAdjustmentNote}`));
  }
  if (bool(f, "receivershipMotionFiled")) {
    out.push(R("receivership_dispute", "Receivership Grant/Denial", [0.65, 0.85], null, null,
      "Not a dollar claim -- operational-control relief. Sample has grown to 10 real matters; of the 8 with a reported ruling, 7 resulted in a receiver appointed and 1 (Brick Air Capital v. NLD Props.) was denied outright even with a consent-to-receivership clause, on the court's equitable discretion."));
  }
  if (bool(f, "guarantyTriggerAlleged") && num(f, "guaranteedBalance") > 0) {
    if (guarantorDisputes) {
      out.push(R("guaranty_enforcement", "Guaranty Enforcement", [0.45, 0.70],
        num(f, "guaranteedBalance") * 0.50, num(f, "guaranteedBalance") * 0.85,
        "A counterclaim or offset has been pled against the guaranty, which meaningfully reduces both the odds of full recovery and the likely dollar outcome -- this becomes a genuinely contested fact question rather than a clean carve-out breach."));
    } else {
      out.push(R("guaranty_enforcement", "Guaranty Enforcement", [0.80, 0.97],
        num(f, "guaranteedBalance") * 0.95, num(f, "guaranteedBalance"),
        "Once a carve-out (\"bad boy\") trigger is credibly found and undisputed -- no counterclaim or offset pled -- most sampled real cases (5 of 7 with a resolved outcome) show guarantors held liable for close to the full guaranteed balance, even for technical/non-fraud breaches. Two real exceptions cut the other way even on an undisputed trigger: a signature-formality defect can render the guaranty entirely unenforceable (Extech Building Materials v. E&N Construction), and a state's own post-hoc legislative fix can retroactively void the very trigger relied on (Michigan's Nonrecourse Mortgage Loan Act in Borman v. Schwebel). The harder questions -- proving the trigger occurred, and that the guaranty is enforceable in the first place -- aren't modeled as a separate probability here."));
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
  // Real, on-point pair from the same underlying facts: RTL/AR Global's
  // $375M internalization payment bundled into the Global Net Lease merger
  // supported a plain fiduciary-duty claim that settled for $3.25M cash
  // (Meyer v. Weil), but a companion suit challenging the SAME self-dealing
  // through a merger-objection theory was dismissed on the merits under
  // Maryland's business-judgment-rule presumption (The Necessity Retail
  // REIT, Inc. Shareholder Litigation v. AR Global Investments, LLC) --
  // most REITs are Maryland (or similarly business-judgment-rule-
  // deferential) entities, so this real split is a genuine, current
  // doctrinal signal for any controlling-insider self-dealing payment
  // structured as part of a merger, not just an outlier.
  const controllingInsiderMergerSelfDealing = bool(f, "controllingInsiderSelfDealingInMerger");
  if (bool(f, "boardBreachAlleged")) {
    const specific = bool(f, "tiedToConcreteSelfDealingTransaction");
    const p: [number, number] = specific ? [0.55, 0.80] : [0.05, 0.15];
    let note = specific ? "Tied to a concrete, quantifiable self-dealing transaction -- real recoveries in this pattern ran $15M-$90M." : "Generic governance complaint with no specific self-dealing transaction -- real cases in this pattern settled for governance changes only, with no disclosed cash recovery.";
    if (specific && controllingInsiderMergerSelfDealing) {
      note += " Where that self-dealing transaction is bundled into a merger (an internalization fee paid to the sponsor/manager as part of the deal), a straight fiduciary-duty theory has proven the more viable vehicle for a real cash recovery than a merger-objection theory over the same conduct: Meyer v. Weil, et al. (The Necessity Retail REIT, Inc. / AR Global Shareholder Litigation) settled for $3.25M cash on this theory even though a companion merger-objection suit over the identical $375M internalization payment was dismissed on the merits (see merger_objection_suit).";
    }
    out.push(R("breach_fiduciary_duty_derivative", "Breach of Fiduciary Duty (Derivative)", p, null, null, note));
  }
  if (bool(f, "proxyOmissionAlleged")) {
    const specific = bool(f, "specificInsiderStakeAlleged");
    const p: [number, number] = specific ? [0.55, 0.80] : [0.10, 0.25];
    out.push(R("proxy_disclosure_claim", "Proxy Disclosure Claim", p, null, null,
      specific ? "A specific, quantifiable undisclosed insider stake was alleged -- this pattern survived dismissal and drew real cash settlements in the research sample." : "Only a generic, already-disclosed industry risk is alleged -- this pattern was dismissed for lack of materiality in the research sample."));
  }
  if (bool(f, "mergerObjection")) {
    let p: [number, number] = [0.10, 0.25];
    let extraNote = "";
    if (controllingInsiderMergerSelfDealing) {
      p = [0.05, 0.15];
      extraNote = " Even a large, specifically-quantified controlling-insider self-dealing figure bundled into a merger doesn't reliably overcome business-judgment-rule deference on a merger-objection theory specifically: The Necessity Retail REIT, Inc. Shareholder Litigation v. AR Global Investments, LLC was dismissed on the merits under Maryland's business-judgment-rule presumption despite a $375M (18% of combined-entity value) alleged self-dealing payment -- a plain fiduciary-duty theory over the same conduct is the more likely path to a real recovery (see breach_fiduciary_duty_derivative) rather than this claim type.";
    }
    out.push(R("merger_objection_suit", "Merger Objection Suit", p, 75000, 500000,
      `Real recovery is rare; when a settlement happens it's typically a 'mootness fee' to plaintiff's counsel, not a per-share shareholder payout.${extraNote}`));
  }
  return out;
}

// Applies this project's state's real construction anti-indemnity statute
// (merged from js/case-valuation-data.js's 51-jurisdiction
// constructionIndemnityStateModifiers table into flattened
// `constructionIndemnity*` facts by the request handler, same pattern as
// the other state-law merges in this file) to the indemnification/
// contribution allocation range, instead of that claim using a flat
// 10%-88% multiplier regardless of state law or how the defect's
// responsibility is actually distributed. Also folds in the real
// allocation-pattern evidence (a single-subcontractor-traced defect vs. a
// diffuse multi-party one) and the insurer-subrogation risk from Seneca v.
// Jade Beach -- none of which evalConstructionDefect() referenced before
// this fix, despite all of it already sitting in the citation data.
function computeConstructionIndemnityAdjustment(f: Facts): { low: number; high: number; note: string } {
  const state = str(f, "state");
  const form = str(f, "constructionIndemnityForm");
  const citation = str(f, "constructionIndemnityCitation");
  const ownNegligenceClause = bool(f, "indemnityClauseCoversIndemniteesOwnNegligence");
  const notes: string[] = [];

  // Base range: the file's original flat 10%-88% of repair cost, before any
  // allocation-pattern or state-law adjustment.
  let low = 0.10, high = 0.88;

  if (bool(f, "defectTracedToSingleSubcontractor")) {
    low = 0.70; high = 0.90;
    notes.push("Defect traced to a single subcontractor's workmanship -- real allocation data (Kellner v. Advance Cast Stone Co., the Milwaukee Parking Structure Panel Collapse) shows an 88%/10%/2% subcontractor/GC/owner split in this fact pattern, pushing the allocated share toward that subcontractor's high end rather than a diffuse multi-party split.");
  } else if (f.defectTracedToSingleSubcontractor === false) {
    notes.push("Defect responsibility is shared across the GC and multiple trades rather than traced to one subcontractor -- allocation tends to run lower and more diffuse than the single-subcontractor pattern; e.g. a design professional co-defendant alongside a developer/GC took only ~10% of the total in one real allocation, since professional E&O coverage limits are typically much smaller than a GC's CGL policy.");
  }

  if (ownNegligenceClause) {
    if (!state || !form) {
      notes.push("This indemnity clause purports to reach the indemnitee's own negligence, but this project's state hasn't been separately researched for its anti-indemnity statute here -- whether that portion of the clause is even enforceable is a real open question not reflected in the range above.");
    } else if (form === "limited") {
      high = Math.min(high, 0.30);
      notes.push(`${state}'s anti-indemnity statute is one of the strictest ("limited" form)${citation ? ` (${citation})` : ""} -- it voids indemnification for essentially ANY of the indemnitee's own negligence, not just sole negligence, so a clause reaching the indemnitee's own fault is largely unenforceable here; the indemnitor's real exposure is capped near its own proportionate fault share, well below what a broad clause would otherwise support.`);
    } else if (form === "intermediate") {
      notes.push(`${state} voids indemnification only for the indemnitee's SOLE negligence ("intermediate" form)${citation ? ` (${citation})` : ""} -- concurrent-negligence indemnity (the indemnitee bears some fault too, but not all of it) generally survives, so this clause likely remains enforceable unless the claim is that the indemnitee was SOLELY at fault, in which case the low end of this range is the more realistic outcome.`);
    } else if (form === "broad-capped") {
      notes.push(`${state} allows indemnification for the indemnitee's own acts "in whole or in part" but only up to a statutory monetary cap ("broad-capped" form)${citation ? ` (${citation})` : ""} -- confirm the actual cap amount against the repair-cost estimate, since it can bind below the modeled high end.`);
    } else {
      notes.push(`${state} has no general construction anti-indemnity statute confirmed ("broad" form)${citation ? ` (${citation})` : ""} -- broad-form indemnity, even for the indemnitee's sole negligence, can generally be enforced here if clearly drafted, though courts strictly construe such language.`);
    }
    if (form === "limited" || form === "intermediate") {
      notes.push("An overbroad clause doesn't always fail entirely, and the REMEDY varies by state: Virginia voids an overbroad indemnity clause outright and refuses to \"blue-pencil\" it into an enforceable one, even where the clause itself invokes \"the fullest extent permitted by law\" (Fortune-Johnson, Inc. v. QFS, LLC; Uniwest Constr., Inc. v. Amtech Elevator Servs., Inc.), while North Carolina instead blue-pencils the offending language down to what the statute allows and evaluates the claim under the narrowed clause (In re New Bern Riverfront Development, LLC) -- confirm which approach this state takes before assuming an overbroad clause is either fully dead or fully rescued.");
    }
  } else if (ownNegligenceClause === false) {
    notes.push("This indemnity clause is not alleged to reach the indemnitee's own negligence -- most state anti-indemnity statutes target only that scenario, so this clause likely isn't at risk of being narrowed or voided on that ground; it can still fail on other grounds, such as the underlying claim not \"arising out of\" the indemnitor's own work (Dibrino v. Rockefeller Center North, Inc.).");
  }

  if (bool(f, "ownerSettledWithContractorsAfterInsurerPayout")) {
    notes.push("A separate risk flagged by real precedent: where a property/liability insurer has already paid the owner/association for the defect and the owner then settles with and releases the contractors, that release can impair the CARRIER's own subrogation/contribution rights and expose the owner to a second, independent breach-of-contract claim from its own insurer (Seneca Specialty Insurance Co. v. Jade Beach Condominium Association, Inc.) -- coordinate any settlement with a carrier that has already paid out before releasing the contractors.");
  }

  return { low, high, note: notes.join(" ") };
}

// Real, current CGL duty-to-defend/indemnify case law shows two of the
// most consequential facts in a construction-defect coverage dispute are
// (1) whether the defect traces to a subcontractor's work vs. the GC's own
// direct work, and (2) whether the claimed damage extends beyond the
// defect itself to other, non-defective property -- neither of which
// insurerDeniedCoverage alone could distinguish before this fix.
function computeCglCoverageAdjustment(f: Facts): { prob: [number, number]; note: string } {
  let prob: [number, number] = [0.45, 0.65];
  const notes: string[] = [];
  const subWork = f.defectCausedBySubcontractorWork;
  if (subWork === true) {
    prob = [0.55, 0.75];
    notes.push("Defect traced to a SUBCONTRACTOR's work, not the general contractor's own direct work -- courts increasingly hold that negligent subcontractor work causing project damage IS \"property damage\" caused by an \"occurrence\" under a standard CGL policy, favoring a duty to defend (Acuity, a Mutual Ins. Co. v. M/I Homes of Chicago, LLC, 2023 IL 129087, expressly overruling prior precedent that treated construction-defect claims as categorically uninsurable business risk; Cornice & Rose International, LLC v. Acuity, 2024 WL 4880102 (7th Cir. 2024), duty to defend owed to an architecture firm).");
  } else if (subWork === false) {
    prob = [0.30, 0.50];
    notes.push("Defect alleged against the general contractor's OWN direct work, with no subcontractor involved -- this is the fact pattern where insurers most often prevail on a no-duty-to-defend theory (Admiral Insurance Co. v. Tocci Building Corp., 122 F.4th 1 (1st Cir. 2024)).");
  } else {
    notes.push("Whether the defect is traced to a subcontractor's work (favors coverage) or the GC's own direct work (favors the insurer) is one of the most consequential facts in a CGL coverage dispute -- not specified here.");
  }
  if (bool(f, "damageExtendsBeyondDefectItself")) {
    notes.push("Claimed damages extend beyond the cost of fixing the defect itself to OTHER, non-defective work or property -- courts that otherwise treat the cost to fix the defect itself as uncovered business risk still treat resulting damage to other property as covered \"property damage\" (Lessard v. R.C. Havens & Sons, Inc., 104 Mass. App. Ct. 572 (2024)), which supports at least partial coverage for that portion.");
  } else if (f.damageExtendsBeyondDefectItself === false) {
    notes.push("Claimed damages are limited to the cost of repairing/removing the defect itself, with no alleged damage to other, non-defective work or property -- several real, recent decisions hold that cost alone is not covered \"property damage\" under a standard CGL policy (Lessard v. R.C. Havens & Sons, Inc.; Westchester Modular Homes of Fairfield County, Inc. v. Arbella Protection Ins. Co., 224 Conn. App. 526 (2024), water intrusion alone).");
  }
  return { prob, note: notes.join(" ") };
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
    const adj = computeConstructionIndemnityAdjustment(f);
    out.push(R("indemnification_contribution_claim", "Indemnification / Contribution", [0.40, 0.70],
      num(f, "repairCostEstimate") * adj.low, num(f, "repairCostEstimate") * adj.high,
      adj.note));
  }
  if (bool(f, "insurerDeniedCoverage")) {
    const cgl = computeCglCoverageAdjustment(f);
    out.push(R("insurance_coverage_defect_dispute", "Insurance Coverage Dispute (CGL)", cgl.prob, null, null,
      `Coverage disputes usually resolve the legal question (duty to defend/indemnify) rather than a dollar figure -- treat this as a coverage yes/no signal. ${cgl.note}`));
  }
  return out;
}

// js/case-valuation-data.js's own note on cercla_cost_recovery claims this
// allocation share is "computed directly in evalEnvironmental() ... based on
// the innocentLandownerStatus fact" -- that was false until this function:
// no such fact or branch existed anywhere in this file. Implements the real
// doctrinal fork the note actually describes (CERCLA Sec. 107(b), 5-factor
// test in Advanced Tech. Corp. v. Eliskim, Inc.): a plaintiff who qualifies
// as an innocent landowner can bring a full Sec. 107(a) cost-recovery claim
// (recovering the ENTIRE cleanup cost from other PRPs); a plaintiff who is
// itself a PRP (owner/operator, arranger, or transporter) is functionally
// limited to a contribution-style claim recovering only the other parties'
// equitable share. Falls back to the prior flat 50%-100% range when the
// status hasn't been specified, rather than guessing which side of the
// fork applies.
function computeCerclaAllocationShare(f: Facts): { low: number; high: number; note: string } {
  const status = str(f, "innocentLandownerStatus");
  const citation = "Advanced Tech. Corp. v. Eliskim, Inc., No. 1:96CV755 (N.D. Ohio 2000)";
  if (!status) {
    return {
      low: 0.5, high: 1.0,
      note: `Whether this plaintiff qualifies as a CERCLA Sec. 107(b) "innocent landowner" (5-factor test, ${citation}) materially changes this allocation share -- not specified here, so a flat 50%-100% range is shown rather than the sharper split a real innocent-landowner determination would produce.`,
    };
  }
  if (status === "innocent-landowner-defense-asserted") {
    return {
      low: 0.85, high: 1.0,
      note: `An asserted, qualifying Sec. 107(b) innocent-landowner defense (5-factor test, ${citation}) supports a full Sec. 107(a) cost-recovery claim -- recovering the ENTIRE cleanup cost from other PRPs, not merely an equitable share -- reflected in the high end of this range; the low end reflects the real risk the defense doesn't hold up on the facts (e.g. a due-diligence gap defeats the "all appropriate inquiry" prong).`,
    };
  }
  // owner-operator / arranger / transporter -- a PRP itself, not innocent.
  return {
    low: 0.20, high: 0.60,
    note: `Because this plaintiff is itself a PRP (${status.replace(/-/g, " ")}) rather than a qualifying Sec. 107(b) innocent landowner (${citation}), it is functionally limited to a contribution-style claim -- recovering only the OTHER parties' equitable share, not the full cost -- modeled here in the same range as this category's own CERCLA Contribution claim.`,
  };
}

function evalEnvironmental(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string, b?: boolean) => R2(cit, k, l, p, lo, hi, n, b);
  if (num(f, "cleanupCostsIncurred") > 0) {
    const alloc = computeCerclaAllocationShare(f);
    out.push(R("cercla_cost_recovery", "CERCLA Cost Recovery", [0.65, 0.85],
      num(f, "cleanupCostsIncurred") * alloc.low, num(f, "cleanupCostsIncurred") * alloc.high,
      `Liability is strict/joint/several once PRP status attaches -- allocation share is the real question, not whether liability exists at all. ${alloc.note}`));
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

// =========================================================
// Premises liability -- a straight port of evalPremisesLiability and its
// four helper functions in js/case-valuation-engine.js. This category was
// added to the client, the citation database, and CATEGORY_FIELDS above,
// but was never ported to this evaluator -- every AI-document-upload
// analysis request for it failed immediately with "Unrecognized
// litigation category" (CATEGORY_FIELDS lacked an entry) and, even once
// that's fixed, would have silently returned zero claims without this
// evaluator (EVALUATORS lacked an entry too). KEEP IN SYNC with the
// client per the warning above.
// =========================================================

function computePremisesLiabilityFaultAdjustment(
  f: Facts, baseProb: [number, number], damagesLow: number, damagesHigh: number,
): { prob: [number, number]; low: number; high: number; note: string | null } {
  const faultPct = num(f, "plaintiffComparativeFaultPercent");
  const rule = str(f, "premisesFaultRule");
  const state = str(f, "state") || "This state";
  let prob = baseProb, low = damagesLow, high = damagesHigh, note: string | null = null;
  if (!rule || !(faultPct > 0)) return { prob, low, high, note };
  const citation = str(f, "premisesFaultRuleCitation");
  const citeSuffix = citation ? ` (${citation})` : "";
  if (rule === "Pure Contributory") {
    prob = [Math.min(prob[0], 0.03), Math.min(prob[1], 0.08)];
    note = `${state} is a pure contributory negligence jurisdiction${citeSuffix} -- ANY plaintiff fault, even ${faultPct}%, bars recovery entirely as a matter of law. Probability shown reflects only the small chance a court finds the plaintiff free of fault despite the alleged percentage.`;
  } else if (rule === "Modified Comparative (50% Bar)") {
    if (faultPct >= 50) {
      prob = [Math.min(prob[0], 0.05), Math.min(prob[1], 0.12)];
      note = `${state} bars recovery once the plaintiff's fault reaches 50%${citeSuffix} -- at ${faultPct}% alleged fault, recovery is barred outright unless that percentage is successfully contested down.`;
    } else {
      const factor = 1 - faultPct / 100;
      low *= factor; high *= factor;
      note = `${state} reduces recovery by the plaintiff's own fault percentage, barring recovery only at 50% or more${citeSuffix} -- damages reduced ${faultPct}% for the alleged comparative fault.`;
    }
  } else if (rule === "Modified Comparative (51% Bar)") {
    if (faultPct > 50) {
      prob = [Math.min(prob[0], 0.05), Math.min(prob[1], 0.12)];
      note = `${state} bars recovery once the plaintiff's fault exceeds 50%${citeSuffix} -- at ${faultPct}% alleged fault, recovery is barred outright unless that percentage is successfully contested down.`;
    } else {
      const factor = 1 - faultPct / 100;
      low *= factor; high *= factor;
      note = `${state} reduces recovery by the plaintiff's own fault percentage, barring recovery only once it exceeds 50%${citeSuffix} -- damages reduced ${faultPct}% for the alleged comparative fault.`;
    }
  } else if (rule === "Pure Comparative") {
    const factor = 1 - faultPct / 100;
    low *= factor; high *= factor;
    note = `${state} is a pure comparative negligence jurisdiction${citeSuffix} -- damages reduced ${faultPct}% for the plaintiff's own alleged fault, with no bar regardless of how high that percentage runs.`;
  } else if (rule.indexOf("Slight/Gross") === 0) {
    if (faultPct >= 30) {
      prob = [Math.min(prob[0], 0.05), Math.min(prob[1], 0.12)];
      note = `South Dakota uses a unique "slight/gross" comparison rather than a percentage allocation${citeSuffix} -- courts have found alleged fault as low as 30% too much to qualify as "slight," which bars recovery outright. At ${faultPct}% alleged fault, treat recovery as barred absent a strong argument the plaintiff's conduct was genuinely minor.`;
    } else {
      note = `South Dakota uses a unique "slight/gross" comparison rather than a percentage allocation${citeSuffix} -- at ${faultPct}% alleged fault, this may still qualify as "slight" if the defendant's negligence was comparatively "gross," but the standard is vague and fact-specific; no formulaic damages reduction applies the way it would in a percentage-based state.`;
    }
  }
  return { prob, low, high, note };
}

function computeOpenAndObviousStateAdjustment(f: Facts, baseProb: [number, number]): { prob: [number, number]; note: string | null } {
  if (!bool(f, "openAndObviousDefenseRaised")) return { prob: baseProb, note: null };
  const rule = str(f, "premisesOpenAndObviousRule");
  const state = str(f, "state") || "This state";
  const citation = str(f, "premisesOpenAndObviousCitation");
  const citeSuffix = citation ? ` (${citation})` : "";
  if (rule === "Traditional No-Duty Bar") {
    return { prob: [0.05, 0.15], note: `${state} treats an open-and-obvious hazard as a full no-duty bar${citeSuffix} -- this defense is usually outright dispositive here, not just a factor.` };
  }
  if (rule === "Comparative-Fault-Factor-Only") {
    return { prob: [0.30, 0.50], note: `${state} does not treat obviousness as a duty bar at all${citeSuffix} -- it goes to the jury purely as a comparative-fault factor, so this claim survives with only a modest reduction (the real effect shows up in the fault-percentage adjustment, not here).` };
  }
  if (rule === "No-Duty-to-Warn-but-Duty-to-Remedy") {
    return { prob: [0.15, 0.30], note: `${state} follows the Restatement (Second) Sec. 343A rule${citeSuffix} -- no duty to warn of the obvious hazard, but a separate duty to remedy it survives if harm was still foreseeable despite the obviousness.` };
  }
  const doctrine = str(f, "premisesOpenAndObviousDoctrine");
  return { prob: [0.15, 0.30], note: doctrine ? `${state}'s open-and-obvious rule: ${doctrine}${citeSuffix}.` : null };
}

function computeNegligentSecurityStateAdjustment(f: Facts, hasPriorIncidents: boolean): { prob: [number, number]; note: string | null } {
  const test = str(f, "premisesNegligentSecurityTestNormalized");
  const state = str(f, "state") || "This state";
  const citation = str(f, "premisesNegligentSecurityCitation");
  const citeSuffix = citation ? ` (${citation})` : "";
  if (test === "Specific Harm Rule") {
    const prob: [number, number] = hasPriorIncidents ? [0.28, 0.48] : [0.05, 0.12];
    return { prob, note: `${state} applies the restrictive "specific harm" rule${citeSuffix} -- the owner must have known of an imminent, SPECIFIC danger to this plaintiff; even a real pattern of prior incidents doesn't automatically clear this bar, which is why the odds here stay capped well below what a looser-test state would show on the same facts.` };
  }
  if (test === "Totality of the Circumstances" || test === "Balancing Test") {
    const prob: [number, number] = hasPriorIncidents ? [0.50, 0.72] : [0.20, 0.35];
    return { prob, note: `${state} uses a ${test.toLowerCase()}${citeSuffix} -- prior incidents are only one factor among several (nature of the business, location, area crime patterns, existing security measures), so this claim carries real weight even without them, and is stronger still with them.` };
  }
  if (test === "Prior Similar Incidents") {
    const prob: [number, number] = hasPriorIncidents ? [0.45, 0.68] : [0.08, 0.18];
    return { prob, note: `${state} applies the strict "prior similar incidents" rule${citeSuffix} -- without a substantially similar prior crime on the property or its immediate vicinity, this claim faces a real, specific obstacle beyond the general difficulty of negligent-security claims.` };
  }
  const prob: [number, number] = hasPriorIncidents ? [0.45, 0.68] : [0.18, 0.32];
  return { prob, note: null };
}

function computePunitiveDamagesAvailability(f: Facts, compensatoryLow: number, compensatoryHigh: number): { prob: [number, number]; low: number; high: number; note: string } {
  const standard = str(f, "premisesPunitiveDamagesStandard") || "";
  const capNote = str(f, "premisesPunitiveDamagesCap") || "";
  const state = str(f, "state") || "this state";
  if (/^PROHIBITED/.test(standard)) {
    return { prob: [0, 0], low: 0, high: 0, note: `Punitive damages are unavailable in ${state} for an ordinary premises-liability claim: ${standard.replace(/^PROHIBITED -- /, "")}` };
  }
  if (/^STATUTE-ONLY/.test(standard)) {
    return { prob: [0, 0.05], low: 0, high: compensatoryHigh * 0.5, note: `${state} generally does not allow punitive damages absent a specific enabling statute: ${standard.replace(/^STATUTE-ONLY -- /, "")} Confirm whether a specific statute applies to this fact pattern before assuming this theory is viable at all.` };
  }
  let prob: [number, number] = [0.08, 0.20];
  if (/BEYOND A REASONABLE DOUBT/.test(standard)) {
    prob = [0.03, 0.10];
  } else if (/^Preponderance/.test(standard)) {
    prob = [0.12, 0.28];
  }
  const low = compensatoryLow * 0.5;
  const high = compensatoryHigh * 1.5;
  return { prob, low, high, note: `Requires proof the property owner's conduct was willful, wanton, or in reckless disregard of a known danger -- ordinary negligence alone never supports punitive damages. Evidentiary standard in ${state}: ${standard || "not researched"}.${capNote ? " Cap: " + capNote : ""}` };
}

function evalPremisesLiability(f: Facts, cit: CaseData["citations"]): Claim[] {
  const out: Claim[] = [];
  const R = (k: string, l: string, p: [number, number], lo: number | null, hi: number | null, n?: string) => R2(cit, k, l, p, lo, hi, n);
  const state = str(f, "state") || "This state";
  const specials = num(f, "medicalSpecialsIncurred");
  const wages = num(f, "lostWagesClaimed");
  const severityMultipliers: Record<string, [number, number]> = {
    "minor": [1.5, 2.5],
    "moderate": [2, 4],
    "severe": [3, 5],
    "catastrophic": [4, 8],
  };
  const injurySeverity = str(f, "injurySeverity") || "";
  const mult = severityMultipliers[injurySeverity] || [2, 4];
  const damageNote = "Uses the general-damages \"multiplier method\" common in personal-injury claims practice (medical specials x a severity-tiered multiplier, plus lost wages added separately) -- an industry rule-of-thumb range, not itself drawn from a specific cited case; actual jury/settlement values in a given matter can fall well outside it.";

  function pushInjuryClaim(claimKey: string, label: string, baseProb: [number, number], extraNote: string) {
    if (!(specials > 0)) return;
    const rawLow = specials * mult[0] + wages;
    const rawHigh = specials * mult[1] + wages;
    const adj = computePremisesLiabilityFaultAdjustment(f, baseProb, rawLow, rawHigh);
    const note = [extraNote, damageNote, adj.note].filter(Boolean).join(" ");
    out.push(R(claimKey, label, adj.prob, adj.low, adj.high, note));
  }

  const premisesLiabilityDistinct = bool(f, "premisesLiabilityDistinct");
  const distinctClaimNote = premisesLiabilityDistinct
    ? ` PLEADING NOTE: ${state} treats premises liability as legally distinct from an ordinary negligent-activity claim -- confirm this is pled/argued under the correct theory, since mischaracterizing it can be outcome-determinative here.`
    : "";

  if (bool(f, "slipAndFallAlleged")) {
    let p: [number, number] = [0.35, 0.55];
    let extraNote = "Slip-and-fall claims turn overwhelmingly on whether the property owner had actual or constructive NOTICE of the hazardous condition long enough before the injury to have fixed or warned of it -- most claims that fail, fail on notice, not on whether a hazard existed at all.";
    const hazardNoticeProven = str(f, "hazardNoticeProven");
    if (hazardNoticeProven === "yes") {
      p = [0.55, 0.75];
      extraNote += " Notice has been proven here, which materially improves the odds above the baseline range.";
    } else if (hazardNoticeProven === "no") {
      p = [0.12, 0.28];
      extraNote += " No notice evidence has been identified here, which materially worsens the odds below the baseline range -- see Albertsons, LLC v. Mohammadi (Tex. 2024), where knowledge of an upstream cause was held not to be evidence of knowledge of the specific hazard itself.";
      const modeAdopted = f.premisesModeOfOperationAdopted;
      if (bool(f, "selfServiceModeOfOperationApplicable") && (modeAdopted === true || modeAdopted === "partial")) {
        p = [0.28, 0.48];
        const modeCitation = str(f, "premisesModeOfOperationCitation");
        extraNote += ` However, ${state} has ${modeAdopted === "partial" ? "at least partially " : ""}adopted the "mode of operation" rule${modeCitation ? ` (${modeCitation})` : ""} -- since this hazard fits a self-service business's own operating method, the plaintiff may be able to skip proving notice of THIS specific hazard entirely, which meaningfully improves the odds despite the notice gap above.`;
      }
    }
    pushInjuryClaim("slip_and_fall_hazardous_condition", "Slip-and-Fall / Hazardous Condition", p, extraNote + distinctClaimNote);
  }

  if (bool(f, "inadequateSecurityAlleged")) {
    const priorIncidents = bool(f, "priorSimilarCrimeIncidents");
    const secAdj = computeNegligentSecurityStateAdjustment(f, priorIncidents);
    let extraNote = "Inadequate/negligent-security claims require proving the criminal act was FORESEEABLE to the property owner -- a genuinely harder bar than an ordinary hazard claim, and the state's specific foreseeability test (see below) usually matters more than any other single fact.";
    extraNote += priorIncidents
      ? " Prior similar incidents have been identified here (see Georgia CVS Pharmacy, LLC v. Carmichael, 316 Ga. 718 (2023))."
      : " No prior similar incidents have been identified here.";
    if (secAdj.note) extraNote += " " + secAdj.note;
    pushInjuryClaim("inadequate_security_third_party_crime", "Inadequate Security / Third-Party Criminal Act", secAdj.prob, extraNote + distinctClaimNote);
  }

  if (bool(f, "structuralFailureAlleged")) {
    const p: [number, number] = [0.40, 0.60];
    const extraNote = "Structural/maintenance failures (collapsed railings, failed stairs, defective elevators, etc.) are typically easier to prove than a transient hazard like a spill, since the defect itself is durable and can usually be established through inspection and expert testimony rather than relying on notice timing alone.";
    pushInjuryClaim("negligent_maintenance_structural_failure", "Negligent Maintenance / Structural Failure", p, extraNote + distinctClaimNote);
  }

  if (bool(f, "failureToWarnAlleged")) {
    const base: [number, number] = [0.35, 0.55];
    const oaoAdj = computeOpenAndObviousStateAdjustment(f, base);
    let extraNote = "A failure-to-warn theory turns on whether the danger was hidden/non-obvious -- how an obvious hazard is treated is one of the more consequential state-law splits in this whole area (see the state's open-and-obvious doctrine type below).";
    if (bool(f, "openAndObviousDefenseRaised")) {
      extraNote += oaoAdj.note ? " " + oaoAdj.note : " The open-and-obvious defense has been raised here.";
    }
    pushInjuryClaim("dangerous_condition_failure_to_warn", "Dangerous Condition / Failure to Warn", oaoAdj.prob, extraNote + distinctClaimNote);
  }

  if (bool(f, "egregiousConductAllegedForPunitives") && out.length) {
    const compLow = out.reduce((s, c) => s + (c.damagesRange ? c.damagesRange[0] : 0), 0);
    const compHigh = out.reduce((s, c) => s + (c.damagesRange ? c.damagesRange[1] : 0), 0);
    const pun = computePunitiveDamagesAvailability(f, compLow, compHigh);
    out.push(R("premises_punitive_damages", "Punitive Damages", pun.prob, pun.low, pun.high, pun.note));
  }

  return out;
}

const EVALUATORS: Record<string, (f: Facts, cit: CaseData["citations"]) => Claim[]> = {
  "premises-liability": evalPremisesLiability,
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
    { key: "state", type: "state", label: "Property state (for deficiency-judgment rules)" },
    { key: "loanBalance", type: "number", label: "Outstanding loan balance ($)" },
    { key: "foreclosureFiled", type: "boolean", label: "Has a foreclosure action been filed?" },
    { key: "foreclosureMethod", type: "select", label: "Foreclosure method used, if known", options: ["judicial", "non-judicial", "unknown"] },
    { key: "borrowerDisputesDefault", type: "boolean", label: "Does the borrower dispute the default itself?" },
    { key: "lenderAdvances", type: "number", label: "Lender protective advances -- taxes/insurance paid ($)" },
    { key: "saleProceeds", type: "number", label: "Foreclosure sale proceeds, if known ($)" },
    { key: "courtDeterminedFairValue", type: "number", label: "Court-determined or appraised fair market value at foreclosure, if any -- for states with a fair-value offset ($)" },
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
    { key: "controllingInsiderSelfDealingInMerger", type: "boolean", label: "Is a specific self-dealing payment to a controlling insider (e.g. an internalization fee to the sponsor/manager) alleged as part of the merger itself?" },
  ],
  "construction-defect": [
    { key: "state", type: "state", label: "Project state (for the construction anti-indemnity statute)" },
    { key: "contractorDefectAlleged", type: "boolean", label: "Is a defect alleged against the general contractor?" },
    { key: "repairCostEstimate", type: "number", label: "Estimated repair cost ($)" },
    { key: "catastrophicOrLifeSafety", type: "boolean", label: "Is this a catastrophic/structural/life-safety failure?" },
    { key: "designErrorAlleged", type: "boolean", label: "Is a design error alleged against the architect/engineer?" },
    { key: "multiplePartiesIndemnityExists", type: "boolean", label: "Are there multiple responsible parties with an indemnity clause?" },
    { key: "indemnityClauseCoversIndemniteesOwnNegligence", type: "boolean", label: "If so: does the indemnity clause purport to cover the indemnitee's OWN negligence (sole or concurrent), not just the indemnitor's own fault?" },
    { key: "defectTracedToSingleSubcontractor", type: "boolean", label: "Is the defect traced to a single, identifiable subcontractor's workmanship (rather than shared among the GC and multiple trades)?" },
    { key: "ownerSettledWithContractorsAfterInsurerPayout", type: "boolean", label: "Has the owner/association already settled with and released the contractor(s) after an insurer already paid out for the defect?" },
    { key: "insurerDeniedCoverage", type: "boolean", label: "Has a CGL insurer denied or disputed coverage?" },
    { key: "defectCausedBySubcontractorWork", type: "boolean", label: "If coverage is disputed: was the defect caused by a subcontractor's work (rather than the general contractor's own direct work)?" },
    { key: "damageExtendsBeyondDefectItself", type: "boolean", label: "If coverage is disputed: does the claimed damage extend beyond the cost of fixing the defect itself to other, non-defective work or property?" },
  ],
  "environmental": [
    { key: "cleanupCostsIncurred", type: "number", label: "Cleanup/remediation costs incurred or estimated ($)" },
    { key: "contaminationScale", type: "select", label: "Contamination scale", options: ["single-parcel", "multi-decade/waterway", "small-commercial-penalty"] },
    { key: "innocentLandownerStatus", type: "select", label: "Plaintiff's CERCLA PRP status/role -- affects whether this is a full cost-recovery claim or a contribution-style claim (Sec. 107(b))", options: ["owner-operator", "arranger", "transporter", "innocent-landowner-defense-asserted"] },
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
  "premises-liability": [
    { key: "state", type: "state", label: "State where the injury occurred (for comparative-fault and punitive-damages rules)" },
    { key: "medicalSpecialsIncurred", type: "number", label: "Medical specials incurred/anticipated ($)" },
    { key: "lostWagesClaimed", type: "number", label: "Lost wages claimed ($)" },
    { key: "injurySeverity", type: "select", label: "Injury severity", options: ["minor", "moderate", "severe", "catastrophic"] },
    { key: "slipAndFallAlleged", type: "boolean", label: "Is this a slip-and-fall / hazardous-condition claim?" },
    { key: "hazardNoticeProven", type: "select", label: "If slip-and-fall: has actual or constructive notice of the hazard been proven?", options: ["yes", "no", "unclear"] },
    { key: "selfServiceModeOfOperationApplicable", type: "boolean", label: "If notice hasn't been proven: does the hazard fit a self-service business's own operating method (e.g. self-serve produce, drink stations)?" },
    { key: "inadequateSecurityAlleged", type: "boolean", label: "Is inadequate/negligent security (third-party criminal act) alleged?" },
    { key: "priorSimilarCrimeIncidents", type: "boolean", label: "If so: were there prior similar criminal incidents on the property or in its immediate vicinity?" },
    { key: "structuralFailureAlleged", type: "boolean", label: "Is negligent maintenance / structural failure alleged (railing, stairs, elevator, etc.)?" },
    { key: "failureToWarnAlleged", type: "boolean", label: "Is failure to warn of a dangerous condition alleged?" },
    { key: "openAndObviousDefenseRaised", type: "boolean", label: "If so: has the property owner raised an open-and-obvious defense?" },
    { key: "plaintiffComparativeFaultPercent", type: "number", label: "Plaintiff's own alleged comparative-fault percentage (0-100)" },
    { key: "egregiousConductAllegedForPunitives", type: "boolean", label: "Is the property owner's conduct alleged to be willful, wanton, or in reckless disregard of a known danger (punitive damages)?" },
  ],
};

// Short human-readable descriptions of each category, used ONLY to build
// the classification prompt below (classifyCategory) -- kept next to
// CATEGORY_FIELDS since the ids must stay in exact sync with it, but kept
// separate from CaseData/loadCaseData() on purpose: classification must
// work even before/without a successful fetch of case-valuation-data.js,
// and keeping it self-contained makes classifyCategory reviewable on its
// own without tracing through the fetched-data plumbing.
const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "lease-disputes": "Commercial lease disputes between landlord and tenant -- unpaid rent, lease termination/acceleration of future rent, holdover, landlord self-help/wrongful lockout, security deposits, breach of quiet enjoyment, re-leasing/mitigation costs.",
  "lending-foreclosure": "Commercial real-estate lending and foreclosure disputes -- loan default, foreclosure actions and deficiency judgments, receivership, guaranty enforcement/carve-out ('bad boy') triggers, borrower-asserted lender-liability claims.",
  "reit-securities": "REIT and real-estate securities litigation -- stock-drop securities fraud, board/sponsor breach-of-fiduciary-duty derivative suits, proxy disclosure claims, merger-objection suits.",
  "construction-defect": "Construction defect disputes on a commercial or multi-unit property -- contractor workmanship or design-professional defects, repair costs, indemnification/contribution among contractors, CGL insurance coverage disputes over defect claims.",
  "environmental": "Environmental contamination and cleanup disputes on commercial/industrial property -- CERCLA cost recovery, contribution claims among potentially responsible parties (PRPs), state cleanup consent decrees, environmental insurance coverage disputes.",
  "eminent-domain": "Eminent domain / condemnation disputes -- just-compensation valuation fights, challenges to the taking itself, pre-condemnation survey/access disputes, regulatory-takings claims.",
  "zoning-land-use": "Zoning and land-use disputes -- variance or permit denials, spot-zoning challenges, arbitrary or discriminatory denial of development approvals (including Section 1983 civil-rights claims), development-agreement breaches.",
  "premises-liability": "Premises liability / personal-injury claims arising on commercial property -- slip-and-fall or other hazardous-condition injuries, inadequate/negligent security against third-party crime, structural or maintenance failures, failure to warn of a dangerous condition.",
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

// =========================================================
// Category classification -- runs BEFORE the existing per-category
// evaluator pipeline described at the top of this file. The frontend no
// longer offers a category dropdown, so the litigation category has to be
// inferred server-side from whatever the user gave us: their own typed
// `description`, extracted `documentText`, or (usually) both. Deliberately
// kept as its own small, single-purpose function -- separate from the
// fact-extraction pass below -- so it can be reviewed and tuned on its
// own. Uses the same Anthropic client and the same structured-JSON-output
// call shape as the fact-extraction pass (EXTRACTION_MODEL / Haiku --
// classifying into one of a fixed, short list of ids is a much easier
// task than full fact extraction or the comprehensive narrative analysis,
// so there's no reason to spend Opus effort or tokens on it).
//
// Returns the category id (a real key of CATEGORY_FIELDS) on a confident
// match, or null if it genuinely can't be placed -- callers must treat
// null as "ask the user for more detail," never coerce it to a guess.
// Handles both directions of partial input correctly: `description` alone
// with an empty `documentText` (no files uploaded), and `documentText`
// alone with an empty `description` (uploaded document but nothing typed)
// -- either one on its own is sent to the model; only when BOTH are empty
// does this short-circuit to null without even calling the API.
async function classifyCategory(description: string, documentText: string): Promise<{ category: string | null; cost: number }> {
  const categoryIds = Object.keys(CATEGORY_FIELDS);
  const categoryListText = categoryIds
    .map((id) => `- "${id}": ${CATEGORY_DESCRIPTIONS[id] || ""}`)
    .join("\n");

  const combinedSourceText = [
    description ? `=== User's own description of the case ===\n${description}` : "",
    documentText ? `=== Uploaded/pasted document(s) ===\n${documentText}` : "",
  ].filter(Boolean).join("\n\n");

  // Nothing to classify from -- return null rather than calling the API
  // (the caller already guards against this case, but classifyCategory
  // should be safe to call directly with either input empty or both).
  if (!combinedSourceText) return { category: null, cost: 0 };

  const response = await anthropic!.messages.create({
    model: EXTRACTION_MODEL,
    max_tokens: 200,
    system:
      "You classify a commercial real-estate litigation matter into EXACTLY ONE of a fixed list of categories, based on the user's own description of their case and/or an uploaded document. " +
      "Only pick a category if the facts actually and specifically fit it. If the matter is too vague or generic to place with confidence, doesn't clearly match any category, could plausibly fit more than one with no way to tell which, or isn't commercial real-estate litigation at all, return null for category rather than guessing -- a wrong guess here is worse than admitting uncertainty. " +
      "Categories:\n" + categoryListText,
    messages: [{ role: "user", content: combinedSourceText }],
    output_config: {
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: { category: nullableEnum(categoryIds) },
          required: ["category"],
          additionalProperties: false,
        },
      },
    },
  });

  const cost = logUsage("classify", EXTRACTION_MODEL, response.usage);
  const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
  if (!text) return { category: null, cost };
  try {
    const parsed = JSON.parse(text);
    const cat = typeof parsed.category === "string" ? parsed.category : null;
    return { category: cat && CATEGORY_FIELDS[cat] ? cat : null, cost };
  } catch {
    return { category: null, cost };
  }
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
      error: "This feature requires purchasing analysis credits for the Case Value Calculator.",
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
  // `category` is intentionally NOT required anymore -- the frontend's
  // category dropdown is gone; the category is now inferred server-side
  // (see classifyCategory below) from `description` and/or `documentText`.
  // It's still accepted here and, if present and valid, still trusted
  // directly (skipping classification) -- purely so any old cached
  // frontend JS still mid-rollout, which may still send an explicit
  // dropdown-selected `category`, keeps working exactly as before. New
  // requests are expected to omit it entirely.
  let requestBody: { documentText?: string; description?: string; category?: string; userSide?: "sideA" | "sideB" | null; expectToTrial?: boolean; settlementOnTable?: number | null };
  try {
    requestBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }
  const description = (requestBody.description ?? "").slice(0, MAX_DESCRIPTION_CHARS);
  const documentText = (requestBody.documentText ?? "").slice(0, MAX_DOC_CHARS);
  if (!description && !documentText) {
    return jsonResponse({ error: "No case description or document text provided" }, 400);
  }

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

    // ---- New step: classify the litigation category (runs before the ----
    // ---- existing 4a/4b/4c pipeline below, which is otherwise unchanged) -
    // If an old cached frontend still sent an explicit (dropdown-selected)
    // category, trust it directly rather than second-guessing a real user
    // choice with an AI guess. Otherwise -- the expected path going
    // forward -- infer it from the user's description and/or document text.
    const classifyResult = requestBody.category && CATEGORY_FIELDS[requestBody.category]
      ? { category: requestBody.category, cost: 0 }
      : await classifyCategory(description, documentText);
    const category = classifyResult.category;
    if (!category) {
      return jsonResponse({
        error: "unrecognized-category",
        message: "We couldn't confidently tell what kind of commercial real estate dispute this is — try adding a bit more detail, like the type of dispute (e.g. lease, injury on the property, construction defect, foreclosure) and who the parties are.",
      }, 400);
    }
    const catSpec = data.spec.categories[category];
    if (!catSpec) throw new Error("Category not found in case data");

    // A user's own freeform description is now a first-class source of
    // facts (parties, dollar amounts, dates, what happened) -- not just an
    // afterthought to whatever document(s) got uploaded. It may in fact be
    // the ONLY source (upload-only requests still work: description is ""
    // and this reduces to documentText alone; description-only requests
    // also still work: documentText is "" and this reduces to the
    // description alone). Combined once here, with its own clearly labeled
    // section, and reused for both the extraction pass below and the
    // comprehensive analysis pass further down -- so neither one silently
    // ignores half of what the user gave us.
    const combinedCaseText = [
      description ? `=== User's own description of the case ===\n${description}` : "",
      documentText,
    ].filter(Boolean).join("\n\n");

    // ---- 4a. Extraction pass (Haiku 4.5, structured JSON, no thinking) ----
    // combinedCaseText may contain the user's own typed description, and/or
    // more than one filing (e.g. the original petition AND an answer/
    // counterclaim), concatenated client-side with "=== Document N:
    // filename ===" section headers -- read across all of it and synthesize
    // one consistent set of facts, since a fact like "does the tenant
    // dispute the debt" typically only shows up in the answer, not the
    // petition, and a fact like a specific dollar amount may only show up
    // in what the user typed, not in any document at all.
    //
    // Every field is nullable by design (the model should say null for
    // anything not found, never guess) -- but Anthropic caps a single
    // schema at 16 union/nullable-typed properties, and several
    // categories (lease-disputes has 27 fields) exceed that. Split into
    // chunks of <=15 fields (plus filingParty in the first chunk only)
    // and run one extraction call per chunk in parallel, then merge.
    const fieldChunks = chunkFields(CATEGORY_FIELDS[category] || []);
    const baseSystemPrompt =
      `You extract structured facts about a commercial real estate litigation matter for the "${catSpec.label}" category. Your source material may include the user's own typed description of their case, one or more uploaded/pasted document(s) (e.g. a petition, answer, or counterclaim), or both. ` +
      `The user message may contain multiple filings from the same matter, separated by "=== Document N: ... ===" headers, and/or a "=== User's own description of the case ===" section -- read all of it together as one case record and synthesize a single consistent set of facts; a later filing (or the user's own description) can add or update facts an earlier document didn't cover. ` +
      `Only extract facts explicitly stated or very clearly implied in the material provided — output null for anything you can't determine, never guess.`;
    const filingPartyPrompt =
      ` Also determine "filingParty": whether the ORIGINAL/first document (or, if there's no document, the user's own description) represents the "${catSpec.roles.sideA}" side or the "${catSpec.roles.sideB}" side (e.g. captions like "Plaintiff [name], as Landlord, alleges..." indicate sideA here is the ${catSpec.roles.sideA}). If the user has told you separately which side they represent, that takes precedence over your own read of the caption.` +
      (requestBody.userSide ? ` The user has stated they represent the "${requestBody.userSide === "sideA" ? catSpec.roles.sideA : catSpec.roles.sideB}" side — set filingParty to "${requestBody.userSide}" accordingly.` : "");

    const extractionResults = await Promise.all(fieldChunks.map((chunk, i) => {
      const includeFilingParty = i === 0;
      return anthropic!.messages.create({
        model: EXTRACTION_MODEL,
        max_tokens: 2048,
        system: baseSystemPrompt + (includeFilingParty ? filingPartyPrompt : ""),
        messages: [{ role: "user", content: combinedCaseText }],
        output_config: { format: { type: "json_schema", schema: buildExtractionSchema(chunk, includeFilingParty) } },
      });
    }));
    const extractedFacts: Facts = {};
    let extractionInputTokens = 0, extractionOutputTokens = 0;
    for (const extraction of extractionResults) {
      extractionInputTokens += extraction.usage?.input_tokens ?? 0;
      extractionOutputTokens += extraction.usage?.output_tokens ?? 0;
      const extractionText = extraction.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      if (!extractionText) throw new Error("Extraction pass returned no output");
      Object.assign(extractedFacts, JSON.parse(extractionText));
    }
    const extractionCost = logUsage("extraction", EXTRACTION_MODEL, {
      input_tokens: extractionInputTokens,
      output_tokens: extractionOutputTokens,
    });

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

    // Merge the 51-jurisdiction premises-liability state-law table, same as
    // the client's collectFacts() does in js/case-valuation.js.
    if (category === "premises-liability") {
      const stateVal = str(extractedFacts, "state");
      const mods = stateVal ? data.premisesLiabilityStateModifiers?.[stateVal] : undefined;
      if (mods) {
        extractedFacts.premisesFaultRule = mods.faultRule;
        extractedFacts.premisesFaultRuleCitation = mods.faultRuleCitation;
        extractedFacts.premisesPunitiveDamagesStandard = mods.punitiveDamagesStandard;
        extractedFacts.premisesPunitiveDamagesCap = mods.punitiveDamagesCap;
        extractedFacts.premisesOpenAndObviousDoctrine = mods.openAndObviousDoctrine;
        extractedFacts.premisesOpenAndObviousRule = mods.openAndObviousRule;
        extractedFacts.premisesOpenAndObviousCitation = mods.openAndObviousCitation;
        extractedFacts.premisesNegligentSecurityTest = mods.negligentSecurityForeseeabilityTest;
        extractedFacts.premisesNegligentSecurityTestNormalized = mods.negligentSecurityTestNormalized;
        extractedFacts.premisesNegligentSecurityCitation = mods.negligentSecurityCitation;
        extractedFacts.premisesModeOfOperationAdopted = mods.modeOfOperationRuleAdopted;
        extractedFacts.premisesModeOfOperationCitation = mods.modeOfOperationCitation;
        extractedFacts.premisesLiabilityDistinct = mods.premisesLiabilityDistinctFromOrdinaryNegligence;
        extractedFacts.premisesLiabilityDistinctNote = mods.premisesLiabilityDistinctNote;
      }
    }

    // Merge the 51-jurisdiction foreclosure deficiency-judgment state-law
    // table into flattened `foreclosure*` facts, same pattern as the other
    // two categories above -- feeds computeDeficiencyStateAdjustment() in
    // evalLendingForeclosure() instead of that claim ignoring state law.
    if (category === "lending-foreclosure") {
      const stateVal = str(extractedFacts, "state");
      const mods = stateVal ? data.foreclosureStateModifiers?.[stateVal] : undefined;
      if (mods) {
        extractedFacts.foreclosureNonJudicialDominant = mods.nonJudicialDominant;
        extractedFacts.foreclosureDeficiencyBarredIfNonJudicial = mods.deficiencyBarredIfNonJudicial;
        extractedFacts.foreclosureDeficiencyConditionalIfNonJudicial = mods.deficiencyConditionalIfNonJudicial;
        extractedFacts.foreclosureDeficiencyBarredForBorrowerButGuarantorAvailable = mods.deficiencyBarredForBorrowerButGuarantorAvailable;
        extractedFacts.foreclosureFairValueOffsetApplies = mods.fairValueOffsetApplies;
        extractedFacts.foreclosureProcedureTrap = mods.procedureTrap;
        extractedFacts.foreclosureStateCitation = mods.citation;
        extractedFacts.foreclosureStateNote = mods.note;
      }
    }

    // Merge the 51-jurisdiction construction anti-indemnity state-law table
    // into flattened `constructionIndemnity*` facts, same pattern as the
    // other state-law merges above -- feeds
    // computeConstructionIndemnityAdjustment() in evalConstructionDefect()
    // instead of that claim ignoring state law entirely.
    if (category === "construction-defect") {
      const stateVal = str(extractedFacts, "state");
      const mods = stateVal ? data.constructionIndemnityStateModifiers?.[stateVal] : undefined;
      if (mods) {
        extractedFacts.constructionIndemnityForm = mods.indemnityForm;
        extractedFacts.constructionIndemnityCitation = mods.citation;
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
      : "none -- the fixed-formula model found no matching claims from the extracted checkbox-style facts. This can mean either (a) the case materials describe real claims the fixed field set doesn't capture -- analyze the document/description itself for those, not just this baseline -- or (b) the case materials simply don't contain enough economic detail (no rent figure, no stated damages, no dollar amount at all) to compute anything, in which case the correct response is a null damagesRange/bestGuessValue, not an invented number standing in for the baseline's absence.";

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
        narrativeSections: {
          type: "array",
          description: "The comprehensive, detailed reasoned analysis of the actual case materials -- the key facts, every claim/defense/issue you identify (not limited to the baseline model's fixed categories), how the cited precedent applies, evidentiary or procedural weaknesses on either side, and how it all nets out for the filing party -- broken into distinct, clearly-titled sections instead of one undifferentiated block of prose. Write like a sharp litigator's case assessment memo -- direct, specific, thorough. Typically 5-9 sections. Order them the way a memo would actually flow: ground the reader in what you have/don't have first, address the baseline if you're departing from it, then work through liability, the main damages battlegrounds, defenses, and any secondary issues (guaranty/collectibility, deposits, procedural traps) roughly in order of how much they actually matter to the outcome.",
          items: {
            type: "object",
            properties: {
              heading: { type: "string", description: "A short, punchy section title (2-6 words, Title Case, not shouted in all-caps) -- e.g. 'The Real Battleground: Mitigation', 'Core Liability', 'Termination vs. Holdover'. Specific to what's actually in THIS section, never a generic label like 'Analysis' or 'Discussion'." },
              body: { type: "string", description: "The actual analysis for this section -- one or more paragraphs. As detailed and specific as the rest of this tool's writing; splitting into sections is about giving the reader visual structure to navigate, not about writing less." },
            },
            required: ["heading", "body"],
            additionalProperties: false,
          },
        },
        likelyOutcome: { type: "string", description: "A short (2-3 sentence) bottom-line summary of the likely outcome and why." },
        damagesRange: nullableRangeSchema("YOUR OWN independent probability-weighted net exposure/recovery range for the filing party, in dollars (low/high) -- informed by the baseline but not bound by it. Never a single point estimate. MUST be null -- not a placeholder or illustrative range -- if the case materials contain NO actual economic anchor at all (no rent/lease-value figure, no stated damages amount, no dollar figure of any kind tied to the specific dispute)."),
        bestGuessValue: { anyOf: [{ type: "number" }, { type: "null" }], description: "A single best-guess point estimate of net case value in dollars, positioned inside damagesRange above. This is NOT simply the midpoint of the range -- weight it toward whichever end the actual balance of probabilities and damages evidence favors, the same way you'd give a client one number to plan around after already giving them the honest range. Reason from the same per-issue probability x damages assessment you use in `issues` below. MUST be null whenever damagesRange above is null -- there is no such thing as a best guess at a number that doesn't exist yet." },
        whatIsNeededForEstimate: {
          anyOf: [{ type: "string" }, { type: "null" }],
          description: "REQUIRED (non-null) whenever damagesRange/bestGuessValue above are null; MUST be null when they aren't. A short, specific, plain-English list of exactly what facts are missing to compute a real dollar estimate -- e.g. 'the monthly rent amount and how much time remains on the lease' or 'the property's appraised value and the amount of the lender's claimed deficiency.' Name the actual missing inputs for THIS category and these facts, not a generic 'more information needed.' This is shown to the user as a direct, actionable prompt for what to add next -- write it that way, addressed to the user (\"the monthly rent...\" not \"the model requires...\").",
        },
        issues: {
          type: "array",
          description: "Every distinct claim, defense, or issue you identified in the actual document(s) -- may include ones the fixed baseline model doesn't capture at all (e.g. a specific factual dispute, an evidentiary weakness, a procedural defect, a defense actually raised in an answer). Order by significance.",
          items: {
            type: "object",
            properties: {
              label: { type: "string", description: "Short name for this claim/issue." },
              analysis: { type: "string", description: "Your reasoning on this specific issue: the facts supporting it, how cited precedent applies (if any), and its strength." },
              probabilityRangePct: nullableRangeSchema("Low/high percent likelihood this issue is resolved in the filing party's favor, if quantifiable."),
              damagesRange: nullableRangeSchema("Low/high dollar range for this specific issue, if it has an independent dollar value. Null if no actual dollar figure or computable proxy for this specific issue appears anywhere in the case materials -- do not fill in an illustrative or typical-case number."),
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
      required: ["narrativeSections", "likelyOutcome", "damagesRange", "bestGuessValue", "whatIsNeededForEstimate", "issues"],
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
        `Read the case materials provided -- the user's own description of their case and/or uploaded/pasted document(s) -- and do a comprehensive analysis for the "${catSpec.label}" category: identify every claim, defense, and issue actually present in the record -- not just what a fixed checklist would catch. Weigh evidentiary strength, procedural posture, and any defenses or counterclaims raised. If the only material provided is the user's own description with no supporting document, analyze it exactly as rigorously, and say so candidly where the lack of a document leaves a fact unverified. ` +
        "GROUNDING REQUIREMENT: you may cite ONLY cases from the reference list below, copied EXACTLY by name -- never invent, alter, or guess at a case name, citation, or outcome. If no listed case supports a point, make the point without a citation rather than fabricating one. " +
        "A fixed-formula baseline model's mechanical output is provided as ONE reference data point -- it is not the answer key. Use your own judgment from the actual case materials; you may agree with, refine, or depart from the baseline, and should say which and why. Departing from the baseline means correcting its LEGAL classification (which claims actually apply, how they're framed) with your own reading of the record -- it is never license to invent a dollar figure the record doesn't support just because the baseline came back empty. " +
        "NO-INVENTED-NUMBERS REQUIREMENT, as important as the case-name grounding requirement above: a dollar estimate is only as honest as the facts underneath it. If the case materials -- the user's description and/or any document(s) -- contain NO actual economic anchor for the specific dispute (no rent or lease-value figure, no stated damages amount, no dollar figure tied to what actually happened here), you MUST set damagesRange and bestGuessValue to null rather than filling in a plausible-sounding 'typical case' number -- a range like '$15,000-$90,000' for a rent dispute where no rent amount was ever given is fabrication dressed up as analysis, not a real estimate, and directly contradicts this tool's core promise that every number is grounded in the actual facts provided. This applies even when the legal analysis itself is strong and the liability picture is clear -- confidence about who wins does not create a number for how much when none exists. When you do this, you MUST also populate whatIsNeededForEstimate with the SPECIFIC facts that would let you compute a real range (e.g. 'the monthly rent amount and how much time remains on the lease' -- not a vague 'more information needed') -- this is shown to the user as a direct prompt for what to add, so name the actual missing inputs. Still give full legal analysis (claims, defenses, likely outcome, citations) despite the missing number -- a legal assessment without a price tag is far more useful than a price tag invented from nothing. Only assign a real damagesRange/bestGuessValue (and leave whatIsNeededForEstimate null) when at least one concrete dollar figure or a computable proxy for one (e.g. a stated monthly rent AND a stated remaining term, from which a rent stream can actually be computed) appears in the case materials. " +
        "Every dollar range must be a range, never a single number -- EXCEPT bestGuessValue, which (when a real number is warranted at all, per the requirement above) is deliberately the one point estimate in this whole analysis: after laying out the honest range, commit to the single number inside it you'd actually tell the client to plan around, reasoned from the same probability-weighting you used for the range and issues, not just its arithmetic midpoint. Write like a sharp litigator's internal case assessment memo for a client deciding whether to settle or fight -- direct and specific, not hedged into vagueness. " +
        "PROBABILITY CALIBRATION REQUIREMENT: unlike a dollar figure, a probabilityRangePct CAN be legitimately assessed from the claim's legal doctrine and fact pattern alone (e.g. undisputed non-payment under a written commercial lease is a strong claim as a matter of well-settled law, independent of any dollar amount) -- do not null probabilityRangePct just because damagesRange is null. But the range's WIDTH has to honestly reflect how much of that assessment rests on facts that are actually stated versus merely assumed. A two-sentence description that never mentions a lease, a notice history, or a guaranty is not the same evidentiary posture as a reviewed document confirming those things, even where the doctrine cuts the same way -- narrow every probability range as if the unstated facts are confirmed, and you've quietly reintroduced the same fabricated-confidence problem the no-invented-numbers rule above exists to prevent, just moved from the dollar column to the percentage column. Concretely: (1) when an issue's outcome is genuinely a coin flip on ONE binary fact you don't have (e.g. 'is there a personal guaranty' -- collectibility is night-and-day depending on the answer), the range must span close to that full realistic spread, not a narrow band that implies you've already weighed it; a comfortable-looking '40-85%' for a completely unknown fact is barely better than a fake dollar figure. (2) When your reasoning explicitly assumes a fact the user never stated (a clean notice history, no landlord-side maintenance failures, a standard remedies clause), say so in that issue's own analysis text in the same sentence as the number, not just somewhere else in the memo -- the percentage and its load-bearing assumption belong together. (3) Reserve narrow, confident ranges (e.g. 85-95%) for propositions that are strong under the doctrine essentially regardless of unknown facts -- 'a tenant who stops paying with no defense mentioned is in breach' qualifies; 'this specific defense will fail' generally does not, if you don't actually know whether the predicate facts for that defense exist. " +
        "REMINDER ON CITATIONS -- every one of the requirements above is about the analysis TEXT, not the structured citedCaseNames field on each issue, and satisfying them is not a substitute for filling that field in. If you name a case from the reference list in an issue's prose (per the GROUNDING REQUIREMENT), that same case name must also appear in that issue's citedCaseNames array -- do not let a case exist only in the prose. Before finalizing each issue, check it against the reference list a second time and list every supporting case by exact name.",
      messages: [{
        role: "user",
        content:
          `Category: ${catSpec.label}\n` +
          `Filing party's role: ${roleLabel}\n` +
          `Expect trial: ${requestBody.expectToTrial ? "yes" : "no (settlement/motion practice expected)"}\n` +
          (requestBody.settlementOnTable ? `Settlement currently on the table: ${fmtMoney(requestBody.settlementOnTable)}\n` : "") +
          `\nFixed-formula baseline model output (reference only, not authoritative):\n${JSON.stringify(baselineSummary, null, 2)}\n` +
          `\nReal cited precedent you may draw on (cite ONLY from this list, by exact name):\n${citationPoolText}\n` +
          `\n=== The case materials to analyze (the user's own description and/or uploaded document(s)) ===\n${combinedCaseText}`,
      }],
    });
    const analysis = await analysisStream.finalMessage();
    const analysisCost = logUsage("analysis", NARRATIVE_MODEL, analysis.usage);
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

    // The baseline's own netPosition is [0,0] both when it genuinely
    // computed a zero-value case AND when it simply found no matching
    // claims at all (evalResult.claims.length === 0) -- those are very
    // different situations, and treating the second as "$0" would be
    // exactly the kind of invented-number problem the AI is now
    // instructed above to avoid. Only fall back to the baseline's number
    // when the baseline actually computed something from real claims;
    // otherwise there is no number, full stop.
    const baselineHasComputableValue = evalResult.claims.length > 0;
    const aiDamagesRange: [number, number] | null =
      rangeToTuple(analysisParsed.damagesRange) ?? (baselineHasComputableValue ? netPosition : null);

    // Clamp rather than trust blindly -- a structured-output number field
    // has no schema-level way to constrain it to fall inside another
    // field's range, so enforce that here instead of shipping a "best
    // guess" that could land outside the range it's supposed to pin down.
    // No range at all means no best guess either -- there's nothing to
    // clamp into and nothing honest to report.
    const rawBestGuess = typeof analysisParsed.bestGuessValue === "number" ? analysisParsed.bestGuessValue : null;
    const bestGuessValue: number | null = aiDamagesRange === null
      ? null
      : rawBestGuess === null
        ? (aiDamagesRange[0] + aiDamagesRange[1]) / 2
        : Math.min(Math.max(rawBestGuess, aiDamagesRange[0]), aiDamagesRange[1]);

    const totalEstCost = classifyResult.cost + extractionCost + analysisCost;
    console.log(`[cv-cost] TOTAL est_cost=$${totalEstCost.toFixed(4)} category=${category}`);

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
      .insert({ user_id: userId, category, tool: "case-valuation" });
    if (logError) console.error("Failed to log completed analysis (credit not deducted):", logError);

    return jsonResponse({
      extractedFacts,
      analysis: {
        narrativeSections: Array.isArray(analysisParsed.narrativeSections)
          ? analysisParsed.narrativeSections
              .filter((s: unknown): s is { heading: unknown; body: unknown } => !!s && typeof s === "object")
              .map((s: { heading: unknown; body: unknown }) => ({
                heading: typeof s.heading === "string" ? s.heading : "",
                body: typeof s.body === "string" ? s.body : "",
              }))
              .filter((s: { heading: string; body: string }) => s.heading || s.body)
          : [],
        likelyOutcome: analysisParsed.likelyOutcome,
        damagesRange: aiDamagesRange,
        bestGuessValue,
        whatIsNeededForEstimate: aiDamagesRange === null
          ? (typeof analysisParsed.whatIsNeededForEstimate === "string" && analysisParsed.whatIsNeededForEstimate
              ? analysisParsed.whatIsNeededForEstimate
              : "Add specific dollar figures for this dispute -- at minimum, the amounts actually in controversy -- so a damages range can be computed.")
          : null,
        roleLabel,
        category,
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
