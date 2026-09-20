// CREdocket — Counterparty surveillance ingest.
//
// Called only by scripts/ingest_court_filings.py (run by
// .github/workflows/court-filings-ingest.yml), never by a browser. The
// runner does the slow, rate-limited CourtListener pulls; this function
// owns everything that needs the service role: storing filings, matching
// them against every user's portfolio_entities, and emailing new matches.
//
// Auth: shared AUTOMATION_SECRET in x-automation-secret; fails closed.
// Deploy with --no-verify-jwt. Needs supabase/migrations/
// 20260919_court_filings_surveillance.sql to have been run.

import { createClient } from "npm:@supabase/supabase-js@2";
import { looksLikeBusiness } from "./entity-match.ts";
import { buildAlertEmail, findMatches, matchableNames, type Entity, type NewMatch, type StoredFiling } from "./alert-logic.ts";

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SENDER_EMAIL = "no-reply@credocket.com";
// Every accepted source, the filing types it may send, and the only URL
// prefix its links may use. State-court sources reuse the "civil" type, so
// they need no schema change; `source` is what tells them apart. They are
// never publicly readable (the public policy covers only business Chapter
// 11 petitions and SEC Item 1.03 rows).
const SOURCES: Record<string, { types: string[]; urlPrefix: string }> = {
  courtlistener: { types: ["bankruptcy_ch11", "civil"], urlPrefix: "https://www.courtlistener.com/docket/" },
  sec_edgar: { types: ["sec_8k"], urlPrefix: "https://www.sec.gov/Archives/edgar/data/" },
  hillsborough_fl: { types: ["civil"], urlPrefix: "https://hover.hillsclerk.com/" },
  harris_jp_tx: { types: ["civil"], urlPrefix: "https://jpwebsite.harriscountytx.gov/" },
};
const MAX_FILINGS_PER_CALL = 500;
// Matching re-checks this many days of stored filings on every run, so an
// entity added today still surfaces a petition filed last week.
const MATCH_LOOKBACK_DAYS = 30;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

// Supabase returns at most 1,000 rows per request whatever .limit() says,
// so any read that must see every row has to page. A silently truncated
// read here means silently missed alerts.
const PAGE_SIZE = 1000;
async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>,
): Promise<{ rows: T[]; error: string | null }> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) return { rows, error: error.message };
    rows.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE_SIZE) return { rows, error: null };
  }
}

type IncomingFiling = {
  source: string;
  source_docket_id: number;
  filing_type: "bankruptcy_ch11" | "civil" | "sec_8k";
  court_id: string;
  court_name?: string;
  docket_number?: string;
  case_name: string;
  date_filed: string;
  parties: string[];
  docket_url: string;
};

function parseFiling(raw: unknown): IncomingFiling | null {
  if (!raw || typeof raw !== "object") return null;
  const f = raw as Record<string, unknown>;
  // Rows from the original CourtListener pull carry no source field.
  const source = typeof f.source === "string" ? f.source : "courtlistener";
  const rules = Object.hasOwn(SOURCES, source) ? SOURCES[source] : null;
  if (!rules) return null;
  if (!Number.isSafeInteger(f.source_docket_id)) return null;
  if (typeof f.filing_type !== "string" || !rules.types.includes(f.filing_type)) return null;
  if (typeof f.court_id !== "string" || typeof f.case_name !== "string" || !f.case_name.trim()) return null;
  if (typeof f.date_filed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f.date_filed)) return null;
  if (typeof f.docket_url !== "string" || !f.docket_url.startsWith(rules.urlPrefix)) return null;
  const parties = Array.isArray(f.parties) ? f.parties.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [];
  return {
    source,
    source_docket_id: f.source_docket_id as number,
    filing_type: f.filing_type as IncomingFiling["filing_type"],
    court_id: f.court_id,
    court_name: typeof f.court_name === "string" ? f.court_name : undefined,
    docket_number: typeof f.docket_number === "string" ? f.docket_number : undefined,
    case_name: f.case_name.trim(),
    date_filed: f.date_filed,
    parties,
    docket_url: f.docket_url,
  };
}

async function sendMatchEmail(toEmail: string, matches: NewMatch[], liveSources: Set<string>): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("ingest-court-filings: RESEND_API_KEY is not set -- skipping email.");
    return false;
  }
  const { subject, text } = buildAlertEmail(matches, liveSources);
  try {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `CREdocket <${SENDER_EMAIL}>`, to: [toEmail], subject, text }),
    });
    if (!resp.ok) {
      console.error(`ingest-court-filings: Resend returned ${resp.status} -- ${await resp.text().catch(() => "")}`);
      return false;
    }
    return true;
  } catch (err) {
    console.error("ingest-court-filings: fetch to Resend failed --", String(err));
    return false;
  }
}

