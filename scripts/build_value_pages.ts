// "What is it worth?" pages for the Case Value Calculator (2026-10-17).
//
// The calculator drew about one visit a week although some 170 pages link to
// it: nobody searches for "Case Value Calculator", and a visitor saw nothing
// real before signing in. This builds:
//   - one page per calculator category (e.g. commercial-lease-dispute-damages.html)
//     answering "what is a <dispute> worth?": how damages are usually measured,
//     the facts the calculator actually asks about (read from CATEGORY_FIELDS
//     in the analyze function, so the page cannot drift from the tool), every
//     scored case from the published backtest in that category, hits and
//     misses alike, recent tracker matters, and a button into the calculator
//     with the category preset;
//   - the "Tested on real cases" block on case-valuation.html (between
//     <!--prerender:cv-real-cases--> markers).
// Nothing here values a tracked matter: every figure is a published backtest
// result for a case whose final outcome is known.
//
// Run by .github/workflows/prerender.yml; locally:
//   deno run --allow-read --allow-write scripts/build_value_pages.ts

type BtCase = {
  id: string; caseName: string; court: string; decided: string; sourceUrl?: string; category: string; role?: string;
  declined?: boolean; error?: unknown; holdout?: boolean;
  final?: { predictedRange?: [number, number]; actual?: number; hit?: boolean; pending?: boolean; bestGuess?: number; note?: string };
};
type Case = { id: string; title: string; seoTitle?: string; category: string; date: string; state?: string; status: string };

const SITE = "https://credocket.com";
const src = await Deno.readTextFile("js/data.js");
const data = new Function(src + "; return RELAW_DATA;")() as { cases: Case[]; statuses: { id: string; label: string }[] };
const btRaw = await Deno.readTextFile("js/backtest-results-data.js");
const bt = JSON.parse(btRaw.slice(btRaw.indexOf("{"), btRaw.lastIndexOf("}") + 1));
const versions = Object.keys(bt.versions).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
// Quote the newest backtest at or below the version visitors actually get
// (ANALYSIS_VERSION in the analyze function), never a candidate still
// being tested (2026-10-17, v4.5 candidate runs).
const fnText = await Deno.readTextFile("supabase/functions/case-valuation-analyze/index.ts");
const LIVE = /const ANALYSIS_VERSION = "([^"]+)"/.exec(fnText)?.[1] ?? versions.at(-1)!;
const VERSION = versions.filter((v) => v.localeCompare(LIVE, undefined, { numeric: true }) <= 0).at(-1) ?? versions.at(-1)!;
const btCases: BtCase[] = bt.versions[VERSION].cases;
const byCategory: Record<string, { finalHits: number; finalScorable: number }> = bt.versions[VERSION].byCategory || {};
const overall = bt.versions[VERSION].summary as { finalHits: number; finalScorable: number };

// The calculator's own questions per category.
const fnSrc = fnText;
const fieldsBlock = fnSrc.slice(fnSrc.indexOf("const CATEGORY_FIELDS"), fnSrc.indexOf("\n};", fnSrc.indexOf("const CATEGORY_FIELDS")));
const questions: Record<string, string[]> = {};
for (const m of fieldsBlock.matchAll(/"([a-z-]+)": \[([\s\S]*?)\n  \],/g)) {
  questions[m[1]] = [...m[2].matchAll(/label: "([^"]+)"/g)].map((x) => x[1]
    .replace(/\s*--.*$/, "").replace(/\s*\(\$\)/g, "").replace(/\s*\((?:for|e\.g\.)[^)]*\)/g, "").replace(/^If [^:]+:\s*/i, "").trim())
    .filter((l, i, a) => l && a.indexOf(l) === i);
}

// Display captions: business and government names only; individuals by role.
// Shared with the calibration page through display-names.json (2026-10-17).
const DISPLAY: Record<string, string> = Object.fromEntries(Object.entries(
  (JSON.parse(await Deno.readTextFile("case_valuation_project/backtest/display-names.json").catch(() => '{"cases":{}}')).cases || {}) as Record<string, { name?: string }>,
).filter(([, v]) => v.name).map(([k, v]) => [k, v.name as string]));
// No reviewed entry yet: a neutral label, never the caption (same rule as
// scripts/score_backtest.py).
const display = (c: BtCase) => DISPLAY[c.id] || `${c.court.split(",")[0]} case, ${c.decided.slice(0, 4)}`;

