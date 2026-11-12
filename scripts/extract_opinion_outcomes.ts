// Read court opinions and record each commercial real estate case's outcome:
// what each side claimed, what the trial court awarded, what the appeal did.
//
// Input: candidates from scripts/mine_opinions.py (JSON lines, optionally
// gzipped, one opinion per line with "id" and "text"). Output: one JSON
// line per opinion in case_valuation_project/data/research/opinions/
// (gitignored; this outcome database is proprietary).
//
// The model never decides a number on its own. Every dollar figure must
// come with a verbatim quote; a figure is kept only if the quote is found
// in the opinion and states that number (alnumKey/moneyValues, the same
// check the calculator uses). Unverified figures are nulled and listed.
//
//   deno run -A scripts/extract_opinion_outcomes.ts sync    IN OUT [--model M] [--limit N]
//   deno run -A scripts/extract_opinion_outcomes.ts submit  IN STATE [--model M] [--limit N] [--skip OUT]
//   deno run -A scripts/extract_opinion_outcomes.ts collect STATE IN OUT
//
// "submit" uses the Message Batches API (half price, results within 24h).
// Needs ANTHROPIC_API_KEY and ANTHROPIC_WORKSPACE_ID (Jeff's, in ~/.zshrc). Every call costs money:
// the cost of each opinion is recorded in its output line.
import Anthropic from "npm:@anthropic-ai/sdk@0.120";
import { TextLineStream } from "jsr:@std/streams@1.0.9/text-line-stream";
import { alnumKey, moneyValues } from "../supabase/functions/case-valuation-analyze/valuation-math.ts";

const CATEGORIES = ["lease-disputes", "lending-foreclosure", "reit-securities", "construction-defect", "environmental",
  "eminent-domain", "zoning-land-use", "premises-liability", "other"];
const PROPERTY_TYPES = ["Office", "Multifamily", "Retail", "Industrial", "Hospitality", "Mixed-Use", "Land/Development",
  "Medical Office", "Data Center", "Life Sciences", "Senior Living", "Self-Storage", "Unknown"];
const num = { type: ["number", "null"] };
const str = { type: "string" };

const CLAIM = {
  type: "object",
  additionalProperties: false,
  required: ["claimant_role", "claim", "amount_claimed", "amount_claimed_quote", "trial_result", "amount_awarded",
    "amount_awarded_quote", "appeal_result", "final_amount", "final_amount_quote", "final_amount_basis"],
  properties: {
    claimant_role: str,
    claim: str,
    amount_claimed: num,
    amount_claimed_quote: str,
    trial_result: { type: "string", enum: ["won", "partly-won", "lost", "not-decided"] },
    amount_awarded: num,
    amount_awarded_quote: str,
    appeal_result: { type: "string", enum: ["affirmed", "reversed", "modified", "vacated-remanded", "not-appealed", "not-addressed"] },
    final_amount: num,
    final_amount_quote: str,
    final_amount_basis: { type: "string", enum: ["stated-in-opinion", "equals-award-affirmed", "zero-after-reversal", "unknown"] },
  },
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_commercial_real_estate", "scope_note", "residential_or_consumer", "debt_collection", "category",
    "property_type", "state", "court_level", "decision_year", "trial_proceeding", "parties", "claims",
    "attorney_fees_awarded", "attorney_fees_quote", "competing_values", "outcome_summary", "usable_for_calibration"],
  properties: {
    is_commercial_real_estate: { type: "boolean" },
    scope_note: str,
    residential_or_consumer: { type: "boolean" },
    debt_collection: { type: "boolean" },
    category: { type: "string", enum: CATEGORIES },
    property_type: { type: "string", enum: PROPERTY_TYPES },
    state: str,
    court_level: { type: "string", enum: ["trial", "intermediate-appellate", "supreme", "federal-district", "federal-appeals", "bankruptcy", "other"] },
    decision_year: { type: ["integer", "null"] },
    trial_proceeding: { type: "string", enum: ["jury-trial", "bench-trial", "summary-judgment", "default-judgment", "dismissal", "arbitration", "administrative", "other", "unknown"] },
    parties: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["role", "business_name"], properties: { role: str, business_name: str } },
    },
    claims: { type: "array", items: CLAIM },
    attorney_fees_awarded: num,
    attorney_fees_quote: str,
    competing_values: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["offered_by", "value", "quote"], properties: { offered_by: str, value: { type: "number" }, quote: str } },
    },
    outcome_summary: str,
    usable_for_calibration: { type: "boolean" },
  },
};

