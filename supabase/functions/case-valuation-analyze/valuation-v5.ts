// CREdocket Case Value Calculator, version 5 numeric helpers (2026-10-17).
// Pure functions, tested in valuation-v5.test.ts. v4's rules stay in
// valuation-math.ts and still apply; v5 adds, in code rather than prompt:
//
//   1. a damages engine: each figure has a role ("amount", "credit", "cap",
//      "before_value", "after_value") and an issue may carry interest, so
//      credits, guaranty caps, the partial-taking measure and interest to
//      the valuation date are computed, not left to the model;
//   2. outcome scenarios: issues win or lose by their strength band, with a
//      shared "who wins the case" factor, giving the chance the represented
//      side comes out ahead, the settlement value (the expected value) and
//      50% / 80% likely-outcome ranges. Seeded from the case, so the same
//      record always gives the same numbers.
//
// Backtest evidence for each choice is in ops/calculator-proposals.md.

import { alnumKey, issueRange, type VerifiedFigure } from "./valuation-math.ts";

export type FigureRole = "amount" | "credit" | "cap" | "before_value" | "after_value";
export type RoleFigure = VerifiedFigure & { role: FigureRole };
export type Interest = { ratePercent: number; from: string } | null;

export const FIGURE_ROLES: FigureRole[] = ["amount", "credit", "cap", "before_value", "after_value"];

// ---- verification of interest terms --------------------------------------
// The rate and the start date each need a verbatim quote that appears in the
// case materials and states them (the rate's digits; the date's year and its
// month as a name or number). Anything else is dropped, as with figures.
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

export function verifyInterest(it: Record<string, unknown> | null | undefined, caseTextKey: string): Interest {
  if (!it || typeof it !== "object") return null;
  const rate = typeof it.ratePercent === "number" && Number.isFinite(it.ratePercent) ? it.ratePercent : null;
  const from = typeof it.fromDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(it.fromDate) ? it.fromDate : null;
  const rq = typeof it.rateQuote === "string" ? it.rateQuote : "";
  const dq = typeof it.dateQuote === "string" ? it.dateQuote : "";
  if (rate === null || from === null || rate <= 0 || rate > 30) return null;
  for (const q of [rq, dq]) {
    const k = alnumKey(q);
    if (k.length < 8 || !caseTextKey.includes(k)) return null;
  }
  const rateNums = [...rq.matchAll(/(\d+(?:\.\d+)?)\s*(?:%|percent|per cent)/gi)].map((m) => parseFloat(m[1]));
  if (!rateNums.some((v) => Math.abs(v - rate) < 1e-9)) return null;
  const [y, m] = from.split("-").map(Number);
  const dql = dq.toLowerCase();
  const hasYear = dql.includes(String(y));
  const hasMonth = dql.includes(MONTHS[m - 1]) || dql.includes(MONTHS[m - 1].slice(0, 3)) ||
    new RegExp(`(^|\\D)0?${m}[/.-]`).test(dql);
  if (!hasYear || !hasMonth) return null;
  return { ratePercent: rate, from };
}

// Simple interest from `from` to `asOf` (ISO dates), capped at 30 years.
export function simpleInterest(principal: number, interest: Interest, asOf: string): number {
  if (!interest || principal <= 0) return 0;
  const days = (Date.parse(asOf + "T00:00:00Z") - Date.parse(interest.from + "T00:00:00Z")) / 86400000;
  if (!Number.isFinite(days) || days <= 0) return 0;
  return principal * (interest.ratePercent / 100) * Math.min(days / 365.25, 30);
}

