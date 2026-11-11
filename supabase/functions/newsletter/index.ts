// CREdocket — weekly newsletter, "The CRE Distress Brief" (2026-10-06; redesigned 2026-11-11, see issue.ts).
//
// Public (no secret; deploy with --no-verify-jwt so email links work):
//   POST {action:"subscribe", email, source}  -> sends a confirmation email
//   GET  ?confirm=<token>                      -> confirms, redirects to /newsletter.html
//   GET  ?unsubscribe=<token>                  -> unsubscribes, redirects
//   POST ?unsubscribe=<token>                  -> one-click unsubscribe (RFC 8058)
// Automation (x-automation-secret):
//   POST {action:"send-test"}                  -> this week's issue to the owner only
//   POST {action:"send-weekly"}                -> this week's issue to every confirmed
//                                                 subscriber who is not an account holder
//                                                 getting the weekly digest
//   POST {action:"import", emails:[...], source} -> add consenting subscribers (beehiiv export)
//
// The issue is built from what the site publishes: js/data-lite.js (matters
// added in the last 7 days, Market Signals from the last 8) and
// ops/docket-activity.json (rulings and closings first seen in the last 7
// days). Commercial email: every send needs the postal address below
// (CAN-SPAM); send-weekly refuses without it. Table:
// supabase/migrations/20261006_newsletter_subscribers.sql.

import { createClient } from "npm:@supabase/supabase-js@2";
import { cleanPrefs, decodePrefs, describe, encodePrefs, matches, type RadarRec, renderAlert } from "./radar.ts";
import { buildIssue as build, type Inputs, type Issue, renderIssue as render } from "./issue.ts";

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const OWNER_EMAIL = Deno.env.get("OPS_ALERT_EMAIL") || "jeffnovel@icloud.com";
// CAN-SPAM requires a valid postal address in every issue (Jeff, 2026-10-06).
const POSTAL_ADDRESS = Deno.env.get("NEWSLETTER_POSTAL_ADDRESS") || "CREdocket · 901 Main Street, Suite 5200, Dallas, TX 75202";
const SITE = "https://credocket.com";
const FN_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/newsletter";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-automation-secret, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const redirect = (status: string) => new Response(null, { status: 302, headers: { Location: `${SITE}/newsletter.html?status=${status}` } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sendEmail(to: string, subject: string, html: string, text: string, headers?: Record<string, string>): Promise<boolean> {
  if (!RESEND_API_KEY) return false;
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: "CREdocket <no-reply@credocket.com>", reply_to: "admin@credocket.com", to: [to], subject, html, text, headers }),
  });
  if (!resp.ok) console.error(`newsletter: Resend ${resp.status} for ${to}: ${await resp.text().catch(() => "")}`);
  return resp.ok;
}

// ---------- subscribe / confirm / unsubscribe ----------

async function subscribe(emailRaw: unknown, sourceRaw: unknown, radarRaw?: unknown) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ ok: false, error: "Enter a valid email address." }, 400);
  // Radar alert settings ride in the source field ("radar:{...}"), see radar.ts.
  const prefs = cleanPrefs(radarRaw);
  const source = prefs ? encodePrefs(prefs) : String(sourceRaw ?? "site").slice(0, 60);
  const { data: row } = await db.from("newsletter_subscribers").select("*").eq("email", email).maybeSingle();
  if (row && row.status === "confirmed") {
    if (prefs) await db.from("newsletter_subscribers").update({ source }).eq("id", row.id);
    return json({ ok: true, already: true });
  }
  // Throttle: never send more than one confirmation per address per 10 minutes.
  if (row && row.status === "pending" && row.confirmation_sent_at && Date.now() - Date.parse(row.confirmation_sent_at) < 10 * 60 * 1000) {
    return json({ ok: true });
  }
  let token: string;
  if (row) {
    const { data: upd, error } = await db.from("newsletter_subscribers")
      .update({ status: "pending", source, confirmation_sent_at: new Date().toISOString(), unsubscribed_at: null })
      .eq("id", row.id).select("token").single();
    if (error) return json({ ok: false, error: "Couldn't save your sign-up. Try again." }, 500);
    token = upd.token;
  } else {
    const { data: ins, error } = await db.from("newsletter_subscribers")
      .insert({ email, source, confirmation_sent_at: new Date().toISOString() }).select("token").single();
    if (error) return json({ ok: false, error: "Couldn't save your sign-up. Try again." }, 500);
    token = ins.token;
  }
  const link = `${FN_URL}?confirm=${token}`;
  const ok = await sendEmail(email, "Confirm your CREdocket weekly email",
    `<div style="font-family:sans-serif; max-width:520px; margin:0 auto; padding:24px; color:#0b0d12;">
      <p style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#7c88a8;">CREdocket</p>
      <h2 style="font-family:Georgia,serif;">One click to confirm</h2>
      <p style="font-size:14px; line-height:1.6;">Confirm your address to get <strong>The CRE Distress Brief</strong>, a weekly read on commercial real estate lawsuits, bankruptcies, CMBS defaults and foreclosure postings${prefs ? ", plus an email whenever a new Distress Radar record matches your settings (" + describe(prefs) + ")" : ""}.</p>
      <p style="margin:24px 0;"><a href="${link}" style="background:#3355ff; color:#fff; padding:11px 22px; border-radius:999px; text-decoration:none; font-weight:600;">Confirm my subscription</a></p>
      <p style="font-size:12px; color:#7c88a8;">If you didn't ask for this, ignore this email and you won't hear from us.</p>
    </div>`,
    `Confirm your CREdocket weekly email: ${link}\n\nIf you didn't ask for this, ignore this email.`);
  if (!ok) return json({ ok: false, error: "Couldn't send the confirmation email. Try again later." }, 502);
  return json({ ok: true });
}

