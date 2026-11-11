// Distress Radar data (2026-11-11): every property- and owner-level distress
// record CREdocket publishes, joined into one feed for distress-radar.html.
//
//   deno run -A scripts/build_distress_radar.ts
//
// Reads ops/tx-foreclosures.json, ops/cmbs-distress.json,
// ops/ch11-petitions.json, ops/federal-suits.json, ops/nyc-commercial-distress.json
// (when present) and the tracker's lending & foreclosure matters
// (js/data-lite.js). Street addresses are placed on the map with the U.S.
// Census Bureau's free geocoder; results (hits and misses) are cached in
// ops/geocode-cache.json so each address is looked up once. Records with no
// street address (bankruptcies, lawsuits) count toward their state only.
//
// Writes js/radar-data.json (records + map positions) and, once,
// js/radar-geo.json (state outlines projected to a 960x600 Albers USA
// frame, from the public-domain us-atlas states file).

import { geoAlbersUsa, geoPath } from "npm:d3-geo@3.1.1";
import { feature } from "npm:topojson-client@3.1.0";

const W = 960, H = 600;
const proj = geoAlbersUsa().scale(1250).translate([W / 2, H / 2]);

const STATES: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA", Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD", Massachusetts: "MA", Michigan: "MI", Minnesota: "MN",
  Mississippi: "MS", Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH", "New Jersey": "NJ",
  "New Mexico": "NM", "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR",
  Pennsylvania: "PA", "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX", Utah: "UT",
  Vermont: "VT", Virginia: "VA", Washington: "WA", "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "Puerto Rico": "PR",
};
const courtState = (court: string) => {
  if (/District of Columbia/.test(court)) return "DC";
  // Longest names first so "West Virginia" wins over "Virginia".
  const hit = Object.keys(STATES).sort((a, b) => b.length - a.length).find((n) => new RegExp(`\\b${n}\\b`).test(court));
  return hit ? STATES[hit] : "";
};
const slugify = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const titleCase = (s: string) => /[a-z]/.test(s) ? s
  : s.toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\b(Llc|Lp|Ii|Iii|Iv)\b/g, (m) => m.toUpperCase());
const readJson = async <T>(p: string, fallback: T): Promise<T> => {
  try { return JSON.parse(await Deno.readTextFile(p)) as T; } catch { return fallback; }
};
const exists = (p: string) => { try { Deno.statSync(p); return true; } catch { return false; } };

// ---------- geocoding (Census Bureau, free, no key) ----------
type Geo = { lat: number; lon: number } | null;
const CACHE_FILE = "ops/geocode-cache.json";
const cache: Record<string, Geo> = await readJson(CACHE_FILE, {});
let lookups = 0;
async function geocode(address: string, city: string, state: string, zip = ""): Promise<Geo> {
  const one = `${address}, ${city}, ${state} ${zip}`.replace(/\s+/g, " ").trim();
  const key = one.toLowerCase();
  if (key in cache) return cache[key];
  if (lookups >= 400) return null; // per-run ceiling; the rest are picked up next run
  lookups++;
  const url = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=${encodeURIComponent(one)}&benchmark=Public_AR_Current&format=json`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "CREdocket distress radar (credocket.com)" }, signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const m = (await r.json())?.result?.addressMatches?.[0]?.coordinates;
      cache[key] = m ? { lat: +m.y.toFixed(5), lon: +m.x.toFixed(5) } : null;
      return cache[key];
    } catch (e) {
      if (attempt === 2) { console.warn(`geocode failed for ${one}: ${e}`); return null; } // not cached: retried next run
      await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
    }
  }
  return null;
}

// ---------- the records ----------
type Rec = {
  id: string; kind: string; date: string; title: string; detail: string; city: string; state: string; propertyType: string;
  amount: number | null; amountLabel: string; url: string; source: string; x?: number; y?: number; future?: string;
};
const recs: Rec[] = [];
const place = async (r: Rec, address: string, zip = "") => {
  if (!address || !/^\d/.test(address.trim())) return;
  const g = await geocode(address, r.city, r.state, zip);
  const p = g && proj([g.lon, g.lat]);
  if (p) { r.x = +p[0].toFixed(1); r.y = +p[1].toFixed(1); }
};

type Tx = { county: string; state: string; saleDate: string; address: string; city: string; zip: string; propertyName: string;
  propertyType: string; sqft: number | null; units: number | null; lender: string; originalAmount: number | null; firstSeen: string; slug: string };
for (const t of (await readJson<{ properties: Tx[] }>("ops/tx-foreclosures.json", { properties: [] })).properties) {
  const page = [t.propertyName, t.address].filter(Boolean).map((n) => `properties/${slugify(`${n} ${t.city} ${t.state}`)}.html`).find(exists);
  const size = t.units ? `${t.units} units` : t.sqft ? `${Math.round(t.sqft).toLocaleString("en-US")} sq ft` : "";
  const r: Rec = {
    id: `tx-${t.slug}`, kind: "foreclosure", date: t.firstSeen, future: t.saleDate,
    title: titleCase(t.propertyName || t.address), city: titleCase(t.city), state: t.state, propertyType: t.propertyType || "",
    detail: [`${t.county} County notice of trustee's sale`, size, t.lender ? `lender named in the notice: ${t.lender}` : ""].filter(Boolean).join(" · "),
    amount: t.originalAmount, amountLabel: t.originalAmount ? "original loan" : "",
    url: `/${page || "texas-foreclosures.html"}`, source: `${t.county} County foreclosure notice`,
  };
  await place(r, t.address, t.zip);
  recs.push(r);
}

