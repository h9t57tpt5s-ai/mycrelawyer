// Market pages (2026-11-11): one page per state and per major metro with
// enough distress records to be worth a page, built from the Distress Radar
// data, so someone searching "Houston commercial foreclosures" or "Florida
// CMBS defaults" lands on a page of real, current records.
//
//   deno run --allow-read --allow-write scripts/build_market_pages.ts
//
// Reads js/radar-data.json (scripts/build_distress_radar.ts) and the
// tracker (js/data-lite.js). Writes markets/<slug>.html, markets.html (the
// index) and the "Browse by market" list on distress-radar.html. A place
// gets a page only with MIN_RECORDS records from the last 12 months; pages
// for places that fall below it are removed. Bankruptcy and federal suits
// have no street address, so a metro counts them by federal district and the
// page says which district that is. Every number is counted from the records.

const SITE = "https://credocket.com";
const DIR = "markets";
const MIN_RECORDS = 8;
const today = new Date().toISOString().slice(0, 10);
const ago = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

type Rec = {
  id: string; kind: string; date: string; title: string; detail: string; city: string; state: string; propertyType: string;
  amount: number | null; amountLabel: string; url: string; future?: string; source: string;
};
type Case = { id: string; title: string; category: string; date: string; addedDate?: string; state?: string; jurisdiction?: string; brief?: string; amountUsd?: number | null };

const recs: Rec[] = JSON.parse(await Deno.readTextFile("js/radar-data.json")).records;
const src = await Deno.readTextFile("js/data-lite.js");
const data = JSON.parse(src.slice(src.indexOf("const RELAW_DATA = ") + 19, src.lastIndexOf(";")));
const cases: Case[] = data.cases;
const catLabel: Record<string, string> = Object.fromEntries(data.categories.map((c: { id: string; label: string }) => [c.id, c.label]));

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "District of Columbia", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};

