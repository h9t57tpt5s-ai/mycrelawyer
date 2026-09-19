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
import { EntityIndex, looksLikeBusiness, type MatchConfidence } from "./entity-match.ts";

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SENDER_EMAIL = "no-reply@credocket.com";
const SITE_URL = "https://credocket.com";
const URL_PREFIX: Record<string, string> = {
  bankruptcy_ch11: "https://www.courtlistener.com/docket/",
  civil: "https://www.courtlistener.com/docket/",
  sec_8k: "https://www.sec.gov/Archives/edgar/data/",
};
const SOURCE_FOR: Record<string, string> = { bankruptcy_ch11: "courtlistener", civil: "courtlistener", sec_8k: "sec_edgar" };
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
  if (!Number.isInteger(f.source_docket_id)) return null;
  if (typeof f.filing_type !== "string" || !(f.filing_type in URL_PREFIX)) return null;
  if (typeof f.court_id !== "string" || typeof f.case_name !== "string" || !f.case_name.trim()) return null;
  if (typeof f.date_filed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f.date_filed)) return null;
  if (typeof f.docket_url !== "string" || !f.docket_url.startsWith(URL_PREFIX[f.filing_type])) return null;
  const parties = Array.isArray(f.parties) ? f.parties.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [];
  return {
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

// A Chapter 11 caption is the debtor's name, so it stands in when the
// party list is empty. A civil caption ("A v. B") is not a party name.
function matchableNames(f: { filing_type: string; case_name: string; parties: string[] }): string[] {
  if (f.parties.length) return f.parties;
  return f.filing_type === "bankruptcy_ch11" ? [f.case_name] : [];
}

type StoredFiling = {
  id: number; filing_type: string; court_name: string | null; docket_number: string | null;
  case_name: string; date_filed: string; parties: string[]; docket_url: string;
};
type Entity = { id: number; user_id: string; entity_name: string; entity_type: string };
type NewMatch = { entity: Entity; filing: StoredFiling; confidence: MatchConfidence; matchedParty: string };

function findMatches(entities: Entity[], filings: StoredFiling[]): NewMatch[] {
  const index = new EntityIndex(entities.map((e) => ({ name: e.entity_name, item: e })));
  const out: NewMatch[] = [];
  for (const filing of filings) {
    const best = new Map<number, { entity: Entity; confidence: MatchConfidence; party: string }>();
    for (const party of matchableNames(filing)) {
      for (const { item: entity, confidence } of index.lookup(party)) {
        const prev = best.get(entity.id);
        if (!prev || (prev.confidence !== "exact" && confidence === "exact")) best.set(entity.id, { entity, confidence, party });
      }
    }
    for (const m of best.values()) out.push({ entity: m.entity, filing, confidence: m.confidence, matchedParty: m.party });
  }
  return out;
}

const KIND_LABEL: Record<string, string> = {
  bankruptcy_ch11: "Chapter 11 bankruptcy petition",
  civil: "Federal civil suit",
  sec_8k: "SEC Form 8-K event disclosure",
};

function describeFiling(m: NewMatch): string[] {
  const isSec = m.filing.filing_type === "sec_8k";
  const confidence = m.confidence === "exact"
    ? `Match confidence: High -- the name "${m.matchedParty}" matches your saved name once corporate suffixes are ignored.`
    : `Match confidence: Possible -- your saved name is the leading part of "${m.matchedParty}". Confirm this is the same entity before relying on it.`;
  return [
    `"${m.entity.entity_name}" (${m.entity.entity_type}) -- ${KIND_LABEL[m.filing.filing_type] ?? "Filing"}`,
    `${m.filing.case_name}`,
    isSec
      ? `${m.filing.docket_number ?? ""} -- filed ${m.filing.date_filed}`
      : `${m.filing.court_name ?? ""}${m.filing.docket_number ? `, No. ${m.filing.docket_number}` : ""} -- filed ${m.filing.date_filed}`,
    isSec ? "An 8-K item names the type of event, not its cause. Item 2.04 also covers a company redeeming its own notes early, and Item 3.01 also covers a voluntary transfer between exchanges. Read the filing before drawing a conclusion." : null,
    confidence,
    `${isSec ? "Filing" : "Docket"}: ${m.filing.docket_url}`,
    "",
  ].filter((line): line is string => line !== null);
}

async function sendMatchEmail(toEmail: string, matches: NewMatch[]): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("ingest-court-filings: RESEND_API_KEY is not set -- skipping email.");
    return false;
  }
  const subject = matches.length === 1
    ? `"${matches[0].entity.entity_name}" was just named in a new federal or SEC filing`
    : `${matches.length} new filings name entities in your portfolio`;
  const text = [
    "CREdocket's daily check of new federal court and SEC filings found the following against your portfolio:",
    "",
    ...matches.flatMap(describeFiling),
    "Coverage: all new Chapter 11 petitions nationwide, federal civil suits naming your saved entities, and SEC Form 8-K filings under Items 1.03, 2.04 and 3.01. State-court filings are not yet covered, so no alert is not proof of no filing.",
    "",
    `Manage your portfolio: ${SITE_URL}/account.html?utm_source=credocket&utm_medium=email&utm_campaign=filing-alert`,
  ].join("\n");
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