type Cmbs = { event: string; eventLabel: string; propertyName: string; address: string; city: string; state: string; zip: string;
  propertyType: string; balance: number | null; trust: string; filed: string; slug: string; paymentStatus?: string };
for (const c of (await readJson<{ events: Cmbs[] }>("ops/cmbs-distress.json", { events: [] })).events) {
  const r: Rec = {
    id: `cmbs-${c.slug}`, kind: "cmbs", date: c.filed, title: titleCase(c.propertyName), city: titleCase(c.city), state: c.state,
    propertyType: c.propertyType || "", detail: [c.eventLabel, c.paymentStatus, c.trust].filter(Boolean).join(" · "),
    amount: c.balance, amountLabel: c.balance ? "loan balance" : "", url: `/cmbs/${c.slug}.html`, source: "CMBS trust report (SEC)",
  };
  await place(r, c.address, c.zip);
  recs.push(r);
}

type Filing = { caseName: string; court: string; dateFiled: string; slug: string; docketNumber: string };
for (const f of (await readJson<{ filings: Filing[] }>("ops/ch11-petitions.json", { filings: [] })).filings) {
  recs.push({ id: `ch11-${f.slug}`, kind: "bankruptcy", date: f.dateFiled, title: f.caseName, city: "", state: courtState(f.court),
    propertyType: "", detail: `${f.court.replace(/^United States Bankruptcy Court,\s*/, "Bankruptcy Court, ")} · No. ${f.docketNumber}`,
    amount: null, amountLabel: "", url: `/chapter-11/${f.slug}.html`, source: "Federal bankruptcy court" });
}
for (const f of (await readJson<{ filings: Filing[] }>("ops/federal-suits.json", { filings: [] })).filings) {
  recs.push({ id: `fed-${f.slug}`, kind: "lawsuit", date: f.dateFiled, title: titleCase(f.caseName), city: "", state: courtState(f.court),
    propertyType: "", detail: `${f.court.replace(/^District Court,\s*/, "U.S. District Court, ")} · No. ${f.docketNumber}`,
    amount: null, amountLabel: "", url: `/federal-cases/${f.slug}.html`, source: "Federal district court" });
}

type Nyc = { docTypeLabel: string; recordedDate: string; documentId: string; address: string; borough: string; zip: string;
  propertyType: string; owner?: string; filer?: string; amount?: number | null; lat?: number; lon?: number; slug: string; acrisUrl: string };
