// CREdocket — weekly "New on CREdocket" newsletter (2026-10-06).
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

const AUTOMATION_SECRET = Deno.env.get("AUTOMATION_SECRET") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const OWNER_EMAIL = Deno.env.get("OPS_ALERT_EMAIL") || "jeffnovel@icloud.com";
// Set when Jeff provides it (CAN-SPAM requires a valid postal address).
const POSTAL_ADDRESS = Deno.env.get("NEWSLETTER_POSTAL_ADDRESS") || "";
const SITE = "https://credocket.com";
const FN_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/newsletter";
const UTM = "utm_source=credocket&utm_medium=email&utm_campaign=weekly-newsletter";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-automation-secret, authorization, apikey",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const redirect = (status: string) => new Response(null, { status: 302, headers: { Location: `${SITE}/newsletter.html?status=${status}` } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const plain = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const fmt = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
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

async function subscribe(emailRaw: unknown, sourceRaw: unknown) {
  const email = String(emailRaw ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ ok: false, error: "Enter a valid email address." }, 400);
  const source = String(sourceRaw ?? "site").slice(0, 60);
  const { data: row } = await db.from("newsletter_subscribers").select("*").eq("email", email).maybeSingle();
  if (row && row.status === "confirmed") return json({ ok: true, already: true });
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
      <p style="font-size:14px; line-height:1.6;">Confirm your address to get <strong>New on CREdocket</strong>, a weekly email of the commercial real estate litigation added to the tracker, rulings in cases we follow, and new market signals.</p>
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

// ---------- the issue ----------

type Case = { id: string; title: string; category: string; date: string; addedDate?: string; jurisdiction?: string; summary?: string };
type Trend = { id: string; title: string; date: string; metric?: string };

async function buildIssue() {
  const src = await (await fetch(`${SITE}/js/data-lite.js?nl=${Date.now()}`)).text();
  const start = src.indexOf("const RELAW_DATA = ") + "const RELAW_DATA = ".length;
  const data = JSON.parse(src.slice(start, src.lastIndexOf(";")));
  const cats: Record<string, string> = Object.fromEntries(data.categories.map((c: { id: string; label: string }) => [c.id, c.label]));
  const today = new Date();
  const since = (days: number) => new Date(today.getTime() - days * 864e5).toISOString().slice(0, 10);
  const matters: Case[] = data.cases.filter((c: Case) => (c.addedDate || c.date) >= since(7))
    .sort((a: Case, b: Case) => ((b.addedDate || b.date) + b.date > (a.addedDate || a.date) + a.date ? 1 : -1));
  const trends: Trend[] = (data.trends || []).filter((t: Trend) => t.date >= since(8)).sort((a: Trend, b: Trend) => (b.date > a.date ? 1 : -1));
  let rulings: { title: string; id: string; date: string; text: string; kind: string }[] = [];
  try {
    const act = await (await fetch(`${SITE}/ops/docket-activity.json?nl=${Date.now()}`)).json();
    const byId = Object.fromEntries(data.cases.map((c: Case) => [c.id, c]));
    rulings = (act.events || []).filter((e: { firstSeen: string }) => e.firstSeen >= since(7))
      .map((e: { caseIds: string[]; date: string; text: string; kind: string }) => ({ id: e.caseIds[0], title: byId[e.caseIds[0]]?.title, date: e.date, text: e.text, kind: e.kind }))
      .filter((r: { title?: string }) => r.title);
  } catch { /* court activity is optional */ }
  return { matters, trends, rulings, cats, from: since(7), to: today.toISOString().slice(0, 10) };
}

