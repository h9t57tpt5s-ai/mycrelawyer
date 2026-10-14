// Bakes the live dataset into the HTML so counts, the first page of
// matters, company matter lists and the coverage figures are visible to
// crawlers, buyers and anyone whose JavaScript has not run yet. The page
// scripts still run afterwards and re-render the same markup from the same
// data, so nothing changes for a normal visitor.
//
// Run by .github/workflows/prerender.yml on every push that touches
// js/data.js, and locally with:  deno run --allow-read --allow-write scripts/prerender.ts

type Case = {
  id: string; title: string; category: string; status: string; date: string; addedDate?: string;
  jurisdiction: string; state?: string; amount?: string; source?: string; summary: string;
  significance?: string; tags?: string[]; docketUrl?: string; featured?: boolean; propertyType?: string;
  judge?: string | null; amountUsd?: number | null; parties?: { name: string; role: string }[];
};
type Data = {
  lastUpdatedDate?: string;
  categories: { id: string; label: string; color: string }[];
  statuses: { id: string; label: string; color: string }[];
  cases: Case[];
  trackedParties?: { name: string; slug?: string; matchTerm?: string }[];
  judges?: { name: string; slug?: string }[];
};

const src = await Deno.readTextFile("js/data.js");
const data: Data = new Function(src + "; return RELAW_DATA;")();

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmtDate = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const byDateDesc = (a: Case, b: Case) => new Date(b.date).getTime() - new Date(a.date).getTime();
const cat = (id: string) => data.categories.find((c) => c.id === id) ?? { id, label: id, color: "var(--accent)" };
const status = (id: string) => data.statuses.find((s) => s.id === id) ?? { id, label: id, color: "var(--text-muted)" };

// Same markup as caseCardHtml in js/main.js, with in-view set so the card
// is visible before any script runs.
function caseCard(c: Case): string {
  const k = cat(c.category), s = status(c.status);
  const dateTitle = c.addedDate && c.addedDate !== c.date ? ` title="Added to tracker: ${fmtDate(c.addedDate)}"` : "";
  return `
      <article class="card case-card reveal in-view" data-case-id="${esc(c.id)}">
        <div class="case-card-top">
          <span class="badge" style="background:color-mix(in srgb, ${k.color} 16%, transparent); color:${k.color}; border:1px solid color-mix(in srgb, ${k.color} 35%, transparent);">
            <span class="badge-dot" style="background:${k.color}"></span>${esc(k.label)}
          </span>
          ${c.source === "live" ? `<span class="badge badge-live">Verified Update</span>` : ""}
          <span class="status-pill" style="color:${s.color}">
            <span class="dot" style="background:${s.color}"></span>${esc(s.label)}
          </span>
        </div>
        <h3><a class="case-link" href="/matters/${esc(c.id)}.html">${c.title}</a></h3>
        <p class="summary">${c.summary}</p>
        ${c.amount ? `<div class="detail-tag" style="display:inline-block; margin-bottom:14px;">${esc(c.amount)}</div>` : ""}
        <div class="case-card-meta">
          <span${dateTitle}>${fmtDate(c.date)}</span>
          <span>${esc(c.jurisdiction)}</span>
        </div>
      </article>`;
}


// A company page card: the shared card plus the asset class when recorded
// and the matter's own "why it matters" note, which is the part a risk
// officer reads.
function companyCard(c: Case): string {
  const card = caseCard(c);
  const extra = `${c.propertyType ? `<div class="detail-tag" style="display:inline-block; margin-bottom:10px;">${esc(c.propertyType)}</div>` : ""}` +
    `${c.significance ? `<p class="text-secondary" style="font-size:13px; line-height:1.6; margin:0 0 12px;"><strong>Why it matters:</strong> ${c.significance}</p>` : ""}`;
  return extra ? card.replace('<div class="case-card-meta">', extra + '<div class="case-card-meta">') : card;
}