const SYSTEM = `You read one court opinion and record the outcome of the dispute for a commercial real estate case database.

Scope. is_commercial_real_estate is true only if the dispute is about commercial real estate on its face: a commercial lease, a loan secured by commercial property (including multifamily owned by a business), construction of a commercial building, condemnation of property, zoning or land use of a development, environmental liability tied to real property, a REIT or real estate fund, or injury on commercial premises (a store, office, hotel, apartment complex common area). It is false for houses, condominium units owned by individuals, residential tenancies, consumer loans, home foreclosures, family property, insurance coverage fights, and business disputes that only mention a building. residential_or_consumer is true when the property or a party is a home, a residential tenant, a homeowner or a consumer. debt_collection is true for suits to collect consumer or ordinary business debts.

state: the two-letter postal code of the state where the property is (TX, NY), or "" if the opinion does not say. decision_year: the year this opinion was decided, if stated.

Claims. List each claim for money that the opinion describes (rent, damages, deficiency, just compensation, lien amount, construction damages, personal injury damages, return of a deposit). For each:
- claimant_role: a role word such as Landlord, Tenant, Guarantor, Lender, Borrower, Property Owner, Condemnor, Owner, Contractor, Subcontractor, Injured Party, Developer, Municipality.
- amount_claimed: the amount that side asked for, if the opinion states one.
- trial_result and amount_awarded: what the trial court, jury or arbitrator decided.
- appeal_result: what this opinion did to that award. Use not-appealed if the opinion is the trial court's own decision.
- final_amount: the amount that stands after this opinion. Use final_amount_basis "equals-award-affirmed" when the award was affirmed as is, "zero-after-reversal" when it was reversed with nothing awarded, "stated-in-opinion" when the opinion states a new amount, and "unknown" (with final_amount null) when the case was remanded or the amount cannot be told.

Quotes. Every dollar figure must have a quote copied word for word from the opinion, long enough to be unique (at least eight words), that contains that number exactly as the opinion writes it. If you cannot quote it, use null and an empty quote. Never compute, round or infer a figure. Never use a settlement offer, a demand letter or a bond amount as an amount claimed or awarded.

Competing values: for condemnation and valuation disputes, each appraiser's or party's stated value, with its quote.

Names. Never write an individual person's name anywhere in your answer. parties lists business names only (companies, partnerships, trusts, governments); describe individuals by role words in every other field, for example "the guarantor" or "the injured shopper".

usable_for_calibration is true when the case is commercial real estate, at least one claim has a verified-quotable amount awarded or a clear zero outcome, and the opinion describes the facts well enough that a reader could have estimated the value before trial. outcome_summary: two sentences, business names and role words only.`;

type Rec = { id: string; cluster_id?: string; text: string; [k: string]: unknown };
type Price = { inp: number; out: number };
const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { inp: 4, out: 20 },
  "claude-sonnet-5-5": { inp: 2, out: 10 },
  "claude-haiku-5-5": { inp: 0.10, out: 0.50 },
};

function cost(model: string, usage: { input_tokens: number; output_tokens: number }, batch: boolean): number {
  const p = PRICES[model] ?? { inp: 4, out: 20 };
  let { inp, out } = p;
  if (model === "claude-haiku-5-5" && usage.input_tokens > 100_000) [inp, out] = [0.50, 2.50];
  const c = (usage.input_tokens * inp + usage.output_tokens * out) / 1e6;
  return batch ? c / 2 : c;
}

// Streams JSON lines (optionally gzipped): the prepared file is 1.5 GB of
// text, too big for one string.
async function* streamLines(path: string): AsyncGenerator<string> {
  const file = await Deno.open(path);
  let stream: ReadableStream<Uint8Array> = file.readable;
  if (path.endsWith(".gz")) stream = stream.pipeThrough(new DecompressionStream("gzip") as unknown as TransformStream<Uint8Array, Uint8Array>);
  for await (const line of stream.pipeThrough(new TextDecoderStream()).pipeThrough(new TextLineStream())) {
    if (line.trim()) yield line;
  }
}

async function readLines(path: string): Promise<string[]> {
  const out: string[] = [];
  for await (const l of streamLines(path)) out.push(l);
  return out;
}

async function* streamRecords(path: string): AsyncGenerator<Rec> {
  for await (const l of streamLines(path)) yield JSON.parse(l);
}

