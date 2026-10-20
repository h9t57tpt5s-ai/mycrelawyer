import { alnumKey, type VerifiedFigure } from "./valuation-math.ts";
import { dropLargeTotals, monthsBetween, normCdf, pairedLosses, rentDue, type RoleFigure, seedFrom, simpleInterest, simulateOutcomes, v6IssueRange, v6Spread, verifyInterest, verifyRentTerms } from "./valuation-v6.ts";

function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const fig = (value: number, role: RoleFigure["role"] = "amount", disputed = false): RoleFigure =>
  ({ label: role, value, disputed, quote: "q", computed: null, role } as VerifiedFigure & { role: RoleFigure["role"] });

const TEXT = `The note bears interest at the rate of 9% per annum from March 1, 2022 until paid.
The State's appraiser valued the property before the taking at $1,430,000.`;
const KEY = alnumKey(TEXT);

Deno.test("interest terms count only when both quotes are in the record and state them", () => {
  const ok = verifyInterest({ ratePercent: 9, fromDate: "2022-03-01", rateQuote: "interest at the rate of 9% per annum", dateQuote: "from March 1, 2022 until paid" }, KEY);
  assert(ok && ok.ratePercent === 9 && ok.from === "2022-03-01", "verified");
  assert(verifyInterest({ ratePercent: 12, fromDate: "2022-03-01", rateQuote: "interest at the rate of 9% per annum", dateQuote: "from March 1, 2022 until paid" }, KEY) === null, "wrong rate rejected");
  assert(verifyInterest({ ratePercent: 9, fromDate: "2021-03-01", rateQuote: "interest at the rate of 9% per annum", dateQuote: "from March 1, 2022 until paid" }, KEY) === null, "wrong year rejected");
  assert(verifyInterest({ ratePercent: 9, fromDate: "2022-03-01", rateQuote: "interest at 9% per annum on all sums", dateQuote: "from March 1, 2022 until paid" }, KEY) === null, "quote not in record rejected");
});

Deno.test("simple interest accrues to the valuation date", () => {
  const i = simpleInterest(100000, { ratePercent: 10, from: "2020-01-01" }, "2022-01-01");
  assert(near(i, 20000, 0.002), `two years at 10%: ${i}`);
  assert(simpleInterest(100000, { ratePercent: 10, from: "2023-01-01" }, "2022-01-01") === 0, "no negative accrual");
});

Deno.test("a before-taking value alone is not compensation", () => {
  assert(v6IssueRange([fig(2224065, "before_value")], "competing", "represented", null, "2020-10-29") === null, "ignored");
});

Deno.test("partial taking: compensation is before minus after", () => {
  const r = v6IssueRange([fig(2224065, "before_value"), fig(1430000, "before_value"), fig(700000, "after_value"), fig(900000, "after_value")],
    "competing", "represented", null, "2020-10-29")!;
  assert(r[0] === 1430000 - 900000 && r[1] === 2224065 - 700000, `range ${r}`);
});

Deno.test("credits are subtracted and a cap bounds the claim", () => {
  const r = v6IssueRange([fig(3045000), fig(1310000, "credit")], "itemized", "represented", null, "2024-06-14")!;
  assert(r[0] === 1735000 && r[1] === 1735000, `credit ${r}`);
  const c = v6IssueRange([fig(54000000, "amount", true), fig(14000000, "cap")], "itemized", "represented", null, "2021-01-01")!;
  assert(c[0] === 0 && c[1] === 14000000, `cap ${c}`);
});

Deno.test("interest is added before credits and the result is never negative", () => {
  const r = v6IssueRange([fig(100000), fig(150000, "credit")], "itemized", "represented", { ratePercent: 10, from: "2020-01-01" }, "2021-01-01")!;
  assert(r[0] === 0 && r[1] === 0, `floored ${r}`);
});

Deno.test("opposing issues are negative exposure", () => {
  const r = v6IssueRange([fig(50000), fig(10000, "credit")], "itemized", "opposing", null, "2024-01-01")!;
  assert(r[0] === -40000 && r[1] === -40000, `opposing ${r}`);
});

Deno.test("normal CDF is accurate", () => {
  assert(near(normCdf(0), 0.5, 1e-6) && near(normCdf(1.96), 0.975, 1e-3) && near(normCdf(-1), 0.1587, 1e-3), "cdf");
});

Deno.test("scenarios are deterministic for the same case", () => {
  const issues = [{ claimant: "represented", p: [0.6, 0.75] as [number, number], range: [100000, 200000] as [number, number] }];
  const a = simulateOutcomes(issues, seedFrom("case text"));
  const b = simulateOutcomes(issues, seedFrom("case text"));
  assert(JSON.stringify(a) === JSON.stringify(b), "same seed, same result");
});

