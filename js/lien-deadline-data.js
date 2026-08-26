/* =========================================================
   CREdocket — Mechanic's/Construction Lien Deadline data
   -----------------------------------------------------------
   51-jurisdiction (50 states + DC) research on the three
   deadlines that matter most: preliminary notice, lien filing/
   recording, and lien enforcement/foreclosure. Commercial
   projects only.

   Sourced primarily from Siteline's 50-state mechanic's-lien
   table (cross-checked against a preliminary-notice-specific
   survey for exact day-counts) as of Aug 2026 -- construction-
   payment companies maintain this as their core product, so it's
   a well-maintained, frequently-updated resource, not a one-off
   blog post. This is still a SECONDARY compilation, not
   independently verified against primary statute text the way
   the Eviction Handbook's Texas/California chapters were --
   confirm against primary sources or local counsel before relying
   on any specific deadline.

   `days: null` + a `note` means the rule isn't a simple day-count
   from one trigger date (a "custom" rule -- monthly continuing
   notice, Nth-day-of-Nth-month, or a source inconsistency flagged
   for manual verification) -- shown as descriptive text instead of
   computed math, rather than force a wrong number into a clean
   calculator.

   trigger values: "firstFurnished" | "lastFurnished" | "completion" | "filing"
   ========================================================= */

