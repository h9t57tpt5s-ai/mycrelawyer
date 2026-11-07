// CMBS Distress Watch pages (2026-11-06): one static page per property event
// in ops/cmbs-distress.json (scripts/pull_cmbs_distress.py) at
// cmbs/<slug>.html, and the list on cmbs-watch.html.
//
// Same shell as the State Court Watch pages (scripts/build_state_pages.ts).
// Each page carries only what the trust's SEC filing reports about the loan
// and the property, with a link to that filing; nothing about a borrower.
// Pages for events no longer listed are deleted.
//
// Run by .github/workflows/prerender.yml; locally:
//   deno run --allow-read --allow-write scripts/build_cmbs_pages.ts
type Also = { trust: string; balance: number | null; filingUrl: string; accession: string };
type Ev = {
  event: string; eventLabel: string; previous: string | null; propertyName: string; address: string; city: string;
  state: string; zip: string; county: string; propertyType: string; propertyCount: number; otherProperties: string[];
  trust: string; trustCik: number; loanId: string; balance: number | null; originalLoanAmount: number | null;
  paidThrough: string; paymentStatus?: string; specialServicingSince: string; valuation: number | null; valuationDate: string;
  reportingPeriodEnd: string; filed: string; accession: string; filingUrl: string; alsoIn: Also[]; slug: string;
};
const SITE = "https://credocket.com";
const DIR = "cmbs", LIST = "cmbs-watch.html";
const readJson = async <T>(p: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await Deno.readTextFile(p)); } catch { return fallback; }
};
// Property pages that combine this event with other sources (scripts/build_entity_pages.ts).
const profiles: Record<string, string> = (await readJson<{ cmbs?: Record<string, string> }>("js/entity-index.json", {})).cmbs || {};
const data: Ev[] = (await readJson<{ events: Ev[] }>("ops/cmbs-distress.json", { events: [] })).events
  .filter((r) => r.slug && /^[a-z0-9-]+$/.test(r.slug));
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDate = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) => new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const longDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const money = (n: number | null) => !n ? "" : "$" + Math.round(n).toLocaleString("en-US");
// Loan tapes are often in capitals; "PARK TOWER AT TRANSBAY" reads as "Park Tower at Transbay".
const KEEP = /^(I{1,3}|IV|VI{0,3}|IX|X|LLC|LP|USA?|NYC|SoHo|[A-Z]{1,3}\d+|\d+[A-Z]?)$/;
const SMALL = new Set(["at", "of", "on", "the", "and", "in", "by", "for", "to"]);
function nice(s: string): string {
  if (s !== s.toUpperCase() || !/[A-Z]/.test(s)) return s;
  return s.split(/(\s+|-|\/)/).map((w, i) => {
    if (/^\s+$|^[-/]$/.test(w) || KEEP.test(w)) return w;
    const l = w.toLowerCase();
    if (i > 0 && SMALL.has(l)) return l;
    return l.replace(/(^|[('&])([a-z])/g, (_, a, b) => a + b.toUpperCase());
  }).join("");
}
const name = (r: Ev) => nice(r.propertyName);
// Portfolio loans sometimes report no city, or no location at all.
const where = (r: Ev) => r.city && r.state ? `${nice(r.city)}, ${r.state}` : r.state || "Location not reported";
const PREV: Record<string, string> = {
  foreclosure: "in foreclosure", bankruptcy: "with the borrower in bankruptcy", "deed-in-lieu": "being resolved by deed in lieu of foreclosure", reo: "bank-owned (REO)",
};
const NOW: Record<string, string> = {
  foreclosure: "in foreclosure", bankruptcy: "in bankruptcy (the servicer's workout strategy is the borrower's bankruptcy case)",
  "deed-in-lieu": "being resolved by a deed in lieu of foreclosure", reo: "now bank-owned (REO): the trust has taken title",
};
const totalBalance = (r: Ev) => [r.balance, ...r.alsoIn.map((a) => a.balance)].reduce<number>((s, b) => s + (b ?? 0), 0);

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

const pagePath = (r: Ev) => `/${DIR}/${r.slug}.html`;
const pageUrl = (r: Ev) => SITE + pagePath(r);

function headFor(r: Ev): string {
  const title = `${name(r)}, ${where(r)}: ${r.eventLabel.toLowerCase()} — CREdocket`;
  const desc = `${name(r)} (${r.propertyType.toLowerCase()}, ${where(r)}): the CMBS servicer of ${r.trust} reported the loan ${PREV[r.event]} for the period ending ${fmtDate(r.reportingPeriodEnd)}. Loan balance, servicing history and the SEC filing.`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: `${name(r)}: ${r.eventLabel}`, description: desc, url: pageUrl(r), datePublished: r.filed,
        about: { "@type": "Place", name: name(r), address: { "@type": "PostalAddress", streetAddress: nice(r.address), addressLocality: nice(r.city), addressRegion: r.state, postalCode: r.zip } },
        publisher: { "@type": "Organization", name: "CREdocket", url: SITE } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "CMBS Distress Watch", item: `${SITE}/${LIST}` },
        { "@type": "ListItem", position: 2, name: name(r), item: pageUrl(r) }] },
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

const byDate = (a: Ev, b: Ev) => (b.filed > a.filed ? 1 : b.filed < a.filed ? -1 : name(a).localeCompare(name(b)));
const li = (r: Ev, extra: string) =>
  `\n          <li><a href="${esc(pagePath(r))}">${esc(name(r))}</a><span>${esc(shortDate(r.filed))} · ${esc(extra)}</span></li>`;

function mainFor(r: Ev): string {
  const sameState = data.filter((x) => x !== r && x.state === r.state).sort(byDate).slice(0, 8);
  const trusts = [r.trust, ...r.alsoIn.map((a) => a.trust)];
  const meta: [string, string][] = [
    ["Property", esc(name(r)) + (r.propertyCount > 1 ? ` and ${r.propertyCount - 1} other propert${r.propertyCount > 2 ? "ies" : "y"}` : "")],
    ["Address", esc([nice(r.address), nice(r.city), [r.state, r.zip].filter(Boolean).join(" ")].filter(Boolean).join(", "))],
    ["Property type", esc(r.propertyType)],
    ["Status reported", esc(r.eventLabel)],
    ["Previous month", esc(r.previous ? PREV[r.previous][0].toUpperCase() + PREV[r.previous].slice(1) : "No foreclosure, bankruptcy or REO reported")],
    ["Reporting period ending", esc(fmtDate(r.reportingPeriodEnd))],
    [r.alsoIn.length ? "Loan balance, all listed trusts" : "Loan balance", esc(money(r.alsoIn.length ? totalBalance(r) : r.balance))],
    ["Payment status", esc(r.paymentStatus || "")],
    ["Paid through", r.paidThrough ? esc(fmtDate(r.paidThrough)) : ""],
    ["In special servicing since", r.specialServicingSince ? esc(fmtDate(r.specialServicingSince)) : ""],
    ["Most recent valuation", r.valuation ? esc(money(r.valuation) + (r.valuationDate ? ` (${shortDate(r.valuationDate)})` : "")) : ""],
    ["CMBS trust" + (trusts.length > 1 ? "s" : ""), esc(trusts.join("; "))],
  ];
  const share = encodeURIComponent(pageUrl(r));
  const filings = [{ trust: r.trust, filingUrl: r.filingUrl, balance: r.balance }, ...r.alsoIn];
  return `<main id="main-content" tabindex="-1">

<header class="page-header matter-header">
  <div class="container" style="max-width:860px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb"><a href="/${LIST}">CMBS Distress Watch</a><span aria-hidden="true">/</span><span>${esc(where(r))}</span></nav>
    <h1 style="font-size:clamp(1.8rem,3.4vw,2.6rem);">${esc(name(r))}</h1>
    <div class="matter-badges">
      <span class="badge"><span class="badge-dot" style="background:var(--accent)"></span>${esc(r.propertyType)} · ${esc(where(r))}</span>
      <span class="status-pill"><span class="dot" style="background:var(--status-pending)"></span>${esc(r.eventLabel)}</span>
    </div>
  </div>
</header>

<section class="section-tight">
  <div class="container" style="max-width:860px;">
    <div class="detail-meta-grid matter-meta">
      ${meta.filter(([, v]) => v).map(([l, v]) => `<div${l.startsWith("CMBS") || l === "Address" ? ' style="grid-column:1 / -1;"' : ""}><div class="label">${l}</div><div class="value">${v}</div></div>`).join("\n      ")}
    </div>

    <p class="body-text">In its monthly loan-level report to the SEC for the period ending ${esc(fmtDate(r.reportingPeriodEnd))} (Form ABS-EE, filed ${esc(fmtDate(r.filed))}), ${esc(r.trust)} reported the loan secured by ${esc(name(r))}${r.city ? ` in ${esc(where(r))}` : ""} as ${esc(NOW[r.event])}. In the trust's previous monthly report the loan was ${esc(r.previous ? PREV[r.previous] : "not in foreclosure, bankruptcy or REO")}.${r.alsoIn.length ? ` The loan is split across several trusts; ${esc(r.alsoIn.map((a) => a.trust).join(", "))} reported the same change.` : ""}</p>
    ${r.otherProperties.length ? `<p class="body-text">The same loan is secured by ${r.propertyCount - 1} other propert${r.propertyCount > 2 ? "ies" : "y"}, including ${esc(r.otherProperties.map(nice).join("; "))}.</p>` : ""}
    <p class="body-text">This is the loan servicer's report, not a court record: it gives no case number, and it usually trails the underlying event by a month or two. Whether a foreclosure runs through a court depends on the state. CREdocket lists the property and the trust only, never the borrower.</p>
    <div class="matter-sources">${filings.map((f) => `<a href="${esc(f.filingUrl)}" target="_blank" rel="noopener">SEC filing: ${esc(f.trust)} ↗</a>`).join(" ")}</div>${profiles[r.slug] ? `\n    <p class="body-text"><a href="${esc(profiles[r.slug])}">Everything CREdocket has on this property</a>, including its foreclosure-sale notices and court matters.</p>` : ""}

    <div class="card matter-cta matter-one-cta">
      <div class="eyebrow">Weekly email</div>
      <h2 class="matter-h2">New on CREdocket, every Monday</h2>
      <p class="text-secondary">The week's new commercial real estate lawsuits, rulings in cases we follow, and market signals. Free; unsubscribe in one click.</p>
      <form class="gate-form" data-newsletter-form data-newsletter-source="cmbs:${esc(r.slug).slice(0, 60)}" novalidate>
        <label class="sr-only" for="cmbs-nl-email">Email address</label>
        <input type="email" id="cmbs-nl-email" autocomplete="email" placeholder="you@company.com" />
        <button type="submit" class="btn btn-primary btn-sm">Subscribe</button>
      </form>
      <p class="gate-form-status" data-newsletter-status role="status"></p>
      <p class="matter-cta-foot">Want an email when one of your own tenants, borrowers or guarantors is sued? <a href="/account.html#portfolio">Add it to your portfolio</a>. Facing a dispute like this one? <a href="/case-valuation.html#cv-form">Estimate its value</a>.</p>
    </div>

    <div class="matter-share">
      <span class="label">Share</span>
      <button type="button" class="btn btn-ghost btn-sm" id="matter-copy" data-url="${esc(pageUrl(r))}">Copy link</button>
      <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
      <a class="btn btn-ghost btn-sm" href="mailto:?subject=${encodeURIComponent(name(r) + ": " + r.eventLabel)}&amp;body=${share}">Email</a>
    </div>

    ${sameState.length ? `<h2 class="matter-h2" style="margin-top:40px;">Other distressed CMBS properties in ${esc(r.state)}</h2>
    <ul class="matter-related">${sameState.map((x) => li(x, `${where(x)} · ${x.eventLabel}`)).join("")}
    </ul>` : ""}
    <p class="text-muted matter-foot">From the trust's Exhibit 102 asset data file (SEC Regulation AB, Schedule AL), compared with its previous month's file. Figures are as reported by the servicer. Not legal or investment advice. Something wrong here? <a href="/contact.html?matter=${encodeURIComponent(name(r) + " (" + r.trust + ")")}">Tell us</a> and we will correct it.</p>
  </div>
</section>

</main>`;
}

function listHtml(): string {
  let last = "";
  return data.slice().sort(byDate).map((r) => {
    const headRow = r.filed !== last ? `<div class="ch11-day mono">${esc(longDay(r.filed))}</div>\n` : "";
    last = r.filed;
    const trusts = [r.trust, ...r.alsoIn.map((a) => a.trust)];
    return `${headRow}<div class="ch11-row" data-ch11-row data-search="${esc((name(r) + " " + r.address + " " + r.city + " " + r.state + " " + r.propertyType + " " + r.eventLabel + " " + trusts.join(" ")).toLowerCase())}">
  <div style="min-width:0;">
    <a class="ch11-name" href="${DIR}/${esc(r.slug)}.html">${esc(name(r))}</a>
    <div class="ch11-court">${esc(where(r))} · ${esc(r.propertyType)} · ${esc(r.eventLabel)} · ${(r.alsoIn.length ? totalBalance(r) : r.balance) ? esc(money(r.alsoIn.length ? totalBalance(r) : r.balance)) + " loan · " : ""}${esc(trusts.length > 1 ? `${r.trust} and ${trusts.length - 1} other trust${trusts.length > 2 ? "s" : ""}` : r.trust)}</div>
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
const start = "<!-- cmbs:list:start -->", end = "<!-- cmbs:list:end -->";
if (!page.includes(start) || !page.includes(end)) throw new Error(`${LIST} is missing the cmbs:list markers`);
const earliest = data.map((r) => r.filed).sort()[0];
const updated = page
  .replace(new RegExp(`${start}[\\s\\S]*?${end}`), () => `${start}\n${data.length ? listHtml() : `<p class="text-secondary" style="padding:24px;">No properties listed yet.</p>`}\n${end}`)
  .replace(/<span id="cmbs-count">[^<]*<\/span>/, () => `<span id="cmbs-count">${data.length.toLocaleString("en-US")}</span>`)
  .replace(/<span id="cmbs-noun">[^<]*<\/span>/, () => `<span id="cmbs-noun">${data.length === 1 ? "property" : "properties"}</span>`)
  .replace(/<span id="cmbs-range">[^<]*<\/span>/, () => `<span id="cmbs-range">${earliest ? "in SEC filings since " + esc(fmtDate(earliest)) : ""}</span>`);
await Deno.writeTextFile(LIST, updated);
console.log(`${DIR}: ${keep.size} pages written, ${removed} removed; ${LIST} lists ${data.length}`);