async function setStatus(token: string, status: "confirmed" | "unsubscribed") {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return false;
  const patch = status === "confirmed"
    ? { status, confirmed_at: new Date().toISOString() }
    : { status, unsubscribed_at: new Date().toISOString() };
  const { data, error } = await db.from("newsletter_subscribers").update(patch).eq("token", token).select("id");
  return !error && !!data?.length;
}

// ---------- the issue (built and drawn in issue.ts) ----------

async function getJson<T>(path: string): Promise<T | undefined> {
  try {
    const r = await fetch(`${SITE}${path}?nl=${Date.now()}`);
    return r.ok ? await r.json() as T : undefined;
  } catch { return undefined; }
}

async function buildIssue() {
  const src = await (await fetch(`${SITE}/js/data-lite.js?nl=${Date.now()}`)).text();
  const start = src.indexOf("const RELAW_DATA = ") + "const RELAW_DATA = ".length;
  const data = JSON.parse(src.slice(start, src.lastIndexOf(";")));
  const [activity, ch11, fed, cmbs, tx, pulse] = await Promise.all([
    getJson<Inputs["activity"]>("/ops/docket-activity.json"), getJson<Inputs["ch11"]>("/ops/ch11-petitions.json"),
    getJson<Inputs["fed"]>("/ops/federal-suits.json"), getJson<Inputs["cmbs"]>("/ops/cmbs-distress.json"),
    getJson<Inputs["tx"]>("/ops/tx-foreclosures.json"), getJson<Inputs["pulse"]>("/ops/market-pulse.json"),
  ]);
  return build({ data, activity, ch11, fed, cmbs, tx, pulse, today: new Date() });
}

const renderIssue = (issue: Issue, unsubscribeUrl: string) => render(issue, unsubscribeUrl, POSTAL_ADDRESS);

