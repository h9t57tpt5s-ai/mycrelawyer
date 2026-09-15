// =========================================================
// CREdocket -- Public Cases API: read-only JSON export of the tracker
//
// WHY THIS FUNCTION EXISTS: the 100-persona stakeholder review flagged
// "no programmatic access to the tracker" as a recurring gap for
// anyone who wants to pull CREdocket data into their own model or
// dashboard instead of reading the site by hand -- named by insurer
// underwriting/actuarial personas, rating-analyst personas, and
// portfolio-analytics personas independently.
//
// The underlying data was already technically public: public.case_data
// has an "Anyone can read case data" RLS policy (see
// handbook_project/schema_case_data_and_watchlists.sql), so a raw
// PostgREST request against Supabase's own REST endpoint already
// returns everything. This function doesn't change what's exposed --
// it wraps that same public data in a stable, documented,
// credocket.com-branded surface with sane query params, a hard result
// cap, and a consistent JSON shape, so a caller never has to learn
// PostgREST's filter syntax, know the project ref, or hold an anon key.
//
// Request (GET only, all query params optional):
//   /public-cases-api
//     ?category=lending-foreclosure   one of the 9 practice-area slugs
//                                      (see methodology.html); comma-
//                                      separate for more than one
//     &state=TX                       2-letter state code; comma-list ok
//     &status=pending                 filed | pending | ruling | settled | appeal
//     &since=2026-01-01               only matters with date >= this (YYYY-MM-DD)
//     &q=habitability                 keyword, matched against title+summary
//     &limit=50                       default 50, max 200
//     &offset=0                       pagination offset
//     &sort=date.desc                 date.desc (default) | date.asc
//
// Response:
//   {
//     "generated_at": "2026-09-14T18:03:11.000Z",
//     "count": 50,          number of rows in THIS page
//     "total": 138,         total rows matching the filters, across all pages
//     "limit": 50, "offset": 0,
//     "results": [ { id, title, category, status, date, jurisdiction,
//                    state, amount, source, source_url, summary,
//                    significance, judge, tags }, ... ],
//     "methodology": "https://credocket.com/methodology.html",
//     "attribution": "Data via CREdocket (https://credocket.com). Not
//                      legal advice -- see methodology for sourcing,
//                      scope, and update cadence."
//   }
// An invalid filter value (e.g. an unrecognized status) returns a 400
// with an "error" field, not a silently-empty result set.
//
// Auth model: none -- this is intentionally a fully public, anonymous,
// read-only endpoint, same posture as the case_data table's own RLS
// policy. No Authorization header is read or required.
//
// Deploy: Supabase Dashboard -> Edge Functions -> New function -> name
//   it exactly "public-cases-api" -> Code tab -> select all, delete,
//   paste this file's contents -> Deploy -> Settings tab -> turn
//   "Enforce JWT Verification" OFF (same requirement as
//   check-and-send-watchlist-alerts and settlement-benchmarks-search --
//   see settlement-benchmarks-search/index.ts for why). If deploying via
//   the Supabase CLI instead, pass --no-verify-jwt so this is set
//   automatically: supabase functions deploy public-cases-api
//   --project-ref <ref> --use-api --no-verify-jwt
//
// Secrets needed: none beyond what's already configured project-wide --
//   reuses SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injected).
//   Uses the service-role client (bypassing RLS) purely for a reliable
//   exact count alongside the page of results in one round trip -- the
//   data itself is identical to what the "Anyone can read case data"
//   policy already permits an anon key to read.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const TABLE = "case_data";
const VALID_STATUSES = new Set(["filed", "pending", "ruling", "settled", "appeal"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Browser CORS -- see case-valuation-analyze/index.ts for why this is
// required verbatim (a missing/omitted header here fails the preflight
// OPTIONS request before this function's own logic ever runs). This
// endpoint is meant to be called from arbitrary third-party origins
// (that's the point of a public API), so Allow-Origin stays "*".
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function splitList(value: string | null): string[] | null {
  if (!value) return null;
  const items = value.split(",").map((s) => s.trim()).filter(Boolean);
  return items.length ? items : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET") {
    return jsonResponse({ error: "This endpoint only accepts GET requests." }, 405);
  }

  const url = new URL(req.url);
  const params = url.searchParams;

  const categories = splitList(params.get("category"));
  const states = splitList(params.get("state"))?.map((s) => s.toUpperCase()) ?? null;
  const statusParam = params.get("status");
  const since = params.get("since");
  const keyword = params.get("q");
  const sort = params.get("sort") === "date.asc" ? "date.asc" : "date.desc";

  if (statusParam && !VALID_STATUSES.has(statusParam)) {
    return jsonResponse({
      error: `Invalid status "${statusParam}". Must be one of: ${[...VALID_STATUSES].join(", ")}.`,
    }, 400);
  }
  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return jsonResponse({ error: `Invalid "since" date "${since}". Use YYYY-MM-DD format.` }, 400);
  }

  let limit = DEFAULT_LIMIT;
  if (params.has("limit")) {
    const n = Number(params.get("limit"));
    if (!Number.isFinite(n) || n < 1) {
      return jsonResponse({ error: `Invalid "limit" value "${params.get("limit")}".` }, 400);
    }
    limit = Math.min(Math.floor(n), MAX_LIMIT);
  }
  let offset = 0;
  if (params.has("offset")) {
    const n = Number(params.get("offset"));
    if (!Number.isFinite(n) || n < 0) {
      return jsonResponse({ error: `Invalid "offset" value "${params.get("offset")}".` }, 400);
    }
    offset = Math.floor(n);
  }

  let query = supabaseAdmin
    .from(TABLE)
    .select("id, title, category, status, date, jurisdiction, state, amount, source, source_url, summary, significance, judge, tags", { count: "exact" });

  if (categories) query = query.in("category", categories);
  if (states) query = query.in("state", states);
  if (statusParam) query = query.eq("status", statusParam);
  if (since) query = query.gte("date", since);
  if (keyword) query = query.or(`title.ilike.%${keyword}%,summary.ilike.%${keyword}%`);

  query = query.order("date", { ascending: sort === "date.asc" }).range(offset, offset + limit - 1);

  const { data, count, error } = await query;
  if (error) {
    console.error("public-cases-api query error:", error);
    return jsonResponse({ error: "Could not query the tracker right now. Try again shortly." }, 500);
  }

  return jsonResponse({
    generated_at: new Date().toISOString(),
    count: data?.length ?? 0,
    total: count ?? 0,
    limit,
    offset,
    results: data ?? [],
    methodology: "https://credocket.com/methodology.html",
    attribution: "Data via CREdocket (https://credocket.com). Not legal advice -- see methodology for sourcing, scope, and update cadence.",
  }, 200);
});
