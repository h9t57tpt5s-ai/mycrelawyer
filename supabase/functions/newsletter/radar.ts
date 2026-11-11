// Distress Radar alerts (2026-11-11): a subscriber's radar settings (states,
// record types, property types, chosen on distress-radar.html) and the daily
// email of new radar records that match them. Records come from the site's
// js/radar-data.json; `seen` is when a record first appeared on the radar
// (scripts/build_distress_radar.ts).

export type RadarPrefs = { states: string[]; kinds: string[]; types: string[] };
export type RadarRec = {
  id: string; kind: string; date: string; seen?: string; title: string; detail: string; city: string; state: string;
  propertyType: string; amount: number | null; amountLabel: string; url: string; future?: string;
};

export const KINDS: Record<string, { label: string; color: string }> = {
  foreclosure: { label: "Foreclosure posting", color: "#c26a00" },
  cmbs: { label: "CMBS loan", color: "#b3261e" },
  nyc: { label: "NYC record", color: "#d14d8b" },
  bankruptcy: { label: "Chapter 11", color: "#7a3fd1" },
  litigation: { label: "Lender suit", color: "#1b2e99" },
  lawsuit: { label: "Federal suit", color: "#3d7d9a" },
};
const TYPES = ["Office", "Multifamily", "Retail", "Industrial", "Hospitality", "Mixed-Use", "Land/Development", "Medical Office",
  "Data Center", "Life Sciences", "Senior Living", "Self-Storage"];
const SITE = "https://credocket.com";
const UTM = "utm_source=credocket&utm_medium=email&utm_campaign=radar-alert";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`
  : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;

// Settings from the browser: only known values survive.
export function cleanPrefs(raw: unknown): RadarPrefs | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const list = (v: unknown, ok: (s: string) => boolean, max: number) =>
    (Array.isArray(v) ? v : []).map((x) => String(x)).filter(ok).slice(0, max);
  const kinds = list(r.kinds, (k) => k in KINDS, 10);
  return {
    states: list(r.states, (s) => /^[A-Z]{2}$/.test(s), 60),
    kinds: kinds.length === Object.keys(KINDS).length ? [] : kinds,
    types: list(r.propertyTypes ?? r.types, (t) => TYPES.includes(t), 12),
  };
}
// Stored in newsletter_subscribers.source (a text column capped at 60
// characters, so no schema change) as "radar:TX,NY|cf|0,3": states, one
// letter per record type, property-type indexes. Empty part = all.
const KIND_CODE: Record<string, string> = { foreclosure: "f", cmbs: "c", nyc: "n", bankruptcy: "b", litigation: "l", lawsuit: "s" };
export function encodePrefs(p: RadarPrefs) {
  const tail = `|${p.kinds.map((k) => KIND_CODE[k]).join("")}|${p.types.map((t) => TYPES.indexOf(t)).join(",")}`;
  const states: string[] = [];
  for (const st of p.states) if (6 + [...states, st].join(",").length + tail.length <= 60) states.push(st);
  return `radar:${states.join(",")}${tail}`;
}
export function decodePrefs(source: string | null): RadarPrefs | null {
  const m = source?.match(/^radar:([A-Z,]*)\|([a-z]*)\|([\d,]*)$/);
  if (!m) return null;
  const byCode = Object.fromEntries(Object.entries(KIND_CODE).map(([k, c]) => [c, k]));
  return {
    states: m[1] ? m[1].split(",") : [],
    kinds: [...m[2]].map((c) => byCode[c]).filter(Boolean),
    types: m[3] ? m[3].split(",").map((i) => TYPES[+i]).filter(Boolean) : [],
  };
}
export const matches = (p: RadarPrefs, r: RadarRec) =>
  (!p.states.length || p.states.includes(r.state)) && (!p.kinds.length || p.kinds.includes(r.kind)) &&
  (!p.types.length || p.types.includes(r.propertyType));

export function describe(p: RadarPrefs, stateNames: Record<string, string> = {}) {
  const where = p.states.length ? p.states.map((s) => stateNames[s] || s).join(", ") : "every state";
  const what = p.kinds.length ? p.kinds.map((k) => KINDS[k].label.toLowerCase() + "s").join(", ") : "every record type";
  return `${where}; ${what}${p.types.length ? `; ${p.types.join(", ").toLowerCase()} properties` : ""}`;
}

export function radarUrl(p: RadarPrefs) {
  const q = new URLSearchParams();
  if (p.kinds.length) q.set("kind", p.kinds.join(","));
  if (p.states.length === 1) q.set("state", p.states[0]);
  if (p.types.length === 1) q.set("type", p.types[0]);
  q.set("days", "7");
  return `${SITE}/distress-radar.html?${q.toString()}&${UTM}`;
}

export function renderAlert(recs: RadarRec[], p: RadarPrefs, unsubscribeUrl: string, postal: string) {
  const shown = recs.slice(0, 25);
  const total = recs.reduce((s, r) => s + (r.amount && r.kind !== "litigation" ? r.amount : 0), 0);
  const url = (u: string) => /^https?:/.test(u) ? u : `${SITE}${u}${u.includes("?") ? "&" : "?"}${UTM}`;
  const rows = shown.map((r) => `
    <tr><td style="padding:0 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e2e5eb;"><tr>
        <td width="100" valign="top" style="padding:13px 10px 13px 0;"><span style="display:inline-block;background:${KINDS[r.kind]?.color || "#3355ff"};color:#fff;font:700 10px/1 ${SANS};letter-spacing:.05em;text-transform:uppercase;padding:5px 7px;border-radius:3px;">${esc(KINDS[r.kind]?.label || r.kind)}</span></td>
        <td valign="top" style="padding:12px 0;">
          <a href="${esc(url(r.url))}" style="font:700 15px/1.35 ${SERIF};color:#0b1020;text-decoration:none;">${esc(r.title)}</a>
          <div style="font:400 12.5px/1.5 ${SANS};color:#5a6275;margin-top:3px;">${esc([[r.city, r.state].filter(Boolean).join(", "), r.propertyType, r.future ? `sale ${r.future}` : ""].filter(Boolean).join(" · "))}</div>
          <div style="font:400 12px/1.5 ${SANS};color:#8a92a6;margin-top:2px;">${esc(r.detail.slice(0, 180))}</div>
        </td>
        <td width="80" align="right" valign="top" style="padding:13px 0 13px 8px;font:700 14px/1.2 ${SERIF};color:#0b1020;">${r.amount ? money(r.amount) : ""}</td>
      </tr></table>
    </td></tr>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Distress Radar</title></head>
