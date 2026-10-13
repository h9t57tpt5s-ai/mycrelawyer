# CREdocket newsroom brief (read fully before researching)

Used by the daily newsroom task (beat agents researching fresh matters; the editor publishes with scripts/add_matters.py). Lessons from editing are at the end.

CREdocket (credocket.com) is a commercial real estate (CRE) litigation intelligence site for owners, lenders, REITs, developers, asset managers and their lawyers. You are finding FRESH matters and writing publish-ready entries. Use today's date (UTC) when judging freshness. The site owner is a CRE litigator; quality and accuracy matter more than volume.

## What counts
- The legal EVENT (a lawsuit filed, a ruling, a settlement, a foreclosure/receivership action, a bankruptcy with real coverage, an appeal) happened within the last 7 days. Prefer the last 3 days. Report the event date exactly as the source states it.
- Commercial real estate on its face: a dispute about owning, financing, developing, leasing to businesses, operating, insuring or taking commercial property (office, retail, industrial, hotel, multifamily OWNER/operator business disputes, mixed-use, land, data centers, self-storage, senior living, medical office, life sciences).
- NOT: residential tenants/homeowners/consumers, 1-4 unit residential lending, rent-overcharge or habitability suits, debt collection, anything not about real estate. Borderline = leave it out.

## Hard rules
- Every fact, number, date, party and quote comes from a source you actually opened with WebFetch (or the browser if WebFetch is blocked). Search snippets alone are NOT enough. If you cannot open and read the source, drop the story.
- Never invent or estimate a figure. amountUsd only if a source states a dollar figure for this matter.
- Do not name individual people anywhere (not in parties, title, summary or body). Use business and government names only. "A shareholder", "the developer's principal" are fine.
- Do not copy sentences from the source article; write in your own words (short quoted phrases under 15 words are OK, at most one per entry).
- Check duplicates: read the existing-matters list the editor gives you (id | title | parties; built from js/data.js). Skip anything already covered, even under a different title.
- Do not create accounts, log in, solve CAPTCHAs, or submit forms. Skip paywalled sources you cannot read.
- Docket links: include "docketUrl" ONLY if you opened a case-specific docket page (CourtListener docket or opinion page for federal; NYSCEF only with an index number confirmed by a source). Never a generic search link.

## Output: return ONLY a JSON array of matters (best first, 0-4 of them), each exactly:
{
 "title": "<Case name or plain headline; e.g. 'Acme Lender LLC v. 123 Main Owner LLC: $40M Office Loan Foreclosure Filed in Manhattan'>",
 "category": "<one of: landlord-tenant, zoning-land-use, reit-securities, construction-defect, lending-foreclosure, environmental, eminent-domain, lease-disputes, premises-liability>",
 "status": "<one of: filed, pending, ruling, settled, appeal>",
 "date": "YYYY-MM-DD (the event date)",
 "jurisdiction": "<court name, e.g. 'U.S. District Court, Southern District of New York' or 'New York Supreme Court, New York County'>",
 "state": "<two-letter code>",
 "amount": "<short human phrase, e.g. '$40 million mortgage' or 'Injunctive relief'>",
 "sourceUrl": "<the best primary or most authoritative source you opened>",
 "summary": "<2-4 sentences: what happened>",
 "significance": "<2-4 sentences: why it matters to CRE owners, lenders, tenants or investors>",
 "body": ["<4-6 plain-prose paragraphs, no markdown, ~500-700 words total: the facts, the legal issue, procedural posture, and a final paragraph of practical takeaways written as prose>"],
 "tags": ["3-5 short lowercase tags"],
 "parties": [{"name": "<legal entity name exactly as the source gives it>", "role": "<Plaintiff/Defendant/Lender/Borrower/Landlord/Tenant/Debtor/Appellant/Appellee...>"}],
 "judge": "<full name if the source names the judge, else null>",
 "amountUsd": <number or null>,
 "amountBasis": "<loan | damages sought | judgment | award | settlement | claim | purchase price | other>  (omit if amountUsd is null)",
 "propertyType": "<one of: Office, Multifamily, Retail, Industrial, Hospitality, Mixed-Use, Land/Development, Medical Office, Data Center, Life Sciences, Senior Living, Self-Storage> (omit if unclear)",
 "docketUrl": "<only if verified as above, else omit>",
 "docketLabel": "<e.g. 'CourtListener docket' if docketUrl given>",
 "timeline": [{"when": "Month D, YYYY", "label": "<what happened>", "current": true}],
 "sourcesOpened": ["<every URL you actually opened and relied on>"],
 "verificationNote": "<one sentence: which source states the event date, the figures and the parties>"
}
If you find nothing that meets the bar, return [] (an empty list is fine; padding is not).

## Editor's lessons (2026-10-13 first pass; keep adding)
- amountUsd is only an exact dollar amount a source states as at stake (loan, damages sought, judgment, award, settlement, claim). A budget, a "more than $X" deal value or a property's worth is not; put it in "amount" text instead.
- Skip suits whose real defendants or plaintiffs are individuals (e.g. RICO suits against a founder by family trusts), even if the write-up avoids names.
- Do not repeat allegations from an individual's personal bankruptcy or other personal case.
- Court opinion pages (nycourts.gov/reporter "current" lists, supremecourt.ohio.gov/rod, txcourts.gov Business Court opinions, CourtListener opinions) produced four solid rulings in one pass; work them every day.
- Court PDFs (ca9 BAP, ca6, courts.delaware.gov, pacourts.us) come back from WebFetch as unreadable binary; save the PDF and extract text (pypdf) to verify. courts.delaware.gov blocks curl, so use WebFetch's saved copy.
- The Ninth Circuit BAP opinion list (bap9.uscourts.gov/opinions) yielded two CRE bankruptcy rulings in one week; work it alongside the state lists.
- Agents fill unknown days with "1" ("January 1, 2025 (month reported; day not stated)"); write the month alone instead.
- A preferred-equity investment is not a "loan"; use amountBasis "other".
- When an appeal's only appellant is an individual (e.g. a foreclosure bidder), describe them generically and cut any finding aimed at a named individual.
- Lending beat came back empty: federal-suits.json lender suits this week were already covered or lacked explanatory reporting.
