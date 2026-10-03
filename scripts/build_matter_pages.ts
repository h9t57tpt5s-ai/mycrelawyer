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
  summary: string; significance?: string; tags?: string[]; docketUrl?: string; docketLabel?: string;
  documentUrl?: string; documentLabel?: string; propertyType?: string; judge?: string | null;
  parties?: Party[]; body?: string[]; timeline?: unknown[];
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
tail = tail.replace(/<script src="js\/data\.js"><\/script>\s*<script>[\s\S]*?<\/script>/, "")
  .replace(/<script src="js\/(glossary-tooltip|trending|search)\.js"><\/script>\s*/g, "")
  .replace(/\s*<a href="alert-log\.html" class="active">/, '\n        <a href="alert-log.html">');
if (tail.includes("js/data.js")) throw new Error("template tail still loads js/data.js");
tail = tail.replace("<script src=\"js/main.js\"></script>", '<script src="js/main.js"></script>\n<script src="js/matter-page.js"></script>');
head = absolutize(head);
tail = absolutize(tail);

function headFor(c: Case): string {
  const title = `${plain(c.title)} — CREdocket`;
  const desc = clip(plain(c.summary), 300);
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
  return head
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${esc(desc)}"`)
    .replace(/(<meta property="og:type" content=")[^"]*"/, `$1article"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url(c)}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url(c)}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
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
  const parties = (c.parties || []).map((p) => `<span class="detail-tag">${esc(p.role ? p.role + ": " : "")}${esc(p.name)}</span>`).join("");
  const sources = [
    c.sourceUrl ? `<a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Original source ↗</a>` : "",
    c.documentUrl ? `<a href="${esc(c.documentUrl)}" target="_blank" rel="noopener">${esc(c.documentLabel || "Primary document")} ↗</a>` : "",
    c.docketUrl ? `<a href="${esc(c.docketUrl)}" target="_blank" rel="noopener">${esc(c.docketLabel || "Court docket")} ↗</a>` : "",
  ].filter(Boolean).join("");
  const hasMore = (c.body && c.body.length) || (c.timeline && c.timeline.length);
  const sameCat = related(c, (x) => x.category === c.category, 5);
  const sameState = c.state ? related(c, (x) => x.state === c.state && !sameCat.includes(x), 5) : [];
  const share = encodeURIComponent(url(c));
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

    <p class="body-text">${c.summary}</p>
    ${c.significance ? `<h2 class="matter-h2">Why it matters</h2>\n    <p class="body-text">${c.significance}</p>` : ""}
    <div id="matter-corrections" data-matter-id="${esc(c.id)}"></div>
    ${sources ? `<div class="matter-sources">${sources}</div>` : ""}

    <div id="matter-court" data-docket-url="${esc(c.docketUrl || "")}" data-matter-id="${esc(c.id)}"></div>

    <div class="matter-cta-row">
      ${hasMore ? `<div class="card matter-cta">
        <div class="eyebrow">Free with an account</div>
        <h2 class="matter-h2">Read the full write-up${c.timeline && c.timeline.length ? " and case timeline" : ""}</h2>
        <p class="text-secondary">The complete analysis of this matter, with its procedural history and practical takeaways.</p>
        <a class="btn btn-primary btn-sm" href="/litigation.html?case=${esc(c.id)}">Open the full matter</a>
      </div>` : ""}
      <div class="card matter-cta">
        <div class="eyebrow">Alerts</div>
        <h2 class="matter-h2">Get an email when a matter like this is filed</h2>
        <p class="text-secondary">Set up a free watchlist for ${esc(k.label.toLowerCase())}${stateName ? ` matters in ${esc(stateName)}` : " matters"}, or for the tenants, borrowers and guarantors in your portfolio.</p>
        <a class="btn btn-ghost btn-sm" href="/account.html#watchlists">Create a watchlist</a>
      </div>
    </div>

    <div class="matter-share">
      <span class="label">Share</span>
      <button type="button" class="btn btn-ghost btn-sm" id="matter-copy" data-url="${esc(url(c))}">Copy link</button>
      <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
      <a class="btn btn-ghost btn-sm" href="mailto:?subject=${encodeURIComponent(plain(c.title))}&amp;body=${share}">Email</a>
    </div>

    ${sameCat.length ? `<h2 class="matter-h2" style="margin-top:40px;">More ${esc(k.label.toLowerCase())} matters</h2>
    <ul class="matter-related">${relatedList(sameCat)}
    </ul>` : ""}
    ${sameState.length ? `<h2 class="matter-h2" style="margin-top:32px;">Other matters in ${esc(stateName)}</h2>
    <ul class="matter-related">${relatedList(sameState)}
    </ul>` : ""}
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