async function accountWeeklyEmails(): Promise<Set<string>> {
  const out = new Set<string>();
  for (let page = 1; page < 50; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      const pref = (u.user_metadata as { digest_frequency?: string } | undefined)?.digest_frequency;
      if (u.email && pref !== "none" && pref !== "daily") out.add(u.email.toLowerCase());
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

async function sendWeekly(force: boolean) {
  if (!POSTAL_ADDRESS) return json({ skipped: "No postal address set yet (CAN-SPAM); nothing sent." });
  const issue = await buildIssue();
  if (!issue.matters.length) return json({ skipped: "No new matters this week; nothing sent." });
  const skip = await accountWeeklyEmails();
  const { data: subs, error } = await db.from("newsletter_subscribers").select("id, email, token, last_sent_at").eq("status", "confirmed");
  if (error) return json({ error: error.message }, 500);
  let sent = 0, skippedAccounts = 0, skippedRecent = 0, failed = 0;
  for (const s of subs || []) {
    if (skip.has(s.email)) { skippedAccounts++; continue; }
    if (!force && s.last_sent_at && Date.now() - Date.parse(s.last_sent_at) < 6 * 864e5) { skippedRecent++; continue; }
    const unsub = `${FN_URL}?unsubscribe=${s.token}`;
    const { html, text, subject } = renderIssue(issue, unsub);
    const ok = await sendEmail(s.email, subject, html, text, { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    if (ok) { sent++; await db.from("newsletter_subscribers").update({ last_sent_at: new Date().toISOString() }).eq("id", s.id); } else failed++;
    await new Promise((r) => setTimeout(r, 600)); // stay under Resend's rate limit
  }
  return json({ sent, failed, skippedAccounts, skippedRecent, matters: issue.matters.length });
}

// ---------- Distress Radar alerts ----------
// Daily: every confirmed subscriber with radar settings gets the radar
// records first seen in the last 24 hours that match them (none: no email).
// The test sends the owner the last 7 days' records, unfiltered.
async function sendRadar(test: boolean) {
  const r = await fetch(`${SITE}/js/radar-data.json?nl=${Date.now()}`);
  if (!r.ok) return json({ error: `radar data HTTP ${r.status}` }, 502);
  const recs = ((await r.json()).records || []) as RadarRec[];
  const since = new Date(Date.now() - (test ? 7 : 1) * 864e5).toISOString().slice(0, 19) + "Z";
  const fresh = recs.filter((x) => (x.seen || "") > since);
  if (test) {
    const all = { states: [], kinds: [], types: [] };
    const { html, text, subject } = renderAlert(fresh, all, `${SITE}/newsletter.html`, POSTAL_ADDRESS);
    const ok = fresh.length ? await sendEmail(OWNER_EMAIL, `[TEST] ${subject}`, html, text) : false;
    return json({ sent: ok, to: OWNER_EMAIL, records: fresh.length });
  }
  if (!fresh.length) return json({ skipped: "No new radar records in the last 24 hours." });
  const { data: subs, error } = await db.from("newsletter_subscribers").select("id, email, token, source").eq("status", "confirmed").like("source", "radar:%");
  if (error) return json({ error: error.message }, 500);
  let sent = 0, failed = 0, noMatch = 0;
  for (const s of subs || []) {
    const p = decodePrefs(s.source);
    const mine = p ? fresh.filter((x) => matches(p, x)) : [];
    if (!p || !mine.length) { noMatch++; continue; }
    const unsub = `${FN_URL}?unsubscribe=${s.token}`;
    const { html, text, subject } = renderAlert(mine, p, unsub, POSTAL_ADDRESS);
    const ok = await sendEmail(s.email, subject, html, text, { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
    ok ? sent++ : failed++;
    await new Promise((res) => setTimeout(res, 600));
  }
  return json({ fresh: fresh.length, subscribers: subs?.length || 0, sent, failed, noMatch });
}

// ---------- routing ----------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  const url = new URL(req.url);
  const confirm = url.searchParams.get("confirm"), unsubscribe = url.searchParams.get("unsubscribe");
  if (req.method === "GET" && confirm) return redirect((await setStatus(confirm, "confirmed")) ? "confirmed" : "invalid");
  if (unsubscribe && (req.method === "GET" || req.method === "POST")) {
    const ok = await setStatus(unsubscribe, "unsubscribed");
    return req.method === "GET" ? redirect(ok ? "unsubscribed" : "invalid") : json({ ok });
  }
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  if (body.action === "subscribe") return await subscribe(body.email, body.source, body.radar);

  if (!AUTOMATION_SECRET || req.headers.get("x-automation-secret") !== AUTOMATION_SECRET) return json({ error: "Invalid automation secret" }, 401);
  if (body.action === "send-test") {
    const issue = await buildIssue();
    const { html, text, subject } = renderIssue(issue, `${SITE}/newsletter.html`);
    const ok = await sendEmail(OWNER_EMAIL, `[TEST] ${subject}`, html, text);
    return json({ sent: ok, to: OWNER_EMAIL, subject, matters: issue.matters.length, insights: issue.insights.length, radar: issue.radar.length, rulings: issue.rulings.length, trends: issue.trends.length });
  }
  if (body.action === "send-weekly") return await sendWeekly(body.force === true);
  if (body.action === "send-radar") return await sendRadar(false);
  if (body.action === "send-radar-test") return await sendRadar(true);
  if (body.action === "import") {
    const emails = Array.isArray(body.emails) ? body.emails : [];
    const rows = emails.map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e))
      .map((email) => ({ email, status: "confirmed", source: String(body.source ?? "import").slice(0, 60), confirmed_at: new Date().toISOString() }));
    if (!rows.length) return json({ imported: 0 });
    const { error } = await db.from("newsletter_subscribers").upsert(rows, { onConflict: "email", ignoreDuplicates: true });
    return error ? json({ error: error.message }, 500) : json({ imported: rows.length });
  }
  return json({ error: "Unknown action" }, 400);
});
