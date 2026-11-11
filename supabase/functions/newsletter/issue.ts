// CREdocket weekly email, "The CRE Distress Brief" (2026-11-11 redesign).
//
// Pure functions: buildIssue() turns the site's published data into one
// week's issue (counts, week-over-week changes, insight sentences, charts),
// renderIssue() draws it as email-safe HTML (tables + inline styles only, no
// images, no web fonts, so it renders the same in Gmail, Outlook and Apple
// Mail) plus a plain-text part. Every number in an issue is counted from the
// site's own records (js/data-lite.js, ops/*.json); nothing is estimated or
// written by a model. scripts/preview_newsletter.ts renders a local preview.

export type Case = {
  id: string; title: string; category: string; date: string; addedDate?: string; jurisdiction?: string; state?: string;
  summary?: string; brief?: string; significance?: string; amountUsd?: number | null; amountBasis?: string; propertyType?: string;
  featured?: boolean; parties?: { name: string; role?: string }[];
};
type Trend = { id: string; title: string; date: string; metric?: string; scope?: string; summary?: string };
type Filing = { caseName: string; court: string; dateFiled: string; slug: string };
type CmbsEvent = {
  event: string; eventLabel: string; propertyName: string; city: string; state: string; propertyType: string; balance: number | null;
  trust: string; filed: string; slug: string; paymentStatus?: string;
};
type TxRow = {
  county: string; state: string; saleDate: string; address: string; city: string; propertyName: string; propertyType: string;
  sqft: number | null; units: number | null; firstSeen: string; slug: string; lender?: string; originalAmount?: number | null;
};
type Indicator = { id: string; label: string; value: number; unit: string; asOf: string; sourceUrl: string; source?: string;
  comparisons?: { label: string; value: number; date: string }[] };
type ActivityEvent = { caseIds: string[]; date: string; text: string; kind: string; firstSeen: string };

export type Inputs = {
  data: { categories: { id: string; label: string }[]; cases: Case[]; trends?: Trend[] };
  activity?: { events?: ActivityEvent[] };
  ch11?: { filings: Filing[] };
  fed?: { filings: Filing[] };
  cmbs?: { events: CmbsEvent[] };
  tx?: { properties: TxRow[] };
  pulse?: { indicators?: Indicator[] };
  today: Date;
};

const SITE = "https://credocket.com";
const UTM = "utm_source=credocket&utm_medium=email&utm_campaign=weekly-newsletter";
const DAY = 864e5;

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
export const plain = (s: unknown) => String(s ?? "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
export const clip = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…");
const fmtDate = (iso: string, year = true) => new Date(iso.slice(0, 10) + "T00:00:00Z")
  .toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
export const money = (n: number) => n >= 1e9 ? `$${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(n >= 1e8 ? 0 : 1)}M`
  : n >= 1e3 ? `$${Math.round(n / 1e3)}K` : `$${Math.round(n)}`;
const plural = (n: number, one: string, many = one + "s") => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const link = (path: string) => {
  const [p, hash] = path.split("#");
  return `${SITE}${p}${p.includes("?") ? "&" : "?"}${UTM}${hash ? "#" + hash : ""}`;
};
const matterUrl = (id: string) => link(`/matters/${encodeURIComponent(id)}.html`);

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota",
  MS: "Mississippi", MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon",
  PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", PR: "Puerto Rico",
};
// Federal court names carry the district's state: "Bankruptcy Court, S.D. Texas".
const COURT_STATE: [RegExp, string][] = Object.entries(STATE_NAMES).filter(([k]) => k !== "DC")
  .map(([abbr, name]) => [new RegExp(`\\b${name}\\b`), abbr]);
const courtState = (court: string) => (/District of Columbia/.test(court) ? "DC" : COURT_STATE.find(([re]) => re.test(court))?.[1] || "");

// One color per tracker category, chosen to read on white and keep the
// nine distinguishable at bar size.
const CAT_COLOR: Record<string, string> = {
  "lending-foreclosure": "#b3261e", "lease-disputes": "#3355ff", "landlord-tenant": "#5b6cff", "zoning-land-use": "#0f7b53",
  "reit-securities": "#7a3fd1", "construction-defect": "#c26a00", "environmental": "#2f8f8a", "eminent-domain": "#8a5a2b",
  "premises-liability": "#c2417a",
};
const INK = "#0b1020", PAPER = "#ffffff", MIST = "#eef0f5", RULE = "#e2e5eb", TEXT = "#1f2533", DIM = "#5a6275", FAINT = "#8a92a6";
const ACCENT = "#3355ff", RED = "#b3261e", GREEN = "#0f7b53";
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

type Stat = { label: string; value: string; now: number; base: number | null; note: string; href: string };
type Insight = { lead: string; body: string; href?: string };
type RadarItem = { kind: string; color: string; title: string; detail: string; href: string; weight: number };

