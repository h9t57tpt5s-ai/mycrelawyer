import { alnumKey, moneyValues, STRENGTH_BANDS, verifyFigure } from "./valuation-math.ts";

function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

const TEXT = `Tenant failed to pay Base Rent of $9,000.00 per month beginning
August 1, 2023. As of December 31, 2024, the unpaid balance is $170,484.37.
The Borrower executed a promissory note in the original principal amount of
$19.3 million. Petitioner's appraiser valued the parcel at 2,400,000 dollars.`;
const KEY = alnumKey(TEXT);

Deno.test("money values parse commas, decimals and units", () => {
  const v = moneyValues("owed $170,484.37 on a $19.3 million note and 250 thousand in fees");
  assert(v.includes(170484.37), "decimal with commas");
  assert(v.some((x) => Math.abs(x - 19.3e6) < 1), "million");
  assert(v.includes(250000), "thousand");
});

Deno.test("a quoted amount that appears in the record counts", () => {
  const f = verifyFigure({ label: "rent", amount: 170484.37, rate: null, periods: null, quote: "the unpaid balance is $170,484.37", disputed: false }, KEY);
  assert(f && f.value === 170484.37, "verified");
});

Deno.test("line breaks and spacing in the record do not cause a miss", () => {
  const f = verifyFigure({ label: "note", amount: 19300000, rate: null, periods: null, quote: "promissory note in the original principal amount of $19.3 million", disputed: true }, KEY);
  assert(f && f.value === 19300000 && f.disputed, "verified across a line break");
});

Deno.test("a quote not in the record is dropped", () => {
  const f = verifyFigure({ label: "x", amount: 500000, rate: null, periods: null, quote: "damages of at least $500,000 are claimed", disputed: false }, KEY);
  assert(f === null, "fabricated quote rejected");
});

Deno.test("a real quote with a number it does not state is dropped", () => {
  const f = verifyFigure({ label: "x", amount: 180000, rate: null, periods: null, quote: "the unpaid balance is $170,484.37", disputed: false }, KEY);
  assert(f === null, "mismatched amount rejected");
});

Deno.test("rate times periods is computed in code", () => {
  const f = verifyFigure({ label: "future rent", amount: null, rate: 9000, periods: 14, quote: "Base Rent of $9,000.00 per month", disputed: true }, KEY);
  assert(f && f.value === 126000 && f.computed === "9000 x 14", "rate x periods");
});

Deno.test("a too-short quote is not accepted", () => {
  assert(verifyFigure({ label: "x", amount: 9000, rate: null, periods: null, quote: "$9,000", disputed: false }, KEY) === null, "short quote rejected");
});

Deno.test("bands are fixed and ordered", () => {
  const order = ["weak", "unfavorable", "even", "favorable", "strong", "conceded"] as const;
  for (let i = 1; i < order.length; i++) assert(STRENGTH_BANDS[order[i]][0] > STRENGTH_BANDS[order[i - 1]][0], `${order[i]} above ${order[i - 1]}`);
});

Deno.test("tiny numbers are not dollar figures", () => {
  const key = alnumKey("pursuant to Section 1 of the Lease, Tenant shall pay rent");
  assert(verifyFigure({ label: "x", amount: 1, rate: null, periods: null, quote: "pursuant to Section 1 of the Lease", disputed: false }, key) === null, "section number rejected");
});

import { dedupeRepresentedFigures, issueRange } from "./valuation-math.ts";
const fig = (value: number, disputed = false) => ({ label: "f", value, disputed, quote: "q", computed: null });

Deno.test("a total demand listed beside its parts is dropped (Lagoon)", () => {
  const out = dedupeRepresentedFigures([
    { claimant: "represented", strength: "strong", figures: [fig(364212)] },
    { claimant: "represented", strength: "favorable", figures: [fig(1444258)] },
    { claimant: "represented", strength: "favorable", figures: [fig(1808470)] },
  ]);
  assert(out[0].figures.length === 1 && out[1].figures.length === 1 && out[2].figures.length === 0, "total dropped");
});

Deno.test("one figure under several theories counts once, on the strongest (Four Elyria)", () => {
  const out = dedupeRepresentedFigures([
    { claimant: "represented", strength: "even", figures: [fig(500000)] },
    { claimant: "represented", strength: "favorable", figures: [fig(500000)] },
    { claimant: "represented", strength: "even", figures: [fig(500000)] },
  ]);
  assert(out.map((i) => i.figures.length).join() === "0,1,0", "kept once on the favorable claim");
});

Deno.test("the other side's figures are left alone", () => {
  const out = dedupeRepresentedFigures([
    { claimant: "represented", strength: "strong", figures: [fig(100000)] },
    { claimant: "opposing", strength: "even", figures: [fig(100000)] },
  ]);
  assert(out[0].figures.length === 1 && out[1].figures.length === 1, "opposing untouched");
});

Deno.test("issue ranges follow the v4 rules", () => {
  const a = issueRange([fig(1000), fig(500, true)], "itemized", "represented");
  assert(a && a[0] === 1000 && a[1] === 1500, "itemized");
  const b = issueRange([fig(2000), fig(3000)], "competing", "opposing");
  assert(b && b[0] === -3000 && b[1] === -2000, "competing opposing");
  assert(issueRange([], "itemized", "represented") === null, "no figures");
});