// A figure stands only if its quote is in the opinion and states the number.
function verified(value: unknown, quote: unknown, textKey: string): boolean {
  if (typeof value !== "number" || !Number.isFinite(value) || typeof quote !== "string") return false;
  const q = alnumKey(quote);
  if (q.length < 20 || !textKey.includes(q)) return false;
  return moneyValues(quote).some((v) => Math.abs(v - value) <= Math.max(0.5, Math.abs(value) * 0.005));
}

// deno-lint-ignore no-explicit-any
function verify(out: any, text: string): { out: unknown; unverified: string[] } {
  const key = alnumKey(text);
  const unverified: string[] = [];
  const check = (o: Record<string, unknown>, field: string, label: string) => {
    if (o[field] === null || o[field] === undefined) return;
    if (!verified(o[field], o[field + "_quote"], key)) {
      unverified.push(`${label}.${field}=${o[field]}`);
      o[field] = null;
    }
  };
  (out.claims ?? []).forEach((c: Record<string, unknown>, i: number) => {
    check(c, "amount_claimed", `claims[${i}]`);
    check(c, "amount_awarded", `claims[${i}]`);
    if (c.final_amount_basis === "stated-in-opinion") check(c, "final_amount", `claims[${i}]`);
    else if (c.final_amount_basis === "equals-award-affirmed") {
      if (c.amount_awarded === null || c.final_amount !== c.amount_awarded) {
        if (c.final_amount !== null) unverified.push(`claims[${i}].final_amount=${c.final_amount} (not the verified award)`);
        c.final_amount = c.amount_awarded;
        if (c.amount_awarded === null) c.final_amount_basis = "unknown";
      }
    } else if (c.final_amount_basis === "zero-after-reversal") c.final_amount = 0;
    else c.final_amount = null;
  });
  if (out.attorney_fees_awarded !== null && !verified(out.attorney_fees_awarded, out.attorney_fees_quote, key)) {
    unverified.push(`attorney_fees_awarded=${out.attorney_fees_awarded}`);
    out.attorney_fees_awarded = null;
  }
  out.competing_values = (out.competing_values ?? []).filter((v: Record<string, unknown>) => {
    const ok = verified(v.value, v.quote, key);
    if (!ok) unverified.push(`competing_values ${v.offered_by}=${v.value}`);
    return ok;
  });
  // A claim with no verified award and no clear zero cannot calibrate anything.
  // deno-lint-ignore no-explicit-any
  const scored = (out.claims ?? []).some((c: any) => c.amount_awarded !== null || c.final_amount === 0 || c.trial_result === "lost");
  if (!out.is_commercial_real_estate || out.residential_or_consumer || out.debt_collection || !scored) out.usable_for_calibration = false;
  return { out, unverified };
}

function params(model: string, rec: Rec) {
  return {
    model,
    max_tokens: 16000,
    system: SYSTEM,
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    messages: [{ role: "user", content: `Opinion text:\n\n${rec.text}` }],
  };
}

function finish(rec: Rec, model: string, msg: Anthropic.Message, batch: boolean) {
  const text = msg.content.find((b) => b.type === "text");
  const base = { id: rec.id, cluster_id: rec.cluster_id, court_id: rec.court_id, date_filed: rec.date_filed, model,
    usage: msg.usage, cost: Number(cost(model, msg.usage, batch).toFixed(5)), stop_reason: msg.stop_reason };
  if (!text || text.type !== "text" || msg.stop_reason !== "end_turn") return { ...base, error: `stop_reason ${msg.stop_reason}` };
  try {
    const { out, unverified } = verify(JSON.parse(text.text), rec.text);
    return { ...base, extraction: out, unverified };
  } catch (e) {
    return { ...base, error: `parse: ${e}` };
  }
}

function flag(name: string, dflt: string): string {
  const i = Deno.args.indexOf(name);
  return i >= 0 ? Deno.args[i + 1] : dflt;
}

async function doneIds(path: string): Promise<Set<string>> {
  if (!path) return new Set();
  try {
    return new Set((await readLines(path)).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => r.id));
  } catch {
    return new Set();
  }
}

