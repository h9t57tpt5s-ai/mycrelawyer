// Builds Chapter 11 Watch (bankruptcy-watch.html's list) and one static
// page per commercial real estate Chapter 11 petition at
// chapter-11/<slug>.html (2026-10-07).
//
// Search visitors arrive looking for a specific business; until now a
// petition was one row on a page filled in by JavaScript, so there was
// nothing to find. Each page carries only what the federal court record
// shows (debtor, court, case number, date, docket link), the latest orders
// and outcomes the daily docket job found (ops/ch11-activity.json), a
// "follow this case" box, and links to related filings. Nothing is written
// about the debtor beyond the record.
//
// Inputs: ops/ch11-petitions.json (scripts/ingest_court_filings.py decides
// which debtors are commercial real estate), ops/ch11-activity.json
// (scripts/track_dockets.py), js/data.js (a tracker write-up of the same
// case). Pages for petitions no longer listed are deleted.
//
// Run by .github/workflows/prerender.yml; locally:
//   deno run --allow-read --allow-write scripts/build_ch11_pages.ts

type Petition = {
  caseName: string; court: string; courtId: string; docketNumber: string; dateFiled: string;
  docketUrl: string; docketId: number | null; slug: string;
};
type Entry = { date: string | null; number: number | string | null; text: string; url?: string | null; ruling?: boolean };
type Docket = { entries?: Entry[]; dateTerminated?: string | null; lastEntryDate?: string | null; checkedAt?: string };
type Case = { id: string; title: string; date: string; docketUrl?: string; parties?: { name: string }[] };

const SITE = "https://credocket.com";
const readJson = async <T>(p: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await Deno.readTextFile(p)); } catch { return fallback; }
};
const petitions: Petition[] = (await readJson<{ filings: Petition[] }>("ops/ch11-petitions.json", { filings: [] })).filings
  .filter((p) => p.slug && /^[a-z0-9-]+$/.test(p.slug));
const activity = await readJson<{ updatedAt?: string; dockets?: Record<string, Docket> }>("ops/ch11-activity.json", {});
const src = await Deno.readTextFile("js/data.js");
const cases: Case[] = new Function(src + "; return RELAW_DATA;")().cases;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDate = (iso?: string | null) => iso ? new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const shortDate = (iso?: string | null) => iso ? new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
// "United States Bankruptcy Court, S.D. Texas" -> "S.D. Texas"
const district = (court: string) => court.replace(/^United States Bankruptcy Court,?\s*/i, "").replace(/\.$/, "").trim() || court;
const courtLabel = (court: string) => `U.S. Bankruptcy Court, ${district(court)}`;
const pageUrl = (p: Petition) => `${SITE}/chapter-11/${p.slug}.html`;
const docketOf = (p: Petition): Docket => (p.docketId && activity.dockets?.[String(p.docketId)]) || {};

