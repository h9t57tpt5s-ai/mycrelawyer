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
import { looksLikeBusiness, matchEntity, type MatchConfidence } from "./entity-match.ts";

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SENDER_EMAIL = "no-reply@credocket.com";
const SITE_URL = "https://credocket.com";
const DOCKET_URL_PREFIX = "https://www.courtlistener.com/docket/";
const MAX_FILINGS_PER_CALL = 500;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type IncomingFiling = {
  source_docket_id: number;
  filing_type: "bankruptcy_ch11" | "civil";
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
  if (f.filing_type !== "bankruptcy_ch11" && f.filing_type !== "civil") return null;
  if (typeof f.court_id !== "string" || typeof f.case_name !== "string" || !f.case_name.trim()) return null;
  if (typeof f.date_filed !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(f.date_filed)) return null;
  if (typeof f.docket_url !== "string" || !f.docket_url.startsWith(DOCKET_URL_PREFIX)) return null;
  const parties = Array.isArray(f.parties) ? f.parties.filter((p): p is string => typeof p === "string" && p.trim().length > 0) : [];
  return {
    source_docket_id: f.source_docket_id as number,
    filing_type: f.filing_type,
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
  const out: NewMatch[] = [];
  for (const filing of filings) {
    const names = matchableNames(filing);
    for (const entity of entities) {
      let best: { confidence: MatchConfidence; party: string } | null = null;
      for (const party of names) {
        const c = matchEntity(entity.entity_name, party);
        if (c === "exact") { best = { confidence: c, party }; break; }
        if (c && !best) best = { confidence: c, party };
      }
      if (best) out.push({ entity, filing, confidence: best.confidence, matchedParty: best.party });
    }
  }
  return out;
}

function describeFiling(m: NewMatch): string[] {
  const kind = m.filing.filing_type === "bankruptcy_ch11" ? "Chapter 11 bankruptcy petition" : "Federal civil suit";
  const confidence = m.confidence === "exact"
    ? `Match confidence: High -- the party name "${m.matchedParty}" matches your saved name once corporate suffixes are ignored.`
    : `Match confidence: Possible -- your saved name is the leading part of the party name "${m.matchedParty}". Confirm this is the same entity before relying on it.`;
  return [
    `"${m.entity.entity_name}" (${m.entity.entity_type}) -- ${kind}`,
    `${m.filing.case_name}`,
    `${m.filing.court_name ?? ""}${m.filing.docket_number ? `, No. ${m.filing.docket_number}` : ""} -- filed ${m.filing.date_filed}`,
    confidence,
    `Docket: ${m.filing.docket_url}`,
    "",
  ];
}

async function sendMatchEmail(toEmail: string, matches: NewMatch[]): Promise<boolean> {
  if (!RESEND_API_KEY) {
    console.error("ingest-court-filings: RESEND_API_KEY is not set -- skipping email.");
    return false;
  }
  const subject = matches.length === 1
    ? `"${matches[0].entity.entity_name}" was just named in a new federal filing`
    : `${matches.length} new federal filings name entities in your portfolio`;
  const text = [
    "CREdocket's daily check of new federal court filings found the following against your portfolio:",
    "",
    ...matches.flatMap(describeFiling),
    "Coverage: all new Chapter 11 petitions nationwide, plus federal civil suits naming your saved entities. State-court filings are not yet covered, so no alert is not proof of no filing.",
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
  const { data, error } = await supabaseAdmin
    .from("portfolio_entities")
    .select("entity_name, last_federal_search_at")
    .order("last_federal_search_at", { ascending: true, nullsFirst: true })
    .limit(5000);
  if (error) return jsonResponse({ error: "Could not load portfolio entities", detail: error.message }, 500);
  const seen = new Set<string>();
  const names: string[] = [];
  for (const row of data ?? []) {
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
      source: "courtlistener",
      is_business: matchableNames(f).some(looksLikeBusiness),
    }));
    const { data, error } = await supabaseAdmin
      .from("court_filings")
      .upsert(rows, { onConflict: "source,source_docket_id" })
      .select("id, filing_type, court_name, docket_number, case_name, date_filed, parties, docket_url");
    if (error) return jsonResponse({ error: "Could not store filings", detail: error.message }, 500);
    stored = (data ?? []) as StoredFiling[];
  }

  const { data: entityRows, error: entErr } = await supabaseAdmin
    .from("portfolio_entities")
    .select("id, user_id, entity_name, entity_type");
  if (entErr) return jsonResponse({ error: "Could not load portfolio entities", detail: entErr.message }, 500);

  const candidates = findMatches((entityRows ?? []) as Entity[], stored);
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

  return jsonResponse({ ok: true, stored: stored.length, rejected, newMatches: newMatches.length }, 200);
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