// ---- the damages engine ----------------------------------------------------
// An issue's [low, high] from its role-tagged figures:
//   - before_value + after_value: compensation is the loss, before - after
//     (low = lowest before - highest after, high = highest before - lowest
//     after, never below 0), plus any "amount" figures (severance, fixtures);
//   - a before_value with no after_value is NOT compensation and is ignored
//     (a partial taking's whole-parcel value was priced as the award in
//     KKS Properties); with nothing else, the issue has no range;
//   - otherwise the "amount" figures follow v4 (itemized / competing);
//   - interest accrues on that to the valuation date, credits are
//     subtracted, and a cap (a guaranty limit) bounds the result.
// Opposing issues come back negative, as in v4.
export function v5IssueRange(
  figures: RoleFigure[], basis: string, claimant: string, interest: Interest, asOf: string,
): [number, number] | null {
  const of = (role: FigureRole) => figures.filter((f) => (f.role ?? "amount") === role);
  const amounts = of("amount"), credits = of("credit"), caps = of("cap");
  const before = of("before_value").map((f) => f.value), after = of("after_value").map((f) => f.value);
  let lo: number, hi: number;
  const base = amounts.length ? issueRange(amounts, basis, "represented") : null;
  if (before.length && after.length) {
    lo = Math.max(0, Math.min(...before) - Math.max(...after));
    hi = Math.max(0, Math.max(...before) - Math.min(...after));
    if (base) { lo += base[0]; hi += base[1]; }
  } else if (base) {
    [lo, hi] = base;
  } else {
    return null;
  }
  lo += simpleInterest(lo, interest, asOf);
  hi += simpleInterest(hi, interest, asOf);
  const credit = credits.reduce((a, f) => a + f.value, 0);
  lo = Math.max(0, lo - credit);
  hi = Math.max(0, hi - credit);
  if (caps.length) {
    const cap = Math.min(...caps.map((f) => f.value));
    lo = Math.min(lo, cap);
    hi = Math.min(hi, cap);
  }
  if (lo > hi) [lo, hi] = [hi, lo];
  return claimant === "opposing" ? [-hi, -lo] : [lo, hi];
}

// ---- outcome scenarios ----------------------------------------------------
export type ScenarioIssue = { claimant: string; p: [number, number]; range: [number, number] };
export type Scenarios = {
  pAhead: number;            // chance the represented side comes out ahead
  settlementValue: number;   // expected value of the outcome
  likely50: [number, number];
  likely80: [number, number];
  ifWin: [number, number] | null;  // 25th-75th percentile of the outcome when the represented side is ahead
  median: number;
  draws: number;
};

// mulberry32: small, fast, deterministic.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Standard normal CDF (Abramowitz-Stegun 7.1.26 via erf).
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t *
    Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

// rho = how strongly issues move together (0 = independent). The backtest
// replays showed little difference between 0 and 0.8; 0.5 is used.
export function simulateOutcomes(issues: ScenarioIssue[], seed: number, rho = 0.5, n = 4000): Scenarios | null {
  const items = issues.filter((i) => i.range && i.p);
  if (!items.length) return null;
  const rand = rng(seed);
  const gauss = () => {
    const u = Math.max(rand(), 1e-12), v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const out: number[] = [];
  const a = Math.sqrt(rho), b = Math.sqrt(1 - rho);
  for (let k = 0; k < n; k++) {
    const z = gauss(); // + favors the represented side
    let total = 0;
    for (const it of items) {
      const opp = it.claimant === "opposing";
      const pm = (it.p[0] + it.p[1]) / 2;
      const x = a * (opp ? -z : z) + b * gauss();
      if (normCdf(x) < pm) {
        const [lo, hi] = it.range; // opposing ranges are negative
        total += lo === hi ? lo : lo + (hi - lo) * rand();
      }
    }
    out.push(total);
  }
  out.sort((x, y) => x - y);
  const q = (f: number, arr = out) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
  const ahead = out.filter((v) => v > 0);
  return {
    pAhead: ahead.length / n,
    settlementValue: out.reduce((s, v) => s + v, 0) / n,
    likely50: [q(0.25), q(0.75)],
    likely80: [q(0.10), q(0.90)],
    ifWin: ahead.length >= n * 0.02 ? [q(0.25, ahead), q(0.75, ahead)] : null,
    median: q(0.5),
    draws: n,
  };
}
