// Entity-name matching for counterparty surveillance. Stricter than the
// substring match in check-and-send-watchlist-alerts: at federal-docket
// volume a substring test fires on unrelated parties that merely share a
// word, and a wrong alert costs more trust than a missed one.

export type MatchConfidence = "exact" | "probable";

const DESIGNATORS = new Set([
  "llc", "inc", "incorporated", "corp", "corporation", "co", "company", "lp",
  "llp", "lllp", "ltd", "limited", "pllc", "pc", "pa", "na", "plc",
]);

// A core made only of these says nothing about who the party is.
const GENERIC = new Set([
  "holdings", "holding", "properties", "property", "management", "group",
  "partners", "associates", "enterprises", "investments", "capital", "realty",
  "real", "estate", "services", "the", "and", "of", "bank",
]);

const ALIAS_SPLIT = /\b(?:d\/b\/a|f\/k\/a|a\/k\/a|n\/k\/a|dba|fka|aka)\b/i;

function coreTokens(segment: string): string[] {
  const tokens = segment
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\./g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  while (tokens.length && tokens[0] === "the") tokens.shift();
  while (tokens.length && DESIGNATORS.has(tokens[tokens.length - 1])) tokens.pop();
  return tokens;
}

export function nameCores(name: string): string[][] {
  return name.split(ALIAS_SPLIT).map(coreTokens).filter((t) => t.length > 0);
}

function isGenericOnly(tokens: string[]): boolean {
  return tokens.every((t) => GENERIC.has(t));
}

// Prefix only: the leading words are what distinguish one business from
// another, so "Williams Hauling" is not "Corey Williams Hauling".
function isPrefix(longer: string[], shorter: string[]): boolean {
  return shorter.every((t, i) => longer[i] === t);
}

function compareCores(a: string[], b: string[]): MatchConfidence | null {
  if (isGenericOnly(a) || isGenericOnly(b)) return null;
  if (a.join(" ") === b.join(" ")) return a.join("").length >= 3 ? "exact" : null;
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  // A single shared word ("Summit") is not evidence of the same entity.
  if (shorter.length < 2) return null;
  return isPrefix(longer, shorter) ? "probable" : null;
}

function matchCoreSets(entityCores: string[][], partyCores: string[][]): MatchConfidence | null {
  let best: MatchConfidence | null = null;
  for (const e of entityCores) {
    for (const p of partyCores) {
      const r = compareCores(e, p);
      if (r === "exact") return "exact";
      if (r) best = r;
    }
  }
  return best;
}

export function matchEntity(entityName: string, partyName: string): MatchConfidence | null {
  return matchCoreSets(nameCores(entityName), nameCores(partyName));
}

// Both match kinds require the two names to share their first word, so
// bucketing entities by that word turns an every-entity-by-every-party
// scan into a lookup. Results are identical to calling matchEntity on
// every pair (asserted in the tests).
export class EntityIndex<T> {
  private byFirstToken = new Map<string, { item: T; cores: string[][] }[]>();

  constructor(entries: { name: string; item: T }[]) {
    for (const { name, item } of entries) {
      const cores = nameCores(name);
      const record = { item, cores };
      for (const first of new Set(cores.map((c) => c[0]))) {
        const bucket = this.byFirstToken.get(first);
        if (bucket) bucket.push(record);
        else this.byFirstToken.set(first, [record]);
      }
    }
  }

  lookup(partyName: string): { item: T; confidence: MatchConfidence }[] {
    const partyCores = nameCores(partyName);
    const seen = new Set<unknown>();
    const out: { item: T; confidence: MatchConfidence }[] = [];
    for (const first of new Set(partyCores.map((c) => c[0]))) {
      for (const record of this.byFirstToken.get(first) ?? []) {
        if (seen.has(record)) continue;
        seen.add(record);
        const confidence = matchCoreSets(record.cores, partyCores);
        if (confidence) out.push({ item: record.item, confidence });
      }
    }
    return out;
  }
}

const BUSINESS_HINT = /\b(llc|l\.l\.c|inc|incorporated|corp|corporation|company|co\.|l\.?p\.?|llp|ltd|limited|pllc|trust|partners|partnership|holdings|group|associates|enterprises|properties|ventures|fund|bank|n\.a\.)\b/i;

// Chapter 11 is also filed by individuals; the public feed lists businesses only.
export function looksLikeBusiness(name: string): boolean {
  return BUSINESS_HINT.test(name);
}
