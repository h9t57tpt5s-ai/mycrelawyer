// Texas Foreclosure Sales list (2026-11-06): fills texas-foreclosures.html
// from ops/tx-foreclosures.json (scripts/pull_tx_foreclosures.py). Each row
// links to the property's page, which scripts/build_entity_pages.ts writes
// (js/entity-index.json "tx" maps county:parcel to that page), so this runs
// after it. Upcoming sales first, soonest first; then past sales, latest first.
//
// Run by .github/workflows/prerender.yml; locally:
//   deno run --allow-read --allow-write scripts/build_tx_list.ts
type Tx = {
  county: string; saleDate: string; address: string; city: string; propertyName: string; propertyType: string; use: string;
  sqft: number | null; units: number | null; owner: string; lender: string; originalAmount: number | null; parcel: string;
};
const LIST = "texas-foreclosures.html";
const readJson = async <T>(p: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await Deno.readTextFile(p)); } catch { return fallback; }
};
const rows = (await readJson<{ properties: Tx[] }>("ops/tx-foreclosures.json", { properties: [] })).properties;
const pages = (await readJson<{ tx?: Record<string, string> }>("js/entity-index.json", {})).tx || {};
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const longDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const money = (n: number | null) => (n ? "$" + Math.round(n).toLocaleString("en-US") : "");
const today = new Date().toISOString().slice(0, 10);

const listed = rows.filter((r) => pages[`${r.county}:${r.parcel}`]);
const upcoming = listed.filter((r) => r.saleDate >= today).sort((a, b) => a.saleDate.localeCompare(b.saleDate) || a.city.localeCompare(b.city));
const past = listed.filter((r) => r.saleDate < today).sort((a, b) => b.saleDate.localeCompare(a.saleDate) || a.city.localeCompare(b.city));

// The appraisal roll's unit count is apartments for multifamily and rooms
// for hotels; for other uses it means nothing to a reader.
const unitsLabel = (r: Tx) => !r.units ? "" : r.propertyType === "Hospitality" ? `${r.units} rooms`
  : ["Multifamily", "Senior Living"].includes(r.propertyType) ? `${r.units} units` : "";

function rowHtml(r: Tx): string {
  const name = r.propertyName || r.address;
  const size = [unitsLabel(r), r.sqft ? `${r.sqft.toLocaleString("en-US")} sq ft` : ""].filter(Boolean).join(", ");
  const bits = [`${r.city}, TX`, `${r.county} County`, r.propertyType || r.use, size, r.originalAmount ? `${money(r.originalAmount)} loan` : "", r.lender].filter(Boolean);
  return `<div class="ch11-row" data-ch11-row data-search="${esc([name, r.address, r.city, r.county, r.propertyType, r.use, r.owner, r.lender].join(" ").toLowerCase())}">
  <div style="min-width:0;">
    <a class="ch11-name" href="${esc(pages[`${r.county}:${r.parcel}`].slice(1))}">${esc(name)}</a>
    <div class="ch11-court">${esc(bits.join(" · "))}</div>
  </div>
</div>`;
}
function section(list: Tx[], label: (d: string) => string): string {
  let last = "";
  return list.map((r) => {
    const head = r.saleDate !== last ? `<div class="ch11-day mono">${esc(label(r.saleDate))}</div>\n` : "";
    last = r.saleDate;
    return head + rowHtml(r);
  }).join("\n");
}

const body = !listed.length ? `<p class="text-secondary" style="padding:24px;">No properties listed yet.</p>`
  : [upcoming.length ? section(upcoming, (d) => `Sale ${longDay(d)}`) : `<p class="text-secondary" style="padding:16px 24px;">No upcoming commercial sales posted yet.</p>`,
     past.length ? section(past, (d) => `Was set for ${longDay(d)}`) : ""].filter(Boolean).join("\n");
const page = await Deno.readTextFile(LIST);
const start = "<!-- tx:list:start -->", end = "<!-- tx:list:end -->";
if (!page.includes(start) || !page.includes(end)) throw new Error(`${LIST} is missing the tx:list markers`);
const range = upcoming.length ? `with ${upcoming.length} upcoming sale${upcoming.length === 1 ? "" : "s"}` : "";
const updated = page
  .replace(new RegExp(`${start}[\\s\\S]*?${end}`), () => `${start}\n${body}\n${end}`)
  .replace(/<span id="tx-count">[^<]*<\/span>/, () => `<span id="tx-count">${listed.length.toLocaleString("en-US")}</span>`)
  .replace(/<span id="tx-noun">[^<]*<\/span>/, () => `<span id="tx-noun">${listed.length === 1 ? "property" : "properties"}</span>`)
  .replace(/<span id="tx-range">[^<]*<\/span>/, () => `<span id="tx-range">${esc(range)}</span>`);
await Deno.writeTextFile(LIST, updated);
console.log(`${LIST}: ${listed.length} properties (${upcoming.length} upcoming)`);
