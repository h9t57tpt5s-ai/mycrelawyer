// Builds one static page per tracker matter at matters/<id>.html.
//
// Until 2026-10-02 a matter existed only as a pop-up panel on the tracker,
// so search engines and AI answer engines had nothing to index for a case
// ("Eastview Mall foreclosure lawsuit") and a shared link previewed as the
// generic tracker page. Each page carries the matter's public content (the
// same summary and "why it matters" the panel shows before sign-in), its
// sources, related matters, sharing links and a watchlist prompt, with its
// own title, description, preview card and structured data. The full
// write-up and timeline stay behind the tracker's sign-in.
//
// The pages load only the site shell (navigation, sign-in), not the 1.3 MB
// js/data.js, so they open fast. js/matter-page.js adds court activity and
// corrections from their JSON files. Pages for removed matters are deleted.
//
// Run by .github/workflows/prerender.yml after every change to js/data.js;
// locally:  deno run --allow-read --allow-write scripts/build_matter_pages.ts

type Party = { name: string; role: string };
type Case = {
  id: string; title: string; category: string; status: string; date: string; addedDate?: string;
  jurisdiction: string; state?: string; amount?: string; source?: string; sourceUrl?: string;
  summary: string; brief?: string; significance?: string; tags?: string[]; docketUrl?: string; docketLabel?: string;
  documentUrl?: string; documentLabel?: string; propertyType?: string; judge?: string | null;
  parties?: Party[]; body?: string[]; timeline?: unknown[];
  seoTitle?: string; seoDescription?: string;
};
type Data = {
  categories: { id: string; label: string; color: string }[];
  statuses: { id: string; label: string; color: string }[];
  states: Record<string, string>;
  cases: Case[];
};

const SITE = "https://credocket.com";
const src = await Deno.readTextFile("js/data.js");
const data: Data = new Function(src + "; return RELAW_DATA;")();
const corrections: { entries: { date: string; caseId: string | null }[] } =
  JSON.parse(await Deno.readTextFile("js/corrections.json"));
// Company, agency and property landing pages (scripts/build_entity_pages.ts,
// which runs first).
// Topic trackers each matter belongs to (scripts/build_trackers.ts, which runs first).
const topicIndex: Record<string, { slug: string; name: string }[]> =
  await Deno.readTextFile("js/topic-index.json").then(JSON.parse).catch(() => ({}));
const entityIndex: { parties: Record<string, string>; properties: Record<string, string> } =
  await Deno.readTextFile("js/entity-index.json").then(JSON.parse).catch(() => ({ parties: {}, properties: {} }));

// A matter's docketUrl and a Chapter 11/federal-suit filing's docketId can
// name the exact same CourtListener docket (build_record_pages.ts already
// links the record page back to the matter this way); this builds the
// reverse link, from the matter page to its own court-record page.
type Filing = { docketId: number | null; slug: string };
async function filingsByDocketId(file: string, dir: string): Promise<Map<number, { slug: string; dir: string }>> {
  const map = new Map<number, { slug: string; dir: string }>();
  try {
    const d = JSON.parse(await Deno.readTextFile(file)) as { filings: Filing[] };
    for (const f of d.filings || []) if (f.docketId && f.slug) map.set(f.docketId, { slug: f.slug, dir });
  } catch { /* file missing or unreadable */ }
  return map;
}
const ch11ByDocketId = await filingsByDocketId("ops/ch11-petitions.json", "chapter-11");
const suitByDocketId = await filingsByDocketId("ops/federal-suits.json", "federal-cases");

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
// Text fields may carry entities or light markup; attributes and JSON-LD
// get plain text.
const plain = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const fmtDate = (iso?: string) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const cat = (id: string) => data.categories.find((c) => c.id === id) ?? { id, label: id, color: "var(--accent)" };
const status = (id: string) => data.statuses.find((s) => s.id === id) ?? { id, label: id, color: "var(--text-muted)" };
const url = (c: Case) => `${SITE}/matters/${c.id}.html`;
const lastChanged = (c: Case) => {
  const d = corrections.entries.filter((e) => e.caseId === c.id).map((e) => e.date);
  return [c.addedDate || c.date, ...d].sort().at(-1)!;
};

