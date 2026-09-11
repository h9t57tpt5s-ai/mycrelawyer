// =========================================================
// CREdocket -- Settlement & Verdict Benchmarks: gated citation search
//
// WHY THIS FUNCTION EXISTS: js/case-valuation-data.js used to ship its
// full `citations` object (403 real, individually-researched cases with
// verified settlement/verdict dollar amounts, sources, and outcome
// narratives) as a public static file -- anyone could download the
// entire proprietary research database in one unauthenticated request.
// That data now lives ONLY in the private `private_case_citations`
// table (service-role read only, RLS enabled with zero policies -- see
// its migration). js/case-valuation-data.js keeps `spec` (categories /
// claim types / labels) and the state-law-modifier tables, which were
// never the sensitive part.
//
// This function is the ONLY server-side path back to the citation data,
// and it deliberately serves TWO legitimate audiences from the same
// free, no-signup-required search:
//   - Anonymous callers: enough to see the research exists and browse
//     case names/jurisdictions/years -- a real lead-gen hook -- but NOT
//     the dollar amount, source link, or outcome/notes text that make
//     the data commercially valuable.
//   - Signed-in callers: the full cited record, exactly as the old
//     client-side page rendered it.
// There is NO credit/payment gate here (unlike case-valuation-analyze) --
// signed-in-vs-not is the only distinction, and anonymous is a normal,
// expected, non-error request, not a degraded/failed one.
//
// Request (POST, JSON body -- all fields optional):
//   {
//     "category": "lease-disputes",   // spec category slug, or "all"/omitted
//     "jurisdiction": "CA",           // 2-letter state or "Federal (...)" string, or "all"/omitted
//     "keyword": "constructive",      // matched against caseName/outcome/notes, server-side only
//     "minYear": 2015, "maxYear": 2024,
//     "sort": "amount-desc" | "amount-asc" | "year-desc" | "year-asc"   // default "amount-desc"
//   }
// A GET is accepted too, reading the same fields from the query string
// (?category=&jurisdiction=&keyword=&minYear=&maxYear=&sort=), so a
// simple bookmarkable/curl-able link works without a POST body -- POST
// is the primary path the page itself uses.
//
// Response:
//   { "total": 14, "signedIn": false, "results": [ ...rows... ] }
// `total` is the full match count regardless of sign-in state, so an
// anonymous visitor can see "14 matching cases" even though each card
// is redacted -- that's the lead-gen hook, not a bug.
//
// Anonymous row shape (ONLY these fields -- never more):
//   { "caseName": "...", "jurisdiction": "CA", "year": 2015,
//     "confidence": "high", "locked": true }
// Signed-in row shape (the full cited record -- illustrative placeholder
// values below, not a real dataset entry):
//   { "claimKey": "example_claim_key", "categorySlug": "example-category",
//     "categoryLabel": "Example Category Label",
//     "claimLabel": "Example Claim", "caseName": "...", "citation": "...",
//     "jurisdiction": "XX", "year": 0, "outcome": "...",
//     "dollarAmount": 0, "url": "...", "confidence": "high",
//     "notes": "...", "locked": false }
// (Source data is inconsistent about "url" vs "sourceUrl" as the field
// name -- see loadCitationsTable() below -- always normalized to "url"
// in the response so the client never has to care.)
//
// Auth model: reads the Authorization header if present and verifies it
// against Supabase Auth the SAME way this repo's other user-facing
// functions do (case-valuation-analyze, contribute-settlement,
// lease-clause-redline, admin-review-contribution) -- calling
// `.auth.getUser(token)` on the service-role client with the caller's
// own bearer token explicitly passed in. That call verifies the token
// itself against Supabase Auth; it does not use the service-role key as
// the caller's identity, so this stays a real per-user check, not an
// admin bypass. Missing/invalid/expired token -> treated as anonymous,
// NOT a 401 -- this endpoint has no failure mode for "not signed in,"
// only a reduced-detail response.
//
// Deploy: Supabase Dashboard -> Edge Functions -> New function -> name
//   it exactly "settlement-benchmarks-search" -> Code tab -> select all,
//   delete, paste this file's contents -> Deploy.
//
// IMPORTANT -- unlike this repo's other user-facing functions, this one
//   MUST accept requests with NO Authorization header at all (anonymous
//   browsing is a first-class, expected case, not an error). Supabase's
//   Edge Function gateway enforces its own JWT check ahead of this
//   function's own code whenever "Enforce JWT Verification" is left on
//   for the function (the default when created through the Dashboard
//   "New function" flow) -- with it on, an anonymous request is rejected
//   with a platform-level 401 before this file ever runs, regardless of
//   the anonymous-friendly logic below. After creating/deploying this
//   function, go to its Settings tab and turn "Enforce JWT Verification"
//   OFF, the same way it must already be off for
//   check-and-send-watchlist-alerts (which also has no per-request user
//   JWT). This function still verifies a signed-in caller's token itself
//   in code below -- turning off the platform-level check only stops it
//   from blocking the anonymous case before that code gets a chance to run.
//
// Secrets needed: none beyond what's already configured project-wide --
//   reuses SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto-injected).
//   Fetches the public, trimmed https://credocket.com/js/case-valuation-data.js
//   (same CASE_DATA_URL pattern as case-valuation-analyze/index.ts) for
//   `spec` (category/claim-type labels) only -- the sensitive `citations`
//   key is gone from that file by design; this function never asks it
//   for citations.
// =========================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const CASE_DATA_URL = "https://credocket.com/js/case-valuation-data.js";
const CITATIONS_TABLE = "private_case_citations";
const CITATIONS_ROW_ID = "main";

