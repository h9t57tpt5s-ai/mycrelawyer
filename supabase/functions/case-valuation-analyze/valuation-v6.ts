// CREdocket Case Value Calculator, version 6 numeric helpers (2026-10-17).
// Pure functions, tested in valuation-v6.test.ts. v4's rules stay in
// valuation-math.ts and still apply; v6 adds, in code rather than prompt:
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

import { alnumKey, issueRange, moneyValues, type VerifiedFigure } from "./valuation-math.ts";

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
  if (!quoteStatesDate(dq, from)) return null;
  return { ratePercent: rate, from };
}

// A date quote states an ISO date when it names the year and the month (as
// a name, an abbreviation or a number).
export function quoteStatesDate(quote: string, iso: string): boolean {
  const [y, m] = iso.split("-").map(Number);
  const dql = quote.toLowerCase();
  const hasYear = dql.includes(String(y));
  const hasMonth = dql.includes(MONTHS[m - 1]) || dql.includes(MONTHS[m - 1].slice(0, 3)) ||
    new RegExp(`(^|\\D)0?${m}[/.-]`).test(dql);
  return hasYear && hasMonth;
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
//   - before_value + after_value: compensation is the loss, before - after,
//     each witness's before value paired with that witness's after value
//     (v6.1: listed order; one shared before or after value pairs with every
//     value on the other side). Pairing the highest before with the lowest
//     after across witnesses produced a $601,000 loss no witness gave
//     (ODOT's Neema taking: the appraisers' own losses were $4,000 and
//     $46,090). Added to any "amount" figures (severance, fixtures), except
//     that when the amounts are competing whole-compensation opinions the
//     losses are more competing opinions, not an add-on (v6.1: adding them
//     counted the owner's $3.3M twice in MHTC's Potted Steer taking);
//   - a before_value with no after_value is NOT compensation and is ignored
//     (a partial taking's whole-parcel value was priced as the award in
//     KKS Properties); with nothing else, the issue has no range;
//   - otherwise the "amount" figures follow v4 (itemized / competing);
//   - interest accrues on that to the valuation date, credits are
//     subtracted, and a cap (a guaranty limit) bounds the result.
// Opposing issues come back negative, as in v4.
export function v6IssueRange(
  figures: RoleFigure[], basis: string, claimant: string, interest: Interest, asOf: string,
): [number, number] | null {
  const of = (role: FigureRole) => figures.filter((f) => (f.role ?? "amount") === role);
  const amounts = of("amount"), credits = of("credit"), caps = of("cap");
  const before = of("before_value").map((f) => f.value), after = of("after_value").map((f) => f.value);
  let lo: number, hi: number;
  const base = amounts.length ? issueRange(amounts, basis, "represented") : null;
  if (before.length && after.length) {
    const losses = pairedLosses(before, after);
    if (basis === "competing" && amounts.length) {
      const vals = [...amounts.map((f) => f.value), ...losses];
      lo = Math.min(...vals);
      hi = Math.max(...vals);
    } else {
      lo = Math.min(...losses);
      hi = Math.max(...losses);
      if (base) { lo += base[0]; hi += base[1]; }
    }
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

// ---- rent formulas (v6.2, 2026-10-20) ---------------------------------------
// Jeff, 2026-10-20: "There has to be a formula." The rent misses in the v6
// backtest were periods, not arithmetic: the model chose how many months to
// charge and ran them past the date the record ends the obligation (Tres
// Botes past the landlord's sale of the premises; 1700 Market past the date
// the landlord retook possession). Here the model only quotes the monthly
// rent and the start and end dates; code verifies each quote and counts
// the months. Future rent is net of the rent from reletting over the same
// months (mitigation). Not discounted to present value.
export const RENT_END_EVENTS = ["possession_retaken", "premises_sold", "relet", "lease_end", "valuation_date"] as const;
export type RentTerms = {
  monthlyRent: number;
  from: string;              // ISO date the unpaid period starts
  to: string;                // ISO date the obligation ends
  endEvent: typeof RENT_END_EVENTS[number];
  relet: { monthlyRent: number; from: string } | null;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Months between two ISO dates, counting partial months by days (30.4375
// days a month).
export function monthsBetween(from: string, to: string): number {
  const days = (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 86400000;
  return Number.isFinite(days) && days > 0 ? days / 30.4375 : 0;
}

// The model's rentTerms count only if the monthly rent's quote is in the
// record and states that figure, and each date's quote is in the record and
// states that date. An end at the valuation date needs no quote.
export function verifyRentTerms(it: Record<string, unknown> | null | undefined, caseTextKey: string, asOf: string): RentTerms | null {
  if (!it || typeof it !== "object") return null;
  const num = (k: string) => typeof it[k] === "number" && Number.isFinite(it[k] as number) && (it[k] as number) > 0 ? it[k] as number : null;
  const str = (k: string) => typeof it[k] === "string" ? it[k] as string : "";
  const inRecord = (q: string) => { const k = alnumKey(q); return k.length >= 8 && caseTextKey.includes(k); };
  const states = (q: string, v: number) => moneyValues(q).some((x) => Math.abs(x - v) <= Math.max(0.5, v * 0.005));
  const rent = num("monthlyRent"), from = str("fromDate");
  const endEvent = RENT_END_EVENTS.find((e) => e === it.endEvent);
  if (rent === null || !ISO.test(from) || !endEvent) return null;
  if (!inRecord(str("rentQuote")) || !states(str("rentQuote"), rent)) return null;
  if (!inRecord(str("fromQuote")) || !quoteStatesDate(str("fromQuote"), from)) return null;
  let to = str("toDate");
  if (endEvent === "valuation_date") to = asOf;
  else if (!ISO.test(to) || !inRecord(str("toQuote")) || !quoteStatesDate(str("toQuote"), to)) return null;
  // Rent already due stops at the valuation date; future rent (to the
  // lease's end) is what an acceleration or damages claim seeks.
  if (endEvent !== "lease_end" && to > asOf) to = asOf;
  let relet: RentTerms["relet"] = null;
  const rr = num("reletMonthlyRent"), rf = str("reletFromDate");
  if (rr !== null && ISO.test(rf) && inRecord(str("reletQuote")) && states(str("reletQuote"), rr) &&
      inRecord(str("reletFromQuote")) && quoteStatesDate(str("reletFromQuote"), rf)) {
    relet = { monthlyRent: rr, from: rf };
  }
  return { monthlyRent: rent, from, to, endEvent, relet };
}

// Rent owed for the period, less rent from reletting over the same months.
export function rentDue(t: RentTerms): { value: number; computed: string } {
  const months = monthsBetween(t.from, t.to);
  let value = t.monthlyRent * months;
  let computed = `${t.monthlyRent} x ${months.toFixed(2)} months (${t.from} to ${t.to}, ${t.endEvent.replace(/_/g, " ")})`;
  if (t.relet && t.relet.from < t.to) {
    const reletMonths = monthsBetween(t.relet.from > t.from ? t.relet.from : t.from, t.to);
    value -= t.relet.monthlyRent * reletMonths;
    computed += ` less reletting ${t.relet.monthlyRent} x ${reletMonths.toFixed(2)} months`;
  }
  return { value: Math.max(0, Math.round(value * 100) / 100), computed };
}

// Each witness's loss: the i-th before value with the i-th after value; a
// lone before (or after) value is shared by every value on the other side.
export function pairedLosses(before: number[], after: number[]): number[] {
  const pairs: [number, number][] = before.length === 1 ? after.map((a) => [before[0], a])
    : after.length === 1 ? before.map((b) => [b, after[0]])
    : before.slice(0, after.length).map((b, i) => [b, after[i]]);
  return pairs.map(([b, a]) => Math.max(0, b - a));
}

// Whether a won issue can land anywhere in its range (competing opinions:
// the factfinder usually lands between the experts) or recovers its full
// figure (one claim, one figure: the strength band already carries the
// chance of losing). v6.1.
export function v6Spread(figures: RoleFigure[], basis: string): boolean {
  const of = (role: FigureRole) => figures.filter((f) => (f.role ?? "amount") === role);
  const amounts = of("amount"), before = of("before_value"), after = of("after_value");
  if (basis === "competing" && amounts.length >= 2) return true;
  if (before.length && after.length) {
    const losses = pairedLosses(before.map((f) => f.value), after.map((f) => f.value));
    if (new Set(losses).size > 1 || (basis === "competing" && amounts.length)) return true;
  }
  return false;
}

// v6.1: a represented 'amount' figure equal to the sum of 4 or 5 others is a
// total of those parts (dedupeRepresentedFigures, shared with the live v4.4
// calculator, catches 2 or 3). Hansens Truck Stop priced a $2.99M demand
// beside its four components.
export function dropLargeTotals<T extends { claimant: string; figures: RoleFigure[] }>(issues: T[]): T[] {
  const key = (v: number) => Math.round(v * 100);
  const vals = [...new Set(issues.filter((i) => i.claimant !== "opposing")
    .flatMap((i) => i.figures.filter((f) => (f.role ?? "amount") === "amount").map((f) => key(f.value))))].sort((a, b) => a - b);
  const totals = new Set<number>();
  for (const v of vals) {
    const parts = vals.filter((x) => x < v);
    if (parts.length < 4 || parts.length > 16) continue;
    const tol = Math.max(100, v * 0.001);
    const search = (start: number, left: number, sum: number): boolean => {
      if (left === 0) return Math.abs(sum - v) <= tol;
      for (let i = start; i <= parts.length - left; i++) if (search(i + 1, left - 1, sum + parts[i])) return true;
      return false;
    };
    if (search(0, 4, 0) || search(0, 5, 0)) totals.add(v);
  }
  if (!totals.size) return issues;
  return issues.map((i) => i.claimant === "opposing" ? i : {
    ...i, figures: i.figures.filter((f) => (f.role ?? "amount") !== "amount" || !totals.has(key(f.value))),
  });
}

// ---- outcome scenarios ----------------------------------------------------
// spread: true = a win lands anywhere in the range; false/absent = a win
// recovers the full figure (the range's far end).
export type ScenarioIssue = { claimant: string; p: [number, number]; range: [number, number]; spread?: boolean };
export type Scenarios = {
  pAhead: number;            // chance the represented side comes out ahead
  settlementValue: number;   // expected value of the outcome
  likely50: [number, number];
  likely80: [number, number];
  ifWin: [number, number] | null;  // 25th-75th percentile of the outcome when the represented side's main claim wins
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
  // v6.1: "if you prevail" is the outcome when the represented side's main
  // claim (its largest) wins. Counting every draw that ends above zero let a
  // conceded $50,000 side item stand for prevailing on a $14.5M severance
  // claim (Piedmont Natural Gas v. Blueroad).
  let main = -1;
  items.forEach((it, idx) => {
    if (it.claimant !== "opposing" && (main < 0 || Math.abs(it.range[1]) > Math.abs(items[main].range[1]))) main = idx;
  });
  const out: number[] = [], won: number[] = [];
  const a = Math.sqrt(rho), b = Math.sqrt(1 - rho);
  for (let k = 0; k < n; k++) {
    const z = gauss(); // + favors the represented side
    let total = 0, mainWon = false;
    items.forEach((it, idx) => {
      const opp = it.claimant === "opposing";
      const pm = (it.p[0] + it.p[1]) / 2;
      const x = a * (opp ? -z : z) + b * gauss();
      if (normCdf(x) < pm) {
        const [lo, hi] = it.range; // opposing ranges are negative
        // v6.1: a won claim with one figure recovers it in full; drawing it
        // from $0 to the figure counted the chance of losing twice (Kotis:
        // a conceded $44.7M claim gave a $22.1M "if you prevail" midpoint
        // against a $42.6M award).
        total += it.spread && lo !== hi ? lo + (hi - lo) * rand() : (opp ? lo : hi);
        if (idx === main) mainWon = true;
      }
    });
    out.push(total);
    if (mainWon) won.push(total);
  }
  out.sort((x, y) => x - y);
  won.sort((x, y) => x - y);
  const q = (f: number, arr = out) => arr[Math.min(arr.length - 1, Math.floor(f * arr.length))];
  const ahead = out.filter((v) => v > 0);
  return {
    pAhead: ahead.length / n,
    settlementValue: out.reduce((s, v) => s + v, 0) / n,
    likely50: [q(0.25), q(0.75)],
    likely80: [q(0.10), q(0.90)],
    ifWin: won.length >= n * 0.02 ? [q(0.25, won), q(0.75, won)] : null,
    median: q(0.5),
    draws: n,
  };
}
