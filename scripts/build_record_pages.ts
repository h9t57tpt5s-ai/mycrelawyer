// Builds the court-record pages: one static page per record and the list
// page that links them all (2026-10-07).
//
//   Chapter 11 petitions   ops/ch11-petitions.json -> chapter-11/<slug>.html, bankruptcy-watch.html
//   Federal civil lawsuits ops/federal-suits.json  -> federal-cases/<slug>.html, lawsuit-watch.html
//
// Search visitors arrive looking for a specific business. Each page carries
// only what the federal court record shows (parties as captioned, court,
// case number, date, docket link), the latest orders and outcomes the daily
// docket job found (ops/ch11-activity.json, ops/suit-activity.json), a
// "follow this case" box, links to other filings naming the same business,
// and any CREdocket write-up of it. Nothing is written about a party beyond
// the record. scripts/ingest_court_filings.py decides what is commercial
// real estate (is_cre_debtor, is_cre_suit). Pages for records no longer
// listed are deleted.
//
// Run by .github/workflows/prerender.yml; locally:
//   deno run --allow-read --allow-write scripts/build_record_pages.ts

type Rec = {
  caseName: string; court: string; courtId: string; docketNumber: string; dateFiled: string;
  docketUrl: string; docketId: number | null; slug: string; suitNature?: string; cause?: string;
};
type Entry = { date: string | null; number: number | string | null; text: string; url?: string | null; ruling?: boolean };
type Docket = { entries?: Entry[]; dateTerminated?: string | null; lastEntryDate?: string | null; checkedAt?: string };
type Activity = { updatedAt?: string; dockets?: Record<string, Docket> };
type Case = { id: string; title: string; date: string; docketUrl?: string; parties?: { name: string }[] };

const SITE = "https://credocket.com";
const readJson = async <T>(p: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await Deno.readTextFile(p)); } catch { return fallback; }
};
const recs = async (p: string) => (await readJson<{ filings: Rec[] }>(p, { filings: [] })).filings
  .filter((r) => r.slug && /^[a-z0-9-]+$/.test(r.slug));