const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
);

// Browser CORS -- see case-valuation-analyze/index.ts for why this is
// required verbatim (a missing/omitted header here fails the preflight
// OPTIONS request before this function's own logic ever runs, and the
// browser surfaces that as a bare, unexplainable "Failed to fetch").
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

// =========================================================
// Public spec (category / claim-type labels only) -- fetched live from
// the deployed, trimmed site file rather than duplicated here, mirroring
// loadCaseData() in case-valuation-analyze/index.ts. That file is genuine
// JavaScript (`const CASE_VALUATION_DATA = {...};`), not JSON, and
// contains legitimate JS block comments a naive JSON.parse chokes on --
// executed as real JS instead, same as the sibling function.
// =========================================================
type Spec = {
  categories: Record<string, { label: string; claimTypes: Record<string, { label?: string }> }>;
};

let cachedSpec: Spec | null = null;
async function loadSpec(): Promise<Spec> {
  if (cachedSpec) return cachedSpec;
  const res = await fetch(CASE_DATA_URL);
  if (!res.ok) throw new Error(`Could not load case data (${res.status})`);
  const raw = await res.text();
  const fn = new Function(`${raw}\nreturn CASE_VALUATION_DATA;`);
  const data = fn() as { spec: Spec };
  cachedSpec = data.spec;
  return cachedSpec;
}

type ClaimMeta = { categorySlug: string; categoryLabel: string; claimLabel: string };

function buildClaimMeta(spec: Spec): Record<string, ClaimMeta> {
  const meta: Record<string, ClaimMeta> = {};
  Object.entries(spec.categories || {}).forEach(([categorySlug, cat]) => {
    Object.entries(cat.claimTypes || {}).forEach(([claimKey, claim]) => {
      meta[claimKey] = { categorySlug, categoryLabel: cat.label, claimLabel: claim.label || claimKey };
    });
  });
  return meta;
}

// =========================================================
// Private citation data -- service-role read only. RLS on
// private_case_citations has no policies at all, so only this
// service-role client can ever see it; the anon/publishable key and any
// end-user session are denied by default regardless of what a client
// sends.
// =========================================================
type CitationRow = {
  caseName?: string;
  citation?: string;
  jurisdiction?: string;
  year?: number;
  outcome?: string;
  dollarAmount?: number | null;
  url?: string;
  sourceUrl?: string; // most of the current dataset uses this field name instead of `url` -- normalized on output, see toPublicRow()
  confidence?: string;
  notes?: string;
};
type CitationsById = Record<string, CitationRow[]>; // claimKey -> entries

async function loadCitations(): Promise<CitationsById> {
  const { data, error } = await supabaseAdmin
    .from(CITATIONS_TABLE)
    .select("citations")
    .eq("id", CITATIONS_ROW_ID)
    .maybeSingle();
  if (error) throw new Error(`Could not load citation data: ${error.message}`);
  return (data?.citations as CitationsById) || {};
}

// =========================================================
// Flatten + filter + sort -- mirrors the exact filter semantics
// js/settlement-benchmarks.js used to run client-side over the (now
// removed) public citations file, so existing page behavior doesn't
// drift just because the data moved server-side.
// =========================================================
type FlatRow = CitationRow & { claimKey: string } & ClaimMeta;

function flattenCitations(citations: CitationsById, claimMeta: Record<string, ClaimMeta>): FlatRow[] {
  const rows: FlatRow[] = [];
  Object.entries(citations).forEach(([claimKey, entries]) => {
    const meta = claimMeta[claimKey] || { categorySlug: "other", categoryLabel: "Other", claimLabel: claimKey };
    (entries || []).forEach((cit) => {
      if (!cit || !cit.caseName) return;
      rows.push({ claimKey, ...meta, ...cit });
    });
  });
  return rows;
}