async function listEntities(limit: number) {
  const { rows: data, error } = await fetchAll<{ entity_name: string }>((from, to) =>
    supabaseAdmin.from("portfolio_entities").select("entity_name, last_federal_search_at")
      .order("last_federal_search_at", { ascending: true, nullsFirst: true }).order("id").range(from, to));
  if (error) return jsonResponse({ error: "Could not load portfolio entities", detail: error }, 500);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of data) {
    const key = row.entity_name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    // Returned untrimmed so the runner can echo it back for the exact-match
    // last_federal_search_at update below; a name that never got stamped
    // would sort first forever and starve the rest of the queue.
    names.push(row.entity_name);
    if (names.length >= limit) break;
  }
  return jsonResponse({ ok: true, entities: names }, 200);
}

// State-court scope is an allowlist that has already been tightened once.
// When the runner sends the COMPLETE set of in-scope cases for one state
// source and date window, anything else stored for that source and window
// is out of scope and is removed -- except a row that already produced an
// alert, so nobody's alert history disappears. Never applies to federal or
// SEC rows.
const PRUNABLE_SOURCES = new Set(["hillsborough_fl", "harris_jp_tx"]);

async function pruneStateWindow(raw: unknown, keepIds: number[]): Promise<number | string> {
  if (!raw || typeof raw !== "object") return 0;
  const p = raw as Record<string, unknown>;
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if (typeof p.source !== "string" || !PRUNABLE_SOURCES.has(p.source) || !isDate(p.dateFrom) || !isDate(p.dateTo)) return "invalid prune request";

  const { rows: existing, error } = await fetchAll<{ id: number; source_docket_id: number }>((from, to) =>
    supabaseAdmin.from("court_filings").select("id, source_docket_id")
      .eq("source", p.source as string).gte("date_filed", p.dateFrom as string).lte("date_filed", p.dateTo as string)
      .order("id").range(from, to));
  if (error) return error;
  const keep = new Set(keepIds);
  const stale = existing.filter((r) => !keep.has(Number(r.source_docket_id))).map((r) => r.id);
  if (!stale.length) return 0;

  const alerted = new Set<number>();
  for (let i = 0; i < stale.length; i += 200) {
    const { data, error: mErr } = await supabaseAdmin.from("filing_matches").select("filing_id").in("filing_id", stale.slice(i, i + 200));
    if (mErr) return mErr.message;
    for (const m of data ?? []) alerted.add(m.filing_id as number);
  }
  const doomed = stale.filter((id) => !alerted.has(id));
  for (let i = 0; i < doomed.length; i += 200) {
    const { error: dErr } = await supabaseAdmin.from("court_filings").delete().in("id", doomed.slice(i, i + 200));
    if (dErr) return dErr.message;
  }
  return doomed.length;
}

