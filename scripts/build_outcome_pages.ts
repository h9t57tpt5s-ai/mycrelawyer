// Court-outcome pages for the Case Value Calculator (2026-11-16).
//
// Jeff: "work on the calculator traffic pages." The eight "What Is a ...
// Worth?" pages (build_value_pages.ts) bring few visitors, and nobody
// searches for "Case Value Calculator". People do search for how a kind of
// dispute ends in their state. This builds, from js/opinion-outcomes.json
// (totals only; scripts/aggregate_opinion_outcomes.py):
//   - outcomes/<case-type>-<state>.html: how that case type ended in that
//     state's written court opinions, 2000 to 2026, for every slice with at
//     least MIN_CASES commercial cases;
//   - outcomes.html, the index;
//   - an "In N court opinions" block on each of the eight value pages
//     (between <!--outcomes:start--> and <!--outcomes:end-->, which
//     build_value_pages.ts writes).
// Only totals appear: no case names, parties, citations or quotes. Which
// figures are published is decided in the aggregate script (win rates are
// held back until a stronger model has re-read the cases).
//
// Run by .github/workflows/prerender.yml after build_value_pages.ts; locally:
//   deno run --allow-read --allow-write scripts/build_outcome_pages.ts

type Q = { p25: number; median: number; p75: number; n: number };
type Side = { claims: number; decided?: number; wonPct?: number; fullWinPct?: number; awardToClaim?: Q; fullRecoveryPct?: number;
  underHalfPct?: number; appealed?: number; affirmedPct?: number; finalToClaim?: Q; medianAward?: number; awardsN?: number };
type Slice = { cases: number; years: [number, number] | null; courtLevels: Record<string, number>; propertyTypes: Record<string, number>; sides: Record<string, Side> };
type Cat = Slice & { states: Record<string, Slice> };
type Data = { generated: string; minN: number; opinions: number; categories: Record<string, Cat> };

const SITE = "https://credocket.com";
const MIN_CASES = 40;
const data: Data = JSON.parse(await Deno.readTextFile("js/opinion-outcomes.json"));

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};
// Case types: URL slug, plural for titles, the value page, and claimant sides.
const CATS: Record<string, { slug: string; plural: string; value: string; sides: Record<string, string> }> = {
  "lease-disputes": { slug: "commercial-lease-disputes", plural: "Commercial Lease Disputes", value: "commercial-lease-dispute-damages",
    sides: { landlord: "Landlords' claims", tenant: "Tenants' claims" } },
  "lending-foreclosure": { slug: "commercial-loan-and-foreclosure-cases", plural: "Commercial Loan and Foreclosure Cases", value: "commercial-foreclosure-guaranty-damages",
    sides: { lender: "Lenders' claims", borrower: "Borrowers' and guarantors' claims" } },
  "eminent-domain": { slug: "condemnation-cases", plural: "Commercial Condemnation Cases", value: "condemnation-compensation",
    sides: { owner: "Property owners' compensation claims" } },
  "zoning-land-use": { slug: "zoning-and-land-use-cases", plural: "Commercial Zoning and Land-Use Cases", value: "land-use-litigation-damages",
    sides: { owner: "Owners' and developers' claims" } },
  "construction-defect": { slug: "construction-defect-cases", plural: "Commercial Construction Cases", value: "construction-defect-damages",
    sides: { owner: "Owners' defect claims", contractor: "Contractors' payment claims" } },
  "premises-liability": { slug: "premises-liability-cases", plural: "Commercial Premises Liability Cases", value: "commercial-premises-liability-damages",
    sides: { injured: "Injured people's claims" } },
  "environmental": { slug: "contamination-cases", plural: "Commercial Property Contamination Cases", value: "environmental-cleanup-cost-claims",
    sides: { owner: "Property owners' claims" } },
  "reit-securities": { slug: "reit-securities-cases", plural: "REIT Securities Cases", value: "reit-securities-claim-value", sides: {} },
};
const LEVELS: Record<string, string> = { "intermediate-appellate": "state appeals courts", supreme: "state supreme courts", "federal-district": "federal district courts",
  "federal-appeals": "federal appeals courts", trial: "state trial courts", bankruptcy: "bankruptcy courts", other: "other courts" };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const num = (n: number) => n.toLocaleString("en-US");
