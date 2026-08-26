/* =========================================================
   CREdocket — Lease Clause Redline Checker: market-standard
   reference library.
   -----------------------------------------------------------
   Six clause types, each broken into the specific negotiable
   elements a practitioner actually redlines, with what market/
   balanced language looks like versus a landlord-favorable or
   tenant-favorable version of the same term. This is the
   grounding the AI analysis is compared against -- shown
   alongside the AI's own read of the uploaded clause, not
   replaced by it.

   This reflects well-established commercial leasing drafting
   practice, not case law or statute -- unlike the citation-
   backed claim types elsewhere on this site, "market standard"
   here means common negotiated middle ground across institutional
   commercial leases generally, which itself varies by asset
   class, submarket, and relative negotiating leverage. Treat it
   as a starting reference point, not an appraisal.
   ========================================================= */

const LEASE_REDLINE_DATA = {
  disclaimer: "This tool compares an uploaded lease clause against general commercial-leasing market practice and flags terms that favor one side. It is not legal advice, does not review the clause for enforceability or drafting defects a court might find, and does not create an attorney-client relationship. \"Market standard\" reflects common negotiated middle ground across institutional commercial leases generally -- it varies by asset class, submarket, and relative negotiating leverage, and is not itself grounded in case law or statute the way other tools on this site are. Have any clause reviewed by qualified counsel before relying on it.",

  clauseTypes: {
    "assignment-subletting": {
      label: "Assignment & Subletting",
      keyTerms: [
        { id: "consentStandard", label: "Consent Standard", marketStandard: "Landlord's consent \"not to be unreasonably withheld, conditioned, or delayed.\"", landlordFavorable: "Consent in landlord's \"sole and absolute discretion,\" or the lease is silent on a standard (defaults to an unqualified consent right in most states).", tenantFavorable: "Consent deemed granted if landlord doesn't respond within a set window; a low bar like \"commercially reasonable\" rather than a full reasonableness standard." },
        { id: "recapture", label: "Landlord Recapture Right", marketStandard: "Landlord may recapture the space (terminate as to that portion) on a proposed assignment or a sublease of a substantial portion of the premises.", landlordFavorable: "Broad recapture right triggered even by a minor or short-term sublease.", tenantFavorable: "No recapture right, or recapture only on a full assignment of the entire premises." },
        { id: "profitSharing", label: "Assignment/Sublease Profit Sharing", marketStandard: "Landlord and tenant split any assignment/sublease profit (after tenant's reasonable transaction costs), commonly 50/50.", landlordFavorable: "100% of any profit goes to landlord.", tenantFavorable: "No profit-sharing obligation at all." },
        { id: "permittedTransfers", label: "Permitted-Transfer Carve-Outs", marketStandard: "Transfers to affiliates, in a merger/reorganization, or of publicly-traded stock are excluded from the consent requirement.", landlordFavorable: "No carve-outs -- every transfer, including to an affiliate, requires consent.", tenantFavorable: "Broad carve-outs that also cover a change of control of the tenant entity." },
        { id: "responseTime", label: "Landlord Response Time", marketStandard: "Landlord must respond within a set window (commonly 30 days); a specified consequence (often deemed consent) applies if it doesn't.", landlordFavorable: "No response deadline at all.", tenantFavorable: "A short deadline (10-15 days) with automatic deemed consent." },
      ],
    },
    "snda": {
      label: "SNDA (Subordination, Non-Disturbance & Attornment)",
      keyTerms: [
        { id: "ndaCondition", label: "Non-Disturbance as a Condition", marketStandard: "Tenant's subordination is conditioned on receiving a non-disturbance agreement from the lender.", landlordFavorable: "Tenant must subordinate automatically with no non-disturbance requirement at all.", tenantFavorable: "Tenant may refuse to subordinate unless specific NDA terms are pre-negotiated and attached as a lease exhibit." },
        { id: "successorObligations", label: "Successor Landlord's Obligations", marketStandard: "A successor landlord (the lender, post-foreclosure) is bound by the lease going forward, but not liable for the prior landlord's defaults or for rent tenant prepaid to the prior landlord.", landlordFavorable: "Successor has no ongoing obligations at all -- not even routine repair/services obligations.", tenantFavorable: "Successor is bound by all lease terms including the prior landlord's pre-existing defaults." },
        { id: "leaseContinuation", label: "Lease Continuation vs. New Lease", marketStandard: "The existing lease continues in force on foreclosure per the NDA's terms.", landlordFavorable: "Lender can require tenant to sign an entirely new lease post-foreclosure, potentially on worse terms.", tenantFavorable: "Same as market -- continuation is the tenant-protective outcome here; a new-lease requirement is the point to flag as unfavorable regardless of which side you represent." },
        { id: "turnaroundTime", label: "SNDA Execution Turnaround", marketStandard: "Tenant must execute and return a requested SNDA within a set window, commonly 10 business days.", landlordFavorable: "No deadline at all, or an unreasonably short one paired with a harsh default consequence.", tenantFavorable: "A longer window with no default consequence for a good-faith delay." },
      ],
    },
    "casualty-condemnation": {
      label: "Casualty & Condemnation",
      keyTerms: [
        { id: "terminationRight", label: "Termination Right on Partial Casualty", marketStandard: "Either party may terminate if restoration would take longer than a set period (often 180-270 days) or affects a set percentage of the premises/remaining term.", landlordFavorable: "Only landlord has a termination right; tenant is bound to remain regardless of restoration time.", tenantFavorable: "Tenant also gets abatement AND an independent termination right if restoration exceeds the threshold." },
        { id: "rentAbatement", label: "Rent Abatement During Restoration", marketStandard: "Rent abates proportionally to the unusable portion of the premises during restoration.", landlordFavorable: "No abatement, or abatement only after an initial grace period landlord doesn't have to cover.", tenantFavorable: "Full abatement of all rent regardless of what percentage of the premises is actually unusable." },
        { id: "condemnationAward", label: "Condemnation Award Allocation", marketStandard: "Landlord takes the award for the real property/leasehold reversion; tenant may separately pursue its own claim against the condemning authority for trade fixtures and business/moving costs, without reducing landlord's award.", landlordFavorable: "Lease purports to assign tenant's entire condemnation claim to landlord, including fixture and business-loss components a tenant may have an independent statutory right to pursue directly (see the Eminent Domain category's business-goodwill research elsewhere on this site for how that right varies by state).", tenantFavorable: "Tenant retains an express, unqualified right to pursue its own claim for every category of compensable loss." },
        { id: "temporaryTaking", label: "Temporary Taking", marketStandard: "Lease continues in force; rent abates for the period the premises are unusable.", landlordFavorable: "A temporary taking triggers landlord's full termination right, same as a permanent one.", tenantFavorable: "Same as market -- continuation with abatement is the tenant-protective outcome; a broad landlord termination right on a merely temporary taking is the point to flag." },
      ],
    },
    "co-tenancy-exclusive-use": {
      label: "Co-Tenancy & Exclusive Use",
      keyTerms: [
        { id: "openingCoTenancy", label: "Opening Co-Tenancy", marketStandard: "Rent commencement (or an equivalent abatement) is conditioned on a specified anchor/percentage of GLA being open at lease commencement.", landlordFavorable: "No opening co-tenancy provision, or a trigger threshold set so high it's effectively unreachable.", tenantFavorable: "A low, easily-satisfied threshold with broad remedies for any shortfall." },
        { id: "ongoingCoTenancy", label: "Ongoing Co-Tenancy Remedy", marketStandard: "If the anchor/threshold later closes, tenant gets reduced (alternate) rent during the failure period, with a termination right if the failure persists beyond a cure period (often 12-18 months).", landlordFavorable: "Alternate rent only, with no termination right ever available to tenant.", tenantFavorable: "An immediate termination right with no cure period at all." },
        { id: "exclusiveUseScope", label: "Exclusive Use Scope", marketStandard: "A narrowly and specifically defined exclusive use (e.g., a defined use/size threshold), with carve-outs for existing tenants and anchor stores.", landlordFavorable: "The exclusive is vague or narrow, or subject to broad landlord discretion to waive it for a later tenant.", tenantFavorable: "A broad exclusive with no carve-outs and a strict landlord enforcement obligation, including an injunctive remedy." },
      ],
    },
    "cam-audit-rights": {
      label: "CAM Reconciliation & Audit Rights",
      keyTerms: [
        { id: "auditRight", label: "Tenant's Audit Right", marketStandard: "Tenant may audit landlord's CAM books within a set window (often 90-180 days) after the annual reconciliation statement, at tenant's cost unless the audit reveals an overcharge above a threshold (often 3-5%), in which case landlord pays the audit cost.", landlordFavorable: "No audit right at all, or an unreasonably short window that expires before tenant could reasonably review the statement.", tenantFavorable: "An open-ended or unlimited audit right, with landlord always bearing the audit cost regardless of the result." },
        { id: "camCap", label: "Controllable-CAM Cap", marketStandard: "Controllable CAM expenses are capped at a compounding annual increase (commonly 5-7%); taxes, insurance, and utilities are typically excluded from the cap.", landlordFavorable: "No cap on CAM increases at all.", tenantFavorable: "A cap that applies to every CAM component, including taxes, insurance, and utilities." },
        { id: "grossUp", label: "Gross-Up Provision", marketStandard: "Landlord may \"gross up\" variable/occupancy-sensitive expenses to a fully-occupied level (commonly 95%) when the building is less than fully occupied, so tenant doesn't absorb a disproportionate share caused by vacancy.", landlordFavorable: "Gross-up applies to fixed as well as variable costs, effectively over-recovering from tenants.", tenantFavorable: "No gross-up provision at all -- can actually cost tenants more in a mostly-vacant building than a well-drafted gross-up would." },
        { id: "camExclusions", label: "CAM Definition & Exclusions", marketStandard: "CAM excludes capital expenditures (or includes only amortized capital improvements meeting a specific test), leasing commissions, marketing costs, and landlord's general corporate overhead.", landlordFavorable: "A broad, vague CAM definition that sweeps in capital costs and overhead without a specific exclusions list.", tenantFavorable: "A narrow CAM definition with a detailed, itemized exclusions list." },
      ],
    },
    "estoppel-certificates": {
      label: "Estoppel Certificates",
      keyTerms: [
        { id: "turnaroundTime", label: "Delivery Turnaround", marketStandard: "Tenant must deliver a requested estoppel within 10-20 business days of landlord's request.", landlordFavorable: "A short window (5 days or less) paired with a harsh deemed-accurate-if-silent consequence.", tenantFavorable: "A longer window (30+ days) with no penalty for a reasonable delay." },
        { id: "certificationScope", label: "Scope of Certification", marketStandard: "Tenant certifies factual matters only (lease in effect, no known defaults, rent paid through a specific date), with an express right to note exceptions.", landlordFavorable: "Tenant must certify broad legal conclusions (e.g., that landlord has \"fully performed all obligations\") without qualification.", tenantFavorable: "A narrow, factual-only certification with an express, unqualified right to attach exceptions." },
        { id: "nonWaiver", label: "Non-Waiver / Non-Modification", marketStandard: "The estoppel is expressly for the benefit of a named lender or purchaser and does not itself modify the underlying lease.", landlordFavorable: "Broad language that could be read as amending the lease or waiving claims tenant hasn't yet asserted.", tenantFavorable: "Express non-waiver and non-modification language is included." },
        { id: "frequency", label: "Request Frequency", marketStandard: "Landlord may request an estoppel no more than once or twice per year absent an actual financing or sale event.", landlordFavorable: "Unlimited requests at landlord's discretion.", tenantFavorable: "Strictly capped at once per year." },
      ],
    },
  },
};