export function buildIssue(inp: Inputs) {
  const today = inp.today;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const since = (days: number) => iso(new Date(today.getTime() - days * DAY));
  const from = since(7), to = iso(today);
  const inWeek = (d?: string) => !!d && d.slice(0, 10) > from && d.slice(0, 10) <= to; // the seven days ending today
  const inBase = (d?: string) => !!d && d.slice(0, 10) > since(35) && d.slice(0, 10) <= from; // the four weeks before
  const cats = Object.fromEntries(inp.data.categories.map((c) => [c.id, c.label]));
  const cases = inp.data.cases;
  const added = (c: Case) => c.addedDate || c.date;

  const matters = cases.filter((c) => inWeek(added(c)))
    .sort((a, b) => (Number(b.featured || 0) - Number(a.featured || 0)) || ((b.amountUsd || 0) - (a.amountUsd || 0)) || (added(b) > added(a) ? 1 : -1));
  const prior8 = cases.filter((c) => added(c) >= since(63) && added(c) < from);

  // Weekly distress counts and their prior-four-week average.
  const ch11 = inp.ch11?.filings || [], fed = inp.fed?.filings || [];
  const cmbs = inp.cmbs?.events || [], tx = inp.tx?.properties || [];
  const count = <T>(rows: T[], date: (r: T) => string) => ({
    now: rows.filter((r) => inWeek(date(r))).length,
    base: rows.filter((r) => inBase(date(r))).length / 4,
  });
  const cMatters = count(cases, added), cCh11 = count(ch11, (r) => r.dateFiled), cFed = count(fed, (r) => r.dateFiled);
  // A source that started inside the comparison window has no fair baseline.
  const earliest = <T>(rows: T[], date: (r: T) => string) => rows.map(date).filter(Boolean).sort()[0] || to;
  const baseOk = <T>(rows: T[], date: (r: T) => string) => earliest(rows, date) <= since(35);
  // CMBS trusts report monthly, so the CMBS figures cover 30 days, not 7.
  const weekCmbs = cmbs.filter((r) => r.filed > since(30) && r.filed <= to);
  const cmbsBalance = weekCmbs.reduce((s, r) => s + (r.balance || 0), 0);
  // Texas notices count only for a sale still ahead: a feed that adds a
  // county reads its back file in, and a past sale is not this week's news.
  const weekTx = tx.filter((r) => inWeek(r.firstSeen) && r.saleDate >= to);
  const txSales = [...new Set(weekTx.map((r) => r.saleDate))].sort();
  const txCounties = [...new Set(weekTx.map((r) => r.county))].sort();
  const weekCh11 = ch11.filter((r) => inWeek(r.dateFiled));
  const weekFed = fed.filter((r) => inWeek(r.dateFiled));

  const stats: Stat[] = [
    { label: "New CRE matters", value: String(cMatters.now), now: cMatters.now, base: baseOk(cases, added) ? cMatters.base : null,
      note: "litigation write-ups added", href: link("/updates.html") },
    { label: "Chapter 11 petitions", value: String(cCh11.now), now: cCh11.now, base: baseOk(ch11, (r) => r.dateFiled) ? cCh11.base : null,
      note: "real estate debtors, federal courts", href: link("/bankruptcy-watch.html") },
    { label: "CMBS loans in trouble", value: String(weekCmbs.length), now: weekCmbs.length, base: null,
      note: `in trust reports filed with the SEC in the last 30 days${cmbsBalance ? `, ${money(cmbsBalance)} in balances` : ""}`,
      href: link("/cmbs-watch.html") },
    { label: "Federal CRE lawsuits", value: String(cFed.now), now: cFed.now, base: baseOk(fed, (r) => r.dateFiled) ? cFed.base : null,
      note: "new business-to-business suits", href: link("/lawsuit-watch.html") },
  ];
  if (weekTx.length) {
    stats.push({ label: "Texas foreclosure postings", value: String(weekTx.length), now: weekTx.length, base: null,
      note: `commercial properties posted for the ${txSales.map((d) => fmtDate(d, false)).join(" and ")} sale in ${txCounties.join(" and ")} ${txCounties.length > 1 ? "counties" : "County"}`,
      href: link("/texas-foreclosures.html") });
  }

  // ---------- insights: each one a sentence counted from the records ----------
  const insights: Insight[] = [];

  // 1. The practice area that grew most against its own recent share.
  const share = (rows: Case[]) => {
    const m: Record<string, number> = {};
    for (const c of rows) m[c.category] = (m[c.category] || 0) + 1;
    return m;
  };
  const wk = share(matters), base = share(prior8);
  const catRows = inp.data.categories.map((c) => ({
    id: c.id, label: c.label, now: wk[c.id] || 0,
    nowShare: matters.length ? (wk[c.id] || 0) / matters.length : 0,
    baseShare: prior8.length ? (base[c.id] || 0) / prior8.length : 0,
  })).filter((r) => r.now || r.baseShare).sort((a, b) => b.now - a.now || b.baseShare - a.baseShare);
  const mover = catRows.filter((r) => r.now >= 3 && prior8.length >= 20).sort((a, b) => (b.nowShare - b.baseShare) - (a.nowShare - a.baseShare))[0];
  if (mover && mover.nowShare - mover.baseShare >= 0.08) {
    insights.push({
      lead: `${mover.label} is running hot.`,
      body: `${mover.now} of this week's ${matters.length} new matters (${pct(mover.nowShare)}) were ${mover.label.toLowerCase()} cases, against ${pct(mover.baseShare)} of the ${prior8.length} matters added over the previous eight weeks.`,
      href: link(`/litigation.html?category=${mover.id}`),
    });
  }

  // 2. Loan dollars at issue in this week's lending matters.
  const loans = matters.filter((c) => c.amountBasis === "loan" && c.amountUsd);
  if (loans.length) {
    const total = loans.reduce((s, c) => s + (c.amountUsd || 0), 0);
    const big = [...loans].sort((a, b) => (b.amountUsd || 0) - (a.amountUsd || 0))[0];
    insights.push({
      lead: `${money(total)} of commercial loans went to court.`,
      body: `That is the stated loan amount across ${plural(loans.length, "lending matter")} added this week; the largest is ${money(big.amountUsd || 0)} in ${clip(plain(big.title).replace(/\s*\(.*\)\s*$/, ""), 70)}.`,
      href: matterUrl(big.id),
    });
  }

  // 3. Where distress clustered: every source counted by state.
  const byState: Record<string, { total: number; parts: Record<string, number> }> = {};
  const bump = (st: string | undefined, part: string) => {
    if (!st || !STATE_NAMES[st]) return;
    byState[st] ??= { total: 0, parts: {} };
    byState[st].total++;
    byState[st].parts[part] = (byState[st].parts[part] || 0) + 1;
  };
  for (const c of matters) bump(c.state, "new matter");
  for (const r of weekCh11) bump(courtState(r.court), "Chapter 11 petition");
  for (const r of weekFed) bump(courtState(r.court), "federal suit");
  for (const r of weekCmbs) if (inWeek(r.filed)) bump(r.state, "CMBS loan flagged");
  for (const r of weekTx) bump(r.state, "foreclosure posting");
  const states = Object.entries(byState).sort((a, b) => b[1].total - a[1].total);
  if (states.length && states[0][1].total >= 4) {
    const [st, v] = states[0];
    const parts = Object.entries(v.parts).sort((a, b) => b[1] - a[1]).map(([k, n]) => plural(n, k)).join(", ");
    const runner = states[1] ? ` ${STATE_NAMES[states[1][0]]} was next with ${states[1][1].total}.` : "";
    insights.push({
      lead: `${STATE_NAMES[st]} led the country in distress signals.`,
      body: `${v.total} of the week's records came from ${STATE_NAMES[st]}: ${parts}.${runner}`,
    });
  }

  // 4. Bankruptcy pace against the prior month.
  if (cCh11.now && baseOk(ch11, (r) => r.dateFiled) && cCh11.base >= 2) {
    const ratio = cCh11.now / cCh11.base;
    if (ratio >= 1.25 || ratio <= 0.75) {
      insights.push({
        lead: ratio > 1 ? "Real estate bankruptcies picked up." : "Real estate bankruptcies slowed.",
        body: `${plural(cCh11.now, "Chapter 11 petition")} from real estate debtors reached federal court records this week, against an average of ${cCh11.base.toFixed(1)} a week over the previous four. Recent weeks can fill in as courts post late dockets.`,
        href: link("/bankruptcy-watch.html"),
      });
    }
  }

  // 5. Repeat players: a business named in several matters in 60 days.
  const named: Record<string, { name: string; ids: Set<string>; thisWeek: boolean }> = {};
  const recent = cases.filter((c) => added(c) >= since(60));
  const SKIP = /^(united states|state of|commonwealth of|city of|county of|town(ship)? of|village of|the people|unknown|john doe|various)/i;
  for (const c of recent) {
    for (const p of c.parties || []) {
      const name = plain(p.name);
      if (!name || SKIP.test(name) || !/\b(inc|llc|l\.?p\.?|corp|co\.|company|trust|bank|reit|partners|group|holdings|properties|realty|capital|fund|management|associates|n\.a\.)\b/i.test(name)) continue;
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\b(inc|llc|lp|corp|co|company|the|n a)\b/g, "").trim();
      named[key] ??= { name, ids: new Set(), thisWeek: false };
      named[key].ids.add(c.id);
      if (inWeek(added(c))) named[key].thisWeek = true;
    }
  }
  const repeat = Object.values(named).filter((n) => n.thisWeek && n.ids.size >= 3).sort((a, b) => b.ids.size - a.ids.size)[0];
  if (repeat) {
    insights.push({
      lead: `${repeat.name} keeps turning up.`,
      body: `It is named in ${repeat.ids.size} matters on the tracker from the last 60 days, including one added this week.`,
      href: link(`/litigation.html?q=${encodeURIComponent(repeat.name)}`),
    });
  }

  // 6. A market-wide credit indicator, when the market feed has one.
  const ind = (inp.pulse?.indicators || []).find((i) => /delinquen/i.test(i.label)) || (inp.pulse?.indicators || [])[0];
  if (ind?.comparisons?.length) {
    const c = ind.comparisons[ind.comparisons.length - 1];
    const dir = ind.value > c.value ? "up from" : ind.value < c.value ? "down from" : "unchanged from";
    insights.push({
      lead: `${ind.label}: ${fmtInd(ind.value, ind.unit)}.`,
      body: `As of ${fmtDate(ind.asOf)}, ${dir} ${fmtInd(c.value, ind.unit)} (${c.label}). Source: ${ind.source || "official data"}.`,
      href: ind.sourceUrl,
    });
  }

  // ---------- the lead story ----------
  const lead = matters[0];

  // ---------- the distress radar: the week's biggest property-level events ----------
  const radar: RadarItem[] = [];
  for (const r of weekCmbs) {
    radar.push({ kind: "CMBS", color: RED, weight: (r.balance || 0) + 1e6,
      title: `${titleCase(r.propertyName)}, ${titleCase(r.city)}, ${r.state}`,
      detail: [r.eventLabel, r.balance ? `${money(r.balance)} loan` : "", r.propertyType, `reported ${fmtDate(r.filed, false)}`].filter(Boolean).join(" · "),
      href: link(`/cmbs/${r.slug}.html`) });
  }
  for (const r of weekTx) {
    const size = r.units ? `${r.units} units` : r.sqft ? `${Math.round(r.sqft).toLocaleString("en-US")} sq ft` : "";
    radar.push({ kind: "Foreclosure", color: "#c26a00", weight: (r.originalAmount || 0) || (r.sqft || 0) * 100 || 5e5,
      title: `${r.propertyName || r.address}, ${r.city}, TX`,
      detail: [`Posted for the ${fmtDate(r.saleDate, false)} sale (${r.county} County)`, r.propertyType, size,
        r.originalAmount ? `${money(r.originalAmount)} original loan` : ""].filter(Boolean).join(" · "),
      href: link("/texas-foreclosures.html") });
  }
  for (const r of weekCh11) {
    radar.push({ kind: "Chapter 11", color: "#7a3fd1", weight: 4e5,
      title: clip(r.caseName, 80), detail: `Petition filed ${fmtDate(r.dateFiled, false)} · ${r.court.replace(/^United States Bankruptcy Court,\s*/, "Bankr. ")}`,
      href: link(`/chapter-11/${r.slug}.html`) });
  }
  // Biggest first within each kind, then taken in turn so one source
  // can't fill the whole section.
  const kinds = [...new Set(radar.map((r) => r.kind))].map((k) => radar.filter((r) => r.kind === k).sort((a, b) => b.weight - a.weight));
  kinds.sort((a, b) => b[0].weight - a[0].weight);
  radar.length = 0;
  for (let i = 0; kinds.some((k) => k[i]); i++) for (const k of kinds) if (k[i]) radar.push(k[i]);

  // ---------- eight weeks of Chapter 11 petitions, for the chart ----------
  const weeks: { label: string; n: number }[] = [];
  if (ch11.length && baseOk(ch11, (r) => r.dateFiled)) {
    for (let w = 7; w >= 0; w--) {
      const end = new Date(today.getTime() - w * 7 * DAY), start = new Date(end.getTime() - 7 * DAY);
      const s = iso(start), e = iso(end);
      weeks.push({ label: fmtDate(iso(new Date(start.getTime() + DAY)), false), n: ch11.filter((r) => r.dateFiled > s && r.dateFiled <= e).length });
    }
  }

  // ---------- rulings and signals ----------
  const byId = Object.fromEntries(cases.map((c) => [c.id, c]));
  const rulings = (inp.activity?.events || []).filter((e) => inWeek(e.firstSeen))
    .map((e) => ({ id: e.caseIds[0], title: byId[e.caseIds[0]]?.title, date: e.date, text: e.text, kind: e.kind }))
    .filter((r) => r.title);
  const trends = (inp.data.trends || []).filter((t) => t.date >= since(8)).sort((a, b) => (b.date > a.date ? 1 : -1));
  const pulse = (inp.pulse?.indicators || []).slice(0, 4);

  return { from: since(6), to, cats, matters, lead, stats, insights, catRows, radar, weeks, rulings, trends, pulse };
}