const src = await Deno.readTextFile("js/data.js");
const cases: Case[] = new Function(src + "; return RELAW_DATA;")().cases;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDate = (iso?: string | null) => iso ? new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const shortDate = (iso?: string | null) => iso ? new Date(iso.slice(0, 10) + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const longDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const isCourtListener = (u?: string | null) => !!u && /^https:\/\/www\.courtlistener\.com\//.test(u);
const plainTitle = (t: string) => t.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');

// "United States Bankruptcy Court, S.D. Texas" / "District Court, S.D. Florida" -> "S.D. Texas" / "S.D. Florida"
const district = (court: string) => court.replace(/^(United States )?(Bankruptcy|District) Court,?\s*(for the\s*)?/i, "").replace(/\.$/, "").trim() || court;
const bankruptcyCourt = (court: string) => `U.S. Bankruptcy Court, ${district(court)}`;
const civilCourt = (r: Rec) => r.courtId === "uscfc" ? "U.S. Court of Federal Claims" : `U.S. District Court, ${district(r.court)}`;

// Same normalization as build_matter_pages.ts partyKey.
function partyKey(name: string): string {
  let s = name.toLowerCase().replace(/&/g, "and").replace(/\(.*?\)/g, "").replace(/[.,']/g, "").replace(/\s+/g, " ").trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\s+(llc|inc|incorporated|corp|corporation|co|company|lp|llp|lllp|ltd|na|national association|plc|limited liability company|limited partnership|a limited partnership|et al)$/, "").trim();
  }
  return s.replace(/^the\s+/, "");
}
// Trailing series numbers too, so "… REIT, Inc." and "… REIT II, Inc." read as one family.
const familyKey = (name: string) => partyKey(name).replace(/\s+(i{1,3}|iv|vi{0,3}|ix|x{1,3}|\d{1,3})$/, "");
const sides = (caseName: string) => {
  const p = caseName.split(/\s+v(?:s)?\.?\s+/i);
  return (p.length === 2 ? p : [caseName]).map((x) => x.replace(/,?\s+et\.?\s*al\.?,?$/i, "").trim());
};
// Banks, trustees and governments sit on so many cases that linking by them is noise.
const tooCommon = /\b(bank|trust company|trustee|national association|united states|city of|county|state of|department|wells fargo|u\.?s\.? bank|federal national mortgage|fannie mae|federal home loan|freddie mac|insurance)\b/i;

const KINDS = {
  ch11: {
    file: "ops/ch11-petitions.json", activityFile: "ops/ch11-activity.json", dir: "chapter-11",
    listPage: "bankruptcy-watch.html", listName: "Chapter 11 Watch", marker: "ch11", noun: "petitions",
  },
  suit: {
    file: "ops/federal-suits.json", activityFile: "ops/suit-activity.json", dir: "federal-cases",
    listPage: "lawsuit-watch.html", listName: "Federal Lawsuit Watch", marker: "suit", noun: "cases",
  },
} as const;
type Kind = keyof typeof KINDS;

const data: Record<Kind, Rec[]> = { ch11: await recs(KINDS.ch11.file), suit: await recs(KINDS.suit.file) };
const activity: Record<Kind, Activity> = {
  ch11: await readJson<Activity>(KINDS.ch11.activityFile, {}),
  suit: await readJson<Activity>(KINDS.suit.activityFile, {}),
};
const docketOf = (k: Kind, r: Rec): Docket => (r.docketId && activity[k].dockets?.[String(r.docketId)]) || {};
const pagePath = (k: Kind, r: Rec) => `/${KINDS[k].dir}/${r.slug}.html`;
const pageUrl = (k: Kind, r: Rec) => SITE + pagePath(k, r);
const partyNames = (k: Kind, r: Rec) => k === "ch11" ? [r.caseName] : sides(r.caseName);

// Every party key -> the records (of both kinds) that name it.
const byParty = new Map<string, { k: Kind; r: Rec }[]>();
for (const k of Object.keys(KINDS) as Kind[]) {
  for (const r of data[k]) {
    for (const n of partyNames(k, r)) {
      if (tooCommon.test(n)) continue;
      const key = familyKey(n);
      if (key.length < 4) continue;
      const list = byParty.get(key) || [];
      list.push({ k, r });
      byParty.set(key, list);
    }
  }
}

// Tracker coverage: a write-up of this same case (same CourtListener
// docket), and other matters that name a party (live-145 names the
// American Hospitality Properties REITs).
const docketIdRe = /courtlistener\.com\/docket\/(\d+)\//;
function coverage(k: Kind, r: Rec): { sameCase?: Case; involving: Case[] } {
  const keys = new Set(partyNames(k, r).filter((n) => !tooCommon.test(n)).map(partyKey));
  const sameCase = cases.find((c) => !!r.docketId && docketIdRe.exec(c.docketUrl || "")?.[1] === String(r.docketId));
  const involving = cases.filter((c) => c !== sameCase && (c.parties || []).some((x) => keys.has(partyKey(x.name))));
  return { sameCase, involving };
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

// What differs between the two kinds of page.
function words(k: Kind, r: Rec) {
  if (k === "ch11") {
    const court = bankruptcyCourt(r.court);
    return {
      title: `${r.caseName} — Chapter 11 case, ${district(r.court)} — CREdocket`,
      desc: `A Chapter 11 bankruptcy case for ${r.caseName} opened in the ${court} on ${fmtDate(r.dateFiled)} (case no. ${r.docketNumber}). Court record, latest orders and case alerts.`,
      name: `${r.caseName} — Chapter 11 case`, badge: "Chapter 11 case", court,
      meta: [["Debtor", esc(r.caseName)], ["Court", esc(court)], ["Case number", esc(r.docketNumber)], ["Case opened", esc(fmtDate(r.dateFiled))], ["Chapter", "11"]] as [string, string][],
      intro: `<p class="body-text">A Chapter 11 bankruptcy case for ${esc(r.caseName)} was opened in the ${esc(court)} on ${esc(fmtDate(r.dateFiled))}, case no. ${esc(r.docketNumber)}, according to the federal court record.</p>
    <p class="body-text">It is on CREdocket's <a href="/bankruptcy-watch.html">Chapter 11 Watch</a> because the debtor's name indicates a commercial real estate owner, developer or single-property company. That is a reading of the name only; the docket shows the property, the lenders and the debts. If this debtor is your borrower, tenant, landlord or counterparty, the automatic stay generally took effect when the petition was filed.</p>`,
      followLabel: `${r.caseName} (Chapter 11, ${district(r.court)})`, mailSubject: `${r.caseName} — Chapter 11`,
      contact: `${r.caseName} (Chapter 11, ${r.docketNumber})`,
      foot: "CREdocket lists business debtors only and adds nothing about the debtor beyond the record.",
    };
  }
  const court = civilCourt(r);
  const kind = r.suitNature ? r.suitNature.replace(/^\d+\s+/, "") : "";
  return {
    title: `${r.caseName} — ${r.courtId === "uscfc" ? "Court of Federal Claims" : district(r.court)} lawsuit — CREdocket`,
    desc: `${r.caseName}: a federal lawsuit filed in the ${court} on ${fmtDate(r.dateFiled)} (case no. ${r.docketNumber}). Court record, latest orders and case alerts.`,
    name: r.caseName, badge: "Federal lawsuit", court,
    meta: [["Court", esc(court)], ["Case number", esc(r.docketNumber)], ["Filed", esc(fmtDate(r.dateFiled))],
      ["Nature of suit", esc(kind)], ["Cause", esc(r.cause || "")]] as [string, string][],
    intro: `<p class="body-text">${esc(r.caseName)} was filed in the ${esc(court)} on ${esc(fmtDate(r.dateFiled))}, case no. ${esc(r.docketNumber)}${kind ? `, as a "${esc(kind)}" case` : ""}, according to the federal court record.</p>
    <p class="body-text">It is on CREdocket's <a href="/lawsuit-watch.html">Federal Lawsuit Watch</a> because both sides are businesses or governments and a party's name indicates a commercial real estate owner, developer, hotel or property company (or it is a real property foreclosure or lease case between businesses). That is a reading of the caption only; the complaint on the docket says what the dispute is about.</p>`,
    followLabel: `${r.caseName} (${r.docketNumber})`, mailSubject: r.caseName,
    contact: `${r.caseName} (${r.docketNumber})`,
    foot: "CREdocket lists cases between businesses or governments only and adds nothing about the parties beyond the record.",
  };
}

function headFor(k: Kind, r: Rec): string {
  const w = words(k, r), d = docketOf(k, r), url = pageUrl(k, r);
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage", name: w.name, description: w.desc, url,
        datePublished: r.dateFiled, dateModified: [r.dateFiled, d.lastEntryDate || ""].sort().at(-1),
        about: partyNames(k, r).map((n) => ({ "@type": "Organization", name: n })),
        publisher: { "@type": "Organization", name: "CREdocket", url: SITE },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: KINDS[k].listName, item: `${SITE}/${KINDS[k].listPage}` },
          { "@type": "ListItem", position: 2, name: r.caseName, item: url },
        ],
      },
    ],
  };
  return head
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(w.title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(w.desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(w.title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(w.desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, `$1${esc(w.title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, `$1${esc(w.desc)}"`)
    .replace(/(<meta property="og:type" content=")[^"]*"/, `$1article"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, `$1${url}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
}

const byDate = (a: Rec, b: Rec) => (b.dateFiled > a.dateFiled ? 1 : b.dateFiled < a.dateFiled ? -1 : a.caseName.localeCompare(b.caseName));
const list = (items: { k: Kind; r: Rec }[]) => items.map(({ k, r }) => `
          <li><a href="${esc(pagePath(k, r))}">${esc(r.caseName)}</a><span>${esc(shortDate(r.dateFiled))} · ${k === "ch11" ? "Chapter 11, " : ""}${esc(r.courtId === "uscfc" ? "Court of Federal Claims" : district(r.court))}</span></li>`).join("");

function mainFor(k: Kind, r: Rec): string {
  const w = words(k, r), d = docketOf(k, r);
  const entries = (d.entries || []).slice(0, 8);
  const tracked = !!d.checkedAt, closed = d.dateTerminated;
  const self = (x: { k: Kind; r: Rec }) => x.k === k && x.r === r;
  const seen = new Set<Rec>([r]);
  const related: { k: Kind; r: Rec }[] = [];
  for (const n of partyNames(k, r)) {
    for (const x of byParty.get(familyKey(n)) || []) {
      if (!self(x) && !seen.has(x.r)) { seen.add(x.r); related.push(x); }
    }
  }
  related.sort((a, b) => byDate(a.r, b.r));
  const mine = data[k].map((x) => ({ k, r: x }));
  const sameCourt = mine.filter((x) => !seen.has(x.r) && x.r.courtId === r.courtId).sort((a, b) => byDate(a.r, b.r)).slice(0, 5);
  sameCourt.forEach((x) => seen.add(x.r));
  const recent = mine.filter((x) => !seen.has(x.r)).sort((a, b) => byDate(a.r, b.r)).slice(0, 6);
  const cov = coverage(k, r);
  const follow = r.docketId ? { docketId: r.docketId, label: w.followLabel.slice(0, 200), path: pagePath(k, r) } : null;
  const share = encodeURIComponent(pageUrl(k, r));
  const meta = [...w.meta, ["Docket status", closed ? `Closed ${esc(fmtDate(closed))}` : tracked ? "Open" : ""] as [string, string]];
  const crumb = r.courtId === "uscfc" ? "Court of Federal Claims" : district(r.court);
  return `<main id="main-content" tabindex="-1">

<header class="page-header matter-header">
  <div class="container" style="max-width:860px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb"><a href="/${KINDS[k].listPage}">${KINDS[k].listName}</a><span aria-hidden="true">/</span><span>${esc(crumb)}</span></nav>
    <h1 style="font-size:clamp(1.8rem,3.4vw,2.6rem);">${esc(r.caseName)}</h1>
    <div class="matter-badges">
      <span class="badge"><span class="badge-dot" style="background:var(--accent)"></span>${w.badge}</span>
      <span class="status-pill"><span class="dot" style="background:${closed ? "var(--text-muted)" : "var(--accent)"}"></span>${closed ? "Closed" : "Filed " + esc(shortDate(r.dateFiled))}</span>
    </div>
  </div>
</header>

<section class="section-tight">
  <div class="container" style="max-width:860px;">
    <div class="detail-meta-grid matter-meta">
      ${meta.filter(([, v]) => v).map(([l, v]) => `<div><div class="label">${l}</div><div class="value">${v}</div></div>`).join("\n      ")}
    </div>

    ${w.intro}
    ${cov.sameCase ? `<p class="body-text"><strong>CREdocket write-up of this case:</strong> <a href="/matters/${esc(cov.sameCase.id)}.html">${esc(plainTitle(cov.sameCase.title))}</a></p>` : ""}
    ${cov.involving.length ? `<p class="body-text"><strong>Other CREdocket matters naming ${k === "ch11" ? esc(r.caseName) : "these parties"}:</strong> ${cov.involving.map((c) => `<a href="/matters/${esc(c.id)}.html">${esc(plainTitle(c.title))}</a>`).join("; ")}</p>` : ""}
    <div class="matter-sources">${isCourtListener(r.docketUrl) ? `<a href="${esc(r.docketUrl)}" target="_blank" rel="noopener">Court docket (CourtListener) ↗</a>` : ""}</div>

    <h2 class="matter-h2" style="margin-top:32px;">Latest orders and rulings</h2>
    ${closed ? `<p class="docket-activity-closed">The docket shows this case closed on ${esc(fmtDate(closed))}.</p>` : ""}
    ${entries.length ? `<ul class="docket-activity-list">${entries.map((e) => `
      <li><span class="docket-activity-date">${esc(shortDate(e.date))}</span><span class="docket-activity-text">${e.ruling ? '<span class="docket-activity-flag">Ruling</span>' : ""}${isCourtListener(e.url) ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.text || "Docket entry")}</a>` : esc(e.text || "Docket entry")}${e.number ? ` <span class="docket-activity-no">No. ${esc(e.number)}</span>` : ""}</span></li>`).join("")}
    </ul>` : `<p class="text-secondary">${tracked ? "No orders or rulings have reached CourtListener's archive yet." : "Not checked yet."}</p>`}
    <p class="text-secondary docket-activity-note">Orders, judgments, dismissals and closings from the docket via CourtListener${tracked ? `, checked ${esc(shortDate(d.checkedAt))}` : ""}. CREdocket checks each case daily for its first 30 days, and for as long as anyone follows it. Entries reach CourtListener with some delay, and not every entry does.</p>

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
      <button type="button" class="btn btn-ghost btn-sm" id="matter-copy" data-url="${esc(pageUrl(k, r))}">Copy link</button>
      <a class="btn btn-ghost btn-sm" href="https://www.linkedin.com/sharing/share-offsite/?url=${share}" target="_blank" rel="noopener">LinkedIn</a>
      <a class="btn btn-ghost btn-sm" href="mailto:?subject=${encodeURIComponent(w.mailSubject)}&amp;body=${share}">Email</a>
    </div>

    ${related.length ? `<h2 class="matter-h2" style="margin-top:40px;">Other filings naming ${k === "ch11" ? "this debtor" : "these parties"}</h2>
    <ul class="matter-related">${list(related.slice(0, 10))}
    </ul>` : ""}
    ${sameCourt.length ? `<h2 class="matter-h2" style="margin-top:32px;">Other recent ${KINDS[k].noun} in the ${esc(crumb)}</h2>
    <ul class="matter-related">${list(sameCourt)}
    </ul>` : ""}
    <h2 class="matter-h2" style="margin-top:32px;">Recent on ${KINDS[k].listName}</h2>
    <ul class="matter-related">${list(recent)}
    </ul>
    <p class="text-muted matter-foot">From the federal court record via CourtListener and the RECAP Archive, a project of the nonprofit Free Law Project. ${w.foot} Not legal advice. Something wrong here? <a href="/contact.html?matter=${encodeURIComponent(w.contact)}">Tell us</a> and we will correct it.</p>
  </div>
</section>

</main>`;
}

// The list page: every record and its link, baked into the HTML so search
// engines and readers without JavaScript see it all.
function listHtml(k: Kind): string {
  let last = "";
  return data[k].slice().sort(byDate).map((r) => {
    const headRow = r.dateFiled !== last ? `<div class="ch11-day mono">${esc(longDay(r.dateFiled))}</div>\n` : "";
    last = r.dateFiled;
    const d = docketOf(k, r);
    const latest = (d.entries || [])[0];
    const court = k === "ch11" ? bankruptcyCourt(r.court) : civilCourt(r);
    return `${headRow}<div class="ch11-row" data-ch11-row data-search="${esc((r.caseName + " " + r.court + " " + r.docketNumber).toLowerCase())}">
  <div style="min-width:0;">
    <a class="ch11-name" href="${KINDS[k].dir}/${esc(r.slug)}.html">${esc(r.caseName)}</a>
    <div class="ch11-court">${esc(court)} · No. ${esc(r.docketNumber)}${d.dateTerminated ? ` · <strong>closed ${esc(shortDate(d.dateTerminated))}</strong>` : latest && latest.ruling ? ` · latest: ${esc(latest.text.slice(0, 70))}${latest.text.length > 70 ? "…" : ""}` : ""}</div>
  </div>
  ${isCourtListener(r.docketUrl) ? `<a href="${esc(r.docketUrl)}" target="_blank" rel="noopener noreferrer" class="ch11-docket">Docket</a>` : ""}
</div>`;
  }).join("\n");
}

for (const k of Object.keys(KINDS) as Kind[]) {
  const cfg = KINDS[k];
  await Deno.mkdir(cfg.dir, { recursive: true });
  const keep = new Set<string>();
  for (const r of data[k]) {
    const file = `${cfg.dir}/${r.slug}.html`;
    keep.add(file);
    await Deno.writeTextFile(file, headFor(k, r) + mainFor(k, r) + tail);
  }
  let removed = 0;
  for await (const e of Deno.readDir(cfg.dir)) {
    const file = `${cfg.dir}/${e.name}`;
    if (e.isFile && e.name.endsWith(".html") && !keep.has(file)) { await Deno.remove(file); removed++; }
  }
  const page = await Deno.readTextFile(cfg.listPage);
  const start = `<!-- ${cfg.marker}:list:start -->`, end = `<!-- ${cfg.marker}:list:end -->`;
  if (!page.includes(start) || !page.includes(end)) throw new Error(`${cfg.listPage} is missing the ${cfg.marker}:list markers`);
  const earliest = data[k].map((r) => r.dateFiled).sort()[0];
  const updated = page
    .replace(new RegExp(`${start}[\\s\\S]*?${end}`), `${start}\n${data[k].length ? listHtml(k) : `<p class="text-secondary" style="padding:24px;">No ${cfg.noun} listed yet.</p>`}\n${end}`)
    .replace(new RegExp(`<span id="${cfg.marker}-count">[^<]*</span>`), `<span id="${cfg.marker}-count">${data[k].length.toLocaleString("en-US")}</span>`)
    .replace(new RegExp(`<span id="${cfg.marker}-range">[^<]*</span>`), `<span id="${cfg.marker}-range">${earliest ? "since " + esc(fmtDate(earliest)) : ""}</span>`);
  await Deno.writeTextFile(cfg.listPage, updated);
  console.log(`${cfg.dir}: ${keep.size} pages written, ${removed} removed; ${cfg.listPage} lists ${data[k].length}`);
}
