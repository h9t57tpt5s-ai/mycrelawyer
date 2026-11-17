/* =========================================================
   CREdocket — Premises Liability Checklist (Manager Edition) data
   -----------------------------------------------------------
   A plain-language, non-lawyer-facing checklist companion to
   the Premises Liability Guide, modeled on the ADA Risk
   Flagging tool's propertyTypes.riskFactors checklist format
   (js/ada-risk-data.js). The checklist items below are general,
   standard risk-management practice -- they do not state any
   new legal rule. The one interactive per-state element on this
   page reads directly from CASE_VALUATION_DATA.premisesLiability
   StateModifiers (case-valuation-data.js), which this file does
   not modify. Lockout and self-help rules are a commercial
   eviction topic and live in the Commercial Eviction Handbook,
   not here (Jeff, 2026-11-16).
   ========================================================= */

const PREMISES_CHECKLIST_DATA = {
  disclaimer: "This checklist is general risk-management guidance for on-site property management staff -- it is not legal advice, does not cover every fact pattern, and is not a substitute for your own company's incident-response policy or for consulting counsel about a specific incident. Premises liability rules vary by state -- always confirm current, binding law before acting, using the full state-by-state detail in the Premises Liability Guide linked throughout.",

  injuryChecklist: [
    "Get medical attention first. Call 911 if the injury is serious — nothing below matters if someone needs emergency care.",
    "Do not admit fault or speculate about the cause to the injured person, witnesses, or anyone else — including on social media or in a text to your regional manager. State only what you actually saw.",
    "Photograph and video the exact hazard and the surrounding area immediately, before anything is cleaned up, moved, repaired, or roped off.",
    "Identify every witness, including other on-site staff who were nearby, and get their contact information before they leave.",
    "Complete an internal incident report the same day, while details are fresh — record factual observations only (what you saw, when, where), not conclusions about who was at fault.",
    "Preserve, don't discard or repair, the physical hazard or object involved, along with any maintenance/inspection log entries for that area.",
    "Pull and preserve security-camera footage covering the incident and a reasonable period beforehand — don't let it auto-overwrite on its normal retention cycle.",
    "Notify the property owner (if you're a third-party manager) and your insurance carrier or broker promptly — many CGL policies condition coverage on prompt notice of a claim."
  ],
  injuryWhyItMatters: "Whether the owner/manager had notice of the hazard, and for how long, is frequently the single most outcome-determinative fact in a premises-liability case afterward. Several states also apply a \"mode of operation\" rule that can let a claimant skip proving notice of that specific hazard if the business's own operating model makes that type of hazard foreseeably recurring — see your state's quick reference below for whether that applies where you operate.",


  documentationChecklist: [
    "Incident report — factual, contemporaneous, completed the same day",
    "Photos and video of the condition, taken before anything was altered",
    "Security footage — place an immediate retention hold so it isn't auto-overwritten",
    "Maintenance and inspection logs for the area, both before and after the incident",
    "Witness names, contact information, and any statements taken",
    "Prior complaint or incident history for the same location or condition (relevant to notice, and to whether a \"mode of operation\" rule applies)",
    "Vendor/contractor contracts and certificates of insurance for whoever last worked in that area",
    "Correspondence with the property owner and your insurance carrier"
  ]
};