export type Issue = ReturnType<typeof buildIssue>;

// Trust reports often shout ("BRAVERN OFFICE COMMONS"); a name with no
// lower-case letters is title-cased, anything else is left as written.
const titleCase = (s: string) => /[a-z]/.test(s) ? s
  : s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Lp|Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());

function fmtInd(v: number, unit: string) {
  if (unit === "%" || unit === "percent") return `${v.toFixed(2)}%`;
  if (unit === "USD" || unit === "$") return money(v);
  if (/billions/i.test(unit)) return `$${v.toLocaleString("en-US", { maximumFractionDigits: 1 })}B`;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}${unit ? " " + unit : ""}`;
}

// ---------- rendering ----------

const chip = (now: number, base: number | null) => {
  if (base === null || base < 1) return "";
  const d = (now - base) / base;
  const st = `font:600 11px/1.3 ${SANS};color:#c9d2ea;`;
  if (Math.abs(d) < 0.1) return `<span style="${st}">≈ 4-week average</span>`;
  return `<span style="${st}">${d > 0 ? "▲" : "▼"} ${Math.round(Math.abs(d) * 100)}% vs 4-week avg (${base.toFixed(1)})</span>`;
};

const section = (kicker: string, title: string, color = ACCENT) => `
<tr><td style="padding:34px 32px 10px;">
  <div style="font:700 11px/1 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${color};">${esc(kicker)}</div>
  <div style="font:700 22px/1.25 ${SERIF};color:${INK};margin-top:8px;">${esc(title)}</div>
</td></tr>`;