type Filters = {
  category?: string;
  jurisdiction?: string;
  keyword?: string;
  minYear?: number;
  maxYear?: number;
  sort?: string;
};

function parseFilters(source: Record<string, unknown>): Filters {
  const str = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const num = (v: unknown): number | undefined => {
    const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : undefined;
  };
  return {
    category: str(source.category),
    jurisdiction: str(source.jurisdiction),
    keyword: str(source.keyword)?.toLowerCase(),
    minYear: num(source.minYear),
    maxYear: num(source.maxYear),
    sort: str(source.sort),
  };
}

function applyFilters(rows: FlatRow[], f: Filters): FlatRow[] {
  return rows.filter((r) => {
    if (f.category && f.category !== "all" && r.categorySlug !== f.category) return false;
    if (f.jurisdiction && f.jurisdiction !== "all" && r.jurisdiction !== f.jurisdiction) return false;
    if (typeof f.minYear === "number" && (typeof r.year !== "number" || r.year < f.minYear)) return false;
    if (typeof f.maxYear === "number" && (typeof r.year !== "number" || r.year > f.maxYear)) return false;
    if (f.keyword) {
      const hay = `${r.caseName || ""} ${r.outcome || ""} ${r.notes || ""} ${r.claimLabel || ""}`.toLowerCase();
      if (!hay.includes(f.keyword)) return false;
    }
    return true;
  });
}

function sortRows(rows: FlatRow[], sort: string | undefined): FlatRow[] {
  const sorted = rows.slice();
  sorted.sort((a, b) => {
    if (sort === "amount-asc") return (a.dollarAmount || 0) - (b.dollarAmount || 0);
    if (sort === "year-asc") return (a.year || 0) - (b.year || 0);
    if (sort === "year-desc") return (b.year || 0) - (a.year || 0);
    return (b.dollarAmount || 0) - (a.dollarAmount || 0); // "amount-desc" and default
  });
  return sorted;
}

function toPublicRow(row: FlatRow, signedIn: boolean): Record<string, unknown> {
  if (!signedIn) {
    // Deliberately ONLY these fields for an anonymous caller -- never
    // dollarAmount, url/sourceUrl, citation, outcome, or notes, no
    // matter what else gets added to this function later.
    return {
      caseName: row.caseName,
      jurisdiction: row.jurisdiction,
      year: row.year,
      confidence: row.confidence,
      locked: true,
    };
  }
  return {
    claimKey: row.claimKey,
    categorySlug: row.categorySlug,
    categoryLabel: row.categoryLabel,
    claimLabel: row.claimLabel,
    caseName: row.caseName,
    citation: row.citation,
    jurisdiction: row.jurisdiction,
    year: row.year,
    outcome: row.outcome,
    dollarAmount: typeof row.dollarAmount === "number" ? row.dollarAmount : null,
    url: row.sourceUrl || row.url || null,
    confidence: row.confidence,
    notes: row.notes,
    locked: false,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "GET" && req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  // ---- Identify the caller -- anonymous is a normal, valid request ----
  let signedIn = false;
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (token) {
    try {
      const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (!userError && userData?.user) signedIn = true;
    } catch {
      // Treat any verification failure as anonymous rather than erroring
      // the request -- this endpoint never requires sign-in.
      signedIn = false;
    }
  }

  // ---- Parse filters from either a GET query string or a POST body ----
  let filters: Filters;
  if (req.method === "GET") {
    const url = new URL(req.url);
    filters = parseFilters(Object.fromEntries(url.searchParams.entries()));
  } else {
    let body: Record<string, unknown> = {};
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      // An empty/absent body is fine -- it just means "no filters."
      body = {};
    }
    filters = parseFilters(body);
  }

  try {
    const [spec, citations] = await Promise.all([loadSpec(), loadCitations()]);
    const claimMeta = buildClaimMeta(spec);
    const allRows = flattenCitations(citations, claimMeta);
    const filtered = applyFilters(allRows, filters);
    const sorted = sortRows(filtered, filters.sort);

    return jsonResponse({
      total: sorted.length,
      signedIn,
      results: sorted.map((r) => toPublicRow(r, signedIn)),
    }, 200);
  } catch (err) {
    console.error("settlement-benchmarks-search: failed —", err instanceof Error ? err.message : String(err));
    return jsonResponse({ error: "Could not load benchmark data right now — try again shortly." }, 500);
  }
});