// Public court-filing rows that name the company: business Chapter 11
// petitions and SEC Item 1.03 disclosures, the only rows the database
// exposes to anonymous readers. Fails soft: a network problem leaves the
// block empty rather than failing the whole prerender.
const SUPABASE_REST = "https://ribmcdyoydhmafnyfhpp.supabase.co/rest/v1/court_filings";
const ANON_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
async function publicFilingsHtml(term: string): Promise<string> {
  const empty = `<p class="text-muted" style="font-size:13px; margin:0;">No public Chapter 11 petition or SEC bankruptcy disclosure naming this company in the filings we monitor. Federal civil suits and state-court matters against a specific company are checked privately for subscribers who save the name in their portfolio.</p>`;
  try {
    const q = `${SUPABASE_REST}?select=filing_type,case_name,court_name,docket_number,date_filed,docket_url&case_name=ilike.*${encodeURIComponent(term.replace(/[%*,()]/g, " ").trim())}*&order=date_filed.desc&limit=10`;
    const r = await fetch(q, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return empty;
    const rows = await r.json() as { filing_type: string; case_name: string; court_name: string | null; docket_number: string | null; date_filed: string; docket_url: string }[];
    if (!rows.length) return empty;
    const ok = (u: string) => u.startsWith("https://www.courtlistener.com/docket/") || u.startsWith("https://www.sec.gov/Archives/edgar/data/");
    return `<ul style="list-style:none; margin:0; padding:0; font-size:13.5px;">` + rows.map((x) =>
      `<li style="padding:10px 0; border-bottom:1px solid var(--border-soft);"><strong>${esc(x.case_name)}</strong> &middot; ${x.filing_type === "sec_8k" ? "SEC Form 8-K, " + esc(x.docket_number) : "Chapter 11 petition, " + esc(x.court_name ?? "")}${x.filing_type !== "sec_8k" && x.docket_number ? ", No. " + esc(x.docket_number) : ""} &middot; filed ${fmtDate(x.date_filed)}${ok(x.docket_url) ? ` &middot; <a href="${esc(x.docket_url)}" target="_blank" rel="noopener noreferrer">${x.filing_type === "sec_8k" ? "filing" : "docket"}</a>` : ""}</li>`).join("") + `</ul>`;
  } catch {
    return empty;
  }
}

// Replace the inner HTML of the element with this id. The element must be
// written as an opening tag followed directly by </tag> (empty) or by a
// previous prerender block, so a re-run replaces rather than appends.
function fill(html: string, id: string, inner: string, file: string): string {
  const open = new RegExp(`(<(\\w+)[^>]*\\bid="${id}"[^>]*>)`);
  const m = html.match(open);
  if (!m || m.index == null) throw new Error(`${file}: no element with id="${id}"`);
  const tag = m[2];
  const start = m.index + m[0].length;
  const marker = `<!--prerender:${id}-->`;
  const endMarker = `<!--/prerender:${id}-->`;
  let end: number;
  if (html.startsWith(marker, start)) {
    end = html.indexOf(endMarker, start);
    if (end < 0) throw new Error(`${file}: unterminated prerender block for ${id}`);
    end += endMarker.length;
  } else if (html.startsWith(`</${tag}>`, start)) {
    end = start;
  } else {
    throw new Error(`${file}: #${id} is neither empty nor a prerender block`);
  }
  return html.slice(0, start) + marker + inner + endMarker + html.slice(end);
}

function setText(html: string, id: string, text: string, file: string): string {
  const re = new RegExp(`(<(\\w+)[^>]*\\bid="${id}"[^>]*>)([^<]*)(</\\2>)`);
  if (!re.test(html)) throw new Error(`${file}: no simple text element with id="${id}"`);
  // A replacement function, not a string: "$1".."$4" are special to
  // String.replace and a text containing e.g. "$170M" would be misread as
  // a backreference (the exact bug found in build_matter_pages.ts /
  // build_record_pages.ts on 2026-10-11, fixed the same way there).
  return html.replace(re, (_, p1, _tag, _inner, p4) => `${p1}${esc(text)}${p4}`);
}

const cases = [...data.cases].sort(byDateDesc);
const states = new Set(data.cases.map((c) => c.state).filter(Boolean));
// D.C. is not a state: counting it as one produced "51 states" (Jeff,
// 2026-09-26: "this make us look like complete idiots").
const realStates = [...states].filter((s) => s !== "DC").length;
const withDC = states.has("DC");
const statesLabel = `${realStates} state${realStates === 1 ? "" : "s"}${withDC ? " and D.C." : ""}`;
const written: string[] = [];

// ---- companies.html / judges.html: A-Z link lists -----------------------
// Backlog item 0 (2026-10-09): these lists used to be hand-written, so a
// company or judge the digest added later had no static link and site_audit
// counted its profile page as an orphan (imp-001/imp-002 fixed the lists as
// they stood then; imp-003 moved generation here so a new entry is linked
// automatically as soon as its profile page exists).
async function fileExists(path: string): Promise<boolean> {
  try { await Deno.stat(path); return true; } catch { return false; }
}
async function azList(entries: { name: string; slug?: string }[], prefix: string): Promise<string> {
  const withPages: { name: string; slug: string }[] = [];
  for (const e of entries) {
    if (!e.slug) continue;
    if (await fileExists(`${prefix}-${e.slug}.html`)) withPages.push({ name: e.name, slug: e.slug });
  }
  withPages.sort((a, b) => a.name.localeCompare(b.name));
  return withPages.map((e) => `<a href="${prefix}-${e.slug}.html" style="font-size:12.5px;">${esc(e.name)}</a>`).join("\n      ");
}
{
  const f = "companies.html";
  let h = await Deno.readTextFile(f);
  h = fill(h, "companies-az-list", await azList(data.trackedParties ?? [], "company"), f);
  await Deno.writeTextFile(f, h); written.push(f);
}
{
  const f = "judges.html";
  let h = await Deno.readTextFile(f);
  h = fill(h, "judges-az-list", await azList(data.judges ?? [], "judge"), f);
  await Deno.writeTextFile(f, h); written.push(f);
}

// ---- index.html ---------------------------------------------------------
{
  const f = "index.html";
  let h = await Deno.readTextFile(f);
  h = h.replace(/(<span id="stat-matters" data-count=")\d+(">)\d*(<\/span>)/, `$1${data.cases.length}$2${data.cases.length}$3`);
  h = setText(h, "hero-stat-states", String(realStates), f);
  h = setText(h, "hero-stat-states-label", withDC ? "States + D.C." : "States", f);
  h = setText(h, "hero-stat-categories", String(data.categories.length), f);
  h = fill(h, "featured-grid", cases.slice(0, 3).map(caseCard).join(""), f);
  const words: Record<number, string> = { 6: "Six", 7: "Seven", 8: "Eight", 9: "Nine", 10: "Ten", 11: "Eleven", 12: "Twelve" };
  h = setText(h, "category-count-heading", `${words[data.categories.length] ?? data.categories.length} practice areas, one dashboard`, f);
  h = fill(h, "category-grid", data.categories.map((k) => {
    const n = data.cases.filter((c) => c.category === k.id).length;
    return `<a href="litigation.html?category=${k.id}" class="card in-view" style="display:block;">
        <span class="badge-dot" style="display:inline-block;background:${k.color}; width:10px; height:10px; border-radius:50%; margin-bottom:16px;"></span>
        <h3 style="font-size:1.05rem;">${esc(k.label)}</h3>
        <p class="text-muted mono" style="font-size:12.5px; margin-top:10px;">${n} tracked matter${n === 1 ? "" : "s"}</p>
      </a>`;
  }).join(""), f);
  await Deno.writeTextFile(f, h); written.push(f);
}

// ---- litigation.html: first page of matters, newest first --------------
{
  const f = "litigation.html";
  const PAGE = 24;
  let h = await Deno.readTextFile(f);
  h = setText(h, "results-count", `${data.cases.length} matters`, f);
  h = fill(h, "case-grid", cases.slice(0, PAGE).map(caseCard).join("") +
    `<p class="text-muted" style="grid-column:1 / -1; font-size:12.5px;">Showing the ${PAGE} most recent of ${data.cases.length} matters. Filters and the full list load with JavaScript.</p>`, f);
  await Deno.writeTextFile(f, h); written.push(f);
}

// ---- company-*.html: the matter list, dated and with status -------------
for await (const entry of Deno.readDir(".")) {
  if (!entry.isFile || !/^company-.*\.html$/.test(entry.name)) continue;
  const f = entry.name;
  const h0 = await Deno.readTextFile(f);
  const nameM = h0.match(/const COMPANY_NAME = "([^"]+)"/);
  const termM = h0.match(/const MATCH_TERM = (null|"[^"]*")/);
  if (!nameM || !termM) continue;
  const name = nameM[1];
  const term = termM[1] === "null" ? name : JSON.parse(termM[1]);
  const q = term.toLowerCase();
  const matches = data.cases.filter((c) => [c.title, c.summary, (c.tags ?? []).join(" "), c.jurisdiction].join(" ").toLowerCase().includes(q)).sort(byDateDesc);
  const cats = [...new Set(matches.map((c) => c.category))];
  const sts = [...new Set(matches.map((c) => c.state).filter(Boolean))];
  const dates = matches.map((c) => c.date).sort();
  const monthYear = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const stats = `
      <div class="card reveal in-view" style="text-align:center; padding:24px;">
        <div class="mono" style="font-size:2rem; font-weight:600; color:var(--accent);">${matches.length}</div>
        <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-top:6px;">Matter${matches.length === 1 ? "" : "s"} Tracked</div>
      </div>
      <div class="card reveal in-view" style="padding:24px;">
        <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:10px;">Practice Areas</div>
        <div style="display:flex; flex-wrap:wrap; gap:6px;">${cats.length ? cats.map((id) => { const k = cat(id); return `<span class="badge" style="background:color-mix(in srgb, ${k.color} 16%, transparent); color:${k.color}; border:1px solid color-mix(in srgb, ${k.color} 35%, transparent);">${esc(k.label)}</span>`; }).join("") : `<span class="text-muted" style="font-size:13px;">None yet</span>`}</div>
      </div>
      <div class="card reveal in-view" style="padding:24px;">
        <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:6px;">Coverage Window</div>
        <div style="font-size:14px; font-weight:600;">${dates.length ? `${monthYear(dates[0])} &ndash; ${monthYear(dates[dates.length - 1])}` : "&mdash;"}</div>
        <div class="text-muted mono" style="font-size:11.5px; margin-top:6px;">${esc(sts.join(", "))}</div>
      </div>`;
  let h = fill(h0, "cp-stats", stats, f);
  h = fill(h, "cp-case-grid", matches.length ? matches.map(companyCard).join("") : `<p class="text-secondary">No matters currently tracked for ${esc(name)} &mdash; check back as coverage grows.</p>`, f);
  if (h.includes('id="cp-filings"')) h = fill(h, "cp-filings", await publicFilingsHtml(term), f);
  if (h !== h0) { await Deno.writeTextFile(f, h); written.push(f); }
}

// ---- "From the court record" block: index.html + litigation.html -------
// Backlog item 3 (playbook, added 2026-10-09): homepage and litigation.html
// never linked Chapter 11 Watch / Federal Lawsuit Watch outside the nav
// menu. Built from the same JSON the digest writes, so the counts and the
// three newest filings shown are always literally right.
type Filing = { caseName: string; court: string; dateFiled: string; slug: string };
async function newestFilings(path: string): Promise<{ all: Filing[]; newest: Filing[] }> {
  const j = JSON.parse(await Deno.readTextFile(path)) as { filings: Filing[] };
  const newest = [...j.filings].sort((a, b) => b.dateFiled.localeCompare(a.dateFiled)).slice(0, 3);
  return { all: j.filings, newest };
}
function filingCard(label: string, noun: string, newest: Filing[], total: number, prefix: string, href: string): string {
  const items = newest.map((f) => `
      <li style="padding:9px 0; border-bottom:1px solid var(--border-soft);">
        <a href="${prefix}/${esc(f.slug)}.html" style="font-size:13.5px; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(f.caseName)}</a>
        <div class="text-muted" style="font-size:12px; margin-top:2px;">${esc(f.court)} &middot; filed ${fmtDate(f.dateFiled)}</div>
      </li>`).join("");
  return `
    <div class="card reveal in-view" style="padding:24px;">
      <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-bottom:10px;">${esc(label)}</div>
      <ul style="list-style:none; margin:0 0 14px; padding:0;">${items}</ul>
      <a href="${href}" class="text-accent" style="display:inline; font-size:13.5px;">See all ${total} ${esc(noun)} &rarr;</a>
    </div>`;
}
{
  const ch11 = await newestFilings("ops/ch11-petitions.json");
  const suits = await newestFilings("ops/federal-suits.json");
  const html = filingCard("Chapter 11 Watch", "Chapter 11 petitions", ch11.newest, ch11.all.length, "chapter-11", "bankruptcy-watch.html") +
    filingCard("Federal Lawsuit Watch", "federal lawsuits", suits.newest, suits.all.length, "federal-cases", "lawsuit-watch.html");
  for (const f of ["index.html", "litigation.html"]) {
    let h = await Deno.readTextFile(f);
    h = fill(h, "court-record-today", html, f);
    await Deno.writeTextFile(f, h); written.push(f);
  }
}

// ---- coverage.html: the coverage math -----------------------------------
{
  const f = "coverage.html";
  let h = await Deno.readTextFile(f);
  // Court names use abbreviations ("U.S.", "S.D.N.Y.", "Bankr."), so no
  // word boundaries here: a "." is not a word character and \b would fail.
  const federalRe = /U\.S\.|United States|Bankr\.|Bankruptcy Court|S\.D\.|N\.D\.|E\.D\.|W\.D\.|(^|[^A-Za-z])D\. ?(Del|N\.J|Mass|Conn|Md|Ariz|Nev|Colo|Minn|Or|Kan|Utah|R\.I|D\.C|Idaho|Neb|Md)|Circuit Court of Appeals|\d(st|nd|rd|th) Cir\.|Fed\. Cl|Federal Claims|Court of International Trade/;
  const federal = data.cases.filter((c) => federalRe.test(c.jurisdiction)).length;
  const docket = data.cases.filter((c) => c.docketUrl).length;
  const lags = data.cases.filter((c) => c.addedDate && c.date).map((c) => (new Date(c.addedDate!).getTime() - new Date(c.date).getTime()) / 86_400_000).filter((d) => d >= 0).sort((a, b) => a - b);
  const median = lags.length ? Math.round(lags[Math.floor(lags.length / 2)]) : null;
  const within7 = lags.length ? Math.round(100 * lags.filter((d) => d <= 7).length / lags.length) : null;
  const stateCounts = new Map<string, number>();
  for (const c of data.cases) if (c.state) stateCounts.set(c.state, (stateCounts.get(c.state) ?? 0) + 1);
  const topStates = [...stateCounts.entries()].sort((a, b) => b[1] - a[1]);
  const catCounts = data.categories.map((k) => [k.label, data.cases.filter((c) => c.category === k.id).length] as const).sort((a, b) => b[1] - a[1]);
  const last30 = data.cases.filter((c) => c.addedDate && (Date.now() - new Date(c.addedDate).getTime()) / 86_400_000 <= 30).length;
  const parties = data.cases.filter((c) => Array.isArray((c as unknown as { parties?: unknown[] }).parties) && ((c as unknown as { parties: unknown[] }).parties).length).length;
  const row = (k: string, v: string, note = "") => `<tr><td style="padding:10px 0; border-bottom:1px solid var(--border-soft);">${k}${note ? `<div class="text-muted" style="font-size:12px; margin-top:2px;">${note}</div>` : ""}</td><td class="mono" style="padding:10px 0; border-bottom:1px solid var(--border-soft); text-align:right; white-space:nowrap; vertical-align:top;">${v}</td></tr>`;
  const table = `<table style="width:100%; border-collapse:collapse; font-size:14px;"><tbody>` +
    row("Tracked matters", String(data.cases.length), `Last dataset update ${data.lastUpdatedDate ?? "unknown"}; ${last30} added in the last 30 days`) +
    row("Federal court", String(federal), "Read from each matter's court name") +
    row("State court", String(data.cases.length - federal)) +
    row("Docket-linked", `${docket} (${Math.round(100 * docket / data.cases.length)}%)`, "A confirmed link to the actual docket or opinion; every other matter is sourced to reporting") +
    row("Sourced to reporting only", String(data.cases.length - docket)) +
    row("With structured party data", String(parties), "Business and government parties recorded as data, not only in the write-up") +
    row("With a named presiding judge", String(data.cases.filter((c) => c.judge).length), "Only where a source names the judge for that matter") +
    row("With a stated dollar amount", String(data.cases.filter((c) => typeof c.amountUsd === "number").length), "The loan, claim, judgment or settlement figure a source states; never estimated") +
    row("Median lag, event to write-up", median == null ? "n/a" : `${median} days`, within7 == null ? "" : `${within7}% written up within 7 days of the event; the rest are backfilled older matters`) +
    `</tbody></table>`;
  const dense = topStates.slice(0, 8).map(([s, n]) => `${s} ${n}`).join(" · ");
  const thin = topStates.filter(([, n]) => n <= 2).length;
  h = fill(h, "cov-table", table, f);
  h = fill(h, "cov-states", `<p style="font-size:14px; margin:0 0 8px;"><strong>${statesLabel}</strong> have at least one matter. Densest: ${esc(dense)}.</p><p class="text-muted" style="font-size:13px; margin:0;">${thin} of those ${states.size} jurisdictions have two matters or fewer, which is presence, not coverage.</p>`, f);
  h = fill(h, "cov-categories", `<ul style="margin:0; padding-left:18px; font-size:14px;">${catCounts.map(([l, n]) => `<li>${esc(l)}: ${n}</li>`).join("")}</ul>`, f);
  h = setText(h, "cov-generated", `Figures computed from the live dataset on ${new Date().toISOString().slice(0, 10)}.`, f);
  await Deno.writeTextFile(f, h); written.push(f);
}

// ---- monthly-report.html: CRE bankruptcy/lawsuit counts, by state/court/word ----
// Backlog G4 (traffic; added 2026-10-13): a monthly report built entirely from
// ops/ch11-petitions.json and ops/federal-suits.json, every number computed
// from the filings, never typed. Reports the most recently *complete*
// calendar month (the current month is still filling in) plus a running
// count of the still-partial current month for context.
type Filing2 = { caseName: string; court: string; dateFiled: string; slug: string };
const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO",
  Connecticut: "CT", Delaware: "DE", "District of Columbia": "DC", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS", Kentucky: "KY",
  Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND",
  Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT", Vermont: "VT",
  Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};