async function main() {
  const [cmd, a, b, c] = Deno.args;
  const model = flag("--model", "claude-opus-5-5");
  const limit = Number(flag("--limit", "0")) || Infinity;
  // Jeff's key is not scoped to a workspace, so the workspace id goes in a header.
  const ws = Deno.env.get("ANTHROPIC_WORKSPACE_ID");
  const client = new Anthropic({ maxRetries: 4, defaultHeaders: ws ? { "anthropic-workspace-id": ws } : undefined });

  if (cmd === "sync") {
    const done = await doneIds(b);
    const recs: Rec[] = [];
    for await (const r of streamRecords(a)) {
      if (recs.length >= limit) break;
      if (!done.has(r.id)) recs.push(r);
    }
    let total = 0;
    for (const rec of recs) {
      // deno-lint-ignore no-explicit-any
      const msg = await client.messages.create(params(model, rec) as any) as Anthropic.Message;
      const row = finish(rec, model, msg, false);
      total += row.cost;
      await Deno.writeTextFile(b, JSON.stringify(row) + "\n", { append: true });
      // deno-lint-ignore no-explicit-any
      const x = (row as any).extraction;
      console.log(`${rec.id} $${row.cost.toFixed(4)} ${x ? `${x.category} cre=${x.is_commercial_real_estate} usable=${x.usable_for_calibration} claims=${x.claims.length}` : (row as { error?: string }).error}`);
    }
    console.log(`${recs.length} opinions, $${total.toFixed(2)}`);
  } else if (cmd === "submit") {
    // A batch takes at most 100,000 requests or 256 MB, so opinions are sent
    // in batches of up to about 180 MB each.
    const skip = await doneIds(flag("--skip", ""));
    const MAX_BYTES = 180_000_000;
    // deno-lint-ignore no-explicit-any
    let chunk: any[] = [];
    let bytes = 0;
    let sent = 0;
    const send = async () => {
      if (!chunk.length) return;
      const batch = await client.messages.batches.create({ requests: chunk });
      await Deno.writeTextFile(b, JSON.stringify({ batch: batch.id, model, n: chunk.length, created: new Date().toISOString() }) + "\n", { append: true });
      console.log(`batch ${batch.id}: ${chunk.length} opinions`);
      sent += chunk.length;
      chunk = [];
      bytes = 0;
    };
    for await (const r of streamRecords(a)) {
      if (skip.has(r.id)) continue;
      if (sent + chunk.length >= limit) break;
      const req = { custom_id: `op-${r.id}`, params: params(model, r) };
      const size = JSON.stringify(req).length + 1000;
      if (bytes + size > MAX_BYTES || chunk.length >= 90_000) await send();
      chunk.push(req);
      bytes += size;
    }
    await send();
    console.log(`${sent} opinions submitted`);
  } else if (cmd === "collect") {
    const states = (await readLines(a)).map((l) => JSON.parse(l));
    const done = await doneIds(c);
    // Results first (small), then one pass over the opinions to verify quotes.
    // deno-lint-ignore no-explicit-any
    const results = new Map<string, { model: string; r: any }>();
    for (const st of states) {
      const info = await client.messages.batches.retrieve(st.batch);
      if (info.processing_status !== "ended") {
        console.log(`${st.batch}: ${info.processing_status} (${info.request_counts.processing} left)`);
        continue;
      }
      for await (const r of await client.messages.batches.results(st.batch)) {
        const id = r.custom_id.replace(/^op-/, "");
        if (!done.has(id)) results.set(id, { model: st.model, r });
      }
    }
    if (!results.size) {
      console.log('no finished batches yet');
      return;
    }
    let n = 0;
    let total = 0;
    let pending: string[] = [];
    for await (const rec of streamRecords(b)) {
      const hit = results.get(rec.id);
      if (!hit) continue;
      const row = hit.r.result.type === "succeeded"
        ? finish(rec, hit.model, hit.r.result.message, true)
        : { id: rec.id, model: hit.model, error: hit.r.result.type, cost: 0 };
      total += row.cost;
      n++;
      pending.push(JSON.stringify(row));
      if (pending.length >= 500) {
        await Deno.writeTextFile(c, pending.join("\n") + "\n", { append: true });
        pending = [];
      }
    }
    if (pending.length) await Deno.writeTextFile(c, pending.join("\n") + "\n", { append: true });
    console.log(`${n} collected, $${total.toFixed(2)}`);
  } else {
    console.error("usage: sync IN OUT | submit IN STATE | collect STATE IN OUT  [--model M] [--limit N]");
    Deno.exit(2);
  }
}

if (import.meta.main) await main();