// Page shell: the alert log's head, nav, footer and shell scripts, with
// every relative link made absolute (pages live one folder down) and the
// data.js loader, its retry guard and the data-hungry scripts removed.
const tpl = await Deno.readTextFile("alert-log.html");
const absolutize = (h: string) => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
let head = tpl.slice(0, tpl.indexOf('<main id="main-content"'));
let tail = tpl.slice(tpl.indexOf("</main>") + "</main>".length);
tail = tail.replace(/<script src="js\/data(?:-lite)?\.js"><\/script>\s*<script>[\s\S]*?<\/script>/, "")
  .replace(/<script src="js\/(glossary-tooltip|trending|search)\.js"><\/script>\s*/g, "")
  .replace(/\s*<a href="alert-log\.html" class="active">/, '\n        <a href="alert-log.html">');
if (/js\/data(?:-lite)?\.js/.test(tail)) throw new Error("template tail still loads the dataset");
tail = tail.replace("<script src=\"js/main.js\"></script>", '<script src="js/main.js"></script>\n<script src="js/matter-page.js"></script>\n<script src="js/newsletter-form.js"></script>');
head = absolutize(head);
tail = absolutize(tail);

// "What is it worth?" page for each tracker category (scripts/build_value_pages.ts).
const VALUE_PAGE: Record<string, [string, string]> = {
  "lease-disputes": ["commercial-lease-dispute-damages", "commercial lease dispute"],
  "landlord-tenant": ["commercial-lease-dispute-damages", "commercial lease dispute"],
  "lending-foreclosure": ["commercial-foreclosure-guaranty-damages", "commercial loan or guaranty claim"],
  "construction-defect": ["construction-defect-damages", "construction defect claim"],
  "eminent-domain": ["condemnation-compensation", "condemnation claim"],
  "zoning-land-use": ["land-use-litigation-damages", "zoning or land-use claim"],
  "premises-liability": ["commercial-premises-liability-damages", "premises liability claim"],
  "reit-securities": ["reit-securities-claim-value", "REIT securities claim"],
  "environmental": ["environmental-cleanup-cost-claims", "contamination claim"],
};

// Share image per matter (scripts/build_og_images.py, which runs first).
const ogImage = (c: Case) => {
  try { Deno.statSync(`img/og/${c.id}.png`); return `${SITE}/img/og/${c.id}.png`; } catch { return `${SITE}/img/og-image.png`; }
};

function headFor(c: Case): string {
  // seoTitle / seoDescription (2026-10-14) lead with what people search for
  // (the building, the known company or sponsor, the city) instead of a
  // special-purpose LLC caption; the page's headline stays c.title.
  const title = `${plain(c.seoTitle || c.title)} — CREdocket`;
  const desc = c.seoDescription ? plain(c.seoDescription) : clip(plain(c.summary), 300);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "NewsArticle",
        headline: clip(plain(c.title), 110),
        description: desc,
        datePublished: c.addedDate || c.date,
        dateModified: lastChanged(c),
        mainEntityOfPage: url(c),
        image: [ogImage(c)],
        articleSection: cat(c.category).label,
        keywords: (c.tags || []).join(", "),
        author: { "@type": "Organization", name: "CREdocket", url: SITE },
        publisher: { "@type": "Organization", name: "CREdocket", url: SITE, logo: { "@type": "ImageObject", url: `${SITE}/img/favicon.svg` } },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Litigation Tracker", item: `${SITE}/litigation.html` },
          { "@type": "ListItem", position: 2, name: cat(c.category).label, item: `${SITE}/litigation.html?category=${c.category}` },
          { "@type": "ListItem", position: 3, name: clip(plain(c.title), 110), item: url(c) },
        ],
      },
    ],
  };
  // Replacement STRINGS are not safe here: "$1" etc. are special to
  // String.replace, and a summary containing a dollar figure like "$170M"
  // gets misread as a backreference, splicing a second meta tag into the
  // attribute value (found in 31 published pages, 2026-10-11). Replacement
  // FUNCTIONS return their value verbatim, with no such reinterpretation.
  return head
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, (_, p1) => `${p1}${esc(title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, (_, p1) => `${p1}${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta property="og:type" content=")[^"]*"/, (_, p1) => `${p1}article"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, (_, p1) => `${p1}${url(c)}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, (_, p1) => `${p1}${url(c)}"`)
    .replace(/(<meta property="og:image" content=")[^"]*"/, (_, p1) => `${p1}${ogImage(c)}"`)
    .replace(/(<meta name="twitter:image" content=")[^"]*"/, (_, p1) => `${p1}${ogImage(c)}"`)
    // Large previews in Google Discover and search need this opt-in.
    .replace("</title>", '</title>\n<meta name="robots" content="max-image-preview:large" />')
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
}

