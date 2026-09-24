// Pure matching and email-text logic for ingest-court-filings, kept free
// of I/O so it can be unit-tested (see alert-logic.test.ts).

import { EntityIndex, type MatchConfidence } from "./entity-match.ts";

const SITE_URL = "https://credocket.com";

// A Chapter 11 caption is the debtor's name, so it stands in when the
// party list is empty. A civil caption ("A v. B") is not a party name.
export function matchableNames(f: { filing_type: string; case_name: string; parties: string[] }): string[] {
  if (f.parties.length) return f.parties;
  return f.filing_type === "bankruptcy_ch11" ? [f.case_name] : [];
}

export type StoredFiling = {
  id: number; source: string; filing_type: string; court_name: string | null; docket_number: string | null;
  case_name: string; date_filed: string; parties: string[]; docket_url: string;
};

// State trial-court sources and how to name them to a reader. A source is
// only ever claimed as covered once rows from it actually exist.
export const STATE_SOURCE_NAMES: Record<string, string> = {
  hillsborough_fl: "Hillsborough County, Florida civil courts",
  harris_jp_tx: "Harris County, Texas justice courts",
};
export type Entity = { id: number; user_id: string; entity_name: string; entity_type: string };
export type NewMatch = { entity: Entity; filing: StoredFiling; confidence: MatchConfidence; matchedParty: string };

export function findMatches(entities: Entity[], filings: StoredFiling[]): NewMatch[] {
  const index = new EntityIndex(entities.map((e) => ({ name: e.entity_name, item: e })));
  const out: NewMatch[] = [];
  for (const filing of filings) {
    const best = new Map<number, { entity: Entity; confidence: MatchConfidence; party: string }>();
    for (const party of matchableNames(filing)) {
      for (const { item: entity, confidence } of index.lookup(party)) {
        const prev = best.get(entity.id);
        if (!prev || (prev.confidence !== "exact" && confidence === "exact")) best.set(entity.id, { entity, confidence, party });
      }
    }
    for (const m of best.values()) out.push({ entity: m.entity, filing, confidence: m.confidence, matchedParty: m.party });
  }
  return out;
}

const KIND_LABEL: Record<string, string> = {
  bankruptcy_ch11: "Chapter 11 bankruptcy petition",
  civil: "Federal civil suit",
  sec_8k: "SEC Form 8-K event disclosure",
};

function kindLabel(f: StoredFiling): string {
  if (f.filing_type === "civil" && Object.hasOwn(STATE_SOURCE_NAMES, f.source)) return "State court civil filing";
  return KIND_LABEL[f.filing_type] ?? "Filing";
}

function describeFiling(m: NewMatch): string[] {
  const isSec = m.filing.filing_type === "sec_8k";
  const isState = Object.hasOwn(STATE_SOURCE_NAMES, m.filing.source);
  const confidence = m.confidence === "exact"
    ? `Match confidence: High -- the name "${m.matchedParty}" matches your saved name once corporate suffixes are ignored.`
    : `Match confidence: Possible -- your saved name is the leading part of "${m.matchedParty}". Confirm this is the same entity before relying on it.`;
  return [
    `"${m.entity.entity_name}" (${m.entity.entity_type}) -- ${kindLabel(m.filing)}`,
    `${m.filing.case_name}`,
    isSec
      ? `${m.filing.docket_number ?? ""} -- filed ${m.filing.date_filed}`
      : `${m.filing.court_name ?? ""}${m.filing.docket_number ? `, No. ${m.filing.docket_number}` : ""} -- filed ${m.filing.date_filed}`,
    isSec ? "An 8-K item names the type of event, not its cause. Item 2.04 also covers a company redeeming its own notes early, and Item 3.01 also covers a voluntary transfer between exchanges. Read the filing before drawing a conclusion." : null,
    confidence,
    isState ? "Only business parties are recorded from state-court files, so an individual co-party will not appear here. The clerk's site has no direct link to a case; search it by the case number above." : null,
    `${isSec ? "Filing" : isState ? "Clerk's case search" : "Docket"}: ${m.filing.docket_url}`,
    "",
  ].filter((line): line is string => line !== null);
}

// liveSources: the sources that currently have stored rows. The coverage
// line must never claim a source that is not actually producing data.
export function coverageLine(liveSources: Set<string>): string {
  const parts = ["all new Chapter 11 petitions nationwide", "federal civil suits naming your saved entities"];
  if (liveSources.has("sec_edgar")) parts.push("SEC Form 8-K filings under Items 1.03, 2.04 and 3.01");
  const states = Object.keys(STATE_SOURCE_NAMES).filter((s) => liveSources.has(s)).map((s) => STATE_SOURCE_NAMES[s]);
  const list = parts.length === 2 ? parts.join(" and ") : `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
  const stateText = states.length
    ? `State trial courts are covered only in ${states.join(" and ")}, and only for commercial case types with a business defendant (never residential or debt-collection matters); every other state court is not covered`
    : "State-court filings are not yet covered";
  return `Coverage: ${list}. ${stateText}, so no alert is not proof of no filing.`;
}

export function buildAlertEmail(matches: NewMatch[], liveSources: Set<string>): { subject: string; text: string } {
  const subject = matches.length === 1
    ? `"${matches[0].entity.entity_name}" was just named in a new court or SEC filing`
    : `${matches.length} new filings name entities in your portfolio`;
  const text = [
    "CREdocket's twice-daily check of new court and regulatory filings found the following against your portfolio:",
    "",
    ...matches.flatMap(describeFiling),
    coverageLine(liveSources),
    "",
    matches.some((m) => m.filing.filing_type === "bankruptcy_ch11")
      ? `If the debtor is your tenant and rejects the lease, your claim for lost rent is capped by 11 U.S.C. 502(b)(6). Estimate the cap: ${SITE_URL}/lease-rejection-claim-calculator.html?utm_source=credocket&utm_medium=email&utm_campaign=filing-alert`
      : null,
    matches.some((m) => m.filing.filing_type === "bankruptcy_ch11") ? "" : null,
    `Manage your portfolio: ${SITE_URL}/account.html?utm_source=credocket&utm_medium=email&utm_campaign=filing-alert`,
  ].filter((line): line is string => line !== null).join("\n");
  return { subject, text };
}

// Slack delivery (added 2026-09-24). A user pastes a Slack incoming-webhook
// URL on the account page; it is stored in their own user_metadata. The
// server only ever posts to Slack's webhook host, so a stored value can
// never aim this function at an arbitrary address.
const SLACK_WEBHOOK_RE = /^https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+$/;

export function isSlackWebhook(url: unknown): url is string {
  return typeof url === "string" && url.length <= 300 && SLACK_WEBHOOK_RE.test(url);
}

export function buildSlackMessage(matches: NewMatch[], liveSources: Set<string>): { text: string } {
  const { subject, text } = buildAlertEmail(matches, liveSources);
  return { text: `*${subject}*\n\n${text}` };
}
