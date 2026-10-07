// CREdocket — "Email me when the court rules in this case" (2026-10-07).
//
// Readers add and remove follows from the browser (table docket_follows,
// RLS: own rows only). This function does the rest:
//
// Public (deploy with --no-verify-jwt so email links work):
//   GET ?unfollow=<token>        -> removes that follow, redirects back to the case page
// Automation (x-automation-secret, called by .github/workflows/docket-activity.yml):
//   POST {action:"dockets"}      -> CourtListener docket ids someone follows, so the
//                                   daily docket job checks them even when no other
//                                   list includes them
//   POST {action:"notify", events:[...]}
//                                -> emails each follower the new rulings and closings
//                                   on the dockets they follow (once per event, only
//                                   events dated on or after the follow; see
//                                   follow-logic.ts)
//
// Events come from scripts/track_dockets.py: the court's own short entry
// text from CourtListener, no filer or attorney names.
// Table: supabase/migrations/20261008_docket_follows.sql.

import { createClient } from "npm:@supabase/supabase-js@2";
import { groupByUser, validEvent, type DocketEvent, type Follow } from "./follow-logic.ts";

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const SITE = "https://credocket.com";
const FN_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/docket-follows";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-automation-secret, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (iso: string | null) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "Date not shown";
const safePath = (p: string) => /^\/(matters|chapter-11)\/[A-Za-z0-9._-]+\.html$/.test(p) ? p : "/litigation.html";

async function unfollow(token: string): Promise<Response> {
  let path = "/litigation.html";
  if (/^[0-9a-f-]{36}$/i.test(token)) {
    const { data } = await db.from("docket_follows").delete().eq("token", token).select("page_path").maybeSingle();
    if (data) path = safePath(data.page_path);
  }
  return new Response(null, { status: 302, headers: { Location: `${SITE}${path}?unfollowed=1` } });
}

async function followedDockets() {
  const ids = new Set<number>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("docket_follows").select("docket_id").range(from, from + 999);
    if (error) throw new Error(error.message);
    data.forEach((r) => ids.add(r.docket_id));
    if (data.length < 1000) break;
  }
  return [...ids].sort((a, b) => a - b);
}