// Parties named in more than one matter link those matters together
// ("Other matters involving Rialto Capital Advisors"). Names are compared
// with case, punctuation, "The" and corporate suffixes ignored, so
// "RealPage, Inc." and "RealPage Inc." match; anything else stays apart.
// Same rule as js/main.js partyKey.
export function partyKey(name: string): string {
  let s = name.toLowerCase().replace(/&/g, "and").replace(/\(.*?\)/g, "").replace(/[.,']/g, "").replace(/\s+/g, " ").trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\s+(llc|inc|incorporated|corp|corporation|co|company|lp|llp|ltd|na|national association|plc)$/, "").trim();
  }
  return s.replace(/^the\s+/, "");
}
const byParty = new Map<string, { names: Map<string, number>; ids: Set<string> }>();
for (const x of data.cases) {
  for (const p of x.parties || []) {
    const k = partyKey(p.name);
    if (k.length < 4) continue;
    const e = byParty.get(k) || { names: new Map(), ids: new Set() };
    e.names.set(p.name, (e.names.get(p.name) || 0) + 1);
    e.ids.add(x.id);
    byParty.set(k, e);
  }
}
function sharedParties(c: Case): { name: string; others: Case[] }[] {
  const seen = new Set<string>(), out: { name: string; others: Case[] }[] = [];
  for (const p of c.parties || []) {
    const k = partyKey(p.name), e = byParty.get(k);
    if (!e || seen.has(k) || e.ids.size < 2) continue;
    seen.add(k);
    const name = [...e.names.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const others = data.cases.filter((x) => x.id !== c.id && e.ids.has(x.id)).sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 5);
    out.push({ name, others });
  }
  return out;
}

function related(c: Case, pick: (x: Case) => boolean, n: number): Case[] {
  return data.cases.filter((x) => x.id !== c.id && pick(x)).sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, n);
}
const relatedList = (items: Case[]) => items.map((x) => `
          <li><a href="/matters/${esc(x.id)}.html">${esc(plain(x.title))}</a><span>${esc(fmtDate(x.date))} · ${esc(status(x.status).label)}</span></li>`).join("");