const PAGES = [
  { cat: "lease-disputes", tracker: ["lease-disputes", "landlord-tenant"], slug: "commercial-lease-dispute-damages", noun: "commercial lease dispute",
    measure: "When a commercial tenant breaks a lease, the landlord's claim usually starts with rent that has come due and gone unpaid. Future rent depends on the lease, especially whether it has an acceleration clause, and on the state's rules about mitigation: many states require the landlord to try to re-let and credit the new rent, and the costs of re-letting (commissions, tenant improvements, landlord's work) are often recoverable. Tenants' claims run the other way, for rent abatement or damages when a landlord fails to repair, locks the tenant out without following the required process, or interferes with the tenant's use. A fee-shifting clause can move the result more than any single claim." },
  { cat: "lending-foreclosure", tracker: ["lending-foreclosure"], slug: "commercial-foreclosure-guaranty-damages", noun: "commercial loan, foreclosure or guaranty claim",
    measure: "A lender's recovery starts with the unpaid balance, interest and default interest, and protective advances for taxes and insurance, less what the collateral brings. Whether the lender can pursue a deficiency, and whether a fair-value offset applies, depends on the state and on how the foreclosure was conducted. Guaranty claims turn on the guaranty's terms, including the carve-out triggers that make a nonrecourse loan recourse. A borrower's counterclaim for lender misconduct is a separate exposure with its own measure of damages." },
  { cat: "construction-defect", tracker: ["construction-defect"], slug: "construction-defect-damages", noun: "commercial construction defect claim",
    measure: "Defect claims are usually measured by the reasonable cost to repair, sometimes limited by the loss in the property's value. Who ends up paying depends on the contract chain: indemnity clauses (which many states' anti-indemnity statutes limit), which contractor's or subcontractor's work caused the defect, whether the general liability insurer covers it, and statutes of limitation and repose that run from substantial completion." },
  { cat: "eminent-domain", tracker: ["eminent-domain"], slug: "condemnation-compensation", noun: "commercial condemnation claim",
    measure: "Just compensation is generally the fair market value of the property taken; in a partial taking it also covers the loss in value to the property that remains (severance damages), which some states offset by any benefit the project brings. Most cases come down to competing appraisals, and the gap between the condemning authority's offer and the owner's appraisal sets the range. Some states add interest, relocation costs or fee awards." },
  { cat: "zoning-land-use", tracker: ["zoning-land-use"], slug: "land-use-litigation-damages", noun: "zoning or land-use claim",
    measure: "Most land-use cases are about the approval rather than money: a court upholds or reverses a denial, or orders a permit issued. Damages are available only in narrower settings, such as a taking, a civil-rights claim, a vested-rights or estoppel claim after money was spent in reliance on an approval, or a statute that allows them, and the measure is usually tied to delay, lost use or wasted costs." },
  { cat: "premises-liability", tracker: ["premises-liability"], slug: "commercial-premises-liability-damages", noun: "premises liability claim against a commercial property", titleNoun: "commercial premises liability claim",
    measure: "Claims against owners and operators for injuries on commercial property are valued like other injury claims (medical costs, lost earnings, pain and suffering), adjusted for whether the owner knew or should have known of the hazard, the injured person's own share of fault under the state's comparative-fault rule, and the state's rules on security and open-and-obvious conditions." },
  { cat: "reit-securities", tracker: ["reit-securities"], slug: "reit-securities-claim-value", noun: "REIT securities or fiduciary claim",
    measure: "Securities class actions against REITs are usually valued as a share of estimated investor losses, shaped heavily by how strong the pleaded facts are at the motion-to-dismiss stage. Fiduciary claims against boards or sponsors turn on whether a specific self-dealing transaction can be identified and its cost to investors measured." },
  { cat: "environmental", tracker: ["environmental"], slug: "environmental-cleanup-cost-claims", noun: "commercial property contamination claim",
    measure: "Contamination claims usually seek past and future cleanup costs, and sometimes lost property value, allocated among responsible parties under CERCLA and state law. A party's status as a potentially responsible party, the number of other responsible parties, and whether insurers cover the loss all change how much any one party ends up paying." },
];

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const plain = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const money = (n?: number) => n == null ? "" : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 2).replace(/\.?0+$/, "")}M` : n >= 1e3 ? `$${Math.round(n / 1e3).toLocaleString("en-US")}K` : `$${Math.round(n).toLocaleString("en-US")}`;
const fmtDate = (iso?: string) => iso ? new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
const SMALL = new Set(["a", "an", "and", "or", "of", "on", "the", "to", "for", "in", "against"]);
const titleCase = (s: string) => s.split(" ").map((w, i) => (i > 0 && SMALL.has(w)) || /[A-Z]/.test(w) ? w
  : w.split("-").map((p) => p[0].toUpperCase() + p.slice(1)).join("-")).join(" ");
const shortCourt = (s: string) => s.split(/ \(|, on appeal/)[0];
const scored = (c: BtCase) => !c.declined && !c.error && c.final && !c.final.pending && c.final.predictedRange && c.final.actual != null;
const calcUrl = (cat: string) => `/case-valuation.html?category=${cat}#cv-form`;

