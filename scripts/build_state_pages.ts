// State Court Watch pages (2026-11-05): one static page per state court
// filing in ops/state-filings.json (scripts/pull_state_filings.py) at
// state-cases/<slug>.html, and the list on state-court-watch.html.
//
// Same idea as the federal record pages (scripts/build_record_pages.ts):
// search visitors look for a specific business, so each page carries only
// what the court's own index shows (business and government parties, court,
// case number, case type, date filed, source), links to other CREdocket
// filings and write-ups naming the same parties, and nothing written about
// a party beyond the record. Pages for filings no longer listed are deleted.
//
// Run by .github/workflows/prerender.yml; locally:
//   deno run --allow-read --allow-write scripts/build_state_pages.ts
type Rec = {
  source: string; state: string; county: string; court: string; caseNumber: string; caseType: string;
  dateFiled: string; caseName: string; plaintiffs: string[]; defendants: string[];
  sourceName: string; sourceUrl: string; slug: string;
};
type Fed = { caseName: string; slug: string; dateFiled: string; court: string };
type Case = { id: string; title: string; parties?: { name: string }[] };
const SITE = "https://credocket.com";
const DIR = "state-cases", LIST = "state-court-watch.html";
const readJson = async <T>(p: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await Deno.readTextFile(p)); } catch { return fallback; }
};
const data: Rec[] = (await readJson<{ filings: Rec[] }>("ops/state-filings.json", { filings: [] })).filings
  .filter((r) => r.slug && /^[a-z0-9-]+$/.test(r.slug));
const fed = (await readJson<{ filings: Fed[] }>("ops/federal-suits.json", { filings: [] })).filings;
const ch11 = (await readJson<{ filings: Fed[] }>("ops/ch11-petitions.json", { filings: [] })).filings;
const src = await Deno.readTextFile("js/data.js");
const cases: Case[] = new Function(src + "; return RELAW_DATA;")().cases;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDate = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const longDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const plainTitle = (t: string) => t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&");
// Same normalization as build_record_pages.ts / build_matter_pages.ts partyKey.
function partyKey(name: string): string {
  let s = name.toLowerCase().replace(/&/g, "and").replace(/\(.*?\)/g, "").replace(/[.,']/g, "").replace(/\s+/g, " ").trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\s+(llc|inc|corp|corporation|co|company|lp|llp|ltd|limited|na|the)$/, "").trim();
  }
  return s.replace(/^the\s+/, "");
}
const tooCommon = /\b(bank|trust company|trustee|national association|united states|city of|county|state of|department|wells fargo|federal national mortgage|fannie mae|freddie mac|insurance)\b/i;
// "Baltimore City" is a county-level jurisdiction, not "Baltimore City County".
const place = (r: { county: string }) => /\bCity$/.test(r.county) ? r.county : `${r.county} County`;
const keysOf = (r: Rec) => [...r.plaintiffs, ...r.defendants].filter((n) => !tooCommon.test(n)).map(partyKey).filter((k) => k.length >= 4);
const sides = (name: string) => name.split(/\s+v(?:s)?\.?\s+/i).map((x) => x.replace(/,?\s+et\.?\s*al\.?,?$/i, "").trim());

// Page shell: the alert log's head, nav and footer, links absolute, dataset loader removed.
const tpl = await Deno.readTextFile("alert-log.html");
const absolutize = (h: string) => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
let head = tpl.slice(0, tpl.indexOf('<main id="main-content"'));
let tail = tpl.slice(tpl.indexOf("</main>") + "</main>".length);
tail = tail.replace(/<script src="js\/data(?:-lite)?\.js"><\/script>\s*<script>[\s\S]*?<\/script>/, "")
  .replace(/<script src="js\/(glossary-tooltip|trending|search)\.js"><\/script>\s*/g, "")
  .replace(/\s*<a href="alert-log\.html" class="active">/, '\n        <a href="alert-log.html">');
if (/js\/data(?:-lite)?\.js/.test(tail)) throw new Error("template tail still loads the dataset");
tail = tail.replace('<script src="js/main.js"></script>', '<script src="js/main.js"></script>\n<script src="js/matter-page.js"></script>');
head = absolutize(head);
tail = absolutize(tail);

const pagePath = (r: Rec) => `/${DIR}/${r.slug}.html`;
const pageUrl = (r: Rec) => SITE + pagePath(r);

function headFor(r: Rec): string {
  const title = `${r.caseName} — ${place(r)}, ${r.state} ${r.caseType.toLowerCase()} — CREdocket`;
  const desc = `${r.caseName}: a ${r.caseType.toLowerCase()} case filed in the ${r.court} on ${fmtDate(r.dateFiled)} (case no. ${r.caseNumber}). Parties, court record and related filings.`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: r.caseName, description: desc, url: pageUrl(r), datePublished: r.dateFiled,
        about: [...r.plaintiffs, ...r.defendants].map((n) => ({ "@type": "Organization", name: n })),
        publisher: { "@type": "Organization", name: "CREdocket", url: SITE } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "State Court Watch", item: `${SITE}/${LIST}` },
        { "@type": "ListItem", position: 2, name: r.caseName, item: pageUrl(r) }] },
    ],
  };
  // Replacement functions, not strings: "$170M" in a value must not be read as a backreference.
  return head
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, (_, p1) => `${p1}${esc(title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, (_, p1) => `${p1}${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta property="og:type" content=")[^"]*"/, (_, p1) => `${p1}article"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, (_, p1) => `${p1}${pageUrl(r)}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, (_, p1) => `${p1}${pageUrl(r)}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
}