function mainFor(c: Case): string {
  const k = cat(c.category), s = status(c.status);
  const stateName = (c.state && data.states[c.state]) || c.state || "";
  const meta: [string, string][] = [
    ["Date", fmtDate(c.date)],
    ["Added to tracker", c.addedDate && c.addedDate !== c.date ? fmtDate(c.addedDate) : ""],
    ["Court or forum", esc(c.jurisdiction)],
    ["State", esc(stateName)],
    ["Presiding judge", esc(c.judge || "")],
    ["Property type", esc(c.propertyType || "")],
    ["Amount / scale", esc(c.amount || "")],
  ];
  const parties = (c.parties || []).map((p) => {
    const page = entityIndex.parties[partyKey(p.name)];
    return `<span class="detail-tag">${esc(p.role ? p.role + ": " : "")}${page ? `<a href="${esc(page)}">${esc(p.name)}</a>` : esc(p.name)}</span>`;
  }).join("");
  const sources = [
    c.sourceUrl ? `<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Original source ↗</a>` : "",
    c.documentUrl ? `<a href="${esc(c.documentUrl)}" target="_blank" rel="noopener">${esc(c.documentLabel || "Primary document")} ↗</a>` : "",
    c.docketUrl ? `<a href="${esc(c.docketUrl)}" target="_blank" rel="noopener">${esc(c.docketLabel || "Court docket")} ↗</a>` : "",
  ].filter(Boolean).join("");
  const hasMore = (c.body && c.body.length) || (c.timeline && c.timeline.length);
  const shared = sharedParties(c);
  const sameCat = related(c, (x) => x.category === c.category, 5);
  const sameState = c.state ? related(c, (x) => x.state === c.state && !sameCat.includes(x), 5) : [];
  const recent = data.cases.filter((x) => x.id !== c.id)
    .sort((a, b) => ((b.addedDate || b.date) > (a.addedDate || a.date) ? 1 : -1)).slice(0, 5);
  // "Read next" (2026-10-23): 7.6% of visits saw a second page in the
  // week to Oct. 22 -- most land here from search, read, and leave, and
  // the related lists sat at the very bottom under five sign-up boxes.
  // Three related matters with their one-line briefs now follow the
  // write-up directly: same parties first, then same practice area in the
  // same state, then same practice area.
  const sameCatState = c.state ? related(c, (x) => x.category === c.category && x.state === c.state, 3) : [];
  const readNext = [...new Map([...shared.flatMap((p) => p.others), ...sameCatState, ...sameCat]
    .map((x) => [x.id, x] as [string, Case])).values()].slice(0, 3);
  const first = c.body && c.body.length ? c.body[0] : "";
  const tl = (c.timeline || []) as { when: string; label: string; current?: boolean }[];
  const latest = tl.length ? (tl.find((ev) => ev.current) || tl[tl.length - 1]) : null;
  const watch = { name: `${k.label}${stateName ? ` — ${stateName}` : ""}`, categories: [c.category], states: c.state ? [c.state] : [] };
  const share = encodeURIComponent(url(c));
  // Matters with a CourtListener docket can be followed: the daily docket
  // job emails followers each new ruling or closing.
  const docketId = /courtlistener\.com\/docket\/(\d+)\//.exec(c.docketUrl || "")?.[1];
  const follow = docketId ? { docketId: Number(docketId), label: clip(plain(c.title), 200), path: `/matters/${c.id}.html` } : null;
  const record = docketId ? (ch11ByDocketId.get(Number(docketId)) || suitByDocketId.get(Number(docketId))) : undefined;
  const recordLink = record
    ? `<p class="matter-entity-link">Full court record: <a href="/${esc(record.dir)}/${esc(record.slug)}.html">${record.dir === "chapter-11" ? "Chapter 11 Watch" : "Federal Lawsuit Watch"} filing →</a></p>`
    : "";
  return `<main id="main-content" tabindex="-1">

<header class="page-header matter-header">
  <div class="container" style="max-width:860px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb"><a href="/litigation.html">Litigation Tracker</a><span aria-hidden="true">/</span><a href="/litigation.html?category=${esc(c.category)}">${esc(k.label)}</a></nav>
    <h1 style="font-size:clamp(1.8rem,3.4vw,2.6rem);">${c.title}</h1>
    <div class="matter-badges">
      <span class="badge" style="background:color-mix(in srgb, ${k.color} 16%, transparent); color:${k.color}; border:1px solid color-mix(in srgb, ${k.color} 35%, transparent);"><span class="badge-dot" style="background:${k.color}"></span>${esc(k.label)}</span>
      <span class="status-pill" style="color:${s.color}"><span class="dot" style="background:${s.color}"></span>${esc(s.label)}</span>
    </div>
  </div>
</header>

<section class="section-tight">
  <div class="container" style="max-width:860px;">
    <div class="detail-meta-grid matter-meta">
      ${meta.filter(([, v]) => v).map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join("\n      ")}
      ${parties ? `<div style="grid-column:1 / -1;"><div class="label">Parties</div><div class="value matter-parties">${parties}</div></div>` : ""}
    </div>

    ${c.brief ? `<p class="case-brief case-brief-lg">${c.brief}</p>` : ""}
    <p class="body-text">${c.summary}</p>
    ${c.significance ? `<h2 class="matter-h2">Why it matters</h2>\n    <p class="body-text">${c.significance}</p>` : ""}
    <div id="matter-corrections" data-matter-id="${esc(c.id)}"></div>
    ${sources ? `<div class="matter-sources">${sources}</div>` : ""}
    ${(topicIndex[c.id] || []).map((t) => `<p class="matter-entity-link">Part of the <a href="/${esc(t.slug)}.html">${esc(t.name)}</a>: every related matter in one table.</p>`).join("\n    ")}
    ${recordLink}
    ${readNext.length ? `<div class="matter-read-next">
      <div class="eyebrow">Read next</div>
      ${readNext.map((x) => `<a class="read-next-item" href="/matters/${esc(x.id)}.html">
        <span class="read-next-title">${esc(plain(x.title))}</span>
        ${x.brief ? `<span class="read-next-brief">${esc(x.brief)}</span>` : ""}
        <span class="read-next-meta">${esc(cat(x.category).label)} · ${esc(fmtDate(x.date))}</span>
      </a>`).join("")}
    </div>` : ""}

    <div id="matter-court" data-docket-url="${esc(c.docketUrl || "")}" data-matter-id="${esc(c.id)}"></div>

    ${follow ? `<div class="card matter-cta matter-top-cta" data-follow-box data-follow="${esc(JSON.stringify(follow))}">
      <div class="eyebrow">Alerts</div>
      <h2 class="matter-h2">Email me when the court rules in this case</h2>
      <p class="text-secondary">We check this federal docket every day. One email when an order, judgment, dismissal or closing appears. Free account; stop any time.</p>
      <form class="gate-form" data-follow-form novalidate>
        <label class="sr-only" for="follow-email">Email address</label>
        <input type="email" id="follow-email" autocomplete="email" placeholder="you@company.com" />
        <button type="submit" class="btn btn-primary btn-sm">Follow this case</button>
      </form>
      <p class="gate-form-status" data-follow-status role="status"></p>
    </div>` : `<div class="card matter-cta matter-top-cta">
      <div class="eyebrow">Weekly email</div>
      <h2 class="matter-h2">New on CREdocket, every Monday</h2>
      <p class="text-secondary">The week's new commercial real estate lawsuits, rulings in cases we follow, and market signals. Free; unsubscribe in one click.</p>
      <form class="gate-form" data-newsletter-form data-newsletter-source="matter-top:${esc(c.id)}" data-case-id="${esc(c.id)}" novalidate>
        <label class="sr-only" for="matter-nl-email">Email address</label>
        <input type="email" id="matter-nl-email" autocomplete="email" placeholder="you@company.com" />
        <button type="submit" class="btn btn-primary btn-sm">Subscribe</button>
      </form>
      <p class="gate-form-status" data-newsletter-status role="status"></p>
    </div>`}

    ${hasMore ? `${first ? `<div class="gate-teaser matter-teaser"><p class="body-text">${first}</p></div>` : ""}
    ${latest ? `<p class="gate-timeline-peek"><span>Case timeline · ${tl.length} ${tl.length === 1 ? "entry" : "entries"}</span> Latest: ${latest.when} — ${latest.label}</p>` : ""}` : ""}

    <div class="matter-cta-row">
      ${hasMore ? `<div class="card matter-cta" id="matter-keep-reading" data-case-id-target="${esc(c.id)}">
        <div class="eyebrow">Free · no account needed</div>
        <h2 class="matter-h2">Keep reading</h2>
        <p class="text-secondary">Read the full write-up${tl.length ? " and case timeline" : ""}. Up to 10 a month are free without an account; a free account is unlimited and adds email alerts.</p>
        <a class="btn btn-primary btn-sm" href="/litigation.html?case=${esc(c.id)}" id="matter-open-full">Read the full write-up</a>
        <p class="gate-alt" style="margin-top:14px;">Or create a free account with just your email:</p>
        <form class="gate-form" id="matter-gate-form" novalidate>
          <label class="sr-only" for="matter-gate-email">Email address</label>
          <input type="email" id="matter-gate-email" autocomplete="email" placeholder="you@company.com" />
          <button type="submit" class="btn btn-ghost btn-sm">Email me a sign-in link</button>
        </form>
        <p class="gate-form-status" id="matter-gate-status" role="status"></p>
      </div>` : ""}
      <div class="card matter-cta alert-box" data-alert-box data-watchlist="${esc(JSON.stringify(watch))}">
        <div class="eyebrow">Alerts</div>
        <h2 class="matter-h2">Get an email when new ${esc(k.label.toLowerCase())} matters${stateName ? ` in ${esc(stateName)}` : ""} are filed</h2>
        <form class="gate-form" data-alert-form novalidate>
          <label class="sr-only" for="matter-alert-email">Email address</label>
          <input type="email" id="matter-alert-email" autocomplete="email" placeholder="you@company.com" />
          <button type="submit" class="btn btn-ghost btn-sm">Create alert</button>
        </form>
        <p class="gate-form-status" data-alert-status role="status"></p>
      </div>
      ${follow ? `<div class="card matter-cta">
        <div class="eyebrow">Free weekly email</div>
        <h2 class="matter-h2">Rulings like this, every Monday</h2>
        <p class="text-secondary">The week's new commercial real estate lawsuits, foreclosures and court rulings. No account needed; unsubscribe in one click.</p>
        <form class="gate-form" data-newsletter-form data-newsletter-source="matter-row:${esc(c.id)}" data-case-id="${esc(c.id)}" novalidate>
          <label class="sr-only" for="matter-nl-email">Email address</label>
          <input type="email" id="matter-nl-email" autocomplete="email" placeholder="you@company.com" />
          <button type="submit" class="btn btn-ghost btn-sm">Subscribe</button>
        </form>
        <p class="gate-form-status" data-newsletter-status role="status"></p>
      </div>` : ""}
      <div class="card matter-cta">
        <div class="eyebrow">Case Value Calculator · free beta</div>
        <h2 class="matter-h2">Facing a dispute like this one?</h2>
        <p class="text-secondary">Get a damages range for your own facts, with the reasoning and the cases behind it. ${VALUE_PAGE[c.category] ? `<a href="/${VALUE_PAGE[c.category][0]}.html">What is a ${esc(VALUE_PAGE[c.category][1])} worth?</a>` : ""}</p>
        <a class="btn btn-ghost btn-sm" href="/case-valuation.html?category=${esc(c.category === "landlord-tenant" ? "lease-disputes" : c.category)}#cv-form">Estimate your case</a>
      </div>
    </div>

    <div class="matter-share">
      <span class="label">Share</span>
      <button type="button" class="btn btn-ghost btn-sm" id="matter-copy" data-url="${esc(url(c))}">Copy link</button>
      <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
      <a class="btn btn-ghost btn-sm" href="mailto:?subject=${encodeURIComponent(plain(c.title))}&amp;body=${share}">Email</a>
    </div>

    <h2 class="matter-h2" style="margin-top:40px;">Looking for something else?</h2>
    <form action="/litigation.html#filters-anchor" method="get" class="filter-row" style="margin-bottom:8px;">
      <div class="search-input-wrap">
        <svg viewBox="0 0 24 24" fill="none"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
        <label for="matter-search-q" class="sr-only">Search the litigation tracker</label>
        <input type="text" id="matter-search-q" name="q" class="search-input" placeholder="Search matters, companies, jurisdictions…" autocomplete="off" />
      </div>
      <button type="submit" class="btn btn-primary btn-sm">Search</button>
    </form>

    ${shared.map((p) => {
      const page = entityIndex.parties[partyKey(p.name)];
      return `<h2 class="matter-h2" style="margin-top:40px;">Other matters involving ${esc(p.name)}</h2>
    <ul class="matter-related">${relatedList(p.others)}
    </ul>${page ? `\n    <p class="matter-entity-link"><a href="${esc(page)}">All matters involving ${esc(p.name)} →</a></p>` : ""}`;
    }).join("\n    ")}
    ${sameCat.length ? `<h2 class="matter-h2" style="margin-top:40px;">More ${esc(k.label.toLowerCase())} matters</h2>
    <ul class="matter-related">${relatedList(sameCat)}
    </ul>` : ""}
    ${sameState.length ? `<h2 class="matter-h2" style="margin-top:32px;">Other matters in ${esc(stateName)}</h2>
    <ul class="matter-related">${relatedList(sameState)}
    </ul>` : ""}
    <h2 class="matter-h2" style="margin-top:32px;">Recently added</h2>
    <ul class="matter-related">${relatedList(recent)}
    </ul>
    <p class="text-muted matter-foot">CREdocket summarizes public court records and reporting; see our <a href="/methodology.html#standards">sourcing standards</a> and <a href="/corrections.html">corrections log</a>. Not legal advice. Facing something similar? <a href="/contact.html?matter=${encodeURIComponent(plain(c.title))}">Contact us</a>.</p>
  </div>
</section>

</main>`;
}

await Deno.mkdir("matters", { recursive: true });
const keep = new Set<string>();
for (const c of data.cases) {
  const file = `matters/${c.id}.html`;
  keep.add(file);
  await Deno.writeTextFile(file, headFor(c) + mainFor(c) + tail);
}
let removed = 0;
for await (const e of Deno.readDir("matters")) {
  const file = `matters/${e.name}`;
  if (e.isFile && e.name.endsWith(".html") && !keep.has(file)) { await Deno.remove(file); removed++; }
}
console.log(`${keep.size} matter pages written, ${removed} removed`);