const button = (href: string, label: string, bg = ACCENT) =>
  `<a href="${href}" style="display:inline-block;background:${bg};color:#ffffff;font:600 14px/1 ${SANS};padding:13px 22px;border-radius:6px;text-decoration:none;">${esc(label)}</a>`;

export function renderIssue(issue: Issue, unsubscribeUrl: string, postalAddress: string) {
  const { matters, lead, stats, insights, catRows, radar, weeks, rulings, trends, pulse, cats } = issue;
  const issueDate = fmtDate(issue.to);
  const preheader = insights[0] ? `${insights[0].lead} ${insights[0].body}` : `${matters.length} new commercial real estate matters this week.`;

  const perRow = stats.length === 4 ? 2 : 3;
  const statCell = (s: Stat) => `
    <td valign="top" width="${Math.floor(100 / perRow)}%" style="padding:16px 10px 18px;border-top:1px solid #1e2742;">
      <a href="${s.href}" style="text-decoration:none;">
        <div style="font:700 34px/1 ${SERIF};color:#ffffff;">${esc(s.value)}</div>
        <div style="font:600 12px/1.3 ${SANS};color:#dfe4f2;margin-top:8px;">${esc(s.label)}</div>
        <div style="font:400 11px/1.35 ${SANS};color:#8f9bbb;margin-top:3px;">${esc(s.note)}</div>
        <div style="margin-top:6px;">${chip(s.now, s.base)}</div>
      </a>
    </td>`;
  const statRows = Array.from({ length: Math.ceil(stats.length / perRow) }, (_, i) => stats.slice(i * perRow, i * perRow + perRow))
    .map((row) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${row.map(statCell).join("")}${
      row.length < perRow ? `<td width="${Math.floor(100 / perRow) * (perRow - row.length)}%" style="border-top:1px solid #1e2742;">&nbsp;</td>` : ""}</tr></table>`).join("");

  const insightRows = insights.map((x, i) => `
    <tr><td style="padding:0 32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td valign="top" width="34" style="font:700 15px/1.5 ${SERIF};color:${ACCENT};">${i + 1}.</td>
        <td valign="top" style="font:400 15px/1.6 ${SANS};color:${TEXT};">
          <strong style="color:${INK};">${esc(x.lead)}</strong> ${esc(x.body)}${x.href ? ` <a href="${x.href}" style="color:${ACCENT};text-decoration:none;font-weight:600;">→</a>` : ""}
        </td>
      </tr></table>
    </td></tr>`).join("");

  const maxShare = Math.max(0.01, ...catRows.map((r) => Math.max(r.nowShare, r.baseShare)));
  const bars = catRows.slice(0, 8).map((r) => {
    const w1 = Math.max(1, Math.round((r.nowShare / maxShare) * 100)), w2 = Math.max(1, Math.round((r.baseShare / maxShare) * 100));
    const col = CAT_COLOR[r.id] || ACCENT;
    return `
    <tr>
      <td width="150" valign="middle" style="padding:6px 10px 6px 0;font:600 12.5px/1.25 ${SANS};color:${TEXT};">${esc(r.label)}</td>
      <td valign="middle" style="padding:6px 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 3px;"><table role="presentation" width="${w1}%" cellpadding="0" cellspacing="0"><tr><td height="12" style="background:${col};border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
          <tr><td><table role="presentation" width="${w2}%" cellpadding="0" cellspacing="0"><tr><td height="5" style="background:#c9cfdc;border-radius:2px;font-size:0;line-height:0;">&nbsp;</td></tr></table></td></tr>
        </table>
      </td>
      <td width="74" align="right" valign="middle" style="padding:6px 0 6px 10px;font:700 13px/1 ${SANS};color:${INK};white-space:nowrap;">${r.now} <span style="font-weight:400;color:${FAINT};font-size:11px;">${pct(r.nowShare)}</span></td>
    </tr>`;
  }).join("");

  const maxWeek = Math.max(1, ...weeks.map((w) => w.n));
  const weekChart = weeks.length ? `
    <tr><td style="padding:22px 32px 4px;">
      <div style="font:700 13px/1.3 ${SANS};color:${INK};">Chapter 11 petitions by real estate debtors, last eight weeks</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;"><tr>
        ${weeks.map((w, i) => `
        <td valign="bottom" align="center" style="padding:0 4px;">
          <div style="font:700 12px/1 ${SANS};color:${i === weeks.length - 1 ? RED : DIM};padding-bottom:4px;">${w.n}</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td height="${Math.max(3, Math.round((w.n / maxWeek) * 90))}" style="background:${i === weeks.length - 1 ? RED : "#c3c9d8"};border-radius:3px 3px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr></table>
          <div style="font:400 10px/1.2 ${SANS};color:${FAINT};padding-top:5px;white-space:nowrap;">${esc(w.label)}</div>
        </td>`).join("")}
      </tr></table>
      <div style="font:400 11px/1.4 ${SANS};color:${FAINT};margin-top:8px;">Weeks ending on the issue date; the red bar is this week. From federal court records.</div>
    </td></tr>` : "";

  const radarRows = radar.slice(0, 8).map((r) => `
    <tr><td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr>
        <td width="92" valign="top" style="padding:13px 10px 13px 0;">
          <span style="display:inline-block;background:${r.color};color:#fff;font:700 10px/1 ${SANS};letter-spacing:.06em;text-transform:uppercase;padding:5px 7px;border-radius:3px;">${esc(r.kind)}</span>
        </td>
        <td valign="top" style="padding:12px 0;">
          <a href="${r.href}" style="font:700 15px/1.35 ${SERIF};color:${INK};text-decoration:none;">${esc(r.title)}</a>
          <div style="font:400 12.5px/1.5 ${SANS};color:${DIM};margin-top:3px;">${esc(r.detail)}</div>
        </td>
      </tr></table>
    </td></tr>`).join("");
  const radarMore = radar.length > 8 ? `<tr><td style="padding:8px 32px 0;font:400 13px/1.5 ${SANS};color:${DIM};">Plus ${plural(radar.length - 8, "more property-level event")} this week on the <a href="${link("/bankruptcy-watch.html")}" style="color:${ACCENT};">watch pages</a>.</td></tr>` : "";

  const leadBlock = lead ? `
    <tr><td style="padding:30px 32px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MIST};border-radius:10px;"><tr><td style="padding:24px 24px 26px;">
        <div style="font:700 11px/1 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${CAT_COLOR[lead.category] || ACCENT};">Lead case · ${esc(cats[lead.category] || lead.category)}</div>
        <a href="${matterUrl(lead.id)}" style="display:block;font:700 23px/1.28 ${SERIF};color:${INK};text-decoration:none;margin-top:10px;">${esc(plain(lead.title))}</a>
        <div style="font:400 12px/1.4 ${SANS};color:${FAINT};margin-top:8px;">${esc(lead.jurisdiction || "")}${lead.date ? ` · ${fmtDate(lead.date)}` : ""}${lead.amountUsd && lead.amountBasis && lead.amountBasis !== "other" ? ` · ${money(lead.amountUsd)} ${esc(lead.amountBasis)}` : ""}</div>
        <p style="font:400 15px/1.65 ${SANS};color:${TEXT};margin:14px 0 0;">${esc(clip(plain(lead.summary || lead.brief), 520))}</p>
        ${lead.significance ? `<p style="font:400 14px/1.6 ${SANS};color:${DIM};margin:12px 0 0;border-left:3px solid ${CAT_COLOR[lead.category] || ACCENT};padding-left:12px;"><strong style="color:${INK};">Why it matters:</strong> ${esc(clip(plain(lead.significance), 360))}</p>` : ""}
        <div style="margin-top:18px;">${button(matterUrl(lead.id), "Read the full write-up")}</div>
      </td></tr></table>
    </td></tr>` : "";

  const rest = matters.slice(lead ? 1 : 0, 13);
  const restRows = rest.map((c) => `
    <tr><td style="padding:0 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr>
        <td width="6" valign="top" style="padding:16px 0;"><div style="width:6px;height:38px;background:${CAT_COLOR[c.category] || ACCENT};border-radius:3px;"></div></td>
        <td valign="top" style="padding:13px 0 13px 14px;">
          <div style="font:700 10.5px/1 ${SANS};letter-spacing:.08em;text-transform:uppercase;color:${CAT_COLOR[c.category] || ACCENT};">${esc(cats[c.category] || c.category)}${c.propertyType ? ` · <span style="color:${FAINT};">${esc(c.propertyType)}</span>` : ""}</div>
          <a href="${matterUrl(c.id)}" style="display:block;font:700 15.5px/1.35 ${SERIF};color:${INK};text-decoration:none;margin-top:6px;">${esc(plain(c.title))}</a>
          <div style="font:400 13.5px/1.55 ${SANS};color:${DIM};margin-top:4px;">${esc(clip(plain(c.brief || c.summary), 200))}</div>
        </td>
      </tr></table>
    </td></tr>`).join("");
  const restMore = matters.length > rest.length + (lead ? 1 : 0)
    ? `<tr><td style="padding:10px 32px 0;font:600 13px/1.5 ${SANS};"><a href="${link("/updates.html")}" style="color:${ACCENT};text-decoration:none;">See all ${matters.length} new matters →</a></td></tr>` : "";

  const pulseCells = pulse.map((p) => {
    const c = p.comparisons?.[p.comparisons.length - 1];
    const delta = c ? p.value - c.value : 0;
    return `
      <td valign="top" width="${Math.floor(100 / pulse.length)}%" style="padding:14px 12px;border:1px solid ${RULE};">
        <a href="${p.sourceUrl}" style="text-decoration:none;">
          <div style="font:600 11.5px/1.3 ${SANS};color:${DIM};">${esc(p.label)}</div>
          <div style="font:700 24px/1.1 ${SERIF};color:${INK};margin-top:6px;">${esc(fmtInd(p.value, p.unit))}</div>
          ${c ? `<div style="font:600 11px/1.3 ${SANS};color:${delta > 0 ? RED : delta < 0 ? GREEN : FAINT};margin-top:5px;">${delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} from ${esc(fmtInd(c.value, p.unit))} ${esc(c.label)}</div>` : ""}
          <div style="font:400 10.5px/1.3 ${SANS};color:${FAINT};margin-top:4px;">As of ${fmtDate(p.asOf)}</div>
        </a>
      </td>`;
  }).join("");

  const trendRows = trends.map((t) => `
    <tr><td style="padding:0 32px 14px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${RULE};border-radius:8px;"><tr><td style="padding:16px 18px;">
        ${t.metric ? `<div style="font:700 18px/1.3 ${SERIF};color:${RED};">${esc(t.metric)}</div>` : ""}
        <a href="${link("/trends.html")}" style="display:block;font:700 15px/1.35 ${SANS};color:${INK};text-decoration:none;margin-top:6px;">${esc(plain(t.title))}</a>
        ${t.scope ? `<div style="font:400 12px/1.4 ${SANS};color:${FAINT};margin-top:4px;">${esc(t.scope)} · ${fmtDate(t.date)}</div>` : ""}
      </td></tr></table>
    </td></tr>`).join("");

  const rulingRows = rulings.map((r) => `
    <tr><td style="padding:0 32px 10px;font:400 14px/1.55 ${SANS};color:${TEXT};">
      <a href="${matterUrl(r.id)}" style="color:${INK};font-weight:700;text-decoration:none;">${esc(plain(r.title))}</a><br>
      <span style="color:${DIM};">${fmtDate(r.date)}: ${r.kind === "closed" ? "the docket shows the case closed" : esc(clip(plain(r.text), 220))}</span>
    </td></tr>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>The CRE Distress Brief</title></head>
<body style="margin:0;padding:0;background:${MIST};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${MIST};">${esc(clip(preheader, 140))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${MIST};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;background:${PAPER};border-radius:12px;overflow:hidden;">

<tr><td style="background:${INK};padding:30px 32px 6px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font:800 13px/1 ${SANS};letter-spacing:.22em;color:#ffffff;">CRE<span style="color:${ACCENT};">DOCKET</span></td>
    <td align="right" style="font:400 12px/1 ${SANS};color:#8f9bbb;">${issueDate}</td>
  </tr></table>
  <div style="font:700 34px/1.12 ${SERIF};color:#ffffff;margin-top:22px;">The CRE Distress Brief</div>
  <div style="font:400 14.5px/1.55 ${SANS};color:#b9c2da;margin-top:10px;">Commercial real estate lawsuits, bankruptcies, CMBS defaults and foreclosure postings from the week of ${fmtDate(issue.from, false)} to ${fmtDate(issue.to, false)}, read together.</div>
  <div style="height:4px;width:64px;background:${RED};margin-top:20px;font-size:0;line-height:0;">&nbsp;</div>
</td></tr>
<tr><td style="background:${INK};padding:4px 22px 14px;">
  ${statRows}
</td></tr>

${insights.length ? section("The read", "What the week's records say") + insightRows : ""}

${leadBlock}

${radar.length ? section("Distress radar", "Properties and owners in trouble", RED) + radarRows + radarMore : ""}
${weekChart}

${catRows.length ? section("By practice area", "What's being litigated") + `
<tr><td style="padding:4px 32px 0;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bars}</table>
  <div style="font:400 11px/1.5 ${SANS};color:${FAINT};margin-top:8px;"><span style="display:inline-block;width:10px;height:8px;background:${ACCENT};"></span> share of this week's new matters &nbsp; <span style="display:inline-block;width:10px;height:4px;background:#c9cfdc;"></span> share over the prior eight weeks</div>
</td></tr>` : ""}

${pulse.length ? section("Credit conditions", "The market behind the cases") + `
<tr><td style="padding:4px 32px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;"><tr>${pulseCells}</tr></table></td></tr>` : ""}

${trends.length ? section("Market signals", "Verified figures from the trade press") + trendRows : ""}

${rest.length ? section("Also new on the tracker", `${plural(matters.length, "new matter")} this week`) + restRows + restMore : ""}

${rulings.length ? section("Docket watch", "Rulings in cases we follow") + rulingRows : ""}

<tr><td style="padding:36px 32px 8px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:10px;"><tr><td style="padding:24px;">
    <div style="font:700 19px/1.3 ${SERIF};color:#ffffff;">Know the day your borrower, tenant or property lands in a filing.</div>
    <div style="font:400 14px/1.6 ${SANS};color:#b9c2da;margin-top:8px;">Save the names and addresses you care about. CREdocket checks them against every new bankruptcy, federal suit, CMBS report and foreclosure posting, and emails you when one matches. Free.</div>
    <div style="margin-top:16px;">${button(link("/account.html#watchlists"), "Set up my alerts", RED)}</div>
  </td></tr></table>
</td></tr>

<tr><td style="padding:22px 32px 30px;font:400 12px/1.65 ${SANS};color:${FAINT};">
  Forward this to a colleague, or send them to <a href="${link("/newsletter.html")}" style="color:${ACCENT};">credocket.com/newsletter</a>.<br><br>
  You're getting this because you subscribed to CREdocket's weekly email. <a href="${unsubscribeUrl}" style="color:${FAINT};">Unsubscribe</a> in one click.
  Every figure above is counted from public court records, SEC filings, county foreclosure postings and the sources linked; CREdocket summarizes public records and reporting and is not legal advice.<br>${esc(postalAddress)}
</td></tr>

</table>
</td></tr></table>
</body></html>`;

  const text = [
    `THE CRE DISTRESS BRIEF · ${issueDate}`,
    `Week of ${fmtDate(issue.from, false)} to ${fmtDate(issue.to, false)}`, "",
    ...stats.map((s) => `${s.value}  ${s.label} (${s.note})`), "",
    ...(insights.length ? ["WHAT THE WEEK'S RECORDS SAY", ...insights.map((x, i) => `${i + 1}. ${x.lead} ${x.body}`), ""] : []),
    ...(lead ? ["LEAD CASE", plain(lead.title), clip(plain(lead.summary || lead.brief), 520), matterUrl(lead.id), ""] : []),
    ...(radar.length ? ["DISTRESS RADAR", ...radar.slice(0, 8).map((r) => `[${r.kind}] ${r.title}: ${r.detail}  ${r.href}`), ""] : []),
    ...(pulse.length ? ["CREDIT CONDITIONS", ...pulse.map((p) => `${p.label}: ${fmtInd(p.value, p.unit)} (as of ${fmtDate(p.asOf)}) ${p.sourceUrl}`), ""] : []),
    ...(trends.length ? ["MARKET SIGNALS", ...trends.map((t) => `${plain(t.title)}${t.metric ? ` (${t.metric})` : ""}`), link("/trends.html"), ""] : []),
    ...(rest.length ? ["ALSO NEW ON THE TRACKER", ...rest.flatMap((c) => [plain(c.title), matterUrl(c.id), ""])] : []),
    ...(rulings.length ? ["RULINGS IN CASES WE FOLLOW", ...rulings.map((r) => `${plain(r.title)}: ${fmtDate(r.date)}, ${r.kind === "closed" ? "case closed" : plain(r.text)}. ${matterUrl(r.id)}`), ""] : []),
    `Set up free alerts: ${link("/account.html#watchlists")}`, "",
    `Unsubscribe: ${unsubscribeUrl}`, "CREdocket summarizes public records and reporting. Not legal advice.", postalAddress,
  ].join("\n");

  const s = stats;
  const parts = [
    s[1] && s[1].now ? plural(s[1].now, "real estate Chapter 11") : "",
    s[2] && s[2].now ? `${s[2].now} CMBS loans in trouble` : "",
    `${matters.length} new cases`,
  ].filter(Boolean);
  const subject = `CRE Distress Brief: ${parts.join(", ")}`;
  return { html, text, subject };
}