const byDate = (a: Rec, b: Rec) => (b.dateFiled > a.dateFiled ? 1 : b.dateFiled < a.dateFiled ? -1 : a.caseName.localeCompare(b.caseName));
const li = (href: string, name: string, date: string, where: string) =>
  `\n          <li><a href="${esc(href)}">${esc(name)}</a><span>${esc(shortDate(date))} · ${esc(where)}</span></li>`;

function mainFor(r: Rec): string {
  const keys = new Set(keysOf(r));
  const otherState = data.filter((x) => x !== r && keysOf(x).some((k) => keys.has(k))).sort(byDate);
  const fedHits = fed.filter((x) => sides(x.caseName).some((n) => !tooCommon.test(n) && keys.has(partyKey(n))));
  const ch11Hits = ch11.filter((x) => !tooCommon.test(x.caseName) && keys.has(partyKey(x.caseName)));
  const matters = cases.filter((c) => (c.parties || []).some((p) => keys.has(partyKey(p.name))));
  const sameCourt = data.filter((x) => x !== r && x.court === r.court && !otherState.includes(x)).sort(byDate).slice(0, 6);
  const related = [
    ...otherState.map((x) => li(pagePath(x), x.caseName, x.dateFiled, `${place(x)}, ${x.state}`)),
    ...fedHits.map((x) => li(`/federal-cases/${x.slug}.html`, x.caseName, x.dateFiled, "federal court")),
    ...ch11Hits.map((x) => li(`/chapter-11/${x.slug}.html`, x.caseName, x.dateFiled, "Chapter 11")),
  ].slice(0, 10);
  const meta: [string, string][] = [
    ["Court", esc(r.court)], ["Case number", esc(r.caseNumber)], ["Filed", esc(fmtDate(r.dateFiled))],
    ["Case type", esc(r.caseType)], ["Plaintiff" + (r.plaintiffs.length > 1 ? "s" : ""), esc(r.plaintiffs.join("; "))],
    ["Defendant" + (r.defendants.length > 1 ? "s" : "") + " (businesses and governments)", esc(r.defendants.join("; "))],
  ];
  const share = encodeURIComponent(pageUrl(r));
  return `<main id="main-content" tabindex="-1">

<header class="page-header matter-header">
  <div class="container" style="max-width:860px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb"><a href="/${LIST}">State Court Watch</a><span aria-hidden="true">/</span><span>${esc(place(r))}, ${esc(r.state)}</span></nav>
    <h1 style="font-size:clamp(1.8rem,3.4vw,2.6rem);">${esc(r.caseName)}</h1>
    <div class="matter-badges">
      <span class="badge"><span class="badge-dot" style="background:var(--accent)"></span>${esc(r.caseType)}</span>
      <span class="status-pill"><span class="dot" style="background:var(--accent)"></span>Filed ${esc(shortDate(r.dateFiled))}</span>
    </div>
  </div>
</header>

<section class="section-tight">
  <div class="container" style="max-width:860px;">
    <div class="detail-meta-grid matter-meta">
      ${meta.filter(([, v]) => v).map(([l, v]) => `<div${l.startsWith("Plaintiff") || l.startsWith("Defendant") ? ' style="grid-column:1 / -1;"' : ""}><div class="label">${l}</div><div class="value">${v}</div></div>`).join("\n      ")}
    </div>

    <p class="body-text">${esc(r.caseName)} was filed in the ${esc(r.court)} on ${esc(fmtDate(r.dateFiled))}, case no. ${esc(r.caseNumber)}, as a ${esc(r.caseType.toLowerCase())} case, according to the court's own case index.</p>
    <p class="body-text">It is on CREdocket's <a href="/${LIST}">State Court Watch</a> because its case type is a real property type and the parties are businesses or governments. That is a reading of the court's index, not of the complaint; the court file says what the dispute is about. Only business and government parties are listed.</p>
    ${matters.length ? `<p class="body-text"><strong>CREdocket write-ups naming these parties:</strong> ${matters.map((c) => `<a href="/matters/${esc(c.id)}.html">${esc(plainTitle(c.title))}</a>`).join("; ")}</p>` : ""}
    <div class="matter-sources"><a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Source: ${esc(r.sourceName)} ↗</a></div>

    <div class="card matter-cta matter-one-cta">
      <div class="eyebrow">Weekly email</div>
      <h2 class="matter-h2">The CRE Distress Brief, every Monday</h2>
      <p class="text-secondary">The week's commercial real estate lawsuits, bankruptcies, CMBS defaults and foreclosure postings, with charts and what the numbers say. Free; unsubscribe in one click.</p>
      <form class="gate-form" data-newsletter-form data-newsletter-source="state:${esc(r.slug).slice(0, 60)}" novalidate>
        <label class="sr-only" for="state-nl-email">Email address</label>
        <input type="email" id="state-nl-email" autocomplete="email" placeholder="you@company.com" />
        <button type="submit" class="btn btn-primary btn-sm">Subscribe</button>
      </form>
      <p class="gate-form-status" data-newsletter-status role="status"></p>
      <p class="matter-cta-foot">Want an email when one of your own tenants, borrowers or guarantors is sued? <a href="/account.html#portfolio">Add it to your portfolio</a>. Facing a dispute like this one? <a href="/case-valuation.html#cv-form">Estimate its value</a>.</p>
    </div>

    <div class="matter-share">
      <span class="label">Share</span>
      <button type="button" class="btn btn-ghost btn-sm" id="matter-copy" data-url="${esc(pageUrl(r))}">Copy link</button>
      <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
      <a class="btn btn-ghost btn-sm" href="mailto:?subject=${encodeURIComponent(r.caseName)}&amp;body=${share}">Email</a>
    </div>

    ${related.length ? `<h2 class="matter-h2" style="margin-top:40px;">Other filings naming these parties</h2>
    <ul class="matter-related">${related.join("")}
    </ul>` : ""}
    ${sameCourt.length ? `<h2 class="matter-h2" style="margin-top:32px;">Other recent filings in ${esc(place(r))}</h2>
    <ul class="matter-related">${sameCourt.map((x) => li(pagePath(x), x.caseName, x.dateFiled, x.caseType)).join("")}
    </ul>` : ""}
    <p class="text-muted matter-foot">From the court's own case index (${esc(r.sourceName)}). CREdocket lists business and government parties only and adds nothing about the parties beyond the record. Not legal advice. Something wrong here? <a href="/contact.html?matter=${encodeURIComponent(r.caseName + " (" + r.caseNumber + ")")}">Tell us</a> and we will correct it.</p>
  </div>
</section>

</main>`;
}

