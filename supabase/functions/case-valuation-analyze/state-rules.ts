// CREdocket Case Value Calculator, version 5: the rules of the case's
// state, from state-rules.json (researched from statute text 2026-09-26,
// citation and URL on every entry). Shown beside the valuation for
// reference; not folded into the value, because court awards are mostly
// reported without interest and fees.
import stateRulesJson from "./state-rules.json" with { type: "json" };

type Entry = Record<string, Record<string, unknown> | unknown>;
const RULES = (stateRulesJson as { rules: Record<string, Entry> }).rules;

const NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const BY_NAME = new Map(Object.entries(NAMES).map(([code, name]) => [name.toLowerCase(), code]));

export function stateCode(state: unknown): string | null {
  if (typeof state !== "string" || !state.trim()) return null;
  const s = state.trim();
  if (s.toUpperCase() in NAMES) return s.toUpperCase();
  const lower = s.toLowerCase().replace(/^state of /, "");
  if (lower === "washington, d.c." || lower === "washington dc" || lower === "d.c.") return "DC";
  return BY_NAME.get(lower) ?? null;
}

const txt = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obj = (v: unknown) => (v && typeof v === "object" ? v as Record<string, unknown> : {});

function interestSummary(p: Record<string, unknown>): string {
  const rate = typeof p.ratePct === "number" ? p.ratePct : null;
  const cap = typeof p.capPct === "number" ? p.capPct : null;
  let s: string;
  if (p.available === "discretionary") {
    s = rate != null ? `Discretionary with the court; ${rate}% when awarded` : cap != null ? `Discretionary with the court, up to ${cap}%` : "Discretionary with the court";
  } else if (p.available === false) {
    s = "Not available by statute on a contract claim";
  } else {
    s = rate != null ? `${rate}%${p.rateType === "formula" ? " for 2026 under the statutory formula" : ""}` : "Set by a statutory formula";
  }
  if (p.contractRateControls === true) s += "; a rate stated in the lease or note controls instead";
  return s;
}

export type JurisdictionRules = {
  code: string; state: string; verifiedAt: string | null;
  prejudgmentInterest: { summary: string; accrual: string | null; citation: string | null; url: string | null };
  postjudgmentInterest: { summary: string | null; citation: string | null; url: string | null };
  attorneysFees: { summary: string; citation: string | null; url: string | null };
  deficiency: { allowed: string | null; valueLimit: string | null; timeLimit: string | null; citation: string | null; url: string | null } | null;
};

export function jurisdictionRules(state: unknown, category: string): JurisdictionRules | null {
  const code = stateCode(state);
  const e = code ? RULES[code] : undefined;
  if (!code || !e) return null;
  const pre = obj(e.prejudgmentInterest), post = obj(e.postjudgmentInterest), fees = obj(e.feeShifting), def = obj(e.deficiency);
  const reciprocal = txt(fees.reciprocalStatute), general = txt(fees.generalContractFeeStatute);
  const feeSummary = reciprocal && general ? `${reciprocal} ${general}`
    : reciprocal ?? general ?? "No statute shifts fees on a commercial contract claim; only a fee clause in the contract can.";
  const postRate = typeof post.rate === "number" ? `${post.rate}%` : null;
  return {
    code, state: NAMES[code], verifiedAt: txt(e.verifiedAt),
    prejudgmentInterest: { summary: interestSummary(pre), accrual: txt(pre.accrualStart), citation: txt(pre.citation), url: txt(pre.url) },
    postjudgmentInterest: { summary: postRate ?? txt(post.formula), citation: txt(post.citation), url: txt(post.url) },
    attorneysFees: { summary: feeSummary, citation: txt(fees.citation), url: txt(fees.url) },
    deficiency: category === "lending-foreclosure"
      ? { allowed: typeof def.allowed === "boolean" ? (def.allowed ? "Allowed" : "Barred") : txt(def.allowed), valueLimit: txt(def.fmvLimit), timeLimit: txt(def.timeLimit), citation: txt(def.citation), url: txt(def.url) }
      : null,
  };
}
