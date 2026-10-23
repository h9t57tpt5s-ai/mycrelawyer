// CREdocket Briefs archive: one page per completed week (2026-10-23).
//
// briefs.html promised a weekly publication but listed only the
// hand-written Issue 1 (week of September 21, 2026); the Monday email
// ("New on CREdocket", supabase/functions/newsletter) never wrote its
// issues back to the site (Jeff, 2026-10-23: "why is there only one
// update?"). This builds brief-<monday>.html for every Monday-to-Sunday
// week since Issue 1 that has ended, from the same data the email uses:
// matters added to the tracker that week (each with its one-to-two-
// sentence brief) and Market Signals dated that week. Issue 1 stays as
// written. Each issue links to the previous and next one and to every
// matter page. briefs.html's issue list is rebuilt between markers.
//
//   deno run --allow-read --allow-write scripts/build_weekly_issues.ts

const ROOT = new URL("..", import.meta.url).pathname;
const FIRST_AUTO_WEEK = "2026-09-28"; // Issue 2; Issue 1 (2026-09-21) is hand-written
const ISSUE1 = { file: "brief-2026-09-21.html", start: "2026-09-21", teaser: "Data center siting suits in Missouri and Pennsylvania; lenders move to receivers; a $24 million ground-rent reset vacated; Ohio delay damages; REIT securities rulings." };

type Case = { id: string; title: string; brief?: string; category: string; status: string; date: string; addedDate?: string; jurisdiction?: string };
type Trend = { id: string; title: string; date: string; metric?: string };

const src = await Deno.readTextFile(ROOT + "js/data.js");
// deno-lint-ignore no-explicit-any
const D: any = new Function(src + ";return RELAW_DATA;")();
const cats: Record<string, string> = Object.fromEntries(D.categories.map((c: { id: string; label: string }) => [c.id, c.label]));
const statuses: Record<string, string> = Object.fromEntries(D.statuses.map((s: { id: string; label: string }) => [s.id, s.label]));

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const plain = (s: string) => s.replace(/<[^>]+>/g, "");
const addDays = (iso: string, n: number) => new Date(Date.parse(iso + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions = { month: "long", day: "numeric", year: "numeric" }) =>
  new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
// Today in Central time: an issue is published once its Sunday has passed there.
const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10);

type Issue = { n: number; start: string; end: string; file: string; matters: Case[]; trends: Trend[] };
const issues: Issue[] = [];
for (let start = FIRST_AUTO_WEEK, n = 2; addDays(start, 7) <= today; start = addDays(start, 7), n++) {
  const end = addDays(start, 6);
  const inWeek = (d?: string) => !!d && d >= start && d <= end;
  const matters = (D.cases as Case[]).filter((c) => inWeek(c.addedDate || c.date))
    .sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
  const trends = ((D.trends || []) as Trend[]).filter((t) => inWeek(t.date)).sort((a, b) => (b.date > a.date ? 1 : -1));
  issues.push({ n, start, end, file: `brief-${start}.html`, matters, trends });
}

const range = (i: Issue) => `${fmt(i.start, { month: "long", day: "numeric" })} – ${fmt(i.end)}`;
function teaser(i: Issue): string {
  const byCat: Record<string, number> = {};
  for (const m of i.matters) byCat[m.category] = (byCat[m.category] || 0) + 1;
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3)
    .map(([c, k]) => `${k} ${(cats[c] || c).toLowerCase()}`).join(", ");
  const parts = [`${i.matters.length} new matter${i.matters.length === 1 ? "" : "s"}${top ? ` (${top})` : ""}`];
  if (i.trends.length) parts.push(`${i.trends.length} market signal${i.trends.length === 1 ? "" : "s"}`);
  return parts.join("; ") + ".";
}

const shell = await Deno.readTextFile(ROOT + ISSUE1.file);
const mainStart = shell.indexOf('<main id="main-content"');
const mainEnd = shell.indexOf("</main>") + "</main>".length;
if (mainStart < 0 || mainEnd < mainStart) throw new Error("brief-2026-09-21.html layout changed: <main> not found");

