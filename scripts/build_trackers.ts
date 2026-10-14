// Topic trackers and the monthly CRE Litigation Index (2026-10-14).
//
// Topic trackers (root pages, rebuilt from js/data.js on every change):
//   data-center-litigation-tracker.html, office-foreclosure-tracker.html,
//   cmbs-litigation-tracker.html
// Each lists every matter on the topic, newest first, with counts that are
// literally what the tracker holds. They are the pages reporters and other
// sites can cite and link to ("CREdocket tracks 22 data center lawsuits").
//
// Monthly index: litigation-index.html (hub) and litigation-index-YYYY-MM.html
// for every month from INDEX_START, counting tracker matters by event date,
// Chapter 11 Watch petitions and Federal Lawsuit Watch suits by filing date.
// The current month is labeled month to date. Counts describe what CREdocket
// tracks, never the whole market, and say so on the page.
//
// js/topic-index.json maps matter ids to their trackers so matter pages can
// link to them. Run by .github/workflows/prerender.yml before
// build_matter_pages.ts; locally:
//   deno run --allow-read --allow-write scripts/build_trackers.ts

type Party = { name: string; role: string };
type Case = {
  id: string; title: string; seoTitle?: string; category: string; status: string; date: string; addedDate?: string;
  jurisdiction: string; state?: string; summary: string; amount?: string; propertyType?: string; tags?: string[];
  parties?: Party[]; property?: { name?: string; address?: string; city?: string; state?: string } | null;
};
type Rec = { caseName: string; court: string; dateFiled: string; slug: string };

