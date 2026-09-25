// CREdocket Case Value Calculator, version 4 numeric helpers.
// Pure functions, tested in valuation-math.test.ts.

// Fixed probability bands. The model picks a band; it never writes a
// percentage, so two runs that agree on the band agree on the number.
export const STRENGTH_BANDS = {
  conceded: [0.95, 0.99],
  strong: [0.80, 0.90],
  favorable: [0.60, 0.75],
  even: [0.45, 0.55],
  unfavorable: [0.25, 0.40],
  weak: [0.05, 0.20],
} as const satisfies Record<string, readonly [number, number]>;

export type VerifiedFigure = { label: string; value: number; disputed: boolean; quote: string; computed: string | null };

// Letters and digits only, lowercased: quotes are matched on this so line
// breaks, curly quotes and PDF spacing cannot cause a false miss.
export function alnumKey(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// Every dollar-like number in a passage: "$1,234.56", "4,500,000",
// "$19.3 million", "2.1M", "250 thousand".
export function moneyValues(text: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(million|billion|thousand|mm|m|bn|k)?\b/gi;
  for (const m of text.matchAll(re)) {
    let v = parseFloat(m[1].replace(/,/g, "") + (m[2] ?? ""));
    const unit = (m[3] ?? "").toLowerCase();
    if (unit === "million" || unit === "mm" || unit === "m") v *= 1e6;
    else if (unit === "billion" || unit === "bn") v *= 1e9;
    else if (unit === "thousand" || unit === "k") v *= 1e3;
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.5, Math.abs(b) * 0.005);

// A figure counts only if its quote appears in the case materials and
// the quote states the number (the amount, or the rate for rate x periods).
export function verifyFigure(it: Record<string, unknown>, caseTextKey: string): VerifiedFigure | null {
  const quote = typeof it.quote === "string" ? it.quote : "";
  const qKey = alnumKey(quote);
  if (qKey.length < 12 || !caseTextKey.includes(qKey)) return null;
  const inQuote = moneyValues(quote);
  const amount = typeof it.amount === "number" && Number.isFinite(it.amount) ? Math.abs(it.amount) : null;
  const rate = typeof it.rate === "number" && Number.isFinite(it.rate) ? Math.abs(it.rate) : null;
  const periods = typeof it.periods === "number" && Number.isFinite(it.periods) ? Math.abs(it.periods) : null;
  const label = typeof it.label === "string" ? it.label : "Figure";
  const disputed = it.disputed === true;
  if (amount !== null && amount > 0 && inQuote.some((v) => near(v, amount))) {
    return { label, value: amount, disputed, quote, computed: null };
  }
  if (rate !== null && rate > 0 && periods !== null && periods > 0 && periods <= 600 && inQuote.some((v) => near(v, rate))) {
    return { label, value: rate * periods, disputed, quote, computed: `${rate} x ${periods}` };
  }
  return null;
}