// Metros: the cities that count as the metro for records with a street
// address, the federal districts that hold its bankruptcies and lawsuits
// (named on the page, since a district is wider than a metro), and words that
// place a tracker matter there.
type Metro = { slug: string; name: string; state: string; cities: string[]; districts: string[]; districtNote: string; juris: RegExp };
const METROS: Metro[] = [
  { slug: "houston", name: "Houston", state: "TX", districts: ["S.D. Texas"], districtNote: "the Southern District of Texas, which includes Houston",
    cities: ["Houston", "Bellaire", "Pasadena", "Deer Park", "Sugar Land", "Humble", "Missouri City", "Katy", "Spring", "Baytown", "Pearland", "The Woodlands", "Conroe", "League City", "Tomball", "Cypress", "Stafford", "Webster", "Friendswood", "Galveston", "Richmond", "Rosenberg", "Seabrook", "La Porte", "Channelview", "Kingwood"],
    juris: /Harris County|Fort Bend County|Montgomery County, Texas|Galveston County|Houston|Southern District of Texas|S\.D\. Tex/ },
  { slug: "dallas-fort-worth", name: "Dallas–Fort Worth", state: "TX", districts: ["N.D. Texas"], districtNote: "the Northern District of Texas, which includes Dallas and Fort Worth",
    cities: ["Dallas", "Fort Worth", "Richardson", "Plano", "Allen", "Desoto", "DeSoto", "Irving", "Arlington", "Garland", "Frisco", "McKinney", "Grand Prairie", "Mesquite", "Carrollton", "Denton", "Lewisville", "Addison", "Farmers Branch", "Coppell", "Grapevine", "Euless", "Bedford", "Hurst", "Duncanville", "Cedar Hill", "Lancaster", "Rowlett", "Rockwall", "Wylie", "Prosper", "Southlake", "Mansfield", "Flower Mound", "University Park", "Highland Park"],
    juris: /Dallas|Tarrant County|Collin County|Denton County|Fort Worth|Northern District of Texas|N\.D\. Tex/ },
  { slug: "san-antonio", name: "San Antonio", state: "TX", districts: ["W.D. Texas"], districtNote: "the Western District of Texas, which includes San Antonio and Austin",
    cities: ["San Antonio", "New Braunfels", "Schertz", "Converse", "Universal City", "Boerne", "Selma", "Live Oak"],
    juris: /Bexar County|San Antonio/ },
  { slug: "austin", name: "Austin", state: "TX", districts: [], districtNote: "",
    cities: ["Austin", "Round Rock", "Cedar Park", "Georgetown", "Pflugerville", "San Marcos", "Leander", "Kyle", "Buda"],
    juris: /Travis County|Williamson County|Hays County|Austin/ },
  { slug: "new-york-city", name: "New York City", state: "NY", districts: ["S.D. New York", "E.D. New York"],
    districtNote: "the Southern and Eastern Districts of New York, which cover New York City (the Eastern District also covers Long Island)",
    cities: ["New York", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Jackson Heights", "Long Island City", "Flushing", "Astoria", "Jamaica"],
    juris: /New York County|Kings County|Queens County|Bronx County|Richmond County|Manhattan|Brooklyn|Queens|Bronx|New York City|S\.D\.N\.Y|E\.D\.N\.Y|Southern District of New York|Eastern District of New York/ },
  { slug: "atlanta", name: "Atlanta", state: "GA", districts: ["N.D. Georgia"], districtNote: "the Northern District of Georgia, which includes Atlanta",
    cities: ["Atlanta", "Marietta", "Alpharetta", "Sandy Springs", "Decatur", "Duluth", "Roswell", "Smyrna", "Norcross", "Kennesaw", "Lawrenceville", "Peachtree Corners", "Dunwoody", "Johns Creek", "Buckhead"],
    juris: /Fulton County|DeKalb County|Cobb County|Gwinnett County|Atlanta|Northern District of Georgia|N\.D\. Ga/ },
  { slug: "los-angeles", name: "Los Angeles", state: "CA", districts: ["C.D. California"], districtNote: "the Central District of California, which includes Los Angeles, Orange, Riverside, San Bernardino and Ventura counties",
    cities: ["Los Angeles", "Van Nuys", "Long Beach", "Santa Monica", "Burbank", "Glendale", "Torrance", "Irvine", "Anaheim", "Santa Ana", "Beverly Hills", "Culver City", "West Hollywood", "Inglewood", "El Segundo", "Costa Mesa", "Newport Beach", "Ontario", "Riverside", "Pasadena"],
    juris: /Los Angeles|Orange County, California|Central District of California|C\.D\. Cal/ },
  { slug: "south-florida", name: "Miami and South Florida", state: "FL", districts: ["S.D. Florida"], districtNote: "the Southern District of Florida, which includes Miami-Dade, Broward and Palm Beach counties",
    cities: ["Miami", "Miami Beach", "Fort Lauderdale", "Boca Raton", "West Palm Beach", "Hollywood", "Doral", "Hialeah", "Aventura", "Coral Gables", "Pompano Beach", "Delray Beach", "Boynton Beach", "Jupiter", "Sunrise", "Plantation", "Miramar"],
    juris: /Miami|Broward County|Palm Beach County|Southern District of Florida|S\.D\. Fla/ },
  { slug: "tampa-orlando", name: "Tampa and Orlando", state: "FL", districts: ["M.D. Florida"], districtNote: "the Middle District of Florida, which includes Tampa, Orlando and Jacksonville",
    cities: ["Tampa", "Orlando", "St. Petersburg", "Clearwater", "Altamonte Springs", "Kissimmee", "Lakeland", "Sarasota", "Jacksonville", "Brandon", "Winter Park", "Sanford"],
    juris: /Hillsborough County|Orange County, Florida|Pinellas County|Duval County|Tampa|Orlando|Jacksonville|Middle District of Florida|M\.D\. Fla/ },
  { slug: "chicago", name: "Chicago", state: "IL", districts: ["N.D. Illinois"], districtNote: "the Northern District of Illinois, which includes Chicago",
    cities: ["Chicago", "Elgin", "Naperville", "Schaumburg", "Evanston", "Oak Brook", "Aurora", "Joliet", "Rosemont", "Skokie", "Oak Park", "Cicero", "Downers Grove", "Lombard", "Itasca"],
    juris: /Cook County|DuPage County|Lake County, Illinois|Chicago|Northern District of Illinois|N\.D\. Ill/ },
];

const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const money = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
const fmt = (iso: string, year = true) => new Date(iso.slice(0, 10) + "T00:00:00Z")
  .toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const court = (r: Rec) => r.detail.split(" · ")[0].replace(/^(Bankruptcy Court|U\.S\. District Court),\s*/, "").replace(/\.$/, "");
const sum = (rs: Rec[]) => rs.reduce((s, r) => s + (r.amount || 0), 0);
const added = (c: Case) => c.addedDate || c.date;

type Market = { slug: string; name: string; state: string; kind: "state" | "metro"; recs: Rec[]; cases: Case[]; districtNote: string; metro?: Metro };
const year = ago(365);
const recent = recs.filter((r) => r.date >= year || (r.future || "") >= today);
const markets: Market[] = [];
for (const [st, name] of Object.entries(STATE_NAMES)) {
  const rs = recent.filter((r) => r.state === st);
  const cs = cases.filter((c) => c.state === st);
  if (rs.length >= MIN_RECORDS) markets.push({ slug: slugify(name), name, state: st, kind: "state", recs: rs, cases: cs, districtNote: "" });
}
for (const m of METROS) {
  const cityKey = new Set(m.cities.map((c) => c.toLowerCase()));
  const rs = recent.filter((r) => r.state === m.state && (
    (r.city && cityKey.has(r.city.toLowerCase())) ||
    ((r.kind === "bankruptcy" || r.kind === "lawsuit") && m.districts.includes(court(r)))));
  const cs = cases.filter((c) => c.state === m.state && m.juris.test(`${c.jurisdiction || ""} ${c.title}`));
  if (rs.length >= MIN_RECORDS) markets.push({ slug: m.slug, name: m.name, state: m.state, kind: "metro", recs: rs, cases: cs, districtNote: m.districtNote, metro: m });
}

// ---------- page shell: the radar page's head, nav and footer ----------
const tpl = await Deno.readTextFile("distress-radar.html");
const absolutize = (h: string) => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
let head = absolutize(tpl.slice(0, tpl.indexOf('<main id="main-content"')));
let tail = tpl.slice(tpl.indexOf("</main>") + "</main>".length);
tail = tail.replace(/<script src="js\/data(?:-lite)?\.js"><\/script>\s*<script>[\s\S]*?<\/script>/, "")
  .replace(/<script src="js\/(glossary-tooltip|trending|search|distress-radar)\.js"><\/script>\s*/g, "");
if (/js\/data(?:-lite)?\.js/.test(tail)) throw new Error("template tail still loads the dataset");
tail = absolutize(tail);
const radarStyle = tpl.slice(tpl.indexOf("<style>"), tpl.indexOf("</style>") + 8);

function headFor(title: string, desc: string, url: string, ld: unknown) {
  return head
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, (_, p) => `${p}${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, (_, p) => `${p}${esc(title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, (_, p) => `${p}${esc(desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, (_, p) => `${p}${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, (_, p) => `${p}${esc(desc)}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, (_, p) => `${p}${url}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, (_, p) => `${p}${url}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
}

const KIND: Record<string, { label: string; color: string }> = {
  foreclosure: { label: "Foreclosure", color: "#c26a00" }, cmbs: { label: "CMBS", color: "#b3261e" }, nyc: { label: "Sale deed", color: "#d14d8b" },
  bankruptcy: { label: "Chapter 11", color: "#7a3fd1" }, litigation: { label: "Lender suit", color: "#1b2e99" }, lawsuit: { label: "Federal suit", color: "#3d7d9a" },
};
const row = (r: Rec, meta: string) => {
  const ext = /^https?:/.test(r.url);
  return `
        <li class="rf-row">
          <span class="rf-kind" style="--k:${KIND[r.kind].color}">${KIND[r.kind].label}</span>
          <div class="rf-main">
            <a class="rf-title" href="${esc(r.url)}"${ext ? ' rel="noopener" target="_blank"' : ""}>${esc(r.title)}</a>
            <div class="rf-meta">${meta}</div>
            <div class="rf-detail">${esc(r.detail)}</div>
          </div>
          <div class="rf-amt">${r.amount ? `<strong>${money(r.amount)}</strong><span>${esc(r.amountLabel)}</span>` : ""}</div>
        </li>`;
};
const place = (r: Rec) => [r.city, r.state].filter(Boolean).map(esc).join(", ");

function section(id: string, title: string, intro: string, rows: string[], more = "") {
  if (!rows.length) return "";
  return `
    <section class="mk-sec" id="${id}">
      <h2>${title}</h2>
      <p class="mk-intro">${intro}</p>
      <ul class="rf-list">${rows.join("")}
      </ul>${more}
    </section>`;
}

function pageFor(m: Market, all: Market[]) {
  const url = `${SITE}/${DIR}/${m.slug}.html`;
  const fc = m.recs.filter((r) => r.kind === "foreclosure" && (r.future || "") >= today).sort((a, b) => (a.future! < b.future! ? -1 : 1) || (b.amount || 0) - (a.amount || 0));
  const fcPast = m.recs.filter((r) => r.kind === "foreclosure" && (r.future || "") < today);
  const cm = m.recs.filter((r) => r.kind === "cmbs").sort((a, b) => (b.amount || 0) - (a.amount || 0));
  const ny = m.recs.filter((r) => r.kind === "nyc");
  const ch = m.recs.filter((r) => r.kind === "bankruptcy").sort((a, b) => (b.date > a.date ? 1 : -1));
  const ch90 = ch.filter((r) => r.date >= ago(90));
  const fs = m.recs.filter((r) => r.kind === "lawsuit").sort((a, b) => (b.date > a.date ? 1 : -1));
  const ls = m.recs.filter((r) => r.kind === "litigation").sort((a, b) => (b.date > a.date ? 1 : -1));
  const mattersShown = m.cases.filter((c) => c.category !== "lending-foreclosure").sort((a, b) => (added(b) > added(a) ? 1 : -1)).slice(0, 10);
  const where = m.kind === "metro" ? `the ${m.name} area` : m.name;
  const stateName = STATE_NAMES[m.state];

  const facts: string[] = [];
  if (fc.length) facts.push(`${plural(fc.length, "commercial property", "commercial properties")} posted for upcoming foreclosure sales${sum(fc) ? ` (${money(sum(fc))} in original loan amounts stated)` : ""}`);
  if (cm.length) facts.push(`${plural(cm.length, "CMBS loan")} reported in foreclosure, bank-owned or in bankruptcy${sum(cm) ? ` (${money(sum(cm))} in balances)` : ""}`);
  if (ny.length) facts.push(`${plural(ny.length, "court-ordered sale deed")} on commercial property`);
  if (ch90.length) facts.push(`${plural(ch90.length, "real estate Chapter 11 petition")} in the last 90 days`);
  if (fs.length) facts.push(`${plural(fs.length, "federal lawsuit")} naming commercial real estate businesses`);
  if (ls.length) facts.push(`${plural(ls.length, "lender suit or foreclosure case", "lender suits and foreclosure cases")} on the tracker`);
  const factLine = facts.length > 1 ? facts.slice(0, -1).join("; ") + "; and " + facts[facts.length - 1] : facts[0] || "";

  const title = `${m.name} Commercial Real Estate Distress: Foreclosures, CMBS Defaults and Bankruptcies — CREdocket`;
  const desc = `${m.name} commercial real estate distress as of ${fmt(today)}: ${facts.slice(0, 3).join("; ")}. Each record linked to its source, updated daily, with free email alerts.`;
  const crumbs = [{ name: "Distress Radar", item: `${SITE}/distress-radar.html` }, { name: "Markets", item: `${SITE}/markets.html` }];
  const parentState = m.kind === "metro" ? all.find((x) => x.kind === "state" && x.state === m.state) : undefined;
  if (parentState) crumbs.push({ name: parentState.name, item: `${SITE}/${DIR}/${parentState.slug}.html` });
  crumbs.push({ name: m.name, item: url });
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "WebPage", name: `${m.name} commercial real estate distress`, description: desc, url, dateModified: today,
      about: { "@type": "Place", name: m.kind === "metro" ? `${m.name}, ${stateName}` : stateName }, publisher: { "@type": "Organization", name: "CREdocket", url: SITE } },
    { "@type": "BreadcrumbList", itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: c.item })) },
  ] };

  const tiles = [
    fc.length ? { n: fc.length, l: "properties posted for upcoming foreclosure sales", a: sum(fc) ? `${money(sum(fc))} original loans` : "", href: "#foreclosures" } : null,
    cm.length ? { n: cm.length, l: "CMBS loans in foreclosure, REO or bankruptcy", a: sum(cm) ? `${money(sum(cm))} balances` : "", href: "#cmbs" } : null,
    ny.length ? { n: ny.length, l: "court-ordered sale deeds (NYC register)", a: sum(ny) ? `${money(sum(ny))} on the deeds` : "", href: "#sale-deeds" } : null,
    ch.length ? { n: ch90.length, l: "real estate Chapter 11 petitions, last 90 days", a: m.kind === "metro" ? m.metro!.districts.join(" and ") : "federal courts", href: "#bankruptcies" } : null,
    fs.length ? { n: fs.length, l: "federal CRE lawsuits", a: "last 12 months on file", href: "#lawsuits" } : null,
    ls.length ? { n: ls.length, l: "lender suits on the tracker", a: "", href: "#lender-suits" } : null,
  ].filter(Boolean) as { n: number; l: string; a: string; href: string }[];

  const sizeOf = (r: Rec) => (r.detail.match(/(\d[\d,]* (?:units|sq ft))/) || [])[1] || "";
  const sections = [
    section("foreclosures", "Upcoming foreclosure sales", `Commercial properties ${m.state === "TX" ? "posted with the county clerk for a trustee's sale (Texas sales are held on the first Tuesday of the month; a posted sale can be postponed or called off)" : "posted for sale"}, soonest first.`,
      fc.map((r) => row(r, `${place(r)}${r.propertyType ? " · " + esc(r.propertyType) : ""} · <strong class="rf-soon">sale ${fmt(r.future!)}</strong>${sizeOf(r) ? " · " + esc(sizeOf(r)) : ""}`)),
      fcPast.length ? `<p class="mk-intro">Plus ${plural(fcPast.length, "earlier posting")} for sales already held or passed, on <a href="/texas-foreclosures.html">Texas Foreclosure Sales</a>.</p>` : ""),
    section("cmbs", "CMBS loans in trouble", "Loans in commercial mortgage-backed securities trusts that the servicer reports in foreclosure, bank-owned (REO) or with the borrower in bankruptcy, from the trusts' monthly filings with the SEC. Largest balance first.",
      cm.slice(0, 25).map((r) => row(r, `${place(r)}${r.propertyType ? " · " + esc(r.propertyType) : ""} · reported ${fmt(r.date)}`))),
    section("sale-deeds", "Court-ordered sale deeds", "Referee's deeds recorded with the New York City Register after a court-ordered sale of commercial property, usually the end of a foreclosure. The public copy of the register runs about two weeks behind.",
      ny.map((r) => row(r, `${place(r)}${r.propertyType ? " · " + esc(r.propertyType) : ""} · recorded ${fmt(r.date)}`))),
    section("bankruptcies", "Real estate Chapter 11 petitions", m.kind === "metro" ? `Petitions by real estate businesses in ${esc(m.districtNote)}, newest first.` : `Petitions by real estate businesses in the federal bankruptcy courts in ${esc(stateName)}, newest first.`,
      ch.slice(0, 25).map((r) => row(r, `Filed ${fmt(r.date)}`)), ch.length > 25 ? `<p class="mk-intro">${plural(ch.length - 25, "earlier petition")} on <a href="/bankruptcy-watch.html">Chapter 11 Watch</a>.</p>` : ""),
    section("lawsuits", "Federal lawsuits naming CRE businesses", m.kind === "metro" ? `New federal civil cases in ${esc(m.districtNote)} between businesses that name a commercial real estate company, or that concern real property foreclosure or a lease.` : `New federal civil cases in ${esc(stateName)} between businesses that name a commercial real estate company, or that concern real property foreclosure or a lease.`,
      fs.slice(0, 15).map((r) => row(r, `Filed ${fmt(r.date)}`))),
    section("lender-suits", "Lender suits and foreclosure cases on the tracker", "CREdocket write-ups of commercial lending and foreclosure litigation, with the parties, the amounts at stake and what happened.",
      ls.slice(0, 15).map((r) => row(r, `${fmt(r.date)}${r.propertyType ? " · " + esc(r.propertyType) : ""}`))),
  ].join("");

  const matterList = mattersShown.length ? `
    <section class="mk-sec" id="litigation">
      <h2>Other commercial real estate litigation in ${esc(where)}</h2>
      <ul class="mk-matters">${mattersShown.map((c) => `
        <li><a href="/matters/${esc(c.id)}.html">${esc(c.title)}</a><span>${esc(catLabel[c.category] || c.category)} · ${esc(c.jurisdiction || "")} · ${fmt(c.date)}</span></li>`).join("")}
      </ul>
      <p class="mk-intro"><a href="/litigation.html?state=${m.state}">All ${esc(stateName)} matters on the tracker</a></p>
    </section>` : "";

  const others = all.filter((x) => x.slug !== m.slug).sort((a, b) => (a.state === m.state ? 0 : 1) - (b.state === m.state ? 0 : 1) || b.recs.length - a.recs.length);
  const radarLink = `/distress-radar.html?state=${m.state}`;
  const main = `<main id="main-content" tabindex="-1">
${radarStyle}
<style>
  .mk-crumbs { font: 500 12.5px var(--font-body); color: var(--text-muted); }
  .mk-crumbs a { color: var(--text-muted); }
  .mk-sec { margin-top: 44px; }
  .mk-sec h2 { font: 600 clamp(1.4rem, 2.4vw, 1.8rem)/1.2 var(--font-display); margin: 0 0 6px; }
  .mk-intro { color: var(--text-secondary); max-width: 74ch; margin: 0 0 6px; font-size: 14.5px; }
  .mk-matters { list-style: none; padding: 0; margin: 10px 0; }
  .mk-matters li { padding: 12px 0; border-bottom: 1px solid var(--border-soft); }
  .mk-matters a { font: 600 15.5px/1.35 var(--font-display); color: var(--text-primary); text-decoration: none; }
  .mk-matters a:hover { color: var(--accent); text-decoration: underline; }
  .mk-matters span { display: block; font-size: 12.5px; color: var(--text-muted); margin-top: 3px; }
  .mk-others { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .mk-others a { padding: 7px 12px; border: 1px solid var(--border); border-radius: 999px; font-size: 13.5px; color: var(--text-primary); text-decoration: none; background: var(--surface); }
  .mk-others a:hover { border-color: var(--accent); color: var(--accent); }
  a.rt-tile { text-decoration: none; }
</style>
<header class="radar-hero">
  <div class="container">
    <nav class="mk-crumbs" aria-label="Breadcrumb"><a href="/distress-radar.html">Distress Radar</a> › <a href="/markets.html">Markets</a>${parentState ? ` › <a href="/${DIR}/${parentState.slug}.html">${esc(parentState.name)}</a>` : ""} › ${esc(m.name)}</nav>
    <div class="radar-live mt-16">Updated ${fmt(today)}</div>
    <h1 class="mt-16">${esc(m.name)} commercial real estate distress</h1>
    <p class="lede mt-16">In ${esc(where)}, CREdocket's records show ${esc(factLine)}. They come from county foreclosure notices, CMBS trust filings with the SEC, federal court dockets${m.state === "NY" ? ", the New York City Register" : ""} and the CREdocket tracker, and are updated every day. Records are counted from the last 12 months; each links to its own page and source.</p>
    <div class="rt-grid">
${tiles.map((t) => `      <a class="rt-tile is-on" href="${t.href}"><span class="rt-n">${t.n.toLocaleString("en-US")}</span><span class="rt-l">${esc(t.l)}</span><span class="rt-a">${esc(t.a) || "&nbsp;"}</span></a>`).join("\n")}
    </div>
  </div>
</header>
<section class="radar-body">
  <div class="container">
${sections}
${matterList}
    <div class="radar-alert" id="alerts" style="margin-top:48px;">
      <div>
        <h2>Get ${esc(stateName)} distress alerts.</h2>
        <p>An email the day a new foreclosure posting, CMBS default, bankruptcy or lender suit lands in ${esc(stateName)}, plus the weekly CRE Distress Brief. Free; one click unsubscribes.</p>
      </div>
      <div><a class="btn btn-primary" href="${radarLink}#alerts" style="background:var(--redline); border-color:var(--redline);">Set up ${esc(stateName)} alerts</a> <a class="btn btn-ghost" href="${radarLink}" style="color:#fff; border-color:#2a3557;">Open the map</a></div>
    </div>
    <section class="mk-sec">
      <h2>Other markets</h2>
      <div class="mk-others">${others.map((x) => `<a href="/${DIR}/${x.slug}.html">${esc(x.name)} <span class="muted">(${x.recs.length})</span></a>`).join("")}</div>
    </section>
    <p class="radar-sources"><strong>About these records.</strong> A foreclosure posting is a notice that a sale may happen, not that it did. A lawsuit is an allegation, and a Chapter 11 petition does not mean a property will be lost. Loan figures are the amounts stated in each record (CMBS balance at the last report, original loan amount in a notice), never estimates. Federal bankruptcies and lawsuits are placed by the federal district that holds them. Individuals are never listed. Full sources on the <a href="/distress-radar.html">Distress Radar</a>.</p>
  </div>
</section>
</main>`;
  return headFor(title, desc, url, ld) + main + tail;
}

await Deno.mkdir(DIR, { recursive: true });
const keep = new Set<string>();
for (const m of markets) {
  const f = `${DIR}/${m.slug}.html`;
  keep.add(f);
  await Deno.writeTextFile(f, pageFor(m, markets));
}
let removed = 0;
for await (const e of Deno.readDir(DIR)) {
  if (e.isFile && e.name.endsWith(".html") && !keep.has(`${DIR}/${e.name}`)) { await Deno.remove(`${DIR}/${e.name}`); removed++; }
}

// ---------- markets.html (index) ----------
const states = markets.filter((m) => m.kind === "state").sort((a, b) => b.recs.length - a.recs.length);
const metros = markets.filter((m) => m.kind === "metro").sort((a, b) => b.recs.length - a.recs.length);
const card = (m: Market) => {
  const fc = m.recs.filter((r) => r.kind === "foreclosure" && (r.future || "") >= today).length;
  const cm = m.recs.filter((r) => r.kind === "cmbs").length;
  const ch = m.recs.filter((r) => r.kind === "bankruptcy" && r.date >= ago(90)).length;
  const bits = [fc ? `${fc} foreclosure posting${fc === 1 ? "" : "s"}` : "", cm ? `${cm} CMBS loan${cm === 1 ? "" : "s"}` : "", ch ? `${ch} Chapter 11 (90 days)` : ""].filter(Boolean).join(" · ");
  return `<a class="rt-tile is-on" href="/${DIR}/${m.slug}.html"><span class="rt-n">${m.recs.length}</span><span class="rt-l">${esc(m.name)}</span><span class="rt-a">${esc(bits) || "&nbsp;"}</span></a>`;
};
const idxUrl = `${SITE}/markets.html`;
const idxTitle = "Commercial Real Estate Distress by Market: Foreclosures, CMBS Defaults and Bankruptcies — CREdocket";
const idxDesc = `Commercial real estate distress by state and metro: foreclosure postings, CMBS loans in default, real estate Chapter 11 petitions and lender suits for ${markets.length} markets, updated daily.`;
const idxMain = `<main id="main-content" tabindex="-1">
${radarStyle}
<header class="radar-hero">
  <div class="container">
    <div class="radar-live">Markets · updated ${fmt(today)}</div>
    <h1 class="mt-16">Commercial real estate distress, market by market.</h1>
    <p class="lede mt-16">Every metro and state with at least ${MIN_RECORDS} distress records in the last 12 months has its own page: upcoming foreclosure sales, CMBS loans in trouble, real estate bankruptcies, lender suits and federal lawsuits, each linked to its source. The number on each card is its record count.</p>
    <h2 style="font-size:1.4rem; margin-top:32px;">Metro areas</h2>
    <div class="rt-grid">${metros.map(card).join("")}</div>
    <h2 style="font-size:1.4rem; margin-top:32px;">States</h2>
    <div class="rt-grid">${states.map(card).join("")}</div>
    <p class="radar-sources">Don't see your market? Every record is on the <a href="/distress-radar.html">Distress Radar</a>, filterable by state, and radar alerts cover every state.</p>
  </div>
</header>
</main>`;
const idxLd = { "@context": "https://schema.org", "@type": "CollectionPage", name: "Commercial real estate distress by market", url: idxUrl, description: idxDesc };
await Deno.writeTextFile("markets.html", headFor(idxTitle, idxDesc, idxUrl, idxLd) + idxMain + tail);

// ---------- "Browse by market" on the radar page ----------
const radar = await Deno.readTextFile("distress-radar.html");
const re = /<!-- markets:start -->[\s\S]*?<!-- markets:end -->/;
if (re.test(radar)) {
  const list = `<!-- markets:start -->
    <div class="radar-markets">
      <h2>Browse by market</h2>
      <p>${[...metros, ...states].map((m) => `<a href="${DIR}/${m.slug}.html">${esc(m.name)}</a>`).join(" · ")} · <a href="markets.html">All markets</a></p>
    </div>
    <!-- markets:end -->`;
  await Deno.writeTextFile("distress-radar.html", radar.replace(re, list));
}
console.log(`markets: ${metros.length} metro and ${states.length} state pages written, ${removed} removed`);
