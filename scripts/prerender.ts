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
};
type Data = {
  lastUpdatedDate?: string;
  categories: { id: string; label: string; color: string }[];
  statuses: { id: string; label: string; color: string }[];
  cases: Case[];
  trackedParties?: { name: string; slug?: string; matchTerm?: string }[];
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
        <h3>${c.title}</h3>
        <p class="summary">${c.summary}</p>
        ${c.amount ? `<div class="detail-tag" style="display:inline-block; margin-bottom:14px;">${esc(c.amount)}</div>` : ""}
        <div class="case-card-meta">
          <span${dateTitle}>${fmtDate(c.date)}</span>
          <span>${esc(c.jurisdiction)}</span>
        </div>
      </article>`;
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
  return html.replace(re, `$1${esc(text)}$4`);
}

const cases = [...data.cases].sort(byDateDesc);
const states = new Set(data.cases.map((c) => c.state).filter(Boolean));
const written: string[] = [];

// ---- index.html ---------------------------------------------------------
{
  const f = "index.html";
  let h = await Deno.readTextFile(f);
  h = h.replace(/(<span id="stat-matters" data-count=")\d+(">)\d*(<\/span>)/, `$1${data.cases.length}$2${data.cases.length}$3`);
  h = setText(h, "hero-stat-states", String(states.size), f);
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
  h = fill(h, "cp-case-grid", matches.length ? matches.map(caseCard).join("") : `<p class="text-secondary">No matters currently tracked for ${esc(name)} &mdash; check back as coverage grows.</p>`, f);
  if (h !== h0) { await Deno.writeTextFile(f, h); written.push(f); }
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
    row("With structured party data", String(parties), "Names of the parties recorded as data, not only in the write-up") +
    row("Median lag, event to write-up", median == null ? "n/a" : `${median} days`, within7 == null ? "" : `${within7}% written up within 7 days of the event; the rest are backfilled older matters`) +
    `</tbody></table>`;
  const dense = topStates.slice(0, 8).map(([s, n]) => `${s} ${n}`).join(" · ");
  const thin = topStates.filter(([, n]) => n <= 2).length;
  h = fill(h, "cov-table", table, f);
  h = fill(h, "cov-states", `<p style="font-size:14px; margin:0 0 8px;"><strong>${states.size} states</strong> have at least one matter. Densest: ${esc(dense)}.</p><p class="text-muted" style="font-size:13px; margin:0;">${thin} of those ${states.size} states have two matters or fewer, which is presence, not coverage.</p>`, f);
  h = fill(h, "cov-categories", `<ul style="margin:0; padding-left:18px; font-size:14px;">${catCounts.map(([l, n]) => `<li>${esc(l)}: ${n}</li>`).join("")}</ul>`, f);
  h = setText(h, "cov-generated", `Figures computed from the live dataset on ${new Date().toISOString().slice(0, 10)}.`, f);
  await Deno.writeTextFile(f, h); written.push(f);
}

console.log(`prerendered ${written.length} files: ${data.cases.length} matters, ${states.size} states`);