function listHtml(): string {
  let last = "";
  return data.slice().sort(byDate).map((r) => {
    const headRow = r.dateFiled !== last ? `<div class="ch11-day mono">${esc(longDay(r.dateFiled))}</div>\n` : "";
    last = r.dateFiled;
    return `${headRow}<div class="ch11-row" data-ch11-row data-search="${esc((r.caseName + " " + r.plaintiffs.join(" ") + " " + r.defendants.join(" ") + " " + r.court + " " + r.caseNumber).toLowerCase())}">
  <div style="min-width:0;">
    <a class="ch11-name" href="${DIR}/${esc(r.slug)}.html">${esc(r.caseName)}</a>
    <div class="ch11-court">${esc(r.court)} · ${esc(r.caseType)} · No. ${esc(r.caseNumber)}</div>
  </div>
</div>`;
  }).join("\n");
}

await Deno.mkdir(DIR, { recursive: true });
const keep = new Set<string>();
for (const r of data) {
  const file = `${DIR}/${r.slug}.html`;
  keep.add(file);
  await Deno.writeTextFile(file, headFor(r) + mainFor(r) + tail);
}
let removed = 0;
for await (const e of Deno.readDir(DIR)) {
  const file = `${DIR}/${e.name}`;
  if (e.isFile && e.name.endsWith(".html") && !keep.has(file)) { await Deno.remove(file); removed++; }
}
const page = await Deno.readTextFile(LIST);
const start = "<!-- state:list:start -->", end = "<!-- state:list:end -->";
if (!page.includes(start) || !page.includes(end)) throw new Error(`${LIST} is missing the state:list markers`);
const earliest = data.map((r) => r.dateFiled).sort()[0];
const updated = page
  .replace(new RegExp(`${start}[\\s\\S]*?${end}`), () => `${start}\n${data.length ? listHtml() : `<p class="text-secondary" style="padding:24px;">No filings listed yet.</p>`}\n${end}`)
  .replace(/<span id="state-count">[^<]*<\/span>/, () => `<span id="state-count">${data.length.toLocaleString("en-US")}</span>`)
  .replace(/<span id="state-range">[^<]*<\/span>/, () => `<span id="state-range">${earliest ? "since " + esc(fmtDate(earliest)) : ""}</span>`);
await Deno.writeTextFile(LIST, updated);
console.log(`${DIR}: ${keep.size} pages written, ${removed} removed; ${LIST} lists ${data.length}`);