// Page shell, as in the other builders.
const tpl = await Deno.readTextFile("alert-log.html");
const absolutize = (h: string) => h.replace(/(href|src)="(?!https?:|\/|#|mailto:|tel:|data:)([^"]+)"/g, '$1="/$2"');
const head = absolutize(tpl.slice(0, tpl.indexOf('<main id="main-content"')));
let tail = tpl.slice(tpl.indexOf("</main>") + "</main>".length);
tail = tail.replace(/<script src="js\/data(?:-lite)?\.js"><\/script>\s*<script>[\s\S]*?<\/script>/, "")
  .replace(/<script src="js\/(glossary-tooltip|trending|search)\.js"><\/script>\s*/g, "")
  .replace(/\s*<a href="alert-log\.html" class="active">/, '\n        <a href="alert-log.html">')
  .replace('<script src="js/main.js"></script>', '<script src="js/main.js"></script>\n<script src="js/newsletter-form.js"></script>');
if (/js\/data(?:-lite)?\.js/.test(tail)) throw new Error("template tail still loads the dataset");
tail = absolutize(tail);

const CSS = `<style>
  .vp-cases { list-style:none; padding:0; display:grid; gap:14px; margin-top:16px; }
  .vp-case { padding:18px 20px; }
  .vp-case h3 { font-size:1.02rem; margin:0 0 6px; }
  .vp-case-meta { font-size:13px; color:var(--text-muted); }
  .vp-case-nums { display:flex; flex-wrap:wrap; gap:6px 22px; margin-top:10px; font-variant-numeric:tabular-nums; font-size:14px; }
  .vp-hit { color:var(--ui-success); font-weight:600; }
  .vp-miss { color:var(--ui-warning); font-weight:600; }
  .vp-q { columns:2 260px; column-gap:28px; padding-left:18px; margin:12px 0 0; }
  .vp-q li { margin-bottom:6px; break-inside:avoid; }
</style>`;

function caseItem(c: BtCase): string {
  const f = c.final!;
  const [lo, hi] = f.predictedRange!;
  return `
      <li class="card vp-case">
        <h3>${esc(display(c))}</h3>
        <div class="vp-case-meta">${esc(shortCourt(c.court))} · ${esc(fmtDate(c.decided))}${c.role ? ` · analyzed for the ${esc(c.role.toLowerCase())}` : ""}</div>
        <div class="vp-case-nums">
          <span>Calculator range: <strong>${money(lo)} – ${money(hi)}</strong></span>
          <span>Final outcome: <strong>${money(f.actual)}</strong></span>
          <span class="${f.hit ? "vp-hit" : "vp-miss"}">${f.hit ? "Within the range" : "Outside the range"}</span>
        </div>
        ${c.sourceUrl ? `<p style="font-size:13px; margin:8px 0 0;"><a href="${esc(c.sourceUrl)}" target="_blank" rel="noopener">Read the decision ↗</a></p>` : ""}
      </li>`;
}