<body style="margin:0;padding:0;background:#eef0f5;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef0f5;"><tr><td align="center" style="padding:20px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:#fff;border-radius:12px;overflow:hidden;">
<tr><td style="background:#0b1020;padding:24px 28px;">
  <div style="font:700 12px/1 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:#ff8a7a;">● Distress Radar alert</div>
  <div style="font:700 26px/1.2 ${SERIF};color:#fff;margin-top:12px;">${recs.length} new record${recs.length === 1 ? "" : "s"} on your radar</div>
  <div style="font:400 13.5px/1.5 ${SANS};color:#b9c2da;margin-top:8px;">${esc(describe(p))}${total ? ` · ${money(total)} in stated loan amounts` : ""}</div>
</td></tr>
${rows}
${recs.length > shown.length ? `<tr><td style="padding:12px 28px 0;font:400 13px/1.5 ${SANS};color:#5a6275;">Plus ${recs.length - shown.length} more.</td></tr>` : ""}
<tr><td style="padding:22px 28px 6px;"><a href="${esc(radarUrl(p))}" style="display:inline-block;background:#3355ff;color:#fff;font:600 14px/1 ${SANS};padding:13px 20px;border-radius:6px;text-decoration:none;">Open the radar</a></td></tr>
<tr><td style="padding:18px 28px 26px;font:400 11.5px/1.6 ${SANS};color:#8a92a6;">You asked CREdocket to email you when new distress records match your radar settings. To change them, set new filters on the <a href="${SITE}/distress-radar.html?${UTM}" style="color:#8a92a6;">radar page</a> and sign up again with the same address. <a href="${unsubscribeUrl}" style="color:#8a92a6;">Unsubscribe</a> in one click. Records come from public court, county and SEC filings; a filing is an allegation, and a posted sale can be postponed or cancelled. Not legal advice.<br>${esc(postal)}</td></tr>
</table></td></tr></table></body></html>`;
  const text = [`DISTRESS RADAR: ${recs.length} new record${recs.length === 1 ? "" : "s"} (${describe(p)})`, "",
    ...shown.map((r) => `[${KINDS[r.kind]?.label || r.kind}] ${r.title}, ${[r.city, r.state].filter(Boolean).join(", ")}${r.amount ? ` · ${money(r.amount)}` : ""}\n${url(r.url)}`), "",
    `Open the radar: ${radarUrl(p)}`, `Unsubscribe: ${unsubscribeUrl}`, postal].join("\n");
  const lead = shown.find((r) => r.amount) || shown[0];
  const subject = `Distress Radar: ${recs.length} new record${recs.length === 1 ? "" : "s"}${lead ? `, including ${lead.title.slice(0, 50)}` : ""}`;
  return { html, text, subject };
}
