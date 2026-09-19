import { buildAlertEmail, findMatches, type Entity, type StoredFiling } from "./alert-logic.ts";

function assert(cond: unknown, msg: string) { if (!cond) throw new Error(msg); }

const entity = (id: number, name: string, user = "u1"): Entity => ({ id, user_id: user, entity_name: name, entity_type: "tenant" });
const filing = (id: number, over: Partial<StoredFiling>): StoredFiling => ({
  id, filing_type: "bankruptcy_ch11", court_name: "United States Bankruptcy Court, W.D. Michigan", docket_number: "26-01234",
  case_name: "Meritage Hospitality Group Inc.", date_filed: "2026-09-17", parties: [],
  docket_url: "https://www.courtlistener.com/docket/1/x/", ...over,
});

Deno.test("a Chapter 11 caption stands in for an empty party list", () => {
  const m = findMatches([entity(1, "Meritage Hospitality Group")], [filing(10, {})]);
  assert(m.length === 1 && m[0].confidence === "exact" && m[0].matchedParty === "Meritage Hospitality Group Inc.", JSON.stringify(m));
});

Deno.test("a civil caption is never treated as a party name", () => {
  const f = filing(11, { filing_type: "civil", case_name: "Meritage Hospitality Group v. Acme", parties: [] });
  assert(findMatches([entity(1, "Meritage Hospitality Group")], [f]).length === 0, "civil caption matched");
});

Deno.test("an exact party beats a probable one on the same filing, one match per entity", () => {
  const f = filing(12, { filing_type: "civil", case_name: "A v. B", parties: ["Summit Hotel Properties, Inc.", "Summit Hotel LLC"] });
  const m = findMatches([entity(1, "Summit Hotel")], [f]);
  assert(m.length === 1 && m[0].confidence === "exact" && m[0].matchedParty === "Summit Hotel LLC", JSON.stringify(m));
});

Deno.test("each user's entity matches independently; unrelated entities do not", () => {
  const m = findMatches([entity(1, "Meritage Hospitality Group", "u1"), entity(2, "Meritage Hospitality Group Inc", "u2"), entity(3, "Meritage Homes", "u3")], [filing(10, {})]);
  assert(m.length === 2 && m.every((x) => x.entity.id !== 3), JSON.stringify(m.map((x) => x.entity.id)));
});

Deno.test("Chapter 11 email names the entity, links the docket and the claim calculator", () => {
  const [m] = findMatches([entity(1, "Meritage Hospitality Group")], [filing(10, {})]);
  const { subject, text } = buildAlertEmail([m], false);
  assert(subject.includes("Meritage Hospitality Group"), subject);
  for (const want of ["Chapter 11 bankruptcy petition", "No. 26-01234", "filed 2026-09-17", "Match confidence: High", "https://www.courtlistener.com/docket/1/x/", "lease-rejection-claim-calculator.html", "State-court filings are not yet covered"]) {
    assert(text.includes(want), `missing: ${want}\n${text}`);
  }
  assert(!text.includes("null") && !text.includes("undefined"), text);
  assert(!text.includes("SEC"), "claims SEC coverage while SEC rows are not being stored");
});

Deno.test("SEC email carries the item title and the caveat, and no bankruptcy calculator link", () => {
  const f = filing(13, { filing_type: "sec_8k", court_name: "SEC Form 8-K", case_name: "MOSAIC CO", parties: ["MOSAIC CO"],
    docket_number: "Item 2.04: Triggering Events That Accelerate or Increase a Direct Financial Obligation",
    docket_url: "https://www.sec.gov/Archives/edgar/data/1285785/x/x-index.htm" });
  const m = findMatches([entity(1, "Mosaic Co")], [f]);
  assert(m.length === 1, "no SEC match");
  const { text } = buildAlertEmail(m, true);
  for (const want of ["SEC Form 8-K event disclosure", "Item 2.04: Triggering Events", "names the type of event, not its cause", "Filing: https://www.sec.gov/"]) {
    assert(text.includes(want), `missing: ${want}\n${text}`);
  }
  assert(!text.includes("lease-rejection-claim-calculator"), "calculator link on a non-bankruptcy alert");
  assert(!text.includes("null") && !text.includes("undefined"), text);
});

Deno.test("multiple matches get a count subject and a 'possible' label where due", () => {
  const f2 = filing(14, { filing_type: "civil", case_name: "X v. Y", parties: ["Allred Heating Cooling Electric, LLC"] });
  const m = findMatches([entity(1, "Meritage Hospitality Group"), entity(2, "Allred Heating")], [filing(10, {}), f2]);
  const { subject, text } = buildAlertEmail(m, true);
  assert(subject.startsWith("2 new filings"), subject);
  assert(text.includes("Match confidence: Possible"), text);
});