async function ingest(body: Record<string, unknown>) {
  const rawFilings = Array.isArray(body.filings) ? body.filings : [];
  if (rawFilings.length > MAX_FILINGS_PER_CALL) return jsonResponse({ error: `At most ${MAX_FILINGS_PER_CALL} filings per call` }, 400);
  const filings = rawFilings.map(parseFiling).filter((f): f is IncomingFiling => f !== null);
  const rejected = rawFilings.length - filings.length;

  let stored: StoredFiling[] = [];
  if (filings.length) {
    const rows = filings.map((f) => ({
      ...f,
      source: SOURCE_FOR[f.filing_type],
      // Only companies file Form 8-K.
      is_business: f.filing_type === "sec_8k" || matchableNames(f).some(looksLikeBusiness),
    }));
    const { data, error } = await supabaseAdmin
      .from("court_filings")
      .upsert(rows, { onConflict: "source,source_docket_id" })
      .select("id, filing_type, court_name, docket_number, case_name, date_filed, parties, docket_url");
    if (error) return jsonResponse({ error: "Could not store filings", detail: error.message }, 500);
    stored = (data ?? []) as StoredFiling[];
  }

  const { rows: entityRows, error: entErr } = await fetchAll<Entity>((from, to) =>
    supabaseAdmin.from("portfolio_entities").select("id, user_id, entity_name, entity_type").order("id").range(from, to));
  if (entErr) return jsonResponse({ error: "Could not load portfolio entities", detail: entErr }, 500);

  const since = new Date(Date.now() - MATCH_LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const { rows: recent, error: recentErr } = await fetchAll<StoredFiling>((from, to) =>
    supabaseAdmin.from("court_filings")
      .select("id, filing_type, court_name, docket_number, case_name, date_filed, parties, docket_url")
      .gte("date_filed", since).order("id").range(from, to));
  if (recentErr) return jsonResponse({ error: "Could not load recent filings", detail: recentErr }, 500);

  const candidates = findMatches(entityRows, recent);
  let newMatches: NewMatch[] = [];
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
    const insertedKeys = new Map((inserted ?? []).map((r) => [`${r.entity_id}:${r.filing_id}`, r.id as number]));
    newMatches = candidates.filter((m) => insertedKeys.has(`${m.entity.id}:${m.filing.id}`));

    const byUser = new Map<string, NewMatch[]>();
    for (const m of newMatches) byUser.set(m.entity.user_id, [...(byUser.get(m.entity.user_id) ?? []), m]);
    for (const [userId, userMatches] of byUser) {
      const { data: userData, error: uErr } = await supabaseAdmin.auth.admin.getUserById(userId);
      const email = userData?.user?.email;
      if (uErr || !email) {
        console.error(`ingest-court-filings: could not resolve email for user ${userId} --`, uErr?.message);
        continue;
      }
      if (await sendMatchEmail(email, userMatches)) {
        const ids = userMatches.map((m) => insertedKeys.get(`${m.entity.id}:${m.filing.id}`)!);
        await supabaseAdmin.from("filing_matches").update({ emailed_at: new Date().toISOString() }).in("id", ids);
      }
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

  return jsonResponse({ ok: true, stored: stored.length, rejected, checkedFilings: recent.length, checkedEntities: entityRows.length, newMatches: newMatches.length }, 200);
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
