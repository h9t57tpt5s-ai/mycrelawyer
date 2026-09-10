/* =========================================================
   CREdocket — ADA Title III Serial Plaintiff Profiles
   -----------------------------------------------------------
   Named individuals and firms behind the highest-volume ADA
   Title III physical- and website-accessibility filing activity,
   built from a sourced research pass (see each entry's `sources`).
   This is a companion to js/ada-risk-data.js's state/property-type
   risk model -- that tool answers "how exposed is a property like
   mine," this file answers "who's actually filing these suits."

   Sourcing discipline, deliberately conservative:
   - Every filing-volume figure below carries its source, the
     period/court it covers, and a confidence rating. Where two
     sources disagreed and one lacked disclosed methodology, only
     the better-sourced figure is kept.
   - Individuals/firms named in secondary-aggregator coverage with
     NO independently corroborated volume figure (e.g. Andres
     Gomez, Aishia Petersen/Raymond Mahlberg -- both single-source,
     unverified per the underlying research) are deliberately
     excluded rather than listed with a fabricated or low-confidence
     number standing in for a real one.
   - "knownCases" lists specific, named matters with a public-record
     source -- not estimated aggregates. This list grows slowly, by
     the same one-case-at-a-time verification CREdocket's own
     litigation tracker is built on, not a batch data pull.
   ========================================================= */