Deno.test("scenario chances follow the bands", () => {
  const s = simulateOutcomes([{ claimant: "represented", p: [0.6, 0.75], range: [100000, 100000] }], 1, 0.5, 20000)!;
  assert(Math.abs(s.pAhead - 0.675) < 0.02, `pAhead ${s.pAhead}`);
  assert(Math.abs(s.settlementValue - 67500) < 2000, `EV ${s.settlementValue}`);
  assert(s.likely80[0] === 0 && s.likely80[1] === 100000, "binary outcome spans 0 to the award");
});

Deno.test("an opposing claim pulls the outcome below zero when it wins", () => {
  const s = simulateOutcomes([
    { claimant: "represented", p: [0.45, 0.55], range: [100000, 100000] },
    { claimant: "opposing", p: [0.45, 0.55], range: [-60000, -60000] },
  ], 7, 0.5, 20000)!;
  assert(s.likely80[0] < 0 && s.likely80[1] > 0, `spans both signs ${s.likely80}`);
  assert(s.ifWin && s.ifWin[0] > 0, "ifWin only counts outcomes ahead");
});

// ---- v6.1 (2026-10-19), from the v6 miss analysis -------------------------

Deno.test("v6.1: each appraiser's before value pairs with that appraiser's after value", () => {
  // ODOT's Neema taking: one appraiser $468,000 -> $464,000; the other $1,065,000 -> $1,018,910.
  assert(JSON.stringify(pairedLosses([468000, 1065000], [464000, 1018910])) === JSON.stringify([4000, 46090]), "paired");
  const r = v6IssueRange([fig(468000, "before_value", true), fig(464000, "after_value", true), fig(1065000, "before_value", true), fig(1018910, "after_value", true)],
    "competing", "represented", null, "2024-01-01")!;
  assert(r[0] === 4000 && r[1] === 46090, `not crosswise (would be 601,000): ${r}`);
  // A shared before value pairs with every after value.
  assert(JSON.stringify(pairedLosses([25500000], [11500000, 11603200])) === JSON.stringify([14000000, 13896800]), "shared");
});

Deno.test("v6.1: a before/after loss beside competing totals is another opinion, not an add-on", () => {
  // MHTC (Potted Steer): competing totals $1.2M and $3.3M; the owner's $3.5M before / $200K after.
  const r = v6IssueRange([fig(1200000, "amount", true), fig(3300000, "amount", true), fig(3500000, "before_value", true), fig(200000, "after_value", true)],
    "competing", "represented", null, "2016-01-01")!;
  assert(r[0] === 1200000 && r[1] === 3300000, `range ${r} (was 4.5M-6.6M)`);
  // Itemized severance is still added to the loss.
  const s = v6IssueRange([fig(1000000, "before_value"), fig(600000, "after_value"), fig(50000)], "itemized", "represented", null, "2016-01-01")!;
  assert(s[0] === 450000 && s[1] === 450000, `severance added ${s}`);
});

Deno.test("v6.1: only competing opinions spread a win across the range", () => {
  assert(v6Spread([fig(1, "amount", true), fig(2, "amount", true)], "competing"), "competing spreads");
  assert(!v6Spread([fig(44744774, "amount", true)], "itemized"), "one figure does not");
  assert(!v6Spread([fig(44744774, "amount", true)], "competing"), "a lone 'competing' figure does not");
  assert(v6Spread([fig(468000, "before_value"), fig(464000, "after_value"), fig(1065000, "before_value"), fig(1018910, "after_value")], "itemized"), "two appraisers spread");
});

Deno.test("v6.1: a demand equal to four of its components is dropped as a total", () => {
  // Hansens Truck Stop: $2.99M demand = $570K + $200K + $340K + $1.88M.
  const out = dropLargeTotals([
    { claimant: "represented", figures: [fig(2990000, "amount", true)] },
    { claimant: "represented", figures: [fig(570000), fig(200000), fig(340000), fig(1880000)] },
    { claimant: "opposing", figures: [fig(2990000)] },
  ]);
  assert(out[0].figures.length === 0, "total dropped");
  assert(out[1].figures.length === 4 && out[2].figures.length === 1, "parts and opposing kept");
});

Deno.test("v6.1: a won single-figure claim recovers its full figure", () => {
  // Kotis: a conceded $44,744,774 claim; the if-you-prevail range was $0-$44.7M (midpoint $22.1M).
  const s = simulateOutcomes([{ claimant: "represented", p: [0.95, 0.99], range: [0, 44744774] }], 3, 0.5, 4000)!;
  assert(s.ifWin && s.ifWin[0] === 44744774 && s.ifWin[1] === 44744774, `ifWin ${s.ifWin}`);
  const c = simulateOutcomes([{ claimant: "represented", p: [0.6, 0.75], range: [122953, 1262947], spread: true }], 3, 0.5, 4000)!;
  assert(c.ifWin && c.ifWin[0] > 122953 && c.ifWin[1] < 1262947, `competing still spreads ${c.ifWin}`);
});

