/* =========================================================
   CREdocket — ADA Title III Litigation Patterns by Jurisdiction
   -----------------------------------------------------------
   Replaces an earlier version of this feature that named individual
   plaintiffs and law firms. Pulled at the request of site counsel
   pending legal review of the risk in publishing that kind of
   directory -- naming specific real people/firms as high-volume
   litigants, even when every fact is sourced to public court
   records and journalism, carries a different risk profile than
   the site's usual practice of reporting on named parties to a
   specific, already-adjudicated matter. Until that review is done,
   this file reports the same underlying research at the
   JURISDICTION level only: what kinds of properties/violations are
   actually getting sued over where, and how concentrated filing
   activity is -- without naming who is doing the filing.

   Companion to js/ada-risk-data.js's state/property-type risk model
   -- that tool answers "how exposed is a property like mine," this
   file answers "what's actually driving suits in a given state."
   ========================================================= */

const ADA_LITIGATION_PATTERNS_DATA = {
  disclaimer: "This directory reports publicly documented ADA Title III litigation patterns by jurisdiction -- what property types and violation categories are most frequently the subject of suits, and how concentrated filing activity is -- sourced to court records and independent reporting as cited below. It intentionally does not name individual plaintiffs or law firms. This is not legal advice; confirm any property's actual compliance with qualified counsel and a qualified accessibility inspector.",

  entries: [
    {
      jurisdiction: "California",
      concentrationNote: "Filing activity is highly concentrated, not evenly spread across potential claimants. One investigation found that in the Bay Area specifically, a small number of repeat filers -- represented by a single law firm -- accounted for roughly 75% of one year's federal filings in that metro area alone; another found one repeat filer responsible for over 2,000 suits across roughly a decade in the San Diego area.",
      commonlyTargetedIssues: [
        "Outdoor/patio dining path-of-travel and table accessibility -- a category that spiked sharply after pandemic-era outdoor dining permits were issued without accessibility review",
        "Accessible parking count, signage, and the route from parking to the entrance at small independent retail storefronts",
        "Website accessibility (WCAG 2.1 AA non-conformance) for retail and restaurant chains with an online ordering or reservation system",
      ],
      commonlyTargetedPropertyTypes: ["retail", "restaurant"],
      sources: [
        { label: "NBC Bay Area investigation", url: "https://www.nbcbayarea.com/investigations/sfs-chinatown-businesses-hit-with-lawsuits-by-prolific-ada-plaintiffs-officials-vow-help/2612493/" },
        { label: "CalMatters, Mar. 2023", url: "https://calmatters.org/justice/2023/03/california-disabled-access-lawsuits/" },
        { label: "Palo Alto Daily Post, Aug. 2021", url: "https://padailypost.com/2021/08/12/serial-ada-plaintiff-targets-restaurants-with-tables-outdoors/" },
      ],
    },
    {
      jurisdiction: "Florida",
      concentrationNote: "A relatively small number of law firms and their clients are responsible for a large share of the state's website-accessibility filing volume -- one repeat filer was tied to over 100 suits in a single year, including against small businesses with no prior notice of an alleged issue.",
      commonlyTargetedIssues: [
        "Website accessibility suits against small businesses' e-commerce and online-ordering sites -- bakeries, flower shops, and quick-service restaurants have all been named",
        "Entertainment and hospitality websites, including larger, well-known operators",
      ],
      commonlyTargetedPropertyTypes: ["retail", "restaurant", "hotel"],
      sources: [
        { label: "EcomBack tracker (via krisrivenburgh.com)", url: "https://krisrivenburgh.com/victor-ariza-roderick-v-hannah-esq-pa-lawsuits/" },
        { label: "WFTV investigation", url: "https://www.wftv.com/news/local/businesses-blindsided-thousands-sued-ada-violations-their-websites/HBMVSF4XXVDNFOZAVPMNXMZN4A/" },
      ],
    },
    {
      jurisdiction: "Illinois",
      concentrationNote: "Illinois' federal filing volume rose sharply in 2025 -- a single firm's filings alone accounted for roughly 16% of that year's national website-accessibility suit total -- as filing activity shifted here from New York after a 2024 procedural reform there made new filings harder to sustain.",
      commonlyTargetedIssues: [
        "Website accessibility (WCAG 2.1 AA non-conformance) for retail and restaurant chains, concentrated in the Northern District of Illinois",
      ],
      commonlyTargetedPropertyTypes: ["retail", "restaurant"],
      sources: [
        { label: "Level Access litigation trends", url: "https://www.levelaccess.com/blog/2024-u-s-web-accessibility-litigation-key-trends-and-strategies-for-mitigating-risk/" },
      ],
    },
    {
      jurisdiction: "New York",
      concentrationNote: "New York's federal filing volume dropped substantially after a 2024 procedural reform (CPLR §3211) required plaintiffs in these suits to plead a specific state connection and made it easier to dismiss near-identical, serially-filed complaints. Filing activity shifted toward New Jersey and Illinois as a result -- a jurisdiction-shopping pattern worth watching if a property owner assumes New York's reform reduced exposure nationally rather than just locally.",
      commonlyTargetedIssues: [
        "Website accessibility (WCAG 2.1 AA non-conformance) for apparel/fashion retail (the single most-targeted industry nationally in 2024, at 35% of that year's website suits) and restaurants (24%)",
      ],
      commonlyTargetedPropertyTypes: ["retail", "restaurant"],
      sources: [
        { label: "EcomBack 2024 Annual Report", url: "https://www.ecomback.com/annual-2024-ada-website-accessibility-lawsuit-report" },
      ],
    },
  ],
};
