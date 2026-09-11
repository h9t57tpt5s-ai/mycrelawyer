/* =========================================================
   CREdocket — ADA Title III Risk Flagging data
   -----------------------------------------------------------
   Physical/architectural-barrier public-accommodation litigation
   risk, not website accessibility -- a related but different
   exposure this tool doesn't cover. Two independent risk factors:
   (1) which state the property is in, since federal filing volume
   is extremely concentrated and a few states layer state-law
   damages/notice regimes on top of federal ADA, and (2) property
   type, since the common violation categories differ by asset
   class.

   Federal filing-volume figures are 2025 federal-court Title III
   filing counts (Seyfarth Shaw's ADA Title III tracker, "ADA Title
   III Federal Lawsuit Filings Fall Slightly to 8,667 in 2025,"
   published Feb 11 2026 at adatitleiii.com) -- real counts for the
   top 10 states plus the three states with zero filings. Georgia,
   Wisconsin, and Colorado additionally carry a real, sourced count
   from Seyfarth Shaw's earlier "2025 Mid-Year Report" (published
   Sept 2025) -- that figure covers only the first half of 2025
   (Jan-Jun), not the full year, because no exact full-year number
   for those three states was ever published (the Feb 2026 report
   only confirms Georgia was displaced from the top 10 by Indiana's
   88 full-year filings, without giving Georgia's own full-year
   total). Every other state's tier below is built from what's
   actually confirmed (no independently verified count), not a
   guess at a specific number -- this was checked again, state by
   state, against both reports before publication; no exact 2025
   figure could be found for other high-population states such as
   Ohio, Arizona, North Carolina, or Michigan.
   ========================================================= */