for (const n of (await readJson<{ filings: Nyc[] }>("ops/nyc-commercial-distress.json", { filings: [] })).filings) {
  const r: Rec = {
    id: `nyc-${n.slug}`, kind: "nyc", date: n.recordedDate, title: titleCase(n.address), city: n.borough, state: "NY",
    propertyType: n.propertyType || "", detail: [n.docTypeLabel, n.owner ? `owner: ${n.owner}` : "", n.filer ? `filed by ${n.filer}` : ""].filter(Boolean).join(" · "),
    amount: n.amount ?? null, amountLabel: n.amount ? "amount on the document" : "", url: n.acrisUrl, source: "NYC ACRIS recorded document",
  };
  const p = n.lat && n.lon ? proj([n.lon, n.lat]) : null;
  if (p) { r.x = +p[0].toFixed(1); r.y = +p[1].toFixed(1); }
  recs.push(r);
}

// Tracker write-ups of lender suits and foreclosures.
const src = await Deno.readTextFile("js/data-lite.js");
const data = JSON.parse(src.slice(src.indexOf("const RELAW_DATA = ") + 19, src.lastIndexOf(";")));
for (const c of data.cases as { id: string; title: string; category: string; date: string; state?: string; propertyType?: string;
  amountUsd?: number | null; amountBasis?: string; jurisdiction?: string; brief?: string }[]) {
  if (c.category !== "lending-foreclosure") continue;
  recs.push({ id: `m-${c.id}`, kind: "litigation", date: c.date, title: c.title.replace(/\s*\([^)]*\)\s*$/, ""), city: "", state: c.state || "",
    propertyType: c.propertyType || "", detail: [c.jurisdiction, c.brief].filter(Boolean).join(" · ").slice(0, 220),
    amount: c.amountUsd ?? null, amountLabel: c.amountUsd ? (c.amountBasis || "") : "", url: `/matters/${c.id}.html`, source: "CREdocket tracker write-up" });
}

// When each record first appeared on the radar (drives the daily alert
// email). The first build dates every existing record by its own date, so
// launching the radar never reads as a flood of new records.
const SEEN_FILE = "ops/radar-seen.json";
const seen: Record<string, string> = await readJson(SEEN_FILE, {});
const firstBuild = !Object.keys(seen).length;
const nowIso = new Date().toISOString().slice(0, 19) + "Z";
for (const r of recs) {
  seen[r.id] ??= firstBuild ? `${r.date.slice(0, 10)}T00:00:00Z` : nowIso;
  (r as Rec & { seen?: string }).seen = seen[r.id];
}
const live = new Set(recs.map((r) => r.id));
await Deno.writeTextFile(SEEN_FILE, JSON.stringify(Object.fromEntries(Object.entries(seen).filter(([k]) => live.has(k)).sort()), null, 0) + "\n");

recs.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
const placed = recs.filter((r) => r.x !== undefined).length;
await Deno.writeTextFile("js/radar-data.json", JSON.stringify({ generated: new Date().toISOString(), count: recs.length, records: recs }));
await Deno.writeTextFile(CACHE_FILE, JSON.stringify(Object.fromEntries(Object.entries(cache).sort()), null, 1) + "\n");

if (!exists("js/radar-geo.json") || Deno.args.includes("--geo")) {
  const topo = await (await fetch("https://cdn.jsdelivr.net/npm/us-atlas@3.0.1/states-10m.json")).json();
  // deno-lint-ignore no-explicit-any
  const fc = feature(topo, topo.objects.states) as any;
  const path = geoPath(proj);
  const round = (d: string) => d.replace(/\d+\.\d+/g, (n) => String(Math.round(+n)));
  // deno-lint-ignore no-explicit-any
  const states = fc.features.map((f: any) => {
    const d = path(f);
    const c = path.centroid(f);
    return d && STATES[f.properties.name] ? { abbr: STATES[f.properties.name], name: f.properties.name, d: round(d), cx: +c[0].toFixed(1), cy: +c[1].toFixed(1) } : null;
  }).filter(Boolean);
  await Deno.writeTextFile("js/radar-geo.json", JSON.stringify({ width: W, height: H, source: "us-atlas 3.0.1 (U.S. Census Bureau cartographic boundaries), Albers USA", states }));
}
console.log(`radar: ${recs.length} records, ${placed} placed on the map, ${lookups} new geocoder lookups`);
