// Builds landing pages for the companies, governments and properties that
// appear in more than one tracker matter (2026-10-14):
//   parties/<slug>.html     "<Company>: commercial real estate litigation"
//   properties/<slug>.html  "<Property>: litigation and court record"
//
// Search traffic comes from people looking up a company or a building
// ("LNR Partners lawsuit", "Via Mizner foreclosure"). A matter page answers
// one case; these pages collect every matter about the same company or
// property, plus the federal court records that name it. A page exists only
// when at least two written matters share the party or property, so no page
// is a thin copy of a single matter. Companies with a curated profile
// (RELAW_DATA.trackedParties -> company-<slug>.html) and federal and state
// governments get no page here. js/entity-index.json maps party keys and
// property keys to their pages so matter pages can link to them.
//
// Run by .github/workflows/prerender.yml before build_matter_pages.ts;
// locally:  deno run --allow-read --allow-write scripts/build_entity_pages.ts

type Party = { name: string; role: string };
type Property = { name?: string | null; address?: string | null; city?: string | null; state?: string | null };
type Case = {
  id: string; title: string; category: string; status: string; date: string; addedDate?: string;
  jurisdiction: string; state?: string; summary: string; parties?: Party[]; property?: Property | null;
  amount?: string; propertyType?: string;
};
type Record_ = { caseName: string; court: string; dateFiled: string; slug: string; docketNumber?: string };

