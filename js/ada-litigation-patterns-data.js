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
    {
      jurisdiction: "Missouri, Minnesota & Texas",
      concentrationNote: "These three states rounded out the middle of Seyfarth Shaw's 2025 top-10 federal Title III filing list: Missouri (183 filings), Minnesota (179), and Texas (177) ranked 5th, 6th, and 7th nationally for the full year -- each landing far more litigation than a state its size saw only a few years earlier. The pattern isn't uniform across the three. In Missouri and Minnesota, growth is overwhelmingly a website-accessibility story: per Seyfarth's separate website-suit tracking, 162 of Minnesota's 179 filings (roughly 90%) and 86 of Missouri's 183 (about 47%) were website-accessibility suits specifically, and Missouri local reporting found more than 100 locally-owned Missouri businesses had been targeted -- prompting a state legislative response (a bill requiring 90 days' notice-and-cure before suit, passed by the Missouri House in February 2026). Texas tells a different story: it doesn't appear at all in Seyfarth's top-12 website-suit ranking, meaning its 177 filings are predominantly physical/architectural-barrier claims rather than website suits -- consistent with the separate TDLR construction-registration exposure this site's ADA Title III Risk Flagging tool documents for Texas specifically.",
      commonlyTargetedIssues: [
        "Website accessibility (WCAG) suits against small, often locally-owned e-commerce and service-business websites in Missouri and Minnesota, frequently with no advance notice to the business before suit is filed",
        "Physical/architectural-barrier claims in Texas -- parking, path-of-travel, and similar on-site conditions -- rather than website suits, which barely register there",
      ],
      commonlyTargetedPropertyTypes: ["retail", "restaurant"],
      sources: [
        { label: "Seyfarth Shaw, \"ADA Title III Federal Lawsuit Filings Fall Slightly to 8,667 in 2025\" (Feb. 2026)", url: "https://www.adatitleiii.com/2026/02/ada-title-iii-federal-lawsuit-filings-fall-slightly-to-8667-in-2025/" },
        { label: "Seyfarth Shaw, \"Federal Court Website Accessibility Lawsuit Filings Bounce Back in 2025\" (Mar. 2026)", url: "https://www.adatitleiii.com/2026/03/federal-court-website-accessibility-lawsuit-filings-bounce-back-in-2025/" },
        { label: "Yahoo News/AP, \"Missouri lawmakers move to curb 'predatory' ADA lawsuits targeting small businesses\"", url: "https://www.yahoo.com/news/articles/missouri-lawmakers-move-curb-predatory-140445832.html" },
      ],
    },
    {
      jurisdiction: "New Jersey, Pennsylvania, Indiana, Georgia, Wisconsin & Colorado -- Rising \"Next Tier\" Jurisdictions",
      concentrationNote: "These six states made up the rest of Seyfarth Shaw's 2025 top-10 (or near-top-10) federal Title III filing list -- well behind the top four states, but real and growing. Pennsylvania (95 filings), New Jersey (91), and Indiana (88) took the 8th-10th spots nationally for the full year. Georgia, Wisconsin, and Colorado each logged 34 filings in just the first half of 2025 alone -- enough to tie for 10th place at that point -- but no exact full-year total was separately published for any of the three; the only confirmed data point is that Indiana's 88 full-year filings pushed Georgia specifically out of the top 10, meaning Georgia's full-year count is confirmed to be somewhere below 88. Seyfarth's own mid-2025 reporting attributes at least part of this diffusion to forum-shopping -- it specifically noted that Illinois's surge partly reflected New York-based firms filing cases elsewhere after New York federal courts grew more skeptical of website-accessibility standing, a dynamic plausibly extending to some of this broader second tier of states as plaintiffs' firms continue testing new venues.",
      commonlyTargetedIssues: [
        "Website accessibility suits, following the same national industry pattern seen elsewhere (restaurant/food and apparel/retail sites are the two most-targeted categories nationally) rather than a distinct jurisdiction-specific violation type",
        "Filing volume in this tier is still small relative to the top four states, and no jurisdiction-specific violation pattern beyond the general national industry mix above is yet well documented in public reporting for this group -- worth monitoring as volume grows",
      ],
      commonlyTargetedPropertyTypes: ["retail", "restaurant"],
      sources: [
        { label: "Seyfarth Shaw, \"ADA Title III Federal Lawsuit Filings Fall Slightly to 8,667 in 2025\" (Feb. 2026)", url: "https://www.adatitleiii.com/2026/02/ada-title-iii-federal-lawsuit-filings-fall-slightly-to-8667-in-2025/" },
        { label: "Seyfarth Shaw, \"2025 Mid-Year Report: ADA Title III Federal Lawsuit Numbers Continue To Rebound\" (Sept. 2025)", url: "https://www.adatitleiii.com/2025/09/2025-mid-year-report-ada-title-iii-federal-lawsuit-numbers-continue-to-rebound/" },
      ],
    },
    {
      jurisdiction: "Nationally",
      concentrationNote: "Two independently maintained annual trackers put a number on the overall picture. Seyfarth Shaw counted 8,667 total federal ADA Title III lawsuits in 2025 (down 2% from 2024), of which 3,117 (36%) specifically alleged a website/digital-accessibility barrier -- itself a 27% jump from 2024's 2,452 website suits. A second tracker, EcomBack, counts website-accessibility suits filed in both federal and state court rather than federal court alone (which is why its total differs from Seyfarth's federal-only figure), and counted 3,948 such suits nationally in 2025, up 23.84% from 2024's 3,188. What EcomBack's count shows clearly -- and what doesn't come through from a state-by-state list alone -- is that the pattern nationally is driven far more by industry than by jurisdiction: nine business categories accounted for 91.51% of all 2025 website suits, led by restaurant/food/beverage businesses (34.65%) and fashion/apparel/lifestyle retail (25.96%) -- together well over half of all filings nationally, regardless of state. For a property outside the handful of states individually profiled above, this national industry pattern is a more useful baseline than any state-specific one.",
      commonlyTargetedIssues: [
        "Restaurant, food, and beverage business websites -- the single most-targeted category nationally at 34.65% of all 2025 website-accessibility suits",
        "Fashion, apparel, and lifestyle retail websites -- 25.96% of 2025 suits, the second-largest category",
        "Beauty/personal care, home furnishings/décor, and health/medical websites collectively make up most of the remainder of the top nine targeted categories (roughly 23% combined)",
      ],
      commonlyTargetedPropertyTypes: ["restaurant", "retail", "medical-office"],
      sources: [
        { label: "Seyfarth Shaw, \"ADA Title III Federal Lawsuit Filings Fall Slightly to 8,667 in 2025\" (Feb. 2026)", url: "https://www.adatitleiii.com/2026/02/ada-title-iii-federal-lawsuit-filings-fall-slightly-to-8667-in-2025/" },
        { label: "EcomBack, 2025 ADA Website Compliance Lawsuit Annual Report", url: "https://www.ecomback.com/annual-2025-ada-website-accessibility-lawsuit-report" },
      ],
    },
  ],
};