const ADA_RISK_DATA = {
  disclaimer: "This tool flags general litigation-risk factors for physical/architectural-barrier ADA Title III claims based on public filing-volume data and known state-law overlays -- it does not assess whether any specific property is actually compliant, does not substitute for a Certified Access Specialist (CASp) or accessibility consultant's inspection, and does not constitute legal advice. It also does not cover website/digital accessibility claims, which are a related but separate and independently significant source of exposure. Confirm your property's actual compliance and your state's current requirements with qualified counsel and a qualified accessibility inspector.",

  federalBaseline: "Federal ADA Title III itself provides NO monetary damages remedy for a private plaintiff -- only injunctive relief (an order to fix the barrier) plus the plaintiff's attorney's fees and costs, which is what actually funds high-volume filing activity. Critically, federal courts have uniformly held there is no pre-suit notice requirement under Title III itself -- the first a business typically learns of an alleged barrier is the lawsuit itself, not a warning letter. Every state noted below as an exception to this is genuinely unusual, not the norm.",

  // Real 2025 federal Title III filing counts where confirmed; `tier`
  // drives the risk badge. States not individually listed fall to the
  // "moderate-low" default tier below rather than being assigned a
  // fabricated number.
  stateFilingVolume: {
    "California": { count: 3252, tier: "extreme", note: "By far the highest-volume state -- roughly 40% of all federal Title III filings nationwide in 2025." },
    "Florida": { count: 1823, tier: "very-high" },
    "New York": { count: 1471, tier: "very-high" },
    "Illinois": { count: 659, tier: "high" },
    "Missouri": { count: 183, tier: "elevated" },
    "Minnesota": { count: 179, tier: "elevated" },
    "Texas": { count: 177, tier: "elevated" },
    "Pennsylvania": { count: 95, tier: "moderate" },
    "New Jersey": { count: 91, tier: "moderate" },
    "Indiana": { count: 88, tier: "moderate" },
    "Georgia": { count: 34, tier: "moderate", note: "34 federal Title III filings in the first half of 2025 (Jan-Jun) per Seyfarth Shaw's 2025 Mid-Year Report -- a real, sourced number, but only a half-year figure. No exact full-year 2025 total was published for Georgia; the only full-year data point is that Indiana's 88 filings pushed Georgia out of the top 10, so Georgia's full-year count is confirmed to be somewhere below 88." },
    "Wisconsin": { count: 34, tier: "moderate", note: "34 federal Title III filings in the first half of 2025 (Jan-Jun) per Seyfarth Shaw's 2025 Mid-Year Report -- a real, sourced number, but only a half-year figure; no confirmed full-year 2025 total was separately published for Wisconsin." },
    "Colorado": { count: 34, tier: "moderate", note: "34 federal Title III filings in the first half of 2025 (Jan-Jun) per Seyfarth Shaw's 2025 Mid-Year Report -- a real, sourced number, but only a half-year figure; no confirmed full-year 2025 total was separately published for Colorado. (See also this state's overlay entry below for its HB21-1110 safe-harbor framework.)" },
    "Montana": { count: 0, tier: "minimal", note: "Zero federal Title III filings recorded in 2025." },
    "North Dakota": { count: 0, tier: "minimal", note: "Zero federal Title III filings recorded in 2025." },
    "South Dakota": { count: 0, tier: "minimal", note: "Zero federal Title III filings recorded in 2025." },
  },
  tierMeta: {
    "extreme": { label: "Extreme", color: "--status-appeal" },
    "very-high": { label: "Very High", color: "--status-appeal" },
    "high": { label: "High", color: "--status-pending" },
    "elevated": { label: "Elevated", color: "--status-pending" },
    "moderate": { label: "Moderate", color: "--status-filed" },
    "moderate-low": { label: "Moderate-to-Low (no high-volume filings confirmed)", color: "--status-ruling" },
    "minimal": { label: "Minimal", color: "--status-ruling" },
  },

  // State-law overlays: damages beyond federal ADA's injunction-only
  // remedy, and any pre-suit notice/cure mechanism. California, New
  // York, Illinois, and Texas are now verified in real depth; Florida
  // and Colorado are real but described in general terms since their
  // exact mechanics weren't independently verified to the same depth.
  stateOverlays: {
    "California": {
      hasOverlay: true,
      summary: "By far the most significant state-law layer in the country. The Unruh Civil Rights Act makes any ADA violation automatically an Unruh Act violation too, carrying statutory damages of $4,000 per violation/encounter, in addition to the federal injunctive-only remedy -- this is the single biggest driver of California's outsized filing volume, since it's the main source of monetary exposure for physical-barrier claims nationally.",
      details: [
        "SB 1186 requires an attorney to give the property owner/tenant at least 30 days' written notice of an alleged construction-related accessibility violation before filing a damages claim.",
        "Statutory damages drop to $1,000/violation if corrected within 60 days of being served, or to $2,000/violation for a small business (fewer than 25 employees) that corrects within 30 days.",
        "A CASp (Certified Access Specialist) inspection report obtained before a claim is filed provides real, meaningful protection -- it can qualify the property for the 60-day cure window and related litigation benefits (an early evaluation conference, a stay of the case) not available without one.",
      ],
    },
    "Florida": {
      hasOverlay: true,
      summary: "Florida has enacted measures aimed at curbing high-volume serial-filer suits, particularly in state court, though the framework is less established and less protective than California's. Federal-court filings in Florida are not subject to a state pre-suit notice requirement the way California damages claims are.",
      details: [],
    },
    "Colorado": {
      hasOverlay: true,
      summary: "Colorado has enacted a compliance safe-harbor framework (HB21-1110) for businesses meeting certain accessibility standards -- a real, if narrower, state-law consideration worth understanding relative to Colorado's own filing volume.",
      details: [],
    },
    "New York": {
      hasOverlay: true,
      summary: "New York has no Unruh-style automatic per-violation statutory-damages statute, but both the New York State Human Rights Law (NYSHRL, Executive Law Article 15) and, for New York City properties specifically, the New York City Human Rights Law (NYCHRL, NYC Administrative Code Title 8) make disability discrimination in a place of public accommodation independently actionable in a way that opens the door to real monetary damages beyond federal ADA's injunction-only remedy -- part of why New York is a top-3 filing state, and why Seyfarth Shaw's own tracker specifically flags plaintiffs migrating toward New York (and New Jersey) state-court venues that allow money damages federal Title III itself does not.",
      details: [
        "Private NYCHRL lawsuits can recover compensatory damages with no statutory cap, plus punitive damages under a standard lower than federal law's: the New York Court of Appeals held in Chauca v. Abraham, 30 N.Y.3d 325 (2017), that NYCHRL punitive damages require only willful or wanton negligence, recklessness, or a conscious disregard of the rights of others -- not the stricter 'malice or reckless indifference' federal Title VII standard (Chauca itself was an employment case, but courts have since applied the same NYCHRL standard more broadly).",
        "Independent of any private lawsuit, the NYC Commission on Human Rights can impose its own civil penalty of up to $125,000 per violation under NYC Admin. Code Sec. 8-126, rising to up to $250,000 where the conduct is found willful, wanton, or malicious.",
        "The City's Local Civil Rights Restoration Act of 2005 requires NYCHRL to be construed more broadly than its state and federal counterparts, treating federal case law as a floor rather than a ceiling -- meaning some defenses that succeed under the ADA can still fail under NYCHRL.",
        "Unlike California's SB 1186, neither NYSHRL nor NYCHRL imposes a pre-suit written-notice/cure period specific to construction-related accessibility claims before a damages claim can be filed.",
      ],
    },
    "Illinois": {
      hasOverlay: true,
      summary: "Illinois has no Unruh-style automatic per-violation statutory-damages statute, but disability discrimination in a place of public accommodation is independently actionable under the Illinois Human Rights Act (IHRA), and new construction/alterations to certain facilities face a separate Illinois accessibility design-and-construction code enforced by the Illinois Attorney General -- both real avenues of exposure beyond federal ADA's injunction-only remedy, distinct from the private federal lawsuits this tool otherwise tracks.",
      details: [
        "The Illinois Human Rights Act (775 ILCS 5, Article 5) makes disability discrimination in places of public accommodation an independent state civil-rights violation; a charge is filed with the Illinois Department of Human Rights, and a violation can result in an award of actual damages -- including emotional-distress damages -- and attorney's fees under 775 ILCS 5/8A-104, not just injunctive relief.",
        "Separately, the Environmental Barriers Act (410 ILCS 25) and the Illinois Accessibility Code it implements set Illinois-specific accessibility design/construction standards, enforced by the Illinois Attorney General's office. Sources are not fully consistent on how far the Code's private-building coverage reaches (the Capital Development Board's own FAQ guidance describes it as reaching any facility 'used or held out for use by the public,' which would include most commercial real estate, but this should be confirmed against the current administrative rule text for a specific property before being relied on).",
        "Where Illinois and federal accessibility design standards conflict, the Illinois Accessibility Code (Ill. Admin. Code tit. 71, Sec. 400.110) directs that the stricter of the two controls.",
      ],
    },
    "Texas": {
      hasOverlay: true,
      summary: "Texas has no Unruh-style per-violation statutory-damages regime, but its Architectural Barriers Act (Tex. Gov't Code Chapter 469) creates a real, independent state regulatory layer: most non-exempt Texas commercial construction or renovation projects costing $50,000 or more must be registered with the Texas Department of Licensing and Regulation (TDLR), plan-reviewed, and inspected for compliance with the Texas Accessibility Standards (TAS) -- direct administrative exposure that runs on top of, and independently from, federal ADA private-lawsuit risk, and applies whether or not a private plaintiff ever sues.",
      details: [
        "Registration and inspection are owner obligations with real deadlines: TDLR requires the project's final accessibility inspection to be requested within 30 days of construction completion and completed before the first anniversary of the recorded completion date.",
        "TDLR administrative penalties run in two tiers per 16 Tex. Admin. Code Sec. 68.90: Class A violations (e.g., failing to register the project, or failing to request/obtain the timely final inspection) run $500-$3,000 for a first violation, rising to $2,500-$5,000 for a third; Class B violations (failing to submit verification of required corrections, or an outright TAS violation) run $1,000-$3,000 for a first violation, rising to $4,000-$5,000 for a third.",
        "This TDLR compliance/registration exposure is separate from, and in addition to, the federal Title III lawsuit risk the rest of this tool tracks.",
      ],
    },
  },

  propertyTypes: {
    "retail": {
      label: "Retail",
      riskFactors: [
        "Accessible parking count/signage/van-accessible spaces and the route from parking to the entrance",
        "Entrance door clear width, threshold height, and door-opening force",
        "Checkout aisle width and counter height",
        "Path of travel width through merchandise displays/aisles",
        "Accessible fitting rooms (where fitting rooms are provided at all)",
      ],
    },
    "restaurant": {
      label: "Restaurant",
      riskFactors: [
        "Accessible parking and route from parking to entrance",
        "Table/seating accessible route width and accessible table height/knee clearance",
        "Restroom clear floor space, grab bars, and door hardware",
        "Bar/counter seating accessible height where provided",
        "Outdoor/patio seating accessible route and surface",
      ],
    },
    "hotel": {
      label: "Hotel",
      riskFactors: [
        "Required number and dispersion of accessible guest rooms across room types/price tiers",
        "Accessible route from parking/drop-off to lobby to guest rooms to amenities (pool, fitness center, meeting space)",
        "Reservation system's ability to actually book a specific accessible room, not just a room type",
        "Pool/spa accessible means of entry (lift or sloped entry) where a pool is provided",
        "Front desk/check-in counter accessible height",
      ],
    },
    "medical-office": {
      label: "Medical Office / Healthcare",
      riskFactors: [
        "Accessible parking closer to the entrance than typical retail (frequently a higher-scrutiny area given the patient population)",
        "Exam room and equipment accessibility (exam tables, scales) -- a common gap even in otherwise-compliant buildings",
        "Waiting room accessible seating and route",
        "Restroom compliance, often held to particularly close scrutiny for this property type",
      ],
    },
    "office": {
      label: "Office (Multi-Tenant / Commercial)",
      riskFactors: [
        "Common-area accessible route from parking/public way to lobby to elevators to tenant suites",
        "Accessible entrance where the primary entrance itself isn't accessible",
        "Common-area restroom compliance",
        "Directory/signage height and format (visual + tactile) requirements",
      ],
    },
    "industrial": {
      label: "Industrial / Warehouse",
      riskFactors: [
        "Lower overall public-accommodation exposure than retail/hospitality, but any public-facing office, showroom, or will-call/pickup counter on the site is still fully covered",
        "Accessible parking and route to any public-facing entrance",
        "Restroom compliance in any public-facing area",
      ],
    },
    "multifamily-common-areas": {
      label: "Multifamily — Common Areas & Leasing Office",
      riskFactors: [
        "Leasing office/clubhouse accessible route, parking, and entrance -- the public-facing commercial component most exposed to Title III specifically",
        "Amenity spaces (fitness center, pool, mail/package room) accessible route and equipment",
        "Note: individual dwelling units are governed primarily by the Fair Housing Act's design/construction requirements, a related but separate body of law this tool doesn't cover.",
      ],
    },
  },
};