const STATE_NAMES_BY_LEN = Object.keys(STATE_ABBR).sort((a, b) => b.length - a.length);
function stateOfCourt(court: string): string | null {
  for (const name of STATE_NAMES_BY_LEN) if (court.includes(name)) return STATE_ABBR[name];
  return null;
}
const monthOf = (dateFiled: string) => dateFiled.slice(0, 7);
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
// Replacement function, not a string, for the same "$1"-is-special-to-
// String.replace reason as setText() above.
function setTag(html: string, re: RegExp, value: string, file: string): string {
  if (!re.test(html)) throw new Error(`${file}: tag not found for ${re}`);
  return html.replace(re, (_m, p1: string, p2: string) => `${p1}${esc(value)}${p2}`);
}
{
  const f = "monthly-report.html";
  let h = await Deno.readTextFile(f);
  const ch11All = (JSON.parse(await Deno.readTextFile("ops/ch11-petitions.json")) as { filings: Filing2[] }).filings;
  const suitsAll = (JSON.parse(await Deno.readTextFile("ops/federal-suits.json")) as { filings: Filing2[] }).filings;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const pastMonths = [...new Set([...ch11All, ...suitsAll].map((x) => monthOf(x.dateFiled)))].filter((m) => m < currentMonth).sort();
  const reportMonth = pastMonths[pastMonths.length - 1];
  const periodLabel = monthLabel(reportMonth);

  const ch11Month = ch11All.filter((x) => monthOf(x.dateFiled) === reportMonth);
  const suitsMonth = suitsAll.filter((x) => monthOf(x.dateFiled) === reportMonth);
  const combined = [...ch11Month, ...suitsMonth];

  const title = `CRE Bankruptcy & Lawsuit Report — ${periodLabel} — CREdocket`;
  const desc = `Monthly counts of commercial real estate Chapter 11 petitions and federal lawsuits filed in ${periodLabel}, computed from public court records: by state, by court, and by property type named in the filing.`;
  h = setTag(h, /(<title>)[^<]*(<\/title>)/, title, f);
  h = setTag(h, /(<meta name="description" content=")[^"]*(" \/>)/, desc, f);
  h = setTag(h, /(<meta property="og:title" content=")[^"]*(" \/>)/, title, f);
  h = setTag(h, /(<meta property="og:description" content=")[^"]*(" \/>)/, desc, f);
  h = setTag(h, /(<meta name="twitter:title" content=")[^"]*(" \/>)/, title, f);
  h = setTag(h, /(<meta name="twitter:description" content=")[^"]*(" \/>)/, desc, f);

  h = fill(h, "report-period", `${periodLabel}: ${ch11Month.length} commercial real estate Chapter 11 petitions and ${suitsMonth.length} CRE-related federal civil suits, newly filed in federal courts nationwide.`, f);

  const tile = (n: number, label: string) => `
      <div class="card reveal in-view" style="text-align:center; padding:24px;">
        <div class="mono" style="font-size:2rem; font-weight:600; color:var(--accent);">${n}</div>
        <div class="text-muted" style="font-size:12px; text-transform:uppercase; letter-spacing:0.04em; margin-top:6px;">${esc(label)}</div>
      </div>`;
  h = fill(h, "report-headline", tile(ch11Month.length, "Chapter 11 Petitions") + tile(suitsMonth.length, "Federal Lawsuits") + tile(combined.length, "Combined Filings"), f);

  const row2 = (label: string, n: number, last: boolean) => `<tr><td style="padding:8px 0;${last ? "" : " border-bottom:1px solid var(--border-soft);"}">${esc(label)}</td><td class="mono" style="padding:8px 0;${last ? "" : " border-bottom:1px solid var(--border-soft);"} text-align:right;">${n}</td></tr>`;

  const stateCounts = new Map<string, number>();
  for (const x of combined) { const st = stateOfCourt(x.court); if (st) stateCounts.set(st, (stateCounts.get(st) ?? 0) + 1); }
  const abbrToFull = Object.fromEntries(Object.entries(STATE_ABBR).map(([full, abbr]) => [abbr, full]));
  const topStates = [...stateCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const withDCThisMonth = stateCounts.has("DC");
  const realStateCount = stateCounts.size - (withDCThisMonth ? 1 : 0);
  const stateCountLabel = `${realStateCount} state${realStateCount === 1 ? "" : "s"}${withDCThisMonth ? " and D.C." : ""}`;
  const statesHtml = `<table style="width:100%; border-collapse:collapse; font-size:14px;"><tbody>${topStates.map(([abbr, n], i) => row2(abbrToFull[abbr], n, i === topStates.length - 1)).join("")}</tbody></table>` +
    `<p class="text-muted" style="font-size:12px; margin:10px 0 0;">Top ${topStates.length} of ${stateCountLabel} with at least one filing this month; the rest had one or two each.</p>`;
  h = fill(h, "report-states", statesHtml, f);

  const courtCounts = new Map<string, number>();
  for (const x of combined) courtCounts.set(x.court, (courtCounts.get(x.court) ?? 0) + 1);
  const topCourts = [...courtCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const courtLabel = (c: string) => c.replace("United States Bankruptcy Court", "U.S. Bankruptcy Court");
  const courtsHtml = `<table style="width:100%; border-collapse:collapse; font-size:13.5px;"><tbody>${topCourts.map(([c, n], i) => row2(courtLabel(c), n, i === topCourts.length - 1)).join("")}</tbody></table>`;
  h = fill(h, "report-courts", courtsHtml, f);

  const WORD_BUCKETS: [string, string[]][] = [
    ["hospitality", ["hotel", "motel", "lodging", "hospitality"]],
    ["industrial or warehouse", ["industrial", "warehouse"]],
    ["multifamily/apartment", ["apartment", "multifamily"]],
    ["office", ["office"]],
    ["retail", ["retail"]],
    ["self-storage", ["storage"]],
  ];
  const bucketCounts = new Map<string, number>();
  let anyMatched = 0;
  for (const x of combined) {
    const nameL = x.caseName.toLowerCase();
    for (const [bucket, terms] of WORD_BUCKETS) {
      if (terms.some((t) => nameL.includes(t))) { bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1); anyMatched++; break; }
    }
  }
  const bucketParts = [...bucketCounts.entries()].map(([b, n]) => `<strong>${esc(b)}</strong> in ${n}`);
  const pct = combined.length ? Math.round(100 * anyMatched / combined.length) : 0;
  const wordsHtml = `<p class="text-secondary" style="font-size:14px; line-height:1.7; margin:0 0 10px;">${anyMatched} of this month's ${combined.length} filings (${pct}%) name a property type directly in the case caption${bucketParts.length ? ": " + bucketParts.join(", ") : ""}.</p>` +
    `<p class="text-muted" style="font-size:12.5px; margin:0;">This is a literal word match on the case name, not a classification of every filing &mdash; most captions (an LLC's formal name) don't name a property type at all, so this is a lower bound, not a full breakdown.</p>`;
  h = fill(h, "report-property-words", wordsHtml, f);

  const ch11Partial = ch11All.filter((x) => monthOf(x.dateFiled) === currentMonth);
  const suitsPartial = suitsAll.filter((x) => monthOf(x.dateFiled) === currentMonth);
  const combinedPartial = ch11Partial.length + suitsPartial.length;
  const prevMonth = pastMonths[pastMonths.length - 2];
  const prevCh11 = prevMonth ? ch11All.filter((x) => monthOf(x.dateFiled) === prevMonth).length : null;
  // The latest filing date actually in the partial month's data, not
  // "today" -- the data feed can lag a day or more behind the run date.
  const partialDates = [...ch11Partial, ...suitsPartial].map((x) => x.dateFiled).sort();
  const asOfLabel = partialDates.length
    ? new Date(partialDates[partialDates.length - 1] + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" })
    : monthLabel(currentMonth);
  const sharePart = combined.length ? Math.round(100 * combinedPartial / combined.length) : 0;
  let momentum = `<p class="text-secondary" style="font-size:14px; line-height:1.7; margin:0;">${monthLabel(currentMonth)} is still in progress: as of ${asOfLabel}, ${combinedPartial} filings are already on the board (${ch11Partial.length} Chapter 11 petitions, ${suitsPartial.length} federal lawsuits) &mdash; ${sharePart}% of ${periodLabel}'s full-month total.`;
  if (prevCh11 != null) momentum += ` Chapter 11 filings alone ${prevCh11 <= ch11Month.length ? "rose" : "fell"} from ${prevCh11} in ${monthLabel(prevMonth)} to ${ch11Month.length} in ${periodLabel}.`;
  momentum += `</p>`;
  h = fill(h, "report-momentum", momentum, f);

  h = setText(h, "report-generated", `Figures computed from the live dataset on ${new Date().toISOString().slice(0, 10)}.`, f);

  await Deno.writeTextFile(f, h); written.push(f);
}

console.log(`prerendered ${written.length} files: ${data.cases.length} matters, ${statesLabel}`);