function emailFor(items: { follow: Follow; events: DocketEvent[] }[]) {
  const n = items.reduce((s, i) => s + i.events.length, 0);
  const first = items[0].follow.label;
  const subject = items.length === 1
    ? `Court activity: ${first.length > 90 ? first.slice(0, 89) + "…" : first}`
    : `Court activity in ${items.length} cases you follow`;
  const kind = (e: DocketEvent) => e.kind === "closed" ? "Case closed" : "Ruling or order";
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;max-width:620px;line-height:1.5">
<p style="margin:0 0 16px">${n === 1 ? "The court entered a ruling or order" : `The court entered ${n} rulings, orders or closings`} in ${items.length === 1 ? "a case" : "cases"} you follow on CREdocket.</p>
${items.map(({ follow, events }) => `<div style="border-top:1px solid #e5e7eb;padding:14px 0">
<p style="margin:0 0 8px;font-weight:600"><a href="${SITE}${esc(safePath(follow.page_path))}" style="color:#1d4ed8;text-decoration:none">${esc(follow.label)}</a></p>
${events.map((e) => `<p style="margin:0 0 8px"><span style="color:#6b7280">${esc(fmt(e.date))} · ${kind(e)}</span><br>${e.url && /^https:\/\/(www\.)?courtlistener\.com\//.test(e.url) ? `<a href="${esc(e.url)}" style="color:#1f2937">${esc(e.text)}</a>` : esc(e.text)}</p>`).join("")}
<p style="margin:6px 0 0;font-size:12px"><a href="${FN_URL}?unfollow=${esc(follow.token)}" style="color:#6b7280">Stop following this case</a></p>
</div>`).join("")}
<p style="color:#6b7280;font-size:12px;margin-top:18px">This is the court's own short docket text, from CourtListener's federal court archive. Entries can reach it days late, and some never do, so check the docket before relying on it. CREdocket summarizes public court records; this is not legal advice. Manage the cases you follow on your <a href="${SITE}/account.html#follows" style="color:#6b7280">account page</a>.</p>
</div>`;
  const text = items.map(({ follow, events }) =>
    `${follow.label}\n${SITE}${safePath(follow.page_path)}\n` +
    events.map((e) => `- ${fmt(e.date)} (${kind(e)}): ${e.text}${e.url ? `\n  ${e.url}` : ""}`).join("\n") +
    `\nStop following: ${FN_URL}?unfollow=${follow.token}`).join("\n\n") +
    "\n\nThe court's own short docket text, via CourtListener; entries can arrive late. Not legal advice.";
  return { subject, html, text };
}

async function notify(raw: unknown) {
  const events = (Array.isArray(raw) ? raw : []).filter(validEvent).slice(0, 500);
  if (!events.length) return { ok: true, events: 0, emailsSent: 0 };
  const ids = [...new Set(events.map((e) => Number(e.docketId)))];
  const { data: follows, error } = await db.from("docket_follows").select("id, user_id, docket_id, label, page_path, token, created_at").in("docket_id", ids);
  if (error) throw new Error(error.message);
  let sent = 0, failed = 0, skipped = 0;
  for (const [userId, items] of groupByUser((follows ?? []) as Follow[], events)) {
    // Claim each (follow, event) first so a re-run never emails it twice.
    const fresh: { follow: Follow; events: DocketEvent[] }[] = [];
    for (const it of items) {
      const rows = it.events.map((e) => ({ follow_id: it.follow.id, event_key: e.key }));
      const { data: claimed, error: cErr } = await db.from("docket_follow_sends").upsert(rows, { onConflict: "follow_id,event_key", ignoreDuplicates: true }).select("event_key");
      if (cErr) { console.error(`docket-follows: claim failed: ${cErr.message}`); continue; }
      const keys = new Set((claimed ?? []).map((r) => r.event_key));
      const evs = it.events.filter((e) => keys.has(e.key));
      if (evs.length) fresh.push({ follow: it.follow, events: evs });
    }
    if (!fresh.length) { skipped++; continue; }
    const { data: u } = await db.auth.admin.getUserById(userId);
    const to = u?.user?.email;
    let ok = false;
    if (to && RESEND_API_KEY) {
      const { subject, html, text } = emailFor(fresh);
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: "CREdocket Alerts <no-reply@credocket.com>", reply_to: "admin@credocket.com", to: [to], subject, html, text }),
      });
      ok = resp.ok;
      if (!ok) console.error(`docket-follows: Resend ${resp.status}: ${await resp.text().catch(() => "")}`);
    }
    ok ? sent++ : failed++;
    for (const it of fresh) {
      await db.from("docket_follow_sends").update({ emailed: ok }).eq("follow_id", it.follow.id).in("event_key", it.events.map((e) => e.key));
    }
  }
  return { ok: failed === 0, events: events.length, followers: (follows ?? []).length, emailsSent: sent, emailsFailed: failed, alreadySent: skipped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const token = url.searchParams.get("unfollow");
  if (token && req.method === "GET") return unfollow(token);

  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);
  if (!AUTOMATION_SECRET || req.headers.get("x-automation-secret") !== AUTOMATION_SECRET) return json({ ok: false, error: "Invalid automation secret" }, 401);
  let body: { action?: string; events?: unknown };
  try { body = await req.json(); } catch { return json({ ok: false, error: "Bad JSON" }, 400); }
  try {
    if (body.action === "dockets") return json({ ok: true, dockets: await followedDockets() });
    if (body.action === "notify") return json(await notify(body.events));
  } catch (err) {
    console.error(`docket-follows: ${err}`);
    return json({ ok: false, error: String(err) }, 500);
  }
  return json({ ok: false, error: "Unknown action" }, 400);
});