async function ingest(body: Record<string, unknown>) {
  const rawFilings = Array.isArray(body.filings) ? body.filings : [];
  if (rawFilings.length > MAX_FILINGS_PER_CALL) return jsonResponse({ error: `At most ${MAX_FILINGS_PER_CALL} filings per call` }, 400);
  const filings = rawFilings.map(parseFiling).filter((f): f is IncomingFiling => f !== null);
  const rejected = rawFilings.length - filings.length;

  let stored: StoredFiling[] = [];
  if (filings.length) {
    const rows = filings.map((f) => ({
      ...f,
      // Only companies file Form 8-K.
      is_business: f.filing_type === "sec_8k" || matchableNames(f).some(looksLikeBusiness),
    }));
    const { data, error } = await supabaseAdmin
      .from("court_filings")
      .upsert(rows, { onConflict: "source,source_docket_id" })
      .select("id, source, filing_type, court_name, docket_number, case_name, date_filed, parties, docket_url");
    if (error) return jsonResponse({ error: "Could not store filings", detail: error.message }, 500);
    stored = (data ?? []) as StoredFiling[];
  }

  let pruned: number | string = 0;
  if (body.pruneState) {
    // Refuse to prune on a partly rejected batch: a rejected row would look
    // "missing" and be deleted.
    pruned = rejected ? "skipped: batch had rejected rows" : await pruneStateWindow(body.pruneState, filings.map((f) => f.source_docket_id));
  }

  const { rows: entityRows, error: entErr } = await fetchAll<Entity>((from, to) =>
    supabaseAdmin.from("portfolio_entities").select("id, user_id, entity_name, entity_type").order("id").range(from, to));
  if (entErr) return jsonResponse({ error: "Could not load portfolio entities", detail: entErr }, 500);

  const since = new Date(Date.now() - MATCH_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { rows: recent, error: recentErr } = await fetchAll<StoredFiling>((from, to) =>
    supabaseAdmin.from("court_filings")
      .select("id, source, filing_type, court_name, docket_number, case_name, date_filed, parties, docket_url")
      .gte("date_filed", since).order("id").range(from, to));
  if (recentErr) return jsonResponse({ error: "Could not load recent filings", detail: recentErr }, 500);

  const liveSources = new Set(recent.map((f) => f.source));
  const candidates = findMatches(entityRows, recent);
  let newMatches: NewMatch[] = [];
  let emailsSent = 0;
  let emailsFailed = 0;
  if (candidates.length) {
    // ignoreDuplicates makes the returned rows exactly the matches that
    // did not exist before, so re-ingesting a window never re-alerts.
    const { data: inserted, error: mErr } = await supabaseAdmin
      .from("filing_matches")
      .upsert(
        candidates.map((m) => ({
          user_id: m.entity.user_id, entity_id: m.entity.id, filing_id: m.filing.id,
          confidence: m.confidence, matched_party: m.matchedParty,
        })),
        { onConflict: "entity_id,filing_id", ignoreDuplicates: true },
      )
      .select("id, entity_id, filing_id");
    if (mErr) return jsonResponse({ error: "Could not store matches", detail: mErr.message }, 500);
    const insertedKeys = new Set((inserted ?? []).map((r) => `${r.entity_id}:${r.filing_id}`));
    newMatches = candidates.filter((m) => insertedKeys.has(`${m.entity.id}:${m.filing.id}`));
  }

  // Email every match from the last week that has no emailed_at, not just
  // the ones inserted by this call: a failed send must be retried, or the
  // duplicate guard above would bury that alert forever.
  const retrySince = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: unsent, error: unsentErr } = await supabaseAdmin
    .from("filing_matches")
    .select("id, entity_id, filing_id, confidence, matched_party")
    .is("emailed_at", null).gte("created_at", retrySince).limit(1000);
  if (unsentErr) return jsonResponse({ error: "Could not load unsent matches", detail: unsentErr.message }, 500);

  const entityById = new Map(entityRows.map((e) => [e.id, e]));
  const filingById = new Map(recent.map((f) => [f.id, f]));
  const byUser = new Map<string, { id: number; match: NewMatch }[]>();
  for (const row of unsent ?? []) {
    const entity = entityById.get(row.entity_id), filing = filingById.get(row.filing_id);
    if (!entity || !filing) continue;
    const match: NewMatch = { entity, filing, confidence: row.confidence, matchedParty: row.matched_party };
    byUser.set(entity.user_id, [...(byUser.get(entity.user_id) ?? []), { id: row.id, match }]);
  }
  for (const [userId, items] of byUser) {
    const { data: userData, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = userData?.user?.email;
    if (uErr || !email) {
      console.error(`ingest-court-filings: could not resolve email for user ${userId} --`, uErr?.message);
      emailsFailed++;
      continue;
    }
    if (await sendMatchEmail(email, items.map((i) => i.match), liveSources)) {
      emailsSent++;
      await supabaseAdmin.from("filing_matches").update({ emailed_at: new Date().toISOString() }).in("id", items.map((i) => i.id));
    } else {
      emailsFailed++;
    }
  }

  const searched = Array.isArray(body.searchedEntities)
    ? body.searchedEntities.filter((n): n is string => typeof n === "string" && n.trim().length > 0)
    : [];
  if (searched.length) {
    await supabaseAdmin.from("portfolio_entities")
      .update({ last_federal_search_at: new Date().toISOString() })
      .in("entity_name", searched);
  }

  return jsonResponse({ ok: true, stored: stored.length, rejected, checkedFilings: recent.length, checkedEntities: entityRows.length, newMatches: newMatches.length, emailsSent, emailsFailed, pruned }, 200);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);
  const provided = req.headers.get("x-automation-secret") ?? "";
  if (!AUTOMATION_SECRET || provided !== AUTOMATION_SECRET) return jsonResponse({ error: "Invalid automation secret" }, 401);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid request body" }, 400); }

  if (body.action === "entities") {
    const limit = Number.isInteger(body.limit) ? Math.min(Math.max(body.limit as number, 1), 500) : 60;
    return await listEntities(limit);
  }
  if (body.action === "ingest") return await ingest(body);
  return jsonResponse({ error: "Unknown action" }, 400);
});
