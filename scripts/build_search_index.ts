// Search index of the generated record pages (2026-11-16).
//
// The site search (js/search.js) only covered tracker matters, judges,
// companies and a hand list of tools, so a search for a Chapter 11 debtor,
// a federal suit, a CMBS property, a Texas foreclosure posting or a state
// court case found nothing: a signed-in reader got "0 results" three times
// in a row on Nov. 12 after browsing exactly those pages. This writes
// js/search-index.json from each generated page's own <title> and meta
// description, so the index can never say more than the page does.
// search.js fetches it on the first keystroke.
//
// Run by .github/workflows/prerender.yml after the pages are built; locally:
//   deno run --allow-read --allow-write scripts/build_search_index.ts

const FOLDERS: Record<string, string> = {
  "chapter-11": "Chapter 11 case",
  "federal-cases": "Federal lawsuit",
  "state-cases": "State court case",
  "cmbs": "CMBS loan",
  "properties": "Property",
  "parties": "Company",
  "markets": "Market",
  "outcomes": "Court outcomes",
};
// Root pages worth finding by name that are not in search.js's tool list.
const ROOT_PAGES = ["distress-radar.html", "texas-foreclosures.html", "cmbs-watch.html", "bankruptcy-watch.html", "lawsuit-watch.html",
  "state-court-watch.html", "bank-cre-stress.html", "outcomes.html", "markets.html", "newsletter.html", "briefs.html", "corrections.html",
  "data-center-litigation-tracker.html", "office-foreclosure-tracker.html", "cmbs-litigation-tracker.html", "litigation-index.html"];

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&ndash;/g, "–").replace(/&mdash;/g, "—").replace(/&nbsp;/g, " ");

function entry(path: string, html: string, kind: string) {
  const head = html.slice(0, 12000);
  const t = /<title>([^<]*)<\/title>/.exec(head)?.[1];
  if (!t) return null;
  if (/<meta name="robots" content="noindex/i.test(head)) return null;
  const d = /<meta name="description" content="([^"]*)"/.exec(head)?.[1] || "";
  return { t: decode(t).replace(/\s+—\s+CREdocket\s*$/, "").trim(), d: decode(d).slice(0, 220), u: "/" + path, k: kind };
}

const out: { t: string; d: string; u: string; k: string }[] = [];
for (const [folder, kind] of Object.entries(FOLDERS)) {
  let names: string[] = [];
  try { names = [...Deno.readDirSync(folder)].map((e) => e.name).filter((n) => n.endsWith(".html")).sort(); } catch { continue; }
  for (const n of names) {
    const e = entry(`${folder}/${n}`, await Deno.readTextFile(`${folder}/${n}`), kind);
    if (e) out.push(e);
  }
}
for (const f of ROOT_PAGES) {
  try {
    const e = entry(f, await Deno.readTextFile(f), "Page");
    if (e) out.push(e);
  } catch { /* page not built here */ }
}
await Deno.writeTextFile("js/search-index.json", JSON.stringify({ generated: new Date().toISOString().slice(0, 10), items: out }));
console.log(`search index: ${out.length} pages`);