const ADA_SERIAL_PLAINTIFFS_DATA = {
  disclaimer: "This directory profiles publicly reported ADA Title III filing activity by named individuals and law firms, sourced to court records and independent journalism as cited on each profile. It does not allege wrongdoing -- filing an ADA suit, including repeatedly, is lawful, and many named plaintiffs have legitimate, unresolved accessibility grievances. Filing-volume figures are drawn from the specific court, period, and source cited and should not be read as a current or comprehensive count. This is not legal advice; confirm any property's actual compliance with qualified counsel and a qualified accessibility inspector.",

  entries: [
    {
      slug: "scott-johnson",
      name: "Scott Johnson",
      type: "individual",
      counsel: "Potter Handy LLP (dba Center for Disability Access), San Diego",
      jurisdictions: ["California"],
      filingVolume: {
        text: "1,500+ suits",
        detail: "Northern District of California; ~100 filings/month reported in 2021",
        source: "Palo Alto Daily Post",
        sourceUrl: "https://padailypost.com/2021/08/12/serial-ada-plaintiff-targets-restaurants-with-tables-outdoors/",
        confidence: "High",
      },
      targetPropertyTypes: ["restaurant", "retail"],
      targetNote: "Restaurants, particularly outdoor/patio dining added under pandemic-era permits, and small independent retail.",
      knownCases: [],
      notes: "The single most litigious individual ADA plaintiff identified in this research, filing in N.D. Cal. for over a decade. Reporting ties a wave of his 2021 filings specifically to outdoor dining setups permitted without accessibility review during COVID-era patio expansions.",
      sources: [
        { label: "Palo Alto Daily Post, Aug. 2021", url: "https://padailypost.com/2021/08/12/serial-ada-plaintiff-targets-restaurants-with-tables-outdoors/" },
        { label: "Piedmont Exedra, Feb. 2024", url: "https://piedmontexedra.com/2024/02/serial-ada-plaintiffs-alter-tactics-and-venues-as-they-launch-new-litigation-in-state-courts" },
      ],
    },
    {
      slug: "brian-whitaker",
      name: "Brian Whitaker",
      type: "individual",
      counsel: "Potter Handy LLP",
      jurisdictions: ["California"],
      filingVolume: {
        text: "590 suits",
        detail: "One federal district, 2021 (PACER-based reporting); a separately reported lifetime total of 1,700+ federal cases has not been independently corroborated here",
        source: "CBS News San Francisco, citing court records",
        sourceUrl: "https://www.cbsnews.com/sanfrancisco/news/judge-dismisses-san-mateo-ada-lawsuit-serial-filer-brian-whitaker-potter-handy/",
        confidence: "Medium-High",
      },
      targetPropertyTypes: ["retail", "restaurant"],
      targetNote: "Small retail and restaurants across Northern and Central California.",
      knownCases: [
        { caption: "ADA suit dismissed, San Mateo County", note: "A California court dismissed one of Whitaker's suits; reported as part of broader judicial pushback on high-volume filers in the district.", sourceUrl: "https://www.cbsnews.com/sanfrancisco/news/judge-dismisses-san-mateo-ada-lawsuit-serial-filer-brian-whitaker-potter-handy/" },
      ],
      notes: "Represented by the same firm as Scott Johnson, Orlando Garcia, and Chris Langer -- see the Potter Handy LLP firm profile for the aggregate pattern across all four.",
      sources: [
        { label: "CBS News San Francisco", url: "https://www.cbsnews.com/sanfrancisco/news/judge-dismisses-san-mateo-ada-lawsuit-serial-filer-brian-whitaker-potter-handy/" },
      ],
    },
    {
      slug: "orlando-garcia",
      name: "Orlando Garcia",
      type: "individual",
      counsel: "Potter Handy LLP",
      jurisdictions: ["California"],
      filingVolume: {
        text: "269 suits",
        detail: "One federal district, 2021; ~1,000 lifetime suits reported since 2014",
        source: "NBC Bay Area investigation",
        sourceUrl: "https://www.nbcbayarea.com/investigations/sfs-chinatown-businesses-hit-with-lawsuits-by-prolific-ada-plaintiffs-officials-vow-help/2612493/",
        confidence: "Medium-High",
      },
      targetPropertyTypes: ["retail", "restaurant"],
      targetNote: "Concentrated in San Francisco's Chinatown-area small retail and restaurants, per NBC Bay Area's investigation.",
      knownCases: [],
      notes: "NBC Bay Area's investigation found Garcia among a small group of Potter Handy clients responsible for the large majority of the firm's San Francisco federal filings -- see the Potter Handy LLP firm profile.",
      sources: [
        { label: "NBC Bay Area investigation", url: "https://www.nbcbayarea.com/investigations/sfs-chinatown-businesses-hit-with-lawsuits-by-prolific-ada-plaintiffs-officials-vow-help/2612493/" },
      ],
    },
    {
      slug: "chris-langer",
      name: "Chris Langer",
      type: "individual",
      counsel: "Potter Handy LLP (Center for Disability Access)",
      jurisdictions: ["California"],
      filingVolume: {
        text: "2,000+ suits",
        detail: "Over roughly 10 years, San Diego area",
        source: "CalMatters investigation",
        sourceUrl: "https://calmatters.org/justice/2023/03/california-disabled-access-lawsuits/",
        confidence: "High",
      },
      targetPropertyTypes: ["retail"],
      targetNote: "Retail storefronts in the San Diego area.",
      knownCases: [],
      notes: "CalMatters' investigative reporting on California's disabled-access lawsuit economy identifies Langer as one of its highest-volume individual filers.",
      sources: [
        { label: "CalMatters, Mar. 2023", url: "https://calmatters.org/justice/2023/03/california-disabled-access-lawsuits/" },
      ],
    },
    {
      slug: "potter-handy-llp",
      name: "Potter Handy LLP",
      type: "firm",
      counsel: null,
      jurisdictions: ["California"],
      filingVolume: {
        text: "~75% of Bay Area federal ADA filings",
        detail: "10 named clients accounted for 85% of San Francisco's federal Title III filings in 2021",
        source: "NBC Bay Area investigation, PACER-based",
        sourceUrl: "https://www.nbcbayarea.com/investigations/sfs-chinatown-businesses-hit-with-lawsuits-by-prolific-ada-plaintiffs-officials-vow-help/2612493/",
        confidence: "High",
      },
      targetPropertyTypes: ["retail", "restaurant"],
      targetNote: "Small retail and restaurants, disproportionately concentrated in specific San Francisco commercial corridors per the NBC Bay Area investigation.",
      knownCases: [],
      notes: "San Diego firm (dba Center for Disability Access) representing the four individual plaintiffs profiled separately here -- Scott Johnson, Brian Whitaker, Orlando Garcia, and Chris Langer -- among others. The firm-level concentration figure is the more load-bearing statistic: a small number of repeat plaintiffs represented by one firm drive the large majority of filing volume in the jurisdictions where it operates, which is the structural pattern CRE owners in California should understand rather than treating each name as an isolated actor.",
      sources: [
        { label: "NBC Bay Area investigation", url: "https://www.nbcbayarea.com/investigations/sfs-chinatown-businesses-hit-with-lawsuits-by-prolific-ada-plaintiffs-officials-vow-help/2612493/" },
        { label: "CalMatters, Mar. 2023", url: "https://calmatters.org/justice/2023/03/california-disabled-access-lawsuits/" },
      ],
    },
    {
      slug: "victor-ariza",
      name: "Victor Ariza",
      type: "individual",
      counsel: "Law Office of Pelayo Duran; Roderick V. Hannah, Esq., P.A.",
      jurisdictions: ["Florida"],
      filingVolume: {
        text: "100–113 suits in 2024",
        detail: "Has sued hundreds of businesses total, including Disney and SeaWorld",
        source: "EcomBack tracker, corroborated by WFTV",
        sourceUrl: "https://krisrivenburgh.com/victor-ariza-roderick-v-hannah-esq-pa-lawsuits/",
        confidence: "High",
      },
      targetPropertyTypes: ["retail", "restaurant"],
      targetNote: "Retail, quick-service restaurants, and entertainment/theme-park websites in South Florida.",
      knownCases: [
        { caption: "Leaf & Blossom Co. (Orlando flower shop)", note: "Small business reportedly paid over $7,000 in combined legal fees and settlement.", sourceUrl: "https://www.wftv.com/news/local/businesses-blindsided-thousands-sued-ada-violations-their-websites/HBMVSF4XXVDNFOZAVPMNXMZN4A/" },
      ],
      notes: "One of South Florida's highest-volume named plaintiffs in website-accessibility suits, per EcomBack's PACER-derived tracker.",
      sources: [
        { label: "EcomBack tracker (via krisrivenburgh.com)", url: "https://krisrivenburgh.com/victor-ariza-roderick-v-hannah-esq-pa-lawsuits/" },
        { label: "WFTV investigation", url: "https://www.wftv.com/news/local/businesses-blindsided-thousands-sued-ada-violations-their-websites/HBMVSF4XXVDNFOZAVPMNXMZN4A/" },
      ],
    },
    {
      slug: "nelson-fernandez",
      name: "Nelson Fernandez",
      type: "individual",
      counsel: "Roderick V. Hannah, Esq., P.A.",
      jurisdictions: ["Florida"],
      filingVolume: {
        text: "86 suits in one year",
        detail: "November 2024 EcomBack tracker snapshot",
        source: "EcomBack tracker",
        sourceUrl: "https://www.ecomback.com/annual-2024-ada-website-accessibility-lawsuit-report",
        confidence: "Medium-High",
      },
      targetPropertyTypes: ["retail", "restaurant"],
      targetNote: "Retail and quick-service restaurant websites in South Florida.",
      knownCases: [],
      notes: "Represented by the same South Florida firm as Victor Ariza -- part of the same regional filing pattern.",
      sources: [
        { label: "EcomBack 2024 Annual Report", url: "https://www.ecomback.com/annual-2024-ada-website-accessibility-lawsuit-report" },
      ],
    },
    {
      slug: "manning-law-apc",
      name: "Manning Law, APC",
      type: "firm",
      counsel: null,
      jurisdictions: ["California"],
      filingVolume: {
        text: "268 website suits in 2024 (8.4% of that year's national total)",
        detail: "Client Perla Mageno alone associated with 600+ ADA website suits per a secondary aggregator -- not independently re-verified against PACER here",
        source: "EcomBack 2024 Annual Report",
        sourceUrl: "https://www.ecomback.com/annual-2024-ada-website-accessibility-lawsuit-report",
        confidence: "High (firm total); Medium (client-level figure)",
      },
      targetPropertyTypes: ["restaurant", "retail"],
      targetNote: "Small restaurants, bakeries, and coffee shops -- website accessibility, not physical premises.",
      knownCases: [],
      notes: "Newport Beach, CA firm; one of the five highest-volume website-accessibility filers nationally in EcomBack's 2024 tracker.",
      sources: [
        { label: "EcomBack 2024 Annual Report", url: "https://www.ecomback.com/annual-2024-ada-website-accessibility-lawsuit-report" },
        { label: "TestParty synthesis", url: "https://testparty.ai/blog/the-california-ada-shakedown-across-three-law-firms-and-their-serial-plaintiffs" },
      ],
    },
    {
      slug: "equal-access-law-group",
      name: "Equal Access Law Group, PLLC",
      type: "firm",
      counsel: null,
      jurisdictions: ["Illinois"],
      filingVolume: {
        text: "641 suits in 2025 (16.2% of that year's national website-suit total)",
        detail: "Became the #1 filer nationally in 2025, driving Illinois's emergence as a new hotspot after New York tightened procedural rules",
        source: "Level Access / industry litigation-trend synthesis",
        sourceUrl: "https://www.levelaccess.com/blog/2024-u-s-web-accessibility-litigation-key-trends-and-strategies-for-mitigating-risk/",
        confidence: "Medium-High",
      },
      targetPropertyTypes: ["retail", "restaurant"],
      targetNote: "Website accessibility suits against retail and restaurant chains, concentrated in the Northern District of Illinois.",
      knownCases: [],
      notes: "The clearest example of the venue-shifting pattern this research surfaced: New York's 2024 procedural reform reportedly cut SDNY/EDNY filings sharply, and volume migrated toward Illinois and New Jersey. Businesses that assumed website-accessibility exposure was a New York/California problem should treat Illinois as a live, growing venue.",
      sources: [
        { label: "Level Access litigation trends", url: "https://www.levelaccess.com/blog/2024-u-s-web-accessibility-litigation-key-trends-and-strategies-for-mitigating-risk/" },
      ],
    },
    {
      slug: "stein-saks-plic",
      name: "Stein Saks PLLC",
      type: "firm",
      counsel: null,
      jurisdictions: ["New York"],
      filingVolume: {
        text: "428 website suits in 2024 (13.4% of that year's national total)",
        detail: "Second-highest-volume firm in EcomBack's disclosed 2024 breakdown",
        source: "EcomBack 2024 Annual Report",
        sourceUrl: "https://www.ecomback.com/annual-2024-ada-website-accessibility-lawsuit-report",
        confidence: "High",
      },
      targetPropertyTypes: ["retail", "restaurant"],
      targetNote: "Website accessibility suits; apparel/fashion (35% of 2024's suits nationally) and restaurants (24%) are the most-targeted industries.",
      knownCases: [],
      notes: "One flagged discrepancy worth recording: a separate uncorroborated source claimed Stein Saks filed ~1,500 suits in 2024, more than triple EcomBack's disclosed, methodology-transparent figure. That higher number is not used here -- see this directory's disclaimer on sourcing discipline.",
      sources: [
        { label: "EcomBack 2024 Annual Report", url: "https://www.ecomback.com/annual-2024-ada-website-accessibility-lawsuit-report" },
      ],
    },
  ],
};