// Same normalization as build_matter_pages.ts partyKey, plus trailing
// series numbers, so "… REIT, Inc." and "… REIT II, Inc." read as one family.
function partyKey(name: string): string {
  let s = name.toLowerCase().replace(/&/g, "and").replace(/\(.*?\)/g, "").replace(/[.,']/g, "").replace(/\s+/g, " ").trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\s+(llc|inc|incorporated|corp|corporation|co|company|lp|llp|ltd|na|national association|plc|limited liability company)$/, "").trim();
  }
  return s.replace(/^the\s+/, "");
}
const familyKey = (name: string) => partyKey(name).replace(/\s+(i{1,3}|iv|vi{0,3}|ix|x{1,3}|\d{1,3})$/, "");

// A tracker write-up of the same case: same CourtListener docket, or the
// debtor named as a party.
const docketIdRe = /courtlistener\.com\/docket\/(\d+)\//;
function writeUp(p: Petition): Case | undefined {
  const k = partyKey(p.caseName);
  return cases.find((c) => (p.docketId && docketIdRe.exec(c.docketUrl || "")?.[1] === String(p.docketId)) ||
    (c.parties || []).some((x) => partyKey(x.name) === k));
}

// Page shell: the same one the matter pages use (alert log's head, nav,
// footer), links made absolute, the dataset loader removed.
const tpl = await Deno.readTextFile("alert-log.html");
const absolutize = (h: string) => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
let head = tpl.slice(0, tpl.indexOf('<main id="main-content"'));
let tail = tpl.slice(tpl.indexOf("</main>") + "</main>".length);
tail = tail.replace(/<script src="js\/data(?:-lite)?\.js"><\/script>\s*<script>[\s\S]*?<\/script>/, "")
  .replace(/<script src="js\/(glossary-tooltip|trending|search)\.js"><\/script>\s*/g, "")
  .replace(/\s*<a href="alert-log\.html" class="active">/, '\n        <a href="alert-log.html">');
if (/js\/data(?:-lite)?\.js/.test(tail)) throw new Error("template tail still loads the dataset");
tail = tail.replace("<script src=\"js/main.js\"></script>", '<script src="js/main.js"></script>\n<script src="js/matter-page.js"></script>');
head = absolutize(head);
tail = absolutize(tail);

function headFor(p: Petition): string {
  const title = `${p.caseName} — Chapter 11 case, ${district(p.court)} — CREdocket`;
  const desc = `A Chapter 11 bankruptcy case for ${p.caseName} opened in the ${courtLabel(p.court)} on ${fmtDate(p.dateFiled)} (case no. ${p.docketNumber}). Court record, latest orders and case alerts.`;
  const d = docketOf(p);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage", name: `${p.caseName} — Chapter 11 case`, description: desc, url: pageUrl(p),
        datePublished: p.dateFiled, dateModified: [p.dateFiled, d.lastEntryDate || ""].sort().at(-1),
        about: { "@type": "Organization", name: p.caseName },
        publisher: { "@type": "Organization", name: "CREdocket", url: SITE },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Chapter 11 Watch", item: `${SITE}/bankruptcy-watch.html` },
          { "@type": "ListItem", position: 2, name: p.caseName, item: pageUrl(p) },
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
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${pageUrl(p)}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${pageUrl(p)}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
}

const byDate = (a: Petition, b: Petition) => (b.dateFiled > a.dateFiled ? 1 : b.dateFiled < a.dateFiled ? -1 : a.caseName.localeCompare(b.caseName));
const list = (items: Petition[]) => items.map((x) => `
          <li><a href="/chapter-11/${esc(x.slug)}.html">${esc(x.caseName)}</a><span>${esc(shortDate(x.dateFiled))} · ${esc(district(x.court))}</span></li>`).join("");
const isCourtListener = (u?: string | null) => !!u && /^https:\/\/www\.courtlistener\.com\//.test(u);

function mainFor(p: Petition): string {
  const d = docketOf(p);
  const entries = (d.entries || []).slice(0, 8);
  const tracked = !!d.checkedAt;
  const closed = d.dateTerminated;
  const fam = familyKey(p.caseName);
  const family = petitions.filter((x) => x !== p && familyKey(x.caseName) === fam).sort(byDate).slice(0, 8);
  const sameCourt = petitions.filter((x) => x !== p && x.courtId === p.courtId && !family.includes(x)).sort(byDate).slice(0, 5);
  const recent = petitions.filter((x) => x !== p && !family.includes(x) && !sameCourt.includes(x)).sort(byDate).slice(0, 6);
  const w = writeUp(p);
  const follow = p.docketId ? { docketId: p.docketId, label: `${p.caseName} (Chapter 11, ${district(p.court)})`.slice(0, 200), path: `/chapter-11/${p.slug}.html` } : null;
  const share = encodeURIComponent(pageUrl(p));
  const meta: [string, string][] = [
    ["Debtor", esc(p.caseName)],
    ["Court", esc(courtLabel(p.court))],
    ["Case number", esc(p.docketNumber)],
    ["Case opened", esc(fmtDate(p.dateFiled))],
    ["Chapter", "11"],
    ["Docket status", closed ? `Closed ${esc(fmtDate(closed))}` : tracked ? "Open" : ""],
  ];
  return `<main id="main-content" tabindex="-1">

<header class="page-header matter-header">
  <div class="container" style="max-width:860px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb"><a href="/bankruptcy-watch.html">Chapter 11 Watch</a><span aria-hidden="true">/</span><span>${esc(district(p.court))}</span></nav>
    <h1 style="font-size:clamp(1.8rem,3.4vw,2.6rem);">${esc(p.caseName)}</h1>
    <div class="matter-badges">
      <span class="badge"><span class="badge-dot" style="background:var(--accent)"></span>Chapter 11 case</span>
      <span class="status-pill"><span class="dot" style="background:${closed ? "var(--text-muted)" : "var(--accent)"}"></span>${closed ? "Closed" : "Filed " + esc(shortDate(p.dateFiled))}</span>
    </div>
  </div>
</header>

<section class="section-tight">
  <div class="container" style="max-width:860px;">
    <div class="detail-meta-grid matter-meta">
      ${meta.filter(([, v]) => v).map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join("\n      ")}
    </div>

    <p class="body-text">A Chapter 11 bankruptcy case for ${esc(p.caseName)} was opened in the ${esc(courtLabel(p.court))} on ${esc(fmtDate(p.dateFiled))}, case no. ${esc(p.docketNumber)}, according to the federal court record.</p>
    <p class="body-text">It is on CREdocket's <a href="/bankruptcy-watch.html">Chapter 11 Watch</a> because the debtor's name indicates a commercial real estate owner, developer or single-property company. That is a reading of the name only; the docket shows the property, the lenders and the debts. If this debtor is your borrower, tenant, landlord or counterparty, the automatic stay generally took effect when the petition was filed.</p>
    ${w ? `<p class="body-text"><strong>CREdocket write-up:</strong> <a href="/matters/${esc(w.id)}.html">${esc(w.title.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"'))}</a></p>` : ""}
    <div class="matter-sources">${isCourtListener(p.docketUrl) ? `<a href="${esc(p.docketUrl)}" target="_blank" rel="noopener">Court docket (CourtListener) ↗</a>` : ""}</div>

    <h2 class="matter-h2" style="margin-top:32px;">Latest orders and rulings</h2>
    ${closed ? `<p class="docket-activity-closed">The docket shows this case closed on ${esc(fmtDate(closed))}.</p>` : ""}
    ${entries.length ? `<ul class="docket-activity-list">${entries.map((e) => `
      <li><span class="docket-activity-date">${esc(shortDate(e.date))}</span><span class="docket-activity-text">${e.ruling ? '<span class="docket-activity-flag">Ruling</span>' : ""}${isCourtListener(e.url) ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.text || "Docket entry")}</a>` : esc(e.text || "Docket entry")}${e.number ? ` <span class="docket-activity-no">No. ${esc(e.number)}</span>` : ""}</span></li>`).join("")}
    </ul>` : `<p class="text-secondary">${tracked ? "No orders or rulings have reached CourtListener's archive yet." : "Not checked yet."}</p>`}
    <p class="text-secondary docket-activity-note">Orders, judgments, dismissals and closings from the docket via CourtListener${activity.updatedAt && tracked ? `, checked ${esc(shortDate(d.checkedAt))}` : ""}. CREdocket checks each case daily for its first 30 days, and for as long as anyone follows it. Entries reach CourtListener with some delay, and not every entry does.</p>

    <div class="matter-cta-row">
      ${follow ? `<div class="card matter-cta" data-follow-box data-follow="${esc(JSON.stringify(follow))}">
        <div class="eyebrow">Alerts</div>
        <h2 class="matter-h2">Email me when the court rules in this case</h2>
        <p class="text-secondary">One email when an order, judgment, dismissal or closing appears on this docket. Free account; stop any time.</p>
        <form class="gate-form" data-follow-form novalidate>
          <label class="sr-only" for="follow-email">Email address</label>
          <input type="email" id="follow-email" autocomplete="email" placeholder="you@company.com" />
          <button type="submit" class="btn btn-primary btn-sm">Follow this case</button>
        </form>
        <p class="gate-form-status" data-follow-status role="status"></p>
      </div>` : ""}
    </div>

    <div class="matter-share">
      <span class="label">Share</span>
      <button type="button" class="btn btn-ghost btn-sm" id="matter-copy" data-url="${esc(pageUrl(p))}">Copy link</button>
      <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
      <a class="btn btn-ghost btn-sm" href="mailto:?subject=${encodeURIComponent(p.caseName + " — Chapter 11")}&amp;body=${share}">Email</a>
    </div>

    ${family.length ? `<h2 class="matter-h2" style="margin-top:40px;">Related filings</h2>
    <ul class="matter-related">${list(family)}
    </ul>` : ""}
    ${sameCourt.length ? `<h2 class="matter-h2" style="margin-top:32px;">Other recent petitions in the ${esc(district(p.court))}</h2>
    <ul class="matter-related">${list(sameCourt)}
    </ul>` : ""}
    <h2 class="matter-h2" style="margin-top:32px;">Recent commercial real estate Chapter 11 petitions</h2>
    <ul class="matter-related">${list(recent)}
    </ul>
    <p class="text-muted matter-foot">From the federal court record via CourtListener and the RECAP Archive, a project of the nonprofit Free Law Project. CREdocket lists business debtors only and adds nothing about the debtor beyond the record. Not legal advice. Something wrong here? <a href="/contact.html?matter=${encodeURIComponent(p.caseName + " (Chapter 11, " + p.docketNumber + ")")}">Tell us</a> and we will correct it.</p>
  </div>
</section>

</main>`;
}

// Chapter 11 Watch: the list itself is baked into the page so search
// engines and readers without JavaScript see every petition and its link.
function watchList(): string {
  let last = "";
  return petitions.slice().sort(byDate).map((p) => {
    const headRow = p.dateFiled !== last
      ? `<div class="ch11-day mono">${esc(new Date(p.dateFiled + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }))}</div>\n` : "";
    last = p.dateFiled;
    const d = docketOf(p);
    const latest = (d.entries || [])[0];
    return `${headRow}<div class="ch11-row" data-ch11-row data-search="${esc((p.caseName + " " + p.court + " " + p.docketNumber).toLowerCase())}">
  <div style="min-width:0;">
    <a class="ch11-name" href="chapter-11/${esc(p.slug)}.html">${esc(p.caseName)}</a>
    <div class="ch11-court">${esc(courtLabel(p.court))} · No. ${esc(p.docketNumber)}${d.dateTerminated ? ` · <strong>closed ${esc(shortDate(d.dateTerminated))}</strong>` : latest && latest.ruling ? ` · latest: ${esc(latest.text.slice(0, 70))}${latest.text.length > 70 ? "…" : ""}` : ""}</div>
  </div>
  ${isCourtListener(p.docketUrl) ? `<a href="${esc(p.docketUrl)}" target="_blank" rel="noopener noreferrer" class="ch11-docket">Docket</a>` : ""}
</div>`;
  }).join("\n");
}

await Deno.mkdir("chapter-11", { recursive: true });
const keep = new Set<string>();
for (const p of petitions) {
  const file = `chapter-11/${p.slug}.html`;
  keep.add(file);
  await Deno.writeTextFile(file, headFor(p) + mainFor(p) + tail);
}
let removed = 0;
for await (const e of Deno.readDir("chapter-11")) {
  const file = `chapter-11/${e.name}`;
  if (e.isFile && e.name.endsWith(".html") && !keep.has(file)) { await Deno.remove(file); removed++; }
}

const watch = await Deno.readTextFile("bankruptcy-watch.html");
const start = "<!-- ch11:list:start -->", end = "<!-- ch11:list:end -->";
if (!watch.includes(start) || !watch.includes(end)) throw new Error("bankruptcy-watch.html is missing the ch11:list markers");
const earliest = petitions.map((p) => p.dateFiled).sort()[0];
const updated = watch
  .replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${petitions.length ? watchList() : '<p class="text-secondary" style="padding:24px;">No petitions listed yet.</p>'}\n${end}`)
  .replace(/<span id="ch11-count">[^<]*<\/span>/, `<span id="ch11-count">${petitions.length.toLocaleString("en-US")}</span>`)
  .replace(/<span id="ch11-range">[^<]*<\/span>/, `<span id="ch11-range">${earliest ? "since " + esc(new Date(earliest + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })) : ""}</span>`);
await Deno.writeTextFile("bankruptcy-watch.html", updated);
console.log(`${keep.size} Chapter 11 pages written, ${removed} removed; Chapter 11 Watch lists ${petitions.length}`);