function renderIssue(issue: Awaited<ReturnType<typeof buildIssue>>, unsubscribeUrl: string) {
  const { matters, trends, rulings, cats } = issue;
  const shown = matters.slice(0, 15);
  const mLink = (id: string) => `${SITE}/matters/${encodeURIComponent(id)}.html?${UTM}`;
  const counts = [`${matters.length} new matter${matters.length === 1 ? "" : "s"}`,
    rulings.length ? `${rulings.length} ruling${rulings.length === 1 ? "" : "s"} in cases we follow` : "",
    trends.length ? `${trends.length} new market signal${trends.length === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
  const address = POSTAL_ADDRESS || "[Mailing address to be added before the first send]";
  const html = `
<div style="font-family:-apple-system,Segoe UI,sans-serif; max-width:600px; margin:0 auto; padding:24px; color:#0b0d12;">
  <p style="font-size:12px; letter-spacing:0.08em; text-transform:uppercase; color:#7c88a8; margin:0;">CREdocket · Weekly</p>
  <h1 style="font-family:Georgia,serif; font-size:26px; margin:8px 0 6px;">New on CREdocket this week</h1>
  <p style="font-size:13px; color:#3d4453; margin:0 0 22px;">${fmt(issue.from)} – ${fmt(issue.to)} · ${esc(counts)}</p>
  ${shown.map((c) => `
  <div style="padding:14px 0; border-top:1px solid #e2e5eb;">
    <p style="font-size:11px; color:#7c88a8; text-transform:uppercase; letter-spacing:0.06em; margin:0 0 4px;">${esc(cats[c.category] || c.category)}</p>
    <p style="font-family:Georgia,serif; font-size:16px; font-weight:600; margin:0 0 4px;"><a href="${mLink(c.id)}" style="color:#0b0d12; text-decoration:none;">${esc(plain(c.title))}</a></p>
    <p style="font-size:12px; color:#7c88a8; margin:0 0 6px;">${esc(c.jurisdiction || "")}${c.date ? ` · ${fmt(c.date)}` : ""}</p>
    <p style="font-size:13.5px; line-height:1.6; color:#3d4453; margin:0;">${esc(clip(plain(c.summary), 260))}</p>
  </div>`).join("")}
  ${matters.length > shown.length ? `<p style="font-size:13px; margin:12px 0 0;"><a href="${SITE}/updates.html?${UTM}" style="color:#3355ff;">See all ${matters.length} new matters</a></p>` : ""}
  ${rulings.length ? `
  <h2 style="font-family:Georgia,serif; font-size:18px; margin:30px 0 8px;">Rulings in cases we follow</h2>
  ${rulings.map((r) => `<p style="font-size:13.5px; line-height:1.55; margin:0 0 10px;"><a href="${mLink(r.id)}" style="color:#0b0d12; font-weight:600;">${esc(plain(r.title))}</a><br><span style="color:#3d4453;">${fmt(r.date)}: ${r.kind === "closed" ? "the docket shows the case closed" : esc(r.text)} (federal docket)</span></p>`).join("")}` : ""}
  ${trends.length ? `
  <h2 style="font-family:Georgia,serif; font-size:18px; margin:30px 0 8px;">Market signals</h2>
  ${trends.map((t) => `<p style="font-size:13.5px; line-height:1.55; margin:0 0 10px;"><a href="${SITE}/trends.html?${UTM}" style="color:#0b0d12; font-weight:600;">${esc(plain(t.title))}</a>${t.metric ? `<br><span style="color:#3d4453;">${esc(t.metric)}</span>` : ""}</p>`).join("")}` : ""}
  <p style="margin:28px 0;"><a href="${SITE}/litigation.html?${UTM}" style="background:#3355ff; color:#fff; padding:11px 22px; border-radius:999px; text-decoration:none; font-weight:600;">Open the tracker</a></p>
  <p style="font-size:13px; color:#3d4453; line-height:1.6; border-top:1px solid #e2e5eb; padding-top:16px;">Know someone who should see this? Forward it, or send them to <a href="${SITE}/newsletter.html?${UTM}" style="color:#3355ff;">credocket.com/newsletter.html</a>.</p>
  <p style="font-size:11.5px; color:#9aa3b5; line-height:1.6; margin-top:24px;">You're getting this because you subscribed to CREdocket's weekly email. <a href="${unsubscribeUrl}" style="color:#9aa3b5;">Unsubscribe</a> in one click.<br>CREdocket summarizes public court records and reporting. Not legal advice.<br>${esc(address)}</p>
</div>`;
  const text = [`New on CREdocket this week (${fmt(issue.from)} – ${fmt(issue.to)})`, counts, "",
    ...shown.flatMap((c) => [`${plain(c.title)}`, `${c.jurisdiction || ""} · ${fmt(c.date)}`, clip(plain(c.summary), 260), mLink(c.id), ""]),
    ...(rulings.length ? ["RULINGS IN CASES WE FOLLOW", ...rulings.map((r) => `${plain(r.title)}: ${fmt(r.date)}, ${r.kind === "closed" ? "case closed" : r.text}. ${mLink(r.id)}`), ""] : []),
    ...(trends.length ? ["MARKET SIGNALS", ...trends.map((t) => `${plain(t.title)}${t.metric ? ` (${t.metric})` : ""}`), `${SITE}/trends.html`, ""] : []),
    `Unsubscribe: ${unsubscribeUrl}`, "CREdocket summarizes public court records and reporting. Not legal advice.", address].join("\n");
  const lead = matters[0] ? clip(plain(matters[0].title).replace(/\s*\(.*\)\s*$/, ""), 60) : "";
  const subject = `New on CREdocket: ${matters.length} matter${matters.length === 1 ? "" : "s"} this week${lead ? `, including ${lead}` : ""}`;
  return { html, text, subject };
}

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
  if (body.action === "subscribe") return await subscribe(body.email, body.source);

  if (!AUTOMATION_SECRET || req.headers.get("x-automation-secret") !== AUTOMATION_SECRET) return json({ error: "Invalid automation secret" }, 401);
  if (body.action === "send-test") {
    const issue = await buildIssue();
    const { html, text, subject } = renderIssue(issue, `${SITE}/newsletter.html`);
    const ok = await sendEmail(OWNER_EMAIL, `[TEST] ${subject}`, html, text);
    return json({ sent: ok, to: OWNER_EMAIL, matters: issue.matters.length, rulings: issue.rulings.length, trends: issue.trends.length });
  }
  if (body.action === "send-weekly") return await sendWeekly(body.force === true);
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