const SITE = "https://credocket.com";
const INDEX_START = "2026-09"; // first month with Chapter 11 Watch and Federal Lawsuit Watch complete
const src = await Deno.readTextFile("js/data.js");
const data = new Function(src + "; return RELAW_DATA;")() as {
  categories: { id: string; label: string; color: string }[];
  statuses: { id: string; label: string; color: string }[];
  states: Record<string, string>;
  cases: Case[];
};
const readRecs = async (f: string): Promise<Rec[]> => {
  try { return JSON.parse(await Deno.readTextFile(f)).filings; } catch { return []; }
};
const ch11 = await readRecs("ops/ch11-petitions.json");
const suits = await readRecs("ops/federal-suits.json");

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const plain = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const fmtDate = (iso?: string) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const fmtMonth = (ym: string) => new Date(ym + "-01T00:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const cat = (id: string) => data.categories.find((c) => c.id === id) ?? { id, label: id, color: "var(--accent)" };
const status = (id: string) => data.statuses.find((s) => s.id === id) ?? { id, label: id, color: "var(--text-muted)" };
const stateName = (c: Case) => (c.state && data.states[c.state]) || c.state || "";
const where = (c: Case) => [c.property?.city, c.state].filter(Boolean).join(", ") || stateName(c);
const text = (c: Case) => [c.title, c.summary, (c.tags || []).join(" "), c.propertyType || ""].join(" ");
const today = new Date().toISOString().slice(0, 10);
const lastUpdated = data.cases.map((c) => c.addedDate || c.date).sort().at(-1)!;
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

const TOPICS = [
  {
    slug: "data-center-litigation-tracker", name: "Data Center Litigation Tracker", noun: ["data center matter", "data center matters"],
    match: (c: Case) => /data cent/i.test(text(c)),
    intro: "Fights over where data centers can be built are moving into court: developers challenging local moratoriums and rezoning denials, neighbors and towns challenging approvals, and disputes over permits, noise and land covenants. Every data center matter CREdocket covers is listed here, newest first, each with a plain-English write-up.",
    extra: (cs: Case[]) => { const n = cs.filter((c) => /moratori/i.test(text(c))).length; return n ? `${plural(n, "matter")} involve a local moratorium on data centers.` : ""; },
  },
  {
    slug: "office-foreclosure-tracker", name: "Office Foreclosure & Receivership Tracker", noun: ["office lending matter", "office lending matters"],
    match: (c: Case) => c.category === "lending-foreclosure" && (c.propertyType === "Office" || /office (tower|building|campus|complex|park|property|portfolio)/i.test(c.title + " " + c.summary)),
    intro: "Lender actions against office buildings: foreclosure suits, receiverships, auctions, court-approved sales and the fights between owners, lenders and investors that come with them. Every office lending matter CREdocket covers is listed here, newest first.",
    extra: (cs: Case[]) => { const n = cs.filter((c) => /receiver/i.test(text(c))).length; return n ? `${plural(n, "matter")} involve a receiver.` : ""; },
  },
  {
    slug: "cmbs-litigation-tracker", name: "CMBS Foreclosure & Special Servicing Tracker", noun: ["CMBS matter", "CMBS matters"],
    match: (c: Case) => c.category === "lending-foreclosure" && /\bCMBS\b|special servic|pass-through|mortgage securities trust/i.test(c.title + " " + c.summary),
    intro: "Litigation over loans held in commercial mortgage-backed securities: trustee foreclosures, special servicer actions, receiverships, sales and repurchase claims. Every CMBS matter CREdocket covers is listed here, newest first.",
    extra: (_cs: Case[]) => "",
  },
];

// Page shell, as in build_matter_pages.ts.
const tpl = await Deno.readTextFile("alert-log.html");
const absolutize = (h: string) => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
const head = absolutize(tpl.slice(0, tpl.indexOf('<main id="main-content"')));
let tail = tpl.slice(tpl.indexOf("</main>") + "</main>".length);
tail = tail.replace(/<script src="js\/data(?:-lite)?\.js"><\/script>\s*<script>[\s\S]*?<\/script>/, "")
  .replace(/<script src="js\/(glossary-tooltip|trending|search)\.js"><\/script>\s*/g, "")
  .replace(/\s*<a href="alert-log\.html" class="active">/, '\n        <a href="alert-log.html">')
  .replace('<script src="js/main.js"></script>', '<script src="js/main.js"></script>\n<script src="js/newsletter-form.js"></script>');
if (/js\/data(?:-lite)?\.js/.test(tail)) throw new Error("template tail still loads the dataset");
tail = absolutize(tail);

function page(file: string, title: string, desc: string, crumb: string, body: string, ld: unknown[]): string {
  const url = `${SITE}/${file}`;
  const h = head
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} — CREdocket</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, (_, p1) => `${p1}${esc(title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, (_, p1) => `${p1}${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, (_, p1) => `${p1}${url}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, (_, p1) => `${p1}${url}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@graph": ld }).replace(/</g, "\\u003c")}</script>\n  </head>`);
  return h + `<main id="main-content" tabindex="-1">

<header class="page-header matter-header">
  <div class="container" style="max-width:1040px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb"><a href="/litigation.html">Litigation Tracker</a><span aria-hidden="true">/</span><span>${esc(crumb)}</span></nav>
${body}
  </div>
</section>

</main>` + tail;
}

const newsletter = (source: string) => `
    <div class="card matter-cta" style="margin-top:40px;">
      <div class="eyebrow">Free weekly email</div>
      <h2 class="matter-h2">New commercial real estate rulings and lawsuits, every Monday</h2>
      <form class="gate-form" data-newsletter-form data-newsletter-source="${esc(source)}" novalidate>
        <label class="sr-only" for="tracker-nl-email">Email address</label>
        <input type="email" id="tracker-nl-email" autocomplete="email" placeholder="you@company.com" />
        <button type="submit" class="btn btn-primary btn-sm">Subscribe</button>
      </form>
      <p class="gate-form-status" data-newsletter-status role="status"></p>
    </div>`;

const TABLE_CSS = `<style>
  .tracker-stats { display:flex; flex-wrap:wrap; gap:12px 28px; margin:20px 0 4px; }
  .tracker-stats div { min-width:120px; }
  .tracker-stats strong { display:block; font-family:var(--font-display); font-size:2rem; line-height:1.1; font-variant-numeric:tabular-nums; }
  .tracker-stats span { font-family:var(--font-mono); font-size:12px; letter-spacing:.06em; text-transform:uppercase; color:var(--text-muted); }
  .tracker-table-wrap { overflow-x:auto; margin-top:28px; }
  .tracker-table { width:100%; border-collapse:collapse; font-size:14.5px; min-width:720px; }
  .tracker-table th { text-align:left; font-family:var(--font-mono); font-size:11.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--text-muted); font-weight:500; padding:10px 12px; border-bottom:1px solid var(--border); }
  .tracker-table td { padding:12px; border-bottom:1px solid var(--border); vertical-align:top; }
  .tracker-table td.num, .tracker-table td.date { white-space:nowrap; font-variant-numeric:tabular-nums; }
  .tracker-table td.amt { width:20%; font-variant-numeric:tabular-nums; color:var(--text-secondary); }
  .tracker-table td.matter { width:46%; }
  .tracker-table a { font-weight:600; }
  .tracker-breakdown { display:flex; flex-wrap:wrap; gap:8px; margin-top:14px; }
  .tracker-note { font-size:13px; color:var(--text-muted); margin-top:14px; }
</style>`;

function table(cs: Case[]): string {
  return `
    <div class="tracker-table-wrap">
      <table class="tracker-table">
        <thead><tr><th>Date</th><th>Matter</th><th>Where</th><th>Status</th><th>Amount / scale</th></tr></thead>
        <tbody>${cs.map((c) => `
          <tr><td class="date">${esc(fmtDate(c.date))}</td><td class="matter"><a href="/matters/${esc(c.id)}.html">${esc(plain(c.seoTitle || c.title))}</a><div class="text-muted" style="font-size:13px; margin-top:4px;">${esc(clip(plain(c.jurisdiction), 90))}</div></td><td>${esc(where(c))}</td><td style="color:${status(c.status).color}">${esc(status(c.status).label)}</td><td class="amt">${esc(clip(plain(c.amount || ""), 70))}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

const chips = (counts: [string, number][]) => `<div class="tracker-breakdown">${counts.map(([k, n]) => `<span class="detail-tag">${esc(k)}: ${n}</span>`).join("")}</div>`;
const countBy = <T,>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, number>();
  for (const x of xs) { const k = key(x); if (k) m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

// ---- topic trackers
const topicIndex: Record<string, { slug: string; name: string }[]> = {};
const written: string[] = [];
for (const t of TOPICS) {
  const cs = data.cases.filter(t.match).sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : a.id.localeCompare(b.id)));
  for (const c of cs) (topicIndex[c.id] ||= []).push({ slug: t.slug, name: t.name });
  const states = countBy(cs, stateName);
  const statuses = countBy(cs, (c) => status(c.status).label);
  const first = cs.at(-1)?.date, last = cs[0]?.date;
  const extra = t.extra(cs);
  const lede = `CREdocket tracks ${plural(cs.length, t.noun[0], t.noun[1])}${first ? `, dated ${fmtDate(first)} to ${fmtDate(last)}` : ""}, in ${plural(states.length, "state")}.${extra ? " " + extra : ""}`;
  const desc = clip(`${lede} ${t.intro}`, 300);
  const body = `    <h1 style="font-size:clamp(1.9rem,3.6vw,2.8rem);">${esc(t.name)}</h1>
    <p class="lede mt-16">${esc(lede)}</p>
  </div>
</header>
${TABLE_CSS}
<section class="section-tight">
  <div class="container" style="max-width:1040px;">
    <p class="body-text">${esc(t.intro)}</p>
    <div class="tracker-stats">
      <div><strong>${cs.length}</strong><span>Matters</span></div>
      <div><strong>${states.length}</strong><span>States</span></div>
      <div><strong>${cs.filter((c) => c.status === "ruling" || c.status === "appeal" || c.status === "settled").length}</strong><span>Ruled, settled or on appeal</span></div>
    </div>
    ${chips(statuses)}
    ${chips(states.map(([k, n]) => [k, n]))}
    ${table(cs)}
    <p class="tracker-note">Updated ${esc(fmtDate(lastUpdated))}. Counts are the matters in CREdocket's tracker, not every case filed; we add matters as they are reported or decided. See our <a href="/methodology.html#standards">sourcing standards</a> and <a href="/corrections.html">corrections log</a>.</p>
    ${newsletter("tracker:" + t.slug)}`;
  const ld = [
    { "@type": "CollectionPage", name: t.name, description: desc, url: `${SITE}/${t.slug}.html`, dateModified: lastUpdated,
      mainEntity: { "@type": "ItemList", numberOfItems: cs.length, itemListElement: cs.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/matters/${c.id}.html`, name: clip(plain(c.seoTitle || c.title), 110) })) } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Litigation Tracker", item: `${SITE}/litigation.html` },
      { "@type": "ListItem", position: 2, name: t.name, item: `${SITE}/${t.slug}.html` }] },
  ];
  await Deno.writeTextFile(`${t.slug}.html`, page(`${t.slug}.html`, t.name, desc, "Trackers", body, ld));
  written.push(`${t.slug}.html (${cs.length})`);
}

// ---- monthly index
const months: string[] = [];
for (let m = INDEX_START; m <= today.slice(0, 7);) {
  months.push(m);
  const [y, mo] = m.split("-").map(Number);
  m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
const officeT = TOPICS[1], dcT = TOPICS[0];
type MonthStats = { ym: string; mtd: boolean; matters: Case[]; ch11: Rec[]; suits: Rec[]; office: Case[]; dc: Case[]; rulings: Case[] };
const stats: MonthStats[] = months.map((ym) => {
  const matters = data.cases.filter((c) => c.date.startsWith(ym)).sort((a, b) => (b.date > a.date ? 1 : -1));
  return { ym, mtd: ym === today.slice(0, 7), matters, ch11: ch11.filter((r) => r.dateFiled.startsWith(ym)), suits: suits.filter((r) => r.dateFiled.startsWith(ym)),
    office: matters.filter(officeT.match), dc: matters.filter(dcT.match), rulings: matters.filter((c) => c.status === "ruling" || c.status === "appeal") };
});
const courtState = (court: string) => {
  // "United States Bankruptcy Court, E.D. New York" -> "New York"
  const name = (court.split(", ").at(-1) || "").replace(/^([NSEWMC]\.)?\s*D\.\s*/, "").trim();
  return Object.values(data.states).includes(name) ? name : "";
};
const monthFile = (ym: string) => `litigation-index-${ym}.html`;

for (const s of stats) {
  const label = fmtMonth(s.ym) + (s.mtd ? " (month to date)" : "");
  const throughNote = s.mtd ? ` Through ${fmtDate(lastUpdated)}.` : "";
  const name = `CRE Litigation Index: ${label}`;
  const lede = `${plural(s.matters.length, "tracker matter")} with an event in ${fmtMonth(s.ym)}, ${plural(s.ch11.length, "commercial real estate Chapter 11 petition")} and ${plural(s.suits.length, "new federal commercial real estate lawsuit")}.${throughNote}`;
  const desc = clip(`${lede} Office lending actions, data center fights, the month's rulings and the largest amounts, from CREdocket's trackers.`, 300);
  const cats = countBy(s.matters, (c) => cat(c.category).label);
  const st = countBy(s.matters, stateName).slice(0, 10);
  const ch11States = countBy(s.ch11, (r) => courtState(r.court)).slice(0, 8);
  const list = (cs: Case[]) => cs.length ? `<ul class="matter-related">${cs.map((c) => `
      <li><a href="/matters/${esc(c.id)}.html">${esc(plain(c.seoTitle || c.title))}</a><span>${esc(fmtDate(c.date))} · ${esc(where(c))}${c.amount ? " · " + esc(clip(plain(c.amount), 60)) : ""}</span></li>`).join("")}
    </ul>` : `<p class="text-secondary">None this month.</p>`;
  const body = `    <h1 style="font-size:clamp(1.9rem,3.6vw,2.8rem);">${esc(name)}</h1>
    <p class="lede mt-16">${esc(lede)}</p>
  </div>
</header>
${TABLE_CSS}
<section class="section-tight">
  <div class="container" style="max-width:1040px;">
    <div class="tracker-stats">
      <div><strong>${s.matters.length}</strong><span>Tracker matters</span></div>
      <div><strong>${s.ch11.length}</strong><span>CRE Chapter 11 petitions</span></div>
      <div><strong>${s.suits.length}</strong><span>New federal CRE suits</span></div>
      <div><strong>${s.office.length}</strong><span>Office lending actions</span></div>
      <div><strong>${s.dc.length}</strong><span>Data center matters</span></div>
      <div><strong>${s.rulings.length}</strong><span>Rulings and appeals</span></div>
    </div>
    <p class="tracker-note">Tracker matters are counted by the date of the event (filing, ruling, settlement or sale). Chapter 11 petitions (<a href="/bankruptcy-watch.html">Chapter 11 Watch</a>) and federal suits (<a href="/lawsuit-watch.html">Federal Lawsuit Watch</a>) are counted by filing date, from federal court records via CourtListener, which receives most but not all new federal cases. These are counts of what CREdocket tracks, not of every case filed in the country.${throughNote}</p>

    <h2 class="matter-h2" style="margin-top:36px;">By practice area</h2>
    ${chips(cats)}
    <h2 class="matter-h2" style="margin-top:28px;">By state (tracker matters)</h2>
    ${chips(st)}
    ${ch11States.length ? `<h2 class="matter-h2" style="margin-top:28px;">Chapter 11 petitions by state</h2>\n    ${chips(ch11States)}` : ""}

    <h2 class="matter-h2" style="margin-top:36px;">Office foreclosures and receiverships</h2>
    ${list(s.office)}
    <h2 class="matter-h2" style="margin-top:32px;">Data center fights</h2>
    ${list(s.dc)}
    <h2 class="matter-h2" style="margin-top:32px;">Rulings and appeals</h2>
    ${list(s.rulings)}
    <h2 class="matter-h2" style="margin-top:36px;">Every tracker matter dated ${esc(fmtMonth(s.ym))}</h2>
    ${table(s.matters)}
    <p class="tracker-note" style="margin-top:24px;">Other months: ${stats.map((o) => o.ym === s.ym ? `<strong>${esc(fmtMonth(o.ym))}</strong>` : `<a href="/${monthFile(o.ym)}">${esc(fmtMonth(o.ym))}</a>`).join(" · ")} · <a href="/litigation-index.html">All months</a></p>
    ${newsletter("index:" + s.ym)}`;
  const ld = [
    { "@type": "Article", headline: name, description: desc, url: `${SITE}/${monthFile(s.ym)}`, dateModified: lastUpdated,
      author: { "@type": "Organization", name: "CREdocket", url: SITE }, publisher: { "@type": "Organization", name: "CREdocket", url: SITE } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "CRE Litigation Index", item: `${SITE}/litigation-index.html` },
      { "@type": "ListItem", position: 2, name: label, item: `${SITE}/${monthFile(s.ym)}` }] },
  ];
  await Deno.writeTextFile(monthFile(s.ym), page(monthFile(s.ym), name, desc, "CRE Litigation Index", body, ld));
  written.push(`${monthFile(s.ym)} (${s.matters.length}/${s.ch11.length}/${s.suits.length})`);
}

{
  const name = "CRE Litigation Index";
  const desc = "Monthly counts of commercial real estate litigation from CREdocket's trackers: tracker matters, CRE Chapter 11 petitions, new federal CRE lawsuits, office lending actions, data center fights and rulings.";
  const rows = [...stats].reverse().map((s) => `
          <tr><td><a href="/${monthFile(s.ym)}">${esc(fmtMonth(s.ym))}</a>${s.mtd ? ' <span class="text-muted">(to date)</span>' : ""}</td><td class="num">${s.matters.length}</td><td class="num">${s.ch11.length}</td><td class="num">${s.suits.length}</td><td class="num">${s.office.length}</td><td class="num">${s.dc.length}</td><td class="num">${s.rulings.length}</td></tr>`).join("");
  const body = `    <h1 style="font-size:clamp(1.9rem,3.6vw,2.8rem);">${name}</h1>
    <p class="lede mt-16">What CREdocket's trackers recorded each month: lawsuits, rulings, foreclosures and receiverships, Chapter 11 petitions and new federal suits involving commercial real estate.</p>
  </div>
</header>
${TABLE_CSS}
<section class="section-tight">
  <div class="container" style="max-width:1040px;">
    <div class="tracker-table-wrap">
      <table class="tracker-table" style="min-width:640px;">
        <thead><tr><th>Month</th><th>Tracker matters</th><th>CRE Chapter 11</th><th>Federal CRE suits</th><th>Office lending</th><th>Data centers</th><th>Rulings</th></tr></thead>
        <tbody>${rows}
        </tbody>
      </table>
    </div>
    <p class="tracker-note">Counts start in ${esc(fmtMonth(INDEX_START))}, the first full month of Chapter 11 Watch and Federal Lawsuit Watch. They describe what CREdocket tracks, not every case filed. Updated ${esc(fmtDate(lastUpdated))}.</p>
    <p class="body-text" style="margin-top:28px;">Topic trackers: ${TOPICS.map((t) => `<a href="/${t.slug}.html">${esc(t.name)}</a>`).join(" · ")}</p>
    ${newsletter("index:hub")}`;
  const ld = [{ "@type": "CollectionPage", name, description: desc, url: `${SITE}/litigation-index.html`, dateModified: lastUpdated }];
  await Deno.writeTextFile("litigation-index.html", page("litigation-index.html", name, desc, "CRE Litigation Index", body, ld));
}

await Deno.writeTextFile("js/topic-index.json", JSON.stringify(topicIndex, null, 1) + "\n");
console.log("written: " + written.join(", ") + ", litigation-index.html");
