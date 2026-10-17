import { alnumKey, type VerifiedFigure } from "./valuation-math.ts";
import { normCdf, type RoleFigure, seedFrom, simpleInterest, simulateOutcomes, v6IssueRange, verifyInterest } from "./valuation-v6.ts";

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
