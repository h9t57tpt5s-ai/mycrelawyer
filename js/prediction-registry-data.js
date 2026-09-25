/* =========================================================
   CREdocket — Case Value Calculator: prediction registry
   -----------------------------------------------------------
   A real, falsifiable track record: the calculator's actual output
   run against a real, currently-pending tracked matter, timestamped
   BEFORE the outcome is known, checked against the real outcome once
   the matter resolves. This is deliberately NOT the same thing as the
   "worked examples" page (case-valuation-worked-examples.html), which
   walks through the methodology on cases whose outcome was already
   known when it was written -- that's a methodology demonstration,
   this is a prediction.

   Why this lives in a git-committed data file instead of a database
   table: a prediction's evidentiary value depends entirely on being
   provably dated BEFORE the outcome existed. A git commit timestamp on
   a public repo is a simpler, more transparently auditable dated
   record for this specific purpose than a database row -- anyone can
   check the commit history themselves rather than trusting our word
   for when a row was inserted. No database schema, migration, or
   automation was needed to start this.

   How an entry gets added (this requires a signed-in session running
   a REAL analysis -- see case-valuation.html; there's no way to
   populate this data honestly from outside the actual tool):
   1. Pick a real, currently PENDING tracked matter from js/data.js
      with status "pending" and clear enough public facts to describe
      to the calculator (see RELAW_DATA.cases -- filter for
      status === "pending" with a real dollar figure in `amount`).
   2. Run it through case-valuation.html for real, signed in, using
      only the matter's own public facts (from its tracker entry/
      source article) -- never anything non-public.
   3. Record the result's category, side, damages range, best-guess
      value, and probability-weighted claims EXACTLY as the tool
      produced them, plus the date this was run -- add a new object to
      PREDICTION_REGISTRY below.
   4. Commit and push immediately, so the timestamp is real and can't
      be second-guessed later. Never edit a `predictedAt` entry after
      the fact.
   5. When the underlying matter actually resolves (check its tracker
      entry / source reporting periodically), add `actualOutcome`,
      `resolvedAt`, and a plain, honest `analysis` of how the
      prediction compared -- whether it fell inside the range, above
      it, below it, or the claim never resolved in a way the range
      anticipated. Do not editorialize the miss away.

   Schema per entry:
   {
     caseId: "live-NNN",              // matches RELAW_DATA.cases[].id, for cross-linking
     caseTitle: "...",                // as tracked
     predictedAt: "YYYY-MM-DD",       // the date this was run -- never backdated
     category: "...",
     side: "Landlord" | "Tenant" | etc,
     predictedRange: [low, high],
     predictedBestGuess: number | null,
     claims: [ { label, probabilityRange: [lo,hi], damagesRange: [lo,hi] | null } ],
     status: "pending" | "resolved",
     actualOutcome: null | { date: "YYYY-MM-DD", summary: "...", amount: number | null, sourceUrl: "..." },
     resolvedAt: null | "YYYY-MM-DD",
     analysis: null | "plain, honest comparison of predicted vs. actual"
   }
   ========================================================= */