function page(i: Issue, prev: { file: string; label: string } | null, next: { file: string; label: string } | null): string {
  const title = `Briefs Issue ${i.n}: Week of ${fmt(i.start)} — CREdocket`;
  const desc = `CREdocket Briefs, Issue ${i.n} (${range(i)}): ${teaser(i)} Commercial real estate lawsuits, rulings and settlements added to the tracker that week, each with a one-line brief.`;
  const groups: Record<string, Case[]> = {};
  for (const m of i.matters) (groups[m.category] ||= []).push(m);
  const order = D.categories.map((c: { id: string }) => c.id).filter((id: string) => groups[id]);
  const body = order.map((cid: string) => `
    <h2 style="font-size:1.25rem; margin:36px 0 6px;">${esc(cats[cid] || cid)} <span class="text-muted" style="font-weight:400; font-size:0.95rem;">(${groups[cid].length})</span></h2>
    ${groups[cid].map((m) => `
    <div style="padding:16px 0; border-bottom:1px solid var(--border-soft);">
      <h3 style="font-size:1.05rem; line-height:1.4; margin:0 0 6px;"><a class="case-link" href="/matters/${esc(m.id)}.html">${plain(m.title)}</a></h3>
      ${m.brief ? `<p class="case-brief" style="margin:0 0 6px;">${esc(m.brief)}</p>` : ""}
      <div class="text-muted" style="font-size:12.5px;">${esc(statuses[m.status] || m.status)} · ${esc(m.jurisdiction || "")} · ${fmt(m.date, { month: "short", day: "numeric", year: "numeric" })}</div>
    </div>`).join("")}`).join("");
  const signals = i.trends.length ? `
    <h2 style="font-size:1.25rem; margin:40px 0 6px;">Market signals</h2>
    ${i.trends.map((t) => `
    <div style="padding:14px 0; border-bottom:1px solid var(--border-soft);">
      <h3 style="font-size:1.02rem; line-height:1.4; margin:0 0 4px;"><a class="case-link" href="/trends.html">${esc(plain(t.title))}</a></h3>
      ${t.metric ? `<div class="text-secondary" style="font-size:13.5px;">${esc(t.metric)}</div>` : ""}
    </div>`).join("")}` : "";
  const nav = `
    <div style="display:flex; justify-content:space-between; gap:16px; flex-wrap:wrap; margin-top:36px; font-size:14px;">
      <span>${prev ? `<a class="text-accent" href="${prev.file}">&larr; ${esc(prev.label)}</a>` : ""}</span>
      <span>${next ? `<a class="text-accent" href="${next.file}">${esc(next.label)} &rarr;</a>` : ""}</span>
    </div>`;
  const main = `<main id="main-content" tabindex="-1">

<header class="page-header">
  <div class="container" style="max-width:760px;">
    <div class="eyebrow reveal in-view"><a class="text-accent" href="briefs.html">CREdocket Briefs</a> · Issue ${i.n} · Week of ${fmt(i.start)}</div>
    <h1 class="reveal in-view" style="font-size:clamp(2rem,3.6vw,3rem);">${i.matters.length} new commercial real estate matter${i.matters.length === 1 ? "" : "s"}, ${range(i)}</h1>
    <p class="lede mt-16 reveal in-view">Every lawsuit, ruling and settlement added to the CREdocket tracker that week, grouped by practice area, with a one-line brief for each. Open any matter for the full write-up and its sources.</p>
  </div>
</header>

<section class="section-tight">
  <div class="container" style="max-width:760px;">
    ${i.matters.length ? body : `<p class="text-secondary">No matters were added to the tracker this week.</p>`}
    ${signals}
    ${nav}
    <div class="card" style="padding:22px; margin-top:28px;">
      <p style="font-size:14px; line-height:1.7; margin:0 0 8px;"><strong>Get it by email.</strong> The week's new matters, rulings in cases we follow and market signals, every Monday. <a class="text-accent" href="briefs.html">Subscribe free</a>.</p>
      <p class="text-muted" style="font-size:13px; margin:0;">Browse everything in the <a class="text-accent" href="litigation.html">litigation tracker</a>, or get alerts on your own tenants, borrowers and guarantors with <a class="text-accent" href="monitor.html">CREdocket Monitor</a>.</p>
    </div>
  </div>
</section>

</main>`;
  let html = shell.slice(0, mainStart) + main + shell.slice(mainEnd);
  const url = `https://credocket.com/${i.file}`;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
    .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${esc(desc)}$2`)
    .replaceAll("https://credocket.com/brief-2026-09-21.html", url);
  return html;
}

const label = (n: number, start: string) => `Issue ${n} · Week of ${fmt(start, { month: "short", day: "numeric", year: "numeric" })}`;
const all = [{ n: 1, start: ISSUE1.start, file: ISSUE1.file }, ...issues.map((i) => ({ n: i.n, start: i.start, file: i.file }))];
for (const i of issues) {
  const k = all.findIndex((x) => x.n === i.n);
  const prev = k > 0 ? { file: all[k - 1].file, label: label(all[k - 1].n, all[k - 1].start) } : null;
  const next = k < all.length - 1 ? { file: all[k + 1].file, label: label(all[k + 1].n, all[k + 1].start) } : null;
  await Deno.writeTextFile(ROOT + i.file, page(i, prev, next));
}

// briefs.html: the issue list, newest first, between markers.
const li = (href: string, n: number, start: string, text: string) =>
  `        <li style="padding:10px 0; border-bottom:1px solid var(--border-soft);"><a class="text-accent" href="${href}"><strong>Issue ${n}</strong> · Week of ${fmt(start)}</a><div class="text-muted" style="font-size:13px; margin-top:3px;">${esc(text)}</div></li>`;
const items = [...issues].reverse().map((i) => li(i.file, i.n, i.start, teaser(i)));
items.push(li(ISSUE1.file, 1, ISSUE1.start, ISSUE1.teaser));
const B = ROOT + "briefs.html";
let briefs = await Deno.readTextFile(B);
const START = "<!--issues:start-->", END = "<!--issues:end-->";
if (!briefs.includes(START)) {
  const ul = briefs.indexOf('<ul style="margin:0; padding-left:0; list-style:none; font-size:14.5px;">', briefs.indexOf(">Issues</div>"));
  const ulEnd = briefs.indexOf("</ul>", ul);
  if (ul < 0 || ulEnd < 0) throw new Error("briefs.html: issue list not found");
  const open = briefs.indexOf(">", ul) + 1;
  briefs = briefs.slice(0, open) + "\n" + START + "\n" + END + "\n      " + briefs.slice(ulEnd);
}
briefs = briefs.replace(new RegExp(`${START}[\\s\\S]*?${END}`), `${START}\n${items.join("\n")}\n${END}`);
await Deno.writeTextFile(B, briefs);
console.log(`${issues.length} weekly issue page(s): ${issues.map((i) => `${i.file} (${i.matters.length} matters, ${i.trends.length} signals)`).join(", ") || "none"}; briefs.html lists ${items.length} issues`);
