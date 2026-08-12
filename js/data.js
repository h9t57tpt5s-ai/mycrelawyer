/* =========================================================
   CREdocket — Litigation dataset
   -----------------------------------------------------------
   Real, sourced matters pulled in by the "re-legal-news-digest"
   scheduled research task. Each entry carries a sourceUrl citation
   to the original reporting, plus an original long-form write-up
   (body) synthesized from the entry's own summary/significance —
   not reproduced from the source article.
   ========================================================= */

const RELAW_DATA = {
  categories: [
    { id: "landlord-tenant", label: "Landlord–Tenant", color: "var(--cat-landlord)" },
    { id: "zoning-land-use", label: "Zoning & Land Use", color: "var(--cat-zoning)" },
    { id: "reit-securities", label: "REIT & Securities", color: "var(--cat-reit)" },
    { id: "construction-defect", label: "Construction Defect", color: "var(--cat-construction)" },
    { id: "lending-foreclosure", label: "Lending & Foreclosure", color: "var(--cat-lending)" },
    { id: "environmental", label: "Environmental", color: "var(--cat-environmental)" },
    { id: "eminent-domain", label: "Eminent Domain", color: "var(--cat-eminent)" },
    { id: "lease-disputes", label: "Commercial Lease Disputes", color: "var(--cat-lease)" }
  ],

  statuses: [
    { id: "filed", label: "Filed", color: "var(--status-filed)" },
    { id: "pending", label: "Pending", color: "var(--status-pending)" },
    { id: "ruling", label: "Ruling Issued", color: "var(--status-ruling)" },
    { id: "settled", label: "Settled", color: "var(--status-settled)" },
    { id: "appeal", label: "On Appeal", color: "var(--status-appeal)" }
  ],

  /* USPS code -> full state name, used by the jurisdiction map and filters */
  states: {
    AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
    CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
    HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
    KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
    MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
    MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
    NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
    OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
    SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
    VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
    DC: "District of Columbia"
  },

  cases: [
    {
      id: "live-001",
      title: "Liu v. Willow Bridge Property Co. (RealPage Algorithmic Pricing Suits)",
      category: "landlord-tenant",
      status: "filed",
      date: "2026-07-06",
      jurisdiction: "Philadelphia County Court of Common Pleas",
      state: "PA",
      amount: "Putative class action; three related suits filed",
      source: "live",
      sourceUrl: "https://www.inquirer.com/real-estate/housing/willow-bridge-realpage-lawsuit-philadelphia-rent-prices-20260728.html",
      summary: "The first court tests of Philadelphia's algorithmic rent-fixing ban: tenant Yiyao Liu sued Willow Bridge Property Company and RealPage on July 6, alleging Willow Bridge used RealPage's revenue-management software to set rents at Vue 32 and Rittenhouse Row using non-public competitor pricing data. Two related suits filed the week before target Bozzuto Management (with RealPage and Yardi) and Greystar Management Services (with RealPage and Yardi) over similar conduct.",
      significance: "Liability theory attaches to the pricing-software platform itself, not just individual assets or landlords, exposing any multifamily owner or manager that licenses algorithmic revenue-management tools. Philadelphia's 2024 ordinance is among a growing wave of local and state algorithmic-pricing bans (New Jersey enacted one the same month), so owners operating across jurisdictions should audit vendor contracts and data-sharing practices now rather than wait for a ruling.",
      body: [
        "Three related suits filed within a week of each other mark the first courtroom tests of Philadelphia's 2024 algorithmic rent-fixing ordinance. Tenant Yiyao Liu's July 6 complaint against Willow Bridge Property Company and RealPage centers on two properties, Vue 32 and Rittenhouse Row, alleging Willow Bridge used RealPage's revenue-management software to price units off non-public competitor data rather than independent judgment.",
        "The two companion suits, filed the week before against Bozzuto Management (paired with RealPage and Yardi) and Greystar Management Services (also paired with RealPage and Yardi), allege the same basic mechanism at different properties — suggesting plaintiffs' counsel is building a portfolio of parallel cases rather than betting on a single test case.",
        "Because the claims target the pricing software itself rather than any single landlord's conduct, the exposure runs to every owner or manager that licenses an algorithmic revenue-management tool in a jurisdiction with a pricing ban on the books — and that list is growing; New Jersey adopted its own ordinance the same month Philadelphia's suits were filed."
      ],
      timeline: [
        { when: "Late June 2026 (the week before)", label: "Companion suits filed against Bozzuto Management and Greystar Management Services over similar conduct" },
        { when: "July 6, 2026", label: "Yiyao Liu files suit against Willow Bridge Property Co. and RealPage",  current: true }
      ],
      tags: ["algorithmic pricing", "RealPage", "rent-fixing ban", "multifamily", "antitrust-adjacent"]
    },
    {
      id: "live-002",
      title: "Township of Jackson v. Getzel Bee, LLC",
      category: "eminent-domain",
      status: "ruling",
      date: "2026-07-21",
      jurisdiction: "Supreme Court of New Jersey",
      state: "NJ",
      amount: "N/A — condemnation ordinances voided",
      source: "live",
      sourceUrl: "https://www.njcourts.gov/system/files/court-opinions/2026/a_3_25.pdf",
      summary: "In a unanimous ruling, the New Jersey Supreme Court held that Jackson Township could not condemn two privately owned parcels solely to trade them to a developer in exchange for a separate tract the township wanted to preserve as open space. The Court found the condemned parcels were never intended for public use themselves and that the township's shifting disclosures to the affected owners failed the good-faith standard required in condemnation proceedings.",
      significance: "A 'Kelo'-adjacent limit on land-swap assemblages: municipalities and the developers who rely on them to unlock sites can no longer use condemnation as a private trading mechanism, even when the stated end goal is a public benefit like open-space preservation. REITs and developers with entitlement strategies premised on municipal land swaps should revisit those deal structures.",
      body: [
        "The New Jersey Supreme Court's unanimous opinion in Township of Jackson v. Getzel Bee draws a bright line around a maneuver some municipalities have used to unlock preferred parcels: condemning land not for the taking itself, but to trade it away for a different tract the town actually wants.",
        "Jackson Township condemned two privately held parcels with the intent of swapping them to a developer in exchange for a separate tract slated for open-space preservation. The Court found the condemned parcels were never destined for public use in their own right, and that the township's disclosures to the affected owners shifted over the course of the proceeding in a way that failed condemnation law's good-faith requirement.",
        "The ruling is being read as a 'Kelo'-adjacent guardrail: public-benefit framing alone won't save a condemnation used as a private trading chip. Developers and REITs whose entitlement strategy in New Jersey — or jurisdictions likely to follow this reasoning — depends on a municipal land swap should revisit those structures before relying on them further."
      ],
      timeline: [
        { when: "July 21, 2026", label: "NJ Supreme Court rules unanimously that the condemnation was not for public use and voids it",  current: true }
      ],
      documentUrl: "https://www.njcourts.gov/system/files/court-opinions/2026/a_3_25.pdf",
      documentLabel: "Read the official opinion",
      tags: ["eminent domain", "land swap", "condemnation", "public use doctrine"]
    },
    {
      id: "live-003",
      title: "Wilmington Savings Fund Society, FSB v. Milton 90 Pleasant Valley Street LLC (Benchmark 2026-B43 CMBS Foreclosure)",
      category: "lending-foreclosure",
      status: "filed",
      date: "2026-07-28",
      jurisdiction: "U.S. District Court, Southern District of New York",
      state: "NY",
      amount: "$34.4M loan balance",
      source: "live",
      sourceUrl: "https://www.mpamag.com/us/news/general/trustee-seeks-to-foreclose-344m-cmbs-loan-after-alleged-first-payment-default/584231",
      summary: "The CMBS trustee for Benchmark 2026-B43 sued to foreclose a $34.4M loan secured by a Methuen, MA parcel and a Michigan shopping center after the borrowers missed their very first payment and two guarantors filed Chapter 11. The complaint alleges the borrowers let their own affiliated tenants under 99-year leases stop paying rent rather than enforce those leases — conduct the trustee calls 'affiliate atrophy' — and seeks mortgage foreclosure, UCC foreclosure on personal property, and appointment of a receiver to collect rents and step into the affiliate leases and bankruptcies.",
      significance: "Signals that special servicers are willing to argue a borrower's failure to enforce intercompany leases against its own affiliates is itself a form of loan mismanagement, looking past special-purpose-entity structures to related-party cash flows. Sponsors relying on affiliated master-lease structures, and guarantors whose personal bankruptcy filings can independently trigger cross-default, should take note as CMBS distress enforcement accelerates.",
      body: [
        "The CMBS trustee for Benchmark 2026-B43 moved to foreclose a $34.4M loan against a Methuen, Massachusetts parcel and a Michigan shopping center after the borrowers missed their first debt-service payment outright and two loan guarantors separately filed for Chapter 11 protection.",
        "The complaint's more novel theory is what the trustee calls 'affiliate atrophy': rather than simply defaulting, the borrowers allegedly let their own affiliated tenants — occupying the properties under 99-year leases — stop paying rent, instead of enforcing those leases against entities under common control. The trustee is seeking mortgage foreclosure, a parallel UCC foreclosure on personal property, and appointment of a receiver empowered to both collect rents and step into the affiliate leases and bankruptcy proceedings directly.",
        "The theory is notable because it treats a borrower's failure to enforce its own intercompany leases as a form of loan mismanagement in itself, reaching through special-purpose-entity structures to the related-party cash flows behind them. Sponsors that rely on affiliated master-lease arrangements — and guarantors whose personal bankruptcy filings can trip cross-default clauses independent of the property's own performance — are a natural audience for this ruling as CMBS special servicers get more aggressive."
      ],
      timeline: [
        { when: "July 28, 2026", label: "CMBS trustee sues to foreclose after first-payment default and guarantor Chapter 11 filings",  current: true }
      ],
      tags: ["CMBS", "foreclosure", "first-payment default", "receivership", "guarantor bankruptcy"]
    },
    {
      id: "live-004",
      title: "FitFactariDC LLC v. CoStar Group, Inc. (CRE Lease-Data Hub-and-Spoke Antitrust Suit)",
      category: "lease-disputes",
      status: "filed",
      date: "2026-06-12",
      jurisdiction: "U.S. District Court, Northern District of Illinois",
      state: "IL",
      amount: "Putative nationwide class; 2015–2025 class period",
      source: "live",
      sourceUrl: "https://therealdeal.com/national/2026/06/17/costar-hit-with-lawsuit-alleging-price-fixing-for-cre-rents/",
      summary: "Commercial tenant FitFactariDC LLC filed a proposed class action alleging CoStar Group's lease-comparables platform served as the 'hub' of a Sherman Act price-fixing conspiracy, with CBRE, JLL, Cushman & Wakefield, Colliers, and Newmark as 'spokes' that traded non-public effective rents, concessions, and lease terms through the platform. The complaint claims each 1-point rise in CoStar's market share tracked a 0.3%-0.8% increase in rent per square foot across office, industrial, and retail leases from 2015-2025. An initial status hearing is set for August 19, 2026.",
      significance: "Extends the RealPage-style hub-and-spoke theory from multifamily algorithmic pricing into commercial brokerage data-sharing, naming the industry's largest brokerages as defendants. If the theory survives a motion to dismiss, follow-on suits could sweep in landlords and owners whose brokers submitted lease data to CoStar, mirroring how RealPage litigation expanded to landlord-customers.",
      body: [
        "FitFactariDC LLC's proposed nationwide class action accuses CoStar Group of operating the 'hub' of a Sherman Act price-fixing conspiracy, with five of the industry's largest brokerages — CBRE, JLL, Cushman & Wakefield, Colliers, and Newmark — cast as the 'spokes' allegedly trading non-public effective rents, concessions, and lease terms through CoStar's lease-comparables platform.",
        "The complaint's central statistical claim is specific: it alleges that every one-point increase in CoStar's market share tracked a 0.3%–0.8% rise in rent per square foot across office, industrial, and retail leases over the 2015–2025 class period. An initial status hearing is scheduled for August 19, 2026, which will be an early signal of how the court views the theory at the pleadings stage.",
        "The case is explicitly modeled on the hub-and-spoke framework that reshaped multifamily algorithmic-pricing litigation against RealPage, just applied to commercial lease data instead of residential rents. If it survives a motion to dismiss, the RealPage litigation's own trajectory — where suits expanded from the software vendor to landlord-customers — suggests owners whose brokers submitted lease data to CoStar could become a second wave of defendants."
      ],
      timeline: [
        { when: "June 12, 2026", label: "FitFactariDC LLC files proposed class action against CoStar and five major brokerages",  current: true },
        { when: "August 19, 2026", label: "Initial status hearing scheduled",  upcoming: true }
      ],
      tags: ["antitrust", "hub-and-spoke", "CoStar", "lease data", "brokerage"]
    },
    {
      id: "live-005",
      title: "SEC v. RAD Diversified REIT, Inc.",
      category: "reit-securities",
      status: "filed",
      date: "2026-07-29",
      jurisdiction: "U.S. District Court, Middle District of Florida",
      state: "FL",
      amount: "$152M alleged fraud",
      source: "live",
      sourceUrl: "https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26596",
      summary: "The SEC sued Tampa-based non-traded REIT RAD Diversified REIT, its co-founders Brandon 'Dutch' Mendenhall and Amy Vaughn, and related entity The Seminar Solution, LLC, alleging they raised $152M from 5,500+ retail investors through an unregistered, fraudulent offering between 2019 and 2024, then diverted roughly $54M to an affiliated entity for personal expenses while misrepresenting the REIT's profitability and liquidity.",
      significance: "Highlights intensified SEC scrutiny of non-traded REIT sponsors over related-party fund flows, valuation representations, and continued capital-raising after internal signs of distress (a declined credit line, mounting foreclosures, frozen redemptions). Sponsors, boards, and institutional counterparties of retail-facing REITs should revisit related-party transaction controls and disclosure practices in light of this enforcement theory.",
      body: [
        "The SEC's complaint against Tampa-based non-traded REIT RAD Diversified REIT, its co-founders Brandon 'Dutch' Mendenhall and Amy Vaughn, and affiliated entity The Seminar Solution, LLC alleges a five-year, $152M offering that was never registered and was fraudulent from the start — raised from more than 5,500 retail investors between 2019 and 2024.",
        "Roughly $54M of that capital was allegedly diverted to an affiliated entity to cover personal expenses, even as the REIT continued marketing itself to investors using representations about profitability and liquidity the SEC says didn't match its actual financial condition.",
        "The enforcement theory leans heavily on related-party fund flows and continued capital-raising after internal warning signs — a declined credit line, a rising rate of foreclosures in the portfolio, and frozen investor redemptions are all cited. Sponsors and boards of retail-facing, non-traded REITs should treat this as a preview of what the SEC is looking for when it examines related-party transaction controls and disclosure practices."
      ],
      timeline: [
        { when: "July 29, 2026", label: "SEC sues RAD Diversified REIT, its co-founders, and an affiliated entity",  current: true }
      ],
      documentUrl: "https://www.sec.gov/enforcement-litigation/litigation-releases/lr-26596",
      documentLabel: "Read the SEC litigation release",
      tags: ["REIT", "SEC enforcement", "securities fraud", "non-traded REIT", "related-party transactions"]
    },
    {
      id: "live-006",
      title: "In re Silver Star Properties REIT (Second Chapter 11 Filing)",
      category: "lending-foreclosure",
      status: "filed",
      date: "2026-05-28",
      jurisdiction: "U.S. Bankruptcy Court, Northern District of Texas",
      state: "TX",
      amount: "$100M assets vs. $75M liabilities; $65M+ in defaulted loans",
      source: "live",
      sourceUrl: "https://www.bisnow.com/national/news/commercial-real-estate/silver-star-properties-files-for-chapter-11-134932",
      summary: "Houston-based non-traded REIT Silver Star Properties filed its second Chapter 11 petition in four years on May 28, following a failed pivot from office assets to self-storage. Four guaranteed loan agreements totaling over $65M are in default, and a separate $5.75M promissory note on a self-storage property moved to foreclosure on June 2. The filing follows an SEC inquiry and a settled internal fraud/fiduciary-duty suit against the REIT's ousted founder, Allen Hartman, tied to an earlier $259M Goldman Sachs CMBS loan default.",
      significance: "Illustrates how leadership litigation and governance disputes within a REIT can compound loan-covenant distress and precipitate repeat bankruptcy filings. Lenders and boards evaluating distressed CRE borrowers are increasingly treating unresolved founder/fiduciary-duty litigation as an independent credit risk factor, separate from asset-level performance, amid the broader wave of CRE loan maturities.",
      body: [
        "Silver Star Properties REIT's second Chapter 11 filing in four years caps a strategic pivot that didn't work: the Houston-based non-traded REIT tried to reposition from office assets into self-storage, and the shift left it with four guaranteed loan agreements — over $65M combined — in default, plus a separate $5.75M promissory note on a self-storage property that moved to foreclosure on June 2.",
        "The filing doesn't stand alone. It follows an SEC inquiry and a since-settled internal fraud and fiduciary-duty suit against the REIT's ousted founder, Allen Hartman, connected to an earlier $259M Goldman Sachs CMBS loan default — meaning governance litigation and loan-covenant distress have been compounding each other for years rather than surfacing as isolated problems.",
        "For lenders and boards evaluating distressed CRE borrowers, the pattern here — leadership litigation feeding into repeat bankruptcy filings — is becoming its own credit-risk signal, tracked separately from how the underlying assets are actually performing, as the broader wave of CRE loan maturities continues to surface distress."
      ],
      timeline: [
        { when: "Prior to filing", label: "SEC inquiry and a since-settled internal fraud/fiduciary-duty suit against ousted founder Allen Hartman, tied to an earlier $259M Goldman Sachs CMBS default" },
        { when: "May 28, 2026", label: "Silver Star Properties REIT files its second Chapter 11 petition in four years",  current: true },
        { when: "June 2, 2026", label: "Separate $5.75M promissory note on a self-storage property moves to foreclosure" }
      ],
      tags: ["REIT bankruptcy", "loan default", "foreclosure", "fiduciary duty", "self-storage"]
    },
    {
      id: "live-007",
      title: "Via Mizner Lender 1 LLC v. Via Mizner Owner III, LLC (Mandarin Oriental Residences, Boca Raton Foreclosure)",
      category: "lending-foreclosure",
      status: "filed",
      date: "2026-07-17",
      jurisdiction: "Fifteenth Judicial Circuit Court, Palm Beach County, Florida",
      state: "FL",
      amount: "$417.7M foreclosure claim",
      source: "live",
      sourceUrl: "https://thecoastalstar.com/profiles/blogs/boca-raton-legal-battles-rise-over-unfinished-mandarin-oriental",
      summary: "A lender group led by Via Mizner Lender 1 LLC, tied to Apollo Global Management, sued to foreclose on the long-delayed Mandarin Oriental Residences condo tower after Penn-Florida affiliate Via Mizner Owner III stopped paying interest in June 2024, missed the loan's September 2025 maturity, and missed a February 2025 completion deadline. The complaint seeks to subordinate a $24.1M mechanics'-lien claim from construction manager Strategic Group Builders and the claims of unit buyers, while a related Chapter 11 case over the adjoining hotel component heads to an August 14 bankruptcy auction.",
      significance: "A live illustration of capital-stack priority in a distressed vertical construction project: a senior mortgage foreclosure seeking to leapfrog both a perfected mechanics' lien and buyer deposit claims, running in parallel with a separate bankruptcy sale of an affiliated asset. CRE lenders, contractors, and preconstruction condo buyers should watch how the court treats escrowed versus disbursed deposits and lien-priority arguments, as the outcome will bear on workout and lien-perfection strategy for other stalled vertical projects.",
      body: [
        "A lender group led by Via Mizner Lender 1 LLC and tied to Apollo Global Management sued to foreclose on the long-delayed Mandarin Oriental Residences condo tower in Boca Raton after Penn-Florida affiliate Via Mizner Owner III stopped paying interest in June 2024, then missed both a February 2025 completion deadline and the loan's September 2025 maturity.",
        "The foreclosure complaint seeks to subordinate a $24.1M mechanics'-lien claim from construction manager Strategic Group Builders, along with the claims of unit buyers awaiting delivery — while a related Chapter 11 case covering the project's adjoining hotel component is separately headed to an August 14 bankruptcy auction.",
        "The case is a live test of capital-stack priority on a stalled vertical construction project: a senior mortgage foreclosure trying to leapfrog both a perfected mechanics' lien and buyer deposit claims, running in parallel with a bankruptcy sale of an affiliated asset. How the court treats escrowed versus already-disbursed buyer deposits, and how it resolves the lien-priority fight, will be closely watched by lenders, contractors, and preconstruction condo buyers on other stalled towers."
      ],
      timeline: [
        { when: "June 2024", label: "Borrower Via Mizner Owner III stops paying interest on the loan" },
        { when: "February 2025", label: "Project misses its scheduled completion deadline" },
        { when: "September 2025", label: "Loan reaches maturity and is missed" },
        { when: "July 17, 2026", label: "Lender group sues to foreclose, seeking to subordinate mechanics'-lien and buyer claims",  current: true },
        { when: "August 14, 2026", label: "Related Chapter 11 case over the adjoining hotel component heads to bankruptcy auction",  upcoming: true }
      ],
      tags: ["foreclosure", "mechanics lien", "condo deposits", "construction lending", "chapter 11"]
    },
    {
      id: "live-008",
      title: "CommunityAmerica Federal Credit Union v. Metropoint 300/400 Owners (St. Louis Park Office Foreclosure)",
      category: "lending-foreclosure",
      status: "filed",
      date: "2026-07-23",
      jurisdiction: "Hennepin County District Court, Minnesota",
      state: "MN",
      amount: "$46M combined loan balance (two foreclosure suits)",
      source: "live",
      sourceUrl: "https://www.connectcre.com/stories/return-to-lender-week-of-july-23-2026/",
      summary: "CommunityAmerica Federal Credit Union filed two foreclosure lawsuits in Hennepin County District Court against the owners of the Metropoint 300 and Metropoint 400 office buildings in St. Louis Park, Minnesota, seeking to recover roughly $46M after the 918,000-square-foot campus lost anchor tenant Wells Fargo, which had occupied more than half the complex. Both buildings are now scheduled for a foreclosure auction in September 2026.",
      significance: "One of several office foreclosure actions filed nationally this summer (alongside a $417.7M foreclosure on Boca Raton's Mandarin Oriental Residences and a court-ordered receivership over San Francisco's Central Tower) signaling lenders are moving from forbearance to litigation more quickly as anchor-tenant departures and depressed appraisals erode office collateral value. Owners with looming lease rollovers near loan maturity should treat these filings as an early-warning benchmark for lender posture.",
      body: [
        "CommunityAmerica Federal Credit Union filed two separate foreclosure suits in Hennepin County District Court against the ownership of Metropoint 300 and Metropoint 400, a combined 918,000-square-foot office campus in St. Louis Park, Minnesota, seeking to recover roughly $46M across the two loans.",
        "The filings follow the departure of Wells Fargo, which had occupied more than half the campus as its anchor tenant. With that space vacated, the properties' income and appraised value fell enough to push the loans into default, and both buildings are now scheduled for a foreclosure auction in September 2026.",
        "The case lands alongside a wave of other office foreclosure actions filed nationally this summer, including a $417.7M foreclosure on Boca Raton's Mandarin Oriental Residences and a court-ordered receivership over San Francisco's Central Tower — a pattern suggesting lenders are moving from forbearance to litigation more quickly as anchor-tenant departures and depressed appraisals continue to erode office collateral value. Owners with lease rollovers approaching loan maturity should read these filings as an early signal of where lender patience is running out."
      ],
      timeline: [
        { when: "July 23, 2026", label: "CommunityAmerica Federal Credit Union files two foreclosure suits after anchor tenant Wells Fargo departs",  current: true },
        { when: "September 2026", label: "Both buildings scheduled for foreclosure auction",  upcoming: true }
      ],
      tags: ["foreclosure", "office", "anchor tenant", "credit union", "minnesota"]
    },
    {
      id: "live-009",
      title: "SCLS Realty, LLC v. Town of Johnston (Eminent Domain Contempt Proceedings)",
      category: "eminent-domain",
      status: "pending",
      date: "2026-08-04",
      jurisdiction: "U.S. District Court, District of Rhode Island",
      judge: "Melissa R. DuBose",
      state: "RI",
      amount: "31-acre parcel; town's own appraisal valued land at $775K",
      source: "live",
      sourceUrl: "https://rhodeislandcurrent.com/2026/08/04/federal-judge-schedules-contempt-hearing-in-johnston-eminent-domain-dispute/",
      summary: "Days after U.S. District Judge Melissa R. DuBose ruled on July 28 that Johnston, RI's attempted condemnation of a 31-acre parcel slated for a 252-unit affordable housing project was 'void ab initio' for failing constitutional takings and due-process requirements, the landowners moved for contempt after the town passed resolutions on July 31 seeking to expand its condemnation authority and stand up a new public building authority over the same site. DuBose scheduled a show-cause hearing for the town to explain why it should not be held in contempt of the standing injunction.",
      significance: "Shows that a favorable eminent domain ruling against a pretextual taking does not end the exposure for a municipality — or the risk for a developer — since enforcement can require a second round of litigation to stop renewed attempts through different legal vehicles (ballot measures, new municipal authorities). Developers facing local political opposition to a project should preserve contemporaneous evidence of pretext and treat post-ruling council action as a compliance issue to monitor, not a closed matter.",
      timeline: [
        { when: "March 2025", label: "Town of Johnston condemns the 31-acre parcel" },
        { when: "July 28, 2026", label: "Judge DuBose rules the condemnation “void ab initio”" },
        { when: "July 31, 2026", label: "Town Council passes resolutions to expand condemnation authority and create a new public building authority" },
        { when: "August 4, 2026", label: "Landowners move for contempt; show-cause hearing ordered",  current: true }
      ],
      tags: ["eminent domain", "contempt", "affordable housing", "takings", "municipal liability"],
      body: [
        "The Town of Johnston's second attempt to reach a 31-acre parcel on George Waterman Road has put local officials in front of a federal judge to explain why they shouldn't be held in contempt — just days after that same judge voided the town's first attempt to condemn the land.",
        "U.S. District Judge Melissa R. DuBose ruled on July 28, 2026 that Johnston's March 2025 condemnation of the site, owned by homebuilding companies tied to the Santoro family and Salvatore Compagnone, was 'void ab initio,' finding the town relied on a charter provision that could not support a taking without pledging just compensation or establishing enforcement procedures required under the Fifth and Fourteenth Amendments. The ruling came after the town's mayor publicly vowed to 'fight back' against the family's plans for a 252-unit income-restricted apartment complex using 'all the power of government available.'",
        "Three days after that ruling, Johnston's Town Council passed resolutions placing a November ballot measure to expand its condemnation authority and creating a new Municipal Public Building Authority over town property — moves the landowners argue violate the standing preliminary injunction. DuBose has ordered the town to produce records from that meeting and scheduled a show-cause hearing on contempt, underscoring that a merits win against a pretextual taking can require an enforcement fight of its own."
      ]
    },
    {
      id: "live-010",
      title: "111 West 57th Investment LLC v. 111 W57 Mezz Investor LLC (Steinway Tower \"Sole Discretion\" Ruling)",
      category: "lending-foreclosure",
      status: "ruling",
      date: "2026-05-28",
      jurisdiction: "New York Court of Appeals",
      state: "NY",
      amount: "$65M equity investment; $25M junior mezzanine loan; ~$600M underlying equity value alleged",
      source: "live",
      sourceUrl: "https://www.nycourts.gov/reporter/current/3dseries/2026/2026_03376.shtml",
      summary: "New York's highest court reinstated AmBase investment vehicle 111 West 57th Investment LLC's implied-covenant-of-good-faith claim against Apollo-affiliated mezzanine lenders over the 2017 sale of a $25M junior mezzanine loan (secured by the plaintiff's equity in the Steinway Tower project) to Spruce Capital Partners at par value, despite internal models showing roughly $600M in underlying equity value. Spruce initiated a UCC Article 9 strict foreclosure two days after acquiring the loan, wiping out the plaintiff's equity; the Court held Apollo's contractual 'sole discretion' to assign the loan does not exculpate it from good-faith-and-fair-dealing claims and remitted the case to Supreme Court, New York County, while affirming dismissal of related tortious interference claims.",
      significance: "Resolves a split among Appellate Division departments in the lender's favor of accountability, aligning New York with Delaware law: broad 'sole discretion' clauses in loan and pledge agreements no longer categorically foreclose implied-covenant claims when a counterparty alleges the discretion was exercised as part of a bad-faith scheme to strip a joint-venture partner's equity. Mezzanine lenders, sponsors, and equity investors in New York-governed capital stacks should expect a lower pleading bar for bad-faith challenges to loan assignments and strict foreclosures going forward, even where assignment rights are drafted as unqualified.",
      body: [
        "New York's highest court reinstated an implied-covenant-of-good-faith claim brought by 111 West 57th Investment LLC against Apollo-affiliated mezzanine lenders, centered on the 2017 sale of a $25M junior mezzanine loan secured by the plaintiff's equity in the Steinway Tower project. The loan was sold to Spruce Capital Partners at par value even though internal models reportedly showed roughly $600M in underlying equity value, and Spruce initiated a UCC Article 9 strict foreclosure just two days after acquiring the loan, wiping out the plaintiff's equity position entirely.",
        "The Court of Appeals held that Apollo's contractual right to assign the loan at its 'sole discretion' does not, on its own, exculpate the lender from good-faith-and-fair-dealing claims when the discretion is alleged to have been exercised as part of a scheme to strip a joint-venture partner's equity. The ruling remits the case to Supreme Court, New York County for further proceedings, while affirming dismissal of the plaintiff's related tortious interference claims.",
        "The decision resolves a split among the Appellate Division's departments and brings New York in line with Delaware law on this question. Mezzanine lenders, sponsors, and equity investors operating under New York-governed capital stacks should expect a lower pleading bar going forward for bad-faith challenges to loan assignments and strict foreclosures, even in deals where assignment rights were drafted as facially unqualified."
      ],
      timeline: [
        { when: "2017", label: "Mezzanine loan sold to Spruce Capital Partners at par value despite ~$600M in alleged underlying equity" },
        { when: "2017 (two days later)", label: "Spruce initiates UCC Article 9 strict foreclosure, wiping out plaintiff's equity" },
        { when: "May 28, 2026", label: "NY Court of Appeals reinstates the good-faith claim and remits the case to Supreme Court",  current: true }
      ],
      documentUrl: "https://www.nycourts.gov/reporter/current/3dseries/2026/2026_03376.shtml",
      documentLabel: "Read the official opinion",
      tags: ["mezzanine debt", "implied covenant", "UCC foreclosure", "sole discretion", "capital stack"]
    },
    {
      id: "live-011",
      title: "Kenilworth Holdings v. New York City Rent Guidelines Board (Rent Freeze Article 78 Challenge)",
      category: "landlord-tenant",
      status: "filed",
      date: "2026-07-22",
      jurisdiction: "Supreme Court of the State of New York",
      state: "NY",
      amount: "~1M rent-stabilized units affected citywide",
      source: "live",
      sourceUrl: "https://commercialobserver.com/2026/07/nyc-landlords-sue-rent-guidelines-board-rent-freeze/",
      summary: "A group of five landlord entities, led by Kenilworth Holdings and represented by Dechert's Randy Mastro and Rosenberg & Estis, filed an Article 78 petition against the NYC Rent Guidelines Board over its unprecedented June 25 vote to freeze rents on both one- and two-year rent-stabilized lease renewals starting October 1, 2026. The petition alleges Mayor Zohran Mamdani improperly influenced the board's composition and process, and a court hearing on expedited discovery is set for September 2.",
      significance: "The first legal challenge to the Mamdani administration by the real estate industry, and a test of how far a mayor can shape an ostensibly independent rate-setting board before a court finds the process itself unlawful. A related $506M CMBS loan on a 53-building rent-stabilized portfolio is already projected to lose bondholders $80M+, illustrating the direct financial exposure a freeze — or prolonged uncertainty over one — creates for owners and lenders of regulated multifamily assets.",
      body: [
        "A group of five landlord entities led by Kenilworth Holdings, represented by Dechert's Randy Mastro and by Rosenberg & Estis, filed an Article 78 petition challenging the New York City Rent Guidelines Board's June 25 vote to freeze rents on both one- and two-year rent-stabilized lease renewals beginning October 1, 2026 — a freeze the petition describes as unprecedented in scope.",
        "The petition's central allegation is procedural rather than purely substantive: that Mayor Zohran Mamdani improperly influenced the board's composition and deliberative process, undermining its intended independence as a rate-setting body. A court hearing on the landlords' request for expedited discovery is scheduled for September 2, 2026.",
        "The case is being watched as the first legal challenge brought against the Mamdani administration by the real estate industry, and as a test of how far a mayor can shape an ostensibly independent board before a court finds the process itself unlawful. The financial stakes extend beyond the petitioners: a separate $506M CMBS loan tied to a 53-building rent-stabilized portfolio is already projected to cost bondholders more than $80M, illustrating how directly a citywide freeze — or even prolonged uncertainty about one — can flow through to owners and lenders of regulated multifamily assets."
      ],
      timeline: [
        { when: "June 25, 2026", label: "NYC Rent Guidelines Board votes to freeze rent-stabilized renewals" },
        { when: "July 22, 2026", label: "Landlord group files Article 78 petition challenging the vote",  current: true },
        { when: "September 2, 2026", label: "Court hearing on expedited discovery scheduled",  upcoming: true },
        { when: "October 1, 2026", label: "Rent freeze set to take effect if not blocked",  upcoming: true }
      ],
      tags: ["rent freeze", "article 78", "rent guidelines board", "landlord-tenant", "multifamily"]
    },
    {
      id: "live-012",
      title: "Voskerician v. City of Menlo Park (SB 9 Park Fee Takings Challenge)",
      category: "zoning-land-use",
      status: "filed",
      date: "2026-07-17",
      jurisdiction: "San Mateo County Superior Court, California",
      state: "CA",
      amount: "$127,400 impact fee challenged",
      source: "live",
      sourceUrl: "https://pacificlegal.org/case/voskerician-menlo-park-exaction-impact-fee/",
      summary: "Developer Mircea Voskerician, represented pro bono by the Pacific Legal Foundation, sued Menlo Park after the city conditioned ministerial approval of a two-lot SB 9 subdivision on a $127,400 'recreation in-lieu' fee, which he paid under protest in January 2026 to preserve his right to sue. The complaint alleges the fee fails the rough-proportionality test the U.S. Supreme Court applied to legislatively adopted fee schedules in Sheetz v. County of El Dorado (2024), and separately violates a state law barring 'offsite improvement' exactions on ministerial SB 9 approvals.",
      significance: "Tests how far Sheetz's extension of Nollan/Dolan scrutiny to legislatively set fee schedules reaches in practice, a question with direct application to commercial impact fees, traffic mitigation charges, and affordable-housing in-lieu payments that municipalities calculate by formula rather than project-specific study. Developers and REITs paying such fees as a matter of course should watch the ruling for a template on challenging fee schedules that lack documented nexus and proportionality findings.",
      body: [
        "Developer Mircea Voskerician, represented pro bono by the Pacific Legal Foundation, sued the City of Menlo Park after it conditioned ministerial approval of his two-lot SB 9 subdivision on a $127,400 'recreation in-lieu' fee. Voskerician paid the fee under protest in January 2026 specifically to preserve his right to challenge it in court rather than delay his project.",
        "The complaint advances two distinct theories: first, that the fee fails the rough-proportionality test the U.S. Supreme Court applied to legislatively adopted fee schedules in Sheetz v. County of El Dorado (2024); and second, that it separately violates a state law barring 'offsite improvement' exactions on approvals that, like SB 9 subdivisions, are ministerial rather than discretionary.",
        "The case tests how far Sheetz's extension of Nollan/Dolan takings scrutiny to legislatively set, formula-based fee schedules actually reaches in practice — a question that bears directly on commercial impact fees, traffic mitigation charges, and affordable-housing in-lieu payments that municipalities typically calculate by formula rather than project-specific study. Developers and REITs that pay such fees as a routine cost of entitlement should watch the ruling for a template on challenging fee schedules that lack documented nexus and proportionality findings."
      ],
      timeline: [
        { when: "January 2026", label: "Developer pays the $127,400 fee under protest to preserve his right to sue" },
        { when: "July 17, 2026", label: "Voskerician sues the City of Menlo Park over the fee",  current: true }
      ],
      documentUrl: "https://pacificlegal.org/wp-content/uploads/2026/07/Voskerician-v.-Menlo-Park_PLF-Complaint_7.17.26.pdf",
      documentLabel: "Read the filed complaint",
      tags: ["takings clause", "impact fees", "exactions", "SB 9", "zoning"]
    },
    {
      id: "live-013",
      title: "Ayer v. Lightstone Value Plus REIT (Undisclosed $59.8M Chairman Conflict in Liquidation-Delay Proxy)",
      category: "reit-securities",
      status: "ruling",
      date: "2026-08-05",
      jurisdiction: "U.S. District Court, District of New Jersey",
      judge: "Michael A. Shipp",
      state: "NJ",
      amount: "$59.8M alleged undisclosed conflict of interest",
      source: "live",
      sourceUrl: "https://altswire.com/lightstone-reit-directors-must-face-suit-over-59-8m-undisclosed-conflict/",
      summary: "U.S. District Judge Michael A. Shipp denied a motion to dismiss a putative class action against Lightstone Value Plus REIT I, II, and III, their external advisers, and individual directors, finding that 2022 proxy statements soliciting approval of charter amendments that eliminated scheduled liquidation deadlines may have concealed chairman David Lichtenstein's conflicting financial stake in the outcome. Plaintiffs allege Lichtenstein held subordinated participation interests worth over $59.8M that would have been worthless had the REITs liquidated on schedule, and that solicitors misleadingly told undecided shareholders a 'yes' vote was the path to liquidity. All four counts, including breach of fiduciary duty claims, survive into discovery.",
      significance: "Signals that courts will scrutinize bundled, omnibus REIT charter-amendment proxies — especially those pairing liquidation-timeline changes with fiduciary-duty waivers, quorum reductions, or indemnification expansions — for whether insiders' financial stakes in the outcome were meaningfully disclosed, not just nominally mentioned. Non-traded REIT sponsors, external advisers, and independent directors involved in comparable extension votes should expect increased plaintiff interest and revisit both proxy drafting practices and D&O coverage.",
      body: [
        "A federal judge in Trenton has cleared the way for investors to pursue claims that three affiliated non-traded REITs concealed their chairman's financial stake in a 2022 vote to eliminate their own liquidation deadlines. U.S. District Judge Michael A. Shipp denied a motion to dismiss the putative class action against Lightstone Value Plus REIT I, II, and III, their external advisers, and individual directors, finding that the proxy materials used to solicit the charter-amendment vote may have omitted a material conflict of interest.",
        "Plaintiffs allege chairman and CEO David Lichtenstein, through affiliated special-purpose entities, held subordinated participation interests in REIT II and REIT III potentially worth more than $59.8M — interests that would have been worthless had the funds liquidated on their original schedules. The proxy disclosed that Lichtenstein held these interests but not that they carried no value absent an extension, a distinction the court found could have significantly changed how a reasonable shareholder understood the vote. The court also credited allegations that phone solicitors told undecided shareholders a 'yes' vote was the path to liquidity, when it in fact eliminated the liquidation deadline.",
        "All four counts of the amended complaint survive, including breach of fiduciary duty claims against both the director defendants and the external advisory entities, sending the case into discovery. For sponsors and boards of externally managed REITs weighing similar extension votes, the ruling raises the bar for what proxy disclosure of insider conflicts must actually convey."
      ],
      timeline: [
        { when: "2022", label: "Lightstone REITs solicit proxy vote to eliminate scheduled liquidation deadlines" },
        { when: "August 5, 2026", label: "Judge Shipp denies motion to dismiss; all four counts proceed to discovery",  current: true }
      ],
      tags: ["REIT", "proxy disclosure", "fiduciary duty", "charter amendment", "securities class action"]
    },
    {
      id: "live-014",
      title: "Keller v. UDR, Inc. (San Diego Algorithmic Rent-Pricing Class Action)",
      category: "landlord-tenant",
      status: "filed",
      date: "2026-07-02",
      jurisdiction: "U.S. District Court, Southern District of California",
      state: "CA",
      amount: "Putative class action; statutory penalties up to $1,000/violation",
      source: "live",
      sourceUrl: "https://www.documentcloud.org/documents/28535107-us-dis-casd-3-26cv3865-d2650861e355-complaint-with-jury-demand-against-udr-inc-filing/",
      summary: "Former tenant Jacob Keller filed a putative class action against UDR, Inc. on July 2, 2026 in the U.S. District Court for the Southern District of California, alleging the NYSE-listed multifamily REIT used a RealPage algorithmic pricing device to set rents and occupancy levels at a San Diego property in violation of San Diego Municipal Code § 98.1103, the city's algorithmic rent-pricing ban effective June 21, 2025. The complaint seeks injunctive relief, damages, statutory penalties of up to $1,000 per violation, attorneys' fees, and a jury trial.",
      significance: "One of the first suits to target a publicly traded REIT directly under a municipal algorithmic-pricing ordinance rather than as one of dozens of defendants in the federal RealPage MDL, and it leans on UDR's prior acknowledged use of RealPage software from the D.C. Attorney General's separate antitrust suit. It signals that owners now face two distinct litigation tracks — federal antitrust exposure and a fast-growing patchwork of city-level statutory bans — with per-unit penalty structures that can scale quickly across large portfolios.",
      body: [
        "Former tenant Jacob Keller filed a putative class action against UDR, Inc. — a Highlands Ranch, Colorado-based, NYSE-listed multifamily REIT — on July 2, 2026 in the U.S. District Court for the Southern District of California. The complaint, Keller v. UDR, Inc., No. 3:26-cv-03865 (S.D. Cal.), alleges UDR used a RealPage algorithmic pricing device to set rents and occupancy levels at a UDR-managed San Diego property, in violation of San Diego Municipal Code § 98.1103, which bars landlords from using software that generates rent or occupancy recommendations from non-public competitor data.",
        "Unlike the antitrust conspiracy theory driving the federal RealPage MDL, San Diego's ordinance requires no proof of coordination among competitors — it simply prohibits use of a covered algorithmic device outright and authorizes a private right of action with per-violation statutory penalties of up to $1,000, in addition to damages, injunctive relief, and attorneys' fees. The complaint notably relies on UDR's own acknowledged use of RealPage software in the District of Columbia Attorney General's separate November 2023 antitrust suit against RealPage and roughly a dozen large landlords.",
        "The case underscores that algorithmic-pricing exposure has split into two tracks: the federal MDL, where RealPage's landlord-customers have paid roughly $360M combined in settlements, and a fast-growing patchwork of municipal bans — now including San Diego, Philadelphia, and New York State — that impose standalone statutory liability regardless of any conspiracy, and that can reach large public REITs as readily as private operators."
      ],
      timeline: [
        { when: "June 21, 2025", label: "San Diego's algorithmic rent-pricing ban takes effect" },
        { when: "July 2, 2026", label: "Jacob Keller files class action against UDR, Inc.",  current: true }
      ],
      documentUrl: "https://www.documentcloud.org/documents/28535107-us-dis-casd-3-26cv3865-d2650861e355-complaint-with-jury-demand-against-udr-inc-filing/",
      documentLabel: "Read the filed complaint",
      tags: ["algorithmic pricing", "RealPage", "REIT", "class action", "san diego"]
    },
    {
      id: "live-015",
      title: "Monarch Communities, LLC v. Township of Montville (Inherently Beneficial Use-Variance Standard Revised)",
      category: "zoning-land-use",
      status: "ruling",
      date: "2026-07-13",
      jurisdiction: "Supreme Court of New Jersey",
      state: "NJ",
      amount: "165-unit senior living facility; ~8-acre site",
      source: "live",
      sourceUrl: "https://www.coleschotz.com/the-new-jersey-supreme-court-modifies-the-long-standing-test-for-inherently-beneficial-use-variances/",
      summary: "In a unanimous ruling, the New Jersey Supreme Court revised the 1992 Sica four-step test for 'inherently beneficial use' variances, holding that applicants must first affirmatively prove a proposed variance will not substantially impair the municipality's zone plan and zoning ordinance before any balancing of public benefit against detriment occurs. The Court reversed the Appellate Division, which had sided with developer Monarch Communities after Montville Township's zoning board denied a variance for a 165-unit senior living facility, and remanded for reconsideration under the new standard.",
      significance: "Raises the evidentiary bar for developers of hospitals, senior housing, schools, child care centers, group homes, and renewable-energy facilities statewide, since establishing that a use is 'inherently beneficial' no longer functions as a near-automatic path past local zoning objections. Developers with pending or recently denied New Jersey use-variance applications for such uses should reassess strategy now, and should expect to need robust expert planning testimony reconciling proposed projects with local master plans.",
      body: [
        "The New Jersey Supreme Court's unanimous decision in Monarch Communities, LLC v. Township of Montville revises the three-decade-old Sica framework governing use variances for 'inherently beneficial uses' — a category spanning hospitals, schools, child care centers, group homes, senior housing, and renewable-energy facilities under the state's Municipal Land Use Law.",
        "The case arose after Montville's zoning board denied a variance for Monarch's proposed 165-unit senior living facility on an eight-acre residentially zoned parcel, citing density, drainage, traffic, and zoning-plan concerns. Both the trial court and Appellate Division had reversed the board in the developer's favor, but the Supreme Court reversed again, holding that Sica's traditional four-step balancing test never adequately incorporated a 1997 statutory amendment requiring applicants to also prove a variance would not substantially impair the municipality's zone plan and ordinance.",
        "Under the revised standard, that showing is now a threshold requirement: if an applicant cannot first demonstrate the variance won't substantially impair the zoning plan, the board never reaches the traditional balancing of public benefit against detriment. The Court remanded the case to Montville's zoning board for reconsideration under the new framework."
      ],
      timeline: [
        { when: "Zoning board hearing", label: "Montville Zoning Board denies Monarch's variance application for a 165-unit senior living facility" },
        { when: "Prior proceedings", label: "Trial court and Appellate Division both reverse the board in the developer's favor" },
        { when: "July 13, 2026", label: "NJ Supreme Court reverses the Appellate Division and adopts a revised Sica standard",  current: true }
      ],
      documentUrl: "https://www.njcourts.gov/system/files/court-opinions/2026/a_70_24.pdf",
      documentLabel: "Read the official opinion",
      tags: ["zoning", "use variance", "inherently beneficial use", "senior housing", "land use"]
    }
  ],

  /* Trends in CRE — market-wide, data-driven developments (loan distress
     roundups, foreclosure-volume reports, capital-markets shifts, and similar
     patterns) that carry legal risk signal but aren't tied to a single case
     or ruling. Populated by the "re-cre-trends-digest" scheduled research
     task, separate from the case-by-case litigation digest. Each entry cites
     its source(s) directly. */
  trends: [
    {
      id: "trend-001",
      title: "Texas Multifamily Syndicators Lose Ground as CRE Foreclosure Volume Tops $1.15B",
      category: "lending-foreclosure",
      date: "2026-08-03",
      scope: "Texas Triangle (Dallas–Fort Worth, Houston, Austin, San Antonio)",
      metric: "$1.15B in loans flagged for August foreclosure auctions",
      source: "live",
      sourceUrl: "https://therealdeal.com/texas/2026/08/03/texas-biggest-loans-head-to-foreclosure-auctions-in-august/",
      summary: "The Real Deal's monthly Texas distress tracker found $1.15 billion in commercial real estate loans flagged for foreclosure auction in August 2026, up from just under $1 billion in July, with Tarrant County leading at 11 of the 47 flagged loans. At least six multifamily syndication firms — including S2 Capital, Nitya Capital, GVA Management, and Lurin Capital — face losing control of apartment properties this month, together accounting for just under $600M, more than half the flagged total. S2 Capital told investors on July 1 it is dissolving its $400M first fund with 'no returns of capital' and separately faces foreclosure on six more properties tied to $320M in loans; Nitya Capital's Palace and Interlace Apartments (Dallas–Fort Worth) are exposed on $28.2M and $31.4M loans from One William Street Capital Management; Lurin Capital faces foreclosure on the 734-unit Latitude 2976 in Houston after an alleged default on a $77.2M Fannie Mae loan.",
      significance: "Syndicators that raised capital from passive retail investors to buy older apartment stock with floating-rate, value-add debt before rates spiked are now the epicenter of Texas CRE distress, and 17 of the 47 flagged loans have already cycled through the auction docket once before — a signal that lender forbearance is running out faster than workouts are closing. Lenders, mezzanine investors, and LPs in syndicated multifamily funds should treat repeat-flagged loans and fund-dissolution notices as leading indicators of contested foreclosures and potential fraud or mismanagement claims from wiped-out investors, which have followed similar syndicator collapses elsewhere.",
      tags: ["multifamily", "foreclosure", "syndication", "texas", "distress"]
    },
    {
      id: "trend-002",
      title: "CMBS Delinquency Rate Jumps to 7.86% as Refinancing Failures Replace Property Distress as the Driver",
      category: "lending-foreclosure",
      date: "2026-08-06",
      scope: "National CMBS market",
      metric: "7.86% delinquency rate, up 51 bps in one month",
      source: "live",
      sourceUrl: "https://www.connectcre.com/stories/cmbs-delinquency-rate-adds-51-basis-points-in-july-2026/",
      summary: "Trepp's July 2026 CMBS Delinquency Report shows the overall rate rising 51 basis points to 7.86%, the sharpest single-month increase in over a year, with five large loans accounting for $2.6B of the $6.0B in newly delinquent balances. Those loans include a showroom/exhibition-space portfolio split between North Carolina and Nevada, two Times Square properties in New York, a Chicago office tower anchored by the Aon Center, and a Seattle office portfolio. Non-performing matured balloon loans made up 66% of the newly delinquent balance, with most transfers tied to refinancing failures rather than weak property performance. Multifamily posted the largest sector increase, up 46 bps to 7.69%, on a cluster of newly delinquent loans in Ohio, Texas, and New York.",
      significance: "A maturity-default wave driven by refinancing failure rather than operating distress produces a different dispute mix than a typical downturn: extension and modification fights, guarantor liability under recourse carve-outs, appraisal disputes with special servicers, and cash-management sweep or lockbox disagreements. Because the trigger is loan structure and vintage rather than asset performance, sponsors with 2015-2016-vintage loans hitting 10-year maturities into a tighter lending market should expect portfolio-wide exposure rather than isolated, property-by-property risk.",
      tags: ["cmbs", "delinquency", "refinancing", "maturity default", "guarantor liability"]
    }
  ],

  /* Regulatory & zoning tracker — new ordinances, statutes, and agency actions
     shaping CRE. Seeded from regulatory context already established in the
     litigation entries above (each links back to the matter that cites it),
     not from separate, unverified research. Grows alongside the case tracker. */
  regulatory: [
    {
      id: "reg-001",
      title: "Philadelphia Algorithmic Rent-Fixing Ordinance",
      type: "Municipal Ordinance",
      jurisdiction: "Philadelphia, PA",
      state: "PA",
      enacted: "2024",
      summary: "Bars landlords and property managers from using algorithmic revenue-management software to set rents based on non-public competitor pricing data. Now the subject of the first courtroom tests naming both landlords and their software vendors.",
      relatedCases: ["live-001"]
    },
    {
      id: "reg-002",
      title: "San Diego Municipal Code § 98.1103 — Algorithmic Rent-Pricing Ban",
      type: "Municipal Ordinance",
      jurisdiction: "San Diego, CA",
      state: "CA",
      enacted: "Effective June 21, 2025",
      summary: "Prohibits landlords from using software that generates rent or occupancy recommendations derived from non-public competitor data. Unlike the federal antitrust theory pursued against RealPage, the ordinance requires no proof of coordination among competitors and authorizes a private right of action with statutory penalties up to $1,000 per violation.",
      relatedCases: ["live-014"]
    },
    {
      id: "reg-003",
      title: "New Jersey Algorithmic Pricing Ordinance",
      type: "State Ordinance",
      jurisdiction: "New Jersey",
      state: "NJ",
      enacted: "July 2026",
      summary: "Joins Philadelphia and San Diego among a growing wave of state and local bans on algorithmic rent-pricing tools, adopted the same month a cluster of related suits were filed against multifamily landlords in Philadelphia.",
      relatedCases: ["live-001"]
    },
    {
      id: "reg-004",
      title: "California SB 9 — Ministerial Two-Lot Subdivisions",
      type: "State Law",
      jurisdiction: "California",
      state: "CA",
      enacted: "In effect statewide",
      summary: "Allows qualifying two-lot residential subdivisions to be approved ministerially rather than through discretionary review. A live test over whether cities can condition SB 9 approvals on formula-based impact fees is now testing the limits of that ministerial status.",
      relatedCases: ["live-012"]
    }
  ]
};