const money = (n?: number) => n == null ? "" : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1).replace(/\.0$/, "")} million` : `$${num(Math.round(n / 1000) * 1000)}`;
const stateSlug = (st: string) => STATE_NAMES[st].toLowerCase().replace(/[^a-z]+/g, "-");
const pageFile = (cat: string, st: string) => `outcomes/${CATS[cat].slug}-${stateSlug(st)}.html`;
// A state page needs a dollar figure; an appeal rate alone is too thin a page.
const hasFigures = (s: Slice) => Object.values(s.sides).some((v) => v.awardToClaim || v.medianAward);
const published = (cat: string, st: string) => {
  const s = data.categories[cat]?.states[st];
  return !!s && !!STATE_NAMES[st] && s.cases >= MIN_CASES && hasFigures(s);
};
const calcUrl = (cat: string) => `/case-valuation.html?category=${cat}#cv-form`;
const marketFile = (st: string) => `markets/${stateSlug(st)}.html`;
const exists = (f: string) => { try { Deno.statSync(f); return true; } catch { return false; } };

function courtsLine(s: Slice): string {
  const top = Object.entries(s.courtLevels).sort((a, b) => b[1] - a[1]).filter(([k]) => LEVELS[k]).slice(0, 3);
  return top.map(([k, n]) => `${num(n)} from ${LEVELS[k]}`).join(", ");
}

// The figures for one claimant side, as a card. Nothing is shown for a
// figure the aggregate script left out.
function sideCard(label: string, v: Side): string {
  const rows: string[] = [];
  if (v.awardToClaim) {
    const q = v.awardToClaim;
    rows.push(`<p><span class="oc-big">${pct(q.median)}</span> median share of the amount claimed that the court or jury awarded, across ${num(q.n)} claims where the opinion states both figures. The middle half ran from ${pct(q.p25)} to ${pct(q.p75)}.</p>`);
    if (v.fullRecoveryPct != null && v.underHalfPct != null) {
      rows.push(`<p>${v.fullRecoveryPct}% got essentially everything they asked for (95% or more); ${v.underHalfPct}% got less than half.</p>`);
    }
  }
  if (v.medianAward && v.awardsN) rows.push(`<p>Median award: <strong>${money(v.medianAward)}</strong> (${num(v.awardsN)} awards).</p>`);
  if (v.affirmedPct != null && v.appealed) {
    rows.push(`<p><span class="oc-big">${v.affirmedPct}%</span> of trial results on these claims were affirmed on appeal (${num(v.appealed)} appealed claims). The rest were reversed, modified or sent back.</p>`);
  }
  if (!rows.length) return "";
  return `<div class="card oc-side"><h3>${esc(label)}</h3>${rows.join("")}</div>`;
}

function figuresBlock(cat: string, s: Slice): string {
  const cards = Object.entries(CATS[cat].sides).map(([k, label]) => s.sides[k] ? sideCard(label, s.sides[k]) : "").filter(Boolean);
  return cards.length ? `<div class="oc-grid">${cards.join("")}</div>` : "";
}

const METHOD = (n: number) => `Source: ${num(n)} written opinions in commercial real estate cases from state and federal courts, 2000 to 2026, in CourtListener's free public archive of court decisions. Each opinion was read by Anthropic's Claude, and a dollar figure counts only if the opinion's own words state it. A re-read of 402 cases by a stronger model agreed on the case type 94% of the time and on award amounts 93% of the time. Written opinions mostly come from cases that were fought to a decision and appealed; most disputes settle without one, so these figures describe contested cases. No case is named here. Not legal advice.`;

const CSS = `<style>
  .oc-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:16px; margin-top:16px; }
  .oc-side { padding:20px 22px; }
  .oc-side h3 { font-size:1.02rem; margin:0 0 10px; }
  .oc-side p { font-size:14.5px; line-height:1.6; margin:0 0 10px; color:var(--text-secondary); }
  .oc-big { font-family:var(--font-display); font-size:1.7rem; color:var(--accent); font-variant-numeric:tabular-nums; margin-right:4px; }
  .oc-states { columns:3 200px; column-gap:24px; padding-left:18px; margin:12px 0 0; }
  .oc-states li { margin-bottom:6px; break-inside:avoid; font-size:14.5px; }
  .oc-states span { color:var(--text-muted); font-variant-numeric:tabular-nums; }
  .oc-method { font-size:13px; color:var(--text-muted); line-height:1.6; margin-top:18px; }
</style>`;

// Page shell, as in build_value_pages.ts.
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

