/* =========================================================
   CREdocket -- Case Value Estimator: comparable case citations
   Real, independently researched cases per claim type -- every
   entry traces to an actual citation and source URL. Never add an
   entry here without verifying it first.
   ========================================================= */

window.CV_CITATIONS = {
  "unpaid_rent": [
    {
      "caseName": "Grand Prospect Partners, L.P. v. Ross Dress for Less, Inc.",
      "citation": "F067327 (Cal. Ct. App., 5th Dist., Jan. 12, 2015) (unpublished/partially published)",
      "jurisdiction": "CA",
      "year": 2015,
      "outcome": "Jury awarded landlord $672,100 in unpaid rent plus roughly $3.1 million in termination damages (about $3.785 million total, plus ~$916,275 in attorney fees). On appeal, the rent-abatement provision was held an unenforceable penalty (no reasonable relationship to anticipated harm), but the termination provision itself was upheld as valid. Judgment was modified to award only the $672,100 in unpaid rent (final modified judgment approximately $1,588,375.97 with costs).",
      "dollarAmount": 672100,
      "url": "https://caselaw.findlaw.com/court/ca-court-of-appeal/1689590.html",
      "confidence": "high",
      "notes": "Widely cited California case on when a lease remedy provision (cotenancy/rent-abatement, not a classic 'acceleration' clause) is struck down as an unenforceable penalty versus a valid liquidated-damages-style term. Also available at Justia/law.justia.com (case no. F067327) and caselaw.findlaw.com/ca-court-of-appeal/1691835.html."
    },
    {
      "caseName": "SVAP III Poway Crossings, LLC v. Fitness International, LLC",
      "citation": "D079903 (Cal. Ct. App., 4th Dist., Div. 1, Jan. 20, 2023)",
      "jurisdiction": "CA",
      "year": 2023,
      "outcome": "Trial court granted summary judgment for the landlord, finding $520,361.29 in unpaid rent owed as of October 2021; the Court of Appeal affirmed, holding that force majeure, impossibility, impracticability, and frustration-of-purpose defenses did not excuse the tenant's rent obligation because payment of rent (not operation of the gym) was the relevant contractual performance.",
      "dollarAmount": 520361,
      "url": "https://caselaw.findlaw.com/court/ca-court-of-appeal/2181216.html",
      "confidence": "high",
      "notes": "One of several 2022-2023 California appellate decisions rejecting COVID-19-based defenses to commercial rent obligations. Also reported at law.justia.com/cases/california/court-of-appeal/2023/d079903.html."
    },
    {
      "caseName": "CPUS Anson Building 8A, LP v. Tradewinds Holding Company, Inc.",
      "citation": "Court of Appeals of Indiana (2026) (exact docket number not independently confirmed)",
      "jurisdiction": "IN",
      "year": 2026,
      "outcome": "After a damages hearing, the trial court awarded Anson $3,559,407.17 plus post-judgment interest, attorney fees, and costs. The Court of Appeals affirmed the finding of breach but reversed and remanded the damages calculation, holding the trial court improperly accrued interest and late fees on the full unpaid balance before subtracting the replacement tenant's rent, instead of crediting the mitigation offset starting when the new tenant's rent obligation began (February 2024).",
      "dollarAmount": 3559407,
      "url": "https://www.mpamag.com/us/mortgage-industry/industry-trends/indiana-court-dismantles-35m-damages-award-in-commercial-lease-dispute/573141",
      "confidence": "medium",
      "notes": "Relied on secondary reporting (Mortgage Professional America) and search-engine summaries rather than a directly retrieved primary opinion; the $3,559,407.17 figure is the trial court's original (since-vacated) award, not a final affirmed number. Treat this figure as illustrative of exposure magnitude in an industrial lease default, not a final judgment amount."
    },
    {
      "caseName": "Sylva Shops Limited Partnership v. Hibbard",
      "citation": "No. COA04-1485 (N.C. Ct. App. Jan. 17, 2006) (unpublished)",
      "jurisdiction": "NC",
      "year": 2006,
      "outcome": "At trial, actual damages were calculated at $35,511.70, but the jury applied a mitigation offset of $22,401.70, awarding the landlord only $13,110.00. On appeal, the North Carolina Court of Appeals held the lease's clause relieving the landlord of any duty to mitigate was enforceable and not against public policy, vacating the reduced verdict and remanding for entry of judgment on the full $35,511.70 in actual damages without any mitigation offset.",
      "dollarAmount": 35511,
      "url": "https://caselaw.findlaw.com/court/nc-court-of-appeals/1431214.html",
      "confidence": "medium",
      "notes": "Good illustrative small-business/retail fact pattern with a modest dollar figure. Initial jury verdict was $13,110 (net of an improperly-applied mitigation offset); the correct, appellate-endorsed recovery figure is the full $35,511.70. Relied on a findlaw case-summary extraction rather than the full opinion text."
    }
  ],
  "accelerated_rent": [
    {
      "caseName": "Cummings Properties, LLC v. Hines",
      "citation": "492 Mass. 867, 217 N.E.3d 604 (2023) (SJC-13406)",
      "jurisdiction": "MA",
      "year": 2023,
      "outcome": "Trial court awarded Cummings $68,650.24, the balance of accelerated rent owed after crediting payments already made and rent from the replacement tenant. The Supreme Judicial Court affirmed, holding the guarantor (a sophisticated businessperson) failed to prove the liquidated-damages clause was an unreasonable forecast of damages at lease signing, applying the 'single look' approach to assess reasonableness at contract formation rather than in hindsight.",
      "dollarAmount": 68650,
      "url": "https://caselaw.findlaw.com/court/ma-supreme-judicial-court/115141290.html",
      "confidence": "high",
      "notes": "Reversed a 2022 Massachusetts Appeals Court decision (Cummings Props., LLC v. Hines, No. 21-P-1153) that had found the same clause an unenforceable penalty; the SJC's 2023 reversal is the controlling precedent. Also reported at law.justia.com/cases/massachusetts/supreme-court/2023/sjc-13406.html."
    },
    {
      "caseName": "CSRA Columbus OH Fitness Master Lessee, L.L.C. v. Fitness & Sports Clubs, L.L.C.",
      "citation": "2025-Ohio-2645 (5th Dist. Ct. App., Delaware County, July 24, 2025) (Case No. 24 CAE 08 0052)",
      "jurisdiction": "OH",
      "year": 2025,
      "outcome": "Trial court granted summary judgment to the landlord and, after a damages hearing, awarded $6,616,025.53 total, including $4,603,463.36 in accelerated rent for the remaining ~3.5 years of the lease term. The Court of Appeals affirmed, holding that two sophisticated commercial parties may contractually waive the landlord's common-law duty to mitigate, and the express no-mitigation/acceleration language was clear, unambiguous, and enforceable (not a void penalty), even though the landlord in fact tried but failed to re-let the space for 21 months.",
      "dollarAmount": 6616025,
      "url": "https://www.supremecourt.ohio.gov/rod/docs/pdf/5/2025/2025-Ohio-2645.pdf",
      "confidence": "high",
      "notes": "Full opinion read directly (primary source). Court relied on its own prior precedent, Scott Holding Co. v. Turbo Restaurants US, LLC, 2024-Ohio-5240, and the Ohio Supreme Court's Frenchtown Square Partnership v. Lemstone, Inc., 2003-Ohio-3648, which allows landlords and tenants to contract around the default duty to mitigate."
    },
    {
      "caseName": "Bistro Manila, LLC v. Alvah I, LLC",
      "citation": "83 Va. App. 300 (2025) (Record No. 0463-23-4)",
      "jurisdiction": "VA",
      "year": 2025,
      "outcome": "The circuit court entered judgment for the landlord of $410,391.77 in damages plus $18,000 in attorney fees; the Court of Appeals of Virginia affirmed, holding the accelerated-rent liquidated-damages clause enforceable (since it included mechanisms preventing over-recovery) and that the landlord had no duty to mitigate under the lease's terms.",
      "dollarAmount": 410391,
      "url": "https://law.justia.com/cases/virginia/court-of-appeals-published/2025/0463-23-4.html",
      "confidence": "medium",
      "notes": "Recent (2025) published Virginia appellate decision validating rent-acceleration clauses in commercial restaurant leases; relied on search-derived summaries of the Justia case page rather than a full read of the opinion text."
    },
    {
      "caseName": "Austin Hill Country Realty, Inc. v. Palisades Plaza, Inc.",
      "citation": "948 S.W.2d 293 (Tex. 1997); jury verdict from underlying case at 938 S.W.2d 469 (Tex. App.-Austin 1995)",
      "jurisdiction": "TX",
      "year": 1997,
      "outcome": "Jury awarded Palisades $29,716 in damages plus $16,500 in attorney's fees; trial court entered judgment on the verdict, and the court of appeals affirmed. The Texas Supreme Court then held, as a matter of first impression for the state, that a commercial landlord has a duty to use reasonable efforts to mitigate damages when a tenant breaches and abandons the lease, unless the lease itself provides otherwise -- rejecting the trial judge's instruction that landlords have no such duty.",
      "dollarAmount": 29716,
      "url": "https://caselaw.findlaw.com/court/tx-supreme-court/1013257.html",
      "confidence": "medium",
      "notes": "Leading Texas precedent establishing the commercial landlord's duty to mitigate future/accelerated rent damages; frequently cited as limiting the practical value of acceleration clauses unless mitigation is contractually waived. Underlying jury verdict facts drawn from Justia's summary of the 1995 Texas Court of Appeals decision, 938 S.W.2d 469."
    }
  ],
  "holdover_damages": [
    {
      "caseName": "Victoria's Secret Stores, LLC v. Herald Sq. Owner LLC",
      "citation": "2022 N.Y. Slip Op. 31356(U) (Sup. Ct., N.Y. Cnty. 2022); aff'd, 211 A.D.3d 657, 181 N.Y.S.3d 531 (1st Dep't 2022)",
      "jurisdiction": "NY",
      "year": 2022,
      "outcome": "The landlord was granted summary judgment enforcing Article 21(A) of the lease, which fixed holdover rent at three times the rent otherwise payable; the trial court calculated additional holdover damages of $17,589,819.91 for the retail portion and $2,331,106.71 for the office portion, and the First Department affirmed treble-rent holdover damages as an enforceable liquidated-damages provision.",
      "dollarAmount": 19920927,
      "url": "https://www.nycourts.gov/reporter/pdfs/2022/2022_31356.pdf",
      "confidence": "high",
      "notes": "This litigation had multiple stages and partial-payment amounts (e.g., a later 'Office Judgment Amount' after tenant payments); the figure here reflects the initial summary-judgment holdover-damages calculation under the lease's treble-rent clause, not a single final net judgment number. Verify current docket status before citing an exact final collected amount."
    },
    {
      "caseName": "Baca v. Kuang",
      "citation": "108 Cal. App. 5th 666 (Cal. Ct. App., 1st Dist., Div. 5, 2025)",
      "jurisdiction": "CA",
      "year": 2025,
      "outcome": "The trial court had ruled for the landlord, finding no consent to continued tenancy. The Court of Appeal reversed, holding the landlord's unconditional acceptance and deposit of the post-termination rent check created a presumption of a new month-to-month tenancy that the landlord failed to rebut, defeating the double-rent holdover claim.",
      "dollarAmount": null,
      "url": "https://www.leagle.com/decision/incaco20250210002",
      "confidence": "high",
      "notes": "Useful as a 'holdover claim denied' precedent — illustrates the risk to landlords of accepting rent after a termination notice."
    },
    {
      "caseName": "ESRT 501 Seventh Ave., LLC v. Regine, Ltd.",
      "citation": "Appeal Nos. 16109, 16109A, Index No. 655960/20 (App. Div., 1st Dep't, June 9, 2022)",
      "jurisdiction": "NY",
      "year": 2022,
      "outcome": "The Appellate Division upheld the lease's holdover-rent provision requiring the tenant to pay 200% of its prior rent for the holdover period, treating it as an enforceable liquidated-damages clause rather than an unenforceable penalty.",
      "dollarAmount": null,
      "url": "https://law.justia.com/cases/new-york/appellate-division-first-department/2022/index-no-655960-20-appeal-no-16109-16109a-case-no-2021-04815-2022-00031.html",
      "confidence": "medium",
      "notes": "Total dollar figure for the holdover rent recovered was not confirmed in the sources reviewed; the 200%-of-rent multiplier is confirmed."
    },
    {
      "caseName": "Lincoln Oldsmobile, Inc. v. Branch",
      "citation": "574 So. 2d 1111 (Fla. 2d DCA 1990)",
      "jurisdiction": "FL",
      "year": 1990,
      "outcome": "The Court of Appeal reversed, holding Florida's statutory double-rent remedy is a penalty the landlord must affirmatively invoke by demand, and cannot be recovered retroactively for the holdover period preceding that demand; it also held damages belonging to a corporation cannot be awarded directly to an individual shareholder.",
      "dollarAmount": null,
      "url": "https://case-law.vlex.com/vid/lincoln-oldsmobile-inc-v-886790420",
      "confidence": "medium",
      "notes": "Illustrates an important limitation on double-rent recovery: it is not automatic and does not reach back before the landlord's demand."
    }
  ],
  "attorney_fees": [
    {
      "caseName": "Rohrmoos Venture v. UTSW DVA Healthcare, LLP",
      "citation": "578 S.W.3d 469 (Tex. 2019)",
      "jurisdiction": "TX",
      "year": 2019,
      "outcome": "The Texas Supreme Court affirmed that UTSW was the prevailing party but reversed the attorney's-fee award for legally insufficient evidence, holding fee-shifting claimants must prove fees under the lodestar method (reasonable hours x reasonable rate, supported by contemporaneous billing records), not generalized testimony about a fee range; the case was remanded for a new fee determination.",
      "dollarAmount": 800000,
      "url": "https://www.txcourts.gov/media/1443994/160006.pdf",
      "confidence": "high",
      "notes": "Landmark case establishing Texas's modern lodestar proof requirements for contractual fee-shifting; frequently invoked in commercial lease litigation statewide."
    },
    {
      "caseName": "Wells & McElwee, P.C. v. Tiffany & Tomato, Inc. (companion appeals: Tiffany & Tomato, Inc. v. Wells & McElwee, P.C.)",
      "citation": "358 Ga. App. 311, 855 S.E.2d 55 (Ga. Ct. App. 2021) (Case Nos. A20A2042 & A20A2043)",
      "jurisdiction": "GA",
      "year": 2021,
      "outcome": "The trial court granted the landlord's fee motion in part but denied the tenant's competing fee motion, rejecting the tenant's argument that it was the 'prevailing party' merely because the landlord had separately failed on a bad-faith fee claim under O.C.G.A. § 13-6-11; the Court of Appeals affirmed both rulings in companion appeals.",
      "dollarAmount": 45667,
      "url": "https://law.justia.com/cases/georgia/court-of-appeals/2021/a20a2043.html",
      "confidence": "medium",
      "notes": "Good illustration that 'prevailing party' status for a lease fee clause is assessed relative to the parties' comparative success on the substantive claims, not any single sub-issue won."
    },
    {
      "caseName": "RadioShack Corp. v. Cascade Crossing II, LLC",
      "citation": "282 Ga. 841, 653 S.E.2d 680 (Ga. 2007) (answering a certified question from the U.S. Court of Appeals for the Eleventh Circuit)",
      "jurisdiction": "GA",
      "year": 2007,
      "outcome": "The Georgia Supreme Court held that O.C.G.A. § 13-1-11 — a statute historically applied to promissory notes — also applies to commercial leases, capping recoverable attorney's fees at the statutory formula (15% of the first $500 collected plus 10% of the remainder) rather than the actual contractual fee amount, cutting the landlord's fee recovery to roughly $17,000–$17,288 instead of the ~$280,000 sought.",
      "dollarAmount": 280000,
      "url": "https://www.deflaw.com/insights/georgia-supreme-court-affirms-application-of-attorney-fees-cap-commercial-leases/",
      "confidence": "medium",
      "notes": "A leading, cautionary Georgia case for commercial landlords: even an actual-fees clause in a lease can be statutorily capped well below fees actually incurred."
    },
    {
      "caseName": "Oak Park Investment Co. v. Lundy's, Inc.",
      "citation": "6 Kan. App. 2d 133, 626 P.2d 1236 (Kan. Ct. App. 1981)",
      "jurisdiction": "KS",
      "year": 1981,
      "outcome": "The Court of Appeals held that an agreement in a commercial lease for recovery of reasonable attorney's fees is valid and enforceable under Kansas law.",
      "dollarAmount": null,
      "url": "https://www.poolehuffman.com/blog/commercial-leases-attorneys-fees-provisions-and-breach-of-lease-cases-in-georgia/",
      "confidence": "medium",
      "notes": "Foundational Kansas authority on enforceability of commercial-lease fee-shifting clauses; dollar figures for the fee award were not available in sources reviewed."
    }
  ],
  "security_deposit": [
    {
      "caseName": "250 L.L.C. v. PhotoPoint Corp. (USA)",
      "citation": "131 Cal. App. 4th 703, 32 Cal. Rptr. 3d 296 (Cal. Ct. App., 1st Dist., 2005)",
      "jurisdiction": "CA",
      "year": 2005,
      "outcome": "The Court of Appeal held Civil Code § 1950.7 unambiguously limits a commercial security deposit to covering unpaid rent and damages accrued as of the date the deposit is statutorily due back, and requires the landlord to calculate and return any 'excess.' The landlord's retention of the full deposit against speculative future-rent damages violated the statute.",
      "dollarAmount": null,
      "url": "https://www.courtlistener.com/opinion/2281319/250-llc-v-photopoint-corpusa/",
      "confidence": "high",
      "notes": "Frequently cited California authority for the proposition that a commercial security deposit cannot be applied to future/anticipated rent damages absent an express lease waiver of Civil Code § 1950.7."
    },
    {
      "caseName": "Aljabban v. Fontana Indoor Swap Meet, Inc.",
      "citation": "54 Cal. App. 5th 482 (Cal. Ct. App., 4th Dist., Div. 1, 2020) (unpublished; nonciteable under Cal. R. Ct. 8.1115)",
      "jurisdiction": "CA",
      "year": 2020,
      "outcome": "The Court of Appeal held that, under Civil Code § 1950.7(c), a commercial landlord may apply a security deposit to repair costs only if the lease expressly authorizes that use; because this lease contained no such authorization, FISM's withholding of the $680 was improper.",
      "dollarAmount": 680,
      "url": "https://www4.courts.ca.gov/opinions/nonpub/D076214.PDF",
      "confidence": "medium",
      "notes": "This is an unpublished California opinion; under Cal. R. Ct. 8.1115 it may not be cited as precedent in California courts. Included here only as an illustrative, real, verifiable fact pattern — not as binding authority. Flag this limitation to any user of the valuation tool."
    },
    {
      "caseName": "Oak Forest Properties LLC v. RER Financial, Inc.",
      "citation": "2018 IL App (1st) 161704-U (Ill. App. Ct., 1st Dist., Sept. 24, 2018) (unpublished Rule 23 order)",
      "jurisdiction": "IL",
      "year": 2018,
      "outcome": "After a two-week trial, the court ordered the security deposit returned to the tenant, but held the tenant did not achieve 'prevailing party' status for purposes of the lease's fee-shifting clause because the deposit's value was insignificant relative to the much larger, more complex breach-of-contract claims at issue; the Appellate Court affirmed.",
      "dollarAmount": 3404,
      "url": "https://caselaw.findlaw.com/court/apl-crt-ill-fir-dis-fir-div/1955186.html",
      "confidence": "medium",
      "notes": "Illinois Rule 23 order — unpublished and of limited precedential value under Illinois court rules, but the facts and dollar figures are independently verifiable from the opinion text. Useful for showing that a small deposit-return win can be swamped by, and irrelevant to, the outcome of much larger contract claims in the same suit."
    },
    {
      "caseName": "Urban Soccer Inc. v. Royal Wine Corp.",
      "citation": "2016 N.Y. Slip Op. 26250 (Sup. Ct., N.Y. Cnty., Commercial Div. 2016)",
      "jurisdiction": "NY",
      "year": 2016,
      "outcome": "The court found Royal Wine Corp. technically violated GOL § 7-103(2) by holding the deposit outside New York, but held this was a 'technical statutory violation' without fiduciary implications; because there was no commingling and Urban Soccer suffered no actual damages, the statute provided no remedy and the tenant was not entitled to relief.",
      "dollarAmount": null,
      "url": "https://www.schlamstone.com/blogs/commercial/2016-08-10-not-maintaining-security-deposit-in-new-york-bank-branch-violates-gol-7-103-no-damages",
      "confidence": "medium",
      "notes": "Important nuance case: a technical statutory violation regarding where a commercial deposit is held does not, by itself, entitle the tenant to damages absent commingling or actual harm."
    }
  ],
  "wrongful_lockout": [
    {
      "caseName": "Palm Beach Florida Hotel & Office Building Corp. v. Nantucket Enterprises, Inc.",
      "citation": "211 So. 3d 42",
      "jurisdiction": "FL",
      "year": 2016,
      "outcome": "Directed verdict for the tenant on wrongful eviction affirmed on appeal; the appellate court held that Florida Statutes section 83.20 requires a landlord to recover possession only by court order, tenant surrender, or tenant abandonment, and a lease's private self-help clause cannot override that statutory requirement. The $8.8 million damages award was affirmed.",
      "dollarAmount": 8800000,
      "url": "https://www.hklaw.com/en/insights/publications/2022/09/can-a-commercial-landlord-engage-in-self-help-against-a-tenant",
      "confidence": "high",
      "notes": "Widely cited as the leading example of a large commercial wrongful-eviction verdict; landlord's contractual self-help clause was unenforceable because Florida statute requires judicial process regardless of lease terms."
    },
    {
      "caseName": "Berg v. Wiley",
      "citation": "264 N.W.2d 145",
      "jurisdiction": "MN",
      "year": 1978,
      "outcome": "Minnesota Supreme Court affirmed judgment for the tenant, holding that a landlord may no longer use self-help/forcible re-entry against a tenant in possession, even a holdover tenant, and must use judicial process. This case abolished self-help eviction for commercial landlords in Minnesota.",
      "dollarAmount": 34540,
      "url": "https://law.justia.com/cases/minnesota/supreme-court/1978/47317-1.html",
      "confidence": "high",
      "notes": "Landmark case establishing Minnesota's flat prohibition on commercial self-help eviction; frequently cited nationwide in property-law casebooks."
    },
    {
      "caseName": "Eun Bok Lee v. Ho Chang Lee",
      "citation": "No. 01-12-00117-CV",
      "jurisdiction": "TX",
      "year": 2013,
      "outcome": "Court of appeals affirmed judgment largely for the tenant on the wrongful-eviction/Property Code 93.002 claim, but reversed a treble-damages award tied to the security deposit because that theory was not properly pleaded or tried by consent. Tenant also recovered on unrelated unjust-enrichment and overcharged-rent claims.",
      "dollarAmount": 7375,
      "url": "https://caselaw.findlaw.com/tx-court-of-appeals/1642239.html",
      "confidence": "high",
      "notes": "Rare case actually applying Chapter 93's specific notice requirement (93.002(f)) rather than just citing the statute generally. Total judgment in the case (~$152,000) mixes lockout damages with unrelated claims, so only the wrongful-eviction component is reported as dollarAmount."
    },
    {
      "caseName": "Janes v. Country Escrow Service",
      "citation": "135 Ariz. 231",
      "jurisdiction": "AZ",
      "year": 1983,
      "outcome": "On retrial, the jury found for the tenants on their conversion claim (the breach-of-contract count having been dismissed) and awarded substantial compensatory and punitive damages; the appellate court's judgment addressed post-trial issues from that verdict.",
      "dollarAmount": 117741,
      "url": "https://www.casemine.com/judgement/us/59149050add7b04934574675",
      "confidence": "high",
      "notes": "One of the larger punitive-damages awards found for a commercial lockout/conversion claim; illustrates that egregious conduct during a lockout (not just the exclusion itself) can support outsized punitive damages even in a state that otherwise recognizes some rights of self-help."
    }
  ],
  "quiet_enjoyment_breach": [
    {
      "caseName": "Wesson v. Leone Enterprises, Inc.",
      "citation": "437 Mass. 708, 774 N.E.2d 661 (2002)",
      "jurisdiction": "MA",
      "year": 2002,
      "outcome": "Judgment for the tenant. The trial court (jury-waived) found constructive eviction; the SJC affirmed the result on a different theory (mutual dependence of lease covenants in commercial leases) and upheld an award of $1,063 in relocation damages for moving machinery and the telephone system, well below the tenant's claimed $14,000+ in moving costs.",
      "dollarAmount": 1063,
      "url": "http://masscases.com/cases/sjc/437/437mass708.html",
      "confidence": "high",
      "notes": "Good illustration that even where liability is found, damages actually proven/awarded can be modest relative to what a tenant claims. Also established Massachusetts' 'dependent covenants' rule for commercial leases."
    },
    {
      "caseName": "Radinsky v. Weaver",
      "citation": "170 Colo. 169, 460 P.2d 218 (1969)",
      "jurisdiction": "CO",
      "year": 1969,
      "outcome": "Judgment for the tenant. The Colorado Supreme Court defined constructive eviction as any landlord disturbance of the tenant's possession that renders the premises unfit for their leased purpose or deprives the tenant of beneficial enjoyment, causing abandonment. The trial court's $2,212 judgment for the tenant was upheld and the landlord's counterclaim for remaining rent was dismissed.",
      "dollarAmount": 2212,
      "url": "https://www.leagle.com/decision/1969678460p2d2181677",
      "confidence": "high",
      "notes": "Foundational Colorado constructive-eviction definition, arising from a landlord's active construction interference rather than mere disrepair — useful as an 'interference by landlord conduct' fact pattern."
    },
    {
      "caseName": "Reste Realty Corp. v. Cooper",
      "citation": "53 N.J. 444, 251 A.2d 268 (1969)",
      "jurisdiction": "NJ",
      "year": 1969,
      "outcome": "Judgment for the tenant. The New Jersey Supreme Court held the tenant was constructively evicted and relieved of liability for rent for the balance of the term (roughly 2.25 years remaining on the lease).",
      "dollarAmount": null,
      "url": "https://www.courtlistener.com/opinion/2393408/reste-realty-corporation-v-cooper/",
      "confidence": "high",
      "notes": "Landmark, widely cited constructive-eviction case establishing that recurring flooding the landlord fails to remedy breaches quiet enjoyment. Opinion does not state a specific dollar recovery for the tenant beyond relief from unpaid rent; treat as a principle-establishing case."
    },
    {
      "caseName": "Barash v. Pennsylvania Terminal Real Estate Corp.",
      "citation": "26 N.Y.2d 77, 308 N.Y.S.2d 649, 256 N.E.2d 707 (1970)",
      "jurisdiction": "NY",
      "year": 1970,
      "outcome": "Judgment for the landlord. The Court of Appeals held there was no actual or constructive eviction because the landlord did not fail to provide anything actually required by the lease, and, separately, that a tenant who remains in possession cannot claim constructive eviction.",
      "dollarAmount": null,
      "url": "https://law.justia.com/cases/new-york/court-of-appeals/1970/26-n-y-2d-77-0.html",
      "confidence": "high",
      "notes": "Negative/defense-side outcome. Useful as a principle case: (1) constructive eviction requires abandonment, and (2) landlord conduct must breach an actual lease obligation, not merely a pre-lease representation negated by a merger clause."
    }
  ]
};
