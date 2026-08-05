/* =========================================================
   MyCRELawyer — Sample dataset
   -----------------------------------------------------------
   IMPORTANT: Entries below without a "source" field are
   FICTIONAL, illustrative sample content built to demonstrate
   the interface, including their "body" full-article text.
   Parties, courts, docket numbers, and outcomes are invented
   and do not reference real litigation.

   Entries with source: "live" are real, sourced matters
   pulled in by the "re-legal-news-digest" scheduled research
   task and carry a sourceUrl citation. They intentionally have
   no "body" field — this file does not fabricate full-article
   text for real litigation. The UI falls back to linking out
   to sourceUrl for the complete original reporting until a
   verified full-text field is supplied by that task.
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
      id: "s-001",
      title: "Meridian Capital Partners v. City of Lakeview Planning Commission",
      category: "zoning-land-use",
      status: "appeal",
      date: "2026-06-18",
      jurisdiction: "Lakeview County Superior Court (sample venue)",
      state: "CA",
      amount: "$88M project value",
      summary: "Developer challenges a mixed-use rezoning denial, arguing the commission applied a density standard adopted after the application was deemed complete.",
      significance: "A ruling for the developer would reinforce vested-rights protections for CRE developers navigating shifting local zoning codes mid-entitlement — a recurring flashpoint as cities revise density rules to address housing shortages.",
      body: [
        "Meridian filed its application for a 340-unit mixed-use rezoning in early 2025. City planning staff recommended approval, finding the project consistent with the corridor plan, but the Planning Commission denied it on a 4-3 vote after adopting a revised density overlay roughly two months into the review period.",
        "Meridian's opening brief argues state vested-rights law requires the density standard in effect on the date an application is deemed complete to govern review, regardless of intervening amendments. The city counters that the overlay responded to a supplemental environmental finding and was not adopted to target the project.",
        "Oral argument is scheduled for next quarter. A ruling for the developer would be the first appellate test of the state's vested-rights statute since it was amended last year, and is being watched closely by developers with entitlements pending in jurisdictions actively revising density rules."
      ],
      tags: ["rezoning", "vested rights", "mixed-use", "entitlements"]
    },
    {
      id: "s-002",
      title: "In re Brookhaven Office REIT Securities Litigation",
      category: "reit-securities",
      status: "pending",
      date: "2026-05-02",
      jurisdiction: "U.S. District Court, Sample District",
      state: "NY",
      amount: "$210M claimed damages",
      summary: "Shareholders allege the REIT understated office-portfolio occupancy declines and deferred impairment charges across two fiscal quarters.",
      significance: "Tests how aggressively REIT disclosure obligations extend to forward-looking occupancy and valuation assumptions amid the broader office-sector repricing.",
      body: [
        "The consolidated complaint alleges Brookhaven's quarterly disclosures characterized occupancy softness at three flagship towers as 'transitory' for two consecutive quarters while internal leasing memos, later obtained in a related state-court proceeding, projected a multi-year recovery timeline.",
        "Plaintiffs' lead expert report contends the REIT's impairment testing used stale capitalization-rate assumptions that lagged observable market transactions by roughly a full trading quarter, which would have required earlier write-downs under applicable accounting guidance.",
        "The court has set a briefing schedule on the motion to dismiss for later this year. Brookhaven maintains its disclosures reflected good-faith judgment calls that fall within the safe harbor for forward-looking statements, and that hindsight recharacterization of leasing trends does not establish scienter."
      ],
      tags: ["disclosure", "impairment", "office sector", "shareholder suit"]
    },
    {
      id: "s-003",
      title: "Port Ellison Logistics LLC v. Ironclad Builders Inc.",
      category: "construction-defect",
      status: "ruling",
      date: "2026-04-27",
      jurisdiction: "Ellison County Circuit Court (sample venue)",
      state: "GA",
      amount: "$14.3M awarded",
      summary: "Warehouse developer prevailed on claims that a general contractor's substituted roofing membrane caused widespread water intrusion across a 900,000 sq ft distribution facility.",
      significance: "Court's reasoning on substitution-without-approval clauses is being closely watched by industrial developers drafting design-build contracts for large logistics assets.",
      body: [
        "Trial testimony established that Ironclad swapped the specified TPO roofing membrane for a lower-cost alternative from a different manufacturer without submitting the substitution for architect review, as required under the design-build agreement's materials-approval clause.",
        "The court found the substituted membrane's seam-welding tolerances were incompatible with the roof deck's thermal movement profile, leading to seam failures within 14 months of substantial completion and water intrusion across roughly 40% of the facility's footprint.",
        "The $14.3M award covers remediation, business-interruption costs tied to delayed tenant occupancy, and a portion of Port Ellison's attorneys' fees under a prevailing-party clause. Ironclad has 30 days to file post-trial motions before the appeal window opens."
      ],
      tags: ["design-build", "roofing failure", "industrial", "warranty"]
    },
    {
      id: "s-004",
      title: "Cascade Retail Trust v. Union Regional Bank",
      category: "lending-foreclosure",
      status: "settled",
      date: "2026-03-14",
      jurisdiction: "U.S. Bankruptcy Court, Sample District",
      state: "WA",
      amount: "Confidential",
      summary: "Retail REIT and its lender settled a dispute over loan-covenant waivers tied to a mall property's declining debt-service coverage ratio.",
      significance: "Illustrates growing lender flexibility on covenant relief for retail assets showing operational recovery, rather than forcing immediate foreclosure.",
      body: [
        "The dispute centered on whether a temporary DSCR waiver granted in 2024 remained in force after Cascade completed a mall repositioning that added an entertainment anchor, or whether the original 1.25x covenant automatically snapped back on the waiver's stated expiration date.",
        "Union Regional had issued a notice of default and reserved its right to accelerate the loan, prompting Cascade to seek a declaratory judgment. Both sides agreed to mediation after occupancy data showed a meaningful post-repositioning recovery trend.",
        "Terms of the settlement are confidential, but people familiar with the negotiation describe an extended covenant-relief period tied to occupancy milestones rather than a fixed calendar date, a structure lenders are increasingly using for retail assets mid-repositioning."
      ],
      tags: ["covenant waiver", "mall", "workout", "DSCR"]
    },
    {
      id: "s-005",
      title: "Highgate Multifamily Holdings v. State Rent Stabilization Board",
      category: "landlord-tenant",
      status: "filed",
      date: "2026-07-09",
      jurisdiction: "State Court of Appeals, Sample Circuit",
      state: "CA",
      amount: "Portfolio-wide impact",
      summary: "Owner group challenges a newly enacted rent-increase cap as applied to recently renovated units, arguing it constitutes an uncompensated taking.",
      significance: "A significant test case for owners across markets adopting stricter rent-stabilization measures on renovated or newly delivered multifamily units.",
      body: [
        "The petition targets an amendment that extended the jurisdiction's standard rent-increase cap to units renovated within the past five years, eliminating a prior carve-out that let owners reset rents to market on substantially renovated units.",
        "Highgate's brief argues the amendment was applied to renovation investments already underwritten and partially completed before the ordinance's effective date, and seeks either an exemption for in-process projects or compensation for the resulting valuation impact.",
        "The Board has moved to dismiss, arguing rent regulation is a well-established exercise of police power that does not require a takings analysis absent a permanent physical occupation. A hearing on the motion is set for early next quarter."
      ],
      tags: ["rent stabilization", "multifamily", "regulatory taking"]
    },
    {
      id: "s-006",
      title: "City of Fairmont v. Summit Industrial Partners",
      category: "eminent-domain",
      status: "pending",
      date: "2026-02-20",
      jurisdiction: "Fairmont County District Court (sample venue)",
      state: "CO",
      amount: "$46M just-compensation dispute",
      summary: "Municipality seeks to condemn a portion of an active distribution center for a transit corridor expansion; owner disputes the compensation methodology used.",
      significance: "Center on whether appraisal methodology must account for lost operational efficiency in partial takings of purpose-built industrial facilities, not just land value.",
      body: [
        "The city's appraisal valued the condemned strip — roughly 4 acres along the facility's eastern loading apron — using comparable-land-sale data alone, arriving at a figure Summit calls disconnected from the parcel's function within an integrated distribution operation.",
        "Summit's cross-appraisal argues the taking forces a costly reconfiguration of the facility's truck-court circulation pattern, reducing effective dock capacity by an estimated 18%, and that just compensation must reflect that operational impairment, not merely the land's standalone value.",
        "A court-appointed valuation expert has been asked to review both methodologies ahead of a compensation hearing later this year. The outcome is expected to influence how several other pending transit-corridor takings in the region value partial industrial acquisitions."
      ],
      tags: ["partial taking", "just compensation", "industrial", "transit corridor"]
    },
    {
      id: "s-007",
      title: "Alden Square Tenants Coalition v. Marrow Property Group",
      category: "lease-disputes",
      status: "ruling",
      date: "2026-06-03",
      jurisdiction: "Sample County Commercial Division",
      state: "IL",
      amount: "$3.1M in disputed CAM charges",
      summary: "Retail tenants prevailed on a claim that landlord's common-area-maintenance reconciliation improperly included capital replacement costs as operating expenses.",
      significance: "Reinforces the importance of precise CAM definitions in retail leases and is prompting owners to review reconciliation practices portfolio-wide.",
      body: [
        "The tenants' claim focused on a full parking-structure resurfacing and a chiller-plant replacement, both booked to the annual CAM pool despite lease language excluding capital items with a useful life exceeding five years from operating expense recovery.",
        "Marrow argued the resurfacing qualified as maintenance rather than capital replacement because it extended, rather than replaced, the existing structure, but the court found the scope and cost of the work — full-depth removal and repour — placed it squarely within the capital exclusion.",
        "The ruling requires Marrow to issue credits covering three years of disputed reconciliations and adopt an itemized CAM statement format going forward. Several tenants in other Marrow-managed centers have since requested reconciliation audits of their own leases."
      ],
      tags: ["CAM charges", "retail lease", "operating expenses"]
    },
    {
      id: "s-008",
      title: "Northgate Business Park Owners Assoc. v. Vantage Environmental Services",
      category: "environmental",
      status: "appeal",
      date: "2026-01-11",
      jurisdiction: "U.S. Court of Appeals, Sample Circuit",
      state: "OH",
      amount: "$27M remediation cost dispute",
      summary: "Dispute over allocation of groundwater remediation costs following discovery of legacy contamination beneath a business park acquired in a prior sale-leaseback.",
      significance: "Appellate ruling expected to clarify indemnification scope in older sale-leaseback agreements silent on post-closing environmental liability.",
      body: [
        "The contamination — a chlorinated-solvent plume traced to a former dry-cleaning operation on an adjacent parcel decades before Northgate's acquisition — was discovered during geotechnical work for a planned expansion, triggering a state remediation order.",
        "The 2011 sale-leaseback agreement is silent on post-closing environmental liability beyond a standard as-is clause, and the district court held that silence placed the remediation obligation on the current owner. Northgate's appeal argues the as-is clause cannot be read to override the seller's implied disclosure duties under the state's environmental transfer act.",
        "Amicus filings from two regional CRE trade groups support Northgate's position, warning that affirming the lower court would chill sale-leaseback transactions involving older industrial parcels unless sellers obtain fresh Phase II assessments at every closing."
      ],
      tags: ["remediation", "sale-leaseback", "indemnification", "groundwater"]
    },
    {
      id: "s-009",
      title: "Silverline Data Centers v. County of Ashworth Zoning Board",
      category: "zoning-land-use",
      status: "filed",
      date: "2026-07-22",
      jurisdiction: "Ashworth County Superior Court (sample venue)",
      state: "VA",
      amount: "$620M facility investment",
      summary: "Developer sues after a special-use permit for a hyperscale data center was revoked following a community opposition campaign citing power-grid strain.",
      significance: "One of several emerging disputes nationally over local pushback to data-center development — a bellwether for entitlement risk in that asset class.",
      body: [
        "The county originally approved Silverline's special-use permit last year following a standard environmental and traffic review. The board voted to revoke it after a newly elected majority cited a utility filing projecting the facility would consume roughly 6% of the county's available substation capacity.",
        "Silverline's complaint argues the revocation ignored a signed capacity-reservation agreement with the regional utility that predates the board's new composition, and that the county cannot revisit a validly issued permit based on policy disagreement rather than a permit violation.",
        "The case is one of several data-center entitlement disputes now pending nationally as local grid-capacity concerns intersect with hyperscale demand; developers and utilities in other jurisdictions are watching closely for guidance on how binding capacity agreements interact with local land-use authority."
      ],
      tags: ["data center", "special use permit", "community opposition"]
    },
    {
      id: "s-010",
      title: "Beacon Hospitality Trust v. Coastal Insurance Underwriters",
      category: "reit-securities",
      status: "pending",
      date: "2026-05-29",
      jurisdiction: "U.S. District Court, Sample District",
      state: "FL",
      amount: "$61M business-interruption claim",
      summary: "Hotel REIT sues its property insurer over denial of a business-interruption claim following extended storm-related closures at three coastal properties.",
      significance: "Closely watched for how courts treat 'period of restoration' clauses when supply-chain delays extend rebuild timelines well beyond historical norms.",
      body: [
        "Coastal Insurance denied roughly 40% of Beacon's claimed business-interruption losses, arguing the policy's 'period of restoration' clause caps recovery at the time repairs reasonably should have taken using pre-storm construction timelines and material availability.",
        "Beacon contends the relevant standard must account for actual, documented supply-chain delays affecting specialty materials — window assemblies and structural steel connectors sourced from a single regional fabricator — that pushed the real rebuild timeline roughly five months beyond historical norms.",
        "Expert discovery is underway on both sides' reconstruction-timeline models. The ruling is expected to bear on a growing number of hospitality and multifamily business-interruption claims nationally where insurers and owners disagree on how post-catastrophe supply constraints should factor into restoration-period calculations."
      ],
      tags: ["business interruption", "hospitality", "insurance coverage"]
    },
    {
      id: "s-011",
      title: "Ridgemont Logistics Center v. Apex General Contracting",
      category: "construction-defect",
      status: "filed",
      date: "2026-07-15",
      jurisdiction: "Ridgemont County Circuit Court (sample venue)",
      state: "TX",
      amount: "$9.8M claimed",
      summary: "Owner alleges structural slab defects across a cold-storage facility caused by inadequate soil compaction testing prior to pour.",
      significance: "Raises questions about geotechnical due-diligence standards on fast-tracked cold-storage and industrial builds delivered under compressed schedules.",
      body: [
        "The complaint alleges Apex skipped a scheduled round of proof-rolling compaction tests to keep pace with a compressed 11-month delivery schedule, and that subsequent settlement caused differential slab cracking across roughly a third of the facility's freezer-zone floor.",
        "Ridgemont's structural expert report ties the cracking pattern to loose fill beneath the slab in zones that soil borings show were never re-tested after an earlier grading revision moved the building pad roughly 40 feet from its original location.",
        "Apex has not yet filed a responsive pleading. Industry observers note the dispute reflects broader pressure across cold-storage development, where compressed schedules to meet e-commerce demand have repeatedly been cited in post-construction geotechnical disputes over the past two years."
      ],
      tags: ["cold storage", "slab defect", "geotechnical"]
    },
    {
      id: "s-012",
      title: "First Continental Bank v. Parkview Office Holdings",
      category: "lending-foreclosure",
      status: "ruling",
      date: "2026-03-30",
      jurisdiction: "Sample County Commercial Division",
      state: "IL",
      amount: "$132M loan balance",
      summary: "Lender obtained a foreclosure judgment on a downtown office tower after the borrower defaulted following a prolonged occupancy decline.",
      significance: "One of the largest single-asset office foreclosure rulings tracked this year, seen as indicative of continued distress in central-business-district office debt.",
      body: [
        "Parkview's 38-story tower saw occupancy fall from 91% to 54% over three years as three anchor tenants downsized at lease expiration, pushing debt-service coverage below the loan's default threshold for six consecutive quarters despite two prior forbearance periods.",
        "Parkview's defense argued the lender acted in bad faith by declining a proposed conversion-to-residential feasibility study that could have supported a restructured loan, but the court found the loan documents gave First Continental unilateral discretion over workout proposals.",
        "The judgment clears the way for a receiver sale expected later this year. Brokers tracking the CBD office debt market say the ruling — and the size of the loan involved — will likely factor into pricing expectations for a wave of similar assets still working through workout negotiations."
      ],
      tags: ["office distress", "foreclosure judgment", "CBD", "loan default"]
    },
    {
      id: "s-013",
      title: "Tenants of Willow Creek Apartments v. Granite Peak Management",
      category: "landlord-tenant",
      status: "settled",
      date: "2026-02-08",
      jurisdiction: "Sample County Housing Court",
      state: "CO",
      amount: "$2.4M settlement fund",
      summary: "Class settlement resolves claims that a property manager charged prohibited administrative fees on top of state-capped security deposits.",
      significance: "Settlement terms are being used as an informal benchmark by compliance teams reviewing fee structures across multifamily portfolios.",
      body: [
        "The class alleged Granite Peak's standard lease addendum charged a flat $350 'administrative processing fee' at move-in, in addition to the state's one-month security deposit cap, characterizing the fee as a service charge exempt from the cap.",
        "Granite Peak disputed liability but agreed to settle after a preliminary ruling found the fee's structure — assessed uniformly regardless of any actual administrative service performed — resembled a disguised deposit rather than a genuine service fee under the state housing code's functional test.",
        "The $2.4M fund covers refunds to roughly 1,900 current and former residents across the portfolio. Several property management compliance teams outside the litigation have since cited the settlement's fee-classification analysis when reviewing their own move-in fee schedules."
      ],
      tags: ["class action", "fee compliance", "multifamily", "security deposits"]
    },
    {
      id: "s-014",
      title: "Del Rio Shopping Centers v. Anchor Grocery Holdings",
      category: "lease-disputes",
      status: "appeal",
      date: "2025-12-19",
      jurisdiction: "State Court of Appeals, Sample Circuit",
      state: "TX",
      amount: "Co-tenancy clause dispute",
      summary: "Landlord appeals a ruling allowing an anchor tenant to pay reduced rent under a co-tenancy clause after an adjacent anchor's bankruptcy closure.",
      significance: "Appellate outcome will influence how strictly co-tenancy remedy clauses are enforced amid continued anchor-tenant bankruptcies in retail centers.",
      body: [
        "The co-tenancy clause entitles Anchor Grocery to pay alternative (reduced) rent if a named adjacent anchor ceases operating for more than 180 days. That anchor closed as part of a Chapter 11 liquidation, and Del Rio has been unable to backfill the space for over a year.",
        "Del Rio argues the clause should be read to require the landlord's good-faith re-leasing efforts to have failed before alternative rent kicks in, while Anchor Grocery reads the trigger as purely a function of the vacancy period, regardless of leasing effort.",
        "The trial court sided with Anchor Grocery on the plain text of the clause. Del Rio's appeal leans heavily on extrinsic evidence of negotiation history, an approach the appellate panel will need to weigh against the lease's integration clause."
      ],
      tags: ["co-tenancy", "anchor tenant", "retail bankruptcy"]
    },
    {
      id: "s-015",
      title: "County of Marston v. Elevation Rail Yard Holdings",
      category: "eminent-domain",
      status: "settled",
      date: "2026-01-25",
      jurisdiction: "Marston County District Court (sample venue)",
      state: "KS",
      amount: "$18.5M negotiated award",
      summary: "County and owner reached a negotiated settlement for a rail-adjacent parcel condemned as part of a regional freight-corridor expansion.",
      significance: "Settlement pricing is being referenced in ongoing valuation disputes involving other rail-adjacent industrial parcels along the same corridor.",
      body: [
        "The condemned 22-acre parcel sat adjacent to an active rail spur Elevation had been marketing for transload-facility development, giving it a use-specific premium the county's initial offer did not reflect.",
        "Both sides' appraisers ultimately agreed on a valuation methodology that credited the parcel's rail-adjacency as a distinct value driver rather than treating it as generic industrial land, narrowing the gap between the county's original offer and Elevation's demand from roughly $9M to under $1M before settling.",
        "Because the corridor expansion involves several additional parcels still in condemnation proceedings, appraisers on both sides of at least two other pending matters along the same corridor have already cited the settlement's rail-adjacency premium methodology in their own filings."
      ],
      tags: ["freight corridor", "negotiated settlement", "industrial land"]
    },
    {
      id: "s-016",
      title: "Sundowner Storage Partners v. Coastal Zoning Appeals Board",
      category: "zoning-land-use",
      status: "ruling",
      date: "2026-04-04",
      jurisdiction: "Sample Coastal County Superior Court",
      state: "CA",
      amount: "$22M project",
      summary: "Self-storage developer won a variance challenge after the board denied a height variance citing 'neighborhood character,' without written findings.",
      significance: "Reinforces procedural requirements for zoning boards to issue written findings — a recurring vulnerability in self-storage and last-mile entitlement fights.",
      body: [
        "The board denied Sundowner's request for an 8-foot height variance in a single sentence read into the meeting record — that the additional height was 'inconsistent with neighborhood character' — without adopting written findings addressing the variance criteria in the local zoning code.",
        "Sundowner's petition argued the code requires findings on each of five enumerated variance factors, and that a bare conclusory statement about neighborhood character cannot substitute for that analysis, particularly where staff's own report found the project met all five criteria.",
        "The court agreed, remanding to the board with instructions to either issue proper findings or approve the variance. Land-use counsel note the ruling gives storage and last-mile developers a clearer procedural hook to challenge similar denials that rely on generalized aesthetic objections."
      ],
      tags: ["variance", "self-storage", "procedural due process"]
    },
    {
      id: "s-017",
      title: "Vantex Industrial REIT v. Former Chief Investment Officer",
      category: "reit-securities",
      status: "filed",
      date: "2026-07-27",
      jurisdiction: "U.S. District Court, Sample District",
      state: "TX",
      amount: "$19M claimed",
      summary: "REIT alleges its former CIO breached fiduciary duty by steering acquisition due-diligence contracts to an entity in which he held an undisclosed interest.",
      significance: "Underscores heightened board scrutiny of related-party dealings in REIT acquisition pipelines following recent governance reforms.",
      body: [
        "The complaint alleges Vantex's former CIO directed roughly $19M in environmental and structural due-diligence work over four years to a consulting firm in which he held an undisclosed minority equity stake, routed through a holding entity that obscured the relationship from Vantex's conflicts-disclosure process.",
        "Vantex says the relationship surfaced during a routine vendor-concentration audit conducted as part of a broader governance overhaul adopted last year, after which the board's audit committee referred the matter for investigation and ultimately termination.",
        "The former CIO has not yet responded to the complaint. Vantex's board has cited the episode in adopting expanded vendor-disclosure requirements, a step several peer REITs have said they are now reviewing as part of their own related-party policies."
      ],
      tags: ["fiduciary duty", "related-party transaction", "governance"]
    },
    {
      id: "s-018",
      title: "Harborview Mixed-Use LLC v. Trestle Engineering Group",
      category: "construction-defect",
      status: "pending",
      date: "2026-06-30",
      jurisdiction: "Sample County Commercial Division",
      state: "MA",
      amount: "$31M claimed",
      summary: "Developer alleges a structural engineer's miscalculated wind-load design forced a costly mid-construction redesign of a coastal mixed-use tower's podium.",
      significance: "Focuses attention on engineer-of-record liability caps in coastal high-rise construction contracts as storm-design standards tighten.",
      body: [
        "Harborview alleges Trestle's original podium design used an outdated coastal exposure category that understated wind-load requirements by a margin discovered only after a third-party peer review, triggered by an updated state building-code adoption, flagged the discrepancy mid-construction.",
        "The resulting redesign required demolition and reconstruction of roughly two levels of already-completed podium structure, which Harborview says added $31M in direct costs and an eight-month schedule delay to a project already under a hard delivery deadline tied to its construction loan.",
        "Trestle's engineering-services agreement includes a liability cap well below the claimed damages, and its defense is expected to center on whether that cap survives given Harborview's allegation of a fundamental design error rather than an ordinary negligence claim — a distinction several other pending coastal construction-defect matters are also testing."
      ],
      tags: ["structural engineering", "wind load", "coastal high-rise"]
    },
    {
      id: "s-019",
      title: "Redstone Environmental Coalition v. Palisade Development Corp.",
      category: "environmental",
      status: "filed",
      date: "2026-07-05",
      jurisdiction: "U.S. District Court, Sample District",
      state: "CO",
      amount: "Injunctive relief sought",
      summary: "Advocacy group seeks to halt grading on a hillside mixed-use project, alleging the environmental impact review understated wildfire-evacuation risk.",
      significance: "Part of a broader wave of CEQA-style challenges tying wildfire-risk disclosure to project approval timelines in wildland-urban interface development.",
      body: [
        "Redstone's complaint alleges the project's environmental impact review modeled evacuation times using the area's existing two-lane access road without accounting for a since-approved neighboring development that will add roughly 600 additional daily vehicle trips to the same corridor.",
        "Palisade's approved conditions include a secondary emergency-access easement, which the company argues resolves the evacuation-capacity concern regardless of cumulative traffic from nearby projects; Redstone counters that the easement has not yet been constructed and lacks a binding completion timeline tied to occupancy.",
        "A hearing on Redstone's request for a preliminary injunction halting grading is set for next month. The case follows a pattern of wildfire-evacuation challenges to wildland-urban interface projects that have grown more common as review agencies face pressure to model cumulative, rather than project-only, traffic impacts."
      ],
      tags: ["environmental review", "wildfire risk", "hillside development"]
    },
    {
      id: "s-020",
      title: "Oakmere Business Center Tenants v. Continuum Property Services",
      category: "lease-disputes",
      status: "pending",
      date: "2026-05-16",
      jurisdiction: "Sample County Commercial Division",
      state: "NC",
      amount: "$5.6M disputed operating expenses",
      summary: "Office tenants allege a property manager double-billed capital improvement costs across separate operating-expense and special-assessment line items.",
      significance: "Highlights growing tenant scrutiny of expense pass-throughs as owners invest heavily in building upgrades to compete for post-pandemic office demand.",
      body: [
        "The tenants' audit found a lobby and elevator-modernization project — roughly $4.1M in total cost — appeared both amortized within the standard operating-expense pool and billed again as a one-time special assessment under a separate lease provision for major capital upgrades.",
        "Continuum says the double appearance was a bookkeeping error introduced when the building switched accounting platforms mid-project, and has offered a credit covering the operating-expense-side amortization, but tenants dispute the size of the proposed credit and are seeking a full third-party reconciliation audit of the past three years.",
        "The dispute comes as Oakmere's ownership has pushed aggressive capital-improvement spending to reposition the building for amenity-driven post-pandemic leasing demand, a pattern tenant representatives say is prompting more frequent expense audits across comparable office portfolios."
      ],
      tags: ["operating expenses", "office", "expense audit"]
    },
    {
      id: "s-021",
      title: "Cobalt Bridge Lending v. Trailhead Hospitality Group",
      category: "lending-foreclosure",
      status: "filed",
      date: "2026-07-28",
      jurisdiction: "U.S. Bankruptcy Court, Sample District",
      state: "UT",
      amount: "$74M loan balance",
      summary: "Mezzanine lender initiates UCC foreclosure proceedings against equity interests in a resort-hotel ownership entity following a payment default.",
      significance: "A closely watched test of mezzanine foreclosure mechanics in hospitality assets still recovering unevenly across leisure and business-travel segments.",
      body: [
        "Trailhead missed its mezzanine debt-service payment for a second consecutive quarter after RevPAR at its flagship resort property recovered more slowly than underwritten, weighed down by softer group and business-travel bookings even as leisure demand rebounded.",
        "Cobalt Bridge's UCC foreclosure targets the pledged equity interests in the ownership entity rather than the real property itself, a faster mezzanine remedy that bypasses judicial foreclosure but has drawn a challenge from Trailhead over the commercial-reasonableness of the proposed private sale process.",
        "A hearing on Trailhead's request to enjoin the sale pending a revised marketing process is set for next month. Hospitality lenders are watching the commercial-reasonableness standard applied here as a signal for how aggressively mezzanine remedies can be pursued against assets with uneven segment-level recovery."
      ],
      tags: ["mezzanine debt", "UCC foreclosure", "hospitality"]
    },
    {
      id: "s-022",
      title: "Founders Row Historic District Trust v. Lantern Hill Developers",
      category: "zoning-land-use",
      status: "ruling",
      date: "2025-11-14",
      jurisdiction: "Sample County Superior Court",
      state: "MD",
      amount: "$54M redevelopment",
      summary: "Preservation trust successfully blocked demolition of a facade within a historic overlay district, forcing redesign of an approved office-to-residential conversion.",
      significance: "A reminder that historic-overlay review can override otherwise-approved adaptive-reuse entitlements late in the design process, adding schedule risk.",
      body: [
        "Lantern Hill's approved office-to-residential conversion included demolition of a two-story facade the trust argued was a contributing structure within the historic overlay district, despite the building's later additions having significantly altered its original 1920s appearance.",
        "The court found the overlay district's design-review authority extends to contributing structures regardless of later alterations, and that the city's initial building-permit approval, which did not separately route the demolition through historic-district review, was issued in error.",
        "Lantern Hill must now redesign the conversion to preserve the facade, adding an estimated four months to the schedule. The developer has said it will still proceed, but the ruling is prompting other adaptive-reuse sponsors in the district to route demolition scope through historic review earlier in design."
      ],
      tags: ["historic preservation", "adaptive reuse", "office-to-residential"]
    },

    /* ---------------------------------------------------------------
       LIVE UPDATES — real, sourced matters pulled from the twice-daily
       "re-legal-news-digest" scheduled research task. Unlike the
       fictional sample entries above, these carry source: "live" and
       a sourceUrl citation, and intentionally have no "body" field.
       New runs of that task append here.
       --------------------------------------------------------------- */
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
      tags: ["foreclosure", "mechanics lien", "condo deposits", "construction lending", "chapter 11"]
    }
  ]
};