function shell(url: string, title: string, desc: string, crumbs: [string, string][], body: string): string {
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", headline: title, description: desc, url, dateModified: data.generated,
      author: { "@type": "Organization", name: "CREdocket", url: SITE }, publisher: { "@type": "Organization", name: "CREdocket", url: SITE } },
    { "@type": "BreadcrumbList", itemListElement: crumbs.map(([name, href], i) => ({ "@type": "ListItem", position: i + 1, name, item: SITE + href })) },
  ] };
  const h = head
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} — CREdocket</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, (_, a) => `${a}${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, (_, a) => `${a}${esc(title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, (_, a) => `${a}${esc(desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, (_, a) => `${a}${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, (_, a) => `${a}${esc(desc)}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, (_, a) => `${a}${url}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, (_, a) => `${a}${url}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
  const nav = crumbs.map(([name, href], i) => i < crumbs.length - 1 ? `<a href="${href}">${esc(name)}</a><span aria-hidden="true">/</span>` : `<span>${esc(name)}</span>`).join("");
  return h + `<main id="main-content" tabindex="-1">
<header class="page-header matter-header">
  <div class="container" style="max-width:900px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb">${nav}</nav>
${body}
</main>` + tail;
}

function statePage(cat: string, st: string): { file: string; html: string } {
  const c = CATS[cat], s = data.categories[cat].states[st], name = STATE_NAMES[st];
  const file = pageFile(cat, st), url = `${SITE}/${file}`;
  const title = `How ${c.plural} End in ${name} Courts`;
  const yrs = s.years ? `${s.years[0]} to ${s.years[1]}` : "2000 to 2026";
  const lead = Object.entries(c.sides).map(([k]) => s.sides[k]?.awardToClaim).find(Boolean);
  const desc = `What ${num(s.cases)} written court opinions in ${name} ${c.plural.toLowerCase()} show${lead ? `: winners were awarded a median ${pct(lead.median)} of what they claimed` : ""}. Totals from ${yrs}, plus a free calculator for your own dispute.`;
  const others = Object.keys(data.categories).filter((k) => k !== cat && published(k, st));
  const neighbors = Object.keys(data.categories[cat].states).filter((x) => x !== st && published(cat, x))
    .sort((a, b) => data.categories[cat].states[b].cases - data.categories[cat].states[a].cases).slice(0, 8);
  const types = Object.entries(s.propertyTypes).slice(0, 4).map(([k]) => k.toLowerCase()).join(", ");
  const body = `    <h1 style="font-size:clamp(1.9rem,3.6vw,2.7rem);">${esc(title)}</h1>
    <p class="lede mt-16">${num(s.cases)} written court opinions in ${esc(name)} ${esc(c.plural.toLowerCase())} from ${yrs}: ${esc(courtsLine(s))}.${types ? ` The most common properties were ${esc(types)}.` : ""}</p>
    <p class="mt-16"><a class="btn btn-primary btn-sm" href="${calcUrl(cat)}">Estimate your own case</a></p>
  </div>
</header>
${CSS}
<section class="section-tight">
  <div class="container" style="max-width:900px;">
    <h2 class="matter-h2">What the opinions show</h2>
    ${figuresBlock(cat, s)}
    <p class="oc-method">${esc(METHOD(s.cases))}</p>

    <div class="card matter-cta" style="margin-top:32px;">
      <div class="eyebrow">Case Value Calculator · free beta</div>
      <h2 class="matter-h2">What is your ${esc(name)} case worth?</h2>
      <p class="text-secondary">Totals describe other people's cases. For your own, describe both sides' positions or upload the documents, and the calculator gives a damages range with the reasoning and the cases behind it.</p>
      <a class="btn btn-primary btn-sm" href="${calcUrl(cat)}">Open the calculator</a>
      <a class="btn btn-sm" style="margin-left:8px;" href="/${c.value}.html">How these damages are measured</a>
    </div>

    ${others.length ? `<h2 class="matter-h2" style="margin-top:36px;">Other case types in ${esc(name)}</h2>
    <ul class="oc-states">${others.map((k) => `<li><a href="/${pageFile(k, st)}">${esc(CATS[k].plural)}</a> <span>${num(data.categories[k].states[st].cases)}</span></li>`).join("")}</ul>` : ""}
    ${neighbors.length ? `<h2 class="matter-h2" style="margin-top:28px;">${esc(c.plural)} in other states</h2>
    <ul class="oc-states">${neighbors.map((x) => `<li><a href="/${pageFile(cat, x)}">${esc(STATE_NAMES[x])}</a> <span>${num(data.categories[cat].states[x].cases)}</span></li>`).join("")}</ul>` : ""}
    <p style="margin-top:24px;"><a href="/outcomes.html">All states and case types →</a>${exists(marketFile(st)) ? ` · <a href="/${marketFile(st)}">${esc(name)} filings and foreclosure postings now →</a>` : ""}</p>
  </div>
</section>
`;
  return { file, html: shell(url, title, desc, [["Case Value Calculator", "/case-valuation.html"], ["Court outcomes", "/outcomes.html"], [`${c.plural}, ${name}`, `/${file}`]], body) };
}

// State pages.
await Deno.mkdir("outcomes", { recursive: true });
const keep = new Set<string>();
for (const cat of Object.keys(CATS)) {
  for (const st of Object.keys(data.categories[cat]?.states || {})) {
    if (!published(cat, st)) continue;
    const { file, html } = statePage(cat, st);
    await Deno.writeTextFile(file, html);
    keep.add(file);
  }
}
// A slice that drops below the bar loses its page.
for (const e of Deno.readDirSync("outcomes")) {
  if (e.name.endsWith(".html") && !keep.has(`outcomes/${e.name}`)) await Deno.remove(`outcomes/${e.name}`);
}

// The index.
{
  const url = `${SITE}/outcomes.html`;
  const title = "Commercial Real Estate Court Outcomes by State";
  const desc = `How commercial lease, loan, condemnation, construction and land-use cases ended in ${num(data.opinions)} written court opinions, by state and case type. Totals only, with a free calculator for your own case.`;
  const sections = Object.entries(CATS).map(([cat, c]) => {
    const e = data.categories[cat];
    if (!e) return "";
    const sts = Object.keys(e.states).filter((st) => published(cat, st)).sort((a, b) => STATE_NAMES[a].localeCompare(STATE_NAMES[b]));
    return `<h2 class="matter-h2" style="margin-top:32px;">${esc(c.plural)} <span class="text-muted" style="font-size:.8em;">${num(e.cases)} opinions</span></h2>
    ${figuresBlock(cat, e)}
    ${sts.length ? `<ul class="oc-states">${sts.map((st) => `<li><a href="/${pageFile(cat, st)}">${esc(STATE_NAMES[st])}</a> <span>${num(e.states[st].cases)}</span></li>`).join("")}</ul>` : ""}
    <p style="margin-top:10px; font-size:14px;"><a href="/${c.value}.html">How these damages are measured</a> · <a href="${calcUrl(cat)}">Estimate your own</a></p>`;
  }).join("\n");
  const body = `    <h1 style="font-size:clamp(1.9rem,3.6vw,2.7rem);">${esc(title)}</h1>
    <p class="lede mt-16">How ${num(data.opinions)} commercial real estate cases ended in written court opinions from 2000 to 2026, by case type and state: what winners were awarded against what they claimed, and how often appeals courts kept the result.</p>
  </div>
</header>
${CSS}
<section class="section-tight">
  <div class="container" style="max-width:900px;">
    ${sections}
    <p class="oc-method">${esc(METHOD(data.opinions))}</p>
  </div>
</section>
`;
  await Deno.writeTextFile("outcomes.html", shell(url, title, desc, [["Case Value Calculator", "/case-valuation.html"], ["Court outcomes", "/outcomes.html"]], body));
}

// The eight value pages: an "In N court opinions" block between markers.
let patched = 0;
for (const [cat, c] of Object.entries(CATS)) {
  const f = `${c.value}.html`, e = data.categories[cat];
  if (!e || !exists(f)) continue;
  let h = await Deno.readTextFile(f);
  const a = "<!--outcomes:start-->", b = "<!--outcomes:end-->";
  if (!h.includes(a) || !h.includes(b)) continue;
  const sts = Object.keys(e.states).filter((st) => published(cat, st)).sort((x, y) => e.states[y].cases - e.states[x].cases);
  const block = `
    <h2 class="matter-h2" style="margin-top:32px;">What ${num(e.cases)} court opinions show</h2>
    ${CSS}
    ${figuresBlock(cat, e)}
    ${sts.length ? `<p class="text-secondary" style="margin-top:16px;">By state:</p>
    <ul class="oc-states">${sts.map((st) => `<li><a href="/${pageFile(cat, st)}">${esc(STATE_NAMES[st])}</a> <span>${num(e.states[st].cases)}</span></li>`).join("")}</ul>` : ""}
    <p class="oc-method">${esc(METHOD(e.cases))}</p>
    `;
  h = h.slice(0, h.indexOf(a) + a.length) + block + h.slice(h.indexOf(b));
  await Deno.writeTextFile(f, h);
  patched++;
}
console.log(`${keep.size} state outcome pages, outcomes.html, ${patched} value pages updated`);