Deno.test("v6.1: 'if you prevail' means the main claim wins, not any draw above zero", () => {
  // Piedmont v. Blueroad: a favorable $14.5M severance claim and a conceded $50,000 strip.
  const s = simulateOutcomes([
    { claimant: "represented", p: [0.6, 0.75], range: [14500000, 14500000] },
    { claimant: "represented", p: [0.95, 0.99], range: [50000, 50000] },
  ], 5, 0.5, 4000)!;
  assert(s.ifWin && s.ifWin[0] >= 14500000, `ifWin ${s.ifWin} (was $50,000 at the 25th percentile)`);
});

// ---- v6.2 rent formulas (2026-10-20) --------------------------------------

const LEASE = `The lease required monthly rent of $4,300. The tenant abandoned the premises and stopped paying rent on May 1, 2023.
The landlord conveyed the property by deed dated December 12, 2024. The space was relet at $3,000 per month beginning March 1, 2024.`;
const LKEY = alnumKey(LEASE);
const terms = (o: Record<string, unknown>) => ({
  monthlyRent: 4300, rentQuote: "The lease required monthly rent of $4,300", fromDate: "2023-05-01",
  fromQuote: "stopped paying rent on May 1, 2023", endEvent: "premises_sold", toDate: "2024-12-12",
  toQuote: "conveyed the property by deed dated December 12, 2024", reletMonthlyRent: null, reletQuote: null,
  reletFromDate: null, reletFromQuote: null, ...o,
});

Deno.test("v6.2: rent runs only until the record ends the obligation (the landlord's sale)", () => {
  // Tres Botes: $4,300 a month from abandonment to the sale, not the remaining-term demand.
  const t = verifyRentTerms(terms({}), LKEY, "2026-01-01")!;
  assert(t && t.endEvent === "premises_sold" && t.to === "2024-12-12", `terms ${JSON.stringify(t)}`);
  const r = rentDue(t);
  assert(near(r.value, 4300 * monthsBetween("2023-05-01", "2024-12-12")), `rent ${r.value}`);
  assert(r.value > 79000 && r.value < 85000, `about 19.4 months of rent, got ${r.value}`);
});

Deno.test("v6.2: reletting rent over the same months is subtracted", () => {
  const t = verifyRentTerms(terms({ reletMonthlyRent: 3000, reletQuote: "relet at $3,000 per month", reletFromDate: "2024-03-01", reletFromQuote: "beginning March 1, 2024" }), LKEY, "2026-01-01")!;
  const r = rentDue(t);
  const expected = 4300 * monthsBetween("2023-05-01", "2024-12-12") - 3000 * monthsBetween("2024-03-01", "2024-12-12");
  assert(t.relet && near(r.value, expected), `rent ${r.value} vs ${expected}`);
});

Deno.test("v6.2: rent terms count only when every quote is in the record and states its value", () => {
  assert(verifyRentTerms(terms({ monthlyRent: 5300 }), LKEY, "2026-01-01") === null, "wrong rent figure");
  assert(verifyRentTerms(terms({ toDate: "2025-12-12" }), LKEY, "2026-01-01") === null, "wrong end date");
  assert(verifyRentTerms(terms({ rentQuote: "rent of $4,300 was due under the renewal" }), LKEY, "2026-01-01") === null, "quote not in record");
  assert(verifyRentTerms(terms({ endEvent: "whenever" }), LKEY, "2026-01-01") === null, "unknown end event");
  // Bad reletting quotes drop only the reletting credit, not the claim.
  const t = verifyRentTerms(terms({ reletMonthlyRent: 3500, reletQuote: "relet at $3,000 per month", reletFromDate: "2024-03-01", reletFromQuote: "beginning March 1, 2024" }), LKEY, "2026-01-01");
  assert(t && t.relet === null, "unverified reletting ignored");
});

Deno.test("v6.2: rent still accruing stops at the valuation date; future rent may run to the lease's end", () => {
  const acc = verifyRentTerms(terms({ endEvent: "valuation_date", toDate: null, toQuote: null }), LKEY, "2024-05-01")!;
  assert(acc.to === "2024-05-01" && near(rentDue(acc).value, 4300 * monthsBetween("2023-05-01", "2024-05-01")), "to valuation date");
  const capped = verifyRentTerms(terms({}), LKEY, "2024-06-01")!;
  assert(capped.to === "2024-06-01", `rent due stops at the valuation date: ${capped.to}`);
});