const SITE = "https://credocket.com";
const src = await Deno.readTextFile("js/data.js");
const data = new Function(src + "; return RELAW_DATA;")() as {
  categories: { id: string; label: string; color: string }[];
  statuses: { id: string; label: string; color: string }[];
  states: Record<string, string>;
  cases: Case[];
  trackedParties?: { name: string; matchTerm?: string | null; slug: string }[];
};

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const plain = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();
const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const fmtDate = (iso?: string) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const cat = (id: string) => data.categories.find((c) => c.id === id) ?? { id, label: id, color: "var(--accent)" };
const status = (id: string) => data.statuses.find((s) => s.id === id) ?? { id, label: id, color: "var(--text-muted)" };
const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/['’.]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

// Same rule as scripts/build_matter_pages.ts and js/main.js partyKey.
export function partyKey(name: string): string {
  let s = name.toLowerCase().replace(/&/g, "and").replace(/\(.*?\)/g, "").replace(/[.,']/g, "").replace(/\s+/g, " ").trim();
  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/\s+(llc|inc|incorporated|corp|corporation|co|company|lp|llp|ltd|na|national association|plc)$/, "").trim();
  }
  return s.replace(/^the\s+/, "");
}
export function propertyKey(p: Property | null | undefined): string {
  if (!p || !p.state || !(p.address || p.name)) return "";
  const base = (p.address || p.name || "").toLowerCase()
    .replace(/\b(street)\b/g, "st").replace(/\b(avenue)\b/g, "ave").replace(/\b(boulevard)\b/g, "blvd").replace(/\b(road)\b/g, "rd")
    .replace(/[^a-z0-9]+/g, " ").trim();
  return base ? `${base}|${p.state.toUpperCase()}` : "";
}

const SOVEREIGN = /^(united states( of america)?|usa|(the )?state of [a-z ]+|(the )?commonwealth of [a-z ]+)$/;
const curated = (data.trackedParties || []).map((t) => ({ key: partyKey(t.name), term: (t.matchTerm || t.name).toLowerCase(), slug: t.slug }));
const word = (term: string) => new RegExp(`(^|[^a-z0-9])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^a-z0-9])`);
const curatedFor = (key: string, name: string) =>
  curated.find((t) => t.key === key || word(t.term).test(name.toLowerCase()) || word(partyKey(t.term)).test(key));

// Federal court records that name a party (Chapter 11 Watch and Federal
// Lawsuit Watch pages), matched on either side of the caption.
const records: { rec: Record_; folder: string; keys: string[] }[] = [];
for (const [file, folder] of [["ops/ch11-petitions.json", "chapter-11"], ["ops/federal-suits.json", "federal-cases"]]) {
  try {
    for (const r of JSON.parse(await Deno.readTextFile(file)).filings as Record_[]) {
      records.push({ rec: r, folder, keys: r.caseName.split(/\s+v\.?\s+/i).map((x) => partyKey(x.replace(/,?\s+et al\.?$/i, ""))) });
    }
  } catch { /* file missing: no records */ }
}

type Group = { kind: "party" | "property"; key: string; name: string; cases: Case[]; slug: string; roles: Map<string, number>; recs: typeof records };
const groups: Group[] = [];

const byParty = new Map<string, { names: Map<string, number>; roles: Map<string, number>; ids: Set<string> }>();
for (const c of data.cases) {
  for (const p of c.parties || []) {
    const k = partyKey(p.name);
    if (k.length < 4 || SOVEREIGN.test(k)) continue;
    const e = byParty.get(k) || { names: new Map(), roles: new Map(), ids: new Set() };
    e.names.set(p.name, (e.names.get(p.name) || 0) + 1);
    if (p.role) e.roles.set(p.role, (e.roles.get(p.role) || 0) + 1);
    e.ids.add(c.id);
    byParty.set(k, e);
  }
}
for (const [key, e] of byParty) {
  if (e.ids.size < 2) continue;
  const name = [...e.names.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0][0];
  if (curatedFor(key, name)) continue;
  groups.push({ kind: "party", key, name, cases: data.cases.filter((c) => e.ids.has(c.id)), slug: slugify(name), roles: e.roles,
    recs: records.filter((r) => r.keys.includes(key)) });
}

const byProp = new Map<string, Case[]>();
for (const c of data.cases) {
  const k = propertyKey(c.property);
  if (k) byProp.set(k, [...(byProp.get(k) || []), c]);
}
for (const [key, cs] of byProp) {
  if (cs.length < 2) continue;
  const p = cs.find((c) => c.property?.name)?.property || cs[0].property!;
  const label = p.name && p.address ? `${p.name}, ${p.address}` : (p.name || p.address)!;
  const where = [p.city, p.state].filter(Boolean).join(", ");
  groups.push({ kind: "property", key, name: label, cases: cs, slug: slugify(`${p.name || p.address} ${p.city || ""} ${p.state}`), roles: new Map(),
    recs: [], ...(where ? { where } : {}) } as Group);
}
for (const g of groups) g.cases.sort((a, b) => (b.date > a.date ? 1 : -1));
// Two parties that appear in exactly the same matters (a borrower and its
// affiliate, REIT I and REIT II) would get two identical pages; keep the
// shorter name's page and point the other party's key at it.
const aliases = new Map<string, Group>();
{
  const bySet = new Map<string, Group>();
  for (const g of [...groups].sort((a, b) => a.name.length - b.name.length)) {
    if (g.kind !== "party") continue;
    const sig = g.cases.map((c) => c.id).sort().join(",");
    const kept = bySet.get(sig);
    if (kept) { aliases.set(g.key, kept); groups.splice(groups.indexOf(g), 1); } else bySet.set(sig, g);
  }
}

// Page shell: the alert log's head, nav, footer and shell scripts, as in
// build_matter_pages.ts.
const tpl = await Deno.readTextFile("alert-log.html");
const absolutize = (h: string) => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
let head = absolutize(tpl.slice(0, tpl.indexOf('<main id="main-content"')));
let tail = tpl.slice(tpl.indexOf("</main>") + "</main>".length);
tail = tail.replace(/<script src="js\/data(?:-lite)?\.js"><\/script>\s*<script>[\s\S]*?<\/script>/, "")
  .replace(/<script src="js\/(glossary-tooltip|trending|search)\.js"><\/script>\s*/g, "")
  .replace(/\s*<a href="alert-log\.html" class="active">/, '\n        <a href="alert-log.html">')
  .replace('<script src="js/main.js"></script>', '<script src="js/main.js"></script>\n<script src="js/newsletter-form.js"></script>');
if (/js\/data(?:-lite)?\.js/.test(tail)) throw new Error("template tail still loads the dataset");
tail = absolutize(tail);

const pageUrl = (g: Group) => `${SITE}/${g.kind === "party" ? "parties" : "properties"}/${g.slug}.html`;
const states = (g: Group) => [...new Set(g.cases.map((c) => (c.state && data.states[c.state]) || c.state).filter(Boolean))];

function headFor(g: Group, title: string, desc: string): string {
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "CollectionPage", name: title, description: desc, url: pageUrl(g),
        mainEntity: { "@type": "ItemList", itemListElement: g.cases.map((c, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE}/matters/${c.id}.html`, name: clip(plain(c.title), 110) })) } },
      { "@type": "BreadcrumbList", itemListElement: [
        { "@type": "ListItem", position: 1, name: "Litigation Tracker", item: `${SITE}/litigation.html` },
        { "@type": "ListItem", position: 2, name: clip(g.name, 110), item: pageUrl(g) }] },
    ],
  };
  return head
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} — CREdocket</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, (_, p1) => `${p1}${esc(title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, (_, p1) => `${p1}${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, (_, p1) => `${p1}${esc(desc)}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, (_, p1) => `${p1}${pageUrl(g)}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, (_, p1) => `${p1}${pageUrl(g)}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
}

function mainFor(g: Group): { title: string; desc: string; html: string } {
  const n = g.cases.length;
  const first = g.cases[n - 1].date, last = g.cases[0].date;
  const st = states(g);
  const cats = [...new Set(g.cases.map((c) => cat(c.category).label.toLowerCase()))];
  const where = (g as Group & { where?: string }).where;
  const title = g.kind === "party" ? `${g.name}: Commercial Real Estate Litigation` : `${g.name}${where && !g.name.includes(where) ? ` (${where})` : ""}: Litigation`;
  const roles = [...g.roles.entries()].sort((a, b) => b[1] - a[1]).map(([r, k]) => `${r.toLowerCase()} in ${k}`).join(", ");
  const intro = g.kind === "party"
    ? `CREdocket tracks ${n} commercial real estate matters involving ${esc(g.name)}${roles ? ` (${esc(roles)})` : ""}, dated ${fmtDate(first)} to ${fmtDate(last)}${st.length ? `, in ${esc(st.join(", "))}` : ""}. Types: ${esc(cats.join(", "))}.`
    : `CREdocket tracks ${n} matters about this property, dated ${fmtDate(first)} to ${fmtDate(last)}. Types: ${esc(cats.join(", "))}.`;
  const desc = clip(`${g.kind === "party" ? g.name : "This property"}: ${n} commercial real estate matters tracked by CREdocket — ${g.cases.slice(0, 3).map((c) => plain(c.title)).join("; ")}`, 300);
  const items = g.cases.map((c) => {
    const s = status(c.status), k = cat(c.category);
    return `
      <li class="card entity-matter">
        <div class="entity-matter-meta" style="display:flex; flex-wrap:wrap; gap:6px 14px; font-size:13px; color:var(--text-muted); margin-bottom:8px;"><span>${esc(fmtDate(c.date))}</span><span>${esc(k.label)}</span><span style="color:${s.color}">${esc(s.label)}</span>${c.state ? `<span>${esc(c.state)}</span>` : ""}</div>
        <h2 class="matter-h2"><a href="/matters/${esc(c.id)}.html">${esc(plain(c.title))}</a></h2>
        <p class="text-secondary">${esc(clip(plain(c.summary), 420))}</p>
      </li>`;
  }).join("");
  const recs = g.recs.sort((a, b) => (b.rec.dateFiled > a.rec.dateFiled ? 1 : -1)).slice(0, 20);
  const recList = recs.length ? `
    <h2 class="matter-h2" style="margin-top:40px;">Federal court records naming ${esc(g.name)}</h2>
    <p class="text-secondary">Filings found in federal court records (Chapter 11 Watch and Federal Lawsuit Watch), shown from the court record only.</p>
    <ul class="matter-related">${recs.map((r) => `
      <li><a href="/${r.folder}/${esc(r.rec.slug)}.html">${esc(r.rec.caseName)}</a><span>${esc(fmtDate(r.rec.dateFiled))} · ${esc(r.rec.court)}</span></li>`).join("")}
    </ul>` : "";
  const html = `<main id="main-content" tabindex="-1">

<header class="page-header matter-header">
  <div class="container" style="max-width:860px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb"><a href="/litigation.html">Litigation Tracker</a><span aria-hidden="true">/</span><span>${g.kind === "party" ? "Companies and agencies" : "Properties"}</span></nav>
    <h1 style="font-size:clamp(1.8rem,3.4vw,2.6rem);">${esc(title)}</h1>
    <p class="lede mt-16">${intro}</p>
  </div>
</header>

<section class="section-tight">
  <div class="container" style="max-width:860px;">
    <ul class="entity-matters" style="list-style:none; padding:0; display:grid; gap:16px;">${items}
    </ul>
    ${recList}
    <div class="card matter-cta" style="margin-top:40px;">
      <div class="eyebrow">Free weekly email</div>
      <h2 class="matter-h2">New commercial real estate rulings and lawsuits, every Monday</h2>
      <form class="gate-form" data-newsletter-form data-newsletter-source="${g.kind}:${esc(g.slug).slice(0, 40)}" novalidate>
        <label class="sr-only" for="entity-nl-email">Email address</label>
        <input type="email" id="entity-nl-email" autocomplete="email" placeholder="you@company.com" />
        <button type="submit" class="btn btn-primary btn-sm">Subscribe</button>
      </form>
      <p class="gate-form-status" data-newsletter-status role="status"></p>
    </div>
    <p class="text-muted matter-foot">CREdocket summarizes public court records and reporting; see our <a href="/methodology.html#standards">sourcing standards</a> and <a href="/corrections.html">corrections log</a>. Not legal advice.</p>
  </div>
</section>

</main>`;
  return { title, desc, html };
}

const index: { parties: Record<string, string>; properties: Record<string, string> } = { parties: {}, properties: {} };
const keep = new Set<string>();
const used = new Set<string>();
for (const folder of ["parties", "properties"]) await Deno.mkdir(folder, { recursive: true });
for (const g of groups) {
  while (used.has(`${g.kind}/${g.slug}`)) g.slug += "-2";
  used.add(`${g.kind}/${g.slug}`);
  const folder = g.kind === "party" ? "parties" : "properties";
  const file = `${folder}/${g.slug}.html`;
  const { title, desc, html } = mainFor(g);
  await Deno.writeTextFile(file, headFor(g, title, desc) + html + tail);
  keep.add(file);
  index[g.kind === "party" ? "parties" : "properties"][g.key] = `/${file}`;
}
let removed = 0;
for (const folder of ["parties", "properties"]) {
  for await (const e of Deno.readDir(folder)) {
    const file = `${folder}/${e.name}`;
    if (e.isFile && e.name.endsWith(".html") && !keep.has(file)) { await Deno.remove(file); removed++; }
  }
}
for (const [key, g] of aliases) index.parties[key] = index.parties[g.key];
// Parties with a curated profile link to it from matter pages.
for (const [key, e] of byParty) {
  const name = [...e.names.keys()][0];
  const t = curatedFor(key, name);
  if (!t || index.parties[key]) continue;
  try { await Deno.stat(`company-${t.slug}.html`); index.parties[key] = `/company-${t.slug}.html`; } catch { /* no page */ }
}
await Deno.writeTextFile("js/entity-index.json", JSON.stringify(index, null, 1) + "\n");
console.log(`${keep.size} entity pages written (${[...keep].filter((f) => f.startsWith("parties/")).length} party, ${[...keep].filter((f) => f.startsWith("properties/")).length} property), ${removed} removed`);
