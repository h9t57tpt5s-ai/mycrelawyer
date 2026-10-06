// CREdocket — engagement report from public.site_events (js/track.js).
//
// POST {"action": "report", "days": 7}  -> JSON aggregates
// POST {"action": "email"}               -> emails the last 7 days (with the
//                                          prior 7 for comparison) to the owner
// Called by .github/workflows/engagement-report.yml (Mondays) and by hand.
// Auth: AUTOMATION_SECRET in x-automation-secret; fails closed.
// Reads with the service role; the table is insert-only for browsers.

import { createClient } from "npm:@supabase/supabase-js@2";

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const REPORT_EMAIL = Deno.env.get("OPS_ALERT_EMAIL") || "jeffnovel@icloud.com";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

type Ev = { created_at: string; event: string; page: string | null; case_id: string | null; detail: string | null; referrer: string | null; session: string | null };

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

async function events(fromIso: string, toIso: string): Promise<Ev[]> {
  const out: Ev[] = [];
  for (let from = 0; from < 200000; from += 1000) {
    const { data, error } = await db.from("site_events")
      .select("created_at, event, page, case_id, detail, referrer, session")
      .gte("created_at", fromIso).lt("created_at", toIso)
      .order("id").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as Ev[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const top = (m: Map<string, number>, n: number) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const bump = (m: Map<string, number>, k: string | null | undefined) => { if (k) m.set(k, (m.get(k) || 0) + 1); };

function summarize(evs: Ev[]) {
  const sessions = new Set(evs.map((e) => e.session).filter(Boolean));
  const by = (names: string[]) => new Set(evs.filter((e) => names.includes(e.event)).map((e) => e.session).filter(Boolean));
  const pages = new Map<string, number>(), refs = new Map<string, number>(), matters = new Map<string, number>(), gates = new Map<string, number>(), shares = new Map<string, number>();
  const landing = new Map<string, Ev>();
  for (const e of evs) {
    if (e.event === "page_view" || e.event === "matter_page_view") {
      bump(pages, e.page);
      if (e.session && !landing.has(e.session)) landing.set(e.session, e);
    }
    if (e.event === "matter_page_view" || e.event === "panel_open") bump(matters, e.case_id);
    if (e.event === "gate_shown") bump(gates, e.detail);
    if (e.event === "share") bump(shares, e.detail);
  }
  for (const e of landing.values()) bump(refs, e.referrer || "direct or unknown");
  const multi = [...sessions].filter((s) => evs.filter((e) => e.session === s && (e.event === "page_view" || e.event === "matter_page_view")).length > 1).length;
  return {
    sessions: sessions.size,
    pageViews: evs.filter((e) => e.event === "page_view" || e.event === "matter_page_view").length,
    sessionsWithMoreThanOnePage: multi,
    funnel: {
      viewedAMatter: by(["matter_page_view", "panel_open"]).size,
      sawSignInPrompt: by(["gate_shown"]).size,
      openedSignIn: by(["signin_open"]).size,
      signedUpOrIn: by(["signup", "signin", "magic_link_sent"]).size,
      readFullWriteUp: by(["full_read"]).size,
      clickedWatchlist: by(["watchlist_cta"]).size,
      shared: by(["share"]).size,
    },
    signUps: evs.filter((e) => e.event === "signup").length,
    searches: evs.filter((e) => e.event === "search").length,
    sourceClicks: evs.filter((e) => e.event === "source_click").length,
    byEvent: top((() => { const m = new Map<string, number>(); for (const e of evs) bump(m, e.event); return m; })(), 20),
    byDay: [...(() => { const m = new Map<string, number>(); for (const e of evs) bump(m, e.created_at.slice(0, 10)); return m; })().entries()].sort(),
    sessionsWithoutPageView: [...sessions].filter((s) => !evs.some((e) => e.session === s && (e.event === "page_view" || e.event === "matter_page_view"))).length,
    panelOpensBySession: top((() => { const m = new Map<string, number>(); for (const e of evs) if (e.event === "panel_open") bump(m, e.session); return m; })(), 5),
    panelOpenPages: top((() => { const m = new Map<string, number>(); for (const e of evs) if (e.event === "panel_open") bump(m, e.page); return m; })(), 5),
    topPages: top(pages, 10),
    landingReferrers: top(refs, 10),
    topMatters: top(matters, 10),
    signInPromptReasons: top(gates, 5),
    shareChannels: top(shares, 5),
  };
}

async function titles(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const { data } = await db.from("case_data").select("id, title").in("id", ids);
  return Object.fromEntries(((data || []) as { id: string; title: string }[]).map((r) => [r.id, r.title]));
}

function pct(a: number, b: number) { return b ? ` (${Math.round((100 * a) / b)}%)` : ""; }
function delta(a: number, b: number) { return b ? ` vs ${b} the week before` : ""; }

async function emailReport() {
  const now = new Date();
  const d7 = new Date(now.getTime() - 7 * 864e5), d14 = new Date(now.getTime() - 14 * 864e5);
  const cur = summarize(await events(d7.toISOString(), now.toISOString()));
  const prev = summarize(await events(d14.toISOString(), d7.toISOString()));
  const t = await titles(cur.topMatters.map(([id]) => id));
  const f = cur.funnel;
  const lines = [
    `CREdocket engagement, ${d7.toISOString().slice(0, 10)} to ${now.toISOString().slice(0, 10)}`,
    "",
    `Visits (tab sessions): ${cur.sessions}${delta(cur.sessions, prev.sessions)}`,
    `Page views: ${cur.pageViews}${delta(cur.pageViews, prev.pageViews)}`,
    `Visits that viewed more than one page: ${cur.sessionsWithMoreThanOnePage}${pct(cur.sessionsWithMoreThanOnePage, cur.sessions)}`,
    "",
    "FUNNEL (visits reaching each step)",
    `- Viewed a matter: ${f.viewedAMatter}${pct(f.viewedAMatter, cur.sessions)}`,
    `- Saw the sign-in prompt: ${f.sawSignInPrompt}`,
    `- Opened sign-in: ${f.openedSignIn}`,
    `- Signed up or signed in: ${f.signedUpOrIn}  (new sign-ups: ${cur.signUps})`,
    `- Read a full write-up: ${f.readFullWriteUp}`,
    `- Clicked "Create a watchlist": ${f.clickedWatchlist}`,
    `- Shared a matter: ${f.shared}`,
    "",
    "WHERE VISITS STARTED",
    ...cur.landingReferrers.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "TOP PAGES",
    ...cur.topPages.map(([k, v]) => `- ${k}: ${v}`),
    "",
    "MOST-VIEWED MATTERS",
    ...cur.topMatters.map(([k, v]) => `- ${t[k] || k} (${k}): ${v}`),
    "",
    `Searches: ${cur.searches}   Source and docket clicks: ${cur.sourceClicks}`,
    "",
    "Counts come from js/track.js: no cookies, IPs or names; a visit is one browser tab. Bots that announce themselves are excluded.",
  ];
  if (!RESEND_API_KEY) return json({ error: "RESEND_API_KEY not set" }, 500);
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "CREdocket <no-reply@credocket.com>", to: [REPORT_EMAIL], subject: `CREdocket weekly: ${cur.sessions} visits, ${f.viewedAMatter} viewed a matter, ${cur.signUps} sign-ups`, text: lines.join("\n") }),
  });
  if (!resp.ok) return json({ error: `Resend returned ${resp.status}`, detail: await resp.text().catch(() => "") }, 502);
  return json({ sent: true, current: cur, previous: prev });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!AUTOMATION_SECRET || req.headers.get("x-automation-secret") !== AUTOMATION_SECRET) return json({ error: "Invalid automation secret" }, 401);
  let body: { action?: string; days?: number } = {};
  try { body = await req.json(); } catch { /* empty body = report */ }
  try {
    if (body.action === "email") return await emailReport();
    const days = Math.min(Math.max(Number(body.days) || 7, 1), 90);
    const now = new Date();
    return json(summarize(await events(new Date(now.getTime() - days * 864e5).toISOString(), now.toISOString())));
  } catch (err) {
    return json({ error: "Could not read site_events (has the migration been run?)", detail: String(err) }, 500);
  }
});
