/* =========================================================
   CREdocket — Insurance & Risk Posture Guide data
   -----------------------------------------------------------
   General CGL/umbrella coverage-buying guidance, plus a
   translation layer that converts fields already in
   CASE_VALUATION_DATA.premisesLiabilityStateModifiers (case-
   valuation-data.js, untouched by this file) into insurance-
   buying implications. No new legal claim, statute, or case
   fact is introduced here -- every state-specific sentence in
   the rendered panel traces back to a field already in that
   table. The property-type limit ranges and additional-insured/
   waiver-of-subrogation guidance below are general commercial-
   insurance industry practice, not tied to any specific carrier,
   quote, or jurisdiction -- confirm actual placement with a
   licensed broker.
   ========================================================= */

const INSURANCE_RISK_POSTURE_DATA = {
  disclaimer: "This guide translates general premises-liability legal exposure into general insurance-buying considerations for orientation purposes only. It is not insurance advice, a coverage recommendation, or legal advice, and it does not describe any specific policy, carrier, or quote. Actual coverage needs depend on your property's specific facts, your carrier's policy language, and your state's current law -- confirm placement and limits with a licensed insurance broker and coverage counsel before making any decision.",

  buildingBlocks: [
    {
      title: "Commercial General Liability (CGL)",
      body: "The primary layer that responds first to a bodily-injury or property-damage claim arising from a hazardous condition or an incident on the premises -- the exact fact pattern the Premises Liability Guide's elements-to-prove and notice-rule sections address. Most commercial policies are written with per-occurrence and aggregate limits, meaning a single severe claim, or several smaller ones in the same policy period, can exhaust the layer."
    },
    {
      title: "Umbrella / Excess Liability",
      body: "Sits above CGL (and typically auto and employers'-liability) and is usually the layer that actually pays a large verdict -- a serious slip-and-fall or a negligent-security judgment routinely exceeds a $1M/$2M primary CGL limit. How much umbrella to carry is a function of foot traffic, crime exposure, and the state's own punitive-damages and fault rules, not a fixed number across property types."
    },
    {
      title: "Additional Insured Status",
      body: "Being named as an additional insured on someone else's policy — a tenant's, a contractor's, a security vendor's — means their carrier defends and indemnifies you directly for claims arising out of their work or occupancy, instead of you relying solely on your own policy and a separate indemnification promise that may be worth only as much as their solvency."
    },
    {
      title: "Waiver of Subrogation",
      body: "A provision (in the policy and mirrored in the lease/contract) preventing an insurer that pays a claim from then suing the other contracting party to recover what it paid. Without it, a landlord's own insurer can turn around and sue a tenant (or vice versa) after paying a claim that the lease intended each party to absorb through its own coverage."
    }
  ],

  propertyTypeLimits: [
    {
      key: "retail",
      label: "Retail / Shopping Center",
      typical: "Commonly $1M per occurrence / $2M general aggregate primary CGL, with $5M–$25M+ umbrella depending on center size, anchor tenants, and parking-lot/common-area exposure.",
      why: "High foot traffic and shared common areas (parking lots, walkways) are where slip-and-fall and, in some markets, negligent-security claims concentrate."
    },
    {
      key: "office",
      label: "Office (Multi-Tenant)",
      typical: "Commonly $1M/$2M primary CGL with $5M–$10M umbrella for a typical mid-rise; larger or trophy assets often carry more.",
      why: "Lower public foot-traffic exposure than retail or hospitality, but common-area maintenance, elevators, and after-hours access/security control the real risk profile."
    },
    {
      key: "industrial",
      label: "Industrial / Warehouse",
      typical: "Commonly $1M/$2M primary CGL with umbrella scaled to any public-facing component (will-call counters, showrooms) rather than the warehouse floor itself.",
      why: "Lowest public-invitee exposure of the major property types, but any public-facing office or pickup counter on the site is still fully exposed the way a retail counter would be."
    },
    {
      key: "multifamily",
      label: "Multifamily / Apartments",
      typical: "Commonly $1M/$2M primary CGL per building or blanket, with umbrella often in the $10M–$25M+ range for larger portfolios, reflecting both premises-liability and habitability-adjacent exposure.",
      why: "Combines high foot traffic, overnight occupancy, and (per the leasing-office/clubhouse note in the ADA Risk Flagging tool) public-facing common areas — plus the negligent-security fact pattern the Premises Liability Guide treats as frequently the single most outcome-determinative issue in a crime-on-premises claim."
    },
    {
      key: "hospitality",
      label: "Hotel / Hospitality",
      typical: "Commonly $1M/$2M primary CGL with $10M–$25M+ umbrella, often layered with liquor liability where applicable.",
      why: "24-hour public access, overnight guests, pools/amenities, and third-party vendor activity (valet, food and beverage) all add distinct sources of premises exposure beyond ordinary retail or office risk."
    }
  ],

  requireFromTenantsAndContractors: [
    "Additional insured status on the tenant's or contractor's own CGL policy — commonly requested via an ISO-style \"managers or lessors of premises\" or \"designated person or organization\" endorsement, or, for contractors, an ongoing- and completed-operations additional-insured endorsement — not just a certificate of insurance naming you as certificate holder, which by itself grants no actual coverage rights.",
    "\"Primary and noncontributory\" wording, so the tenant's or contractor's policy responds first, ahead of (not alongside) your own CGL.",
    "A waiver of subrogation in both the lease/contract and the endorsing policy, so their insurer can't recover from you after paying a claim.",
    "Minimum CGL limits appropriate to the space and use (a restaurant tenant or a security/maintenance contractor typically warrants higher minimums than a low-traffic office tenant), confirmed against your own umbrella structure, not assumed.",
    "A live certificate-of-insurance tracking process — an endorsement that lapses when a tenant's or contractor's policy renews without your team catching it is a common, avoidable gap."
  ]
};