const PREDICTION_REGISTRY = [
  {
    "registryId": "ct-realty-capital-v-eastport-ii-2025",
    "caseId": null,
    "caseTitle": "Realty Capital Partners I, LLC v. Eastport II, LLC, et al.",
    "court": "Connecticut Superior Court, Judicial District of New London (transferred to Complex Litigation, Hartford)",
    "docket": "X03-HHD-CV25-6224529-S",
    "filings": [
      {
        "side": "plaintiff",
        "label": "Foreclosure complaint (Dec. 5, 2025)",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=31596436"
      },
      {
        "side": "defendant",
        "label": "Answer, special defenses and counterclaim (Apr. 20, 2026)",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=32475313"
      },
      {
        "side": "defendant",
        "label": "Objection to appointment of receiver",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=32895987"
      }
    ],
    "predictedAt": "2026-09-23",
    "category": "lending-foreclosure",
    "side": "Lender",
    "predictedRange": [
      9570000,
      15460000
    ],
    "predictedBestGuess": 12200000,
    "whatIsNeededForEstimate": null,
    "likelyOutcome": "RCP1 should ultimately obtain a judgment of strict foreclosure on both parcels \u2014 maturity on January 1, 2026 makes default essentially unavoidable and the mortgages are admitted \u2014 but the defendants' allegation that the plaintiff is controlled by a co-borrower's principal who bought the note weeks after being sued by his sister is a genuine equitable defense that could defeat, delay, or recharacterize the claim as one for contribution. Net recovery is further capped because only two of seven-plus portfolio properties are being foreclosed and no appraisal evidence exists, so any deficiency is presently unquantifiable.",
    "claims": [
      {
        "label": "Foreclosure Judgment on Hatchett Hills and Kingsbridge (Counts One and Two)",
        "probabilityRange": [
          0.55,
          0.8
        ],
        "damagesRange": [
          17400000,
          19325000
        ]
      },
      {
        "label": "Insider Note Purchase / Unclean Hands / Co-Obligor Satisfaction Defense",
        "probabilityRange": [
          0.55,
          0.8
        ],
        "damagesRange": null
      },
      {
        "label": "Deficiency Judgment Exposure / Recovery Shortfall",
        "probabilityRange": [
          0.35,
          0.65
        ],
        "damagesRange": null
      },
      {
        "label": "Appointment of Receiver of Rents",
        "probabilityRange": [
          0.6,
          0.85
        ],
        "damagesRange": null
      },
      {
        "label": "Proof of Holder Status and Standing",
        "probabilityRange": [
          0.75,
          0.92
        ],
        "damagesRange": null
      },
      {
        "label": "Contractual Attorney's Fees and Costs of Collection",
        "probabilityRange": [
          0.6,
          0.85
        ],
        "damagesRange": null
      },
      {
        "label": "Default Against Non-Answering Defendants (Eastport II and Ferndale)",
        "probabilityRange": [
          0.5,
          0.8
        ],
        "damagesRange": null
      },
      {
        "label": "Pleading Defects and Scrivener's Errors",
        "probabilityRange": [
          0.8,
          0.95
        ],
        "damagesRange": null
      }
    ],
    "status": "pending",
    "actualOutcome": null,
    "resolvedAt": null,
    "analysis": null
  },
  {
    "registryId": "ct-bcb-community-bank-v-30-oak-2025",
    "caseId": null,
    "caseTitle": "BCB Community Bank v. 30 Oak LLC, Peter J. Somma, Jr., et al.",
    "court": "Connecticut Superior Court, Judicial District of Stamford-Norwalk (Complex Litigation)",
    "docket": "X08-FST-CV25-6076444-S",
    "filings": [
      {
        "side": "plaintiff",
        "label": "Foreclosure complaint (Sept. 24, 2025)",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=31065136"
      },
      {
        "side": "defendant",
        "label": "Answer, special defenses and counterclaim",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=31201443"
      }
    ],
    "predictedAt": "2026-09-23",
    "category": "lending-foreclosure",
    "side": "Lender",
    "predictedRange": [
      2640000,
      3404000
    ],
    "predictedBestGuess": 3050000,
    "whatIsNeededForEstimate": null,
    "likelyOutcome": "BCB should obtain a judgment of foreclosure on an essentially undefended payment default; the special defenses are legally misdirected and factually conclusory, and the counterclaim is far more likely to generate delay and discovery cost than recovery. The realistic fight is over the judgment-of-debt amount (roughly $3.3M\u2013$3.7M, not the $4.5M facility maximum) and over whether the Stamford office condominium's value leaves a deficiency that is actually collectible from a guarantor whose identity and solvency the record does not establish.",
    "claims": [
      {
        "label": "Foreclosure of Mortgage / Judgment of Debt",
        "probabilityRange": [
          0.8,
          0.92
        ],
        "damagesRange": [
          3300000,
          3700000
        ]
      },
      {
        "label": "Attornment / Leasehold Survival Special Defense",
        "probabilityRange": [
          0.78,
          0.92
        ],
        "damagesRange": null
      },
      {
        "label": "Bad Faith / Collusive-Foreclosure Defense (Unclean Hands)",
        "probabilityRange": [
          0.7,
          0.9
        ],
        "damagesRange": null
      },
      {
        "label": "Borrower-Side Counterclaim (Survived Motion to Dismiss)",
        "probabilityRange": [
          0.6,
          0.88
        ],
        "damagesRange": null
      },
      {
        "label": "Deficiency Judgment and Guaranty Collectibility",
        "probabilityRange": [
          0.35,
          0.8
        ],
        "damagesRange": null
      },
      {
        "label": "Material Adverse Change (Non-Monetary) Default",
        "probabilityRange": [
          0.6,
          0.8
        ],
        "damagesRange": null
      },
      {
        "label": "Assignment of Rents / Receivership Entitlement",
        "probabilityRange": [
          0.72,
          0.9
        ],
        "damagesRange": null
      },
      {
        "label": "Standing of Tenant-Defendant to Raise Borrower Defenses",
        "probabilityRange": [
          0.45,
          0.8
        ],
        "damagesRange": null
      }
    ],
    "status": "pending",
    "actualOutcome": null,
    "resolvedAt": null,
    "analysis": null
  },
  {
    "registryId": "ct-td-bank-v-sgs-330-main-2025",
    "caseId": null,
    "caseTitle": "TD Bank, N.A. v. SGS 330 Main, LLC and Bernard S. Bertram",
    "court": "Connecticut Superior Court, Judicial District of Hartford",
    "docket": "HHD-CV25-6213744-S",
    "filings": [
      {
        "side": "plaintiff",
        "label": "Commercial foreclosure complaint (Oct. 1, 2025)",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=31115745"
      },
      {
        "side": "defendant",
        "label": "Answer (Dec. 2, 2025)",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=31477643"
      }
    ],
    "predictedAt": "2026-09-23",
    "category": "lending-foreclosure",
    "side": "Lender",
    "predictedRange": [
      1764000,
      2409000
    ],
    "predictedBestGuess": 2075000,
    "whatIsNeededForEstimate": null,
    "likelyOutcome": "The lender obtains judgment of foreclosure and a debt finding in the low-$2M range \u2014 liability is already decided, the borrower admitted the Note, Mortgage, Guaranty and non-payment at maturity, and pleaded no special defenses. The only live fights are proving the exact payoff components (amortized principal, post-maturity/default interest, late charges, advances), producing the original Note and Guaranty, and then timely perfecting a deficiency motion within 30 days of the law day with a supporting appraisal.",
    "claims": [
      {
        "label": "Judgment of Foreclosure and Debt Found",
        "probabilityRange": [
          0.92,
          0.98
        ],
        "damagesRange": [
          1900000,
          2400000
        ]
      },
      {
        "label": "Attorney's Fees and Costs",
        "probabilityRange": [
          0.8,
          0.95
        ],
        "damagesRange": [
          20000,
          60000
        ]
      },
      {
        "label": "Breach of Guaranty (Bertram)",
        "probabilityRange": [
          0.85,
          0.95
        ],
        "damagesRange": null
      },
      {
        "label": "Original Note and Guaranty Production",
        "probabilityRange": [
          0.85,
          0.95
        ],
        "damagesRange": null
      },
      {
        "label": "Deficiency Judgment Procedure and Valuation",
        "probabilityRange": [
          0.45,
          0.8
        ],
        "damagesRange": null
      },
      {
        "label": "Prior Municipal Tax Liens Eroding Collateral Value",
        "probabilityRange": null,
        "damagesRange": null
      },
      {
        "label": "Receiver of Rents",
        "probabilityRange": [
          0.7,
          0.9
        ],
        "damagesRange": null
      },
      {
        "label": "Absence of Borrower Counterclaims or Lender-Liability Defenses",
        "probabilityRange": [
          0.8,
          0.93
        ],
        "damagesRange": null
      }
    ],
    "status": "pending",
    "actualOutcome": null,
    "resolvedAt": null,
    "analysis": null
  },
  {
    "registryId": "ct-wilmington-trust-v-67-holly-hill-2026",
    "caseId": null,
    "caseTitle": "Wilmington Trust, N.A., as Trustee (WFCM 2015-LC22) v. 67 Holly Hill LLC and Sohrab Sy Aryeh",
    "court": "Connecticut Superior Court, Judicial District of Stamford",
    "docket": "FST-CV26-6081649-S",
    "filings": [
      {
        "side": "plaintiff",
        "label": "Foreclosure complaint (May 21, 2026)",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=32891872"
      },
      {
        "side": "defendant",
        "label": "Answer and special defenses (Sept. 4, 2026)",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=33491101"
      }
    ],
    "predictedAt": "2026-09-23",
    "model": "claude-sonnet-5",
    "category": "lending-foreclosure",
    "side": "Lender",
    "predictedRange": [
      4718500,
      5781250
    ],
    "predictedBestGuess": 5350000,
    "whatIsNeededForEstimate": null,
    "likelyOutcome": "The lender is very likely to obtain a judgment of foreclosure and to enforce the guaranty against Mr. Aryeh, given the fully documented note/mortgage/assignment chain and an answer that largely fails to substantively controvert the maturity default; the principal open variables are (1) whether the payment-acceptance defense trims the default-interest period or complicates the default date, and (2) whether the guaranty's actual recourse-carve-out language limits the guarantor's exposure below the full loan balance.",
    "claims": [
      {
        "label": "Core Debt Recovery (Foreclosure Judgment / Deficiency, Principal + Accrued/Default Interest)",
        "probabilityRange": [
          0.88,
          0.96
        ],
        "damagesRange": [
          5350000,
          6000000
        ]
      },
      {
        "label": "Standing / Holder-in-Due-Course Challenge",
        "probabilityRange": [
          0.82,
          0.94
        ],
        "damagesRange": null
      },
      {
        "label": "Payment-Acceptance / Waiver of Default",
        "probabilityRange": [
          0.55,
          0.78
        ],
        "damagesRange": null
      },
      {
        "label": "Guaranty Enforcement Against Individual Guarantor",
        "probabilityRange": [
          0.8,
          0.93
        ],
        "damagesRange": null
      },
      {
        "label": "Attorneys' Fees and Costs",
        "probabilityRange": [
          0.7,
          0.85
        ],
        "damagesRange": [
          15000,
          25000
        ]
      }
    ],
    "status": "pending",
    "actualOutcome": null,
    "resolvedAt": null,
    "analysis": null
  },
  {
    "registryId": "ct-520-west-avenue-holdings-v-520-west-avenue-property-2025",
    "caseId": null,
    "caseTitle": "520 West Avenue Holdings, LLC v. 520 West Avenue Property, LLC, et al.",
    "court": "Connecticut Superior Court, Judicial District of Stamford",
    "docket": "FST-CV25-6077850-S",
    "filings": [
      {
        "side": "plaintiff",
        "label": "Foreclosure complaint (Nov. 26, 2025)",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=31605716"
      },
      {
        "side": "defendant",
        "label": "Answer and special defenses",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=32834861"
      },
      {
        "side": "defendant",
        "label": "Opposition to appointment of receiver",
        "url": "https://civilinquiry.jud.ct.gov/DocumentInquiry/DocumentInquiry.aspx?DocumentNo=32419156"
      }
    ],
    "predictedAt": "2026-09-23",
    "model": "claude-sonnet-5",
    "category": "lending-foreclosure",
    "side": "Lender",
    "predictedRange": [
      7662000,
      8953750
    ],
    "predictedBestGuess": 8650000,
    "whatIsNeededForEstimate": null,
    "likelyOutcome": "On this record, 520 West Avenue Holdings is very likely to obtain a foreclosure judgment and be found the valid holder of the Note, Mortgage, and Guaranty, since Borrower's Answer admits the operative loan documents and default-relevant facts and only disclaims knowledge of intervening assignment mechanics that Plaintiff can prove with the recorded instruments already alleged. The two real sources of downside are (1) whatever substantive theories are packed into the undisclosed Special Defenses, which could create fact issues bearing on good faith/loan administration conduct, and (2) the fair-value offset that will apply to any deficiency judgment, which is unquantifiable without an appraisal. Expect Plaintiff to prevail on liability and likely on the receivership motion, with the ultimate dollar recovery net of a valuation offset and subject to trial timing.",
    "claims": [
      {
        "label": "Foreclosure Judgment / Debt Recovery (Principal + Accrued Interest)",
        "probabilityRange": [
          0.85,
          0.95
        ],
        "damagesRange": [
          9000000,
          9400000
        ]
      },
      {
        "label": "Attorney's Fees and Costs",
        "probabilityRange": [
          0.8,
          0.95
        ],
        "damagesRange": [
          15000,
          25000
        ]
      },
      {
        "label": "Undisclosed Special Defenses (Content Unknown)",
        "probabilityRange": [
          0.5,
          0.85
        ],
        "damagesRange": null
      },
      {
        "label": "Receiver of Rents Motion",
        "probabilityRange": [
          0.7,
          0.9
        ],
        "damagesRange": null
      },
      {
        "label": "Guaranty Enforceability Against Replacement Guarantor Trusts",
        "probabilityRange": [
          0.75,
          0.92
        ],
        "damagesRange": null
      },
      {
        "label": "Deficiency Judgment / Fair Value Offset",
        "probabilityRange": [
          0.4,
          0.7
        ],
        "damagesRange": null
      }
    ],
    "status": "pending",
    "actualOutcome": null,
    "resolvedAt": null,
    "analysis": null
  },
  {
    "registryId": "tx-american-community-lending-v-endeavor-group-real-estate-2026",
    "caseId": null,
    "caseTitle": "American Community Lending Holdings, LLC f/k/a Caz Creek Lending Holdings, LLC v. Endeavor Group Real Estate, LLC and Pramukh Mahant Senior Living Fort Worth, LLC",
    "court": "U.S. District Court for the Northern District of Texas, Fort Worth Division",
    "docket": "4:26-cv-00587",
    "filings": [
      {
        "side": "plaintiff",
        "label": "Complaint (May 13, 2026)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.txnd.419470/gov.uscourts.txnd.419470.1.0.pdf"
      },
      {
        "side": "defendant",
        "label": "Defendants' original answer (July 17, 2026)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.txnd.419470/gov.uscourts.txnd.419470.8.0.pdf"
      },
      {
        "side": "plaintiff",
        "label": "Joint status report, signed by counsel for both sides (Aug. 18, 2026)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.txnd.419470/gov.uscourts.txnd.419470.13.0.pdf"
      }
    ],
    "predictedAt": "2026-09-25",
    "model": "claude-sonnet-5",
    "analysisVersion": "v2",
    "category": "lending-foreclosure",
    "side": "Lender",
    "predictedRange": [
      5859558.75,
      6340000
    ],
    "predictedBestGuess": 5972179.375,
    "whatIsNeededForEstimate": null,
    "likelyOutcome": "Plaintiff is very likely to obtain judgment for the stipulated debt amount (or close to it) given the parties' own stipulation that the loan matured and the full balance is due and owing, which substantially undercuts Defendants' boilerplate, fact-free affirmative defenses. The principal open questions going into trial are (1) whether the pledgors' obligation is a full payment guaranty or a collateral-limited pledge subject to fair-value crediting, and (2) what the pledged ownership interests are actually worth for purposes of any deficiency calculation -- neither of which the current record resolves. Attorney's fees under paragraph 4.8 should also be recoverable given the enforceable fee-shifting clause and active litigation posture.",
    "claims": [
      {
        "label": "Core Debt / Guaranty Enforcement",
        "probabilityRange": [
          0.95,
          0.96
        ],
        "damagesRange": [
          6155325,
          6300000
        ]
      },
      {
        "label": "Attorney's Fees Under Paragraph 4.8",
        "probabilityRange": [
          0.8,
          0.92
        ],
        "damagesRange": [
          15000,
          40000
        ]
      },
      {
        "label": "Failure to Mitigate / Waiver / Estoppel / Laches Defenses",
        "probabilityRange": [
          0.75,
          0.9
        ],
        "damagesRange": null
      },
      {
        "label": "Collateral Valuation Offset on Deficiency Judgment",
        "probabilityRange": null,
        "damagesRange": null
      }
    ],
    "status": "pending",
    "actualOutcome": null,
    "resolvedAt": null,
    "analysis": null
  },
  {
    "registryId": "mo-webster-university-v-st-louis-leased-housing-associates-master-tenant-v-2025",
    "caseId": null,
    "caseTitle": "Webster University v. St. Louis Leased Housing Associates Master Tenant V, LLLP",
    "court": "U.S. District Court for the Eastern District of Missouri, Eastern Division",
    "docket": "4:25-cv-01778",
    "filings": [
      {
        "side": "plaintiff",
        "label": "Amended complaint as submitted with consent motion for leave (Ex. B, July 15, 2026; leave granted July 21, 2026)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.moed.224981/gov.uscourts.moed.224981.38.2.pdf"
      },
      {
        "side": "defendant",
        "label": "Answer to amended complaint and affirmative defenses (Aug. 3, 2026)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.moed.224981/gov.uscourts.moed.224981.44.0.pdf"
      },
      {
        "side": "plaintiff",
        "label": "Original complaint (Dec. 5, 2025)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.moed.224981/gov.uscourts.moed.224981.1.0.pdf"
      },
      {
        "side": "defendant",
        "label": "Answer to original complaint (Jan. 6, 2026)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.moed.224981/gov.uscourts.moed.224981.10.0.pdf"
      }
    ],
    "predictedAt": "2026-09-25",
    "model": "claude-sonnet-5",
    "analysisVersion": "v2",
    "category": "lease-disputes",
    "side": "Landlord",
    "predictedRange": [
      312186.75,
      1745415.21
    ],
    "predictedBestGuess": 491485.6,
    "whatIsNeededForEstimate": null,
    "likelyOutcome": "On the current pleadings, Webster's 2023 and 2024 overbilling refund claims are the real value in this case and are reasonably likely to succeed at least in part \u2014 the Market Rate Unit and capital-improvement categories are hard for Dominium to defend as a matter of lease definition, while the utilities/insurance/management-fee categories will turn on fact-intensive allocation evidence not yet developed. The pre-2023 refund claim is the most exposed piece of the case given the Lease's own 90/90-day audit-and-objection window and Dominium's limitations/waiver/estoppel defenses, and it also lacks a pleaded dollar figure. Net, this looks like a case that settles or partially resolves around the 2023-2024 audited figures, with Webster's realistic net recovery well below the full $1.1M+ in nominal disputed charges once litigation risk on each category and the pre-2023 bar are factored in.",
    "claims": [
      {
        "label": "2024 CAM Overbilling Refund (utilities, management overhead, Market Rate Unit costs, LIHTC insurance, legal fees, telephone, capital improvements)",
        "probabilityRange": [
          0.5,
          0.7
        ],
        "damagesRange": [
          317658,
          444721
        ]
      },
      {
        "label": "2023 CAM Overbilling Refund (utilities, management overhead, Market Rate Unit costs, LIHTC insurance)",
        "probabilityRange": [
          0.45,
          0.65
        ],
        "damagesRange": [
          213795,
          308815
        ]
      },
      {
        "label": "2025 CAM Overbilling Refund (audit in progress)",
        "probabilityRange": [
          0.3,
          0.5
        ],
        "damagesRange": [
          190500,
          317500
        ]
      },
      {
        "label": "Pre-2023 Overbilling Refund Claim",
        "probabilityRange": [
          0.1,
          0.25
        ],
        "damagesRange": null
      },
      {
        "label": "Declaratory Judgment (Count IV) \u2014 Future OpEx Allocability",
        "probabilityRange": [
          0.55,
          0.75
        ],
        "damagesRange": null
      },
      {
        "label": "Landlord's Contractual Limitations / Waiver / Estoppel Defenses",
        "probabilityRange": [
          0.6,
          0.85
        ],
        "damagesRange": null
      },
      {
        "label": "Mitigation and Good-Faith Defenses",
        "probabilityRange": [
          0.15,
          0.35
        ],
        "damagesRange": null
      },
      {
        "label": "Attorneys' Fees / Costs Exposure (either direction)",
        "probabilityRange": null,
        "damagesRange": null
      }
    ],
    "status": "pending",
    "actualOutcome": null,
    "resolvedAt": null,
    "analysis": null
  },
  {
    "registryId": "ny-are-east-river-science-park-v-nyc-health-and-hospitals-2024",
    "caseId": null,
    "caseTitle": "ARE-East River Science Park, LLC v. New York City Health and Hospitals Corporation and New York City Economic Development Corporation",
    "court": "U.S. District Court for the Southern District of New York",
    "docket": "1:24-cv-05956",
    "filings": [
      {
        "side": "plaintiff",
        "label": "First amended complaint (Jan. 24, 2025)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.nysd.626078/gov.uscourts.nysd.626078.33.0.pdf"
      },
      {
        "side": "defendant",
        "label": "Answer to amended complaint and counterclaims (Apr. 10, 2026)",
        "url": "https://storage.courtlistener.com/recap/gov.uscourts.nysd.626078/gov.uscourts.nysd.626078.54.0.pdf"
      }
    ],
    "predictedAt": "2026-09-25",
    "model": "claude-sonnet-5",
    "analysisVersion": "v2",
    "category": "lease-disputes",
    "side": "Tenant",
    "predictedRange": [
      1525000,
      9500000
    ],
    "predictedBestGuess": 3750000,
    "whatIsNeededForEstimate": null,
    "likelyOutcome": "On the current record, H+H/NYCEDC (the ground lessor side) is likely to prevail on the core question that the Option terminated on November 3, 2024 and to retain the $5M Predevelopment Security Deposit, aided significantly by the court's dismissal of ARE's $50M fraud and implied-covenant damages claims. The implied-covenant counterclaim for ongoing damages is more contested and could be discounted or narrowed at trial, and the parking counterclaims carry operational rather than large monetary value. Net expected recovery for the represented (landlord) side is substantial but not certain, with the deposit as the most binary and highest-value single line item.",
    "claims": [
      {
        "label": "Whether the Option Terminated on November 3, 2024 (Core Declaratory Dispute)",
        "probabilityRange": [
          0.55,
          0.75
        ],
        "damagesRange": null
      },
      {
        "label": "$5,000,000 Predevelopment Security Deposit Retention",
        "probabilityRange": [
          0.5,
          0.7
        ],
        "damagesRange": [
          2000000,
          5000000
        ]
      },
      {
        "label": "Implied Covenant Damages for Refusal to Relinquish the Option",
        "probabilityRange": [
          0.35,
          0.55
        ],
        "damagesRange": [
          1500000,
          4500000
        ]
      },
      {
        "label": "Dismissal of ARE's $50 Million Fraud/Implied-Covenant Claims",
        "probabilityRange": [
          0.95,
          0.99
        ],
        "damagesRange": null
      },
      {
        "label": "Parking Counterclaims (100-Space Specific Performance / 400-Space Declaration)",
        "probabilityRange": [
          0.6,
          0.8
        ],
        "damagesRange": null
      },
      {
        "label": "ARE's Statute of Limitations / Laches and Discretionary-Declination Defenses",
        "probabilityRange": [
          0.2,
          0.35
        ],
        "damagesRange": null
      }
    ],
    "status": "pending",
    "actualOutcome": null,
    "resolvedAt": null,
    "analysis": null
  }
];
