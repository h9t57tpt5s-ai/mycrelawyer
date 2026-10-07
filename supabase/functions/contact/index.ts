// CREdocket — contact form delivery (2026-10-07).
//
// Public (deploy with --no-verify-jwt):
//   POST {name, email, org, role, message, matter, jurisdiction, page, hp, elapsedMs}
//     -> saves the message to public.contact_messages, then emails it to
//        CONTACT_TO (admin@credocket.com) with reply-to set to the sender, so
//        a reply goes straight to them.
//
// The recipient is fixed: nothing a visitor sends can choose who gets an
// email, and the sender gets no automatic reply (that would let anyone make
// the site email a stranger). Spam guards: a hidden field that people never
// fill in (hp), a minimum time on the page, length limits, and at most five
// messages an hour from one address (counted from the table; skipped if the
// table is missing). Table: supabase/migrations/20261007_contact_messages.sql.

import { createClient } from "npm:@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const CONTACT_TO = Deno.env.get("CONTACT_TO") || "admin@credocket.com";
const db = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, "Content-Type": "application/json" } });
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
// One line, no control characters, capped (subject lines and short fields).
const line = (s: unknown, n: number) => String(s ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ["Owner / Investor", "Asset or Property Manager", "Developer", "REIT / Investor Relations", "In-house Counsel", "Other"];

async function ipHash(req: Request): Promise<string> {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("credocket-contact:" + ip));
  return [...new Uint8Array(d)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed." }, 405);

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return json({ ok: false, error: "Couldn't read the form." }, 400);
  }

  // Bots: pretend success so they don't retry, but send nothing.
  if (line(b.hp, 200) || Number(b.elapsedMs ?? 0) < 3000) return json({ ok: true });

  const name = line(b.name, 120);
  const email = line(b.email, 254).toLowerCase();
  const org = line(b.org, 160);
  const role = ROLES.includes(String(b.role)) ? String(b.role) : "Other";
  const message = String(b.message ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, 5000);
  const matter = line(b.matter, 200);
  const jurisdiction = line(b.jurisdiction, 160);
  const page = line(b.page, 200);

  if (!name) return json({ ok: false, error: "Enter your name." }, 400);
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "Enter a valid email address." }, 400);
  if (message.length < 2) return json({ ok: false, error: "Enter a message." }, 400);

  const ip = await ipHash(req);
  const since = new Date(Date.now() - 3600_000).toISOString();
  const recent = await db.from("contact_messages").select("id", { count: "exact", head: true }).eq("ip_hash", ip).gte("created_at", since);
  const tableOk = !recent.error;
  if (!tableOk) console.error(`contact: table check failed: ${recent.error?.message}`);
  if (tableOk && (recent.count ?? 0) >= 5) return json({ ok: false, error: "Too many messages from this connection. Try again in an hour, or email admin@credocket.com." }, 429);

  let id: number | null = null;
  if (tableOk) {
    const ins = await db.from("contact_messages").insert({ name, email, org, role, message, matter: matter || null, jurisdiction: jurisdiction || null, page, ip_hash: ip }).select("id").single();
    if (ins.error) console.error(`contact: insert failed: ${ins.error.message}`);
    else id = ins.data.id;
  }

  const subject = matter ? `CREdocket inquiry re: ${matter}` : `CREdocket inquiry from ${name}${org ? ` (${org})` : ""}`;
  const rows: [string, string][] = [["Name", name], ["Email", email], ["Organization", org || "—"], ["Role", role]];
  if (matter) rows.push(["Matter", matter + (jurisdiction ? ` (${jurisdiction})` : "")]);
  if (page) rows.push(["Sent from", page]);
  const text = rows.map(([k, v]) => `${k}: ${v}`).join("\n") + `\n\n${message}\n\nReply to this email to answer ${name} directly.`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:14px;color:#1f2937;max-width:640px">
<table style="border-collapse:collapse;margin-bottom:16px">${rows.map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;color:#6b7280;vertical-align:top">${esc(k)}</td><td style="padding:3px 0">${esc(v)}</td></tr>`).join("")}</table>
<div style="white-space:pre-wrap;line-height:1.55;border-top:1px solid #e5e7eb;padding-top:14px">${esc(message)}</div>
<p style="color:#6b7280;font-size:12px;margin-top:20px">Reply to this email to answer ${esc(name)} directly.</p></div>`;

  let sent = false;
  if (RESEND_API_KEY) {
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "CREdocket Contact Form <no-reply@credocket.com>", reply_to: email, to: [CONTACT_TO], subject: line(subject, 200), html, text }),
    });
    sent = resp.ok;
    if (!resp.ok) console.error(`contact: Resend ${resp.status}: ${await resp.text().catch(() => "")}`);
  }
  if (id !== null) await db.from("contact_messages").update({ emailed: sent }).eq("id", id);

  // Saved but not emailed still counts as received; neither means it was lost.
  if (!sent && id === null) return json({ ok: false, error: "The message couldn't be sent. Email admin@credocket.com instead." }, 502);
  return json({ ok: true });
});