function pageHtml(p: typeof PAGES[number]): { file: string; html: string } {
  const file = `${p.slug}.html`;
  const url = `${SITE}/${file}`;
  const cases = btCases.filter((c) => c.category === p.cat && scored(c)).sort((a, b) => b.decided.localeCompare(a.decided));
  const stat = byCategory[p.cat];
  const matters = data.cases.filter((c) => p.tracker.includes(c.category)).sort((a, b) => (b.date > a.date ? 1 : -1)).slice(0, 6);
  const title = `What Is a ${titleCase((p as { titleNoun?: string }).titleNoun || p.noun)} Worth?`;
  const desc = `How damages are measured in a ${p.noun}, what drives the number, and how CREdocket's free calculator did on real cases with known outcomes. Estimate your own dispute.`;
  const qs = (questions[p.cat] || []).slice(0, 10);
  const statLine = stat && stat.finalScorable
    ? `In CREdocket's published backtest (${VERSION}), the calculator's range contained the final outcome in ${stat.finalHits} of ${stat.finalScorable} ${p.noun} cases, and in ${overall.finalHits} of ${overall.finalScorable} cases across all categories.`
    : `The published backtest (${VERSION}) has no scored ${p.noun} case yet; across all categories the calculator's range contained the final outcome in ${overall.finalHits} of ${overall.finalScorable} cases.`;
  const ld = { "@context": "https://schema.org", "@graph": [
    { "@type": "Article", headline: title, description: desc, url, author: { "@type": "Organization", name: "CREdocket", url: SITE },
      publisher: { "@type": "Organization", name: "CREdocket", url: SITE } },
    { "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Case Value Calculator", item: `${SITE}/case-valuation.html` },
      { "@type": "ListItem", position: 2, name: title, item: url }] },
  ] };
  const h = head
    .replace(/<title>[^<]*<\/title>/, () => `<title>${esc(title)} — CREdocket</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, (_, a) => `${a}${esc(desc)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, (_, a) => `${a}${esc(title)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, (_, a) => `${a}${esc(desc)}"`)
    .replace(/(<meta name="twitter:title" content=")[^"]*"/, (_, a) => `${a}${esc(title)}"`)
    .replace(/(<meta name="twitter:description" content=")[^"]*"/, (_, a) => `${a}${esc(desc)}"`)
    .replace(/(<meta property="og:url" content=")[^"]*"/, (_, a) => `${a}${url}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, (_, a) => `${a}${url}"`)
    .replace("</head>", `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>\n  </head>`);
  const body = `<main id="main-content" tabindex="-1">

<header class="page-header matter-header">
  <div class="container" style="max-width:860px;">
    <nav class="matter-crumbs" aria-label="Breadcrumb"><a href="/case-valuation.html">Case Value Calculator</a><span aria-hidden="true">/</span><span>What is it worth?</span></nav>
    <h1 style="font-size:clamp(1.9rem,3.6vw,2.7rem);">${esc(title)}</h1>
    <p class="lede mt-16">Free during the beta: describe your own facts, or upload your documents, and get a damages range with the reasoning and the cases behind it.</p>
    <p class="mt-16"><a class="btn btn-primary btn-sm" href="${calcUrl(p.cat)}">Estimate your ${esc(p.noun)}</a></p>
  </div>
</header>
${CSS}
<section class="section-tight">
  <div class="container" style="max-width:860px;">
    <h2 class="matter-h2">How damages are usually measured</h2>
    <p class="body-text">${esc(p.measure)}</p>
    <p class="text-muted" style="font-size:13px;">General background, not legal advice; the rules vary by state and by the documents in your deal.</p>

    ${qs.length ? `<h2 class="matter-h2" style="margin-top:32px;">What the calculator asks about</h2>
    <p class="text-secondary">These are the facts it pulls from your description or documents for a ${esc(p.noun)}:</p>
    <ul class="vp-q">${qs.map((q) => `<li>${esc(q)}</li>`).join("")}</ul>` : ""}

    <h2 class="matter-h2" style="margin-top:32px;">How it did on real cases</h2>
    <p class="body-text">${esc(statLine)} Each case below was run through the live calculator on a verbatim excerpt of the court's statement of facts and each side's contentions, with every sentence stating an award, finding or holding removed, then scored against the final result after any appeal.</p>
    ${cases.length ? `<ul class="vp-cases">${cases.map(caseItem).join("")}
    </ul>` : ""}
    <p style="margin-top:14px;"><a href="/case-valuation-calibration.html">Full backtest results and method →</a></p>

    <div class="card matter-cta" style="margin-top:32px;">
      <div class="eyebrow">Case Value Calculator · free beta</div>
      <h2 class="matter-h2">Get a range for your own ${esc(p.noun)}</h2>
      <p class="text-secondary">Describe both sides' positions, or upload the lease, loan documents, pleadings or appraisals. The estimate needs both sides' facts; a one-sided complaint alone is not enough to value a case. Sign-in is email only.</p>
      <a class="btn btn-primary btn-sm" href="${calcUrl(p.cat)}">Open the calculator</a>
    </div>

    ${matters.length ? `<h2 class="matter-h2" style="margin-top:36px;">Recent cases we're tracking</h2>
    <ul class="matter-related">${matters.map((c) => `
      <li><a href="/matters/${esc(c.id)}.html">${esc(plain(c.seoTitle || c.title))}</a><span>${esc(fmtDate(c.date))}</span></li>`).join("")}
    </ul>` : ""}
    <p class="text-muted matter-foot">Estimates are probability-weighted ranges from the facts you provide, not a prediction of any court's ruling and not legal advice.</p>
  </div>
</section>

</main>`;
  return { file, html: h + body + tail };
}

const written: string[] = [];
for (const p of PAGES) {
  const { file, html } = pageHtml(p);
  await Deno.writeTextFile(file, html);
  written.push(file);
}

// The calculator page: real cases (hits from three categories, newest first)
// and links to the eight pages.
{
  const f = "case-valuation.html";
  let h = await Deno.readTextFile(f);
  const start = "<!--prerender:cv-real-cases-->", end = "<!--/prerender:cv-real-cases-->";
  if (!h.includes(start) || !h.includes(end)) throw new Error(`${f}: cv-real-cases markers missing`);
  const picks: BtCase[] = [];
  for (const c of btCases.filter((c) => scored(c) && c.final!.hit).sort((a, b) => b.decided.localeCompare(a.decided))) {
    if (!picks.some((p) => p.category === c.category)) picks.push(c);
    if (picks.length === 3) break;
  }
  const block = `
    <div class="section-head reveal in-view">
      <div>
        <div class="eyebrow">Tested on real cases</div>
        <h2 style="font-size:clamp(1.4rem,2.2vw,1.9rem);">How it did on cases whose outcome is known</h2>
      </div>
    </div>
    ${CSS}
    <p class="body-text" style="max-width:760px;">We ran the live calculator on real commercial real estate cases from published appellate opinions, giving it only the opinion's facts and each side's contentions with every statement of the award or holding removed, then compared its range with the final result after any appeal. Its range contained the final outcome in ${overall.finalHits} of ${overall.finalScorable} scored cases (${VERSION}). Three recent examples:</p>
    <ul class="vp-cases" style="max-width:860px;">${picks.map(caseItem).join("")}
    </ul>
    <p style="margin-top:14px;"><a href="/case-valuation-calibration.html">Every case, hits and misses →</a></p>
    <p class="text-secondary" style="margin-top:24px;">What is a dispute like yours worth? ${PAGES.map((p) => `<a href="/${p.slug}.html">${esc(p.noun[0].toUpperCase() + p.noun.slice(1))}</a>`).join(" · ")}</p>
  `;
  h = h.slice(0, h.indexOf(start) + start.length) + block + h.slice(h.indexOf(end));
  await Deno.writeTextFile(f, h);
}
// The calculator page's "why use a model" section (2026-10-17, Jeff: "People
// need to know this. There is inherently bias in valuing cases"): two
// published studies of lawyer and party prediction error, and the
// calculator's own liability calibration computed from the issue-level
// coding of the backtest (case_valuation_project/backtest/issue-coding-*.json).
{
  const f = "case-valuation.html";
  let h = await Deno.readTextFile(f);
  const start = "<!--prerender:cv-bias-->", end = "<!--/prerender:cv-bias-->";
  if (!h.includes(start) || !h.includes(end)) throw new Error(`${f}: cv-bias markers missing`);
  const codingFiles = [...Deno.readDirSync("case_valuation_project/backtest")].map((e) => e.name).filter((n) => /^issue-coding-.*\.json$/.test(n)).sort();
  const coding = JSON.parse(await Deno.readTextFile(`case_valuation_project/backtest/${codingFiles.at(-1)}`));
  const tally: Record<string, { won: number; n: number }> = {};
  let issues = 0;
  for (const c of coding.cases) {
    for (const i of c.issues) {
      if (!["won", "partial", "lost"].includes(i.result)) continue;
      issues++;
      const t = tally[i.strength] ||= { won: 0, n: 0 };
      t.n++; if (i.result !== "lost") t.won++;
    }
  }
  const pct = (b: string) => tally[b] && tally[b].n >= 10 ? Math.round(100 * tally[b].won / tally[b].n) : null;
  const fav = pct("favorable"), weak = pct("weak"), strong = pct("strong");
  const block = `
    <div class="eyebrow">Why use a model</div>
    <h2 style="font-size:clamp(1.4rem,2.2vw,1.9rem); margin-bottom:14px;">Everyone in a dispute overestimates their own case</h2>
    <div class="grid-3" style="gap:18px; margin-top:8px;">
      <div class="card" style="padding:20px;">
        <div style="font-family:var(--font-display); font-size:2rem; color:var(--accent);">481 lawyers</div>
        <p class="text-secondary" style="font-size:14px; line-height:1.6; margin-top:8px;">predicted the outcomes of their own cases before trial. As a group they were overconfident, and their accuracy did not improve with years of experience.</p>
        <p class="text-muted" style="font-size:12px; margin-top:8px;"><a href="https://news.uci.edu/2010/05/11/loftus" target="_blank" rel="noopener">Goodman-Delahunty, Granhag, Hartwig &amp; Loftus, <em>Psychology, Public Policy, and Law</em> (2010) ↗</a></p>
      </div>
      <div class="card" style="padding:20px;">
        <div style="font-family:var(--font-display); font-size:2rem; color:var(--accent);">61.2%</div>
        <p class="text-secondary" style="font-size:14px; line-height:1.6; margin-top:8px;">of plaintiffs who turned down a settlement offer and went to trial or arbitration did no better than the defendant's last offer, in 2,054 cases. Defendants paid more than the plaintiff's last demand 24.3% of the time, and their mistakes cost more.</p>
        <p class="text-muted" style="font-size:12px; margin-top:8px;"><a href="https://www.kellogg.northwestern.edu/academics-research/research/detail/2008/lets-not-make-a-deal-an-empirical-study-of/" target="_blank" rel="noopener">Kiser, Asher &amp; McShane, <em>Journal of Empirical Legal Studies</em> (2008) ↗</a></p>
      </div>
      <div class="card" style="padding:20px;">
        <div style="font-family:var(--font-display); font-size:2rem; color:var(--accent);">${fav !== null ? `${fav}%` : "Measured"}</div>
        <p class="text-secondary" style="font-size:14px; line-height:1.6; margin-top:8px;">${fav !== null ? `of claims this calculator rated "favorable" (60–75% likely) were won on liability${weak !== null ? `; claims it rated "weak" won ${weak}%` : ""}${strong !== null ? ` and "strong" ${strong}%` : ""}.` : "Every rating is checked against how the court actually ruled."} Measured on ${issues} claims in ${coding.cases.length} resolved cases, each checked against the court's opinion.</p>
        <p class="text-muted" style="font-size:12px; margin-top:8px;"><a href="/case-valuation-calibration.html">Every case, hits and misses →</a></p>
      </div>
    </div>
    <p class="body-text" style="max-width:780px; margin-top:20px;">A party's own lawyer has a client to please and a fee riding on the answer. This calculator weighs both sides' facts the same way every time and says how often its ratings come true. Where it is weaker today is <em>how much</em>: winners often recover less than everything they claim, and we publish those misses too while we rebuild the damages measure.</p>
  `;
  h = h.slice(0, h.indexOf(start) + start.length) + block + h.slice(h.indexOf(end));
  await Deno.writeTextFile(f, h);
}
console.log(`${written.length} value pages written (${VERSION}); case-valuation.html real-cases block updated`);