const LIEN_DEADLINE_DATA = {
  meta: {
    title: "Mechanic's & Construction Lien Deadline Calculator",
    subtitle: "Preliminary notice, lien filing, and enforcement deadlines — commercial projects, all 51 jurisdictions.",
    asOf: "August 2026",
  },
  disclaimer: "This tool is provided for general informational purposes only and does not constitute legal advice. Lien deadlines are strict, jurisdiction-specific, fact-specific (claimant tier, project type, and county/parish-level filing rules can all change the analysis), and subject to legislative change -- missing one can permanently forfeit lien rights with no cure. This tool does not create an attorney-client relationship. Confirm any deadline against primary statutory sources or with local counsel before relying on it, especially for a deadline marked as a general rule rather than a computed date.",

  states: {
    "Alabama": { prelimNotice: { requiredFor: "sub-supplier (material suppliers only)", days: null }, noticeOfIntent: { required: true }, lienFiling: { days: 120, trigger: "lastFurnished" }, enforcement: { days: 180, trigger: "filing" }, citation: "Ala. Code §§ 35-11-210 to -234" },
    "Alaska": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 120, trigger: "completion" }, enforcement: { days: 180, trigger: "filing" }, citation: "Alaska Stat. §§ 34.35.050-.120" },
    "Arizona": { prelimNotice: { requiredFor: "sub-supplier", days: 20, triggerNote: "within 20 days of first furnishing" }, noticeOfIntent: { required: true }, lienFiling: { days: 120, trigger: "completion" }, enforcement: { days: 180, trigger: "filing" }, citation: "Ariz. Rev. Stat. §§ 33-981 to -1006" },
    "Arkansas": { prelimNotice: { requiredFor: "sub-supplier (material suppliers only)", days: null }, noticeOfIntent: { required: true }, lienFiling: { days: 120, trigger: "lastFurnished" }, enforcement: { days: 456, trigger: "filing" }, citation: "Ark. Code Ann. §§ 18-44-101 to -133" },
    "California": { prelimNotice: { requiredFor: "sub-supplier", days: 20, triggerNote: "within 20 days of first furnishing" }, noticeOfIntent: { required: true }, lienFiling: { days: 90, trigger: "completion" }, enforcement: { days: 90, trigger: "filing" }, citation: "Cal. Civ. Code §§ 8000-8848" },
    "Colorado": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: true }, lienFiling: { days: 120, trigger: "lastFurnished" }, enforcement: { days: 180, trigger: "filing" }, citation: "Colo. Rev. Stat. §§ 38-22-101 to -133" },
    "Connecticut": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Conn. Gen. Stat. §§ 49-33 to -40" },
    "Delaware": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 180, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Del. Code Ann. tit. 25, §§ 2701-2718" },
    "District of Columbia": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "completion" }, enforcement: { days: 180, trigger: "filing" }, citation: "D.C. Code §§ 40-301.01 to -303.16" },
    "Florida": { prelimNotice: { requiredFor: "sub-supplier", days: 45, triggerNote: "within 45 days of first furnishing (\"Notice to Owner\")" }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Fla. Stat. §§ 713.001-.37" },
    "Georgia": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "completion" }, enforcement: { days: 365, trigger: "filing" }, citation: "Ga. Code Ann. §§ 44-14-360 to -370" },
    "Hawaii": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 45, trigger: "completion" }, enforcement: { days: 90, trigger: "filing" }, citation: "Haw. Rev. Stat. §§ 507-41 to -48" },
    "Idaho": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 180, trigger: "filing" }, citation: "Idaho Code §§ 45-501 to -525" },
    "Illinois": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 120, trigger: "lastFurnished" }, enforcement: { days: 730, trigger: "filing" }, citation: "770 Ill. Comp. Stat. §§ 60/0.01-60/39" },
    "Indiana": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 60, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Ind. Code §§ 32-28-3-1 to -18" },
    "Iowa": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 730, trigger: "filing" }, citation: "Iowa Code §§ 572.1-.34" },
    "Kansas": { prelimNotice: { requiredFor: null, days: null, note: "No preliminary notice required on commercial/non-residential projects." }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished", note: "3 months (sub/supplier figure used; confirm GC deadline separately)." }, enforcement: { days: 365, trigger: "filing" }, citation: "Kan. Stat. Ann. §§ 60-1101 to -1110" },
    "Kentucky": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 180, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Ky. Rev. Stat. §§ 376.010-.550" },
    "Louisiana": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 60, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "La. Stat. Ann. §§ 9:4801-9:4864 (Private Works Act)" },
    "Maine": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished", note: "Sub/supplier figure." }, enforcement: { days: 120, trigger: "lastFurnished", note: "Enforcement suit deadline runs from last furnishing, not from lien filing, in Maine." }, citation: "Me. Rev. Stat. tit. 10, §§ 3251-3269" },
    "Maryland": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 180, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Md. Code Ann., Real Prop. §§ 9-101 to -114" },
    "Massachusetts": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: true }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 90, trigger: "filing" }, citation: "Mass. Gen. Laws ch. 254, §§ 1-33" },
    "Michigan": { prelimNotice: { requiredFor: "sub-supplier", days: 20, triggerNote: "within 20 days of first furnishing" }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Mich. Comp. Laws §§ 570.1101-.1305" },
    "Minnesota": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 120, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Minn. Stat. §§ 514.01-.17" },
    "Mississippi": { prelimNotice: { requiredFor: "sub-supplier (material suppliers only)", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "filing" }, citation: "Miss. Code Ann. §§ 85-7-131 to -197" },
    "Missouri": { prelimNotice: { requiredFor: "GC", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 180, trigger: "lastFurnished" }, enforcement: { days: 180, trigger: "filing" }, citation: "Mo. Rev. Stat. §§ 429.010-.360" },
    "Montana": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 730, trigger: "filing" }, citation: "Mont. Code Ann. §§ 71-3-521 to -556" },
    "Nebraska": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 120, trigger: "lastFurnished" }, enforcement: { days: 730, trigger: "filing" }, citation: "Neb. Rev. Stat. §§ 52-125 to -159" },
    "Nevada": { prelimNotice: { requiredFor: "sub-supplier", days: 31, triggerNote: "within 31 days of first furnishing" }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 30, trigger: "filing" }, citation: "Nev. Rev. Stat. §§ 108.221-.246" },
    "New Hampshire": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: null, trigger: "lastFurnished", note: "No separate lien-filing step -- the lien arises automatically by statute; the enforcement suit itself is the operative deadline." }, enforcement: { days: 120, trigger: "lastFurnished" }, citation: "N.H. Rev. Stat. Ann. §§ 447:1-:12-a" },
    "New Jersey": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 365, trigger: "lastFurnished" }, citation: "N.J. Stat. Ann. §§ 2A:44A-1 to -38" },
    "New Mexico": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "completion", note: "Sub/supplier figure." }, enforcement: { days: 730, trigger: "filing" }, citation: "N.M. Stat. Ann. §§ 48-2-1 to -16" },
    "New York": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 240, trigger: "lastFurnished", note: "8 months (private commercial projects)." }, enforcement: { days: 365, trigger: "filing" }, citation: "N.Y. Lien Law §§ 3-24" },
    "North Carolina": { prelimNotice: { requiredFor: "GC and sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 120, trigger: "lastFurnished", note: "Sub/supplier figure." }, enforcement: { days: 180, trigger: "lastFurnished" }, citation: "N.C. Gen. Stat. §§ 44A-7 to -23" },
    "North Dakota": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: true }, lienFiling: { days: 90, trigger: "completion" }, enforcement: { days: 1095, trigger: "filing" }, citation: "N.D. Cent. Code §§ 35-27-01 to -30" },
    "Ohio": { prelimNotice: { requiredFor: "sub-supplier", days: 21, triggerNote: "within 21 days of first furnishing" }, noticeOfIntent: { required: false }, lienFiling: { days: 75, trigger: "lastFurnished" }, enforcement: { days: 2190, trigger: "filing" }, citation: "Ohio Rev. Code §§ 1311.01-.32" },
    "Oklahoma": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished", note: "Sub/supplier figure." }, enforcement: { days: 365, trigger: "filing" }, citation: "Okla. Stat. tit. 42, §§ 141-176" },
    "Oregon": { prelimNotice: { requiredFor: "GC and sub-supplier", days: 8, triggerNote: "within 8 days of first furnishing (strictest in the country)" }, noticeOfIntent: { required: false }, lienFiling: { days: 75, trigger: "lastFurnished" }, enforcement: { days: 120, trigger: "filing" }, citation: "Or. Rev. Stat. §§ 87.001-.093" },
    "Pennsylvania": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: true }, lienFiling: { days: 180, trigger: "completion" }, enforcement: { days: 730, trigger: "filing" }, citation: "49 Pa. Stat. Ann. §§ 1101-1902" },
    "Rhode Island": { prelimNotice: { requiredFor: "GC", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: null, trigger: "lastFurnished", note: "Custom timing rule -- the source data on this state's exact lien-filing trigger was internally inconsistent; verify against primary statute or local counsel before relying on any specific day count." }, enforcement: { days: 40, trigger: "filing" }, citation: "R.I. Gen. Laws §§ 34-28-1 to -37" },
    "South Carolina": { prelimNotice: { requiredFor: "sub-supplier (suppliers only)", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "lastFurnished" }, enforcement: { days: 180, trigger: "lastFurnished" }, citation: "S.C. Code Ann. §§ 29-5-10 to -430" },
    "South Dakota": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 120, trigger: "lastFurnished" }, enforcement: { days: 2190, trigger: "filing" }, citation: "S.D. Codified Laws §§ 44-9-1 to -49" },
    "Tennessee": { prelimNotice: { requiredFor: "sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "completion", note: "Sub/supplier figure; GC deadline is 90 days after filing a separate notice of lien." }, enforcement: { days: 90, trigger: "filing", note: "GC enforcement runs 60 days after completion instead; this figure is the sub/supplier rule." }, citation: "Tenn. Code Ann. §§ 66-11-101 to -152" },
    "Texas": { prelimNotice: { requiredFor: "sub-supplier", days: null, note: "Continuing-notice state: monthly notices due by the 15th day of the 2nd month after each month labor/materials are furnished, plus a 3rd-month notice -- not a single fixed-day deadline." }, noticeOfIntent: { required: false }, lienFiling: { days: null, trigger: "lastFurnished", note: "By the 15th day of the 4th month after the month the contract was completed/terminated/abandoned (direct/prime contractors), or after the month labor/materials were last furnished (all other claimants)." }, enforcement: { days: 365, trigger: "filing" }, citation: "Tex. Prop. Code §§ 53.001-.260" },
    "Utah": { prelimNotice: { requiredFor: "GC and sub-supplier", days: 20, triggerNote: "within 20 days of first furnishing (filed in the State Construction Registry)" }, noticeOfIntent: { required: false }, lienFiling: { days: 180, trigger: "completion" }, enforcement: { days: 180, trigger: "filing" }, citation: "Utah Code Ann. §§ 38-1a-101 to -804" },
    "Vermont": { prelimNotice: { requiredFor: null, days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 180, trigger: "completion" }, enforcement: { days: 180, trigger: "filing" }, citation: "Vt. Stat. Ann. tit. 9, §§ 1921-1929" },
    "Virginia": { prelimNotice: { requiredFor: "GC and sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 100, trigger: "lastFurnished", note: "Sub/supplier figure." }, enforcement: { days: 180, trigger: "filing" }, citation: "Va. Code Ann. §§ 43-1 to -23.3" },
    "Washington": { prelimNotice: { requiredFor: "GC and sub-supplier", days: 60, triggerNote: "within 60 days of first furnishing" }, noticeOfIntent: { required: false }, lienFiling: { days: 90, trigger: "completion" }, enforcement: { days: 240, trigger: "filing" }, citation: "Wash. Rev. Code §§ 60.04.011-.902" },
    "West Virginia": { prelimNotice: { requiredFor: "GC and sub-supplier", days: null }, noticeOfIntent: { required: false }, lienFiling: { days: 100, trigger: "lastFurnished", note: "Sub/supplier figure." }, enforcement: { days: 180, trigger: "filing" }, citation: "W. Va. Code §§ 38-2-1 to -39" },
    "Wisconsin": { prelimNotice: { requiredFor: "GC and sub-supplier", days: null }, noticeOfIntent: { required: true }, lienFiling: { days: 180, trigger: "lastFurnished" }, enforcement: { days: 730, trigger: "filing" }, citation: "Wis. Stat. §§ 779.01-.11" },
    "Wyoming": { prelimNotice: { requiredFor: "GC and sub-supplier", days: null }, noticeOfIntent: { required: true }, lienFiling: { days: 120, trigger: "lastFurnished", note: "Sub/supplier figure." }, enforcement: { days: 180, trigger: "filing" }, citation: "Wyo. Stat. Ann. §§ 29-1-201 to 29-2-113" }
  }
};
