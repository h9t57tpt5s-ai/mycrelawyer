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
   filing counts (Seyfarth Shaw's ADA Title III tracker, published
   Feb 2026) -- real counts for the top 10 states plus the three
   states with zero filings; every other state's tier below is
   built from what's actually confirmed (no independently verified
   count), not a guess at a specific number.
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
  // remedy, and any pre-suit notice/cure mechanism. California is the
  // one verified in real depth (SB 1186 + Unruh Act) -- the others
  // noted are real but described in general terms since their exact
  // mechanics weren't independently verified to the same depth.
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
