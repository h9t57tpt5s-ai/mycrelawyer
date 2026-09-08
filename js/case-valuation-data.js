/* =========================================================
   CREdocket — Case Value Calculator: engine spec + citations
   + per-state law modifiers (lease-disputes category only).
   Generated from case_valuation_project/data/*.json — every
   probability/damages range traces to either a state-law rule or a
   cited real case in `citations`. See
   case_valuation_project/data/claim_rules.md for the full rationale.
   ========================================================= */

const CASE_VALUATION_DATA = {
  "spec": {
    "categories": {
      "lease-disputes": {
        "label": "Landlord-Tenant / Lease Disputes",
        "roles": {
          "sideA": "Landlord",
          "sideB": "Tenant"
        },
        "claimTypes": {
          "unpaid_rent": {
            "side": "sideA",
            "label": "Unpaid Rent",
            "appliesIf": "unpaidRentAmount > 0",
            "baseProbability": [
              0.9,
              0.97
            ],
            "modifiers": [
              {
                "if": "tenantDisputesDebt",
                "probability": [
                  0.55,
                  0.75
                ],
                "note": "Tenant disputes the debt (e.g., claims rent abatement)"
              },
              {
                "if": "!hasWrittenLease",
                "probability": [
                  0.4,
                  0.6
                ],
                "note": "No written lease on file"
              }
            ],
            "damages": {
              "formula": "unpaidRentAmount",
              "isRange": false
            }
          },
          "accelerated_rent": {
            "side": "sideA",
            "label": "Accelerated / Future Rent",
            "appliesIf": "remainingMonths > 0 && leaseTerminated",
            "baseProbability": [
              0.65,
              0.9
            ],
            "gate": {
              "if": "!hasAccelerationClause",
              "probability": [
                0.15,
                0.3
              ],
              "note": "No confirmed acceleration clause"
            },
            "damages": {
              "formula": "presentValueOfLevelStream(netFutureRent, remainingMonths, discountRate)",
              "netFutureRent": "grossFutureRent (remainingMonths * monthlyRent), net of actual/anticipated replacement-tenant rent if re-let, else a modest mitigation-uncertainty haircut keyed to state mitigationDuty",
              "discountRate": [
                0.05,
                0.09
              ],
              "note": "Discounted to present value using a 5-9% annual rate range, not a flat percentage-of-gross haircut -- required under case law (e.g. HealthSouth Rehabilitation Corp. v. Falcon Management Co., 799 So.2d 177, 185 (Ala. 2001)) and matches real accelerated-rent damages methodology -- see The Village at Brocks Gap, LLC v. Singleton Ventures, LLC citation below, which used a 6.0% rate.",
              "reletOverride": "if landlord has re-let, net future rent = grossFutureRent - actual/anticipated overlapping new rent, BEFORE present-value discounting"
            }
          },
          "releasing_mitigation_costs": {
            "side": "sideA",
            "label": "Re-Leasing / Mitigation Costs",
            "appliesIf": "releaseWorkCosts > 0",
            "baseProbability": [
              0.6,
              0.85
            ],
            "damages": {
              "formula": "releaseWorkCosts * [0.85, 1.0]",
              "note": "Landlord's work, tenant-improvement allowances, and leasing commissions incurred to re-lease the space after tenant default -- recoverable as detriment proximately caused by the breach under a typical commercial lease default clause. Usually actual, invoiced, documented costs, so damages run close to the amount claimed rather than a discounted estimate. See The Village at Brocks Gap, LLC v. Singleton Ventures, LLC citation, where these costs totaled ~17% of total damages sought."
            }
          },
          "holdover_damages": {
            "side": "sideA",
            "label": "Statutory Holdover Damages",
            "appliesIf": "heldOverAfterTerm && state.holdoverStatutoryPenalty === true",
            "baseProbability": [
              0.8,
              0.95
            ],
            "damages": {
              "formula": "monthlyRent * 1.5 * holdoverMonths (low) to monthlyRent * 2 * holdoverMonths (high)",
              "note": "Per counsel-of-record review: highly fact/lease specific, but a flat 3x multiplier is uncommon in practice and overstated the typical case; 1.5x-2x is more realistic, and a holdover fact pattern itself is a relatively rare subtype of lease dispute (most lease disputes are nonpayment or abandonment, not holdover)."
            }
          },
          "attorney_fees": {
            "side": "sideA",
            "label": "Attorney's Fees",
            "appliesIf": "hasFeeShiftingClause",
            "baseProbability": "weighted average of probabilities of the other pursued claims",
            "damages": {
              "formula": "feesByPosture(facts, isContested) -- a posture-tiered FLAT DOLLAR estimate, NOT a percentage of principal damages",
              "feeTiers": "default (no answer filed) $5,000-$10,000; answered-passive (answer filed, not actively litigated) $15,000-$25,000; contested-msj (actively contested, resolved on summary judgment) $20,000-$45,000; trial $50,000-$200,000",
              "note": "SUPERSEDES the earlier percentage-of-principal model. Per counsel-of-record review, fees are driven overwhelmingly by procedural effort/posture, not claim size -- a $50k claim litigated to trial and a $5M claim litigated to trial cost roughly the same in fees. isContested is derived from tenantDisputesDebt or the presence of a wrongful_lockout/quiet_enjoyment_breach claim. See The Village at Brocks Gap, LLC v. Singleton Ventures, LLC citation for a real UNCONTESTED data point (fees + costs ~1.3% of a ~$4.19M recovery, consistent with the low end of the default/answered-passive tiers for a claim of that size) -- that matter does not calibrate the contested tiers."
            }
          },
          "property_damage": {
            "side": "sideA",
            "label": "Property Damage / Repairs",
            "appliesIf": "propertyDamageAmount > 0",
            "baseProbability": [
              0.7,
              0.9
            ],
            "damages": {
              "formula": "propertyDamageAmount * (1 - normalWearHaircut)",
              "normalWearHaircut": [
                0.1,
                0.2
              ]
            }
          },
          "wrongful_lockout": {
            "side": "sideB",
            "label": "Wrongful Eviction / Unlawful Lockout",
            "appliesIf": "selfHelpUsed",
            "baseProbabilityByState": {
              "Not Available": [
                0.85,
                0.95
              ],
              "Available_ProcessFollowed": [
                0.1,
                0.25
              ],
              "Conditional_ProcessNotFollowed": [
                0.6,
                0.8
              ],
              "Uncertain": [
                0.3,
                0.6
              ]
            },
            "damages": {
              "formula": "computeWrongfulLockoutDamages(facts) -- branches on the specific state's statutory remedy MECHANISM, not just a flat multiplier: 'multiplier' states (e.g. NY, NJ treble damages) multiply actualDamages; 'per-day' states (e.g. CA $100/day) add a per-diem penalty on top of actualDamages; 'floor' states (e.g. TX greater-of-one-month's-rent-or-$500) add a statutory floor amount; 'actual-only' states (no confirmed enhancement researched, or none exists) return actualDamages only. Per-state mechanism/value/citation live in stateLawModifiers[state].wrongfulLockoutRemedyType/Value/Citation.",
              "note": "actualDamages = relocation + lost inventory + provable lost profits, minus any lease consequential-damages waiver. All 50 states + DC researched. Confirmed commercial-applicable enhanced remedies: Texas (floor, greater of $500 or one month's rent), California (per-day, $100/day), New York (multiplier, 3x), New Jersey (multiplier, 3x), Michigan (multiplier, 3x), New Hampshire (per-day, $1,000/day). All other 45 jurisdictions default to actual-only -- in most of those, a real enhanced-damages statute exists but is confirmed RESIDENTIAL-specific (Uniform Residential Landlord and Tenant Act derivatives) and does not extend to commercial tenancies, or the real mechanism is a non-additive 'greater of X or actual damages' replacement floor that doesn't fit this engine's additive floor/multiplier/per-day mechanics without risking overstatement -- see each state's wrongfulLockoutCitation for the specific reasoning and statute, since 'actual-only' here does not always mean 'unresearched.'"
            }
          },
          "tortious_interference_lost_profits": {
            "side": "sideB",
            "label": "Tortious Interference with Contract (Lost Profits)",
            "appliesIf": "selfHelpUsed && selfHelpDisruptedThirdPartyContracts && lostProfitsFromInterference > 0",
            "baseProbability": [
              0.25,
              0.55
            ],
            "damages": {
              "formula": "lostProfitsFromInterference * [0.4, 0.9]",
              "note": "A separate theory from the wrongful-lockout claim: if the lockout disrupted the tenant's contracts with its own customers, suppliers, or employees (not just its occupancy), that can independently support tortious interference with contract and open a distinct lost-profits exposure to the landlord. Requires proving intent/improper means and a specific disrupted business expectancy -- fact-intensive; flagged per counsel-of-record review as a real potential landlord liability where self-help is threatened or used, not yet grounded to a specific case citation."
            }
          },
          "quiet_enjoyment_breach": {
            "side": "sideB",
            "label": "Breach of Quiet Enjoyment / Constructive Eviction / Failure to Repair",
            "appliesIf": "repairFailureOrInterferenceClaimed",
            "baseProbability": [
              0.4,
              0.65
            ],
            "modifiers": [
              {
                "if": "gaveCureNoticeAndLandlordFailedToAct",
                "probabilityBoost": [
                  0.1,
                  0.15
                ]
              }
            ],
            "damages": {
              "formula": "comparable-case-informed range; lostProfits component zeroed if leaseWaivesConsequentialDamages"
            }
          },
          "security_deposit": {
            "side": "sideB",
            "label": "Wrongfully Withheld Security Deposit",
            "appliesIf": "depositAmount > 0 && depositDisputed",
            "note": "Lease-driven, not state-statute-driven for most states -- flag this explicitly in the UI",
            "baseProbability": [
              0.55,
              0.8
            ],
            "modifiers": [
              {
                "if": "!landlordProvidedItemization",
                "probabilityBoost": [
                  0.1,
                  0.15
                ]
              }
            ],
            "damages": {
              "formula": "depositAmount",
              "note": "check per-state for any bad-faith-withholding doubling penalty before asserting one"
            }
          }
        }
      },
      "lending-foreclosure": {
        "label": "Lending & Foreclosure",
        "roles": {
          "sideA": "Lender",
          "sideB": "Borrower / Guarantor"
        },
        "claimTypes": {
          "foreclosure_deficiency_judgment": {
            "side": "sideA",
            "label": "Foreclosure / Deficiency Judgment",
            "appliesIf": "loanInDefault && foreclosureFiled",
            "baseProbability": [
              0.85,
              0.97
            ],
            "modifiers": [
              {
                "if": "borrowerDisputesDefault",
                "probability": [
                  0.6,
                  0.8
                ],
                "note": "Borrower disputes the default itself (payment application dispute, alleged lender breach, etc.)"
              }
            ],
            "damages": {
              "formula": "max(0, outstandingLoanBalance + lenderProtectiveAdvances - foreclosureSaleProceeds), adjusted by foreclosureStateModifiers[state] for the selected foreclosureMethod (judicial vs. non-judicial) when that state has been researched -- see computeDeficiencyStateAdjustment() in the engine",
              "researchNote": "19-case sample: undisputed defaults produce stipulated judgments tracking loan balance closely (AFF IV 200 Miami v. Stonerock: $65.7M judgment on $41.1M principal). Lender protective advances (taxes, insurance) can meaningfully inflate the judgment beyond original principal (Hillsboro Beach Resort: $26M loan + ~$2.9M advances = $40M judgment). Deficiency-judgment AVAILABILITY itself varies by state/foreclosure method -- now a full 51-jurisdiction state-law modifier (50 states + DC; see foreclosureStateModifiers below), each individually verified against primary statute text. Five states (CA, MN, OR, MT, AK) bar deficiency outright after their dominant non-judicial method; five more (AR, NV, OK, UT, ID) cap it at the debtor-favorable LESSER of a fair-value or sale-price offset; Louisiana's real fork (appraisal election, not judicial/non-judicial) doesn't mechanize onto this tool's question and is flagged in its note instead.",
              "note": "SCOPE CHANGE per counsel-of-record review: this figure is the legal deficiency a court would enter judgment for -- it is NOT a post-judgment collectability forecast. An earlier version of this model applied a 0.5x haircut to the high end to approximate collection risk; that was removed. Collectability depends on the borrower/guarantor's asset picture at judgment, which is explicitly out of scope for this calculator -- the tool answers 'what is this case worth,' not 'what will actually be collected.'"
            }
          },
          "receivership_dispute": {
            "side": "sideA",
            "label": "Receivership Grant/Denial",
            "appliesIf": "receivershipMotionFiled",
            "baseProbability": [
              0.65,
              0.85
            ],
            "note": "Refined from a 6-case sample: 5 of 6 resulted in a receiver appointed (the lone initial denial, Independent Bank v. Adelaide Pointe, was later granted on renewed motion once factual disputes were developed). Typical fact pattern is occupancy/income decline colliding with an unrefinanceable maturity — not borrower fraud/misconduct — and involves institutionally sophisticated owners as often as not. Sample is small and recency-skewed (2024-2026 office-distress cycle); treat this range as directional, not final.",
            "damages": {
              "formula": "not a damages claim -- operational-control relief, not a dollar figure",
              "isRange": false
            }
          },
          "guaranty_enforcement": {
            "side": "sideA",
            "label": "Guaranty Enforcement (incl. Non-Recourse Carve-Out)",
            "appliesIf": "guarantyTriggerEventAlleged",
            "baseProbability": [
              0.7,
              0.92
            ],
            "note": "Revised UP from the original preliminary estimate: all 3 sampled guaranty-enforcement cases (Cherryland Mall, Princeton Park, Gratiot Avenue) resulted in FULL personal liability for the guarantor once a carve-out trigger was found — even for purely technical/springing breaches (insolvency, unauthorized subordinate debt later cured) with no fraud or intentional waste. This probability applies once a trigger event is credibly alleged; separately and NOT modeled with a probability here, PROVING the trigger event in the first place is the genuinely contested, fact-specific question.",
            "modifiers": [
              {
                "if": "guarantorAssertsCounterclaimOrOffset",
                "probability": [
                  0.45,
                  0.7
                ],
                "damagesFraction": [
                  0.5,
                  0.85
                ],
                "note": "Per counsel-of-record review: recovery totally depends on whether a clear, undisputed carve-out breach exists. Once a counterclaim or offset is pled against the guaranty, it becomes a genuinely contested fact question and both probability and expected dollar recovery drop meaningfully."
              },
              {
                "if": "!guarantorAssertsCounterclaimOrOffset",
                "probability": [
                  0.8,
                  0.97
                ],
                "damagesFraction": [
                  0.95,
                  1.0
                ],
                "note": "Clean, undisputed carve-out breach -- case value should approach the full measure of the guaranteed balance."
              }
            ],
            "damages": {
              "formula": "guaranteedLoanBalance * damagesFraction (see modifiers -- branches on whether a counterclaim/offset is pled)",
              "isRange": false,
              "researchNote": "Sample dollar figures ($2.1M, $5.2M, $12.2M) scale with underlying loan size, not triggering-conduct severity — a $400K unauthorized loan repaid 7 months later produced the same full-recourse outcome as outright insolvency."
            }
          },
          "lender_liability_claim": {
            "side": "sideB",
            "label": "Lender Liability (borrower-asserted)",
            "appliesIf": "borrowerAllegesLenderMisconduct",
            "baseProbability": [
              0.15,
              0.35
            ],
            "modifiers": [
              {
                "if": "egregiousConductAlleged",
                "probability": [
                  0.2,
                  0.4
                ],
                "note": "Egregious conduct (clear bad faith) shifts the odds up somewhat, and per counsel-of-record review opens exemplary/punitive damages as a real component alongside contract damages, lost profits, and out-of-pocket costs."
              }
            ],
            "note": "Confirmed low (kept at 0.15–0.35 absent egregious conduct): 19-case sample shows 1980s-era cases succeeded with large verdicts (K.M.C. v. Irving Trust, Barrett v. Bank of America, $6.6–$7.5M) under now-dated, more borrower-friendly doctrine. Recent CRE lender-liability suits (Steinway Tower/111 W57, Via Mizner/Mandarin Oriental) are trending toward procedural wins (reinstated claims, remands, a 6-week TRO) rather than dollar outcomes, and take years to resolve even when they eventually succeed. Per counsel-of-record review, a borrower win has a real damages component: typically contract damages, lost profits, out-of-pocket costs, and potentially exemplary damages in egregious cases.",
            "damages": {
              "formula": "lenderLiabilityDamagesClaimed * [0.20, 0.55] (non-egregious) or lenderLiabilityDamagesClaimed * [0.35, 1.5] (egregious, reflecting exemplary-damages exposure)",
              "isRange": true
            }
          },
          "attorney_fees": {
            "side": "sideA",
            "label": "Attorney's Fees",
            "appliesIf": "hasFeeShiftingClause",
            "baseProbability": "weighted average of probabilities of the other pursued claims",
            "damages": {
              "formula": "feesByPosture(facts, isContested) -- same posture-tiered flat-dollar model used for lease-disputes",
              "note": "Per counsel-of-record review (Q8): same treatment as lease-disputes attorney's fees. isContested = borrowerDisputesDefault OR guarantorAssertsCounterclaimOrOffset -- i.e., either the borrower disputes the debt/default, or the guarantor disputes the debt via a counterclaim or offset."
            }
          }
        }
      },
      "reit-securities": {
        "label": "REIT & Real Estate Securities",
        "roles": {
          "sideA": "Shareholder / Plaintiff Class",
          "sideB": "REIT / Board / Sponsor"
        },
        "claimTypes": {
          "securities_fraud_10b5": {
            "side": "sideA",
            "label": "Securities Fraud (Rule 10b-5)",
            "appliesIf": "allegingMaterialMisrepresentationOrOmission && stockPriceDropAlleged",
            "baseProbability": [
              0.35,
              0.55
            ],
            "note": "Stanford Securities Class Action Clearinghouse (the designated primary source) is STILL inaccessible as of this research pass (re-checked -- still 'under construction, expected back Winter 2026,' same status as before). Its successor project, Stanford Securities Litigation Analytics (sla.law.stanford.edu), has the underlying data but requires a data license/login for detailed filtering and settlement figures -- not usable for this kind of ad hoc research. Rerun once either is freely accessible; a general web search pass in the meantime did surface real additions elsewhere in this category (see breach_fiduciary_duty_derivative and merger_objection_suit) but still did not turn up more small mortgage-REIT/non-traded-REIT Rule 10b-5 settlements specifically.",
            "damages": {
              "formula": "settlementPercentOfEstimatedInvestorLosses",
              "percentRange": [
                0.02,
                0.08
              ],
              "note": "PRELIMINARY percent-of-damages range -- smaller cases historically settle for a higher percentage of estimated losses than mega-cases; refine by claim size once research is in",
              "tiers": {
                "cleanStockDropNoCriminalConduct": {
                  "percentRange": [
                    0.03,
                    0.08
                  ],
                  "note": "high-single-digit to low-nine-figure settlements is the norm here"
                },
                "criminalConvictionOrAuditorCodefendantOrControllingShareholderSelfDealing": {
                  "percentRange": [
                    0.1,
                    0.25
                  ],
                  "note": "the presence of any of these tends to push the settlement an order of magnitude higher — ARCP/VEREIT ($1.025B total) combined a criminally-convicted CFO, a co-liable auditor (Grant Thornton, $49M), and a co-liable external manager (~$225-286.5M)"
                }
              }
            }
          },
          "breach_fiduciary_duty_derivative": {
            "side": "sideA",
            "label": "Breach of Fiduciary Duty (Derivative)",
            "appliesIf": "allegingBoardOrSponsorBreach",
            "baseProbability": [
              0.25,
              0.45
            ],
            "note": "PRELIMINARY -- business-judgment-rule deference means a large share of derivative suits resolve as 'disclosure-only'/governance-therapeutics settlements with no cash recovery to the REIT; refine cash-vs-non-cash split from research",
            "damages": {
              "formula": "cash recovery to the entity (if any) -- many resolutions are non-monetary governance changes plus a separate fee award to plaintiff's counsel",
              "isRange": true
            },
            "modifiers": [
              {
                "if": "tiedToConcreteQuantifiableSelfDealingTransaction",
                "probability": [
                  0.55,
                  0.8
                ],
                "note": "an internalization at an inflated price, a merger timed/structured to enrich the founder, a related-party fee arrangement — Quinn v. Knight $32M, Inland Western ~$90M forfeited stock, Hospitality Investors Trust $15.2M"
              },
              {
                "if": "genericGovernanceComplaintOnly",
                "probability": [
                  0.05,
                  0.15
                ],
                "note": "piggybacking on an already-successful activist proxy fight, or a self-dealing allegation resolved via a voting/cooperation agreement instead of litigation — these tend to settle for governance changes plus a nominal fee reimbursement, with NO disclosed cash recovery to the company (CommonWealth REIT $200K; Blackwells v. GNL, no disclosed cash despite an $838M excess-fee allegation)"
              }
            ]
          },
          "proxy_disclosure_claim": {
            "side": "sideA",
            "label": "Proxy Disclosure Claim",
            "appliesIf": "allegingMaterialOmissionInProxyOrVoteMaterials",
            "baseProbability": [
              0.3,
              0.55
            ],
            "damages": {
              "formula": "injunctive (block/delay the vote) pre-vote, or investor-loss-based damages post-vote",
              "isRange": true
            },
            "modifiers": [
              {
                "if": "specificQuantifiableUndisclosedInsiderFinancialStake",
                "probability": [
                  0.55,
                  0.8
                ],
                "note": "Lightstone REIT ($59.8M in undisclosed subordinated participation interests) survived a motion to dismiss; Piedmont/Wells REIT ($175M internalization payment to insiders) drew a real $7.5M cash settlement"
              },
              {
                "if": "genericIndustryWideRiskAlreadyDisclosedInGeneralTerms",
                "probability": [
                  0.1,
                  0.25
                ],
                "note": "courts are much more willing to dismiss for failure to plead materiality — St. Clair-Hibbard v. American Finance Trust (2d Cir. 2020): boilerplate conflict-of-interest/trading-discount warnings defeated the claim even without quantifying the risk"
              }
            ]
          },
          "merger_objection_suit": {
            "side": "sideA",
            "label": "Merger Objection Suit",
            "appliesIf": "objectingToMergerOrSaleTerms",
            "baseProbability": [
              0.1,
              0.25
            ],
            "note": "Confirmed low real-recovery probability (kept at 0.10–0.25): the classic 'disclosure-only settlement' pattern — supplemental proxy disclosures get added, suits get mooted, and post-Trulia courts have grown skeptical of paying a 'mootness fee' for it at all. Where a mootness fee IS paid, it goes to plaintiff's counsel (typically $75K–$500K), not to shareholders as a per-share recovery — model this claim type as high-frequency, low-dollar-value litigation risk, and make the counsel-fee-vs-shareholder-recovery distinction explicit in the UI.",
            "damages": {
              "formula": "usually a mootness fee to counsel (modest, often $75K-$500K) rather than a per-share shareholder recovery; flag this distinction explicitly in the UI"
            }
          }
        }
      },
      "construction-defect": {
        "label": "Construction Defect",
        "roles": {
          "sideA": "Owner / Developer",
          "sideB": "Contractor / Design Professional"
        },
        "claimTypes": {
          "contractor_breach_negligence": {
            "side": "sideA",
            "label": "Contractor Breach / Negligence",
            "appliesIf": "defectAllegedAgainstContractor",
            "baseProbability": [
              0.55,
              0.8
            ],
            "damages": {
              "formula": "repairCostEstimate",
              "preExistingConditionHaircut": [
                0.05,
                0.15
              ],
              "tiers": {
                "catastrophicLifeSafetyFailure": {
                  "note": "structural collapse, or a defect too severe to safely complete construction — the outlier top of the range: Champlain Towers South ($997M), Harmon Hotel ($195M, ended in demolition), Tropicana garage collapse ($101M), Milwaukee garage panel collapse ($39M). These anchor the top of a valuation range, not the median."
                },
                "postOccupancyLatentDefect": {
                  "note": "water intrusion, facade/envelope failure, HVAC/MEP — roughly $10M-$56M in this sample regardless of unit count. Defect PERVASIVENESS across every unit is a stronger driver of settlement size than raw unit count or building height (Park Hill: only 10 units but ~$2.65M/unit, the highest per-unit figure in the sample, because the defect was pervasive)."
                }
              }
            }
          },
          "design_professional_malpractice": {
            "side": "sideA",
            "label": "Design Professional Malpractice",
            "appliesIf": "designErrorAlleged",
            "baseProbability": [
              0.35,
              0.6
            ],
            "note": "Sample expanded from 2 to 4 citations, but still too thin/mixed to refine the base rate with real confidence: two (Princeton/TWBTA, Clark Construction/Perkins Eastman) have undisclosed final outcomes; the two with confirmed outcomes are close to opposite poles -- Yakima School District/KDA is a confirmed $1.7M cash settlement, while MIT/Gehry (Stata Center) settled for confirmed $0 direct cash to the owner despite well-documented, expensive defects. That split is itself informative (design-malpractice claims against reputationally strong architects can resolve without a cash recovery even on strong facts) but isn't enough data points to justify moving the probability range -- kept at the original preliminary estimate.",
            "damages": {
              "formula": "repairAndRedesignCostEstimate"
            }
          },
          "indemnification_contribution_claim": {
            "side": "sideB",
            "label": "Indemnification / Contribution",
            "appliesIf": "multipleResponsiblePartiesAndIndemnityClauseExists",
            "baseProbability": [
              0.4,
              0.7
            ],
            "note": "Outcome is contract-language-dependent, now modeled by a full 51-jurisdiction state-law modifier (see constructionIndemnityStateModifiers) that adjusts the damages ceiling based on whether the project state permits only proportionate-fault indemnity (limited), full indemnity for concurrent negligence (intermediate), or broad-form indemnity even for the indemnitee's sole negligence (broad / broad-capped).",
            "damages": {
              "formula": "allocatedShareOfUnderlyingDefectDamages",
              "researchNote": "Where a defect traces to a specific subcontractor's workmanship, fault allocation strongly favors that subcontractor (Milwaukee garage: 88% sub / 10% GC / 2% owner — the clearest allocation data point found). Where a design professional is a co-defendant alongside developer/GC, their share is consistently smaller than the builder's on the same facts (Grandview: architect took ~10% of the total, $1M of $10M) — professional E&O coverage limits are typically much smaller than a GC's CGL policy."
            }
          },
          "insurance_coverage_defect_dispute": {
            "side": "sideB",
            "label": "Insurance Coverage Dispute (CGL)",
            "appliesIf": "insurerDeniedOrDisputedCoverage",
            "baseProbability": [
              0.45,
              0.65
            ],
            "note": "Coverage litigation resolves the LEGAL question (duty to defend/indemnify, exclusion scope) in a published opinion while the dollar consequences flow through confidential settlements downstream — only 1 of 3 sampled cases disclosed even a damages floor for the underlying claim. Base rate kept at the original preliminary estimate; treat any output for this claim type as a coverage-yes/no signal more than a dollar estimate.",
            "damages": {
              "formula": "coveredPortionOfUnderlyingDefectDamages"
            }
          }
        }
      },
      "environmental": {
        "label": "Environmental",
        "roles": {
          "sideA": "Property Owner / PRP",
          "sideB": "Government / Other PRPs / Insurer"
        },
        "claimTypes": {
          "cercla_cost_recovery": {
            "side": "sideA",
            "label": "CERCLA Cost Recovery",
            "appliesIf": "contaminationIdentifiedAndCleanupCostsIncurred",
            "baseProbability": [
              0.65,
              0.85
            ],
            "note": "Almost every disclosed CERCLA cost-recovery outcome in the research sample is a NEGOTIATED settlement, not an adversarial verdict — liability is strict/joint/several once PRP status attaches, so litigation is mostly about allocation share, not a binary win/loss. Treat the probability range as 'likelihood of obtaining a meaningful allocation,' not 'likelihood of prevailing at trial.'",
            "damages": {
              "formula": "totalCleanupCost * allocationShare",
              "note": "allocationShare is now driven by a real, well-documented doctrinal fork rather than a flat guess: whether the plaintiff-owner qualifies as a CERCLA Sec. 107(b) 'innocent landowner' (see Advanced Tech. Corp. v. Eliskim, Inc., No. 1:96CV755 (N.D. Ohio 2000), laying out the 5-factor test) determines whether they can bring a full Sec. 107(a) cost-recovery claim (recovering the entire cost) or are functionally limited to a contribution-style claim (recovering only the other party's equitable share) -- computed directly in evalEnvironmental() in the engine based on the innocentLandownerStatus fact. This is federal doctrine, not state-varying, so no state-law modifier applies here the way it did for lending-foreclosure or construction-defect.",
              "benchmarkTiers": {
                "waterwayOrMultiDecadeLegacyIndustrialCorridor": {
                  "range": [
                    130000000,
                    670000000
                  ],
                  "note": "contamination migrated into sediment/groundwater/surface water over decades, affecting a wide area beyond the original parcel — Lower Duwamish Waterway $668M, Solvay PFAS $393M, Raritan Bay Slag $151.1M, Anaconda Smelter $131.3M"
                },
                "singleParcelSoilOnly": {
                  "range": [
                    3000000,
                    19000000
                  ],
                  "note": "contamination confined to one parcel, no significant off-site migration — Ringwood Mines final phase $3.4M, Riverside Industrial Park ~$18.8M"
                },
                "smallCommercialStateEnforcementPenalty": {
                  "range": [
                    85000,
                    120000
                  ],
                  "note": "single gas station or strip-mall dry cleaner state AG enforcement — civil penalty only, separate from and much smaller than the underlying remediation cost (often undisclosed)"
                }
              }
            }
          },
          "cercla_contribution_claim": {
            "side": "sideA",
            "label": "CERCLA Contribution (PRP vs. PRP)",
            "appliesIf": "multiplePRPsAndOneHasPaidDisproportionateShare",
            "baseProbability": [
              0.55,
              0.8
            ],
            "damages": {
              "formula": "totalCleanupCost * (coDefendantEquitableShare)",
              "researchNote": "Courts apply equitable 'Gore factor' adjustments that REDUCE a mechanically-calculated proportional share (Trinity Industries: raw calculation gave 83% to one party, equitable factors reduced it to 62%). A recurring, important limit: the 'orphan share' — costs attributable to defunct, judgment-proof, or unidentifiable historical operators — is often unrecoverable and falls back onto the contribution plaintiff itself (Barclay Lofts: one historical operator's 20% share was assigned as an orphan share the plaintiff must absorb)."
            }
          },
          "state_cleanup_consent_decree": {
            "side": "sideA",
            "label": "State Cleanup Order / Consent Decree",
            "appliesIf": "stateAgencyEnforcementActionOrConsentDecree",
            "note": "This is a negotiated-resolution benchmark, not an adversarial win/lose probability -- nearly all consent decrees are cooperative settlements. Model as a cleanup-cost benchmark lookup by contamination type/site size (from EPA/state settlement data) rather than a probability x damages calculation.",
            "damages": {
              "formula": "benchmarkCleanupCostBySiteProfile",
              "isBenchmarkOnly": true
            }
          },
          "environmental_insurance_coverage_dispute": {
            "side": "sideB",
            "label": "Environmental Insurance Coverage Dispute",
            "appliesIf": "insurerDeniedEnvironmentalCoverage",
            "baseProbability": [
              0.25,
              0.45
            ],
            "note": "Original preliminary sample (3 cases) skewed toward insurers winning on pollution-exclusion/site-development-exclusion grounds (Regency Centers v. Indian Harbor: no coverage owed for legacy dry-cleaner contamination). Sample since broadened to 5 cases with two real policyholder wins added (Town of Harrietstown v. Westchester Fire; County of San Bernardino v. Ins. Co. of the State of PA, both 2026) -- a more balanced 2-insurer-win/2-policyholder-win/1-pending picture, though still too small a sample to justify moving the probability range with real confidence. None of the sampled cases disclosed the underlying remediation-cost dollar figure — the disclosed 'outcome' in this claim type is frequently binary (coverage owed / not owed) rather than a dollar figure.",
            "damages": {
              "formula": "coveredPortionOfCleanupCosts"
            }
          }
        }
      },
      "eminent-domain": {
        "label": "Eminent Domain",
        "roles": {
          "sideA": "Property Owner",
          "sideB": "Condemning Authority"
        },
        "claimTypes": {
          "just_compensation_valuation": {
            "side": "sideA",
            "label": "Just Compensation Valuation Dispute",
            "appliesIf": "condemnationFiledAndOwnerDisputesInitialOffer",
            "note": "Best modeled as a valuation-uplift benchmark rather than a win/lose probability -- the property IS being taken; the litigated question is how much more than the initial offer the owner ultimately recovers.",
            "damages": {
              "formula": "initialOffer * (1 + upliftPercentage)",
              "tiers": {
                "routineComparableSalesValuation": {
                  "upliftPercentage": [
                    0.5,
                    1.0
                  ],
                  "note": "Objectively comparable market sales drive the dispute (NC DOT v. AJA Investments: 66% increase). Narrowest, most predictable spread."
                },
                "severanceAccessOrBusinessValueDispute": {
                  "upliftPercentage": [
                    2.0,
                    5.0
                  ],
                  "note": "Severance damages, access/business-value loss, or specialized-use improvements (billboards, medical buildings) with no single accepted valuation methodology. VDOT Fairfax retailer case: ~49x; Gleannloch Commercial: 292% (~3.9x); Inglewood VFW Post: 5.2x. Wide, unpredictable spread — use the low end absent a clear severance/business-value component."
                }
              },
              "fullDefenseRisk": "A right-to-take or blight-designation challenge can VOID an already-adjudicated compensation award entirely rather than raise or lower it — PKO Ventures v. Norfolk RHA (VA 2013) voided a ~$3.4-3.75M jury award when the underlying blight designation was found invalid. Flag this as a distinct binary risk in the UI, separate from the valuation-uplift math above."
            }
          },
          "quick_take_challenge": {
            "side": "sideA",
            "label": "Quick-Take / Public-Use Challenge",
            "appliesIf": "ownerChallengingTheTakingItself",
            "baseProbability": [
              0.05,
              0.15
            ],
            "note": "Confirmed low (kept at 0.05–0.15): courts are highly deferential to public-use/necessity determinations post-Kelo. Note the separate, longer-running track: withdrawing a quick-take deposit does NOT waive a right-to-take challenge (LA MTA v. Alameda Produce Market), so an owner isn't forced to choose between needed cash now and continuing to fight the taking's legality.",
            "damages": {
              "formula": "not a damages claim -- injunctive relief blocking/delaying the taking",
              "isRange": false
            }
          },
          "pre_condemnation_access_dispute": {
            "side": "sideA",
            "label": "Pre-Condemnation Survey/Access Dispute",
            "appliesIf": "ownerOpposingSurveyOrAccessRequest",
            "baseProbability": [
              0.05,
              0.2
            ],
            "note": "Narrowed down from the original preliminary range: courts in this sample consistently sided with the entity seeking access once it showed a plausible path to eminent-domain authority (PSEG v. Arentz Family; Summit Carbon Solutions v. Malloy) — this essentially never carries a compensation figure since that's not what's being litigated. A separate, live track (challenging the underlying eminent-domain authority itself, as in Texas Rice Land Partners v. Denbury) can still defeat the taking down the line, but that's a different claim, not this one.",
            "damages": {
              "formula": "not typically a damages claim pre-taking",
              "isRange": false
            }
          },
          "regulatory_taking": {
            "side": "sideA",
            "label": "Regulatory Taking (Penn Central / Lucas)",
            "appliesIf": "allegingRegulatoryActionEliminatedOrSeverelyImpairedValue",
            "baseProbability": [
              0.1,
              0.25
            ],
            "note": "Regulatory takings claims rarely succeed absent a total wipeout of economic value; refine from research",
            "damages": {
              "formula": "fairMarketValueOfInterestTaken",
              "researchNote": "When a regulatory taking IS found compensable, damages tend toward the FULL pre-regulation value, not a negotiated figure (Lost Tree Village Corp.: $4.2M = full appraised value for a 99.4% economic wipeout). Resolution takes far longer than direct condemnation and often bounces between courts multiple times before any dollar figure is fixed (DeVillier v. Texas remanded on the threshold cause-of-action question alone; Arkansas Game & Fish Commission took a SCOTUS trip plus a Federal Circuit remand)."
            }
          },
          "eminent_domain_attorney_fees": {
            "side": "sideA",
            "label": "Attorney's Fees (Fee-Shifting)",
            "appliesIf": "estimatedAwardExceedsOfferByStatutoryThresholdPct",
            "note": "State-specific fee-shifting statute (see eminentDomainAttorneyFees, 51-jurisdiction research) -- only modeled as a dollar claim where the state's rule is a clean percentage-above-the-offer threshold; every other state's real, cited rule is still surfaced in the valuation note even when not mechanized into its own claim.",
            "damages": {
              "formula": "fraction of (estimatedAward - initialOffer), using the state's own statutory cap fraction where the research found one, else a general reasonable-fees proxy"
            }
          }
        }
      },
      "zoning-land-use": {
        "label": "Zoning & Land Use",
        "roles": {
          "sideA": "Property Owner / Developer",
          "sideB": "Municipality / Zoning Authority"
        },
        "claimTypes": {
          "variance_permit_denial_appeal": {
            "side": "sideA",
            "label": "Variance / Permit Denial Appeal",
            "appliesIf": "varianceOrPermitDenied && appealFiled",
            "baseProbability": [
              0.25,
              0.45
            ],
            "note": "Small 4-case sample roughly consistent with the original estimate (2 reversed, 1 affirmed, 1 undisclosed-on-remand) — kept unchanged pending a larger sample.",
            "damages": {
              "formula": "not typically a damages claim -- injunctive relief (permit ordered granted) or remand",
              "isRange": false
            }
          },
          "spot_zoning_challenge": {
            "side": "sideB",
            "label": "Spot Zoning Challenge",
            "appliesIf": "zoningChangeChallengedAsSpotZoning",
            "baseProbability": [
              0.3,
              0.5
            ],
            "damages": {
              "formula": "not typically a damages claim -- declaratory relief invalidating the zoning change",
              "isRange": false
            },
            "note": "Revised UP from the original preliminary estimate based on an initial 3-case sample that was 3-for-3 successful (Allen Distribution, Lathan, Chaffier) — flagged at the time as possibly outcome-selection-biased, since successful challenges are more likely to get published/cited as precedent than unsuccessful ones. A 4th case (Burd v. Borough of Brentwood, 2023) has since been added and is a real, confirmed LOSS -- the rezoning was upheld, not invalidated. The sample is now 3-for-4 (75%), still small and still above the current 0.3-0.5 range, so the range is left unchanged rather than chased upward from 4 data points -- but the earlier pure-selection-bias concern is at least partly addressed by having a real counterexample in the sample now. Remedy is categorically injunctive/declaratory (invalidating the ordinance), never damages."
          },
          "section_1983_zoning_claim": {
            "side": "sideA",
            "label": "Section 1983 Civil Rights Claim (Arbitrary/Discriminatory Denial)",
            "appliesIf": "allegingArbitraryOrDiscriminatoryZoningAction",
            "baseProbability": [
              0.1,
              0.2
            ],
            "note": "Base rate narrowed down (only 2 of 8 sampled cases produced a disclosed plaintiff recovery) — ordinary administrative error or an arguably wrong denial is NOT enough on its own, even one that costs a developer millions (Rubicon Real Estate Holdings v. City of Pontiac). The modifiers above are the actual determinants; apply the base rate only when none of them are present. When a claim DOES succeed with a disclosed figure, awards run large (Del Monte Dunes $1.45M, Orangetown v. Magee $5.14M+fees) because the injury is a whole project's lost value, not a rent stream — and mandatory fee-shifting under 42 U.S.C. § 1988 stacks on top of the merits recovery for a prevailing plaintiff, though it's irrelevant in the large majority of cases where the municipality prevails.",
            "damages": {
              "formula": "compensatoryDamages (lost value/profits) + attorneyFees (mandatory fee-shifting if prevailing)",
              "isRange": true
            },
            "modifiers": [
              {
                "if": "vestedRightPlusGovernmentBadFaith",
                "probability": [
                  0.45,
                  0.7
                ],
                "note": "e.g. permit already issued and substantial money spent, then the code amended specifically to kill the project (Orangetown v. Magee)"
              },
              {
                "if": "longPatternOfShiftingIncreasinglySevereRequirements",
                "probability": [
                  0.35,
                  0.55
                ],
                "note": "regulatory-taking theory built on repeated rejections over years (Del Monte Dunes: five rejections)"
              },
              {
                "if": "completeAbsenceOfNoticeOrHearing",
                "probability": [
                  0.4,
                  0.6
                ],
                "note": "pure procedural due process is more forgiving than substantive due process or equal protection (Nasierowski)"
              },
              {
                "if": "directEvidenceOfDiscriminatoryIntent",
                "probability": [
                  0.3,
                  0.5
                ],
                "note": "protected-class disparate treatment (Avenue 6E Investments got past summary judgment where facially similar cannabis/permit-delay cases without this element failed)"
              }
            ]
          },
          "development_agreement_breach": {
            "side": "sideA",
            "label": "Development Agreement Breach",
            "appliesIf": "developmentAgreementAllegedlyBreached",
            "baseProbability": [
              0.45,
              0.7
            ],
            "damages": {
              "formula": "comparable-case-informed range (lost development profit, cost overruns, or reliance damages depending on posture)"
            },
            "note": "Sample expanded from 2 to 5 citations (added Township of Salem -- an actual loss for the developer, though on a different fact pattern (the government recovering FROM the developer for defective improvements, not the developer's own breach claim failing); 5th & Walnut Parking -- another clean win, $4.3M+, Iowa Supreme Court 2026; and PML v. Village of Hawthorn Woods -- a large final recovery for the developer, but only after a multi-year, multi-reversal saga, and net of a real, substantial offsetting counterclaim the Village won against the developer). Despite specifically searching for one, a clean FINAL loss on a developer's own affirmative breach-of-development-agreement claim was still not found -- worth noting as a real, if modest, pattern rather than assuming the search was simply incomplete: a documented breach claim against a municipality may be more likely to have real merit by the time it's litigated to a final, citable decision, or weaker claims may settle out earlier without leaving comparable public documentation. Base rate kept at the original preliminary estimate; treat the high end of the damages range with real confidence (all of the well-documented anchor cases involve real, large recoveries) but the probability range as still not fully calibrated."
          }
        }
      },
      "premises-liability": {
        "label": "Premises Liability / Negligence",
        "roles": {
          "sideA": "Property Owner / Occupier",
          "sideB": "Injured Party / Claimant"
        },
        "claimTypes": {
          "slip_and_fall_hazardous_condition": {
            "side": "sideB",
            "label": "Slip-and-Fall / Hazardous Condition",
            "appliesIf": "slipAndFallAlleged && medicalSpecialsIncurred > 0",
            "baseProbability": [0.35, 0.55],
            "modifiers": [
              { "if": "hazardNoticeProven === 'yes'", "probability": [0.55, 0.75], "note": "Actual or constructive notice of the hazard has been proven" },
              { "if": "hazardNoticeProven === 'no'", "probability": [0.12, 0.28], "note": "No notice evidence identified -- the single most common reason a slip-and-fall claim fails, per Albertsons, LLC v. Mohammadi" }
            ],
            "damages": {
              "formula": "medicalSpecialsIncurred * severityMultiplier[injurySeverity] + lostWagesClaimed, then adjusted for the state's comparative/contributory fault rule",
              "note": "Uses the general-damages 'multiplier method' common in personal-injury claims practice -- an industry rule-of-thumb, not itself drawn from a specific cited case."
            }
          },
          "inadequate_security_third_party_crime": {
            "side": "sideB",
            "label": "Inadequate Security / Third-Party Criminal Act",
            "appliesIf": "inadequateSecurityAlleged && medicalSpecialsIncurred > 0",
            "baseProbability": [0.18, 0.32],
            "modifiers": [
              { "if": "priorSimilarCrimeIncidents", "probability": [0.45, 0.68], "note": "Prior similar incidents on the property (or in its immediate vicinity) are the single most important foreseeability fact in this claim type -- see Georgia CVS Pharmacy, LLC v. Carmichael" }
            ],
            "damages": {
              "formula": "medicalSpecialsIncurred * severityMultiplier[injurySeverity] + lostWagesClaimed, then adjusted for the state's comparative/contributory fault rule",
              "note": "Requires proving the criminal act was reasonably FORESEEABLE to the property owner -- a genuinely harder bar than an ordinary hazard claim."
            }
          },
          "negligent_maintenance_structural_failure": {
            "side": "sideB",
            "label": "Negligent Maintenance / Structural Failure",
            "appliesIf": "structuralFailureAlleged && medicalSpecialsIncurred > 0",
            "baseProbability": [0.40, 0.60],
            "damages": {
              "formula": "medicalSpecialsIncurred * severityMultiplier[injurySeverity] + lostWagesClaimed, then adjusted for the state's comparative/contributory fault rule",
              "note": "Durable structural defects (collapsed railings, failed stairs, defective elevators) are typically easier to prove than a transient hazard, since the defect itself can be established through inspection and expert testimony rather than relying on notice timing."
            }
          },
          "dangerous_condition_failure_to_warn": {
            "side": "sideB",
            "label": "Dangerous Condition / Failure to Warn",
            "appliesIf": "failureToWarnAlleged && medicalSpecialsIncurred > 0",
            "baseProbability": [0.35, 0.55],
            "modifiers": [
              { "if": "openAndObviousDefenseRaised", "probability": [0.15, 0.30], "note": "The open-and-obvious doctrine is a real and often successful defense specifically against a pure warning theory" }
            ],
            "damages": {
              "formula": "medicalSpecialsIncurred * severityMultiplier[injurySeverity] + lostWagesClaimed, then adjusted for the state's comparative/contributory fault rule",
              "note": "Turns on whether the danger was hidden/non-obvious -- a genuinely open-and-obvious hazard defeats a pure failure-to-warn theory in most jurisdictions, though a growing number of courts still allow a separate failure-to-REMEDY theory even where the warning theory fails."
            }
          },
          "premises_punitive_damages": {
            "side": "sideB",
            "label": "Punitive Damages",
            "appliesIf": "egregiousConductAllegedForPunitives && at least one injury claim above applies",
            "baseProbability": [0.08, 0.20],
            "damages": {
              "formula": "computePunitiveDamagesAvailability(facts, compensatoryLow, compensatoryHigh) -- state-specific evidentiary standard and cap; several states PROHIBIT punitive damages in an ordinary premises claim entirely, or require a specific enabling statute (STATUTE-ONLY) -- see premisesLiabilityStateModifiers",
              "note": "Requires proof the property owner's conduct was willful, wanton, or in reckless disregard of a known danger -- ordinary negligence never supports punitive damages, no matter how severe the resulting injury."
            }
          }
        }
      }
    },
    "aggregation": {
      "expectedValue": "probabilityRange x damagesRange -> range, never a point estimate",
      "categorySelection": "user first selects which of the 8 tracked litigation categories their matter falls under; only that category's claim types and role labels (sideA/sideB) are shown",
      "sideATotal": "sum of sideA-favoring claim expected values within the selected category",
      "sideBTotal": "sum of sideB-favoring claim expected values within the selected category",
      "netPosition": "sideATotal - sideBTotal, presented from whichever side the user identified as",
      "benchmarkOnlyClaims": "claim types marked isBenchmarkOnly (e.g. state_cleanup_consent_decree) are shown as a comparable-outcome range, not folded into the probability x damages net-position math -- these are negotiated/cooperative resolutions, not adversarial win/lose outcomes"
    }
  },
  "citations": {
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
      },
      {
        "caseName": "Sclafani Properties, LLC v. Sport-N-Life Distributing, LLC",
        "citation": "198 Conn. App. 292 (2020)",
        "jurisdiction": "CT",
        "year": 2020,
        "outcome": "Landlord sued a commercial lessee and its guarantor for unpaid amounts due under a lease of property at 482 Glenbrook Road, Stamford. The trial court (an attorney trial referee) awarded the landlord damages and $6,391.63 in attorney's fees; the landlord appealed, arguing the court erred by not including unpaid real estate taxes owed under the lease in the judgment and by awarding only that amount in fees.",
        "dollarAmount": 6392,
        "sourceUrl": "https://law.justia.com/cases/connecticut/court-of-appeals/2020/ac40066.html",
        "confidence": "low",
        "notes": "INCOMPLETE VERIFICATION: only the $6,391.63 attorney's-fee component and the general procedural posture (landlord appealing for a larger recovery, including real estate taxes) were confirmed from available secondary sources -- the full opinion text was not directly accessible, so the underlying base rent judgment amount and the Appellate Court's ultimate holding on the real-estate-tax and fee issues are NOT confirmed here. Included primarily because it's a real, citable, tenant-AND-guarantor unpaid-rent judgment distinct from the other citations in this claim type, but treat the dollarAmount and outcome with more caution than any other citation in this dataset -- verify directly against the full opinion before relying on it."
      },
      {
        "caseName": "WEC 98C-3 LLC v. SFA Holdings Inc.",
        "citation": "99 F.4th 961 (7th Cir. 2024)",
        "jurisdiction": "Federal (7th Cir., applying IL law)",
        "year": 2024,
        "outcome": "Department store operator CPS leased anchor retail space in an Illinois mall from WEC 98C-3 LLC; Saks Inc. (CPS's corporate affiliate) guaranteed CPS's rent obligations. When CPS stopped paying rent, Saks made no payments under the guaranty either, contributing to the landlord's own mortgage default and the property's sale at foreclosure to a successor landlord. The successor sued Saks on the guaranty. The Seventh Circuit affirmed judgment holding Saks liable for CPS's unpaid rent from February 2018 through September 2022 -- more than four and a half years -- plus 9% interest under the lease's penalty provision, rejecting Saks's affirmative defenses because the guaranty's waiver-of-defenses clause expressly barred asserting any defense to liability.",
        "dollarAmount": null,
        "sourceUrl": "https://law.justia.com/cases/federal/appellate-courts/ca7/23-1489/23-1489-2024-04-24.html",
        "confidence": "high",
        "notes": "A strong, current, appellate-affirmed illustration of two compounding features this claim type should account for when a corporate guarantor is involved: (1) a multi-year unpaid-rent exposure period (4.5+ years here) plus statutory/contractual interest can dwarf the base monthly rent figure, and (2) a broadly-worded guaranty waiver-of-defenses clause can foreclose essentially every defense the guarantor might otherwise raise, including ones related to the landlord's own subsequent default and foreclosure. dollarAmount left null since the specific total judgment figure (rent x 55+ months x lease rate, plus compounding 9% interest) was not independently confirmed from available sources, though the multi-year exposure period itself is well documented."
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
      },
      {
        "caseName": "The Village at Brocks Gap, LLC v. Singleton Ventures, LLC",
        "citation": "Case No. CV-2020-900604 (Cir. Ct. Jefferson Cnty., Ala., Bessemer Div.) (Pl.'s Mot. Summ. J., filed Feb. 17, 2022)",
        "jurisdiction": "AL",
        "year": 2022,
        "outcome": "Landlord sought summary judgment on breach of a 20.5-year grocery-store shopping-center lease after the tenant defaulted and abandoned the premises. The damages methodology in the motion and supporting affidavit computed gross unpaid past rent ($677,726.58) plus gross future accelerated rent ($8,814,297.71), net of specific dollar credits for three actual/anticipated replacement tenants (down to $6,061,315.06), then discounted that net future-rent figure to present value using a 6.0% annual rate reflecting a replacement tenant's anticipated creditworthiness -- yielding $3,511,451.08 and total rental damages of $4,189,177.66. This is the requested relief as of the February 2022 filing; no order or judgment on the motion was reviewed, so this illustrates the damages methodology, not a confirmed award.",
        "dollarAmount": 4189177,
        "url": null,
        "confidence": "high",
        "notes": "Primary source: full motion, brief, and supporting affidavit read directly. The best available real-world illustration in this dataset of the standard commercial-lease accelerated-rent methodology -- present-value discounting of NET future rent (required under, e.g., HealthSouth Rehabilitation Corp. v. Falcon Management Co., 799 So.2d 177, 185 (Ala. 2001)), itemized dollar-for-dollar credit for specific replacement tenants rather than a flat mitigation percentage, and a distinct re-leasing/mitigation-costs damages category (see releasing_mitigation_costs citations). No public URL available for this record -- verify via the case number and court above."
      },
      {
        "caseName": "Cummings Properties, LLC v. Hines",
        "citation": "101 Mass. App. Ct. 1108 (2022) (unpublished)",
        "jurisdiction": "MA",
        "year": 2022,
        "outcome": "Lease's acceleration clause let the landlord retake possession, re-let the premises, collect the new tenant's rent, AND recover the full remaining rent owed by the defaulting tenant for the balance of the original term -- with no requirement to credit or account for the rent actually collected from the replacement tenant. The Appeals Court held this 'double-dip' structure was an unenforceable penalty rather than valid liquidated damages.",
        "dollarAmount": 0,
        "sourceUrl": "https://caselaw.findlaw.com/court/ma-court-of-appeals/2067888.html/",
        "confidence": "high",
        "notes": "Directly validates this claim's reletOverride mechanic: an acceleration clause that does NOT net out actual replacement rent before calculating the accelerated-rent claim is a real, live penalty risk, not a theoretical one -- this is the same landlord (Cummings Properties) that WON on a similarly large accelerated-rent claim in the companion 2007 citation below, where the clause's structure avoided this double-dip problem. The contrast between the two Cummings cases is itself instructive: it's the accounting-for-re-let-rent mechanic that determines enforceability, not the size of the claim or the landlord's identity."
      },
      {
        "caseName": "Cummings Properties, LLC v. National Communications Corp.",
        "citation": "449 Mass. 490, 869 N.E.2d 617 (2007)",
        "jurisdiction": "MA",
        "year": 2007,
        "outcome": "The Massachusetts Supreme Judicial Court held a liquidated damages clause entitling the landlord to nearly five years of remaining rent payments after tenant default was enforceable as valid liquidated damages, not a penalty, even though the landlord had re-let the premises.",
        "dollarAmount": null,
        "sourceUrl": "https://www.richmaylaw.com/case-alert-a-massachusetts-appeals-court-strikes-down-a-commercial-landlords-right-to-collect-acceleration-of-rent-on-tenant-default/",
        "confidence": "high",
        "notes": "The landlord's 2007 win here (large accelerated-rent recovery upheld despite re-letting) versus its 2022 loss in the companion Hines citation above turns on exactly the distinction this claim's damages formula is built around -- properly accounting for re-let income versus impermissibly double-dipping."
      }
    ],
    "releasing_mitigation_costs": [
      {
        "caseName": "The Village at Brocks Gap, LLC v. Singleton Ventures, LLC",
        "citation": "Case No. CV-2020-900604 (Cir. Ct. Jefferson Cnty., Ala., Bessemer Div.) (Pl.'s Mot. Summ. J., filed Feb. 17, 2022)",
        "jurisdiction": "AL",
        "year": 2022,
        "outcome": "In addition to past and accelerated future rent, the landlord's motion sought $714,926.86 in costs incurred/anticipated to re-lease the premises to three replacement tenants -- itemized as landlord's work (buildout), tenant-improvement allowances, and leasing commissions for each replacement lease -- as damages proximately caused by the tenant's breach and abandonment under the lease's default-remedies clause. These costs represented roughly 17% of the total damages sought ($714,926.86 of $4,904,104.52 combined rental and re-leasing damages).",
        "dollarAmount": 714926,
        "url": null,
        "confidence": "high",
        "notes": "Primary source: full motion, brief, and supporting affidavit read directly. Same filing as the accelerated_rent citation above -- illustrates that re-leasing/mitigation costs are a distinct, separately itemized, and potentially large damages category, not folded into the rent-acceleration figure. No public URL available for this record -- verify via the case number and court above."
      },
      {
        "caseName": "Brixmor GA Seacoast Shopping Center LLC v. NH1 Motorplex LLC",
        "citation": "No. 2025-0067 (N.H. Sup. Ct.)",
        "jurisdiction": "NH",
        "year": 2026,
        "outcome": "Trial court awarded the landlord damages for breach of a commercial lease agreement including 'landlord work' and 'tenant allowance' costs -- the tenant argued on appeal that the landlord was not entitled to recover these categories. The New Hampshire Supreme Court affirmed the trial court's award.",
        "dollarAmount": null,
        "url": "https://www.courts.nh.gov/sites/g/files/ehbemt471/files/documents/2026-03/20250067.pdf",
        "confidence": "medium",
        "notes": "This is a Rule 3 summary-disposition-style appellate order; the specific dollar figures for the landlord-work and tenant-allowance line items were not independently confirmed from secondary reporting, only that the trial court's recovery theory itself was affirmed on appeal. Useful as current (2026), state-supreme-court-level confirmation that landlord-work and tenant-allowance costs are a recognized, recoverable damages category after tenant breach -- corroborating the Village at Brocks Gap citation above with a second, independent jurisdiction."
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
      },
      {
        "caseName": "Spatz v. 2263 North Lincoln Corp.",
        "citation": "2013 IL App (1st) 122076",
        "jurisdiction": "IL",
        "year": 2013,
        "outcome": "Successor property owner sued a commercial tenant for eviction and back rent after the lease expired; the tenant claimed it had validly exercised a purchase option before the lease expired and therefore had a right to remain in possession. The Illinois Appellate Court affirmed denial of the landlord's request for statutory double rent, holding a holdover tenant who stays for 'colorably justifiable reasons' -- a reasonable, good-faith claim of a right to occupy -- is not subject to the double-rent penalty even though it did, in fact, hold over.",
        "dollarAmount": null,
        "sourceUrl": "https://paulporvaznik.com/commercial-landlord-not-entitled-to-double-rent-under-holdover-statute-where-tenant-had-legitimate-belief-it-had-right-to-possess-space-il-1st-dist/9591",
        "confidence": "high",
        "notes": "A second, independent limitation on double-rent recovery distinct from the Lincoln Oldsmobile demand-precondition above -- here it's a good-faith colorable claim of right to possess, not any procedural failure by the landlord, that defeats the statutory penalty. Both citations point the same direction: courts read holdover-penalty statutes narrowly against automatic doubling."
      },
      {
        "caseName": "Coinmach Corp. v. Aspenwood Apartment Corp.",
        "citation": "417 S.W.3d 909 (Tex. 2013)",
        "jurisdiction": "TX",
        "year": 2013,
        "outcome": "Coinmach leased space at an apartment complex to install and service coin-operated laundry machines under a 10-year contract; a 1994 foreclosure sale terminated the lease, but Coinmach refused to vacate for roughly six years, becoming a tenant at sufferance. The new owner, Aspenwood, sued for trespass, DTPA violations, and tortious interference -- specifically that Coinmach's continued refusal to leave blocked Aspenwood from contracting with a replacement laundry vendor. A jury awarded Aspenwood approximately $1.5 million (actual damages plus DTPA treble damages and exemplary damages). The Texas Supreme Court held that a tenant at sufferance is a trespasser who CAN be held liable in tort, including for tortious interference with the landlord's own prospective business relations, remanding for further review of whether the interference element was properly proven.",
        "dollarAmount": 1500000,
        "sourceUrl": "https://caselaw.findlaw.com/court/tx-supreme-court/1651463.html",
        "confidence": "high",
        "notes": "Directly relevant to what a landlord's damages can look like when a holdover tenant isn't just failing to pay double rent, but is actively blocking the landlord's ability to strike a NEW deal with a replacement tenant or vendor -- a real, substantial (~$1.5M jury-awarded, high-court-affirmed-in-part) tort theory beyond the statutory holdover penalty modeled elsewhere in this claim type's damages formula. Worth flagging as a distinct, additive damages theory when facts show the holdover specifically obstructed an identifiable replacement deal, not just ordinary continued occupancy."
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
      },
      {
        "caseName": "The Village at Brocks Gap, LLC v. Singleton Ventures, LLC",
        "citation": "Case No. CV-2020-900604 (Cir. Ct. Jefferson Cnty., Ala., Bessemer Div.) (Pl.'s Mot. Summ. J., filed Feb. 17, 2022)",
        "jurisdiction": "AL",
        "year": 2022,
        "outcome": "The landlord's motion sought attorneys' fees of $52,905.00 plus $3,526.06 in costs -- together representing only about 1.3% of the $4,189,177.66 in rental damages sought in the same filing. IMPORTANT SCOPE NOTE (per counsel of record): this matter was essentially UNCONTESTED -- the tenant and guarantor did not meaningfully oppose summary judgment, and the court was asked to enter judgment for the exact amount sought. This low fee ratio reflects an unopposed rocket-docket resolution, not a genuinely contested matter with real discovery, motion practice, and possible trial -- a contested matter of the same size would see meaningfully higher fees, likely several times this ratio.",
        "dollarAmount": 52905,
        "url": null,
        "confidence": "high",
        "notes": "Same filing as the accelerated_rent and releasing_mitigation_costs citations for this category. Anchors the LOW/uncontested end of the fee-to-damages ratio for a large accelerated-rent claim -- do not extrapolate this ratio to a contested matter; contrast with the smaller claims in this array, where fees run a much higher percentage of the principal. No public URL available for this record -- verify via the case number and court above."
      }
    ],
    "property_damage": [
      {
        "caseName": "Apple Glen Investors, L.P. v. Express Scripts, Inc.",
        "citation": "700 Fed. Appx. 935 (11th Cir. 2017)",
        "jurisdiction": "Federal (11th Cir., applying GA law)",
        "year": 2017,
        "outcome": "Landlord awarded over $6.2 million for tenant's failure to return the premises in the 'first class condition' the lease required, based on 26 listed deficiencies identified by the landlord's expert. The Eleventh Circuit affirmed, rejecting the tenant's arguments that the expert testimony was unreliable and that the damages should have been split out defect-by-defect rather than assessed as a whole.",
        "dollarAmount": 6200000,
        "url": "https://law.justia.com/cases/federal/appellate-courts/ca11/16-17656/16-17656-2017-07-03.html",
        "confidence": "high",
        "notes": "Large, affirmed property-damage/surrender-condition award; useful as a high-end data point for claims tied to a lease's specific condition-on-return standard rather than ordinary wear and tear."
      },
      {
        "caseName": "45 Broadway Owner LLC v. NYSA-ILA Pension Trust Fund",
        "citation": "2013 NY Slip Op 04895 (App. Div., 1st Dep't, June 27, 2013)",
        "jurisdiction": "NY",
        "year": 2013,
        "outcome": "Trial court had awarded the landlord $166,013.96 for HVAC/flood repair costs. The Appellate Division reversed and granted the tenant's cross-motion for summary judgment instead, holding a mutual waiver-of-subrogation/casualty-release clause in the lease (Sections 7.03/7.04) barred the landlord's claim entirely, regardless of the tenant's fault.",
        "dollarAmount": 0,
        "url": "https://www.courtlistener.com/opinion/2593554/45-broadway-owner-llc-v-nysa-ila-pension-trust-fund/",
        "confidence": "high",
        "notes": "Not a landlord-recovery data point -- included as a real, binding illustration that a mutual waiver-of-subrogation/casualty-release clause (common in commercial leases) can completely bar an otherwise well-evidenced property-damage claim. This claim's baseProbability range assumes no such clause; a lease containing one would take a property damage claim toward $0 regardless of the repair evidence. Flagged for a possible future model refinement (a lease-clause question) rather than folded into the current formula unilaterally."
      },
      {
        "caseName": "Howe v. Professional Manivest, Inc.",
        "citation": "829 P.2d 160, 164 (Utah Ct. App. 1992)",
        "jurisdiction": "UT",
        "year": 1992,
        "outcome": "In a dispute centering on a ground lessee's material breach (unauthorized assignments/encumbrances of the leasehold plus persistent weed growth violating a city ordinance), the court articulated the governing standard for what a tenant is obligated to repair: damage the tenant must repair or pay for 'is not that which is caused by ordinary wear and tear, but by the tenant's willful conduct or negligence and which amounts to waste.'",
        "dollarAmount": null,
        "sourceUrl": "https://www.courtlistener.com/opinion/1423966/howe-v-professional-manivest-inc/",
        "confidence": "medium",
        "notes": "DOCTRINAL CITATION, not a dollar comparable -- the underlying case is a lease-forfeiture dispute (unauthorized assignment plus a municipal weed-ordinance violation), not a repair-cost recovery, and its own damages figures (liquidated damages for continued use, costs, attorney fees) don't map onto this claim's propertyDamageAmount formula. What it DOES supply is the actual legal standard the normalWearHaircut parameter is meant to operationalize: the wear-vs-waste line turns on the tenant's willful conduct or negligence, not just visible deterioration. Cited for that standard specifically, the way a claim's underlying legal test is cited even when the case supplying it isn't itself a clean damages comparable."
      }
    ],
    "tortious_interference_lost_profits": [
      {
        "caseName": "EXRP 14 Holdings LLC v. LS-14 Ave LLC",
        "citation": "Index No. 652698/2022 (N.Y. Sup. Ct., Com. Div., Oct. 7, 2024) (Crane, J.)",
        "jurisdiction": "NY",
        "year": 2024,
        "outcome": "Denied summary judgment dismissing a tortious interference claim, holding that a party who prevents the plaintiff from performing its own contract with a third party can be liable even where the third party exercised a lawful termination right rather than breaching -- the interference lies in disabling the plaintiff's performance, not in inducing a breach.",
        "dollarAmount": null,
        "url": "https://www.courtlistener.com/opinion/10460551/exrp-14-holdings-llc-v-ls-14-ave-llc/",
        "confidence": "medium",
        "notes": "IMPORTANT SCOPE NOTE: this is a construction-delay dispute between commercial parties, not a landlord self-help lockout case -- there is no directly on-point published decision found for a tenant suing its own landlord for tortious interference with the tenant's third-party contracts arising from a lockout, despite multiple search angles. Cited here only for the general doctrine this claim type relies on (interference by disabling a party's own performance is actionable even without inducing a third party's breach). The apparent rarity of a squarely on-point case suggests this theory is infrequently pursued as a stand-alone claim -- most wrongful-lockout plaintiffs recover through the direct lockout claim instead -- which is itself a reason to treat this claim's probability range as more speculative than the other lease-disputes claims until better authority surfaces."
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
      },
      {
        "caseName": "Donegal Associates, LLC v. Christie-Scott, LLC",
        "citation": "Md. Ct. Spec. App. (2020)",
        "jurisdiction": "MD",
        "year": 2020,
        "outcome": "Landlord used self-help to re-enter a hair salon tenant's leased premises, evict the tenant, and take possession of its personal property after default. The circuit court initially awarded the tenant $139,938.87 in compensatory damages for conversion; the Court of Special Appeals reversed and directed entry of judgment for the LANDLORD instead, for $43,304.91 in unpaid rent, holding the self-help reentry was lawful because the landlord was legally entitled to possession and reentry was accomplished peaceably.",
        "dollarAmount": 0,
        "sourceUrl": "https://www.gfrlaw.com/what-we-do/insights/commercial-landlord-has-right-self-help",
        "confidence": "high",
        "notes": "A landlord-WIN counter-example, appellate-level and fully reversed on the merits -- important balance against this claim type's other citations, most of which involve a landlord losing. Confirms the two-part peaceable-and-entitled test for lawful self-help is a real, live defense that can completely defeat a wrongful-lockout claim on appeal even after a plaintiff wins at the trial-court level. dollarAmount reflects the $0 the tenant ultimately recovered on its own claim, not the unpaid-rent judgment entered against it."
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
      },
      {
        "caseName": "Commercial tenant v. SW Delray Artist Alley, LLC",
        "citation": "Palm Beach County, Florida (settled shortly before trial, following an appellate ruling in the tenant's favor)",
        "jurisdiction": "FL",
        "year": 2025,
        "outcome": "Tenant leased a commercial unit in Delray Beach that proved uninhabitable due to toxic mold, asbestos, and volatile organic compounds; the landlord allegedly failed to remediate despite repeated complaints, forcing the tenant to vacate. After the tenant secured a favorable appellate ruling, the case settled for $435,000, covering relocation and restoration costs, shortly before trial.",
        "dollarAmount": 435000,
        "sourceUrl": "https://themold.lawyer/tenant-rights/toxic-commercial-lease-settlement-appeal-success/",
        "confidence": "medium",
        "notes": "Sourced from the plaintiff's own firm's case-results reporting rather than a published opinion or court filing directly reviewed -- the formal case caption and docket number were not independently confirmed, and the specific appellate holding that preceded the settlement is described only in general terms. Included because the underlying facts (toxic mold/asbestos/VOC contamination forcing vacatur, landlord's failure to remediate despite notice) and the settlement figure are specific and plausible, but treat the dollar amount with more caution than the primary-source-verified citations in this claim type."
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
    "foreclosure_deficiency_judgment": [
      {
        "caseName": "The Ardent Companies (Ardent Cos.) v. Baruch Broad Street LLC / Zamir Equities",
        "citation": "Franklin County Court of Common Pleas, Ohio (case no. not independently verified)",
        "year": 2026,
        "outcome": "Ardent's complaint sought a money judgment of $9,320,807 against the borrower/guarantor in addition to foreclosure. After more than a year under receivership, the property was sold at a April 2026 foreclosure auction for $5.1M — less than half its 2022 purchase price of roughly $12M and well short of the ~$9.3M owed, leaving a substantial unrecovered deficiency.",
        "dollarAmount": 9320807,
        "sourceUrl": "https://www.aol.com/news/downtown-columbus-keybank-building-sold-194109422.html",
        "confidence": "high"
      },
      {
        "caseName": "AFF IV 200 Miami LLC v. SRCTD 44-200 LLC and FS Equity Investments II LLC",
        "citation": "Miami-Dade County Circuit Court (Fla.), stipulated foreclosure judgment entered June 11, 2026",
        "year": 2026,
        "outcome": "Miami-Dade Circuit Judge Joseph Perkins granted a stipulated final foreclosure judgment in favor of the lender (through affiliate AFF IV 200 Miami LLC) for $65.7M — $41.1M principal plus accrued interest and fees — clearing the way for both buildings to be sold at online auction.",
        "dollarAmount": 65700000,
        "sourceUrl": "https://therealdeal.com/miami/2026/06/23/stonerock-capital-loses-downtown-miami-office-foreclosure/",
        "confidence": "high"
      },
      {
        "caseName": "Emerald Creek Capital 3 LLC v. BH3-affiliated ownership entities (Hillsboro Beach Resort)",
        "citation": "Broward County Circuit Court (Fla.), final foreclosure judgment entered April 2026",
        "year": 2026,
        "outcome": "Broward County Circuit Judge Martin Bidwill entered a $40M final foreclosure judgment in April 2026. Emerald Creek Capital itself acquired the resort at the resulting July 16, 2026 foreclosure sale.",
        "dollarAmount": 40000000,
        "sourceUrl": "https://therealdeal.com/miami/2026/07/30/hillsboro-beach-resort-sold-to-lender-in-foreclosure-sale/",
        "confidence": "high"
      },
      {
        "caseName": "LNR Partners (special servicer) v. Cohen Brothers Realty Corp. (750 Lexington Avenue)",
        "citation": "Supreme Court of the State of New York, New York County (foreclosure judgment ~$155.9M, entered 2025)",
        "year": 2026,
        "outcome": "The property's appraised value had collapsed to roughly $41M (down 86% from a pre-pandemic value of about $300M). At the January 21, 2026 foreclosure auction, with an upset price of $161,854,848.66, no bidder appeared — the property reverted to lender U.S. Bank for a nominal $1,000, leaving the loan's full ~$155.9M-plus balance effectively unrecovered from the collateral.",
        "dollarAmount": 155900000,
        "sourceUrl": "https://www.crainsnewyork.com/real-estate/750-lexington-ave-fetches-nominal-sum-foreclosure-auction/",
        "confidence": "high"
      },
      {
        "caseName": "Wells Fargo Bank, N.A. v. 9 Schindler Court",
        "citation": "Docket No. F-6328-25 (N.J. Super. Ct., Ch. Div., Morris Cnty., Jan. 2026)",
        "jurisdiction": "NJ",
        "year": 2026,
        "outcome": "Wells Fargo held both a first and second mortgage on the property, both in default, but chose to foreclose only on the second mortgage. Roughly two years later, it filed a separate new foreclosure action on the still-defaulted first mortgage. The Chancery judge dismissed the second foreclosure action with prejudice, holding it violated New Jersey's Entire Controversy Doctrine and res judicata by splitting claims that should have been brought together, and ordered the first mortgage discharged.",
        "dollarAmount": 0,
        "sourceUrl": "https://njlawconnect.com/commercial-tenant-rights-foreclosure-nj/",
        "confidence": "medium",
        "notes": "A real, current lender-loss outcome illustrating a procedural trap distinct from the substantive deficiency-judgment/anti-deficiency issues the other citations in this claim type address: a lender holding multiple defaulted liens on the same property who forecloses on them sequentially rather than together risks losing the later lien entirely to claim-preclusion doctrines, regardless of the underlying default being real and undisputed. Worth flagging to a lienholder client with more than one defaulted instrument on the same collateral."
      }
    ],
    "receivership_dispute": [
      {
        "caseName": "U.S. Bank National Association v. Brookfield Republic Plaza LLC",
        "citation": "Denver District Court, Colorado, filed August 10, 2026",
        "year": 2026,
        "outcome": "Complaint filed seeking appointment of a receiver rather than proceeding directly to foreclosure; as of this research, no ruling on the receivership motion had been reported.",
        "dollarAmount": null,
        "sourceUrl": "https://www.denvergazette.com/2026/08/14/downtown-denvers-tallest-building-faces-receivership-after-loan-default/",
        "confidence": "high"
      },
      {
        "caseName": "Citibank, N.A. / LNR Partners v. Golub & Company and BlueFive Capital (625 North Michigan Avenue)",
        "citation": "Cook County Circuit Court, Illinois, receiver appointed June 16, 2026",
        "year": 2026,
        "outcome": "Cook County court granted the lender's request and appointed Scott Shefman of Friedman Real Estate Management as receiver on June 16, 2026, giving the special servicer (LNR Partners) operational control of the office component pending resolution.",
        "dollarAmount": null,
        "sourceUrl": "https://therealdeal.com/chicago/2026/06/27/receiver-appointed-in-625-n-michigan-ave-foreclosure/",
        "confidence": "high"
      },
      {
        "caseName": "Wells Fargo Bank, N.A. (as trustee) v. Hertz Investment Group (Riverfront Plaza)",
        "citation": "Richmond Circuit Court, Virginia, receiver appointed August 27, 2025",
        "year": 2025,
        "outcome": "The court granted the receivership motion on August 27, 2025, installing Lewis Taulbee of JLL as receiver. As of March 2026, the property remained under receivership, with the receiver managing operations and positioning the asset for sale; no foreclosure auction had yet been scheduled.",
        "dollarAmount": null,
        "sourceUrl": "https://richmondbizsense.com/2025/08/21/lawsuit-looks-to-put-riverfront-plaza-office-towers-into-receivership-ahead-of-potential-foreclosure/",
        "confidence": "high"
      },
      {
        "caseName": "CWCapital (special servicer) v. Kawa Capital (One Parkway North Boulevard, Deerfield)",
        "citation": "Lake County Circuit Court, Illinois, receiver granted February 11, 2026",
        "year": 2026,
        "outcome": "Lake County Judge Daniel Jasica granted CWCapital's emergency motion on February 11, 2026, appointing Matthew Tarshis of Frontline Real Estate Partners as receiver over the property while the underlying foreclosure litigation proceeds.",
        "dollarAmount": null,
        "sourceUrl": "https://therealdeal.com/chicago/2026/04/23/cwcapital-hits-suburban-chicago-office-with-foreclosure/",
        "confidence": "high"
      },
      {
        "caseName": "ICON PSG 1 FL, LLC v. Jenkins Court Realty Co., L.P.",
        "citation": "No. 25-2598 (3d Cir. July 16, 2026)",
        "jurisdiction": "Federal (3d Cir., applying PA law)",
        "year": 2026,
        "outcome": "Commercial mortgage foreclosure on a $20.5 million loan secured by a Jenkintown, Pennsylvania property. After the borrower defaulted and failed to timely answer, the district court entered default and later default judgment, then appointed a receiver. The Third Circuit affirmed on all three fronts: (1) the borrower could not set aside the default/default judgment on its asserted grounds; (2) the court-appointed receiver had authority to modify an affiliate-friendly lease term (a 1,000-day cure period for a related-party tenant) despite an attornment clause, because it was a self-dealing term inserted after default; and (3) the district court did not abuse its discretion holding the borrower and its principal in civil contempt for failing to provide the accounting and records the receivership orders required.",
        "dollarAmount": 20500000,
        "sourceUrl": "https://law.justia.com/cases/federal/appellate-courts/ca3/25-2598/25-2598-2026-07-16.html",
        "confidence": "high",
        "notes": "A rich, current appellate-level confirmation of real receiver powers in a distressed-loan context: modifying a self-dealing, affiliate-favorable lease term put in place after default, and the availability of civil contempt as a real enforcement tool against a borrower/principal who stonewalls a receivership's accounting demands. dollarAmount reflects the underlying loan amount, not a separate damages figure -- this citation is about receiver authority and enforcement, not a compensatory award."
      }
    ],
    "guaranty_enforcement": [
      {
        "caseName": "Wells Fargo Bank, N.A. v. Cherryland Mall Ltd. Partnership",
        "citation": "300 Mich. App. 361, 813 N.W.2d 891 (Mich. Ct. App. 2011)",
        "year": 2011,
        "outcome": "Trial court and Court of Appeals held the guarantor personally liable for the full loan deficiency after the mall's foreclosure sale, because the borrower's insolvency breached the SPE covenant and triggered the springing full-recourse carve-out. (While on appeal, the Michigan legislature passed the Non-Recourse Mortgage Loan Act specifically to reverse this outcome prospectively, but it did not undo the judgment against Schostak.)",
        "dollarAmount": 2100000,
        "sourceUrl": "https://www.commercialsearch.com/news/guest-column-the-cherryland-decision-full-recourse-enforcement-of-non-recourse-loans/",
        "confidence": "high"
      },
      {
        "caseName": "CSFB 2001-CP-4 Princeton Park Corporate Center, LLC v. SB Rental I, LLC",
        "citation": "410 N.J. Super. 114, 980 A.2d 1 (App. Div. 2009)",
        "year": 2009,
        "outcome": "Trial court granted summary judgment holding the borrower and guarantors personally liable for the full loan amount. Appellate Division affirmed, holding as a matter of first impression in New Jersey that a non-recourse carve-out triggered by unauthorized subordinate financing fixes liability (not merely an estimate of damages) and is fully enforceable even though the triggering breach (the $400K loan) had long since been cured.",
        "dollarAmount": 5195933,
        "sourceUrl": "https://www.quimbee.com/cases/csfb-2001-cp-4-princeton-park-corporate-center-llc-v-sb-rental-i-llc",
        "confidence": "high"
      },
      {
        "caseName": "51382 Gratiot Avenue Holdings, LLC v. Chesterfield Development Co., LLC",
        "citation": "835 F. Supp. 2d 384 (E.D. Mich. 2011)",
        "year": 2011,
        "outcome": "Following the Cherryland precedent, the district court granted the lender summary judgment, holding that the borrower's insolvency breached the SPE covenant and triggered full-recourse liability against the guarantor for the entire deficiency.",
        "dollarAmount": 12240109,
        "sourceUrl": "https://law.justia.com/cases/federal/district-courts/michigan/miedce/2:2011cv12047/258665/99/",
        "confidence": "high"
      },
      {
        "caseName": "Bank Midwest, N.A. v. The Integritty Group",
        "citation": "U.S. District Court, Eastern District of Pennsylvania, filed August 6, 2026",
        "year": 2026,
        "outcome": "Complaint filed seeking roughly $18.25M in principal, interest, and fees, plus appointment of a receiver over TIG's restaurant operations; no ruling had been reported as of this research.",
        "dollarAmount": null,
        "sourceUrl": "https://sbj.net/stories/kc-bank-sues-philadelphia-qdoba-operator,105343",
        "confidence": "high"
      },
      {
        "caseName": "Extech Building Materials, Inc. v. E&N Construction, Inc.",
        "citation": "A-28-24 (N.J. Dec. 2, 2025)",
        "jurisdiction": "NJ",
        "year": 2025,
        "outcome": "Supplier sued a construction-materials buyer and its two principals personally on a guaranty clause within a two-page supply agreement, seeking $1,016,627.65 allegedly owed. The two individuals had signed the guaranty paragraph with their signatures labeled only '(No Title)', without a separate signature line clarifying they signed in their individual capacity. The New Jersey Supreme Court held the personal guaranty unenforceable against them, adopting a rule that a guarantor must clearly and unambiguously express intent to be personally bound through one of three methods: a separate guaranty agreement, a dual signature (once as company representative, once individually), or a single signature on an agreement that expressly states it binds both the company and the individual.",
        "dollarAmount": 0,
        "sourceUrl": "https://www.newjerseylawyersblog.com/new-jersey-supreme-court-explains-requirements-of-enforceable-personal-guarantees/",
        "confidence": "high",
        "notes": "A significant, current state-supreme-court-level limiting citation: over $1M sought under a guaranty clause was entirely unenforceable against the individual signatories due to a signature-formality defect, despite clear substantive guaranty language in the contract. Directly relevant to calibrating guaranty_enforcement's probability downward where the guaranty was signed without a clearly dual/individual-capacity signature block -- a common drafting gap in short-form supply and vendor agreements, not just loan guaranties."
      }
    ],
    "lender_liability_claim": [
      {
        "caseName": "111 West 57th Investment LLC v. 111 W57 Mezz Investor LLC (Steinway Tower)",
        "citation": "New York Court of Appeals, 2026 NY Slip Op 03376, decided May 28, 2026",
        "year": 2026,
        "outcome": "New York's highest court held that the lender's contractual 'sole discretion' to assign the loan does not categorically exculpate it from implied-covenant-of-good-faith claims where the discretion is alleged to have been exercised as part of a scheme to strip a joint-venture partner's equity, reinstating the good-faith claim and remitting the case to the Supreme Court, New York County for further proceedings (while affirming dismissal of a related tortious-interference claim).",
        "dollarAmount": null,
        "sourceUrl": "https://www.nycourts.gov/reporter/current/3dseries/2026/2026_03376.shtml",
        "confidence": "high"
      },
      {
        "caseName": "Via Mizner Owner III LLC v. Via Mizner Lender 1 LLC (Mandarin Oriental Residences, Boca Raton)",
        "citation": "Supreme Court of the State of New York, New York County, Commercial Division, filed August 17, 2026",
        "year": 2026,
        "outcome": "Justice Andrew Borrok signed a temporary restraining order blocking the UCC Article 9 equity sale and set a hearing on preliminary relief for October 1, 2026. The case remains pending with no ruling on the merits of the $500M+ lender-liability claim.",
        "dollarAmount": null,
        "sourceUrl": "https://therealdeal.com/miami/2026/08/17/mandarin-oriental-boca-raton-developer-sues-lender-madison/",
        "confidence": "high"
      },
      {
        "caseName": "K.M.C. Co., Inc. v. Irving Trust Co.",
        "citation": "757 F.2d 752 (6th Cir. 1985)",
        "year": 1985,
        "outcome": "Jury found Irving Trust breached an implied duty of good faith by cutting off funding without notice, and awarded $7.5M in damages plus pre-judgment interest; the Sixth Circuit affirmed, holding the lender owed a duty to give notice before exercising discretion to stop funding.",
        "dollarAmount": 7500000,
        "sourceUrl": "https://law.justia.com/cases/federal/appellate-courts/F2/757/752/426206/",
        "confidence": "medium"
      },
      {
        "caseName": "Barrett v. Bank of America",
        "citation": "183 Cal. App. 3d 1362, 229 Cal. Rptr. 16 (Ct. App. 1986)",
        "year": 1986,
        "outcome": "After a three-month trial, the jury found the bank liable for improperly controlling the construction project and awarded $6.6M in punitive damages (with compensatory damages determined separately); the Court of Appeal later reversed on an unrelated jury-instruction issue regarding constructive fraud and remanded.",
        "dollarAmount": 6600000,
        "sourceUrl": "https://law.justia.com/cases/california/court-of-appeal/3d/183/1362.html",
        "confidence": "medium"
      },
      {
        "caseName": "ROC Debt Strategies II Bond Investments LLC v. CWCapital Asset Management LLC",
        "citation": "Supreme Court of the State of New York, filed Jan. 13, 2025",
        "jurisdiction": "NY",
        "year": 2026,
        "outcome": "As directing certificateholder of the FREMF 2016-KS06 CMBS pool, ROC sued the special servicer CWCAM for breach of the pooling and servicing agreement and violation of the contractual servicing standard, alleging negligent handling of nine loans that entered special servicing starting in 2022, and sought a declaratory judgment that CWCAM was not entitled to indemnification or expense reimbursement from the trust. CWCAM moved to dismiss (fully briefed, hearing held Aug. 25, 2025); while that motion was pending, the parties reached a confidential business resolution and stipulated to dismissal with prejudice on Jan. 22, 2026.",
        "dollarAmount": null,
        "sourceUrl": "https://www.businesswire.com/news/home/20250723952228/en",
        "confidence": "medium",
        "notes": "A current, real example of a CMBS-specific lender-liability theory -- a certificateholder suing the special servicer itself for mishandling defaulted loans, rather than a borrower suing an originating lender. Settled confidentially before any ruling on the motion to dismiss, so no dollar figure or judicial holding on the merits is available; included primarily to document that this claim theory is being actively brought and resolved in the current CMBS distress cycle, consistent with market commentary describing distressed-debt/special-servicer disputes as a currently very active litigation area."
      }
    ],
    "securities_fraud_10b5": [
      {
        "caseName": "In re American Realty Capital Properties, Inc. Litigation (VEREIT/ARCP Securities Litigation)",
        "citation": "No. 1:15-mc-00040-AKH (S.D.N.Y.)",
        "year": 2020,
        "outcome": "Settled on the eve of trial. Judge Alvin K. Hellerstein granted final approval on January 21, 2020 to an aggregate $1.025 billion settlement fund, one of the largest securities class action recoveries ever against a REIT: VEREIT/ARCP itself contributed $738.5 million, the AR Capital/AR Global-affiliated manager entities and Schorsch-controlled parties contributed approximately $225-286.5 million (reported inconsistently across sources), former auditor Grant Thornton LLP paid $49 million, and former CFO Brian Block personally paid $12.5 million.",
        "dollarAmount": 1025000000,
        "sourceUrl": "https://www.cohenmilstein.com/case-study/re-american-realty-capital-properties-inc-litigation/",
        "confidence": "high"
      },
      {
        "caseName": "In re RAIT Financial Trust Securities Litigation",
        "citation": "Consolidated securities class action, E.D. Pa. (2009)",
        "year": 2009,
        "outcome": "The U.S. District Court for the Eastern District of Pennsylvania granted final approval on December 10, 2009 to a $32 million cash settlement, funded by RAIT's directors' and officers' liability insurers. The action was dismissed with prejudice and all defendants received a full release.",
        "dollarAmount": 32000000,
        "sourceUrl": "https://www.sec.gov/Archives/edgar/data/0001045425/000129993309004874/exhibit1.htm",
        "confidence": "high"
      },
      {
        "caseName": "SEC v. W. P. Carey & Co. LLC, et al.",
        "citation": "SEC Litigation Release No. 20501; SEC Admin. Proc. File No. 3-13294 (2008-2009)",
        "year": 2008,
        "outcome": "W.P. Carey settled the SEC's securities fraud charges by agreeing to pay approximately $30 million total (roughly $20 million in disgorgement and prejudgment interest plus a $10 million civil penalty). Two senior executives separately settled individual charges (one barred from serving as an officer/director for five years and paying a $240,000 penalty; the accountant suspended from practicing before the SEC for two years and paying a $75,000 penalty).",
        "dollarAmount": 30000000,
        "sourceUrl": "https://www.sec.gov/enforcement-litigation/litigation-releases/lr-20501",
        "confidence": "high"
      },
      {
        "caseName": "SEC v. United Development Funding III, L.P., United Development Funding IV, et al.",
        "citation": "SEC settled civil action; consent judgment entered July 2018, N.D. Tex.",
        "year": 2018,
        "outcome": "In July 2018, the entities and certain individuals consented to SEC judgments enjoining future securities-law violations and agreed to pay a combined $8.2 million in disgorgement, prejudgment interest, and civil penalties. Separately and later, four top UDF executives (including CEO Hollis Greenlaw) were criminally convicted in January 2022 on multiple counts including securities fraud and conspiracy.",
        "dollarAmount": 8200000,
        "sourceUrl": "https://www.sec.gov/divisions/enforce/claims/docs/united-development-funding-final-judgment-073118.pdf",
        "confidence": "high"
      }
    ],
    "breach_fiduciary_duty_derivative": [
      {
        "caseName": "Milliken v. American Realty Capital Hospitality Advisors, LLC, et al. (Hospitality Investors Trust Shareholder Derivative Litigation)",
        "citation": "No. 1:18-cv-01757 (S.D.N.Y.)",
        "year": 2020,
        "outcome": "On February 20, 2020, the court granted preliminary approval to a proposed settlement providing for an aggregate cash payment to the company of $15,181,108.47 (with $250,000 of that paid personally by the former CFO and the remainder by the company's D&O insurers), plus the tender of 83,504 shares of common stock back to the company. Final approval followed a June 9, 2020 settlement hearing, alongside a separate $2,250,000 award for plaintiff's counsel fees, expenses, and a case-contribution award. (Hospitality Investors Trust itself later filed for Chapter 11 bankruptcy in 2021, unrelated to this settlement.)",
        "dollarAmount": 15181108,
        "sourceUrl": "https://www.sec.gov/Archives/edgar/data/1583077/000110465920023347/tm209391-1_8k.htm",
        "confidence": "high"
      },
      {
        "caseName": "Quinn v. Knight (Apple REIT Ten / Apple Hospitality REIT Derivative Litigation)",
        "citation": "No. 3:16-cv-00610 (E.D. Va.)",
        "year": 2017,
        "outcome": "The parties reached a settlement just days before trial; the court approved it on March 16, 2017, requiring Apple Hospitality REIT to pay $32 million to former Apple REIT Ten shareholders. Class counsel were awarded $8.96 million in fees (28% of the fund) plus roughly $430,000 in expense reimbursement, and the named plaintiff received a $15,000 incentive award. It was reported at the time as the largest derivative settlement in the Fourth Circuit.",
        "dollarAmount": 32000000,
        "sourceUrl": "https://richmondbizsense.com/2017/03/29/real-estate-firm-settles-shareholder-suit-for-32m/",
        "confidence": "high"
      },
      {
        "caseName": "In re Inland Western Retail Real Estate Trust, Inc. Shareholder Litigation",
        "citation": "Shareholder derivative/class action, N.D. Ill. (filed Nov. 2007, settled 2010)",
        "year": 2010,
        "outcome": "The parties reached a settlement that received preliminary court approval in July 2010: the insider sellers agreed to forfeit and return 9 million of the 37.5 million shares they had received in the internalization deal (valued at approximately $90 million at the time of the original transaction), and Inland Western separately agreed to cover up to $10 million of the plaintiffs' legal fees.",
        "dollarAmount": 90000000,
        "sourceUrl": "https://www.chicagobusiness.com/article/20100723/CRED03/200038980/inland-western-settles-shareholder-lawsuit",
        "confidence": "medium"
      },
      {
        "caseName": "Katz v. CommonWealth REIT; Central Laborers' Pension Fund v. CommonWealth REIT (Equity Commonwealth Trustee Litigation)",
        "citation": "Circuit Court for Baltimore City, Maryland (Katz Action, filed March 2013; Central Laborers Action, filed April 2013)",
        "year": 2015,
        "outcome": "Equity Commonwealth (the REIT's new name/management following the 2014 board overhaul) entered into a Settlement and Release Agreement on July 31, 2015 resolving both actions. The settlement was overwhelmingly non-monetary — largely mooted by the 2014 change in control and governance reforms already implemented — with the company agreeing to pay $200,000 toward plaintiffs' counsel's costs and expenses.",
        "dollarAmount": 200000,
        "sourceUrl": "https://www.sec.gov/Archives/edgar/data/0000803649/000141057815000405/a15-16477_18k.htm",
        "confidence": "medium"
      },
      {
        "caseName": "Khoshaba v. Stilwell, et al. (Wheeler Real Estate Investment Trust Shareholder Litigation)",
        "citation": "No. 2:24-cv-00237 (E.D. Va., Norfolk Div.), filed April 10, 2024",
        "year": 2024,
        "outcome": "Wheeler REIT's ousted former CEO, as a shareholder, alleged current and certain former directors breached their fiduciary duty to the company and common stockholders in connection with the board's handling of the company's Series D Preferred Stock following a 2021 rights offering, and that allied hedge funds aided and abetted the breach by diluting common stock. The court found the fiduciary-duty claim adequately alleged and let it proceed against the directors and (in part) the hedge funds; the parties reached a $7.125 million class settlement, approved by the court.",
        "dollarAmount": 7125000,
        "sourceUrl": "https://news.bloomberglaw.com/securities-law/wheeler-boards-7-1-million-investor-settlement-gets-court-nod",
        "confidence": "high"
      },
      {
        "caseName": "Meyer v. Weil, et al. (The Necessity Retail REIT, Inc. / AR Global Shareholder Litigation)",
        "citation": "Case No. 24-C-23-003628, Circuit Court for Baltimore City, Maryland",
        "year": 2025,
        "outcome": "Stockholders alleged AR Global's CEO Michael Weil and other individual defendants, along with AR Global Investments, LLC, breached their fiduciary duties to RTL stockholders in connection with company governance and transactions. Reached a proposed $3,250,000 cash class settlement, with a settlement hearing set for September 16, 2025. Notably, a related but separate RTL shareholder action over the same AR Global/Global Net Lease merger controversy (alleging conflicts of interest in the merger process, inadequate price, and inadequate disclosure -- a claim closer to merger_objection_suit) was DISMISSED on the merits in July 2024 under Maryland's business judgment rule -- see the merger_objection_suit citation for that companion case. The two outcomes together illustrate how much result varies with the specific theory pled, even against the same defendants over the same underlying conduct.",
        "dollarAmount": 3250000,
        "sourceUrl": "https://www.globenewswire.com/news-release/2025/08/01/3125831/3080/en/Levi-Korsinsky-LLP-Announces-Pendency-of-Stockholder-Class-Action-and-Proposed-Settlement-Settlement-Hearing-and-Right-To-Appear-Involving-Owners-of-The-Necessity-Retail-Reit-Inc-C.html",
        "confidence": "high"
      }
    ],
    "proxy_disclosure_claim": [
      {
        "caseName": "In re Wells Real Estate Investment Trust, Inc. Securities Litigation (Piedmont Office Realty Trust)",
        "citation": "No. 1:07-cv-00862-CAP (N.D. Ga.)",
        "year": 2012,
        "outcome": "Piedmont announced on October 22, 2012 that it had reached agreements in principle to settle both consolidated class actions for a combined $7.5 million ($4.9 million and $2.6 million respectively), resolving the litigation and related appeals following court approval.",
        "dollarAmount": 7500000,
        "sourceUrl": "https://www.sec.gov/Archives/edgar/data/0001042776/000104277612000112/ex991pressreleasedatedocto.htm",
        "confidence": "high"
      },
      {
        "caseName": "St. Clair-Hibbard v. American Finance Trust, Inc., et al.",
        "citation": "No. 1:18-cv-01148 (S.D.N.Y.), aff'd, 2d Cir. 2020",
        "year": 2019,
        "outcome": "The district court (Judge Lorna G. Schofield) dismissed the second amended complaint for failure to state a claim on September 23, 2019, holding the proxy disclosures were not materially misleading because AFIN had adequately warned of internalization-related conflicts and discount-trading risk, and industry-wide skepticism of externally-managed REITs was already public knowledge. The Second Circuit affirmed the dismissal in 2020.",
        "dollarAmount": null,
        "sourceUrl": "https://caselaw.findlaw.com/court/us-2nd-circuit/2063139.html",
        "confidence": "high"
      },
      {
        "caseName": "In re Lightstone REIT Proxy Litigation (Lightstone Value Plus REIT I, II, and III)",
        "citation": "D.N.J. (motion to dismiss denied Aug. 5, 2026)",
        "year": 2026,
        "outcome": "U.S. District Judge Michael A. Shipp denied the defendants' motion to dismiss on August 5, 2026, finding the proxy materials may have omitted the material conflict of interest and allowing all four counts (including breach of fiduciary duty) to proceed into discovery. No settlement or trial outcome yet; case is ongoing as of this research.",
        "dollarAmount": null,
        "sourceUrl": "https://altswire.com/lightstone-reit-directors-must-face-suit-over-59-8m-undisclosed-conflict/",
        "confidence": "high"
      },
      {
        "caseName": "SEC v. AR Capital, LLC, Nicholas S. Schorsch, and Brian S. Block",
        "citation": "S.D.N.Y., settled 2019",
        "jurisdiction": "Federal (S.D.N.Y.)",
        "year": 2019,
        "outcome": "SEC enforcement action alleging AR Capital, its founder Schorsch, and former CFO Block inflated an incentive fee calculation in connection with two non-traded-REIT mergers into American Realty Capital Properties, Inc. (ARCP) -- the 2013 merger with American Realty Capital Trust III and the 2014 merger with American Realty Capital Trust IV -- improperly obtaining roughly 2.92 million additional ARCP operating-partnership units. Without admitting or denying the allegations, defendants agreed to a final judgment with permanent injunctions and cumulative disgorgement, prejudgment interest, and civil penalties exceeding $60 million.",
        "dollarAmount": 60000000,
        "sourceUrl": "https://www.sec.gov/newsroom/press-releases/2019-133",
        "confidence": "high",
        "notes": "One of the largest confirmed dollar outcomes in this claim type's sample -- an SEC enforcement action rather than private shareholder litigation, but arising from the same underlying conduct (merger-related proxy/disclosure misconduct around fee calculations) this claim type is meant to capture. Useful as a high-end benchmark for what regulatory exposure can look like when incentive-fee manipulation is proven, distinct from the private-litigation settlement figures elsewhere in this sample."
      },
      {
        "caseName": "In re Piedmont Office Realty Trust, Inc. Securities Litigation (consolidating the 'Wells Action' and the 'Piedmont Action')",
        "citation": "N.D. Ga., settlement hearing Apr. 18, 2013",
        "jurisdiction": "Federal (N.D. Ga.)",
        "year": 2013,
        "outcome": "Two 2007-filed securities class actions -- one challenging disclosures around Piedmont's internalization transaction, the other challenging disclosures in a tender offer and charter amendment -- were consolidated and settled together for a combined $4.9 million cash payment by Piedmont and its insurers.",
        "dollarAmount": 4900000,
        "sourceUrl": "https://investor.piedmontreit.com/news-releases/news-release-details/piedmont-office-realty-trust-reaches-agreements-principle-settle",
        "confidence": "medium",
        "notes": "An older but well-documented REIT-specific proxy/disclosure settlement figure, useful alongside the more recent citations in this claim type for showing the range of outcomes across different eras of REIT disclosure litigation."
      }
    ],
    "merger_objection_suit": [
      {
        "caseName": "Cole Credit Property Trust III, Inc. Shareholder Litigation",
        "citation": "Circuit Court for Baltimore City, Maryland (consolidated, filed March 2013)",
        "year": 2013,
        "outcome": "The court dismissed the case with prejudice on October 22, 2013. Plaintiffs appealed; the appeal was itself dismissed on July 31, 2014, but as part of that resolution the defendants agreed to reimburse plaintiffs' counsel in the consolidated Cole Holdings Action $100,000.",
        "dollarAmount": 100000,
        "sourceUrl": "http://chimicles.com/cole-credit-property-trust-iii-inc-class-and-derivative-litigation/",
        "confidence": "medium"
      },
      {
        "caseName": "In re Government Properties Income Trust / Select Income REIT Merger Litigation (Chen v. Select Income REIT; Schwartz v. Select Income REIT; Sinkula v. Select Income REIT; Scarantino v. Fraiche)",
        "citation": "Four parallel actions: S.D.N.Y. (filed Nov. 9 & 19, 2018), D. Mass. (filed Nov. 15, 2018), and Circuit Court for Baltimore City, MD (filed Nov. 16, 2018)",
        "year": 2018,
        "outcome": "The merger closed; the parallel disclosure suits followed the common 'disclosure-only' resolution pattern for merger-objection suits — the companies filed supplemental proxy disclosures addressing the alleged omissions (visible in the SEC Form S-4/A amendments filed shortly before the shareholder vote), after which the suits were mooted/withdrawn. No separate cash settlement fund to shareholders was disclosed.",
        "dollarAmount": null,
        "sourceUrl": "https://www.sec.gov/Archives/edgar/data/1456772/000104746918007257/a2237140zex-99_1.htm",
        "confidence": "medium"
      },
      {
        "caseName": "The Necessity Retail REIT, Inc. Shareholder Litigation v. AR Global Investments, LLC and Michael Weil (Global Net Lease Merger)",
        "citation": "Circuit Court for Baltimore City, Maryland, filed August 2023, dismissed July 2024",
        "year": 2024,
        "outcome": "RTL shareholders sued AR Global and CEO Michael Weil for aiding and abetting alleged breaches of fiduciary duty and unjust enrichment arising from the merger of Necessity Retail REIT and Global Net Lease -- alleging conflicts of interest in the merger process, an inadequate price, and inadequate disclosure of material information, and that defendants received $375 million (18% of the combined entity's value) through the internalization transaction bundled into the merger. Judge Audrey Carrion (Circuit Court for Baltimore City) dismissed the fiduciary-duty claim under Maryland's business-judgment-rule presumption, which in turn defeated the derivative aiding-and-abetting and unjust-enrichment claims. A confirmed, real DISMISSAL outcome (not merely mooted by supplemental disclosures) despite a large alleged self-dealing figure -- illustrates how much the business judgment rule can insulate a merger even against a substantial, specifically-quantified conflict-of-interest allegation. A separate, narrower breach-of-fiduciary-duty action against the same defendants over related RTL governance conduct (Meyer v. Weil) settled for $3.25M -- see the breach_fiduciary_duty_derivative citation for that companion case.",
        "dollarAmount": null,
        "sourceUrl": "https://www.paulweiss.com/practices/litigation/securities-litigation/news/ar-global-wins-dismissal-of-class-action-over-reit-merger?id=53363",
        "confidence": "high"
      },
      {
        "caseName": "In re Inland Western Retail Real Estate Trust, Inc. Shareholder Litigation",
        "citation": "Class action and derivative complaint; settlement approved Nov. 8, 2010",
        "jurisdiction": "Federal",
        "year": 2010,
        "outcome": "Shareholders sued alleging federal securities-law violations and breach of fiduciary duty in connection with the REIT's internalization transaction -- its merger with its own external business manager/advisor and property managers -- claiming the deal terms improperly enriched the manager's owners at shareholders' expense. The case settled: the sellers who had received 37.5 million shares of company stock in the all-stock internalization deal agreed to give back 9 million of those shares to the company, diluting their own stake to partially compensate remaining shareholders, plus $10,000 in court-awarded plaintiffs'-counsel fees.",
        "dollarAmount": null,
        "sourceUrl": "https://www.chicagobusiness.com/article/20100723/CRED03/200038980/inland-western-settles-shareholder-lawsuit",
        "confidence": "medium",
        "notes": "A structurally different settlement currency than the cash settlements elsewhere in this claim type -- relief here was a share givebook (9 of 37.5 million shares returned to the company, diluting the internalization sellers rather than paying cash to class members directly). Useful for showing that merger-objection relief in an internalization-style REIT transaction can take the form of unwinding part of the equity consideration itself, not just a cash fund. dollarAmount left null since no cash settlement figure was reported; the real relief was the share transfer."
      }
    ],
    "contractor_breach_negligence": [
      {
        "caseName": "CityCenter Holdings, LLC v. Tutor Perini Building Corp. (Harmon Hotel Construction Defect Litigation)",
        "citation": "Case No. A-10-627691-B, Eighth Judicial District Court, Clark County, Nevada",
        "year": 2014,
        "outcome": "Global settlement reached on the eve of a trial expected to last over a year: MGM Resorts agreed to pay $153 million to Perini and $20 million to CityCenter/developer interests, which combined with roughly $85 million in prior insurance settlement proceeds brought CityCenter's total recovery on the Harmon defect claims to approximately $195 million.",
        "dollarAmount": 195000000,
        "sourceUrl": "https://www.enr.com/articles/2134-substantial-payouts-end-harmon-hotel-legal-battle-in-las-vegas",
        "confidence": "high"
      },
      {
        "caseName": "In re: Champlain Towers South Collapse Litigation",
        "citation": "Case No. 2021-015089-CA-01, Circuit Court of the 11th Judicial Circuit, Miami-Dade County, Florida",
        "year": 2022,
        "outcome": "Global class-action settlement of $997 million (potentially rising to ~$1.1 billion with sale of the site), funded primarily by insurance policies plus a reported $400 million specifically contributed by the developer, contractor, engineer, and subcontractors on the adjacent Eighty Seven Park project.",
        "dollarAmount": 997000000,
        "sourceUrl": "https://www.enr.com/articles/54112-possible-funding-sources-for-the-997m-champlain-towers-settlement",
        "confidence": "high"
      },
      {
        "caseName": "Regalia on the Ocean Condominium Association, Inc. v. Regalia Beach Developers, LLC et al.",
        "citation": "Filed 2018, Circuit Court of the 11th Judicial Circuit, Miami-Dade County, Florida (settled 2021, docket number not independently verified)",
        "year": 2021,
        "outcome": "Settled for $17.5 million, funded by insurers of the developer/contractor/architect defendants and some subcontractors: $9.6 million cash for repairs plus an $8.5 million markdown on replacement sliding glass doors for all 39 units.",
        "dollarAmount": 17500000,
        "sourceUrl": "https://www.burnsandwilcox.com/insights/construction-defects-lawsuit-leads-to-17-5-million-settlement-for-condo-association/",
        "confidence": "high"
      },
      {
        "caseName": "Grandview at Riverwalk Port Imperial Condominium Association v. K. Hovnanian at Port Imperial Urban Renewal II, LLC et al.",
        "citation": "Hudson County Superior Court, New Jersey (Judge Jeffrey Jablonski), verdict June 1, 2017",
        "year": 2017,
        "outcome": "Jury awarded $3 million against the developer under the Consumer Fraud Act, automatically trebled to $9 million, plus attorneys' fees and costs; separately awarded $1 million against architect RTKL for professional negligence. The jury also pierced the corporate veil, holding parent Hovnanian Enterprises liable for the full judgment against its subsidiary.",
        "dollarAmount": 10000000,
        "sourceUrl": "https://beckerlawyers.com/hudson-county-jury-awards-10m-in-consumer-fraud-case-against-builder/",
        "confidence": "high"
      },
      {
        "caseName": "JVP Drywall & Finish, Inc. v. 2377 Collins Resort, L.P.",
        "citation": "No. 3D17-2413 (Fla. 3d DCA Nov. 7, 2018)",
        "jurisdiction": "FL",
        "year": 2018,
        "outcome": "Subcontractor installed drywall and wallboard at what became 1 Hotel South Beach (Miami Beach); the property's later owners claimed the work used noncode-compliant materials and was incorrectly installed in bathrooms, causing water leaks and millions in damage. After the subcontractor filed a mechanic's-lien lis pendens, the case went to trial; the Miami-Dade Circuit Court entered final judgment for the property owners, awarded them attorney's fees and costs, and ordered return of the roughly $617,183 bond the owners had posted against the lien. The Third District Court of Appeal affirmed, denying the subcontractor's motion for judgment notwithstanding the verdict or a new trial.",
        "dollarAmount": 3100000,
        "sourceUrl": "https://law.justia.com/cases/florida/third-district-court-of-appeal/2018/3d17-2413.html",
        "confidence": "high",
        "notes": "A full-cycle, appellate-affirmed defense win for a commercial property owner against a subcontractor's defective-installation work, including recovery of a substantial mechanic's-lien bond -- reported trial verdict was $3.1 million plus roughly $644,000 in prejudgment interest, though this citation's dollarAmount reflects only the $3.1M verdict figure since the interest award wasn't independently confirmed from the appellate opinion itself."
      }
    ],
    "design_professional_malpractice": [
      {
        "caseName": "Trustees of Princeton University v. Tod Williams Billie Tsien Architects, LLP et al.",
        "citation": "No. 3:19-cv-21248, U.S. District Court for the District of New Jersey, filed December 2019",
        "year": 2019,
        "outcome": "Complaint sought $10.7 million for breach of contract including design negligence and delay-related costs; final resolution/settlement terms not disclosed in available reporting.",
        "dollarAmount": 10700000,
        "sourceUrl": "https://www.dezeen.com/2020/01/02/princeton-lawsuit-tod-williams-billie-tsien-university-building/",
        "confidence": "medium"
      },
      {
        "caseName": "Clark Construction Group, LLC v. Perkins Eastman DC, PC",
        "citation": "U.S. District Court for the District of Columbia, filed March 9, 2018; dismissed by joint stipulation 2020",
        "year": 2018,
        "outcome": "Clark and Perkins Eastman filed and then jointly dismissed their respective lawsuits in 2020, settling on confidential/undisclosed terms.",
        "dollarAmount": 5000000,
        "sourceUrl": "https://www.constructiondive.com/news/clark-settles-5m-the-wharf-dc-lawsuit-with-perkins-eastman-for-undisclosed/573619/",
        "confidence": "medium"
      },
      {
        "caseName": "Yakima School District No. 7 v. KDA Architecture, PLLC (Eisenhower High School 'Blue Wall')",
        "citation": "Yakima County Superior Court, Washington, settlement announced February 2024",
        "year": 2024,
        "outcome": "CONFIRMED FINAL settlement, not just an amount sought: KDA Architecture agreed to pay the school district $1.7 million within 30 days of settlement approval over a design defect in a ~750-foot decorative wall -- a water-resistant barrier melted after interior temperatures exceeded the manufacturer's 180-degree limit, causing 23 of 26 windows to leak and leading to mold. The contractor and subcontractors who built the wall separately settled for an additional $1.1 million.",
        "dollarAmount": 1700000,
        "sourceUrl": "https://www.yakimaherald.com/news/local/yakima-school-district-reaches-1-7-million-settlement-with-architects-over-ikes-blue-wall/article_4259a101-fb1f-5940-98cd-3f8533460518.html",
        "confidence": "high"
      },
      {
        "caseName": "Massachusetts Institute of Technology v. Frank O. Gehry, Gehry Partners, LLP, and Skanska USA Building Inc. (Stata Center)",
        "citation": "Massachusetts Superior Court (Middlesex County), filed 2007; case reported settled Feb. 5, 2010, dismissed March 8, 2010",
        "year": 2010,
        "outcome": "Settled after roughly three years of litigation over persistent leaks, cracking masonry, mold, and drainage problems at the ~$300 million Stata Center. Per Gehry's own public statement, NO MONEY changed hands in the settlement -- terms instead centered on collaborative funding/responsibility for repairs. Included as a real data point that even a design-malpractice claim against a globally prominent architect over well-documented, expensive defects can resolve with a confirmed $0 direct cash recovery to the owner.",
        "dollarAmount": 0,
        "sourceUrl": "https://thetech.com/2010/03/19/statasuit-v130-n14",
        "confidence": "high"
      },
      {
        "caseName": "Cornell University v. Pei Cobb Freed & Partners Architects LLP (Herbert F. Johnson Museum of Art expansion)",
        "citation": "N.Y. Sup. Ct., filed May 2015 (exact index number not independently confirmed)",
        "year": 2015,
        "outcome": "Cornell alleged 'architectural malpractice' -- inherently flawed, materially defective expansion designs causing structural deficiencies, roof cavities, and ceiling cracks -- and claimed at least $1.1 million in resulting damages. Multiple secondary sources describe the firm as having ultimately paid this amount, but a primary settlement agreement or final docket entry confirming that figure as an actual payment (rather than just the amount originally claimed) was not independently located.",
        "dollarAmount": 1100000,
        "sourceUrl": "https://www.artforum.com/news/cornell-university-sues-i-m-peis-firm-over-campus-museums-design-224103/",
        "confidence": "medium"
      },
      {
        "caseName": "Orange County Performing Arts Center v. Cesar Pelli (Pelli Clarke Pelli) and Fluor Corp.",
        "citation": "Orange County Superior Court, CA, filed Aug. 17, 2006",
        "jurisdiction": "CA",
        "year": 2006,
        "outcome": "The Center sued architect Cesar Pelli's firm and design-builder Fluor Corp. over the Renee and Henry Segerstrom Concert Hall, alleging design and construction errors including obstructed sightlines to the stage and inadequately designed seating, plus a roughly $40 million budget overrun (from an original ~$200M budget to ~$240M). Most defects were remedied at a cost of millions of dollars; some were reported as irreversible. Secondary sources report the Center ultimately prevailed, though the specific settlement terms or judgment amount were not independently confirmed.",
        "dollarAmount": null,
        "sourceUrl": "https://playbill.com/article/orange-county-pac-sues-architect-cesar-pelli-fluor-corp",
        "confidence": "medium",
        "notes": "Real, well-documented filed suit against a nationally prominent architecture firm and design-builder, with specific and credible defect allegations (sightlines, seating design, budget overrun), but the final resolution amount is not independently confirmed beyond a general 'Center won' characterization in secondary compilation sources -- treat the outcome direction as more reliable than any specific dollar figure, since none is included here. A useful addition to this claim type's sample regardless, since it involves a design-builder (Fluor) as co-defendant alongside the architect, a structure not otherwise represented in this claim type's citations."
      }
    ],
    "indemnification_contribution_claim": [
      {
        "caseName": "Kellner v. Advance Cast Stone Co. (Milwaukee Parking Structure Panel Collapse)",
        "citation": "Milwaukee County Circuit Court, Wisconsin (incident June 2010; jury verdict reported 2013)",
        "year": 2013,
        "outcome": "Jury awarded $39 million and apportioned fault: 88% to subcontractor Advance Cast Stone, 10% to general contractor J.H. Findorff and Son, and 2% to owner Milwaukee County -- an allocation that then governed each defendant's indemnification/contribution exposure.",
        "dollarAmount": 39000000,
        "sourceUrl": "https://frenkelfirm.com/blog/39-million-awarded-in-parking-garage-collapse-lawsuit/",
        "confidence": "high"
      },
      {
        "caseName": "Engineering & Construction Innovations, Inc. v. Bradshaw Construction Corp.",
        "citation": "No. 20-CV-808 (ECT/SGE), 2025 WL 1790679 (D. Minn. June 30, 2025)",
        "jurisdiction": "Federal (D. Minn.)",
        "year": 2025,
        "outcome": "Subcontract required the subcontractor to indemnify the general contractor for liquidated damages the owner assessed against the GC due to the subcontractor's schedule failure. The GC then moved to also recover nearly $3.3 million in its own attorney's fees and costs incurred proving the indemnification claim itself; the court denied that fee-recovery motion, holding that indemnity language covering claims 'arising or in any way resulting from' the indemnified liability does not, without more explicit language, extend to fees incurred enforcing the indemnity provision against the indemnitor.",
        "dollarAmount": 0,
        "sourceUrl": "https://www.fwhtlaw.com/blog/2025/08/15/recovery-of-attorneys-fees-under-indemnity-provisions-the-devil-is-in-the-details/",
        "confidence": "medium",
        "notes": "The underlying liquidated-damages indemnification obligation itself was not in dispute in this ruling -- what was denied was the GC's attempt to also shift its OWN enforcement-litigation fees onto the subcontractor under the same clause. Useful as a real, current limiting citation: broad indemnity language does not automatically include fee-shifting for the indemnitee's cost of proving the claim, absent explicit contract language to that effect. dollarAmount reflects the $0 result of the fee-recovery motion specifically, not the separately-owed liquidated damages."
      },
      {
        "caseName": "Amberwood Development, Inc. v. Swann's Grading, Inc.",
        "citation": "No. 1 CA-CV 15-0786, 2017 Ariz. App. Unpub. LEXIS 207 (Ariz. Ct. App. Feb. 23, 2017) (unpublished)",
        "jurisdiction": "AZ",
        "year": 2017,
        "outcome": "General contractor sought indemnification from its grading subcontractor for a $1.75 million arbitration award to homeowners and $723,900 in separate litigation settlements, all arising from defects in a housing development. The subcontract required the subcontractor to indemnify for claims 'arising out of or in connection with' its work. The trial court, affirmed on appeal, held the subcontractor did not need to be shown negligent or at fault -- the broad 'arising out of or in connection with' language tied the indemnity obligation to the work itself, not to proof of fault -- and apportioned the subcontractor responsible for 72% of the arbitration award (~$1.26M) and 70.6% of the settlements (~$511,073), roughly $1.77 million combined.",
        "dollarAmount": 1770000,
        "sourceUrl": "https://arizonaconstructionandthelaw.com/amberwood-development-inc-et-al-v-swanns-grading-inc-persuasive-authority-on-the-scope-of-indemnification-provisions/",
        "confidence": "medium",
        "notes": "Unpublished (no binding precedential effect in Arizona) but factually rich and directly on point: confirms that broad 'arising out of or in connection with' indemnity language reaches a subcontractor's defective work WITHOUT the indemnitee having to separately prove negligence or causation -- a meaningfully lower bar for the general contractor than a narrower indemnity clause would impose, and the percentage-apportionment approach (72%/70.6% rather than 100%) is itself a useful data point for how courts split indemnification exposure among multiple responsible parties on the same underlying award."
      }
    ],
    "insurance_coverage_defect_dispute": [
      {
        "caseName": "Admiral Insurance Co. v. Tocci Building Corp.",
        "citation": "No. 22-1462, 122 F.4th 1 (1st Cir. Nov. 8, 2024)",
        "year": 2024,
        "outcome": "First Circuit affirmed that Admiral had no duty to defend Tocci in the underlying construction-defect suit.",
        "dollarAmount": null,
        "sourceUrl": "https://law.justia.com/cases/federal/appellate-courts/ca1/22-1462/22-1462-2024-11-08.html",
        "confidence": "high"
      },
      {
        "caseName": "Mycon General Contractors, Inc. v. Employers Mutual Casualty Company et al.",
        "citation": "No. 3:26-cv-01098, U.S. District Court for the Northern District of Texas, filed April 6, 2026",
        "year": 2026,
        "outcome": "Pending as of filing. Mycon seeks more than $1 million in damages plus treble damages, exemplary damages, attorneys' fees, and 18% statutory interest for the insurers' denial of defense/coverage.",
        "dollarAmount": null,
        "sourceUrl": "https://www.insurancebusinessmag.com/us/news/claims/contractor-sues-six-cgl-insurers-after-all-deny-facade-failure-claim-571023.aspx",
        "confidence": "medium"
      },
      {
        "caseName": "Cornice & Rose International, LLC v. Acuity",
        "citation": "No. 23-1152, 2024 WL 4880102 (7th Cir. Nov. 25, 2024)",
        "year": 2024,
        "outcome": "The Seventh Circuit reversed, holding the architecture firm's insurer Acuity did owe a duty to defend under the CGL policy.",
        "dollarAmount": null,
        "sourceUrl": "https://law.justia.com/cases/federal/appellate-courts/ca7/23-1152/23-1152-2024-11-25.html",
        "confidence": "medium"
      },
      {
        "caseName": "Twigg v. Admiral Insurance Co.",
        "citation": "373 Or. 445 (Or. Apr. 17, 2025)",
        "year": 2025,
        "outcome": "Oregon Supreme Court reversed lower courts and held that CGL coverage for a construction-defect claim turns on the underlying FACTS (whether there is a basis for imposing tort liability, i.e., accidental property damage from negligent conduct), not on how the claim happens to be pleaded (contract vs. tort) -- rejecting the insurer's argument that a contract-only complaint automatically falls outside coverage. Remanded for further proceedings on whether policy exclusions still bar recovery. Underlying dispute involved a $150,000 arbitration award for defective concrete garage-floor overlay work (missing control joints, causing voids and cracking) -- smaller-dollar and residential-adjacent, but the coverage HOLDING is a significant, recent, directly-applicable precedent for CRE construction-defect CGL disputes generally.",
        "dollarAmount": 150000,
        "sourceUrl": "https://www.stoel.com/insights/publications/oregon-supreme-court-expands-cgl-coverage-for-construction-defects-twigg-v-admiral-insurance-company",
        "confidence": "high"
      },
      {
        "caseName": "Bob Robison Commercial Flooring Inc. v. RLI Insurance Company",
        "citation": "No. 23-3531 (8th Cir. Mar. 19, 2025)",
        "jurisdiction": "Federal (8th Cir.)",
        "year": 2025,
        "outcome": "Insured was hired to install a vinyl gym floor with painted lines and subcontracted the painting; the painting work was faulty (crooked lines, incorrect markings, smudges), requiring the insured to remove and replace the entire floor at a cost of $181,415.39. Its builder's-risk insurer denied the claim under a workmanship-error exclusion. The Eighth Circuit affirmed, holding the policy's ensuing-loss provision did not restore coverage because the damage was caused solely by the excluded peril (defective workmanship) with no separate, independent covered peril in the causal chain.",
        "dollarAmount": 0,
        "sourceUrl": "https://law.justia.com/cases/federal/appellate-courts/ca8/23-3531/23-3531-2025-03-19.html",
        "confidence": "high",
        "notes": "A real, current, insurer-win outcome on a common builder's-risk coverage fight: an ensuing-loss clause does not resurrect coverage for defective-workmanship damage unless the insured can point to a genuinely separate covered peril that caused (or worsened) the loss, not just a different way of describing the same faulty work. dollarAmount reflects the $0 coverage recovered, not the $181,415.39 repair cost itself, which the insured bore."
      }
    ],
    "cercla_cost_recovery": [
      {
        "caseName": "United States v. Columbia Falls Aluminum Company, LLC",
        "citation": "Consent Decree, U.S. District Court for the District of Montana (Missoula Division), lodged July 2026",
        "year": 2026,
        "outcome": "647-page consent decree between EPA/Montana DEQ and CFAC requiring a $57.6 million cleanup, including a groundwater slurry wall and low-permeability landfill caps to stop contaminant migration toward the Flathead River. Open for public comment through Aug. 6, 2026.",
        "dollarAmount": 57600000,
        "sourceUrl": "https://www.epa.gov/newsreleases/columbia-falls-aluminum-corporation-llc-agrees-57-million-cleanup-former-smelter-site",
        "confidence": "high"
      },
      {
        "caseName": "United States v. Alden Leeds, Inc., et al. (Lower Passaic River Study Area / Diamond Alkali Superfund Site)",
        "citation": "Consent Decree, D.N.J., approved and entered Dec. 18, 2024 (Judge Madeline Cox Arleo)",
        "year": 2024,
        "outcome": "Consent decree requiring a $150 million collective payment toward EPA's past and anticipated future cleanup response costs; approved and entered by the district court Dec. 18, 2024.",
        "dollarAmount": 150000000,
        "sourceUrl": "https://www.epa.gov/newsreleases/parties-agree-pay-150-million-toward-clean-lower-passaic-river-new-jersey",
        "confidence": "high"
      },
      {
        "caseName": "United States v. NL Industries, Inc., et al. (Raritan Bay Slag Superfund Site)",
        "citation": "Proposed Consent Decree, D.N.J., lodged Sept. 5, 2024",
        "year": 2024,
        "outcome": "Proposed consent decree totaling $151.1 million: $132.4 million to reimburse EPA for past and future cleanup costs, plus $18.7 million to resolve natural resource damage claims.",
        "dollarAmount": 151100000,
        "sourceUrl": "https://www.epa.gov/newsreleases/epa-proposes-settlement-provide-151-million-cleanup-raritan-bay-slag-superfund-site",
        "confidence": "high"
      },
      {
        "caseName": "United States v. Boeing Co., City of Seattle, and King County (Lower Duwamish Waterway Superfund Site)",
        "citation": "Settlement Agreement, W.D. Wash., announced March 2026",
        "year": 2026,
        "outcome": "$668 million settlement requiring the Group to design and perform the in-water cleanup remedy (dredging and capping), estimated to take at least 10 years; the Group will receive roughly $130 million from other PRPs and $140 million from federal agencies toward the total.",
        "dollarAmount": 668000000,
        "sourceUrl": "https://www.justice.gov/opa/pr/justice-department-reaches-668m-settlement-agreement-continued-cleanup-lower-duwamish",
        "confidence": "high"
      },
      {
        "caseName": "Advanced Tech. Corp. v. Eliskim, Inc. (True Temper Site)",
        "citation": "No. 1:96CV755, __ F. Supp. 2d __ (N.D. Ohio May 3, 2000)",
        "year": 2000,
        "outcome": "DOCTRINAL CITATION, not a dollar-amount data point: on reconsideration, the court laid out the exact fork this claim type turns on. A current owner is normally a PRP itself and generally limited to a Sec. 113(f)(1) contribution claim against another PRP (recovering only that party's equitable share) -- UNLESS the owner qualifies as an 'innocent landowner' under Sec. 107(b), in which case it may bring a full Sec. 107(a) cost-recovery action and recover the ENTIRE cost. The court set out five factors the owner (ATC) had to prove: (1) a party other than ATC was the sole cause of the release; (2) the defendant is a liable party; (3) ATC did not actually know of the contamination at acquisition; (4) ATC undertook appropriate inquiry before acquiring the property; and (5) ATC exercised due care once the contamination was discovered. The court found disputed fact issues on factors 4-5 and denied summary judgment to both sides on that question -- so this case establishes the doctrine clearly without itself resolving whether ATC ultimately qualified.",
        "dollarAmount": null,
        "sourceUrl": "https://www.honigman.com/media/site_files/244_imgimgWoolstrumA406314.pdf",
        "confidence": "high"
      },
      {
        "caseName": "Pennsylvania Dep't of Envtl. Prot. v. Trainer Custom Chem., LLC",
        "citation": "906 F.3d 85 (3d Cir. 2018)",
        "year": 2018,
        "outcome": "Third Circuit held that a current owner is liable under CERCLA Sec. 107(a)(1) for ALL response costs at a site -- including costs incurred before that owner even acquired the property -- rejecting the owner's argument that it should only be liable for post-acquisition costs. The owner in this case did not establish innocent-landowner or bona fide prospective purchaser protection. Illustrates the downside of NOT qualifying as an innocent landowner: not just a reduced recovery in a cost-recovery action, but potentially full personal liability as a defendant in someone else's action, including for costs predating ownership entirely.",
        "dollarAmount": null,
        "sourceUrl": "https://www2.ca3.uscourts.gov/opinarch/183287p.pdf",
        "confidence": "high"
      },
      {
        "caseName": "MPM Silicones, LLC v. Union Carbide Corp.",
        "citation": "966 F.3d 200 (2d Cir. July 23, 2020)",
        "jurisdiction": "Federal (2d Cir., applying NY law)",
        "year": 2020,
        "outcome": "Current owner/operator sued to recover $374,540.25 in past PCB-cleanup costs and for a declaratory judgment on liability for future removal costs at a site Union Carbide had contaminated decades earlier. After a bench trial, the district court allocated 95% of future removal costs to Union Carbide and 5% to the plaintiff-owner, reasoning Union Carbide was the party that introduced and benefited from the PCBs. The Second Circuit's opinion also resolved a significant statute-of-limitations question: a single site can have more than one CERCLA 'removal action' triggering its own limitations period, rather than one clock running from the first remediation activity ever performed there.",
        "dollarAmount": 374540,
        "sourceUrl": "https://www.hodgsonruss.com/newsroom/publications/Second-Circuit-Clarifies-CERCLA-Statute-of-Limitations-Rules-There-Can-be-More-Than-One-Remediation-on-a-Site",
        "confidence": "high",
        "notes": "A strongly plaintiff-favorable allocation (95%/5%) for a current owner who did not cause the contamination -- useful as a high-end data point alongside the innocent-landowner citations elsewhere in this claim type, and the statute-of-limitations holding is independently significant for any multi-phase, multi-decade remediation site."
      },
      {
        "caseName": "Guam v. United States",
        "citation": "593 U.S. 310 (2021)",
        "jurisdiction": "Federal (U.S. Supreme Court)",
        "year": 2021,
        "outcome": "The Supreme Court unanimously held that a settlement resolving only Clean Water Act claims (not CERCLA claims specifically) can still trigger CERCLA's three-year contribution-claim statute of limitations, and clarified the line between a §107(a) cost-recovery action and a §113(f) contribution action -- allowing Guam to proceed with its cost-recovery claim against the United States for cleanup of the Ordot Dump rather than being time-barred as an untimely contribution claim.",
        "dollarAmount": null,
        "sourceUrl": "https://www.congress.gov/crs-product/LSB10609",
        "confidence": "high",
        "notes": "A significant, current U.S. Supreme Court clarification of when a party is limited to the narrower, time-barred §113(f) contribution remedy versus the broader §107(a) cost-recovery remedy this claim type models -- directly relevant to correctly classifying a fact pattern into cercla_cost_recovery versus cercla_contribution_claim before applying either claim's damages formula."
      }
    ],
    "cercla_contribution_claim": [
      {
        "caseName": "Trinity Industries, Inc. v. Greenlease Holding Co.",
        "citation": "903 F.3d 333 (3d Cir. 2018)",
        "year": 2018,
        "outcome": "The district court allocated 62% of the $9 million cleanup cost to Greenlease and 38% to Trinity under CERCLA Section 113(f). The Third Circuit affirmed the parent-subsidiary/operator liability findings (applying United States v. Bestfoods) while addressing related allocation issues.",
        "dollarAmount": 9000000,
        "sourceUrl": "https://www.taftlaw.com/news-events/law-bulletins/trinity-the-corporate-form-and-how-to-avoid-parent-subsidiary-cercla-liability/",
        "confidence": "medium"
      },
      {
        "caseName": "Barclay Lofts LLC v. PPG Industries, Inc.",
        "citation": "No. 20-CV-1694, 2024 WL 4224731 (E.D. Wis. Sept. 18, 2024)",
        "year": 2024,
        "outcome": "Court awarded $1.17 million of $1.43 million in past response costs claimed, and allocated future response-cost shares: PPG 50%, Hydrite 20%, an unrecoverable \"orphan share\" of 20% assigned to plaintiff, Barclay/Sherman 10%, and 0% each to two other defendants. Hydrite separately settled for $550,000 (past costs) plus a $3 million escrow (future costs).",
        "dollarAmount": 1170000,
        "sourceUrl": "https://www.mgkflitigationblog.com/Barclay_Lofts_PPG_Allocation_CERCLA_Superfund",
        "confidence": "medium"
      },
      {
        "caseName": "Walnut Creek Manor, LLC v. Mayhew Center, LLC",
        "citation": "No. 4:07-cv-05664-CW (N.D. Cal.); related appeal GP Vincent II v. Estate of Beard, No. 21-16555 (9th Cir. May 17, 2023)",
        "year": 2023,
        "outcome": "A jury awarded Walnut Creek Manor $350,000 in past damages and $1,597,000 in future damages ($1,947,000 total) against Mayhew; the district court held Mayhew 100% liable for future response costs. A successor entity, GP Vincent II, later pursued a related CERCLA cost-recovery claim against the Beard estate; the Ninth Circuit reversed a claim-preclusion dismissal in 2023 and remanded for further proceedings.",
        "dollarAmount": 1947000,
        "sourceUrl": "https://law.justia.com/cases/federal/appellate-courts/ca9/21-16555/21-16555-2023-05-17.html",
        "confidence": "medium"
      },
      {
        "caseName": "Barclay Lofts LLC v. PPG Industries, Inc.",
        "citation": "No. 20-CV-1694 (E.D. Wis. Sept. 18, 2024)",
        "jurisdiction": "Federal (E.D. Wis.)",
        "year": 2024,
        "outcome": "Milwaukee industrial-to-residential redevelopment site contaminated with hexavalent chromium, arsenic, mercury, lead, and TCE. The court allocated CERCLA liability for future response costs among the historical operators/current owner: PPG Industries 50%, Hydrite Chemical Co. 20%, Wayne Pigment Corporation 20% (its share reassigned to Barclay as an uncollectible 'orphan share'), and Barclay Lofts/Sherman Associates (the current owner/redeveloper) 10%; Wayne Chemical Corp. and Lumimove Inc. were allocated 0%. Of Barclay's claimed $1.43 million in past/pre-remediation costs, the court found $1.17 million necessary and recoverable. Future cleanup cost estimates from the parties' experts ranged from $6.7 million to over $28 million; codefendant Hydrite separately settled for a $3 million escrow allocation plus $550,000 toward past costs.",
        "dollarAmount": 1170000,
        "sourceUrl": "https://www.mgkflitigationblog.com/Barclay_Lofts_PPG_Allocation_CERCLA_Superfund",
        "confidence": "high",
        "notes": "A detailed, multi-party equitable allocation ruling -- useful both for the recoverable-past-costs figure ($1.17M of $1.43M claimed) and as a real illustration of how courts split CERCLA liability among multiple historical operators plus the current owner, including assigning an insolvent party's 'orphan share' to the plaintiff rather than leaving it unallocated. dollarAmount reflects only the confirmed recoverable past costs; future costs remained a wide, unresolved range at the time of this decision."
      }
    ],
    "state_cleanup_consent_decree": [
      {
        "caseName": "New Jersey Dep't of Environmental Protection v. Solvay Specialty Polymers USA, LLC",
        "citation": "Proposed Judicial Consent Order, NJ state enforcement action (West Deptford PFAS matter)",
        "year": 2025,
        "outcome": "Proposed Judicial Consent Order: Solvay to pay $75 million for natural resource damages, $100 million to fund NJDEP-directed PFAS remediation projects in the area, and post $214 million in financial assurance to guarantee completion of its own ongoing remediation obligations (total $393 million).",
        "dollarAmount": 393000000,
        "sourceUrl": "https://www.njoag.gov/attorney-general-platkin-and-dep-commissioner-latourette-announce-proposed-settlement-with-solvay-polymers-regarding-forever-chemical-pollution-in-and-around-west-deptford/",
        "confidence": "high"
      },
      {
        "caseName": "New Jersey Dep't of Environmental Protection v. Sigma Realty, Inc.",
        "citation": "NJDEP civil enforcement action, filed 2022, settled 2025 (Ewing Township, Mercer County, NJ)",
        "year": 2025,
        "outcome": "After selling the property to a third party in July 2025 (who separately agreed with NJDEP to complete remediation and pay outstanding fees), Sigma Realty and its owners paid a $117,500 civil penalty to resolve the enforcement lawsuit.",
        "dollarAmount": 117500,
        "sourceUrl": "https://www.njoag.gov/ag-platkin-and-dep-commissioner-latourette-announce-resolution-of-two-environmental-lawsuits-and-the-filing-of-six-new-enforcement-actions-including-four-in-environmental-justice-communities/",
        "confidence": "high"
      },
      {
        "caseName": "People of the State of California v. Bay Area/Diablo Petroleum Co. (dba Golden Gate Petroleum), et al.",
        "citation": "Civil complaint filed 2018; settlement announced Mar. 6, 2023 (Northern California)",
        "year": 2023,
        "outcome": "$1.7 million settlement requiring civil penalties plus employment of an environmental compliance coordinator and ongoing annual compliance reporting.",
        "dollarAmount": 1700000,
        "sourceUrl": "https://www.oag.ca.gov/news/press-releases/attorney-general-bonta-announces-17-million-settlement-five-gas-station-owners",
        "confidence": "high"
      },
      {
        "caseName": "New Jersey Dep't of Environmental Protection v. Estate of Kenneth Knapp / Solomon Dwek (Chatsworth Deli site)",
        "citation": "NJDEP civil enforcement action, Woodland Township, Burlington County, NJ",
        "year": 2025,
        "outcome": "$85,000 civil administrative penalty docketed as a judgment against the Knapp estate/heirs.",
        "dollarAmount": 85000,
        "sourceUrl": "https://www.njoag.gov/ag-platkin-and-dep-commissioner-latourette-announce-resolution-of-two-environmental-lawsuits-and-the-filing-of-six-new-enforcement-actions-including-four-in-environmental-justice-communities/",
        "confidence": "medium"
      }
    ],
    "environmental_insurance_coverage_dispute": [
      {
        "caseName": "Travelers Property Casualty Co. of America and St. Paul Fire and Marine Ins. Co. v. Washington Shoppes LP and The Broadbent Co.",
        "citation": "No. 49D01-2511-CE-056363 (Marion Superior Court, Ind., filed Nov. 26, 2025)",
        "year": 2025,
        "outcome": "Case pending as of the research date (filed Nov. 26, 2025); insurers seek a declaration of no coverage obligation and separately dispute whether the owner qualifies as an insured and whether contamination predated the relevant policy periods.",
        "dollarAmount": null,
        "sourceUrl": "https://www.theindianalawyer.com/articles/insurance-companies-sue-indy-shopping-center-in-dispute-over-environmental-site-cleanup-costs",
        "confidence": "high"
      },
      {
        "caseName": "Fox Investments LLC v. City of Kaukauna, et al.",
        "citation": "U.S. District Court for the Eastern District of Wisconsin (filed 2024)",
        "year": 2024,
        "outcome": "Fox seeks recovery of $235,683.63 in investigation and remediation costs already incurred, pursuing the insurers directly on CERCLA cost recovery, negligence, and unjust enrichment theories rather than filing separate coverage litigation against the city first.",
        "dollarAmount": 235683.63,
        "sourceUrl": "https://www.insurancebusinessmag.com/us/news/risk-compliance-legal/property-owner-pulls-three-insurers-into-sixfigure-site-cleanup-suit-583623.aspx",
        "confidence": "medium"
      },
      {
        "caseName": "Regency Centers Corp. v. Indian Harbor Insurance Co.",
        "citation": "No. 3:24-cv-00428 (M.D. Fla.), ruling issued May 7, 2026",
        "year": 2026,
        "outcome": "The court ruled Indian Harbor owed no coverage, finding the insurer properly denied the claim under the policy's site-development and pollution exclusions.",
        "dollarAmount": null,
        "sourceUrl": "https://www.law360.com/insurance-authority/property/articles/2474868",
        "confidence": "medium"
      },
      {
        "caseName": "Town of Harrietstown v. Westchester Fire Insurance Co.",
        "citation": "No. 25-2253-cv (2d Cir. May 4, 2026) (applying New York law)",
        "year": 2026,
        "outcome": "POLICYHOLDER WIN, balancing the insurer-favorable skew in this claim type's earlier sample: the Second Circuit rejected the insurer's attempt to fragment a single PRP demand (arising partly from firefighting foam used in crash response) into multiple separate claims to limit coverage, holding 'a single claim cannot be a combined claim,' and found the insurers owed a duty to defend.",
        "dollarAmount": null,
        "sourceUrl": "https://uphelp.org/two-coasts-two-wins-for-policyholders-in-environmental-coverage-disputes/",
        "confidence": "high"
      },
      {
        "caseName": "County of San Bernardino v. Insurance Co. of the State of Pennsylvania",
        "citation": "No. 24-6986 (9th Cir. Apr. 23, 2026) (applying California law)",
        "year": 2026,
        "outcome": "POLICYHOLDER WIN: the Ninth Circuit resolved an ambiguity over the umbrella policies' aggregate limits in the insured's favor, holding the policies 'do not specify an aggregate limit for property damage' -- meaning the disputed $9 million stated annual aggregate limit did not cap the insurer's exposure the way the insurer argued. No final dollar recovery figure was reported in available coverage of the ruling.",
        "dollarAmount": null,
        "sourceUrl": "https://uphelp.org/two-coasts-two-wins-for-policyholders-in-environmental-coverage-disputes/",
        "confidence": "high"
      },
      {
        "caseName": "James River Insurance Co. v. Ground Down Engineering, Inc.",
        "citation": "540 F.3d 1270 (11th Cir. 2008)",
        "jurisdiction": "Federal (11th Cir., applying FL law)",
        "year": 2008,
        "outcome": "An environmental consulting firm incorrectly advised its client the client's property was free of pollutants; when that advice proved wrong, the consultant's insurer sought a declaratory judgment that it owed no duty to defend under the policy's pollution exclusion. The Eleventh Circuit's ruling applied the pollution exclusion to bar coverage for the consultant's core professional service of pollution testing and advice.",
        "dollarAmount": 0,
        "sourceUrl": "https://caselaw.findlaw.com/us-11th-circuit/1177959.html",
        "confidence": "high",
        "notes": "A landmark, frequently-cited illustration that an 'absolute' pollution exclusion in a general liability or E&O policy can eliminate coverage even for an environmental CONSULTANT's own negligent pollution-related advice -- not just for the underlying contamination itself. Directly relevant to any commercial party relying on an environmental consultant's clearance opinion: that consultant's own insurance may not cover a wrong call."
      }
    ],
    "just_compensation_valuation": [
      {
        "caseName": "North Carolina Department of Transportation v. AJA Investments",
        "citation": "Moore County Superior Court, Case No. 23 CVS 1525",
        "year": 2025,
        "outcome": "Settled for $1,150,000, exceeding NCDOT's highest initial offer of $693,800 by $456,200.",
        "dollarAmount": 1150000,
        "sourceUrl": "https://nclawyersweekly.com/2026/01/05/condemnation-case-ends-in-1-15m-settlement-for-commercial-property-owner/",
        "confidence": "high"
      },
      {
        "caseName": "State v. Gleannloch Commercial Development, LP",
        "citation": "585 S.W.3d 509 (Tex. App.—Houston [1st Dist.] 2019)",
        "year": 2019,
        "outcome": "Jury awarded $19.4 million in combined just compensation for the two parcels — 292% above the State's combined initial offer, representing 100% of the compensation the landowner sought at trial. Judgment affirmed on appeal.",
        "dollarAmount": 19400000,
        "sourceUrl": "https://www.velaw.com/practices/houston-i-45-highway-expansion-project/",
        "confidence": "high"
      },
      {
        "caseName": "State v. Moore Outdoor Properties, LP / Arrington Outdoor of Fort Worth, L.P.",
        "citation": "No. 08-12-00034-CV (Tex. App.—El Paso, Nov. 13, 2013) (transferred from Fort Worth)",
        "year": 2013,
        "outcome": "After a jury trial, Arrington was awarded $969,243 for its leasehold and billboard-structure interest (affirmed on appeal); Moore Outdoor Properties separately settled for $480,000.",
        "dollarAmount": 969243,
        "sourceUrl": "https://caselaw.findlaw.com/court/tx-court-of-appeals/1649615.html",
        "confidence": "high"
      },
      {
        "caseName": "City of North Canton v. Julius Brown, LLC",
        "citation": "Case No. 2024CA00030 (Ohio Ct. App., 5th Dist., Jan. 6, 2025)",
        "year": 2025,
        "outcome": "The Fifth District reversed, holding that county-auditor property-tax valuations are admissible evidence in an eminent-domain trial to help the jury determine fair compensation, and remanded for a new compensation trial.",
        "dollarAmount": null,
        "sourceUrl": "https://harpstbecker.com/2025/01/06/appellate-court-ruling-protects-commercial-property-owners-from-government-overreach-in-eminent-domain-cases/",
        "confidence": "high"
      },
      {
        "caseName": "State of Arizona v. Foothills/Hanke",
        "citation": "CV230292PR (Ariz. Jan. 31, 2025)",
        "jurisdiction": "AZ",
        "year": 2025,
        "outcome": "The State condemned easements (not fee title) in two undeveloped common-area parcels appurtenant to homeowners' titles in a planned community, to build the Loop 202 South Mountain Freeway. The Arizona Supreme Court held homeowners could recover 'proximity damages' for the diminished value of their own homes caused by the freeway's proximity, even though only the easements -- not the homeowners' own land -- were condemned, because the condemned property was part of a larger parcel under Arizona's constitution. Compensation tripled from an initial $6 million (value of the easements alone) to $18 million ($6M plus $12M in proximity/severance damages).",
        "dollarAmount": 18000000,
        "sourceUrl": "https://www.ballardspahr.com/insights/alerts-and-articles/2025/01/arizona-supreme-court-expands-just-compensation-rights-in-eminent-domain-case",
        "confidence": "high",
        "notes": "A strong, current example for the severanceAccessOrBusinessValueDispute uplift tier (3x here) -- notable because the compensable harm wasn't to the condemned parcels themselves but to OTHER property the owners held that was merely appurtenant to them, a real expansion of what counts as 'part of a larger parcel' for severance-damages purposes."
      }
    ],
    "quick_take_challenge": [
      {
        "caseName": "Medical Acquisition Company, Inc. v. Superior Court (Tri-City Healthcare District)",
        "citation": "20 Cal. App. 5th 34, D072509 (Cal. Ct. App., 4th Dist., Div. 1, Jan. 11, 2018)",
        "year": 2018,
        "outcome": "The jury found the property's fair market value to be $16.83 million — nearly 3.6x the quick-take deposit — and separately awarded MAC $2,933,700 for the district's breach of the implied covenant of good faith and fair dealing. The court ordered the district to increase its deposit by about $12.2 million to match the verdict, and the Court of Appeal addressed the novel procedural question of what security/bonding the owner could be required to post to withdraw the increased post-judgment deposit.",
        "dollarAmount": 16830000,
        "sourceUrl": "https://www4.courts.ca.gov/opinions/documents/D072509.PDF",
        "confidence": "high"
      },
      {
        "caseName": "Los Angeles County Metropolitan Transportation Authority v. Alameda Produce Market, LLC",
        "citation": "52 Cal. 4th 1100 (Cal. 2011)",
        "year": 2011,
        "outcome": "The California Supreme Court held that a party's withdrawal of a quick-take deposit does not, by itself, waive the right to continue challenging the condemnor's right to take. The underlying valuation dispute was ultimately resolved through a confidential settlement in 2011 after the property owner's parent entity went through bankruptcy, ending seven years of litigation.",
        "dollarAmount": null,
        "sourceUrl": "https://scocal.stanford.edu/opinion/la-cty-metro-trans-v-alameda-produce-34028",
        "confidence": "high"
      },
      {
        "caseName": "PKO Ventures, LLC v. Norfolk Redevelopment & Housing Authority (Norva Properties)",
        "citation": "747 S.E.2d 826 (Va. 2013)",
        "year": 2013,
        "outcome": "The Virginia Supreme Court unanimously held NRHA had no right to take the property because it was not validly part of a blighted redevelopment area, voiding the condemnation and ordering the property returned to the owner — mooting the earlier jury compensation verdict since no taking occurred.",
        "dollarAmount": null,
        "sourceUrl": "https://www.courtlistener.com/opinion/8686764/norfolk-redevelopment-housing-authority-v-norva-properties-lc/",
        "confidence": "medium"
      },
      {
        "caseName": "Matter of Bowers Development, LLC v. Oneida County Industrial Development Agency",
        "citation": "2024 NY Slip Op 00523 (App. Div., 4th Dep't, Feb. 2, 2024); cert. denied, U.S. Sup. Ct. (Mar. 24, 2025)",
        "jurisdiction": "NY",
        "year": 2024,
        "outcome": "A business competitor of the property owner asked the county industrial development agency to condemn the owner's under-contract parcel so the agency could instead build a parking lot serving the competitor's adjacent medical office building. The Appellate Division had first annulled the taking, but the Court of Appeals reversed and remanded; on remand the Appellate Division dismissed the owner's petition, holding the parking-lot project served a valid public purpose (mitigating parking and traffic congestion) regardless of the competitor's role in initiating it. The U.S. Supreme Court denied certiorari.",
        "dollarAmount": null,
        "sourceUrl": "https://www.romesentinel.com/news/bowers-development-411-columbia-st-oneida-county-supreme-court/article_52f43350-be3f-11ef-8304-0fe1f1968cca.html",
        "confidence": "high",
        "notes": "A stark, multi-level-litigated illustration of just how deferential post-Kelo public-use review is: the condemnation was requested by, and directly benefited, the owner's own business competitor, yet the taking was still upheld as serving a valid public purpose once framed as traffic/parking mitigation. Directly supports keeping this claim's baseProbability at the low end of its 0.05-0.15 range even where the challenger has a sympathetic 'this taking exists only to help my competitor' narrative."
      }
    ],
    "pre_condemnation_access_dispute": [
      {
        "caseName": "Texas Rice Land Partners, Ltd. v. Denbury Green Pipeline-Texas, LLC",
        "citation": "363 S.W.3d 192 (Tex. 2012)",
        "year": 2012,
        "outcome": "The Texas Supreme Court held that simply checking a box on a state regulatory form does not conclusively establish common-carrier (and thus eminent domain) status; a landowner may challenge that status in court, and the entity bears the burden of proving a reasonable probability that the pipeline will serve the public rather than solely the owner's own affiliated interests. Remanded for further proceedings on Denbury's actual common-carrier status.",
        "dollarAmount": null,
        "sourceUrl": "https://agrilife.org/texasaglaw/2020/07/13/win-for-tx-landowner-challenging-eminent-domain-power-of-pipeline/",
        "confidence": "high"
      },
      {
        "caseName": "PSEG Renewable Transmission LLC v. Arentz Family, LP",
        "citation": "No. 25-1730 (4th Cir. Aug. 6, 2026)",
        "year": 2026,
        "outcome": "The Fourth Circuit affirmed a preliminary injunction letting PSEG enter the properties to survey, holding PSEG qualified as an entity with eminent domain power under the statute even without a completed certification, and holding a temporary survey entry is not itself a compensable physical taking.",
        "dollarAmount": null,
        "sourceUrl": "https://marylandmatters.org/2026/08/06/piedmont-power-line-surveys-4th-circuit/",
        "confidence": "high"
      },
      {
        "caseName": "Summit Carbon Solutions, LLC v. Malloy",
        "citation": "North Dakota Supreme Court (decided January 2025)",
        "year": 2025,
        "outcome": "The North Dakota Supreme Court upheld Summit Carbon Solutions' right to conduct pre-condemnation surveys over the landowner's objection.",
        "dollarAmount": null,
        "sourceUrl": "https://iowacapitaldispatch.com/2023/12/18/landowner-attorneys-argue-survey-access-law-is-unconstitutional/",
        "confidence": "medium"
      },
      {
        "caseName": "In re Elba Express Co., LLC Petitions for Ex Parte Survey Entry",
        "citation": "Court of Common Pleas, Hampton and Colleton Counties, South Carolina (approx. 88+ separate petitions, 2026, ongoing)",
        "year": 2026,
        "outcome": "Ongoing as of mid-2026; no rulings on the merits reported yet.",
        "dollarAmount": null,
        "sourceUrl": "https://www.postandcourier.com/rising-waters/pipeline-company-sues-sc-landowners-for-survey-access-as-residents-fret-over-ace-basin-gas/article_876c8735-4f8b-4517-a568-e5925818382c.html",
        "confidence": "medium"
      },
      {
        "caseName": "Property Reserve, Inc. v. Superior Court",
        "citation": "1 Cal.5th 151 (2016)",
        "jurisdiction": "CA",
        "year": 2016,
        "outcome": "The California Supreme Court reinforced the statutory right of an entity holding the power of eminent domain to enter private property before any condemnation filing to conduct precondemnation testing and investigatory work (soil borings, environmental testing, etc.) needed to assess a property's suitability for a public project, subject to procedural safeguards and compensation for any resulting damage, but without treating the entry itself as an independent 'taking' requiring a full condemnation proceeding.",
        "dollarAmount": null,
        "sourceUrl": "https://law.justia.com/cases/california/supreme-court/2016/s217738.html",
        "confidence": "high",
        "notes": "The leading, most-cited California authority on precondemnation entry rights -- confirms the general pattern this claim type's baseProbability already reflects (courts side with the entity seeking access once it shows a plausible eminent-domain purpose), while also establishing the procedural and compensation safeguards a landowner can still insist on even while losing the access fight itself."
      }
    ],
    "regulatory_taking": [
      {
        "caseName": "Lost Tree Village Corp. v. United States",
        "citation": "787 F.3d 1111 (Fed. Cir. 2015)",
        "year": 2015,
        "outcome": "The Federal Circuit affirmed the Court of Federal Claims' finding that the permit denial was a categorical (Lucas-type) regulatory taking of the parcel, entitling the owner to compensation for the full pre-denial value.",
        "dollarAmount": 4200000,
        "sourceUrl": "https://caselaw.findlaw.com/court/us-federal-circuit/1702560.html",
        "confidence": "high"
      },
      {
        "caseName": "Sheetz v. County of El Dorado, California",
        "citation": "601 U.S. 267 (2024)",
        "year": 2024,
        "outcome": "The Supreme Court unanimously held that the Nollan/Dolan 'unconstitutional conditions' framework applies to permit conditions imposed by legislation, not just individualized administrative conditions, rejecting the county's argument that legislatively-set fees are categorically exempt from heightened takings scrutiny. Remanded for further proceedings on whether this specific fee satisfies Nollan/Dolan.",
        "dollarAmount": 23420,
        "sourceUrl": "https://www.ballardspahr.com/insights/alerts-and-articles/2024/04/us-supreme-court-rules-in-favor-of-property-owner-in-exaction-takings-case",
        "confidence": "high"
      },
      {
        "caseName": "DeVillier v. Texas",
        "citation": "601 U.S. 285 (2024)",
        "year": 2024,
        "outcome": "The Supreme Court unanimously held the case should proceed under the cause of action available under Texas law rather than a freestanding federal one, vacating and remanding for the claims to continue in the lower courts; the case did not resolve or disclose any compensation figure.",
        "dollarAmount": null,
        "sourceUrl": "https://supreme.justia.com/cases/federal/us/601/22-913/",
        "confidence": "high"
      },
      {
        "caseName": "Arkansas Game & Fish Commission v. United States",
        "citation": "568 U.S. 23 (2012); on remand, 736 F.3d 1364 (Fed. Cir. 2013)",
        "year": 2013,
        "outcome": "The Supreme Court held 8-0 that temporary, government-induced flooding is not automatically exempt from Takings Clause liability and remanded for a multi-factor analysis; on remand, the Federal Circuit affirmed that a compensable taking had occurred and upheld the original damages calculation.",
        "dollarAmount": 5700000,
        "sourceUrl": "https://en.wikipedia.org/wiki/Arkansas_Game_%26_Fish_Commission_v._United_States",
        "confidence": "medium"
      },
      {
        "caseName": "Blakelick Properties LLC v. Village of Glen Ellyn",
        "citation": "No. 25-cv-04569 (N.D. Ill., TRO granted May 8, 2025)",
        "jurisdiction": "Federal (N.D. Ill., applying IL law)",
        "year": 2025,
        "outcome": "Owner had rented a five-bedroom home on short-term platforms since 2022; the village annexed the property in 2024 and then enacted an ordinance banning short-term rentals. The district court granted a temporary restraining order, finding the owner likely to succeed on the merits of a Penn Central regulatory-taking claim because the ban would prevent economically feasible use of the property and interfered with the owner's investment-backed expectations formed before annexation.",
        "dollarAmount": null,
        "sourceUrl": "https://www.thefreelibrary.com/Federal+judge+halts+Glen+Ellyn,C%5BR%5Ds+ban+on+short-term+home+rentals.-a0840698001",
        "confidence": "medium",
        "notes": "IMPORTANT: this is a preliminary TRO ruling on likelihood of success, not a final judgment on the regulatory-taking claim's merits -- include as a current, real illustration that a short-term-rental ban applied to a property with an established pre-ban rental use and history CAN support a Penn Central claim at the threshold stage, not as a confirmed final win. A meaningfully different fact pattern from most regulatory-taking cases in this sample (a use-restriction ordinance rather than a development-density or wetlands-type regulation), reflecting a growing and currently unsettled area of takings litigation nationally."
      }
    ],

    /* eminent_domain_attorney_fees is primarily modeled via the
       eminentDomainAttorneyFees 51-jurisdiction statutory table (see
       below), not this shared citations pattern -- but a real case
       actually applying one state's fee-shifting statute is still
       valuable to show the formula working in practice, not just as
       researched statute text. */
    "eminent_domain_attorney_fees": [
      {
        "caseName": "Joseph B. Doerr Trust v. Central Florida Expressway Authority",
        "citation": "177 So. 3d 1209 (Fla. 2015)",
        "jurisdiction": "FL",
        "year": 2015,
        "outcome": "Authority's presuit written offer to purchase 9.81 acres was $4,914,221; the owner rejected it and the case proceeded to a condemnation trial, where the jury awarded $5.7 million -- roughly $800,000 above the offer. Under Fla. Stat. Sec. 73.092, the trial court initially awarded the owner $816,000 in attorney's fees. On further proceedings, the trial court found the Authority itself had caused 'excessive litigation' and held the standard benefit-achieved fee formula unconstitutional as applied, because it would have denied the owner full compensation net of fees. The Florida Supreme Court remanded for an evidentiary hearing to set total fees accounting for both the statutory benefit-achieved formula AND the portion of legal work attributable to the Authority's excessive litigation conduct.",
        "dollarAmount": 816000,
        "sourceUrl": "https://law.justia.com/cases/florida/supreme-court/2015/sc14-1007.html",
        "confidence": "high",
        "notes": "A real, Florida Supreme Court-level application of the fee-shifting mechanism this claim's eminentDomainAttorneyFees table already documents for Florida (Fla. Stat. Sec. 73.092(1), benefit-achieved formula) -- and an important refinement beyond the bare statute: where the condemning authority's OWN litigation conduct unreasonably drove up the owner's fees, a rigid benefit-achieved cap can be held unconstitutional as applied, entitling the owner to a fuller fee recovery than the base formula alone would yield. dollarAmount reflects the initial $816,000 award; the final, remanded figure (accounting for the excessive-litigation add-on) was not independently confirmed."
      }
    ],
    "variance_permit_denial_appeal": [
      {
        "caseName": "Lockaway Storage v. County of Alameda",
        "citation": "216 Cal. App. 4th 161 (2013)",
        "year": 2013,
        "outcome": "The Court of Appeal affirmed a damages award against the County for the temporary regulatory-taking effect of its erroneous permit-extension denial, plus attorney's fees; the California Supreme Court denied the County's petition for review (6-0), leaving the award intact.",
        "dollarAmount": 1700000,
        "sourceUrl": "https://www.counties.org/post/lockaway-storage-v-county-alameda-s211470",
        "confidence": "high"
      },
      {
        "caseName": "Sam Commercial Properties LLC v. Town of Mooresville",
        "citation": "No. COA22-1006 (N.C. Ct. App. Nov. 7, 2023)",
        "year": 2023,
        "outcome": "The Court of Appeals reversed, holding the Board misinterpreted the ordinance and that ambiguity in a billboard-permitting ordinance must be resolved in favor of the free use of property; the court remanded with instructions that the permit be issued.",
        "dollarAmount": null,
        "sourceUrl": "https://caselaw.findlaw.com/court/nc-court-of-appeals/115416824.html",
        "confidence": "high"
      },
      {
        "caseName": "Matter of Franklin Sq. Realty Assoc., LLC v. Board of Appeals of the Town of Hempstead",
        "citation": "2025 NY Slip Op 02065 (App. Div., 2d Dep't 2025)",
        "year": 2025,
        "outcome": "The Appellate Division upheld the Board's determination as having a rational basis and not being arbitrary and capricious, denying the petitioner's Article 78 challenge to the permit denial.",
        "dollarAmount": null,
        "sourceUrl": "https://www.nycourts.gov/reporter/3dseries/2025/2025_02065.htm",
        "confidence": "high"
      },
      {
        "caseName": "The Smoking Tree LLC (Jacob Schlichter) v. City of Albert Lea",
        "citation": "Minnesota Court of Appeals, decided May 18, 2026 (unpublished)",
        "year": 2026,
        "outcome": "The Court of Appeals reversed, holding the City Council's denial violated its own ordinance and was arbitrary and made without reason, and remanded for the City to reconsider the application under the correct standard.",
        "dollarAmount": null,
        "sourceUrl": "https://www.startribune.com/albert-lea-cannabis-business-appeals-court-overturn-rejection-smoking-tree/601847996",
        "confidence": "medium"
      },
      {
        "caseName": "Monarch Communities, LLC v. Township of Montville",
        "citation": "A-70-24 (090407) (N.J. July 13, 2026)",
        "jurisdiction": "NJ",
        "year": 2026,
        "outcome": "The New Jersey Supreme Court modified the long-standing Sica v. Board of Adjustment of Wall, 127 N.J. 152 (1992), test for inherently-beneficial-use variances. Under the revised standard, before the traditional balancing of positive and negative criteria, the applicant must now separately and affirmatively show the variance 'will not substantially impair the intent and purpose of the zoning plan and zoning ordinance' -- an independent showing beyond simply proving public benefit and no substantial detriment.",
        "dollarAmount": null,
        "sourceUrl": "https://www.njcourts.gov/system/files/court-opinions/2026/a_70_24.pdf",
        "confidence": "high",
        "notes": "A landmark, state-supreme-court-level doctrinal shift that raises the bar for a specific, common category of variance application (inherently beneficial uses, e.g. affordable housing, schools, hospitals, houses of worship) in New Jersey -- applicants can no longer rely on public-benefit showings alone. This should push variance_permit_denial_appeal's baseProbability toward the lower end of its range for New Jersey inherently-beneficial-use applications specifically, until the applicant's own facts clearly satisfy the new independent zoning-plan-consistency requirement."
      }
    ],
    "spot_zoning_challenge": [
      {
        "caseName": "Allen Distribution v. West Pennsboro Township Zoning Hearing Board",
        "citation": "No. 524 C.D. 2019 (Pa. Commw. Ct. May 11, 2020)",
        "year": 2020,
        "outcome": "The zoning hearing board found, and the Court of Common Pleas and Commonwealth Court affirmed, that the rezoning constituted invalid spot zoning; the rezoning ordinances were struck down and the industrial development could not proceed under that zoning.",
        "dollarAmount": null,
        "sourceUrl": "https://www.babstcalland.com/news-article/commonwealth-court-sees-spot-zoning-overturns-industrial-rezoning/",
        "confidence": "medium"
      },
      {
        "caseName": "Lathan v. Union County Board of Commissioners",
        "citation": "47 N.C. App. 357, 267 S.E.2d 30 (1980)",
        "year": 1980,
        "outcome": "The Court of Appeals held, as a matter of law, that the rezoning constituted invalid spot zoning and invalidated the ordinance.",
        "dollarAmount": null,
        "sourceUrl": "https://law.justia.com/cases/north-carolina/court-of-appeals/1980/7920sc1181-1.html",
        "confidence": "medium"
      },
      {
        "caseName": "Chaffier v. Hellertown Borough Zoning Hearing Board",
        "citation": "No. 907 C.D. 2022 (Pa. Commw. Ct. Jan. 10, 2024) (unpublished memorandum opinion)",
        "year": 2024,
        "outcome": "The Commonwealth Court struck down the rezoning ordinance as illegal spot zoning.",
        "dollarAmount": null,
        "sourceUrl": "https://www.law.com/thelegalintelligencer/2024/01/31/commonwealth-court-strikes-down-ordinance-due-to-illegal-spot-zoning/",
        "confidence": "medium"
      },
      {
        "caseName": "Burd v. Borough of Brentwood Zoning Hearing Board",
        "citation": "1049 C.D. 2021 (Pa. Commw. Ct. Apr. 18, 2023)",
        "year": 2023,
        "outcome": "UNSUCCESSFUL challenge -- balances the prior all-successful sample flagged as possibly outcome-selection-biased. Adjacent property owners challenged the Borough's rezoning of a parcel from residential to mixed-use (to permit a parking lot) as impermissible spot zoning, characterizing it as a 'peninsula' of commercial property surrounded by residential. The Commonwealth Court rejected that characterization, finding the parcel bordered residential zones on only two sides (not three) and was a 'natural extension' of existing adjacent mixed-use zoning that served the legitimate purpose of creating a buffer between commercial and residential uses. The rezoning was upheld.",
        "dollarAmount": null,
        "sourceUrl": "https://lawoftheland.wordpress.com/2023/11/15/pa-commonwealth-court-upholds-mixed-use-rezoning-ordinance-in-rejection-of-spot-zoning-argument/",
        "confidence": "high"
      },
      {
        "caseName": "Lewis Point Neighborhood Association, Inc. v. Town of Lenox",
        "citation": "Index No. EF2019-2130 (N.Y. Sup. Ct., Madison Cnty., July 17, 2020)",
        "jurisdiction": "NY",
        "year": 2020,
        "outcome": "The town rezoned a parcel specifically to permit 'campgrounds' in its Business-Recreational district, drafted after the town attorney suggested it as a 'solution' to the existing campground owner's site-plan application, which otherwise violated the pre-amendment zoning code. The court annulled the rezoning as illegal spot zoning, holding it was enacted to benefit one specific landowner and was inconsistent with any comprehensive plan -- the town board had mistakenly believed a comprehensive plan existed when none had ever been formally adopted. The court also invalidated the accompanying environmental (SEQRA) review for failing to assess impacts on parcels other than the campground owner's own.",
        "dollarAmount": null,
        "sourceUrl": "https://nyenvlaw.com/blog/state-supreme-court-annuls-towns-spot-zoning/",
        "confidence": "high",
        "notes": "A clean textbook spot-zoning annulment with two independently sufficient grounds (single-beneficiary drafting history plus no genuine comprehensive-plan consistency), pairing well with the PA Commonwealth Court citation above where a similar-looking targeted rezoning was upheld because it WAS shown consistent with an actual comprehensive plan -- the comprehensive-plan-consistency question is the real hinge in most of these cases, more than the rezoning's narrowness alone."
      }
    ],
    "section_1983_zoning_claim": [
      {
        "caseName": "City of Monterey v. Del Monte Dunes at Monterey, Ltd.",
        "citation": "526 U.S. 687 (1999)",
        "year": 1999,
        "outcome": "The case was tried to a jury, which found for the developer on the takings theory and awarded damages. The Ninth Circuit and, in a 5-4 decision, the Supreme Court affirmed both the jury's verdict and its authority to decide the takings-liability question -- a first for a regulatory-takings damages suit.",
        "dollarAmount": 1450000,
        "sourceUrl": "https://supreme.justia.com/cases/federal/us/526/687/",
        "confidence": "high"
      },
      {
        "caseName": "Town of Orangetown v. Magee",
        "citation": "88 N.Y.2d 41, 665 N.E.2d 1061, 643 N.Y.S.2d 25 (1996)",
        "year": 1996,
        "outcome": "The Court of Appeals affirmed reinstatement of the building permit and a damages award to the developer for the Town's Section 1983 violation of the developer's vested property rights, plus costs and attorneys' fees.",
        "dollarAmount": 5137126,
        "sourceUrl": "https://www.law.cornell.edu/nyctap/I96_0091.htm",
        "confidence": "high"
      },
      {
        "caseName": "Green Genie, Inc. v. City of Detroit",
        "citation": "63 F.4th 521 (6th Cir. 2023)",
        "year": 2023,
        "outcome": "The Sixth Circuit affirmed summary judgment for the City, holding Green Genie failed to identify valid similarly-situated comparators and that the City had denied numerous other applicants for the same drug-free-zone reason. The plaintiff lost.",
        "dollarAmount": null,
        "sourceUrl": "https://law.justia.com/cases/federal/appellate-courts/ca6/22-1441/22-1441-2023-03-21.html",
        "confidence": "high"
      },
      {
        "caseName": "Rubicon Real Estate Holdings, LLC v. City of Pontiac",
        "citation": "No. 25-1631 (6th Cir. June 18, 2026)",
        "year": 2026,
        "outcome": "The district court granted summary judgment for the City; the Sixth Circuit affirmed, holding the developer lacked a constitutionally protected property interest in discretionary permits and that the bureaucratic delay, however frustrating, was not 'extraordinary' enough to constitute a taking or a due process violation.",
        "dollarAmount": null,
        "sourceUrl": "https://caselaw.findlaw.com/court/us-6th-circuit/139569.html",
        "confidence": "high"
      },
      {
        "caseName": "W.J.F. Realty Corp. v. Town of Southampton",
        "citation": "261 A.D.2d 609, 690 N.Y.S.2d 725 (N.Y. App. Div., 2d Dep't, 1999)",
        "jurisdiction": "NY",
        "year": 1999,
        "outcome": "Landowners challenged a series of official actions by the Town, including a development moratorium and the denial of their application for an exemption from it. After a nonjury trial, the court found the December 1993 denial of the plaintiffs' moratorium-exemption application denied them equal protection, and awarded damages plus 9% prejudgment interest and reasonable attorney's fees -- total exposure reported as potentially exceeding $13 million.",
        "dollarAmount": 13000000,
        "sourceUrl": "https://scholarship.law.stjohns.edu/cgi/viewcontent.cgi?article=1480&context=lawreview",
        "confidence": "medium",
        "notes": "A rare example of a landowner actually PREVAILING on an equal-protection theory against a municipality's discretionary land-use decision, with real, large damages plus fees and interest -- a useful counterweight to the Sixth Circuit citation above (developer lost on due process) in this same claim type, since equal protection and due process theories succeed at meaningfully different rates in zoning litigation. dollarAmount reflects the reported total exposure figure, which blends principal damages with interest and fees rather than isolating a single compensatory-damages number."
      }
    ],
    "development_agreement_breach": [
      {
        "caseName": "Mammoth Lakes Land Acquisition, LLC v. Town of Mammoth Lakes",
        "citation": "191 Cal. App. 4th 435 (2010)",
        "year": 2010,
        "outcome": "A jury found the Town breached the development agreement. The trial court entered judgment for the developer, and the Court of Appeal affirmed both the compensatory damages award and a separate attorney-fee award, rejecting the Town's exhaustion and performance-excuse defenses.",
        "dollarAmount": 30000000,
        "sourceUrl": "https://caselaw.findlaw.com/court/ca-court-of-appeal/1551026.html",
        "confidence": "high"
      },
      {
        "caseName": "City Heights Holdings LLC v. City of Cle Elum",
        "citation": "Arbitration award (Hon. Paris Kallas, ret., arbitrator), November 2024; related confirmation proceedings in King County Superior Court",
        "year": 2024,
        "outcome": "The arbitrator ruled the City breached the 2011 development agreement and assessed damages against the City several times larger than the City's entire annual general fund, prompting the City Council to vote 5-2 in January 2025 to pursue Chapter 9 municipal bankruptcy -- the first in Washington State since 1991.",
        "dollarAmount": 22000000,
        "sourceUrl": "https://www.cascadepbs.org/politics/2025/02/how-22m-judgment-against-cle-elum-pushed-city-bankruptcy/",
        "confidence": "medium"
      },
      {
        "caseName": "Township of Salem v. Miller Penn Development LLC",
        "citation": "Nos. 2083 C.D. 2015 & 2174 C.D. 2015 (Pa. Commw. Ct. May 26, 2016)",
        "year": 2016,
        "outcome": "The Commonwealth Court affirmed a judgment for the Township against the developer for the cost of remedying the defective public improvements, rejecting both the Township's larger, more speculative damages claim and the developer's statute-of-limitations defense under the nullum tempus doctrine (limitations periods do not run against a government enforcing public rights).",
        "dollarAmount": 25558,
        "sourceUrl": "https://caselaw.findlaw.com/court/pa-commonwealth-court/1736850.html",
        "confidence": "medium"
      },
      {
        "caseName": "5th & Walnut Parking, LLC, et al. v. City of Des Moines",
        "citation": "No. 24-1886 (Iowa June 12, 2026)",
        "year": 2026,
        "outcome": "The developers and the City entered a development agreement for a downtown multi-use project (parking garage, residential tower, theater). The project was repeatedly delayed by title issues, design changes, and COVID-19; the City issued default notices in mid-2020 for missed construction deadlines, which triggered the project lender's foreclosure, and the City then purchased the garage at that foreclosure sale -- extinguishing the developers' debt but also cutting off their ability to complete the project and realize the deal's contractual upside. The Iowa Supreme Court affirmed the district court's finding that the CITY, not the developers, breached the agreement, and affirmed a damages award of over $4.3 million for the developers' lost contractual benefits. The Court separately reversed a companion judgment against the City for tortious interference with contract, holding a breach of contract alone -- without additional improper conduct -- does not support that separate tort claim.",
        "dollarAmount": 4300000,
        "sourceUrl": "https://storage.courtlistener.com/pdf/2026/06/12/5th_and_walnut_parking_llc_5th_and_walnut_tower_llc_5th_and_court_llc.pdf",
        "confidence": "high"
      },
      {
        "caseName": "PML Development LLC v. Village of Hawthorn Woods",
        "citation": "Trial: Cir. Ct. Lake County, No. 15-CH-848; PML I: 2022 IL App (2d) 200779; PML II (Ill. Supreme Court): 2023 IL 128770; final: 2025 IL App (2d) 240191-U (Mar. 26, 2025)",
        "year": 2025,
        "outcome": "COMPLEX, MULTI-LEVEL SAGA -- included for real downside-risk illustration, not a clean win/loss. PML agreed to grade and fill a 62-acre parcel and later convey it to the Village; performance broke down over permitting delays. Trial court (2020): found BOTH parties materially breached, but held the Village breached first (excusing PML's breach), and awarded PML ~$5.3M. Appellate court (2022): reversed -- held mutual material breach barred recovery for EITHER side. Illinois Supreme Court (2023): reversed again, adopting the 'partial-breach doctrine' (a party who continues performing after the other's material breach may still sue for damages, though it can be liable for its own breach too) -- remanded for both parties' damages to be determined and offset against each other. FINAL result (2025, on remand and second appeal): PML awarded $5,081,293 in damages -- but the Village was ALSO awarded $408,000 for two of PML's own breaches (failing to fund a draw-down account and failing to repair a road), netted against PML's recovery; PML was found the prevailing party overall and entitled to attorney fees for the entire litigation, including the earlier appeals. Real illustration that even a large, ultimately-successful developer claim against a municipality can face a substantial, legitimate offsetting counterclaim that meaningfully reduces net recovery -- not a clean win.",
        "dollarAmount": 5081293,
        "sourceUrl": "https://www.clausen.com/pml-development-v-village-of-hawthorn-woods-supreme-court-decision/",
        "confidence": "high"
      },
      {
        "caseName": "Village of Hoffman Estates v. Northern Illinois University Foundation",
        "citation": "2025 IL App (1st) 231720-U (Apr. 17, 2025)",
        "jurisdiction": "IL",
        "year": 2025,
        "outcome": "A 1999 annexation/development agreement required the Foundation to donate a parcel to the Village if an NIU branch campus wasn't built there within 10 years. A 2005 amendment exchanged parcels and stated the new agreement's terms governed all donations and fees going forward, not the 1999 agreement's. When NIU never built the campus, the Village demanded the Foundation donate the parcel anyway; the Foundation refused, arguing the 2005 amendment eliminated that obligation. The circuit court dismissed the Village's specific-performance and unjust-enrichment claims with prejudice, and the Appellate Court affirmed.",
        "dollarAmount": null,
        "sourceUrl": "https://www.dailyherald.com/20250418/news/hoffman-estates-loses-appeal-of-case-seeking-donation-of-20-acres-from-niu-foundation/",
        "confidence": "high",
        "notes": "REVERSE-DIRECTION citation: here the MUNICIPALITY is the one suing to enforce a development agreement, against a developer/foundation entity, and losing -- useful defensive precedent for a developer facing a municipality's enforcement claim, particularly where the parties later amended or superseded the original agreement's specific terms. Confirms that a later, more specific agreement provision governing the same subject matter can fully displace an earlier obligation, even one the municipality reasonably believed still applied."
      }
    ],
    "slip_and_fall_hazardous_condition": [
      {
        "caseName": "(Unnamed plaintiff) v. Kinkisharyo International, LLC",
        "citation": "Los Angeles County Superior Court jury verdict, May 21, 2024 (docket number not independently confirmed)",
        "jurisdiction": "CA",
        "year": 2024,
        "outcome": "An electrical technician working for an independent contractor was called to a Palmdale train-manufacturing facility at 2:00 a.m. and told the repair had to be finished by 5:00 a.m. He slipped on a patch of ice atop a train car and suffered a permanent, catastrophic spinal injury. The jury found the property owner/operator failed to take adequate steps to prevent ice buildup or otherwise ensure a safe work environment, and returned a $58,358,431 verdict -- reported as the largest slip-and-fall verdict in U.S. history.",
        "dollarAmount": 58358431,
        "sourceUrl": "https://www.prnewswire.com/news-releases/los-angeles-jury-awards-over-58-000-000-to-injured-palmdale-train-yard-worker-302152522.html",
        "confidence": "medium",
        "notes": "Relied on plaintiff-firm and wire-service reporting (PARRIS Law Firm, PR Newswire) rather than a directly retrieved court record -- a trial-court jury verdict, not an appellate opinion, so treat as illustrative of catastrophic-injury upside rather than a settled point of law. Real anchor for how far a slip-and-fall verdict can run once causation and a serious, permanent injury are both established."
      },
      {
        "caseName": "Henry Walker v. Walmart Stores, Inc.",
        "citation": "Russell County, Alabama (Phenix City) jury verdict, November 2017 (docket number not independently confirmed)",
        "jurisdiction": "AL",
        "year": 2017,
        "outcome": "Plaintiff's foot became trapped in a display pallet while reaching for a watermelon; when he tried to turn, his foot caught and he fell, suffering a severe hip injury. Store security footage showed multiple OTHER shoppers had gotten their feet caught in the same pallet before the plaintiff's fall -- evidence the jury found sufficient to establish wantonness, not just ordinary negligence. Jury awarded $2.5 million in compensatory damages and $5 million in punitive damages ($7.5 million total).",
        "dollarAmount": 7500000,
        "sourceUrl": "https://www.cbsnews.com/news/walmart-shopper-hurt-while-buying-melon-wins-7-5m-verdict/",
        "confidence": "medium",
        "notes": "Also cited under 'Punitive Damages' below -- documented, camera-captured evidence of PRIOR similar incidents on the exact same hazard is what elevated this from an ordinary notice-based slip-and-fall claim into a wantonness (Alabama's willful/wanton punitive-damages standard) finding. Illustrates how directly the 'hazardNoticeProven' fact and the punitive-damages 'egregiousConductAlleged' fact can be linked in a real fact pattern -- the same prior-incident evidence proved both."
      },
      {
        "caseName": "Albertsons, LLC v. Mohammadi",
        "citation": "___ S.W.3d ___, No. 23-0041 (Tex. Apr. 5, 2024)",
        "jurisdiction": "TX",
        "year": 2024,
        "outcome": "Plaintiff, a bank employee working inside a Randalls grocery store, slipped on a puddle of water that formed after another employee placed a leaking item in a shopping cart. She argued the store's knowledge of the leaking item was itself evidence of actual knowledge of the resulting puddle. The Texas Supreme Court disagreed, holding that actual knowledge of a dangerous condition requires specific evidence the condition ITSELF existed at the time of the accident -- knowledge of an upstream cause is not enough. Reversed the court of appeals in the store's favor.",
        "dollarAmount": null,
        "sourceUrl": "https://law.justia.com/cases/texas/supreme-court/2024/23-0041.html",
        "confidence": "high",
        "notes": "The clean, current, high-court illustration of why 'no notice evidence' is the single most common reason a slip-and-fall claim fails -- Texas requires proof the specific hazard existed long enough for the owner to have discovered it, not just evidence the owner knew about a related risk in the abstract. Also cited under 'Dangerous Condition / Failure to Warn' below, since the underlying theory pled was failure to warn of the puddle."
      }
    ],
    "inadequate_security_third_party_crime": [
      {
        "caseName": "Georgia CVS Pharmacy, LLC v. Carmichael",
        "citation": "316 Ga. 718, 890 S.E.2d 209 (2023)",
        "jurisdiction": "GA",
        "year": 2023,
        "outcome": "Plaintiff was shot and seriously injured in a CVS parking lot in a high-crime area; CVS employees had repeatedly raised safety concerns, and another employee had been robbed at gunpoint just three weeks before the shooting. A jury apportioned 95% fault to CVS, 5% to the plaintiff, and 0% to the (non-party) shooter, awarding $42.75 million. The Georgia Supreme Court affirmed, holding that the reasonable foreseeability of a third-party criminal act is assessed under the totality of the circumstances as part of the proprietor's O.C.G.A. Sec. 51-3-1 duty to keep the premises safe.",
        "dollarAmount": 42750000,
        "sourceUrl": "https://law.justia.com/cases/georgia/supreme-court/2023/s22g0527.html",
        "confidence": "high",
        "notes": "A real, reported, high-court-affirmed illustration of the single most important fact in this claim type: documented PRIOR incidents/concerns at the exact location (here, employees' own repeated safety complaints and a very recent armed robbery) drove a finding of foreseeability strong enough to apportion effectively zero fault to the actual shooter."
      },
      {
        "caseName": "Barrak v. Report Investment Corporation",
        "citation": "Miami-Dade County Circuit Court jury verdict (docket number not independently confirmed)",
        "jurisdiction": "FL",
        "year": 2023,
        "outcome": "Plaintiff was shot outside a nightclub tenant (Tootsie's Cabaret) at a shopping center, leaving him a ventilator-dependent quadriplegic. The jury found the shopping center's owner failed to provide adequate security given the foreseeable risk, and returned a $102.7 million verdict -- reported as the largest negligent-security verdict in U.S. history.",
        "dollarAmount": 102700000,
        "sourceUrl": "https://www.law.com/verdictsearch/verdict/shooting-victim-shopping-center-is-liable-for-injuries/",
        "confidence": "medium",
        "notes": "Relied on secondary/aggregator reporting rather than a directly retrieved court record -- a trial-court jury verdict, not an appellate opinion, so treat as illustrative of catastrophic-injury upside (a commercial LANDLORD held liable for a TENANT business's security failures on common areas) rather than a settled point of law."
      }
    ],
    "negligent_maintenance_structural_failure": [
      {
        "caseName": "(Balcony collapse litigation re: 2003 Franklin Street)",
        "citation": "San Francisco County Superior Court No. CGC-95-968644",
        "jurisdiction": "CA",
        "year": 1996,
        "outcome": "A fourth-floor balcony at a Pacific Heights apartment building collapsed during a party, caused by extensive dry rot in the supporting joists that had been concealed rather than repaired; one guest died and another suffered a severe brain injury. The jury awarded $12,389,050 against the building's owner/landlord for negligent maintenance of the structure, and additionally ordered the landlord to live in his own building.",
        "dollarAmount": 12389050,
        "sourceUrl": "https://www.sfgate.com/news/article/Landlord-to-Pay-12-Million-in-Fatal-96-Deck-3009451.php",
        "confidence": "medium",
        "notes": "Older but well-documented illustration of the durable-defect dynamic this claim type is built on: the rot was concealed under building materials rather than genuinely repaired, and was established through post-collapse inspection rather than relying on a notice-timing argument the way a transient hazard claim would need to."
      }
    ],
    "dangerous_condition_failure_to_warn": [
      {
        "caseName": "James Papp v. Hedgerow Properties, LLC",
        "citation": "Connecticut Superior Court jury verdict re: incident of Nov. 4, 2021 (docket number not independently confirmed)",
        "jurisdiction": "CT",
        "year": 2023,
        "outcome": "Plaintiff, a lawful invitee, tripped and fell down an exterior stairway at a Winsted, Connecticut property that violated the Connecticut State Building Code and carried no warning of the defect. Jury awarded $3.68 million against the property owner/manager for the dangerous, unwarned condition.",
        "dollarAmount": 3680000,
        "sourceUrl": "https://jurimatic.com/slip-and-fall-victory-3-7m-verdict-in-premises-liability-lawsuit",
        "confidence": "low",
        "notes": "Relied entirely on a litigation-marketing aggregator summary rather than a directly retrieved court record -- exact trial date/docket not independently confirmed. Included as a real, on-point plaintiff-favorable data point for a pure failure-to-warn theory (building-code violation + no posted warning), which is otherwise harder to find a clean win for than a slip-and-fall or negligent-security claim."
      },
      {
        "caseName": "Albertsons, LLC v. Mohammadi",
        "citation": "___ S.W.3d ___, No. 23-0041 (Tex. Apr. 5, 2024)",
        "jurisdiction": "TX",
        "year": 2024,
        "outcome": "See full outcome under 'Slip-and-Fall / Hazardous Condition' above -- the underlying theory pled here was specifically failure to WARN of the puddle (not failure to remedy it), and the Texas Supreme Court held that knowledge of an upstream cause (a leaking item placed in a cart) is not evidence of knowledge of the specific hazard itself.",
        "dollarAmount": null,
        "sourceUrl": "https://law.justia.com/cases/texas/supreme-court/2024/23-0041.html",
        "confidence": "high",
        "notes": "The DEFENSE-favorable counterweight to the Papp v. Hedgerow citation above -- shows the same claim type can fail entirely where the specific-knowledge element isn't met, even though a hazard plainly existed and caused a real injury."
      }
    ],
    "premises_punitive_damages": [
      {
        "caseName": "Henry Walker v. Walmart Stores, Inc.",
        "citation": "Russell County, Alabama (Phenix City) jury verdict, November 2017 (docket number not independently confirmed)",
        "jurisdiction": "AL",
        "year": 2017,
        "outcome": "See full outcome under 'Slip-and-Fall / Hazardous Condition' above. The $5 million punitive component (on top of $2.5 million compensatory) rested specifically on camera evidence that the SAME hazard had already caught multiple other customers' feet before the plaintiff's fall -- the jury found that record sufficient to establish wantonness (Alabama's willful/wanton standard) rather than mere ordinary negligence.",
        "dollarAmount": 5000000,
        "sourceUrl": "https://www.cbsnews.com/news/walmart-shopper-hurt-while-buying-melon-wins-7-5m-verdict/",
        "confidence": "medium",
        "notes": "A clean illustration of what actually elevates ordinary premises negligence into punitive-damages territory: not the severity of the resulting injury, but documented evidence the owner already knew (via the exact same hazard recurring on camera) and did nothing before this plaintiff was hurt."
      },
      {
        "caseName": "Terhune v. Forum Medical (Moran Lake Road Nursing Home)",
        "citation": "Floyd County, Georgia jury verdict, 2010 (docket number not independently confirmed)",
        "jurisdiction": "GA",
        "year": 2010,
        "outcome": "A nursing-home resident was malnourished, dehydrated, and denied medical care for a broken hip, and died after what was supposed to be a temporary post-operative stay; evidence showed the facility owner diverted resident-care insurance payments to personal use rather than adequate staffing/supplies. Jury awarded $8.5 million in compensatory damages and $35 million in punitive damages -- reported as the largest judgment against a nursing home in Georgia history at the time.",
        "dollarAmount": 35000000,
        "sourceUrl": "https://www.aboutlawsuits.com/wrongful-death-lawsuit-nursing-home-owner-12905/",
        "confidence": "low",
        "notes": "A DIFFERENT premises sub-context (a licensed medical/care facility, not a typical commercial property) and relied on secondary reporting rather than a directly retrieved court record -- included because it's a real, large, well-documented illustration of the DEGREE of egregious, profit-motivated conduct that can drive a punitive award far above the compensatory figure (roughly 4x here), which a typical commercial slip-and-fall or negligent-security fact pattern rarely reaches. Do not treat the specific multiple as a benchmark for an ordinary commercial premises case."
      }
    ]
  },
  "stateLawModifiers": {
    "Alabama": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine (cap applies)",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help re-entry is generally available to Alabama COMMERCIAL landlords at common law (peaceable, lease-authorized). The enhanced-damages statute for wrongful lockout (Ala. Code Sec. 35-9A-407, greater of actual damages or up to 3 months' rent) is part of the Alabama Uniform Residential Landlord and Tenant Act and does not extend to commercial tenancies. No confirmed commercial-specific statutory enhancement found; a commercial tenant's remedy for an improper lockout (e.g., breach of the peace, no lease authorization) is actual damages via common-law tort theories."
    },
    "Alaska": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help re-entry is generally available to Alaska COMMERCIAL landlords at common law. The enhanced-damages provision (AS 34.03.210, up to 1.5x actual damages) is part of the Alaska Uniform Residential Landlord and Tenant Act (Title 34.03) and does not extend to commercial tenancies. No confirmed commercial-specific statutory enhancement found."
    },
    "Arizona": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Arizona has a commercial-specific reentry statute (A.R.S. Sec. 33-361, outside the Residential Landlord and Tenant Act) permitting landlord reentry on default, but the landlord may not act while the tenant is physically present and must not breach the peace. No statutory multiplier/floor was found for a WRONGFUL commercial lockout -- the tenant's remedy is the actual damages sustained (which can include lost profits and business-interruption damages in a proper case)."
    },
    "Arkansas": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help is prohibited entirely for Arkansas commercial landlords (judicial process required). No commercial-specific wrongful-lockout penalty statute was confirmed. Note: Ark. Code Ann. Sec. 18-60-309's 'three times the rental value' liquidated-damages figure for commercial/mixed-use property runs the OTHER direction -- it compensates a LANDLORD against a holdover tenant in an unlawful-detainer action, not a tenant's claim against a landlord for wrongful lockout -- so it should not be applied here."
    },
    "California": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "per-day",
      "wrongfulLockoutRemedyValue": 100,
      "wrongfulLockoutCitation": "Cal. Civ. Code Sec. 789.3 -- $100/day minimum statutory penalty plus actual damages and attorney's fees."
    },
    "Colorado": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Colorado's enhanced wrongful-lockout remedy (C.R.S. Sec. 38-12-510, actual damages plus the greater of 3x monthly rent or $5,000, plus attorney's fees, added by SB 21-173) is expressly limited to a 'dwelling unit' and does not extend to commercial tenancies. No case law or statute addresses commercial landlord self-help directly, so the common-law remedy (and actual-damages-only exposure for wrongful use) likely still applies to commercial leases."
    },
    "Connecticut": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Varies",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help is prohibited entirely for Connecticut commercial landlords -- all repossession must go through Summary Process (Conn. Gen. Stat. Ch. 832), even where the lease purports to authorize self-help. No confirmed statutory damages multiplier for a wrongful commercial lockout; likely actual damages via breach of the covenant of quiet enjoyment / trespass."
    },
    "Delaware": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Varies",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Delaware's Landlord-Tenant Code (Title 25) prohibits self-help lockouts, but its detailed provisions and penalties are written for residential rental units. No confirmed commercial-specific wrongful-lockout penalty statute or multiplier was found; treat as actual damages only pending confirmation."
    },
    "District of Columbia": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help is unavailable to BOTH commercial and residential landlords in the District of Columbia as a matter of settled case law -- Simpson v. Lee, 499 A.2d 889 (D.C. 1985); Mendes v. Johnson, 389 A.2d 781 (D.C. 1978) (Congress's creation of a summary judicial-possession process abrogated the common-law self-help right). Damages for an unlawful eviction are discretionary/case-by-case (no fixed statutory multiplier) -- actual damages plus property damage, at the court's discretion."
    },
    "Florida": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Fla. Stat. Sec. 83.67 prohibits self-help; no confirmed commercial-specific statutory multiplier found -- actual damages, costs, and attorney's fees. Verify further before relying on a multiplier."
    },
    "Georgia": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "O.C.G.A. Sec. 44-7-49/50/55 (dispossessory procedure) -- landlord liable for foreseeable damages caused by wrongful conduct; no confirmed statutory multiplier for commercial tenants."
    },
    "Hawaii": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Hawaii commercial landlords are not precluded from self-help for nonpayment of rent specifically, but must otherwise use the summary possession judicial process (HRS Ch. 666). The enhanced remedy referenced in secondary sources (2 months' rent or free occupancy, HRS Sec. 521-63) is part of the Hawaii residential landlord-tenant code and does not extend to commercial tenancies. No confirmed commercial-specific statutory enhancement found."
    },
    "Idaho": {
      "classification": "Neutral",
      "selfHelpAvailable": "Uncertain",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Idaho permits commercial landlord self-help only in abandonment (or similarly defined) circumstances -- a wrongful lockout outside that exception exposes the landlord to liability. A treble-damages figure appears in secondary sources but traces to Idaho's residential tenant-protection statute; its extension to nonresidential/commercial tenancies is not confirmed. Treat conservatively as actual damages only until independently verified."
    },
    "Illinois": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "735 ILCS 5/9-101 et seq. (Forcible Entry and Detainer Act) requires judicial process for eviction; self-help is prohibited for Illinois commercial landlords. No confirmed statutory damages multiplier for a wrongful commercial lockout -- tenant's remedy is actual damages, which can include lost business revenue, emergency relocation costs, and property/inventory losses, plus attorney's fees and costs."
    },
    "Indiana": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Indiana has no confirmed statute or case law specifically addressing commercial-landlord self-help. A statutory damages range ($500-$2,500, Ind. Code Sec. 32-31-11) was found in secondary sources but appears designed for residential tenancies (Indiana's tenant-safety provisions); its application to commercial tenancies is not confirmed. No confirmed commercial-specific enhancement."
    },
    "Iowa": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Uncertain",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Iowa's enhanced wrongful-lockout remedy (Iowa Code Sec. 562A.26 -- actual damages plus 2 months' rent or 2x actual damages, whichever greater, plus punitive damages up to 2x monthly rent) is part of the Iowa Uniform Residential Landlord and Tenant Act (Ch. 562A) and does not extend to commercial tenancies. No case law confirms whether commercial self-help is available or prohibited in Iowa; no commercial-specific enhancement found."
    },
    "Kansas": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Kansas's enhanced wrongful-lockout remedy (roughly 1.5 months' rent or actual damages, whichever greater) is part of the Kansas Residential Landlord and Tenant Act and does not extend to commercial tenancies. No case law confirms whether commercial self-help is available or prohibited in Kansas; no commercial-specific enhancement found."
    },
    "Kentucky": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Kentucky's enhanced wrongful-lockout remedy (KRS Sec. 383.655 -- damages up to 3 months' rent plus attorney's fees) is part of the Uniform Residential Landlord and Tenant Act (KRS Ch. 383, applicable only in adopting counties/cities) and does not extend to commercial tenancies. No confirmed commercial-specific statutory enhancement found."
    },
    "Louisiana": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help is prohibited entirely for Louisiana commercial landlords; a wrongful lockout is treated as trespass and can support a bad-faith breach-of-obligation claim (exposing the landlord to foreseeable and unforeseeable damages) and potentially an unfair-trade-practices claim under La. R.S. 51:1401 et seq. A specific dollar penalty figure appears in general secondary sources but could not be confirmed against a Louisiana-specific statute citation with confidence -- verify before relying on any fixed multiplier."
    },
    "Maine": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Uncertain",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Maine's Forcible Entry and Detainer chapter (14 M.R.S. Ch. 709) requires judicial process for eviction, including from commercial premises (see the chapter's separate commercial-lease provision at 14 M.R.S. Sec. 6017). Sec. 6014 sets tenant recovery at the greater of actual damages or $250 (plus costs and attorney's fees) -- but this is a REPLACEMENT floor on the total recovery, not an additive one, so it is not modeled as an automatic enhancement here to avoid overstating damages; use $250 as a floor reference only if actual damages are confirmed to be lower."
    },
    "Maryland": {
      "classification": "Neutral",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Maryland retains the common-law rule allowing commercial-landlord self-help where the lease authorizes reentry, the tenant is in default beyond any cure period, and reentry is peaceful. No statutory penalty scheme applies to commercial self-help; a wrongful/improper lockout exposes the landlord to common-law damages (conversion, tortious interference with business relationships, the tenant's actual losses) rather than a statutory multiplier."
    },
    "Massachusetts": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Massachusetts's enhanced wrongful-lockout remedy (M.G.L. c. 186, Sec. 14 -- 3 months' rent or actual damages, whichever greater, plus attorney's fees) is expressly limited to premises 'occupied for dwelling purposes' and does not extend to commercial tenancies. Per counsel-of-record review, Massachusetts commercial self-help issues track ordinary landlord-tenant principles; no confirmed commercial-specific statutory enhancement found."
    },
    "Michigan": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "multiplier",
      "wrongfulLockoutRemedyValue": 3,
      "wrongfulLockoutCitation": "Mich. Comp. Laws Sec. 600.2918 -- treble damages (or a $200 statutory minimum, whichever greater) for forcible or unlawful ouster from real property, plus recovery of possession. This is a general real-property statute (Michigan's Revised Judicature Act), not limited to residential dwellings, and Michigan case law has applied it to commercial tenancies."
    },
    "Minnesota": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Minnesota's enhanced wrongful-lockout remedy (Minn. Stat. Sec. 504B.225/504B.231 -- 3x damages or $500, whichever greater, plus attorney's fees; criminal exposure under Sec. 609.606) is confirmed to apply to RESIDENTIAL tenancies only -- Minnesota Statutes Chapter 504B does not govern purely commercial leases. No confirmed commercial-specific statutory enhancement found."
    },
    "Mississippi": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Mississippi generally prohibits commercial self-help, with a narrow exception for peaceable reentry when the written lease expressly grants a right of reentry on default. No statutory penalty scheme was found for a wrongful commercial lockout; the tenant's remedy is actual damages (including business-interruption losses) via wrongful-eviction/trespass theories."
    },
    "Missouri": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Missouri permits commercial-landlord self-help only for abandonment (or similarly defined circumstances); a wrongful lockout outside that exception makes the landlord 'guilty of forcible entry and detainer' and subject to whatever penalty that violation carries. Secondary sources describe a 2-months'-rent-or-2x-actual-damages figure, but the precise statutory citation and its commercial applicability could not be confirmed with confidence -- treat as actual damages only pending verification."
    },
    "Montana": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Montana permits commercial-landlord self-help only for abandonment (or similarly defined circumstances). The enhanced wrongful-lockout remedy found (Mont. Code Ann. Sec. 70-24-411 -- 3 months' rent or 3x actual damages, whichever greater) is part of the Montana Residential Landlord and Tenant Act and its extension to commercial tenancies outside the abandonment exception is not confirmed."
    },
    "Nebraska": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Nebraska's enhanced wrongful-lockout remedy (3 months' periodic rent as liquidated damages, plus attorney's fees) is part of the Nebraska Uniform Residential Landlord and Tenant Act and does not extend to commercial tenancies. No confirmed commercial-specific statutory enhancement found."
    },
    "Nevada": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "Varies",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Nevada's enhanced wrongful-lockout remedy (NRS 118A.390 -- actual damages plus up to $2,500 in statutory damages) is confined to Nevada's residential Landlord and Tenant Act (NRS Ch. 118A, 'Dwellings') and does not extend to commercial tenancies. No case law confirms whether commercial self-help is available or prohibited in Nevada; no commercial-specific enhancement found."
    },
    "New Hampshire": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "per-day",
      "wrongfulLockoutRemedyValue": 1000,
      "wrongfulLockoutCitation": "N.H. Rev. Stat. Ann. Sec. 540-A:4 -- actual damages plus a $1,000 statutory penalty per violation, with each day a violation continues treated as a separate violation (and a $3,000 statutory minimum if the landlord has already re-let the premises to a new tenant), plus attorney's fees. RSA 540/540-A's eviction and anti-self-help framework is confirmed to apply to both residential AND non-residential (commercial) properties."
    },
    "New Jersey": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "multiplier",
      "wrongfulLockoutRemedyValue": 3,
      "wrongfulLockoutCitation": "N.J. Forcible Entry & Detainer framework -- treble damages / civil penalty up to 3x monthly rent plus proximately caused damages and attorney's fees."
    },
    "New Mexico": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Uncertain",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help is prohibited entirely for New Mexico commercial landlords (N.M. Stat. Sec. 47-8-36), with remedies confirmed to reach both residential and commercial tenants. Secondary sources describe a hybrid remedy (prorated daily rent, actual damages, and 2x monthly rent) that does not cleanly fit a single multiplier/per-day/floor mechanism -- not modeled as an automatic enhancement here to avoid overstating or understating the real formula; verify N.M. Stat. Sec. 47-8-36/37 directly before relying on a specific figure."
    },
    "New York": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "multiplier",
      "wrongfulLockoutRemedyValue": 3,
      "wrongfulLockoutCitation": "N.Y. RPAPL Sec. 853 -- treble damages for eviction 'by force or unlawful means,' which does not require physical force."
    },
    "North Carolina": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "N.C. Gen. Stat. Sec. 42-25.9(a) entitles a wrongfully-locked-out tenant to actual damages (emergency lodging, relocation costs, property damage) -- not a fixed multiplier. Separately, egregious self-help conduct may support a Chapter 75 Unfair and Deceptive Trade Practices claim (treble damages plus attorney's fees, see Stanley v. Moore) as a distinct cause of action beyond the wrongful-lockout claim itself -- flag for counsel review in an egregious-conduct fact pattern, but not modeled as an automatic enhancement here."
    },
    "North Dakota": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "North Dakota's enhanced wrongful-lockout remedy (N.D. Cent. Code Sec. 32-03-29 -- treble damages) is described in residential-tenancy sources, and North Dakota permits commercial-landlord self-help only for abandonment (or similarly defined circumstances); the statute's extension to a wrongful commercial lockout outside that exception is not confirmed."
    },
    "Ohio": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Ohio's residential anti-self-help statute (Ohio Rev. Code Sec. 5321.15) does NOT apply to commercial tenants (Ohio Rev. Code Ch. 1923 also excludes commercial tenants from its residential eviction provisions). Commercial self-help remains available at common law if the lease authorizes reentry and no breach of the peace occurs, but a landlord who breaches the peace risks substantial common-law constructive-eviction damages -- no statutory multiplier applies to commercial tenancies."
    },
    "Oklahoma": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help is prohibited entirely for Oklahoma commercial landlords (judicial process required). The 2x-monthly-rent-or-actual-damages figure found (41 O.S. Sec. 123) traces to Oklahoma's residential landlord-tenant provisions (Title 41); its extension to commercial tenancies is not confirmed. No confirmed commercial-specific statutory enhancement found."
    },
    "Oregon": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Oregon's Forcible Entry and Detainer statutes (ORS 105.105-105.168) require judicial process and are not expressly limited to residential dwellings, but no confirmed statutory damages multiplier for a wrongful commercial lockout was found, and no case law addresses commercial-landlord self-help directly. Treat as actual damages only pending verification."
    },
    "Pennsylvania": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Pennsylvania's Landlord and Tenant Act requires judicial process for eviction; self-help lockouts (changing locks, removing doors, shutting off utilities) are prohibited statewide, including for commercial tenancies. No confirmed statewide statutory damages multiplier -- tenant's remedy is actual damages plus attorney's fees and costs. Note local variation exists (e.g., Philadelphia's ordinance, Phila. Code Sec. 9-1603, allows punitive damages up to $2,000 per unlawful self-help eviction attempt within the city -- not modeled here since it is a municipal, not statewide, enhancement)."
    },
    "Rhode Island": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Rhode Island's anti-self-help prohibition (R.I. Gen. Laws Sec. Sec. 34-18-34, 34-18-44) is confirmed to apply to BOTH residential and commercial landlords, with recovery of 3 months' rent or actual damages. This is a REPLACEMENT floor on total recovery (not additive), so it is not modeled as an automatic enhancement here to avoid overstating damages; use 3 months' rent as a floor reference only if actual damages are confirmed to be lower."
    },
    "South Carolina": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "South Carolina's enhanced wrongful-lockout remedy (S.C. Code Sec. 27-40-660 -- 3 months' rent or 2x actual damages, whichever greater, plus attorney's fees) is part of the South Carolina Residential Landlord and Tenant Act and does not extend to commercial tenancies. No confirmed commercial-specific statutory enhancement found."
    },
    "South Dakota": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "South Dakota's enhanced wrongful-lockout remedy (S.D. Codified Laws Sec. 43-32-6 -- 2 months' free rent plus return of advance rent/deposit) is a REPLACEMENT-style remedy (not additive to actual damages) and its extension to commercial tenancies is not confirmed -- not modeled as an automatic enhancement here; treat as actual damages only pending verification."
    },
    "Tennessee": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Tennessee's wrongful-lockout remedy (Tenn. Code Ann. Sec. 66-28-504 -- actual damages, punitive damages where appropriate, and attorney's fees) is part of the Uniform Residential Landlord and Tenant Act (applicable only in adopting counties) and does not extend to commercial tenancies. Notably even the residential remedy carries no fixed statutory multiplier -- it is actual-damages-based, consistent with the conservative default used here."
    },
    "Texas": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "floor",
      "wrongfulLockoutRemedyValue": 500,
      "wrongfulLockoutCitation": "Tex. Prop. Code Sec. 93.002/93.003 -- actual damages + greater of one month's rent or $500, plus reasonable attorney's fees and costs."
    },
    "Utah": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Utah commercial evictions follow the Unlawful Detainer framework (Utah Code Title 78B, Ch. 6, Pt. 8, including Sec. 78B-6-814's tenant remedies for illegal lockouts), but no confirmed statutory damages multiplier was found for a wrongful commercial lockout, and no case law confirms whether commercial self-help is otherwise available in Utah. Treat as actual damages only pending verification."
    },
    "Vermont": {
      "classification": "Neutral",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "Varies",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Vermont's anti-self-help prohibition applies broadly (no landlord may deny a tenant access except through judicial process), but no confirmed statutory damages multiplier was found, and no case law addresses whether commercial-landlord self-help is available in Vermont. Tenant remedies are injunctive relief, damages, costs, and attorney's fees -- actual damages only, no confirmed enhancement."
    },
    "Virginia": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Virginia permits commercial-landlord self-help where the lease authorizes reentry and it is exercised properly. A wrongful or improper lockout (no basis for eviction, lease violation, or a tenant with a valid defense) exposes the landlord to common-law damages for property loss/damage and business interruption -- no statutory multiplier applies to commercial tenancies in Virginia."
    },
    "Washington": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Washington's enhanced wrongful-lockout remedies ($100/day under RCW 59.18.290; greater of economic/noneconomic damages or 3x monthly rent under RCW 59.18.650(4)) are part of the Residential Landlord-Tenant Act (RCW 59.18) and do not extend to commercial tenancies. Self-help is understood to be unavailable to Washington commercial landlords as well, but no commercial-specific statutory enhancement was confirmed."
    },
    "West Virginia": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "West Virginia permits commercial-landlord self-help only for abandonment (or similarly defined circumstances). No confirmed commercial-specific statutory damages multiplier was found for a wrongful lockout outside that exception; treat as actual damages plus attorney's fees."
    },
    "Wisconsin": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "See chapter",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Self-help re-entry is generally available to Wisconsin COMMERCIAL landlords at common law (peaceable, lease-authorized) -- Wisconsin's 2x-damages consumer-protection remedy (Wis. Stat. Sec. 100.20(5); Wis. Admin. Code ATCP 134) is part of the state's residential rental-practices framework and does not extend to commercial tenancies. No confirmed commercial-specific statutory enhancement found."
    },
    "Wyoming": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine (cap applies)",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated",
      "wrongfulLockoutRemedyType": "actual-only",
      "wrongfulLockoutRemedyValue": null,
      "wrongfulLockoutCitation": "Wyoming prohibits self-help eviction but, unlike many states, has no statutory damages multiplier (no double/treble damages) for a wrongful lockout at all -- confirmed actual damages plus costs and attorney's fees only. This is a genuine 'no enhancement exists' finding, not an unresearched gap."
    }
  },

  /* Deficiency-judgment availability by state and foreclosure method,
     lending-foreclosure category. This is the gap explicitly flagged in
     the original design doc ("needs a state-law modifier, not yet
     built"). Now a full 51-jurisdiction table (50 states + DC), each
     individually verified against primary statute text (not just
     secondary-source blog summaries, which turned out to disagree with
     each other on categorical claims like "no non-judicial state allows
     deficiency" -- false; TX and GA both do, with real conditions
     attached). Five states share the exact CA-style trade-speed-for-
     deficiency-rights structure once fully researched: CA, MN, OR, MT,
     AK all bar deficiency outright after their dominant non-judicial
     method, preserving it only via judicial foreclosure. Five states
     (AR, NV, OK, UT, ID) cap the deficiency at the LESSER of a fair-value
     or sale-price offset (debtor-favorable direction) rather than the
     more common GREATER-of rule most fair-value states use. Louisiana's
     real fork doesn't map onto the judicial/non-judicial axis this tool
     asks about at all -- it turns on whether the lender elected
     executory process WITH or WITHOUT court-ordered appraisal -- so it's
     flagged in its note rather than mechanized like the others. Fields:
       nonJudicialDominant -- true if a non-judicial (power-of-sale /
         trustee-sale / public-trustee) method is the common/fast route
         for CRE loans in this state (vs. judicial-only).
       deficiencyBarredIfNonJudicial -- true if choosing the non-judicial
         route waives deficiency rights entirely (the CA/MN pattern: trade
         speed for a total, permanent deficiency bar).
       deficiencyConditionalIfNonJudicial -- true if deficiency survives a
         non-judicial sale ONLY if the lender completes a further required
         step (the GA pattern: timely court confirmation of the sale).
       deficiencyBarredForBorrowerButGuarantorAvailable -- true if the
         borrower/grantor entity itself is shielded after a non-judicial
         sale, but a personal guarantor remains reachable if properly
         noticed (the WA pattern -- cross-reference the separate
         guaranty_enforcement claim when this is true).
       fairValueOffsetApplies -- true if the deficiency must (or may) be
         calculated using the GREATER of the foreclosure sale price or a
         court-determined fair market value, rather than the raw sale
         price -- shrinks the deficiency when the lender's credit bid was
         a lowball.
       procedureTrap -- a short note on any hard filing deadline that, if
         missed, fully and permanently bars the deficiency regardless of
         the actual shortfall (informational only -- the calculator can't
         know whether counsel actually met the deadline).
       citation / note -- as elsewhere in this file. */
  "foreclosureStateModifiers": {
    "California": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": true,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "Cal. Code Civ. Proc. §§ 580a, 580d, 726",
      "note": "California's 'one-action rule' (CCP § 726) forces a choice: the fast, dominant non-judicial trustee-sale route under a deed of trust PERMANENTLY forfeits any deficiency judgment (CCP § 580d) -- no exceptions for commercial loans. Electing judicial foreclosure instead preserves deficiency rights but sacrifices speed and is subject to a fair-value offset (CCP § 580a): deficiency = debt minus the GREATER of sale price or court-determined fair value."
    },
    "Texas": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency suit generally must be filed within 2 years of the foreclosure sale.",
      "citation": "Tex. Prop. Code §§ 51.003–51.005",
      "note": "Unlike California, Texas's dominant non-judicial power-of-sale method does NOT waive deficiency rights. Either party may request the court determine the property's fair market value; the sale price is presumed to equal fair market value unless rebutted by competent evidence, in which case the higher fair-value figure controls the deficiency calculation."
    },
    "New York": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Lender MUST move for a deficiency judgment within 90 days of the referee's deed being recorded (RPAPL § 1371) -- missing this deadline is a full, permanent bar regardless of the actual shortfall.",
      "citation": "N.Y. RPAPL § 1371",
      "note": "New York has no non-judicial power-of-sale for real-property mortgages -- foreclosure is judicial only. Deficiency = debt minus the GREATER of sale price or court-determined fair market value as of the sale date."
    },
    "Florida": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "Fla. Stat. § 702.06",
      "note": "Florida foreclosure is judicial only. Deficiency is generally available and courts may consider fair market value in setting the amount. The statute's 1-year limitations period and dollar cap apply only to owner-occupied 1-4 unit residential property -- neither applies to commercial loans."
    },
    "Georgia": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": true,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Lender must petition for court confirmation of the sale within 30 days of the sale, and the court must find the sale price represented the property's true market value -- failing to timely confirm bars ANY deficiency judgment entirely, regardless of the actual shortfall.",
      "citation": "O.C.G.A. § 44-14-161",
      "note": "Georgia's dominant non-judicial power-of-sale method requires this extra confirmation step to preserve deficiency rights -- a well-documented trap that generates real dismissed-deficiency-claim litigation when lenders miss it."
    },
    "Arizona": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency action must be filed within 90 days of the trustee's sale or the debt is deemed satisfied in full.",
      "citation": "A.R.S. § 33-814",
      "note": "Arizona's anti-deficiency exemption (barring deficiency after a trustee's sale) applies only to 2.5 acres or less used as a single- or two-family dwelling -- CRE property generally falls outside that exemption, so deficiency is available with a fair-value offset (deficiency = debt minus the greater of sale price or court-determined fair market value)."
    },
    "Washington": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": true,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Any deficiency action (including against a guarantor) must be filed within 1 year of the trustee's sale.",
      "citation": "RCW 61.24.100, .042",
      "note": "A deficiency claim against the borrower/grantor entity itself is generally BARRED after Washington's dominant non-judicial trustee-sale route (narrow exception: waste, or wrongful retention of rents/insurance/condemnation proceeds, on a commercial loan). A claim against a personal GUARANTOR remains available if the guarantor received the required pre-sale notice (RCW 61.24.042) -- deficiency there = debt minus the greater of sale price or fair value. Because most CRE loans of size carry a personal guaranty, lenders routinely preserve real recovery through the guarantor route even though the borrower entity is shielded -- cross-reference this state's fact pattern against the separate Guaranty Enforcement claim."
    },
    "Minnesota": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": true,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "Minn. Stat. § 582.30",
      "note": "Minnesota bars deficiency outright following its dominant, fast 'foreclosure by advertisement' method -- regardless of property type, and regardless of whether the standard 6-month or a shortened 5-week redemption period applies. A lender that wants to preserve deficiency rights must instead use the slower judicial 'foreclosure by action' (Minn. Stat. ch. 581) -- the same trade-speed-for-deficiency-rights choice seen in California, just triggered by a different mechanism."
    },
    "New Jersey": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "N.J.S.A. § 2A:50-3",
      "note": "New Jersey foreclosure is judicial only. Either the lender or the borrower may demand a fair-market-value hearing (or agree instead to a 3-appraiser panel); the greater of sale price or determined fair value is credited against the debt. This general fair-value mechanism applies to commercial mortgages -- it is separate from, and not limited by, the residential-only Fair Foreclosure Act."
    },
    "Pennsylvania": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Lender must petition to fix fair market value within 6 months of the sheriff's deed being recorded -- missing the deadline creates a conclusive presumption the judgment debt is fully satisfied, permanently barring any deficiency regardless of the actual shortfall.",
      "citation": "42 Pa. Cons. Stat. § 8103",
      "note": "Pennsylvania foreclosure is judicial only (sheriff's sale). The 6-month fair-market-value petition deadline is an unusually hard trap for lenders -- inaction, not a losing argument, is what forfeits the deficiency here."
    },
    "Nevada": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Lender must apply for the deficiency judgment within 6 months of the sale.",
      "citation": "Nev. Rev. Stat. §§ 40.455, 40.459",
      "note": "The court holds a mandatory fair-market-value hearing and the judgment is capped at the LESSER of (debt minus sale price) or (debt minus court-determined fair value) -- i.e., the debtor gets the benefit of whichever of the two produces the smaller deficiency."
    },
    "Colorado": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency is not entered at the foreclosure sale itself -- a separate action is required, generally within Colorado's 6-year contract limitations period.",
      "citation": "Colo. Rev. Stat. § 38-38-106",
      "note": "Colorado's Public Trustee non-judicial process requires the trustee/lender to bid at least a good-faith estimate of fair market value; an intentional lowball credit bid can be raised as a defense to reduce or defeat a later deficiency action."
    },
    "North Carolina": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "N.C. Gen. Stat. § 45-21.36",
      "note": "North Carolina's non-judicial power-of-sale process still requires a hearing before the Clerk of Superior Court. In a later deficiency action, the mortgagor -- or a guarantor, per NC Supreme Court authority -- may defend by showing the property's true value equaled or exceeded the debt, or that the winning bid was substantially below true value, offsetting or defeating the deficiency accordingly."
    },
    "Illinois": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "735 ILCS 5/15-1508",
      "note": "Illinois foreclosure is judicial only. Unusually lender-favorable on this specific point compared to the other judicial-only states above: once the court confirms the sale, it has NO discretion to deny a deficiency judgment that was properly requested in the complaint and proven at confirmation -- there is no general fair-market-value offset defense comparable to NY/NJ/PA/CO/NC."
    },
    "Ohio": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "Ohio Rev. Code §§ 2329.17, 2329.20",
      "note": "Ohio foreclosure is judicial only (sheriff's sale). No direct fair-market-value credit against the debt like NY/NJ/PA, but an indirect floor: property cannot legally be sold for less than two-thirds of its court-appraised value, which caps how low a credit bid -- and therefore how large a deficiency -- can go."
    },
    "Michigan": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "MCL 600.3280",
      "note": "Michigan's dominant non-judicial 'foreclosure by advertisement' does NOT waive deficiency rights. Where the mortgagee itself becomes the purchaser at the sale (common in practice), the borrower may defend a deficiency action by showing the property was fairly worth the debt, or that the winning bid was substantially below true value -- reducing or defeating the deficiency."
    },
    "Wisconsin": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "Wis. Stat. § 846.16",
      "note": "Wisconsin foreclosure is judicial only -- non-judicial power of sale is unenforceable under Wisconsin law. Unusually protective: the court will NOT presume the sale price equals fair value, and may not confirm the sale or enter a deficiency judgment until affirmatively satisfied fair value has been credited against the debt. Lenders have a real incentive to waive the deficiency instead -- doing so shortens the pre-sale redemption period from one year to as little as two months."
    },
    "Indiana": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "If the borrower raises the fair-value defense, the lender must file a motion within 3 months of the sale asking the court to determine fair market value.",
      "citation": "Ind. Code §§ 32-29-7, 32-30-10",
      "note": "Indiana foreclosure is judicial only. If fair market value exceeds the sale price and the borrower raises the defense, the deficiency is calculated from fair market value instead of the actual sale price."
    },
    "Missouri": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "Mo. Rev. Stat. §§ 443.290–443.440",
      "note": "Missouri's dominant non-judicial deed-of-trust foreclosure does not waive deficiency rights, but the deficiency judgment isn't part of that process -- the lender must bring a separate breach-of-contract action. Notably lender-favorable on valuation: Missouri has no fair-market-value offset -- the deficiency is the loan balance minus the actual sale price, even where the sale price is well below the property's real market value."
    },
    "South Carolina": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "The lender must reserve its right to a deficiency in the foreclosure complaint -- waiving it there (or afterward) forfeits the claim entirely.",
      "citation": "S.C. Code §§ 29-3-630–29-3-790 (fair-value panel: § 29-3-710)",
      "note": "South Carolina's power-of-sale foreclosure runs through the Master-in-Equity court, which considers whether the sale price matched fair market value; the borrower has appraisal rights, and the greater of sale price or a three-appraiser panel's fair value figure controls the deficiency."
    },
    "Virginia": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "Va. Code §§ 55.1-320, 8.01-241",
      "note": "Virginia has no anti-deficiency statute and no confirmed fair-market-value offset requirement for trustee-sale deficiencies -- among the more lender-favorable states in this table on valuation, though gross price inadequacy combined with other irregularities can still be challenged in equity."
    },
    "Massachusetts": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": "Lender must mail a 'Notice of Intent to Foreclose and of Deficiency' at least 21 days before the sale, file an executed affidavit of mailing within 30 days after, and bring the deficiency action within 2 years of the sale -- missing the pre-sale notice is a common, avoidable way to forfeit the claim.",
      "citation": "Mass. Gen. Laws c. 244, § 17A",
      "note": "Massachusetts's dominant non-judicial power-of-sale foreclosure does not waive deficiency rights, but recovery requires a separate Superior Court action and strict compliance with the notice sequence above -- no confirmed fair-value offset statute was found."
    },
    "Maryland": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "Md. Rule 14-216(b)",
      "note": "Maryland's power-of-sale foreclosure requires court ratification; deficiency then goes through a post-sale audit-and-exceptions process where the borrower has an opportunity to challenge the sale price before the auditor's report is ratified -- functioning as Maryland's fair-value-adjacent check, distinct from a separate FMV hearing. Motion for deficiency must be filed within an unusually generous 3 years of ratification."
    },
    "Connecticut": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "In a strict foreclosure, the lender must seek a deficiency judgment within 30 days after the redemption period expires -- missing it permanently forfeits the claim regardless of the actual shortfall.",
      "citation": "Conn. Gen. Stat. §§ 49-14, 49-28",
      "note": "Connecticut is judicial-only and distinctively uses 'strict foreclosure' as its default (title vests directly in the lender by court decree at a judicially-determined value -- no sale at all) alongside foreclosure by sale. In a strict foreclosure the deficiency is capped at debt minus the court-determined fair value; in a foreclosure by sale, if the property sells below its appraised value the lender must credit the borrower with HALF that shortfall -- a more lender-favorable formula than a full fair-value credit."
    },
    "Tennessee": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency action must be brought within 2 years of the trustee's or foreclosure sale.",
      "citation": "Tenn. Code Ann. § 35-5-118",
      "note": "Tennessee's dominant non-judicial power-of-sale foreclosure does not waive deficiency rights. The sale price is rebuttably presumed to equal fair market value; the borrower can overcome that presumption with evidence the property sold for materially less, shifting the deficiency calculation to the court-determined fair value."
    },
    "Oregon": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": true,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "ORS § 86.797 (formerly ORS 86.770)",
      "note": "Oregon bars deficiency judgments after its dominant non-judicial trust-deed foreclosure for BOTH residential and commercial trust deeds -- unlike most bar states, the bar is not limited to residential. A commercial lender that wants to preserve deficiency rights must foreclose the trust deed judicially instead, the same trade-speed-for-deficiency-rights choice seen in California, Minnesota, Montana, and Alaska."
    },
    "Kentucky": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "KRS ch. 426 (§ 426.005 et seq.)",
      "note": "Kentucky foreclosure is judicial only. The court holds a hearing at which the borrower may contest the deficiency amount, present its own appraisal, and argue for a fair-value figure below the lender's credit bid."
    },
    "Louisiana": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "La. Code Civ. Proc. arts. 2331 et seq. (executory process)",
      "note": "IMPORTANT SCOPE NOTE: Louisiana's real fork does not map onto this tool's judicial/non-judicial question at all. Louisiana uses a distinctive expedited judicial procedure called 'executory process' for authentic-act mortgages (reaching sale in as little as 75-120 days), and the deficiency right turns entirely on whether the lender elected sale WITH court-ordered appraisal (two-thirds-of-appraised-value minimum bid, deficiency rights preserved) or WITHOUT appraisal (faster, no minimum bid, but deficiency rights are WAIVED entirely). Treat any deficiency figure for a Louisiana matter as provisional until you confirm which election the lender actually made."
    },
    "Alabama": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "Case law: Mt. Carmel Estates, Inc. v. Regions Bank, 853 So. 2d 160 (Ala. 2002); Collins v. W. Ala. Bank & Trust (Ala. 2025)",
      "note": "No statutory fair-value offset, but Alabama courts impose a common-law duty of fairness and good faith on the lender's credit bid. Per the Alabama Supreme Court's 2025 Collins decision, a sale at 10% or less of fair market value is enough on its own to undo the sale; a sale at 30% or less is valid unless there is other evidence of unfairness, misconduct, fraud, or mismanagement."
    },
    "Arkansas": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency suit must be filed within 12 months of the foreclosure sale.",
      "citation": "Ark. Code Ann. § 18-50-112",
      "note": "The deficiency judgment is capped at the LESSER of (debt minus fair market value) or (debt minus sale price) -- a debtor-favorable rule, since the court always applies whichever offset produces the smaller deficiency."
    },
    "Mississippi": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency suit must be filed within 1 year of the sale.",
      "citation": "Miss. Code Ann. § 15-1-23; case law requiring a bid of roughly 51%+ of fair value",
      "note": "No hard statutory fair-value credit, but Mississippi Supreme Court decisions require the winning bid to be a reasonable fraction (roughly 51% or more) of the property's fair value to support a deficiency judgment -- a case-law-based fair-value-adjacent standard."
    },
    "Oklahoma": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency must be requested with the motion to confirm the sale, or within 90 days after (judicial); within 90 days after a non-judicial sale.",
      "citation": "12 Okla. Stat. § 686",
      "note": "The deficiency judgment is capped at the LESSER of (debt minus fair market value) or (debt minus sale price) -- the same debtor-favorable rule as Arkansas. A homestead written-election opt-out exists but is not relevant to CRE."
    },
    "Kansas": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "K.S.A. §§ 60-2414, 60-2415",
      "note": "Kansas foreclosure is judicial only. The court can refuse to confirm a sale with a substantially inadequate bid (or set an upset price that must be met), and where it does confirm, it may award a deficiency based on the property's fair market value rather than the raw sale price."
    },
    "West Virginia": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "W. Va. Code § 38-1-7(b)",
      "note": "Unusually explicit and lender-favorable: a 2015 amendment overturned a 2014 state supreme court decision (Sostaric v. Marshall) that had allowed a fair-value offset defense -- West Virginia law now expressly PROHIBITS a borrower from raising the property's fair market value as a defense to a deficiency judgment. Sale price alone controls."
    },
    "Iowa": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "Iowa Code ch. 654 (§ 654.26)",
      "note": "Iowa foreclosure is judicial only. Iowa's notable deficiency bar (tied to an accelerated 'foreclosure without redemption' election) is limited to owner-occupied one- or two-family residential property -- it does not reach CRE. No general fair-market-value offset statute was found for commercial deficiencies."
    },
    "New Mexico": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": "Deficiency suit must be filed within 6 years of the sale.",
      "citation": "N.M. Deed of Trust Act, NMSA 1978 § 48-10-17",
      "note": "Distinctively CRE-relevant: New Mexico's non-judicial Deed of Trust Act route is available ONLY for commercial/business property valued over $500,000 -- smaller commercial and all residential loans must foreclose judicially. No confirmed fair-market-value offset statute for the deficiency calculation itself."
    },
    "Maine": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency action must be commenced within 2 years of the sale.",
      "citation": "14 Me. Rev. Stat. § 6203-E",
      "note": "Maine's fair-value limitation (added 2015) applies specifically when the mortgagee itself is the successful bidder at the sale (a common scenario) -- the deficiency is capped at debt minus an independently appraised fair market value rather than the lender's own credit bid."
    },
    "Rhode Island": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "R.I. Gen. Laws §§ 34-27-1 et seq., 34-25.2-1 et seq. (see § 34-27-2 specifically)",
      "note": "RESOLVED (previously flagged unresolved -- now confirmed by reading Chapter 34-27's section index and § 34-27-2 directly): the chapter has no deficiency-judgment section at all, and its only 'fairly and in good faith' bidding language in § 34-27-2 is boilerplate removing the old common-law bar on a mortgagee bidding at its own sale -- it does not impose a fair-market-value duty or credit. Rhode Island's dominant non-judicial power-of-sale foreclosure does not waive deficiency rights (pursued as an ordinary action on the note, not part of Chapter 34-27 itself), but no fair-value-offset mechanism was found -- confirmed absent, like Wyoming, not merely unresearched."
    },
    "Utah": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency suit must be filed within 3 months of the sale.",
      "citation": "Utah Code § 57-1-32",
      "note": "The deficiency judgment is capped at the LESSER of (debt minus fair market value) or (debt minus sale price) -- the same debtor-favorable rule as Arkansas, Oklahoma, and Idaho."
    },
    "Montana": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": true,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "Mont. Code Ann. § 71-1-317 (Small Tract Financing Act)",
      "note": "Montana's Small Tract Financing Act -- which covers trust indentures on property up to 40 acres, reaching most CRE parcels by land area even where improvement value is large -- bars ANY deficiency judgment following non-judicial foreclosure by advertisement. Judicial foreclosure preserves deficiency rights (except for owner-occupied single-family residential, not CRE-relevant), the same trade-off pattern as California, Minnesota, Oregon, and Alaska."
    },
    "North Dakota": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "N.D. Cent. Code § 32-19-06",
      "note": "North Dakota foreclosure is judicial only. A jury determines the property's fair value (the sale price is not presumed to reflect it), and the deficiency judgment cannot exceed debt minus that fair-value figure. The state's residential deficiency bar (owner-occupied, 4-or-fewer units, up to 40 acres) does not reach CRE."
    },
    "Idaho": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency suit must be filed within 3 months of the sale.",
      "citation": "Idaho Code § 45-1512",
      "note": "The deficiency judgment is capped at the LESSER of (debt minus fair market value) or (debt minus sale price) -- the same debtor-favorable rule as Arkansas, Oklahoma, and Utah. The winning bid is explicitly not conclusive proof of fair market value."
    },
    "Hawaii": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "Haw. Rev. Stat. §§ 667-1.5, 667-22 to 667-27, 667-38",
      "note": "Hawaii permits both judicial and non-judicial foreclosure; deficiency is calculated against fair market value rather than the raw sale price. Non-judicial foreclosure carries owner-occupied-residential-specific restrictions that don't reach CRE."
    },
    "Delaware": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "10 Del. C. § 5067 et seq. (scire facias sur mortgage)",
      "note": "Delaware uses a distinctive judicial-only 'scire facias sur mortgage' action at law rather than a conventional equitable foreclosure suit. Deficiency is available if the lender sues on the note (either in the same action or a separate one); no confirmed fair-market-value offset statute was found."
    },
    "Nebraska": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Deficiency action must be brought within 3 months of the trustee's sale.",
      "citation": "Neb. Rev. Stat. § 76-1013",
      "note": "Deficiency is capped at debt minus the GREATER of sale price or court-determined fair market value. This statute applies specifically to non-judicial trustee sales -- a judicial foreclosure of a Nebraska trust deed falls outside this particular fair-value mechanism."
    },
    "Vermont": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": "Failing to timely request a deficiency judgment is deemed a waiver of it.",
      "citation": "Vt. Stat. tit. 12, § 4941",
      "note": "Vermont is judicial-only and defaults to 'strict foreclosure' (title vests directly in the lender, no sale) unless a party requests a judicial sale. Where the lender is the high bidder at a judicial sale, the deficiency is capped at debt minus fair market value."
    },
    "Alaska": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": true,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "Alaska Stat. § 34.20.100",
      "note": "Alaska bars deficiency judgments entirely after its dominant non-judicial trust-deed sale -- no exceptions for commercial loans. A lender that wants deficiency rights must foreclose judicially instead, the same trade-off pattern as California, Minnesota, Oregon, and Montana."
    },
    "New Hampshire": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "N.H. Rev. Stat. Ann. §§ 479:25, 508:6; Murphy v. Fin. Dev. Corp., 126 N.H. 536 (1985)",
      "note": "Deficiency is available after either judicial or non-judicial foreclosure. No hard statutory fair-market-value formula, but Murphy v. Financial Development Corp. places an affirmative duty on the lender to show it made every reasonable effort to obtain a fair and reasonable sale price -- a real, citable case-law standard (confirmed via a second, more targeted research pass -- not the kind of boilerplate 'good faith bidding' language that turned out to be a red herring for Rhode Island's similar-sounding statute)."
    },
    "South Dakota": {
      "nonJudicialDominant": false,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": true,
      "procedureTrap": null,
      "citation": "S.D. Codified Laws § 21-47-16",
      "note": "South Dakota foreclosure is judicial only. If the lender is unwilling to bid the full judgment amount, it must prove the property's fair and reasonable value at trial; the court can only authorize a lower credit bid at that proven fair value, and any further deficiency needs separate court application."
    },
    "Wyoming": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "Wyo. Stat. Ann. §§ 34-4-101 to 34-4-113",
      "note": "Confirmed absence of a fair-value rule (not merely unresearched, the same 'no enhancement exists' finding already on record for Wyoming elsewhere in this file): Wyoming's power-of-sale statutes place no limit on the deficiency amount and no fair-market-value offset requirement -- sale price controls."
    },
    "District of Columbia": {
      "nonJudicialDominant": true,
      "deficiencyBarredIfNonJudicial": false,
      "deficiencyConditionalIfNonJudicial": false,
      "deficiencyBarredForBorrowerButGuarantorAvailable": false,
      "fairValueOffsetApplies": false,
      "procedureTrap": null,
      "citation": "D.C. Code § 42-816",
      "note": "D.C.'s dominant non-judicial deed-of-trust foreclosure does not waive deficiency rights; no confirmed fair-market-value offset statute was found."
    }
  },

  /* Anti-indemnity-statute classification by state, construction-defect
     category. This is the gap explicitly flagged on
     indemnification_contribution_claim ("PRELIMINARY -- outcome heavily
     contract-language-dependent (broad-form vs. comparative-fault
     indemnity clauses, which many states restrict or void by statute)").
     Full 51-jurisdiction table, each individually classified into one of
     four tiers based on what a construction indemnity clause can legally
     require:
       "limited" -- BOTH broad-form (sole negligence of the indemnitee)
         AND intermediate-form (full indemnity for the indemnitee's
         CONCURRENT/partial negligence) indemnity are void. An indemnitor
         can only be held to its own proportionate share of fault --
         matches this claim's existing 0.10x-0.88x formula, which is
         itself based on a real proportionate-fault allocation (the
         Milwaukee parking-structure case).
       "intermediate" -- only sole-negligence (broad-form) indemnity is
         void. A party with even minor CONCURRENT fault can still be
         contractually on the hook for the entire loss -- pushes the
         damages ceiling above the "limited" states' cap.
       "broad" -- no statutory restriction found; broad-form indemnity
         (even for the indemnitee's sole negligence) can be enforced if
         the contract language is unequivocal, though courts strictly
         construe it. A confirmed group of 7 states: Alabama, Maine,
         Nevada, North Dakota, Pennsylvania, Vermont, and Wyoming (plus
         Wisconsin, which has no TRUE anti-indemnity statute at all --
         its § 895.447 reaches only tort-liability-limiting clauses, not
         indemnity agreements specifically -- functionally the same
         "broad" outcome).
       "broad-capped" -- broad/intermediate indemnity is enforceable but
         ONLY subject to a mandatory monetary cap and bid-document
         disclosure requirement (Florida is the one confirmed example).
     The classification for most "intermediate" states rests on a
     textual tell in the statute itself -- language restricted to the
     indemnitee's "sole" negligence leaves concurrent-negligence
     indemnity untouched by construction-law drafting convention. Several
     states initially bucketed this way by a secondary-source survey
     turned out, on reading the actual statute text, to lack that "sole"
     qualifier and belong in "limited" instead (Texas and Delaware both
     caught this way -- their statutes void indemnity for the
     indemnitee's negligence "in whole or in part," not just "sole"
     negligence).
     IMPORTANT SELF-CORRECTION NOTE: a first pass through this table
     wrongly guessed "limited" (with placeholder-style citations that
     happened, by coincidence, to sometimes be real statute numbers for
     the WRONG statute) for 7 states -- Alabama, Maine, Maryland, Nevada,
     North Dakota, Vermont, and Wyoming -- because a secondary source's
     "all remaining states" bucket gave no individual citations to
     verify against. A second, deliberate research pass caught this and
     corrected all 7 against primary sources or a specialty
     anti-indemnity survey before this table was committed -- see each
     state's "note" field for what changed and why. Confidence is noted
     per state; a handful of "intermediate" states still rely on a
     secondary source's language rather than an independently fetched
     primary-statute quote and are marked accordingly. */
  "constructionIndemnityStateModifiers": {
    "Alabama": { "indemnityForm": "broad", "citation": "No general construction anti-indemnity statute confirmed; design professionals separately protected by Ala. Code § 41-9A-3(a)", "confidence": "high", "note": "CORRECTED after initial research wrongly assumed a limited-form default: Alabama is one of a small confirmed group of states (with Maine, Nevada, North Dakota, Pennsylvania, Vermont, Wisconsin, and Wyoming) with NO general statute restricting construction indemnity clauses -- broad-form indemnity (even for the indemnitee's sole negligence) can be enforced if clearly drafted, though courts strictly construe such language. Narrower exception: a SEPARATE Alabama statute (Ala. Code § 41-9A-3(a)) does bar broad- and intermediate-form indemnification specifically against a DESIGN professional -- relevant to design_professional_malpractice, not this general claim." },
    "Alaska": { "indemnityForm": "intermediate", "citation": "Alaska Stat. § 45.45.900", "confidence": "medium", "note": "Voids indemnification for the indemnitee's SOLE negligence in construction and design contracts; intermediate-form (concurrent-negligence) indemnity is not barred by this statute." },
    "Arizona": { "indemnityForm": "intermediate", "citation": "Ariz. Rev. Stat. §§ 34-226 (public), 32-1159 (private)", "confidence": "medium", "note": "Bars sole-negligence indemnity in both public and private construction/design contracts; concurrent-negligence indemnity survives." },
    "Arkansas": { "indemnityForm": "limited", "citation": "Ark. Code Ann. §§ 4-56-104, 22-9-214", "confidence": "high", "note": "Confirmed via the statute's own text: void for indemnifying 'the negligence or fault of the indemnitee' with no 'sole' qualifier -- broader than the standard sole-negligence bar, voiding intermediate-form indemnity too. Applies to contracts entered after July 31, 2007; naming a party as additional insured does not itself violate the statute." },
    "California": { "indemnityForm": "intermediate", "citation": "Cal. Civ. Code §§ 2782, 2782.05, 2783", "confidence": "medium", "note": "Voids indemnification for sole negligence across residential, public-agency, and other construction contracts; concurrent-negligence indemnity generally survives for non-residential commercial construction." },
    "Colorado": { "indemnityForm": "intermediate", "citation": "Colo. Rev. Stat. §§ 13-50.5-102(8), 13-21-111.5", "confidence": "medium", "note": "Eliminates sole-negligence indemnity for public-entity and construction agreements; concurrent-negligence indemnity survives." },
    "Connecticut": { "indemnityForm": "intermediate", "citation": "Conn. Gen. Stat. § 52-572k", "confidence": "medium", "note": "Prohibits sole-negligence indemnification in all construction contracts; concurrent-negligence indemnity survives." },
    "Delaware": { "indemnityForm": "limited", "citation": "6 Del. C. § 2704", "confidence": "high", "note": "Confirmed via the statute's own text: void for damages caused 'partially or solely by the indemnitee's negligence' -- explicitly reaches concurrent (partial) negligence, not just sole negligence, voiding intermediate-form indemnity too." },
    "District of Columbia": { "indemnityForm": "intermediate", "citation": "D.C. Code § 27A-202 (effective April 1, 2023)", "confidence": "high", "note": "Confirmed via the statute's own text: void for liability 'resulting SOLELY from the negligence' of the contractor/owner -- concurrent-negligence indemnity survives. Before this 2023 law, D.C. courts had enforced even broad-form (sole-negligence) indemnity; this was a real, recent tightening." },
    "Florida": { "indemnityForm": "broad-capped", "citation": "Fla. Stat. § 725.06", "confidence": "high", "note": "Confirmed via the statute's own text: indemnification for the indemnitee's own acts 'in whole or in part' IS enforceable, but only with a monetary cap bearing a reasonable commercial relationship to the contract (not less than $1 million per occurrence for a real-property owner indemnitee, unless otherwise agreed), and only if included in the bid/project specifications. Cannot cover the indemnitee's gross negligence or willful/wanton/intentional misconduct." },
    "Georgia": { "indemnityForm": "intermediate", "citation": "Ga. Code Ann. § 13-8-2(b), (c)", "confidence": "medium", "note": "Blocks sole-negligence indemnity for construction contracts (full indemnity for concurrent negligence survives); the design/architectural-contract branch of this statute is separately more restrictive, allowing only partial indemnity there." },
    "Hawaii": { "indemnityForm": "intermediate", "citation": "Haw. Rev. Stat. § 431:10-222", "confidence": "medium", "note": "Prohibits indemnification for the indemnitee's sole negligence in all construction contracts; concurrent-negligence indemnity survives." },
    "Idaho": { "indemnityForm": "intermediate", "citation": "Idaho Code § 29-114", "confidence": "medium", "note": "Allows full indemnity for concurrent negligence in construction contracts -- only sole-negligence (broad-form) indemnity is barred." },
    "Illinois": { "indemnityForm": "limited", "citation": "740 ILCS 35 (Construction Contract Indemnification for Negligence Act)", "confidence": "high", "note": "Confirmed via primary-source analysis: one of the strictest in the country -- voids BOTH broad-form and intermediate-form indemnity, leaving only limited (comparative-fault) indemnity enforceable. Does not apply to construction bonds or insurance contracts." },
    "Indiana": { "indemnityForm": "intermediate", "citation": "Ind. Code §§ 26-2-5-1, -2, -4", "confidence": "medium", "note": "Permits full indemnity for concurrent negligence; excludes highway contracts and contains a separate 'dangerous instrumentality' exception." },
    "Iowa": { "indemnityForm": "intermediate", "citation": "Iowa Code Ann. § 537A.5", "confidence": "medium", "note": "Eliminates sole-negligence indemnity across construction and design contracts; concurrent-negligence indemnity survives." },
    "Kansas": { "indemnityForm": "limited", "citation": "K.S.A. § 16-121", "confidence": "high", "note": "Confirmed via primary-source analysis: void for indemnifying 'the promisee's negligence' with no sole-negligence qualifier -- voids intermediate-form indemnity too. Enacted 2004; exceptions for settlement agreements and separately-negotiated risk-allocation provisions based on generally accepted industry loss experience." },
    "Kentucky": { "indemnityForm": "intermediate", "citation": "Ky. Rev. Stat. Ann. § 371.180", "confidence": "medium", "note": "Voids indemnification provisions requiring assumption of the indemnitee's sole negligence; concurrent-negligence indemnity survives." },
    "Louisiana": { "indemnityForm": "limited", "citation": "La. R.S. § 9:2780.1 (Louisiana Construction Anti-Indemnity Act)", "confidence": "high", "note": "Confirmed via primary-source analysis: prohibits BOTH broad-form and intermediate-form indemnity -- a subcontractor cannot be required to indemnify a GC even for the GC's concurrent negligence. Applies to construction contracts entered on or after January 1, 2011. Distinct from the separate, older Louisiana Oilfield Anti-Indemnity Act (La. R.S. § 9:2780), which is not construction-specific." },
    "Maine": { "indemnityForm": "broad", "citation": "No general construction anti-indemnity statute confirmed", "confidence": "high", "note": "CORRECTED after initial research wrongly assumed a limited-form default: Maine has no statute restricting construction indemnity clauses -- broad-form indemnity can be enforced if clearly drafted, subject to strict judicial construction (same small group as Alabama, Nevada, North Dakota, Pennsylvania, Vermont, Wisconsin, and Wyoming)." },
    "Maryland": { "indemnityForm": "intermediate", "citation": "Md. Code, Cts. & Jud. Proc. § 5-401", "confidence": "high", "note": "CORRECTED after initial research misread the scope: confirmed via the statute's own text that the bar applies only to the SOLE negligence of the promisee/indemnitee -- concurrent-negligence indemnity survives. Does not affect insurance contracts, workers' compensation, or a surety's general indemnity agreement for a bond." },
    "Massachusetts": { "indemnityForm": "intermediate", "citation": "Mass. Gen. Laws ch. 149, § 29C", "confidence": "medium", "note": "Allows full indemnity where the contract requires indemnification for claims 'caused in whole or in part' by negligence -- i.e., concurrent-negligence indemnity is enforceable; only sole-negligence indemnity is void." },
    "Michigan": { "indemnityForm": "intermediate", "citation": "Mich. Comp. Laws § 691.991", "confidence": "medium", "note": "Permits full indemnity for concurrent negligence; treatment differs somewhat between construction and design contracts." },
    "Minnesota": { "indemnityForm": "intermediate", "citation": "Minn. Stat. §§ 337.01, 337.02", "confidence": "medium", "note": "Allows full indemnity where the injury is attributable in part to the indemnitor's own breach or negligent act/omission -- concurrent-negligence indemnity survives." },
    "Mississippi": { "indemnityForm": "limited", "citation": "Miss. Code Ann. § 31-5-41", "confidence": "high", "note": "Confirmed: prohibits indemnification provisions that shift the loss for concurrent negligence, not just sole negligence -- limited-form only." },
    "Missouri": { "indemnityForm": "limited", "citation": "Mo. Rev. Stat. § 434.100", "confidence": "high", "note": "Confirmed: prohibits indemnification provisions that shift the loss for concurrent negligence, not just sole negligence -- limited-form only." },
    "Montana": { "indemnityForm": "limited", "citation": "Mont. Code Ann. § 28-2-2111", "confidence": "high", "note": "Confirmed via the statute's own text: subsection (1) voids indemnity for the OTHER party's negligence, recklessness, or intentional misconduct without a sole-negligence qualifier; subsection (2) permits indemnity ONLY to the extent liability is caused by a third party or by the indemnifying party's own conduct -- a clean limited-form structure, no concurrent-negligence carve-out. Does not apply to a surety's bond indemnity or an insurer's obligations to its insureds." },
    "Nebraska": { "indemnityForm": "intermediate", "citation": "Neb. Rev. Stat. § 25-21,187(1)", "confidence": "medium", "note": "Prohibits sole-negligence indemnity in construction and design contracts; concurrent-negligence indemnity survives." },
    "Nevada": { "indemnityForm": "broad", "citation": "No general construction anti-indemnity statute confirmed", "confidence": "high", "note": "CORRECTED after initial research cited a statute number that does not actually govern this -- Nevada has no statute restricting construction indemnity clauses -- broad-form indemnity can be enforced if clearly drafted, subject to strict judicial construction (same small group as Alabama, Maine, North Dakota, Pennsylvania, Vermont, Wisconsin, and Wyoming)." },
    "New Hampshire": { "indemnityForm": "intermediate", "citation": "N.H. Rev. Stat. §§ 338-A:1, 338-A:2", "confidence": "medium", "note": "Blocks indemnification for sole negligence in construction and design contracts; concurrent-negligence indemnity survives." },
    "New Jersey": { "indemnityForm": "intermediate", "citation": "N.J. Stat. Ann. §§ 2A:40A-1 (construction), 2A:40A-2 (design)", "confidence": "medium", "note": "Permits full indemnity for concurrent negligence where the parties' intent is clearly demonstrated in the contract; only sole-negligence indemnity is void." },
    "New Mexico": { "indemnityForm": "intermediate", "citation": "N.M. Stat. Ann. § 56-7-1", "confidence": "medium", "note": "Voids indemnification for sole negligence, including in additional-insured coverage requirements; concurrent-negligence indemnity survives." },
    "New York": { "indemnityForm": "intermediate", "citation": "N.Y. Gen. Oblig. Law §§ 5-322.1 (construction), 5-324 (design)", "confidence": "high", "note": "Well-established, frequently-litigated New York rule: bars only sole-negligence (broad-form) indemnity -- full indemnity for the indemnitor's concurrent negligence, even where the indemnitee also bears some fault, remains enforceable." },
    "North Carolina": { "indemnityForm": "intermediate", "citation": "N.C. Gen. Stat. § 22B-1", "confidence": "medium", "note": "Blocks indemnification for sole negligence in construction and design contracts; concurrent-negligence indemnity survives." },
    "North Dakota": { "indemnityForm": "broad", "citation": "No general construction anti-indemnity statute confirmed", "confidence": "medium", "note": "CORRECTED after initial research (a secondary source) wrongly placed North Dakota in the limited-form group: two independent sources instead confirm North Dakota has no statute restricting construction indemnity clauses -- a subcontractor can be required to indemnify for the owner/GC's sole negligence, the subcontractor's own negligence, or joint negligence. Confidence held at medium (not high) because the specific statutory text was not independently fetched and one source flagged this as a genuinely contested/discrepant point across surveys." },
    "Ohio": { "indemnityForm": "intermediate", "citation": "Ohio Rev. Code Ann. § 2305.31", "confidence": "medium", "note": "Prohibits sole-negligence indemnity in construction and design contracts; concurrent-negligence indemnity survives." },
    "Oklahoma": { "indemnityForm": "intermediate", "citation": "Okla. Stat. tit. 15, § 221", "confidence": "medium", "note": "Voids indemnification for sole negligence, including in additional-insured coverage requirements; concurrent-negligence indemnity survives." },
    "Oregon": { "indemnityForm": "intermediate", "citation": "Or. Rev. Stat. § 30.140", "confidence": "medium", "note": "Eliminates sole-negligence indemnity; also reaches additional-insured coverage requirements (amended effective Jan. 1, 2025). Concurrent-negligence indemnity survives." },
    "Pennsylvania": { "indemnityForm": "broad", "citation": "Common law (no general construction anti-indemnity statute); 68 Pa. Cons. Stat. § 491 (design contracts only)", "confidence": "high", "note": "Confirmed via primary-source analysis: Pennsylvania has NO statute limiting indemnification in construction contracts specifically -- broad-form indemnity (even for the indemnitee's sole negligence) is enforceable if the contract language is clear and unequivocal (Pennsylvania Supreme Court: indemnification is disfavored and construed narrowly, so vague 'any and all liability' language is insufficient -- explicit language covering the indemnitee's own negligence is required). By contrast, indemnification of a DESIGN professional is completely prohibited by a separate statute (68 Pa. Cons. Stat. § 491) -- the rule differs sharply between construction and design contracts here." },
    "Rhode Island": { "indemnityForm": "intermediate", "citation": "R.I. Gen. Laws § 6-34-1", "confidence": "medium", "note": "Voids indemnification for sole negligence in construction and design contracts; concurrent-negligence indemnity survives." },
    "South Carolina": { "indemnityForm": "intermediate", "citation": "S.C. Code Ann. § 32-2-10", "confidence": "high", "note": "Confirmed via the statute's own text: void only for damages 'proximately caused by or resulting from the SOLE negligence' of the promisee -- a second clause expressly preserves indemnity for the promisor's own negligence 'in whole or in part,' consistent with concurrent-negligence indemnity remaining enforceable." },
    "South Dakota": { "indemnityForm": "intermediate", "citation": "S.D. Codified Laws § 56-3-18", "confidence": "medium", "note": "Allows full indemnity in concurrent-negligence situations; only sole-negligence indemnity is barred." },
    "Tennessee": { "indemnityForm": "intermediate", "citation": "Tenn. Code Ann. § 62-6-123", "confidence": "medium", "note": "Permits full indemnity for concurrent negligence in construction contracts; only sole-negligence indemnity is barred." },
    "Texas": { "indemnityForm": "limited", "citation": "Tex. Ins. Code Ann. §§ 151.101-151.105 (construction); Tex. Civ. Prac. & Rem. Code §§ 130.001 et seq. (design)", "confidence": "high", "note": "Confirmed via the statute's own text: void 'to the extent that it requires an indemnitor to indemnify... against a claim caused by the negligence or fault... of the indemnitee' -- no sole-negligence qualifier, reaching concurrent negligence too. Effective Jan. 1, 2012; applies to commercial (not residential or most public-works) projects; carved out for claims involving bodily injury/death of the indemnitor's own employees or subcontractors." },
    "Utah": { "indemnityForm": "intermediate", "citation": "Utah Code Ann. § 13-8-1(1), (2)", "confidence": "medium", "note": "Eliminates indemnification for the indemnitee's sole negligence; distinguishes personal indemnity from insurance-procurement requirements. Concurrent-negligence indemnity survives." },
    "Vermont": { "indemnityForm": "broad", "citation": "No general construction anti-indemnity statute confirmed", "confidence": "high", "note": "CORRECTED after initial research wrongly assumed a limited-form default: Vermont has no statute restricting construction indemnity clauses -- broad-form indemnity can be enforced if clearly drafted, subject to strict judicial construction (same small group as Alabama, Maine, Nevada, North Dakota, Pennsylvania, Wisconsin, and Wyoming)." },
    "Virginia": { "indemnityForm": "intermediate", "citation": "Va. Code Ann. § 11-4.1", "confidence": "high", "note": "Confirmed via the statute's own text: void only where liability is 'caused by or resulting SOLELY from the negligence' of the other party -- concurrent-negligence indemnity remains enforceable." },
    "Washington": { "indemnityForm": "limited", "citation": "RCW 4.24.115", "confidence": "high", "note": "Confirmed via the statute's own text: void for the indemnitee's SOLE negligence; a separate clause additionally limits indemnity for CONCURRENT negligence to the indemnitor's own share, and requires that limitation be expressly stated in the contract -- Washington caps indemnity at the indemnitor's own proportionate fault share either way. 2012 amendment extended this to the duty and cost to defend, not just indemnify." },
    "West Virginia": { "indemnityForm": "intermediate", "citation": "W. Va. Code § 55-8-14", "confidence": "medium", "note": "Allows full indemnity for concurrent negligence in construction contracts; only sole-negligence indemnity is barred." },
    "Wisconsin": { "indemnityForm": "broad", "citation": "Wis. Stat. § 895.447 (does not reach indemnity agreements)", "confidence": "high", "note": "Confirmed via primary-source analysis: Wisconsin has NO true anti-indemnity statute. § 895.447 voids clauses limiting or eliminating TORT liability, but Wisconsin courts have held it does not reach indemnification agreements and must be construed narrowly to preserve freedom of contract -- broad-form indemnity (including for the indemnitee's sole negligence) may be enforceable in a contract-based construction dispute if clearly drafted." },
    "Wyoming": { "indemnityForm": "broad", "citation": "No general construction anti-indemnity statute confirmed; Wyo. Stat. Ann. § 30-1-131 is oilfield/mining-specific, not construction-general", "confidence": "high", "note": "CORRECTED after initial research mistakenly applied Wyoming's OILFIELD anti-indemnity statute (Wyo. Stat. § 30-1-131, which by its own terms covers only wells for oil, gas, or water, or mines for minerals) to general construction -- that was wrong. Wyoming has no general statute restricting construction indemnity clauses -- broad-form indemnity can be enforced if clearly drafted, subject to strict judicial construction (same small group as Alabama, Maine, Nevada, North Dakota, Pennsylvania, and Vermont)." }
  },

  /* Eminent domain attorney-fee shifting, researched per state (51
     jurisdictions incl. DC). `thresholdPct` is only set where the state's
     rule is a clean percentage-above-the-offer trigger simple enough to
     mechanize into an automatic claim; every other state still gets a
     real citation and note even though it isn't mechanized, the same way
     Wyoming's "no enhancement exists" is a confirmed finding elsewhere in
     this file, not an unresearched gap. `capNote` flags a state that caps
     the fee award itself (dollar cap or fraction-of-excess cap) rather
     than the underlying threshold. Source: 50-state survey cross-checked
     against individual state statute text, Aug 2026. */
  "eminentDomainAttorneyFees": {
    "Alabama": { "thresholdPct": null, "mandatory": false, "citation": "Ala. case law (no general fee-shifting statute)", "note": "Alabama does not award attorney's fees in condemnation actions even when the judgment substantially exceeds the offer. Narrow exception: litigation expenses if the action is wholly or partly dismissed." },
    "Alaska": { "thresholdPct": 10, "mandatory": true, "citation": "Alaska R. Civ. P. 72(k)", "note": "Entitled to fees when the final award is at least 10% greater than the amount deposited by the condemnor, or the condemnor cannot take the property." },
    "Arizona": { "thresholdPct": null, "mandatory": false, "citation": "Ariz. Rev. Stat. § 12-1130(D)", "note": "Court \"may\" award fees to residential property owners in direct condemnation; \"shall\" award if the taking is found unnecessary for public use -- not a clean percentage trigger." },
    "Arkansas": { "thresholdPct": 20, "mandatory": true, "citation": "Ark. Code Ann. § 18-15-103(11)(A)", "note": "Entitled to fees when the final award exceeds the initial offer by at least 20%." },
    "California": { "thresholdPct": null, "mandatory": false, "citation": "Cal. Civ. Proc. Code § 1250.410", "note": "Court may award fees when the condemnee's demand was reasonable and the condemnor's offer was unreasonable -- a reasonableness test, not a percentage threshold." },
    "Colorado": { "thresholdPct": 30, "mandatory": true, "citation": "Colo. Rev. Stat. § 38-1-122", "note": "Available if the award exceeds the agency's offer by at least 30%, or the condemnor abandons or lacks authority." },
    "Connecticut": { "thresholdPct": null, "mandatory": false, "citation": "Conn. Gen. Stat. §§ 48-17a, -17b", "note": "Fees only if the acquiring entity abandons the action or an inverse-condemnation claim succeeds -- not available on a simple valuation win." },
    "Delaware": { "thresholdPct": null, "mandatory": false, "citation": "Del. Code Ann. tit. 10, § 6111(2)", "note": "Owner may apply for fees if the award is closer to the condemnee's demand than the condemnor's offer -- a relative-closeness test, not a clean percentage." },
    "District of Columbia": { "thresholdPct": null, "mandatory": false, "citation": "Not confirmed", "note": "No general fee-shifting statute for direct condemnation was confirmed in this research -- treat as unresearched rather than a confirmed \"no,\" and verify locally before relying on this." },
    "Florida": { "thresholdPct": null, "mandatory": true, "citation": "Fla. Stat. § 73.092(1)", "note": "Court \"shall\" award fees based on a statutory benefit-achieved formula tied to the difference between the judgment and the condemnor's last written offer -- not a simple percentage threshold." },
    "Georgia": { "thresholdPct": null, "mandatory": false, "citation": "Ga. Code Ann. §§ 22-4-8, 22-1-12", "note": "No fees in direct takings generally; available only on abandonment or a successful inverse claim on federal-aid projects." },
    "Hawaii": { "thresholdPct": null, "mandatory": false, "citation": "Haw. Rev. Stat. § 101-27", "note": "Generally not entitled to fees in direct condemnation; available if the action is abandoned or dismissed." },
    "Idaho": { "thresholdPct": 10, "mandatory": false, "citation": "Idaho Code Ann. § 7-711A(8)", "note": "Trial court may award fees if the award exceeds the condemnor's last timely offer by at least 10%." },
    "Illinois": { "thresholdPct": null, "mandatory": false, "citation": "735 Ill. Comp. Stat. § 30/10-5-110", "note": "Entitled only where a private entity controls the property and the award exceeds the condemnee's final written offer; otherwise available only for inverse claims or abandonment." },
    "Indiana": { "thresholdPct": 0, "mandatory": true, "capNote": "Capped at the lesser of $25,000 or the property's fair market value.", "citation": "Ind. Code § 32-24-1-14", "note": "Condemnor responsible for fees whenever the final damages exceed the final settlement offer, capped at the lesser of $25,000 or fair market value." },
    "Iowa": { "thresholdPct": 10, "mandatory": true, "citation": "Iowa Code § 6B.33", "note": "Agency \"shall\" pay fees if the award exceeds the final offer by at least 10%." },
    "Kansas": { "thresholdPct": null, "mandatory": false, "citation": "Kan. Stat. Ann. § 26-509", "note": "Discretionary, and measured against the court-appointed appraisers' award rather than the condemnor's offer." },
    "Kentucky": { "thresholdPct": null, "mandatory": false, "citation": "Ky. Rev. Stat. Ann. § 453.260(6)(c)", "note": "Generally not entitled to fees in direct condemnation." },
    "Louisiana": { "thresholdPct": null, "mandatory": false, "citation": "La. Stat. Ann. §§ 19:8(A)(3), 19:109(A)", "note": "Discretionary if the final compensation exceeds the condemnor's highest offer -- no fixed percentage given." },
    "Maine": { "thresholdPct": null, "mandatory": false, "citation": "Me. Rev. Stat. tit. 23, § 154", "note": "Entitled to fees only when the condemning entity abandons the action." },
    "Maryland": { "thresholdPct": null, "mandatory": false, "citation": "Md. Code Ann., Real Prop. §§ 12-106(b)(5), 107(b), 109(e)", "note": "Not recoverable unless the entity abandons or judgment is entered against its right to condemn." },
    "Massachusetts": { "thresholdPct": null, "mandatory": false, "citation": "Mass. Gen. Laws ch. 79, § 38", "note": "Not recoverable in direct condemnation." },
    "Michigan": { "thresholdPct": 0, "mandatory": true, "capNote": "Fee itself is capped at 1/3 of the amount by which the award exceeds the offer -- so the fee estimate should use that fraction, not a full \"reasonable fees\" figure.", "citation": "Mich. Comp. Laws Ann. § 213.66(3)", "note": "Entitled to reasonable fees whenever the final award exceeds the good-faith offer, capped at 1/3 of the excess." },
    "Minnesota": { "thresholdPct": 20, "mandatory": false, "citation": "Minn. Stat. Ann. § 117.031(a)", "note": "Court \"shall award\" fees if the judgment is 40%+ greater than the agency's last written offer; \"may\" award between 20-40% greater." },
    "Mississippi": { "thresholdPct": null, "mandatory": false, "citation": "Maples v. Miss. Hwy. Comm'n, 617 So.2d 265, 271", "note": "Not entitled -- Mississippi courts have held \"just compensation is for the property and not to the owner,\" so fees are not shifted regardless of outcome." },
    "Missouri": { "thresholdPct": null, "mandatory": false, "citation": "Mo. Rev. Stat. §§ 523.256, .259", "note": "Condemnor responsible for fees only if it fails good-faith negotiation or abandons the action." },
    "Montana": { "thresholdPct": null, "mandatory": false, "citation": "Mont. Code Ann. §§ 70-30-305(2), 306(1)-(2)", "note": "Entitled if the award exceeds the final offer or the owner successfully challenges the taking -- no fixed percentage given." },
    "Nebraska": { "thresholdPct": null, "mandatory": false, "citation": "Neb. Rev. Stat. § 76-720", "note": "Required in specific appeal-outcome scenarios with dual thresholds (roughly 15% or 85% depending on posture) or if the condemnor abandons or a challenge succeeds -- too fact-specific to mechanize as a single percentage." },
    "Nevada": { "thresholdPct": null, "mandatory": false, "citation": "Nev. Rev. Stat. §§ 37.120, 37.180, 37.185", "note": "Not responsible in direct takings; required only for successful inverse claims or abandonment." },
    "New Hampshire": { "thresholdPct": null, "mandatory": false, "citation": "N.H. Rev. Stat. § 498-A:26-b", "note": "Not required in direct cases; responsible only if a challenge to the taking succeeds." },
    "New Jersey": { "thresholdPct": null, "mandatory": false, "citation": "N.J. Stat. § 20:3-26(b)-(c)", "note": "Not entitled in direct condemnation; available for inverse claims, successful challenges, or abandonment." },
    "New Mexico": { "thresholdPct": null, "mandatory": false, "citation": "Primetime Hosp., Inc. v. City of Albuquerque, 142 N.M. 663, 675", "note": "Generally not entitled to fees in direct or inverse condemnation." },
    "New York": { "thresholdPct": null, "mandatory": false, "citation": "N.Y. Em. Dom. Proc. Law § 701", "note": "Discretionary when the award is \"substantially in excess\" of the condemnor's proof -- not a fixed percentage." },
    "North Carolina": { "thresholdPct": null, "mandatory": false, "citation": "N.C. Gen. Stat. § 40A-8(b)", "note": "Responsible for fees only if the condemnor abandons or a court rules it unauthorized to condemn." },
    "North Dakota": { "thresholdPct": null, "mandatory": false, "citation": "N.D. Cent. Code § 32-15-32", "note": "Discretionary by statute, though courts in practice commonly order reasonable costs and fees regardless of a specific threshold." },
    "Ohio": { "thresholdPct": 25, "mandatory": true, "capNote": "Fee itself is capped at 25% of the difference between the award and the offer.", "citation": "Ohio Rev. Code §§ 163.09(G), 163.21(A)(2), 163.21(C)", "note": "Entitled if the jury award exceeds 125% of the condemnor's last written offer (i.e., beats it by 25%+), capped at 25% of the difference; also available if a challenge succeeds or the entity abandons." },
    "Oklahoma": { "thresholdPct": 10, "mandatory": true, "citation": "Okla. Stat. tit. 27, § 11(3)", "note": "Entitled if the jury award exceeds the commissioners' award by at least 10% (measured against the commissioners' award, not the condemnor's initial offer), or the condemnor abandons or is found unable to condemn." },
    "Oregon": { "thresholdPct": 0, "mandatory": false, "citation": "Or. Rev. Stat. §§ 35.300, 35.346(7)", "note": "May recover fees whenever the jury award exceeds the condemnor's highest written offer, by any amount -- discretionary, not automatic." },
    "Pennsylvania": { "thresholdPct": null, "mandatory": false, "capNote": "Flat $4,000 reimbursement, not a percentage-of-excess award.", "citation": "26 Pa. Cons. Stat. §§ 306(g)(1), 308(d), 709, 710", "note": "Entitled to a flat (capped) reimbursement, or full fees only on a successful inverse claim, a successful challenge, or abandonment." },
    "Rhode Island": { "thresholdPct": null, "mandatory": false, "citation": "R.I. Gen. Laws § 45-29-24(c)", "note": "Statute expressly excludes attorney's fees from recoverable costs -- confirmed not available, not an unresearched gap." },
    "South Carolina": { "thresholdPct": null, "mandatory": false, "citation": "S.C. Code Ann. § 28-2-510(B)", "note": "Entitled when the award is at least as close to the condemnee's highest valuation as it is to the condemnor's -- a relative-closeness test, not a clean percentage." },
    "South Dakota": { "thresholdPct": 20, "mandatory": true, "capNote": "Award must also be at least $700.", "citation": "S.D. Codified Laws § 21-35-23", "note": "Entitled when the award is at least 20% higher than the condemnor's offer at commencement, and the award is at least $700." },
    "Tennessee": { "thresholdPct": null, "mandatory": false, "citation": "Tenn. Code Ann. §§ 29-17-912(b), 29-16-123(b)", "note": "Entitled only if the condemnor cannot acquire the property or abandons, or the owner prevails on an inverse claim." },
    "Texas": { "thresholdPct": null, "mandatory": false, "citation": "Tex. Prop. Code Ann. § 21.047", "note": "Owners are generally responsible for their own fees in Texas, even in inverse-condemnation cases -- confirmed no general fee-shifting, not an unresearched gap." },
    "Utah": { "thresholdPct": 0, "mandatory": true, "capNote": "Capped at $50,000; conversely the condemnor can recover its own fees if the award is less than the condemnee's final offer.", "citation": "Utah Code Ann. § 78B-6-509(7)-(8)", "note": "Can recover fees (capped at $50,000) whenever the award exceeds the condemnee's rejected settlement offer." },
    "Vermont": { "thresholdPct": null, "mandatory": false, "citation": "Vt. Stat. Ann. tit. 19, § 505(D)(1)", "note": "Entitled only when the entity lacks authority or abandons the proceeding." },
    "Virginia": { "thresholdPct": null, "mandatory": false, "citation": "Va. Code §§ 25.1-245.1(c)(i), 25.1-249, 25.1-419, 25.1-420", "note": "Not entitled in direct condemnation; available if the entity abandons, lacks authority, or an inverse claim succeeds." },
    "Washington": { "thresholdPct": 10, "mandatory": true, "citation": "Wash. Rev. Code § 8.25.070(1)(b)", "note": "Entitled if the judgment exceeds the condemnor's highest written offer by at least 10%." },
    "West Virginia": { "thresholdPct": null, "mandatory": false, "citation": "Dep't of Transp. v. Newton, 238 W. Va. 615, 622", "note": "Generally not entitled to fees in a traditional condemnation action." },
    "Wisconsin": { "thresholdPct": 15, "mandatory": true, "citation": "Wis. Stat. § 32.28(3)", "note": "Entitled if the award exceeds the highest offer by at least 15%, an inverse claim succeeds, the condemnor lacks the right to condemn, or it abandons." },
    "Wyoming": { "thresholdPct": 15, "mandatory": true, "citation": "Wyo. Stat. Ann. §§ 1-26-509(j), 16-7-116, 16-7-117", "note": "Entitled if the award exceeds the condemnor's final offer by at least 15%, or the condemnor abandons or an inverse claim prevails." }
  },

  /* Business/goodwill-loss compensability: this narrower question was
     researched to confirm California's clear statutory right, and to
     confirm the general majority rule (most states treat business/
     goodwill loss as non-compensable "consequential" damages under the
     unity-of-use doctrine, absent a specific statute). It was NOT
     individually verified state-by-state the way the fee-shifting table
     above was -- a minority of other states may have their own narrower
     goodwill statutes not captured here, so the non-CA note says exactly
     that rather than implying a confirmed "no" for all 49 other states. */
  "eminentDomainBusinessGoodwill": {
    "recognizedStates": ["California"],
    "recognizedNote": "California's Eminent Domain Law allows compensation for loss of business goodwill caused by the taking, if the owner proves the loss could not reasonably have been prevented by relocating the business or other mitigation.",
    "recognizedCitation": "Cal. Code Civ. Proc. § 1263.510",
    "majorityRuleNote": "The majority rule across most states treats business/goodwill loss as a non-compensable consequential loss, separate from the value of the real property itself, absent a specific state statute creating a right to it. A minority of other states may have their own narrower goodwill statutes not individually verified here -- confirm your state's specific rule before relying on this."
  },

  /* Whether a state's zoning enabling law requires a zoning decision
     to actually be CONSISTENT with the municipality's comprehensive
     (master/general) plan -- a real, statute-and-caselaw-verified
     legal test, not a policy preference -- or merely requires the
     plan to be considered/consulted, with the zoning decision itself
     left to legislative discretion regardless of what the plan says.
     This is the single most decisive cross-cutting variable this
     session's own case research kept surfacing for spot_zoning_challenge
     and variance_permit_denial_appeal outcomes: Lewis Point Neighborhood
     Assoc. v. Town of Lenox (NY) turned on the town having no genuine
     comprehensive plan to be consistent with; the PA Commonwealth Court
     spot-zoning case turned on the rezoning being shown consistent with
     an actual adopted plan. "requirement" values: "Mandatory" (zoning
     must conform, enforceable in court), "Conditional" (mandatory only
     once/if a plan is adopted, or only for a narrower category like
     public facilities), "Advisory" (plan is a factor/must be considered,
     but inconsistent zoning is not automatically invalid), "Split/Unclear"
     (courts have reached different conclusions), or null with a note
     for jurisdictions not yet independently researched -- left honestly
     unresearched rather than guessed, consistent with how eminentDomain
     AttorneyFees above handles gaps. First tranche: 36 of 51
     jurisdictions researched against primary statutory text (and, where
     available, the leading case interpreting it); 15 remain for a later
     pass. */
  "zoningComprehensivePlanModifiers": {
    "Alabama": { "requirement": "Advisory", "citation": "Ala. Code § 11-52-72", "note": "A court construed the comprehensive-plan requirement to mean only that zoning must be enacted with the general welfare of the community in mind -- not a binding consistency test. Alabama's zoning enabling approach is generally more deferential to municipal discretion than most states." },
    "Alaska": { "requirement": "Mandatory", "citation": "Alaska Stat. § 29.40.040", "note": "Land use regulations (including zoning) must be adopted in accordance with a comprehensive plan adopted under AS 29.40.030 -- mandatory statutory text; judicial strictness of enforcement not independently confirmed via a leading case." },
    "Arizona": { "requirement": "Conditional", "citation": "Ariz. Rev. Stat. § 9-462.01(F)", "note": "Once a municipality adopts a general plan (state law requires larger municipalities to have one, with voter approval in some cases under the Growing Smarter Act), all zoning and rezoning must be consistent with and conform to it -- a binding, mandatory requirement once triggered." },
    "Arkansas": { "requirement": "Mandatory", "citation": "Ark. Code § 14-17-209", "note": "The determination of zoning districts shall be consistent with any officially adopted plans for the area to be zoned, reinforced by the Arkansas Land Use Planning and Stabilization Act requiring local governments to develop a comprehensive land use plan." },
    "California": { "requirement": "Mandatory", "citation": "Cal. Gov. Code § 65860", "note": "Zoning ordinances shall be consistent with the general plan; a resident or property owner may sue to enforce compliance. One of the strongest, most litigated mandatory-consistency regimes in the country -- amendments to a general plan trigger a duty to conform zoning within 120 days." },
    "Colorado": { "requirement": "Advisory", "citation": "No statutory consistency mandate confirmed; Colorado case law", "note": "Colorado courts have held adopted land use/comprehensive plans are advisory only and do not bind a governing body's zoning discretion -- no case found requiring consistency between a plan and a zoning ordinance, though a municipality may voluntarily choose to bind itself." },
    "Connecticut": { "requirement": "Advisory", "citation": "Conn. Gen. Stat. § 8-2, § 8-23", "note": "Public Act 92-50 affirmatively ELIMINATED an earlier requirement that zoning conform to a comprehensive plan, replacing it with a duty to CONSIDER the plan of conservation and development and state findings on the record about consistency -- a real, deliberate legislative shift from mandatory toward advisory, not just historical ambiguity." },
    "Delaware": { "requirement": "Mandatory", "citation": "9 Del. Code § 9203 (state review); municipal charter provisions", "note": "A rezoning inconsistent with the comprehensive plan can be denied on that basis alone, subject to state review; municipalities must amend their zoning maps within 18 months of a comprehensive plan's adoption or revision to bring zoning into conformance with it -- a real, teeth-bearing mandatory regime." },
    "District of Columbia": { "requirement": "Mandatory", "citation": "D.C. Comprehensive Plan Act; Zoning Regulations", "note": "Zoning cannot be inconsistent with the Comprehensive Plan for the National Capital; the Zoning Commission's own role is constrained to assessing consistency, not exercising independent discretion to override the Plan." },
    "Florida": { "requirement": "Mandatory", "citation": "Fla. Stat. Ch. 163, Part II (Growth Management Act)", "note": "One of the most rigorous mandatory-consistency regimes nationally -- every local government must adopt a state-reviewed comprehensive plan, and all land development regulations and development orders must be consistent with it." },
    "Georgia": { "requirement": "Advisory", "citation": "Ga. Code §§ 36-66-1 et seq., 36-70-1 et seq.", "note": "Consistency with the comprehensive plan is an important factor courts weigh in upholding a zoning decision, not an independently enforceable mandatory legal requirement in its own right." },
    "Hawaii": { "requirement": "Mandatory", "citation": "Haw. Rev. Stat. § 46-4", "note": "Zoning in all counties shall be accomplished within the framework of a long-range comprehensive general plan -- a mandatory structural requirement, though the statute also directs that the county's zoning powers be liberally construed in the county's favor, meaning courts give real deference to how a county chooses to implement its plan through zoning. Hawaii's separate, unusual statewide Land Use Law (state-level district classification, distinct from county zoning) is a further layer not captured in this single-variable table." },
    "Idaho": { "requirement": "Mandatory", "citation": "Idaho Code § 67-6511 (Local Land Use Planning Act)", "note": "Zoning districts shall be in accordance with the policies set forth in the adopted comprehensive plan. Statutory text is mandatory; judicial gloss on how strictly 'in accordance with' is enforced was not independently confirmed via a leading case." },
    "Illinois": { "requirement": "Advisory", "citation": "65 ILCS 5/11-12-6; the 'LaSalle factors'", "note": "Consistency with an adopted comprehensive plan is one of several LaSalle-factor considerations courts weigh in reviewing whether a zoning decision was reasonable -- not a standalone mandatory requirement. A 6-month/two-thirds-vote protection applies to zoning changes shortly after a plan's adoption." },
    "Indiana": { "requirement": "Advisory", "citation": "Ind. Code § 36-7-4-501 et seq.", "note": "A comprehensive plan's land use map does not require land to be used or zoned only for its designated purpose -- it serves as a policy statement the plan commission and legislative body must give 'reasonable regard' to, a materially lower bar than binding consistency." },
    "Iowa": { "requirement": "Mandatory", "citation": "Iowa Code § 414.3 (cities); § 335.5 (counties)", "note": "Zoning shall be made in accordance with a comprehensive plan -- mandatory statutory text for both city and county zoning; judicial strictness of enforcement not independently confirmed via a leading case." },
    "Kansas": { "requirement": "Advisory", "citation": "Kan. Stat. Ann. Ch. 12, Art. 7", "note": "The comprehensive plan is not binding on a municipality; the statute itself describes the plan as 'the basis or guide' for coordinated development, and consistency is treated as one factor in judicial review of a zoning decision's reasonableness, not a mandatory test." },
    "Kentucky": { "requirement": "Advisory", "citation": "KRS Ch. 100", "note": "The comprehensive plan is described in the statute as serving to 'guide' public and private development decisions -- language suggesting an advisory rather than strictly binding role, though a leading case squarely construing this was not independently identified." },
    "Louisiana": { "requirement": "Mandatory", "citation": "La. Rev. Stat. § 33:101 et seq.", "note": "Statutory text requires zoning regulations to be made 'in accordance with' a comprehensive plan -- classified mandatory based on the statutory text itself; how strictly Louisiana courts enforce that phrase (some 'in accordance with' states read it loosely, see Ohio/Texas below) was not independently confirmed via a leading case." },
    "Maine": { "requirement": "Mandatory", "citation": "Me. Rev. Stat. tit. 30-A, ch. 187 (Growth Management Act)", "note": "Maine first enacted a comprehensive-plan-as-basis-for-zoning requirement in 1943; under the current Growth Management Act, a municipality must have a consistent comprehensive plan to legally impose zoning beyond the state minimum (shoreland zoning). One of the longest-standing mandatory-consistency regimes in the country." },
    "Maryland": { "requirement": "Mandatory", "citation": "Md. Code, Land Use Art., Title 3; 2013 Md. Laws ch. 674", "note": "A 2013 reform extended mandatory zoning-plan consistency to ALL Maryland jurisdictions, including charter counties (Baltimore, Harford, Howard, Anne Arundel) previously free to set their own land use regulations -- elevating the comprehensive plan from a mere guide to a binding compliance standard." },
    "Massachusetts": { "requirement": "Advisory", "citation": "Mass. Gen. Laws ch. 40A (zoning) vs. ch. 41 § 81D (master plan)", "note": "A genuinely unusual, clean case: Massachusetts requires planning boards to prepare a master plan under a wholly SEPARATE statute from the Zoning Act, and current Massachusetts law does not require zoning to be consistent with that master plan at all -- no legal tie between the two exists." },
    "Michigan": { "requirement": "Mandatory", "citation": "Mich. Comp. Laws § 125.3203 (Zoning Enabling Act)", "note": "A zoning ordinance shall be based upon a plan -- mandatory, though (like Ohio) the zoning plan filed with the legislative body can itself satisfy this requirement without necessarily being a wholly separate master-plan document." },
    "Minnesota": { "requirement": "Mandatory", "citation": "Minn. Stat. § 462.357 (Municipal Planning Act)", "note": "Zoning must be consistent with and implement the comprehensive/land use plan's policies and guidelines once adopted." },
    "Mississippi": { "requirement": "Advisory", "citation": "Miss. Code § 17-1-1 et seq.", "note": "Governing authorities 'may' adopt zoning consistent with the comprehensive plan -- permissive statutory language, not a mandatory consistency test." },
    "Missouri": { "requirement": "Advisory", "citation": "Mo. Rev. Stat. §§ 89.040, 89.340", "note": "Comprehensive plans function as guidelines informing zoning decisions rather than binding mandatory constraints -- but with a real exception: Missouri courts have struck down spot zoning specifically BECAUSE it was inconsistent with the comprehensive plan, so the advisory characterization has genuine teeth against spot-zoning challenges even though it doesn't rise to full CA/FL-style mandatory consistency generally." },
    "Montana": { "requirement": "Conditional", "citation": "Mont. Code Ann. §§ 76-2-203, -304", "note": "Zoning must be made in accordance with a growth policy (Montana's term for a comprehensive plan) -- but a 2003 reform made the growth policy itself optional and non-regulatory, so the mandatory-consistency requirement is only triggered once a jurisdiction has actually adopted one. A newer Montana Land Use Planning Act (2023) requires larger cities in larger counties to update land use plans and zoning within set timeframes." },
    "Nebraska": { "requirement": "Mandatory", "citation": "Neb. Rev. Stat. § 19-901 et seq. (cities); analogous county provisions", "note": "Zoning regulations must be consistent with an adopted comprehensive development plan, and procedurally cannot even be adopted or amended until after the comprehensive plan itself has been adopted and the planning commission's recommendations received -- a real sequencing requirement, not just a substantive one." },
    "Nevada": { "requirement": "Mandatory", "citation": "Nev. Rev. Stat. § 278.250", "note": "Zoning regulations must be adopted in accordance with the master plan for land use -- a mandatory statutory requirement, reinforced by additional regional-plan consistency mandates for cities within a designated sphere of influence." },
    "New Hampshire": { "requirement": "Advisory", "citation": "N.H. Rev. Stat. § 674:2, 674:17-18", "note": "A town's master plan is described as 'the basis upon which' the zoning ordinance is written -- guidance-type statutory language rather than a clear independent enforceable consistency mandate. Lower confidence than most entries in this table: a leading case squarely confirming this advisory characterization was not identified." },
    "New Jersey": { "requirement": "Conditional", "citation": "N.J. Stat. § 40:55D-62 (Municipal Land Use Law)", "note": "Zoning ordinances must be 'substantially consistent with' or 'designed to effectuate' the master plan's land use and housing elements -- but the governing body may override this and adopt inconsistent zoning anyway, by an affirmative majority vote. A real but overridable procedural check, not an absolute bar." },
    "New Mexico": { "requirement": "Advisory", "citation": "N.M. Stat. § 3-21-5; West Bluff Neighborhood Ass'n v. City of Albuquerque, 2002-NMCA-075", "note": "The Court of Appeals squarely held 'in accordance with' does not mean a municipal plan must be strictly adhered to the way a statute or ordinance would be -- the plan guides but does not bind zoning decisions. A well-documented, case-confirmed advisory classification." },
    "New York": { "requirement": "Conditional", "citation": "Town Law § 272-a; Village Law § 7-722; Gen. City Law § 28-a", "note": "New York does not require a municipality to adopt a comprehensive plan at all -- but once one is formally adopted under these statutes, all land use regulations must be consistent with it, and the plan must be consulted before any amendment." },
    "North Carolina": { "requirement": "Advisory", "citation": "N.C. Gen. Stat. § 160D-501; § 160D-604", "note": "Local governments must adopt a comprehensive/land-use plan and must formally approve a written 'consistency statement' before every zoning amendment -- but the statute explicitly requires only that the plan be CONSIDERED, not followed; a zoning amendment inconsistent with an adopted plan remains legal." },
    "North Dakota": { "requirement": "Mandatory", "citation": "N.D. Cent. Code Title 40, Ch. 47 (cities); Title 11, Ch. 33 (counties)", "note": "Local zoning ordinances must be consistent with the community's comprehensive plan, and proposed rezonings must be evaluated for accordance with the adopted comprehensive land use plan. Medium confidence: the precise statutory subsection stating this as mandatory (versus advisory) was not pinned down to the same level of specificity as the strongest entries in this table." },
    "Ohio": { "requirement": "Mandatory", "citation": "Ohio Rev. Code § 519.02(A) (townships); analogous municipal provisions", "note": "Ohio courts treat the 'in accordance with a comprehensive plan' language as a mandatory requirement, but have consistently held a separately-adopted written plan document is not required -- the zoning resolution itself can satisfy the requirement if it has the essential characteristics of a comprehensive plan." },
    "Oklahoma": { "requirement": "Mandatory", "citation": "Okla. Stat. tit. 19, § 868.12 (counties); tit. 11 analogous municipal provisions", "note": "Statutory text requires zoning regulations be made in accordance with a comprehensive plan -- classified mandatory based on the statute; judicial strictness of enforcement not independently confirmed via a leading case." },
    "Oregon": { "requirement": "Mandatory", "citation": "ORS Ch. 197 (Statewide Planning Goals)", "note": "Among the strongest mandatory-consistency regimes in the country: every city and county must adopt a comprehensive plan and implementing zoning consistent with statewide planning goals, reviewed and 'acknowledged' by the state Land Conservation and Development Commission." },
    "Pennsylvania": { "requirement": "Conditional", "citation": "53 P.S. § 10301 et seq. (Municipalities Planning Code)", "note": "Municipalities are not required to adopt zoning or a comprehensive plan at all -- but if a municipality does adopt zoning, it must be consistent with any municipal AND county comprehensive plan that exists." },
    "Rhode Island": { "requirement": "Mandatory", "citation": "R.I. Gen. Laws Ch. 45-22.2 (Comprehensive Planning and Land Use Act of 1988)", "note": "Requiring zoning to conform to the comprehensive plan was an express purpose of the 1988 Act, which melded the State Guide Plan and municipal comprehensive plans into a reciprocal system. A 2011 amendment removed the prior 18-month deadline for bringing zoning into compliance after a plan changes, which has reportedly created some real interpretive friction between the two documents in practice." },
    "South Carolina": { "requirement": "Mandatory", "citation": "S.C. Code § 6-29-720 (Comprehensive Planning Enabling Act of 1994); § 6-31-70 (development agreements)", "note": "Zoning regulations must be made in accordance with the comprehensive plan, reviewed under a 'fairly debatable' deferential standard once consistency is shown. Notably also extends the same mandatory-consistency requirement explicitly to development agreements, directly relevant to the development_agreement_breach claim type." },
    "South Dakota": { "requirement": "Mandatory", "citation": "S.D. Codified Laws Ch. 11-2, 11-6", "note": "Zoning regulations are based upon and must conform with comprehensive land use plans adopted by the governing body. Medium confidence: statutory text supports a mandatory classification, but a leading case squarely construing how strictly 'conformance' is enforced was not identified." },
    "Tennessee": { "requirement": null, "citation": "Tenn. Code Ann. § 13-7-201 et seq.; a separate 'consistency clause' referenced in secondary sources at § 6-58-107", "note": "Three separate research passes this session confirmed municipal zoning must be developed 'in accordance with' a comprehensive plan generally, and that a distinct 'consistency clause' exists in Tennessee's regional/growth-planning statute, but none pinned down clean statutory or case-law language classifying the requirement as strictly mandatory versus advisory -- genuinely unresolved after real effort, not just unresearched." },
    "Texas": { "requirement": "Split/Unclear", "citation": "Tex. Local Gov't Code § 211.004", "note": "Statute requires zoning be 'in accordance with' a comprehensive plan, but Texas courts have reached different conclusions applying it -- at least one case voided a rezoning as inconsistent with the plan, while another held a neighborhood plan 'merely advisory and not binding.' A city is not even required to adopt a comprehensive plan in the first place. Genuinely unsettled, not just under-researched." },
    "Utah": { "requirement": "Mandatory", "citation": "Utah Code Title 10, Ch. 9a (municipal) / Title 17, Ch. 79 (county)", "note": "City/county land use actions must be 'reasonably consistent' with the adopted general plan; Utah treats this as a mandatory, procedural-type requirement -- non-compliant zoning actions can be struck down on that basis alone, without the deference typically given to ordinary legislative zoning judgment." },
    "Vermont": { "requirement": "Conditional", "citation": "24 V.S.A. § 4403 (municipal); § 4302 (regional/Act 250)", "note": "Towns are not required to adopt a town plan -- but if they do, a zoning bylaw must be 'in conformance with' it, defined by statute as making progress toward the plan's goals and providing for the plan's designated future land uses, densities, and intensities. Separately, under Act 250, a development project must conform with any applicable local or regional plan; town plans with specific, mandatory language can take on real quasi-regulatory force in that permitting context even though they remain generally aspirational documents otherwise." },
    "Virginia": { "requirement": "Conditional", "citation": "Va. Code § 15.2-2232", "note": "The mandatory 'substantial accord' consistency requirement applies specifically to siting PUBLIC facilities (streets, parks, public buildings/utilities) against the adopted comprehensive plan -- a leading case confirms a private developer's rezoning application need NOT substantially accord with the comprehensive plan the same way. Effectively advisory for private rezonings, mandatory only for public infrastructure siting." },
    "Washington": { "requirement": "Mandatory", "citation": "RCW 36.70A (Growth Management Act)", "note": "GMA-planning cities and counties must adopt development regulations, including zoning, that are consistent with and implement their comprehensive plan -- a strong mandatory regime comparable to California, Florida, and Oregon." },
    "West Virginia": { "requirement": "Mandatory", "citation": "W. Va. Code § 8A-7-2 (Land Use Planning Act)", "note": "Zoning district maps must be consistent with the governing body's comprehensive plan -- directive statutory language. Medium-high confidence: a leading case squarely testing how strictly this is enforced was not independently identified." },
    "Wisconsin": { "requirement": "Conditional", "citation": "Wis. Stat. § 66.1001 (Comprehensive Planning/'Smart Growth' Law)", "note": "Plan adoption itself is not mandated, but for any zoning or subdivision ordinance enacted or amended on or after January 1, 2010, by a jurisdiction that HAS adopted a comprehensive plan, the ordinance must be consistent with it -- defined specifically as permitting only land uses expressly identified for that land on the plan's future land use map." },
    "Wyoming": { "requirement": "Advisory", "citation": "Wyo. Stat. §§ 18-5-201 et seq.", "note": "Consistency with the comprehensive plan's goals and objectives is treated as a factor weighed in rezoning decisions rather than a clearly binding mandatory test in the sources reviewed. Lower confidence: a leading case or unambiguous statutory subsection squarely settling mandatory-versus-advisory status was not identified." }
  },

  /* Whether a state's leading case law construes the CGL policy's
     pollution exclusion BROADLY (per its plain, expansive terms --
     applies to essentially any irritant/contaminant, including
     non-traditional substances like pesticides, lead paint, or cooking
     grease, and to gradual as well as sudden releases) or NARROWLY
     (limited to "traditional environmental pollution" -- industrial/
     large-scale contamination -- based on the insured's reasonable
     expectations, leaving coverage intact for many non-traditional or
     confined-exposure claims). This is the single variable this
     session's own environmental_insurance_coverage_dispute citations
     already showed was decisive (Regency Centers/James River = broad-
     reading insurer wins; Town of Harrietstown/County of San Bernardino
     = narrow-reading policyholder wins). "interpretation" values:
     "Broad" (favors the insurer -- coverage denied more often),
     "Narrow" (favors the policyholder), "Mixed" (real, documented
     tension between an older governing case and a newer one, or
     between the majority rule and a real but non-majority outlier),
     or null with a note for jurisdictions not yet independently
     researched -- left honestly unresearched rather than guessed, same
     convention as the other state-law modifier tables in this file.
     First tranche: 20 of 51 jurisdictions researched against a leading
     state-court (or, where noted, federal-court-applying-state-law)
     opinion; 31 remain for a later pass. */
  "environmentalPollutionExclusionModifiers": {
    "Alabama": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Alaska": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Arizona": { "interpretation": "Narrow", "citation": "Keggi v. Northbrook Prop. & Cas. Ins. Co., 199 Ariz. 43 (Ct. App. 2000)", "note": "The exclusion originated in the 1970s in response to industrial pollution, and Arizona public policy limits it to traditional environmental pollutants -- coliform bacteria in drinking water was held not excluded. Later courts applied Keggi to hold negligent water-heater-installation claims not excluded either." },
    "Arkansas": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "California": { "interpretation": "Narrow", "citation": "MacKinnon v. Truck Ins. Exchange, 31 Cal.4th 635 (2003)", "note": "The exclusion does not plainly and clearly exclude ordinary negligence involving toxic chemicals (there, pesticide drift to a tenant) applied in a small or confined area -- the California Supreme Court's opinion suggests a need for genuinely widespread dispersal before the exclusion applies." },
    "Colorado": { "interpretation": "Broad", "citation": "Mountain States Mut. Cas. Co. v. Roinestad, 2013 CO 6", "note": "The Colorado Supreme Court reversed a policyholder-favorable appellate decision, holding that a restaurant's substantial dumping of cooking grease into a sewer was a 'discharge' of a 'pollutant' barring coverage -- a broad reading extending to a common, non-industrial waste product." },
    "Connecticut": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Delaware": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "District of Columbia": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Florida": { "interpretation": "Broad", "citation": "Deni Assocs. of Fla., Inc. v. State Farm Fire & Cas. Ins. Co., 711 So.2d 1135 (Fla. 1998)", "note": "The Florida Supreme Court refused to limit 'pollutant' to only environmental/industrial contexts, declining to place limitations on the exclusion's plain language, which it read to preclude coverage for all pollution-related liability generally." },
    "Georgia": { "interpretation": "Broad", "citation": "Reed v. Auto-Owners Ins. Co., 284 Ga. 286 (2008); Smith v. Ga. Farm Bureau Mut. Ins. Co., 298 Ga. 716 (2016)", "note": "Georgia's Supreme Court has twice affirmed broad application of the absolute pollution exclusion where policy language is unambiguous -- carbon monoxide (Reed) and lead paint (Smith) both held excluded pollutants." },
    "Hawaii": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case. Note: Hawaii's Supreme Court has a certified question pending on whether carbon (i.e. greenhouse gas emissions) qualifies as a 'pollutant' -- worth revisiting once decided." },
    "Idaho": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Illinois": { "interpretation": "Broad", "citation": "Griffith Foods Int'l, Inc. v. Nat'l Union Fire Ins. Co. of Pittsburgh, PA, 2026 IL 131710", "note": "A 2026 decision holding a government permit or other emissions authorization has 'no relevance' to whether the pollution exclusion applies -- government-authorized ethylene oxide emissions were still 'pollution' for coverage purposes. Also the same case already cited under cercla_cost_recovery/environmental_insurance_coverage_dispute elsewhere in this dataset -- confirms consistency across claim types." },
    "Indiana": { "interpretation": "Narrow", "citation": "American States Ins. Co. v. Kiger, 662 N.E.2d 945 (Ind. 1996); reaffirmed in TCC Kubota, LLC v. Country Mut. Ins. Co. ('Flexdar')", "note": "The Indiana Supreme Court has repeatedly held the absolute pollution exclusion ambiguous and unenforceable as to most environmental liabilities -- widely described as one of the most policyholder-favorable jurisdictions in the country on this issue." },
    "Iowa": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Kansas": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Kentucky": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Louisiana": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Maine": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Maryland": { "interpretation": "Broad", "citation": "American Motorists Ins. Co. v. ARTRA Group, Inc., 659 A.2d 1295 (Md. 1995)", "note": "In a choice-of-law dispute against Illinois's more policyholder-friendly rule, Maryland's own approach was characterized as the pro-insurer, broad-reading position -- a useful, explicitly comparative data point." },
    "Massachusetts": { "interpretation": "Narrow", "citation": "Atlantic Mut. Ins. Co. v. McFadden, 413 Mass. 90, 595 N.E.2d 762 (1992)", "note": "The Supreme Judicial Court held in-place lead paint is not a 'pollutant' under the exclusion, rejecting the insurer's attempt to deny coverage for lead-paint liability on that basis." },
    "Michigan": { "interpretation": "Broad", "citation": "Protective Nat'l Ins. Co. of Omaha v. City of Woodhaven, 438 Mich. 154 (1991)", "note": "The Michigan Supreme Court applied the exclusion broadly to pesticides, reasoning that even if not technically a 'pollutant,' pesticides are clearly an 'irritant' or 'contaminant' within the exclusion's terms." },
    "Minnesota": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Mississippi": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Missouri": { "interpretation": "Broad", "citation": "Hocker Oil Co. v. Barker-Phillips-Jackson, Inc., 997 S.W.2d 510 (Mo. Ct. App. 1999) -- a real but non-majority outlier", "note": "Hocker Oil, following Indiana's minority narrow view, held a gasoline release ambiguous and covered -- but a later Missouri appellate panel found Hocker Oil 'has little support in Missouri or elsewhere' and conflicts with the settled rule against courts manufacturing ambiguity in unambiguous policy language. Classified Broad as the better-supported majority position, with Hocker Oil noted as a real, citable minority data point a policyholder might still invoke." },
    "Montana": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Nebraska": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Nevada": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "New Hampshire": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "New Jersey": { "interpretation": "Narrow", "citation": "Nav-Its, Inc. v. Selective Ins. Co. of Am., 183 N.J. 110 (2005)", "note": "The New Jersey Supreme Court rejected the insurance industry's broad reading as 'overly broad, unfair, and contrary to the objectively reasonable expectations' of policyholders and regulators, limiting the exclusion to 'traditional environmental pollution.' One of the most-cited narrow-interpretation cases nationally." },
    "New Mexico": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "New York": { "interpretation": "Narrow", "citation": "Belt Painting Corp. v. TIG Ins. Co., 100 N.Y.2d 377 (2003); Continental Cas. Co. v. Rapid-American Corp.", "note": "The Court of Appeals treats 'discharge' and 'dispersal' as environmental-law terms of art describing broadly-dispersed contamination into land, air, or water -- not confined, non-environmental exposures like paint fume inhalation in a single building." },
    "North Carolina": { "interpretation": "Mixed", "citation": "Waste Mgmt. of Carolinas, Inc. v. Peerless Ins. Co., 315 N.C. 688 (1986)", "note": "IMPORTANT CAVEAT: this leading case construed the OLDER, 'qualified' pollution exclusion (with the 'sudden and accidental' exception), finding that language ambiguous and construing it for the insured -- it does not squarely resolve how NC courts would read the modern, 'absolute' pollution exclusion used in essentially all post-1986 policies (which the insurance industry revised specifically in response to decisions like this one). Treat NC's rule on the current policy language as genuinely unresolved rather than assume this older, narrower holding carries forward." },
    "North Dakota": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Ohio": { "interpretation": "Narrow", "citation": "Buckeye Union Ins. Co. v. Liberty Solvents & Chem. Co., 17 Ohio App.3d 127 (1984)", "note": "Ohio's framework continues to give real weight to whether pollution was 'sudden and accidental' from the insured's standpoint (unexpected and unintended), a materially narrower, more policyholder-favorable standard than a flat absolute bar." },
    "Oklahoma": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Oregon": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Pennsylvania": { "interpretation": "Narrow", "citation": "Lititz Mut. Ins. Co. v. Steely, 567 Pa. 98, 785 A.2d 975 (2001)", "note": "The Pennsylvania Supreme Court found the exclusion ambiguous as applied to slow, continuous lead-paint degradation (as opposed to an active discharge), holding that gradual process was not a 'dispersal.' Some PA lower-court decisions read active, on-site construction-related exposure differently -- the rule is meaningfully fact-pattern-dependent even though the leading case itself favors the insured." },
    "Rhode Island": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "South Carolina": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "South Dakota": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Tennessee": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Texas": { "interpretation": "Broad", "citation": "Liberty Mut. Fire Ins. Co. v. Copart of Conn., Inc., 2021 U.S. Dist. LEXIS 157457 (N.D. Tex. 2021)", "note": "Texas courts have consistently applied the pollution exclusion according to its unambiguous plain terms, contrasted explicitly in secondary sources against New Jersey's narrower approach -- Texas policyholders face more restrictive coverage than in narrow-interpretation states." },
    "Utah": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Vermont": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Virginia": { "interpretation": "Broad", "citation": "PBM Nutritionals, LLC v. Lexington Ins. Co., 283 Va. 624 (2012)", "note": "The Virginia Supreme Court rejected the policyholder's attempt to limit the exclusion to 'traditional' outdoor/hazardous-waste pollution, applying it broadly to a non-traditional contaminant (an infant-formula manufacturing contamination)." },
    "Washington": { "interpretation": "Narrow", "citation": "Quadrant Corp. v. Am. States Ins. Co., 154 Wn.2d 165 (2005)", "note": "The Washington Supreme Court held the exclusion does not bar coverage for gradual pollution cleanup costs where the insured neither expected nor intended the pollution -- a real, high-court-level narrow, policyholder-favorable rule." },
    "West Virginia": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." },
    "Wisconsin": { "interpretation": "Mixed", "citation": "Just v. Land Reclamation, Ltd., 155 Wis.2d 480 (1990) (older policy language); a later Wisconsin Supreme Court decision applying the modern absolute exclusion to cow manure/septage", "note": "Just construed the OLDER 'sudden and accidental' exclusion narrowly (unexpected/unintended, not necessarily instantaneous) -- favorable to the insured. But Wisconsin's high court has since applied the modern ABSOLUTE-form exclusion broadly in a later decision involving agricultural waste. Like North Carolina, Wisconsin's rule genuinely depends on which policy-form generation is at issue; classify with real caution." },
    "Wyoming": { "interpretation": null, "citation": "Not yet researched", "note": "Not independently verified against a leading case." }
  },

  /* Two cross-cutting premises-liability/negligence variables, both
     genuinely well-documented across all 51 jurisdictions (unlike the
     other tables in this file, this is a body of law with mature,
     widely-corroborated 50-state surveys already available):

     faultRule -- how a plaintiff's own comparative fault affects
     recovery. This is THE single most decisive variable in any
     premises-liability case, since it applies to every case (not just
     the subset involving egregious conduct the way punitive damages
     do): "Pure Contributory" (any plaintiff fault at all bars recovery
     entirely -- only 5 jurisdictions), "Modified Comparative (50%
     Bar)" (recovery barred once plaintiff's fault reaches 50%),
     "Modified Comparative (51% Bar)" (recovery barred only once
     plaintiff's fault EXCEEDS 50%, i.e. reaches 51%+), "Pure
     Comparative" (recovery reduced by the plaintiff's fault percentage
     with no bar at all, even at 99% fault), or "Slight/Gross"
     (South Dakota's unique hybrid: no percentage allocation at all --
     recovery only if the plaintiff's own negligence was "slight" and
     the defendant's was "gross," a binary and notoriously vague
     comparison).

     punitiveDamagesStandard / punitiveDamagesCap -- the burden of proof
     for punitive damages and any statutory cap. The evidentiary
     STANDARD is well-corroborated (clear-and-convincing evidence is
     the default majority rule; a handful of well-documented outliers
     are called out by name). The CAP figures are a genuinely harder
     research problem than every other state-law table in this file:
     multiple current "50-state survey" secondary sources were checked
     against each other and disagree with real specificity on at least
     six states (Indiana, Ohio's exact formula, West Virginia, Nevada,
     North Dakota, Arkansas, and Missouri) -- consistent with this
     session's established discipline, a specific dollar figure is only
     included here where either (a) it was independently confirmed
     against primary statutory text, or (b) multiple secondary sources
     agreed without contradiction. Where sources conflicted, the cap
     field says so explicitly rather than picking one arbitrarily.

     The remaining fields below this comment were added in a second,
     much deeper research pass (per practitioner feedback that the
     first pass was too bare-bones) and cover what a practitioner
     actually needs to evaluate a premises-liability matter state by
     state, beyond the fault/punitive-damages variables above:

     visitorClassificationSystem -- whether the state retains the
     common-law tripartite invitee/licensee/trespasser duty scheme
     (each category owed a different duty), has moved to a single
     unified reasonable-care-under-the-circumstances duty (the
     "Rowland rule," after Rowland v. Christian, 69 Cal.2d 108 (1968)),
     or has a statutory hybrid (e.g. Colorado's premises liability
     statute reinstating classifications by statute after courts had
     moved away from them).

     elementsToProve / elementsCitation -- the state's OWN black-letter
     formulation of what a plaintiff must plead and prove, not a generic
     Restatement recitation -- these genuinely differ across states.

     premisesLiabilityDistinctFromOrdinaryNegligence /
     premisesLiabilityDistinctNote -- THE question a practitioner must
     get right before ever drafting a complaint in some states: does
     this jurisdiction treat a claim about a CONDITION of the property
     (premises liability, generally requiring proof of notice) as
     legally distinct from a claim about a contemporaneous ACTIVITY on
     the property (ordinary negligence, no notice requirement)? Texas
     is the best-known example (Keetch v. Kroger Co., 845 S.W.2d 262
     (Tex. 1992)) -- mischaracterizing the theory is outcome-
     determinative there. This research pass found the distinction is
     real, if less famous, in Colorado, Florida, Georgia, Illinois,
     Louisiana, and Michigan too; most other states fold everything
     into a single ordinary-negligence framework.

     noticeRule / modeOfOperationRuleAdopted / modeOfOperationCitation
     -- the actual/constructive notice standard for hazard claims, and
     whether the state's courts let a plaintiff skip proving notice of
     THIS specific hazard by instead showing the business's own
     self-service operating method made the TYPE of hazard foreseeably
     recurring (e.g. a grocery store's self-service produce section).

     openAndObviousDoctrine / openAndObviousCitation / openAndObviousNote
     -- how the state treats a hazard that was open and obvious to the
     visitor: a full "no duty at all" bar in some states, a "no duty to
     warn but still a duty to remedy if harm was foreseeable despite the
     obviousness" rule in others (Restatement (Second) of Torts Sec.
     343A), or, in a growing number of states (several confirmed this
     pass moved to this rule quite recently -- Michigan in 2023 via
     Kandil-Elsayed v. F&E Oil, Inc., 512 Mich. 95 (2023), overruling
     Lugo v. Ameritech; Arizona in 2025 via Perez v. Circle K Convenience
     Stores), obviousness is not a duty bar at all and instead just goes
     to the jury as a comparative-fault factor.

     attractiveNuisanceDoctrine / attractiveNuisanceCitation /
     attractiveNuisanceNote -- whether/how the state recognizes a
     landowner's heightened duty to child trespassers regarding an
     artificial condition the landowner should realize poses an
     unreasonable risk to children too young to appreciate the danger
     (Restatement (Second) of Torts Sec. 339). Nearly universal, but a
     genuine, confirmed outlier this pass: Virginia rejects it outright.

     negligentSecurityForeseeabilityTest / negligentSecurityCitation /
     negligentSecurityNote -- THE determinative question when a crime is
     committed on the premises and the victim sues the property owner:
     how foreseeable did the criminal act have to be? Ranges from the
     strict "prior similar incidents" rule, to a looser "totality of the
     circumstances" balancing (nature of the business, location, crime
     patterns in the area, security measures already in place -- not
     just prior incidents on this exact property), to California's
     "balancing test" weighing foreseeability against the burden of the
     proposed security measure (Ann M. v. Pacific Plaza Shopping Center,
     6 Cal.4th 666 (1993)), down to the very restrictive "specific harm
     rule" (landowner had to know of an imminent, specific danger to the
     specific plaintiff). Mississippi's narrower "atmosphere of violence"
     variant (Gatewood v. Sampson) was also confirmed as a genuine
     minority-rule outlier.

     additionalDefenses -- other genuinely state-specific defenses worth
     knowing beyond comparative/contributory fault (recreational-use
     immunity statutes, the firefighter's rule, out-of-possession-
     landlord rules, independent-contractor liability-shifting, etc.).

     researchConfidence -- this pass's own honest self-assessment of
     each state entry's reliability (high/medium/low), preserved rather
     than smoothed over -- several fields across a handful of states
     (noted individually) could not be independently verified against a
     primary source in the time available and are marked accordingly
     rather than presented as settled. Treat "low"-confidence entries as
     a starting point for further verification, not a final answer. */
  "premisesLiabilityStateModifiers": {
    "Alabama": {
      "faultRule": "Pure Contributory",
      "faultRuleCitation": "Alabama common law (judicially retained)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "Greater of $500,000 or 3x compensatory damages; enhanced to $1.5 million for cases involving physical injury -- Ala. Code § 6-11-21",
      "note": "One of only 5 pure contributory jurisdictions -- if the plaintiff bears ANY fault for their own injury (even 1%), recovery is barred entirely, regardless of how much greater the defendant's fault was. This is the single most owner-favorable fault rule in the country when applicable.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Tolbert v. Gulsby, 333 So. 2d 129, 131 (Ala. 1976); trespasser duty also codified at Ala. Code § 6-5-345",
      "visitorClassificationNote": "Alabama has not moved to a unified duty; classification still controls the standard of care. Invitees are owed reasonable care including inspection and warning of non-obvious hazards; licensees are owed only a duty to avoid wanton/willful injury and to warn of known traps; trespassers are owed essentially no duty except to refrain from intentional or wanton injury.",
      "elementsToProve": [
        "Duty owed to plaintiff based on visitor status (invitee/licensee/trespasser)",
        "Breach of that duty (e.g., dangerous condition allowed to exist, or failure to warn)",
        "Actual or constructive notice of the hazard on the part of the owner/occupier",
        "Causation (breach proximately caused the injury)",
        "Damages"
      ],
      "elementsCitation": "Tolbert v. Gulsby, 333 So. 2d 129 (Ala. 1976) (status-based duty); general negligence notice framework reflected consistently in Alabama premises cases",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Alabama does not draw a Keetch-style distinction between a premises (condition) claim and an ordinary negligence (activity) claim as separate causes of action. Premises cases are analyzed as ordinary negligence with a duty that varies by the plaintiff's visitor classification, not as a legally distinct tort.",
      "noticeRule": "Plaintiff must show the owner/occupier had actual notice of the hazard or constructive notice (i.e., the hazard existed long enough, or under such circumstances, that reasonable diligence would have discovered it).",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Traditional No-Duty Bar",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Not independently verified for Alabama — secondary sources (e.g., Enjuris, MSN Attorneys) consistently describe Alabama as preserving the open-and-obvious doctrine as a bar to invitee claims where the danger 'would be apparent to, and recognized by, a reasonable person in the position of the invitee,' but no single controlling Alabama Supreme Court citation was confirmed this session. Practitioners should confirm current controlling authority (e.g., whether Alabama has carved a 343A-style anticipation-of-harm exception) before relying on this characterization.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": "Tolbert v. Gulsby, 333 So. 2d 129 (Ala. 1976) (formally adopting Restatement (Second) of Torts § 339); Massey v. Wright, 447 So. 2d 169 (Ala. 1984) (patent/obvious dangers, e.g., swimming pools, generally excluded)",
      "attractiveNuisanceNote": "Alabama applies § 339 but narrowly — courts have held that patently obvious dangers (most notably water hazards/pools) fall outside the doctrine because the danger is assumed apparent even to young children.",
      "negligentSecurityForeseeabilityTest": "describe if mixed — three-element specialized-knowledge test, distinct from both the classic 'Prior Similar Incidents' and 'Totality of the Circumstances' labels",
      "negligentSecurityCitation": "Carroll v. Shoney's, Inc., 775 So. 2d 753 (Ala. 2000)",
      "negligentSecurityNote": "Alabama's general rule is that a landowner owes no duty to protect invitees from the criminal acts of third parties absent a special relationship or special circumstances. To establish an exception, a plaintiff must show (1) the particular criminal conduct was foreseeable, (2) the defendant had 'specialized knowledge' of the criminal activity, and (3) the criminal conduct was a probability, not just a possibility — a materially higher bar than pure totality-of-circumstances jurisdictions.",
      "additionalDefenses": "Alabama is one of the last pure contributory-negligence jurisdictions: a plaintiff found even 1% at fault is completely barred from recovery, which is often the single most outcome-determinative issue in an Alabama premises case. Ala. Code § 6-5-345 also expressly limits duty owed to trespassers.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": "Prior Similar Incidents"
    },
    "Alaska": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "Alaska Stat. § 09.17.060",
      "punitiveDamagesStandard": "Clear and Convincing Evidence (statutory)",
      "punitiveDamagesCap": "Greater of $500,000 or 3x compensatory damages; up to 4x compensatory or $7 million if motivated by financial gain -- Alaska Stat. § 09.17.020",
      "note": "Recovery is reduced by the plaintiff's own fault percentage with no cutoff -- a plaintiff found 90% at fault can still recover the remaining 10%.",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland)",
      "visitorClassificationCitation": "Webb v. City & Borough of Sitka, 561 P.2d 731 (Alaska 1977)",
      "visitorClassificationNote": "Alaska abolished the common-law invitee/licensee/trespasser distinctions and imposes a single reasonable-person standard: a landowner must act reasonably in maintaining the property in a reasonably safe condition given the likelihood of injury, the seriousness of potential injury, and the burden of avoiding the risk. Visitor status may still be relevant as a factual circumstance bearing on foreseeability, but it no longer fixes the duty as a matter of law.",
      "elementsToProve": [
        "Duty of reasonable care under all the circumstances (no status-based duty tiers)",
        "Breach of that duty",
        "Actual or proximate causation",
        "Damages"
      ],
      "elementsCitation": "Webb v. City & Borough of Sitka, 561 P.2d 731 (Alaska 1977)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Alaska merged premises claims into general negligence law; there is no separate condition-versus-activity doctrine akin to Texas's Keetch line. A hazardous-condition claim is simply evaluated under ordinary negligence reasonableness principles.",
      "noticeRule": "Not independently verified as a separate formal rule for Alaska — because duty is unified reasonableness rather than status-based, actual/constructive notice functions as evidence of breach (whether the landowner acted reasonably) rather than as a freestanding element with its own named test. Treat with caution and confirm current pattern jury instructions before relying on this characterization.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Not independently verified for Alaska with a specific case citation this session. Given Alaska's unified reasonable-care standard (comparable to California's Rowland approach) and its pure comparative-negligence system, the obviousness of a hazard would be expected to bear on breach/comparative fault rather than operate as a categorical no-duty bar, but no controlling Alaska Supreme Court citation confirming this was located.",
      "attractiveNuisanceDoctrine": "describe if different — likely subsumed into the unified reasonable-care standard",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified for Alaska. No Alaska case adopting or rejecting Restatement (Second) § 339 by name was located this session; because Alaska applies a single reasonableness standard to all entrants, a child trespasser's youth and inability to appreciate danger would likely be relevant facts within that general negligence analysis rather than triggering a separately named doctrine, but this is an inference, not a verified holding.",
      "negligentSecurityForeseeabilityTest": "describe if mixed — fact-based foreseeability under the general Webb reasonableness standard; no single named test identified",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Alaska — searches did not surface a leading Alaska Supreme Court negligent-security case naming a specific foreseeability test (e.g., prior-similar-incidents or totality-of-the-circumstances). Secondary sources confirm only that foreseeability review in Alaska is 'necessarily fact-based.' Confirm current authority before using this field in a published table.",
      "additionalDefenses": "Alaska is a pure comparative-negligence state. Alaska also has a recreational land use immunity statute (AS 09.65.200) limiting landowner liability to persons using land for recreational purposes without charge — not independently re-verified this session and should be confirmed before publication.",
      "researchConfidence": "low",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": null
    },
    "Arizona": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "Ariz. Rev. Stat. § 12-2505",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap -- Arizona's constitution (Art. 2, § 31) has been read to prohibit the legislature from capping damages for death or personal injury, including punitive damages.",
      "note": "Pure comparative with no statutory punitive-damages cap, a combination that leaves real, uncapped exposure for egregious premises-liability conduct (e.g. Keggi-line pollution/contamination-adjacent claims, or a documented pattern of ignored hazard reports).",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Nicoletti v. Westcor, Inc., 131 Ariz. 140, 639 P.2d 330 (1982)",
      "visitorClassificationNote": "Arizona is one of the minority of states that has expressly declined to abolish the invitee/licensee distinction; a litigant's invitation to merge the categories was rejected because 'the separate duties owed to invitees and licensees have long been recognized' by Arizona courts.",
      "elementsToProve": [
        "Duty owed based on visitor status (invitee/licensee/trespasser)",
        "Breach of the applicable standard of care",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Nicoletti v. Westcor, Inc., 131 Ariz. 140, 639 P.2d 330 (1982); duty/breach analysis refined in Perez v. Circle K Convenience Stores, Inc., 564 P.3d 623 (Ariz. 2025)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Arizona treats a hazardous-condition claim as an ordinary negligence claim with a status-dependent duty; it does not recognize a separate premises-liability cause of action distinct from negligence in the Keetch/Texas sense.",
      "noticeRule": "Standard actual/constructive notice analysis applies within the duty owed to invitees (owner knew or should have known of the condition).",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Perez v. Circle K Convenience Stores, Inc., 564 P.3d 623 (Ariz. 2025)",
      "openAndObviousNote": "In March 2025 the Arizona Supreme Court held that whether a condition is 'open and obvious' (and thus not 'unreasonably dangerous') goes to breach, not duty — a business still owes invitees a duty of reasonable care regardless of a hazard's obviousness. This reversed lower-court rulings that had treated open-and-obviousness as a complete, duty-defeating defense. A hazard that could not have been discovered by reasonable inspection differs from one the owner should have discovered (constructive notice/breach) which differs again from one that is obvious to the visitor (relevant to breach and comparative fault, not to the existence of duty).",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified with a specific controlling Arizona Supreme Court citation this session (web search budget was exhausted before a citation could be confirmed). Secondary sources describe Arizona courts as limiting the doctrine to manmade/artificial conditions, consistent with the general Restatement § 339 approach, but this needs confirmation against a named case before publication.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances (as characterized by secondary sources)",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified with a controlling Arizona case name this session. Secondary sources describe Arizona negligent-security claims as turning on whether the criminal act was foreseeable (using police reports, crime statistics, and prior complaints), consistent with a totality-of-the-circumstances approach, but no single leading Arizona Supreme Court citation establishing that label was confirmed.",
      "additionalDefenses": "Arizona applies pure comparative fault (A.R.S. § 12-2505) with several-only liability apportioned among all at-fault parties, including non-party criminal actors in negligent-security cases — relevant to how damages actually get allocated even where duty/breach are established.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Arkansas": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "Ark. Code § 16-64-122",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "NOT INDEPENDENTLY VERIFIED -- secondary sources disagree on whether Arkansas's statutory punitive-damages cap (nominally $250,000 or 3x compensatory under Ark. Code § 16-55-208) remains enforceable, given Arkansas's own constitutional damages-limitation provision (Ark. Const. art. 5, § 32) and related litigation history. Confirm current, binding law before relying on a specific figure.",
      "note": "Recovery barred once the plaintiff's fault equals or exceeds the defendant's (i.e., 50% or more).",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Bader v. Lawson, 320 Ark. 561, 564, 898 S.W.2d 40, 42 (1995) (defining invitee)",
      "visitorClassificationNote": "Arkansas retains the traditional three-tier classification. Invitees are owed ordinary care to maintain the premises in a reasonably safe condition; licensees are owed a duty to avoid wanton negligence once their presence is known; undiscovered trespassers are owed only a duty to avoid willful/wanton misconduct.",
      "elementsToProve": [
        "Duty (based on the plaintiff's status, generally invitee)",
        "Breach — owner had superior knowledge of an unreasonable risk of harm that the invitee, exercising ordinary care, did not and should not have known",
        "Actual or constructive notice of the hazard",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Van De Veer v. RTJ, Inc., 81 Ark. App. 379, 101 S.W.3d 881 (2003) (notice); Bader v. Lawson, 320 Ark. 561, 898 S.W.2d 40 (1995) (invitee definition)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Arkansas evaluates hazardous-condition claims as ordinary negligence claims filtered through status-based duty tiers; it has not adopted a separate condition-versus-activity cause of action distinct from negligence.",
      "noticeRule": "Actual or constructive notice of the hazardous condition is required; constructive notice may be shown where the condition existed long enough that reasonable inspection would have revealed it. Van De Veer v. RTJ, Inc., 81 Ark. App. 379 (2003).",
      "modeOfOperationRuleAdopted": true,
      "modeOfOperationCitation": "Baldwin v. Mosley, 748 S.W.2d 146, 148 (Ark. 1988)",
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Secondary sources indicate Arkansas does not treat an open-and-obvious hazard as a categorical bar — a possessor can still be liable if it should have anticipated harm despite the condition's obviousness — but no single controlling Arkansas Supreme Court citation for this specific proposition was independently confirmed this session. Confirm current authority before publication.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Recognized for child trespassers drawn onto property by a hazard; secondary sources note it does not extend to adult trespassers on agricultural land, but no specific Arkansas case citation was confirmed this session.",
      "negligentSecurityForeseeabilityTest": "Prior Similar Incidents (stricter approach; some commentators expect a shift toward totality of the circumstances)",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Practitioner commentary (McMath Woods) characterizes current Arkansas law as closer to the prior-similar-incidents/Restatement § 344 approach than to the more plaintiff-friendly totality-of-the-circumstances test used in states like Georgia and Florida, and suggests Arkansas courts may eventually move toward totality of the circumstances. No single controlling Arkansas Supreme Court case naming the test was independently confirmed this session — verify before publishing as settled law.",
      "additionalDefenses": "Arkansas applies modified comparative fault with a 50% bar (a plaintiff at fault equal to or greater than the defendant's fault is barred). Arkansas also has recreational-use statutes limiting liability to persons using land for recreational purposes without charge (not independently re-verified this session).",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Prior Similar Incidents"
    },
    "California": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "Li v. Yellow Cab Co., 13 Cal.3d 804 (1975)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence (Cal. Civ. Code § 3294 -- oppression, fraud, or malice)",
      "punitiveDamagesCap": "No statutory cap -- subject only to federal due-process limits (BMW v. Gore / State Farm v. Campbell).",
      "note": "California is also the origin state of the unified reasonable-care premises-liability duty (Rowland v. Christian, 1968), which abolished the invitee/licensee/trespasser distinction for duty purposes -- see the general premises-liability note above.",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland)",
      "visitorClassificationCitation": "Rowland v. Christian, 69 Cal. 2d 108 (1968)",
      "visitorClassificationNote": "Rowland abolished the invitee/licensee/trespasser distinctions and replaced them with a single duty of reasonable care under all the circumstances, balancing foreseeability of harm, certainty of injury, closeness of the connection between conduct and injury, moral blame, policy of preventing future harm, burden on the defendant, and availability/cost of insurance. Visitor status may still be a relevant fact but no longer fixes the duty as a matter of law.",
      "elementsToProve": [
        "Duty of reasonable care under the Rowland factors",
        "Breach of that duty",
        "Actual or constructive notice of the dangerous condition (for hazard-based claims)",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Rowland v. Christian, 69 Cal. 2d 108 (1968); Ortega v. Kmart Corp., 26 Cal. 4th 1200 (2001) (notice)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "California treats a hazardous-condition claim as ordinary negligence; it does not recognize a legally distinct premises-liability cause of action separate from negligence in the manner Texas does under Keetch.",
      "noticeRule": "Plaintiff must show actual or constructive notice of the dangerous condition. Ortega v. Kmart Corp., 26 Cal. 4th 1200, 36 P.3d 11 (2001), held constructive notice can be established by showing the area had not been inspected within a reasonable period, permitting an inference the hazard existed long enough that reasonable inspection would have discovered it.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": "Ortega v. Kmart Corp., 26 Cal. 4th 1200 (2001)",
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Secondary sources consistently describe California (along with Florida and New York) as treating open-and-obviousness as a factor affecting the defendant's duty to repair/guard versus duty to warn, and as bearing on the plaintiff's comparative fault, rather than as a complete bar to recovery — consistent with California's pure comparative-negligence, unified-duty framework. No single controlling California Supreme Court citation naming this specific doctrine was confirmed this session; verify before publication.",
      "attractiveNuisanceDoctrine": "Rejected/Not recognized",
      "attractiveNuisanceCitation": "Beard v. Atchison, Topeka & Santa Fe Railway Co., 72 Cal. 2d 712 (1970)",
      "attractiveNuisanceNote": "California cast doubt on the separate attractive-nuisance doctrine in Rowland v. Christian (1968) and formally abolished it in Beard v. Atchison, Topeka & Santa Fe Railway Co. (1970); a child trespasser's age and inability to appreciate danger are now simply factors within the unified Rowland reasonableness analysis rather than triggering a separately named doctrine.",
      "negligentSecurityForeseeabilityTest": "Balancing Test (e.g. Ann M.)",
      "negligentSecurityCitation": "Ann M. v. Pacific Plaza Shopping Center, 6 Cal. 4th 666 (1993)",
      "negligentSecurityNote": "Ann M. established that a landowner's duty to provide protection against foreseeable third-party crime is determined by balancing the foreseeability of the harm against the burden of the proposed security measures — a high degree of foreseeability may be required where the burden is great, and a lesser degree where the harm can be prevented by simple means. Practitioners should also be aware of Delgado v. Trax Bar & Grill, 36 Cal. 4th 224 (2005), which clarified that heightened foreseeability is not always a prerequisite to imposing some minimal duty (not independently re-verified this session — confirm current treatment).",
      "additionalDefenses": "California Civil Code § 846 grants broad immunity to landowners for recreational use of undeveloped land absent willful misconduct or a fee charged. California applies pure comparative negligence.",
      "researchConfidence": "high",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Balancing Test"
    },
    "Colorado": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "Colo. Rev. Stat. § 13-21-111",
      "punitiveDamagesStandard": "BEYOND A REASONABLE DOUBT -- Colo. Rev. Stat. § 13-25-127",
      "punitiveDamagesCap": "Generally capped at an amount equal to compensatory damages (1:1), but the court may increase the award up to 3x compensatory damages if the defendant continued the behavior in a willful and wanton manner during the litigation -- Colo. Rev. Stat. § 13-21-102",
      "note": "GENUINE NATIONAL OUTLIER: Colorado is the only state requiring the criminal 'beyond a reasonable doubt' standard for punitive damages, rather than the clear-and-convincing standard used almost everywhere else -- a materially harder bar for a plaintiff to clear, even where the underlying premises-liability claim itself is otherwise strong.",
      "visitorClassificationSystem": "Statutory Tripartite (reinstated by statute)",
      "visitorClassificationCitation": "Colorado Premises Liability Act, C.R.S. § 13-21-115",
      "visitorClassificationNote": "Colorado's PLA statutorily reinstated status-based duties after judicial erosion of the common-law categories. The statute itself defines invitee, licensee, and trespasser and fixes the corresponding duty; classification is a question of law for the court, not a jury question.",
      "elementsToProve": [
        "Plaintiff's status as invitee, licensee, or trespasser under the statutory definitions",
        "For an invitee: landowner unreasonably failed to exercise reasonable care to protect against dangers of which the landowner actually knew or should have known",
        "For a licensee: landowner unreasonably failed to protect against dangers created by the landowner and actually known, or not ordinarily present and actually known",
        "For a trespasser: injury willfully or deliberately caused by the landowner (except children under the statutory attractive-nuisance carve-out)",
        "Causation and damages"
      ],
      "elementsCitation": "C.R.S. § 13-21-115(3)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": true,
      "premisesLiabilityDistinctNote": "Colorado is a strong example of the Texas-style distinction, but by statute rather than case law: the Colorado Supreme Court held in Vigil v. Franklin, 103 P.3d 322 (Colo. 2004), that the PLA is the exclusive remedy against a landowner for injuries occurring on the landowner's property, abrogating common-law negligence claims and defenses entirely. A plaintiff injured by a condition of the property cannot plead ordinary negligence in the alternative — only a PLA claim.",
      "noticeRule": "Statutory: for invitees, the landowner's actual or constructive knowledge ('knew or should have known') of the danger; for licensees, only the landowner's actual knowledge of the danger (no constructive-notice duty owed to licensees).",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Enactment of the modern PLA eliminated open-and-obvious as a complete bar to recovery, but the underlying facts may still be argued as comparative negligence or assumption of risk, which the PLA does not preempt. No single controlling case citation for this specific proposition was independently confirmed this session; verify before publication.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": "C.R.S. § 13-21-115(3)(c)(I) (attractive-nuisance carve-out for trespassing children under 14)",
      "attractiveNuisanceNote": "The General Assembly expressly built an attractive-nuisance-style exception for trespassers under fourteen years of age into the PLA itself, rather than leaving it to a separate common-law doctrine.",
      "negligentSecurityForeseeabilityTest": "describe if mixed — appears to be folded into the PLA's statutory 'actually knew or should have known' standard rather than a separately named foreseeability test",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Colorado — no controlling Colorado Supreme Court case naming a distinct foreseeability test (e.g., prior-similar-incidents or totality-of-the-circumstances) for negligent security was located this session. Secondary sources describe courts weighing prior similar crimes and volatile on-premises circumstances, consistent with a totality-style approach, but this operates within the PLA's statutory duty language rather than as a freestanding common-law doctrine.",
      "additionalDefenses": "The PLA's exclusivity (Vigil v. Franklin) is itself the dominant defense-side feature of Colorado premises law — it forecloses common-law negligence theories and defenses not specified in the statute. Colorado also has a separate recreational-use statute (not independently re-verified this session).",
      "researchConfidence": "high",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": null
    },
    "Connecticut": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Conn. Gen. Stat. § 52-572h",
      "punitiveDamagesStandard": "Preponderance of the Evidence (a real minority position -- most states require clear and convincing evidence)",
      "punitiveDamagesCap": "No statutory cap identified for ordinary tort/premises-liability claims; Connecticut's common-law rule also unusually LIMITS punitive damages to the plaintiff's litigation expenses (attorney's fees and costs) rather than an open-ended punishment award, a materially different and more modest structure than most states use.",
      "note": "Connecticut's lower evidentiary bar (preponderance rather than clear and convincing) is offset in practice by its litigation-expenses-only damages measure.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Long-standing Connecticut common law; see general premises-liability treatment collected at CGA report 2002-R-0365",
      "visitorClassificationNote": "The entrant's status still determines the duty owed. Invitees are owed a duty to inspect for hidden defects and repair or safeguard them. Licensees are owed due care only once their presence is actually or constructively known, with no duty regarding obvious conditions (though a condition obvious by day may become concealed at night). Trespassers are owed due care only once their presence is actually known, with no duty regarding the condition of the premises.",
      "elementsToProve": [
        "Duty based on visitor status",
        "Breach (e.g., failure to inspect/repair for invitees; failure to exercise due care for known licensees)",
        "Actual or constructive notice of the hazard",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Not independently verified with a single named Connecticut Supreme Court 'elements' case this session; the formulation above is drawn from consistent secondary-source descriptions of Connecticut common law.",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Connecticut analyzes hazardous-condition claims within ordinary negligence principles, with duty modulated by visitor status; it has not adopted a separate condition-versus-activity cause of action akin to Texas's Keetch line.",
      "noticeRule": "Actual or constructive notice of the hazard is the default rule for invitee claims, subject to the narrow mode-of-operation exception recognized in Kelly v. Stop & Shop, Inc.",
      "modeOfOperationRuleAdopted": true,
      "modeOfOperationCitation": "Kelly v. Stop & Shop, Inc., 281 Conn. 768, 918 A.2d 249 (2007)",
      "openAndObviousDoctrine": "describe if different — Hybrid: traditional no-duty treatment for licensees/trespassers, but likely a duty-to-remedy approach for invitees",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Secondary sources state there is 'no liability owed to the licensee for the obvious condition of the premises,' but that a condition obvious in daylight may become a concealed hazard at night — suggesting a traditional no-duty-to-warn rule for licensees that can still generate liability if circumstances change the condition's obviousness. No specific Connecticut Supreme Court citation for the invitee-side open-and-obvious standard was independently confirmed this session; verify before publication.",
      "attractiveNuisanceDoctrine": "Rejected/Not recognized",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Secondary sources state Connecticut has not formally adopted a distinct 'attractive nuisance' doctrine by name; children are instead protected through ordinary negligence/foreseeability principles that account for the fact that children may not appreciate danger the way adults do. No specific rejecting case citation was independently confirmed this session.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances (embedded in a broader foreseeability/public-policy duty analysis)",
      "negligentSecurityCitation": "Monk v. Temple George Associates, LLC, 273 Conn. 108, 869 A.2d 179 (2005)",
      "negligentSecurityNote": "Monk applies a foreseeability-based duty test ('would the ordinary person in the defendant's position ... anticipate that harm of the general nature suffered was likely to result?') combined with four public-policy factors (normal expectations of participants, public policy of encouraging safety, avoidance of increased litigation, and approaches of other jurisdictions) — a broader inquiry than a strict prior-similar-incidents rule.",
      "additionalDefenses": "Connecticut applies modified comparative negligence with a 51% bar (Conn. Gen. Stat. § 52-572h).",
      "researchConfidence": "medium",
      "openAndObviousRule": null,
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Delaware": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Del. Code tit. 10, § 8132",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap identified for ordinary tort/premises-liability claims.",
      "note": "",
      "visitorClassificationSystem": "Hybrid/Other — describe",
      "visitorClassificationCitation": "25 Del. C. § 1501 (private residential/farm premises only, post-1980 amendment); common-law tripartite classification for all other property, per Bailey v. Pennington, 406 A.2d 44 (Del. 1979)",
      "visitorClassificationNote": "Delaware's premises statute (Title 25, § 1501) originally limited landowner duty for licensees and trespassers to intentional/willful/wanton conduct, but a 1980 amendment confined that statute to private residential or farm premises only; for all other property (e.g., commercial premises), the common-law invitee/licensee/trespasser classification was effectively resurrected. This bifurcation makes Delaware's system genuinely hybrid and property-type-dependent.",
      "elementsToProve": [
        "The condition constituted an unreasonably dangerous condition",
        "The owner/occupier knew or should have known (actual or constructive knowledge) of the dangerous condition",
        "The plaintiff neither anticipated the condition nor should have discovered it through the exercise of reasonable care",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Lum v. Anderson, 2004 WL 772074 (Del. Super. Mar. 10, 2004)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified with a Delaware case specifically addressing this question. Based on the general negligence-style elements test located this session, Delaware appears to treat a hazardous-condition claim within ordinary negligence principles rather than as a legally distinct cause of action; this should be confirmed before publication.",
      "noticeRule": "Actual or constructive notice (owner knew or should have known) is a required element under Lum v. Anderson.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Traditional No-Duty Bar",
      "openAndObviousCitation": "Coleman v. National Railroad Passenger Corp. (Amtrak), 1991 Del. Super. LEXIS 208 (Del. Super. Ct. June 18, 1991)",
      "openAndObviousNote": "Delaware recognizes the open-and-obvious danger doctrine per Coleman, but the precise current scope (whether Delaware has since layered on a 343A-style anticipation-of-harm exception) was not independently confirmed this session and should be checked against more recent Delaware Supreme Court authority before publication.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Schorah v. Carey, 331 A.2d 383 (Del. 1975)",
      "attractiveNuisanceNote": "This attribution came from an AI-assisted secondary search summary rather than a directly reviewed opinion excerpt; the case name and citation should be independently confirmed against the reporter before being relied on in a published table.",
      "negligentSecurityForeseeabilityTest": "describe if mixed",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Delaware — no controlling Delaware case naming a specific foreseeability test (prior-similar-incidents vs. totality-of-the-circumstances) was located this session. Secondary sources describe courts weighing past-area criminal activity and industry security standards, which is consistent with either test; confirm against a named Delaware Supreme Court or Superior Court opinion before publication.",
      "additionalDefenses": "Delaware imposes a 2-year statute of limitations on premises-liability (personal injury) claims, 10 Del. C. § 8107. Delaware's bifurcated statutory/common-law scheme (see classification note) is itself a distinctive, state-specific wrinkle practitioners must check against property type (residential/farm vs. other).",
      "researchConfidence": "low",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": null
    },
    "District of Columbia": {
      "faultRule": "Pure Contributory",
      "faultRuleCitation": "D.C. common law (judicially retained)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap identified.",
      "note": "One of only 5 pure contributory jurisdictions.",
      "visitorClassificationSystem": "Hybrid/Other — describe",
      "visitorClassificationCitation": "General D.C. Court of Appeals common law (no single codifying statute located this session)",
      "visitorClassificationNote": "D.C. nominally retains three categories, but in practice invitees and licensees acting within the scope of their invitation/permission are both owed a duty of reasonable and ordinary care to provide reasonably safe premises; a licensee present merely by the owner's acquiescence assumes the risk of unconcealed dangers avoidable by proper care. Trespassers are owed only a duty to refrain from intentional, wanton, or willful injury and from maintaining a 'hidden engine of destruction.' This partial convergence of the invitee/licensee standards makes D.C.'s system more hybrid than a strict tripartite jurisdiction like Arizona.",
      "elementsToProve": [
        "Duty of care owed by the defendant to the plaintiff",
        "Breach of that duty",
        "Proximate causation",
        "Damage to the plaintiff's interests"
      ],
      "elementsCitation": "District of Columbia v. Cooper, 483 A.2d 317, 321 (D.C. 1984) (general negligence elements, applied in premises cases)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "D.C. does not treat a hazardous-condition claim as a legally distinct cause of action from ordinary negligence; both are analyzed under the same duty/breach/causation/damages framework, with the open-and-obvious character of a condition folded into breach and comparative-fault analysis rather than a separate doctrinal track.",
      "noticeRule": "Standard actual/constructive notice analysis applies to whether the owner knew or should have known of the dangerous condition; no D.C.-specific named notice case was independently confirmed this session.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Secondary legal-treatise material (Marshall Dennehey) states that in D.C., 'the open and obvious nature of a condition ... is relevant to the defendant's breach and the plaintiff's comparative fault. It is not relevant to the land possessor's duty' — i.e., D.C. does not use open-and-obviousness as a categorical no-duty bar. No specific D.C. Court of Appeals citation for this proposition was independently confirmed this session; verify before publication.",
      "attractiveNuisanceDoctrine": "describe if different",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified for D.C. — no District of Columbia case adopting or rejecting Restatement (Second) § 339 by name was located this session.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Kline v. 1500 Massachusetts Avenue Apartment Corp., 439 F.2d 477 (D.C. Cir. 1970)",
      "negligentSecurityNote": "Kline is the foundational (and nationally influential) case establishing that a landlord owes a duty to protect tenants from foreseeable criminal acts of third parties in common areas, particularly once on notice of a pattern of prior crime (there, a materially reduced security staff coinciding with rising crime, including a substantially similar assault two months earlier). Kline is a D.C. Circuit case applying District of Columbia law, not a D.C. Court of Appeals decision, which is worth flagging to a practitioner.",
      "additionalDefenses": "The District of Columbia's public-duty doctrine — that government services are owed to the public at large rather than to any particular individual absent a special relationship — is a significant defense specific to suits against the District as a landowner. Warren v. District of Columbia, 444 A.2d 1 (D.C. 1981); codified at D.C. Code § 5-401.02.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Florida": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Fla. Stat. § 768.81 (as amended 2023 -- Florida moved from pure comparative to a 51% bar)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Fla. Stat. § 768.725",
      "punitiveDamagesCap": "Greater of $500,000 or 3x compensatory damages; higher tiers (4x compensatory or $2 million) apply where the defendant acted with specific intent to harm and did so, or was motivated by unreasonable financial gain and knew the conduct was unreasonably dangerous -- Fla. Stat. § 768.73",
      "note": "Florida is a genuinely important recent change to track: it operated under PURE comparative negligence for decades before HB 837 (2023) moved it to a 51% modified bar, one of the largest tort-reform shifts of any state in years. Confirm which rule applies based on the date of the underlying incident.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Post v. Lunney, 261 So. 2d 146 (Fla. 1972) (merging 'public invitee' and 'business invitee' into a single invitee category with the same duty)",
      "visitorClassificationNote": "Florida retains the tripartite structure but treats all invitees (public and business) alike, owing them both a duty to maintain the premises in a reasonably safe condition and a duty to warn of dangers the owner knew or should have known about that the visitor would not discover. Licensees are owed the lesser 'Porto v. Carlyle' duty (avoid willful misconduct/wanton negligence; warn of known non-obvious dangers). This Post v. Lunney citation reflects general legal knowledge and was not independently re-verified against the reporter this session — confirm before publication.",
      "elementsToProve": [
        "Duty (status-dependent; for invitees: maintain reasonably safe condition + warn of non-obvious known/knowable dangers)",
        "Breach",
        "Actual or constructive notice of the dangerous condition (statutory for transitory foreign substances)",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Fla. Stat. § 768.0755 (transitory foreign substance notice standard); Porto v. Carlyle Plaza, Inc., 971 So. 2d 940, 941 (Fla. 3d DCA 2007) (licensee duty)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": true,
      "premisesLiabilityDistinctNote": "Florida practitioners and courts distinguish 'premises liability' (a condition of the land the owner had a duty to maintain/warn about) from 'ordinary/active negligence' (an owner's or occupier's contemporaneous conduct or activity), similarly in spirit to Texas's Keetch v. Kroger condition-versus-activity line — the correct theory affects the applicable duty and notice requirements. This is a real distinction litigated in Florida but is less rigidly formalized/named than in Texas; the specific line-drawing case law was not independently reviewed in full this session (only a secondary-source discussion was located) and should be verified before being presented as settled doctrine.",
      "noticeRule": "For transitory foreign substances in a business establishment, Fla. Stat. § 768.0755 requires the plaintiff to prove the business had actual or constructive knowledge of the dangerous condition; constructive knowledge may be shown by (a) the condition existing long enough that ordinary care should have discovered it, or (b) the condition occurring with regularity and therefore being foreseeable.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": "Owens v. Publix Supermarkets, Inc., 802 So. 2d 315 (Fla. 2001) (recognizing a mode-of-operation-style approach); superseded/narrowed by Fla. Stat. § 768.0755 (2010), which reinstated an actual/constructive notice requirement",
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Denson v. SM-Planters Walk Apartments, 183 So. 3d 1048, 1051 (Fla. 1st DCA 2015)",
      "openAndObviousNote": "An open and obvious danger can relieve the owner of the duty to warn, but does not automatically eliminate the independent duty to maintain the property in a reasonably safe condition — a hazard that could not have been discovered by reasonable inspection differs from one the owner should have discovered (constructive notice) which differs again from a hazard obvious enough that no warning was legally required.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": "Fla. Stat. § 768.075 (preserving the common-law attractive-nuisance doctrine notwithstanding the statute's general limits on trespasser duty); Idzi v. Hobbs, 186 So. 2d 20 (Fla. 1966) (child's age as one factor, not dispositive)",
      "attractiveNuisanceNote": "Florida's trespasser-duty-limiting statute expressly carves out and preserves the attractive-nuisance doctrine for children.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances / 'Foreseeable Zone of Risk'",
      "negligentSecurityCitation": "Stevens v. Jefferson, 436 So. 2d 33, 35 (Fla. 1983) (foreseeable zone of risk); Holley v. Mt. Zion Terrace Apartments, Inc., 382 So. 2d 98 (Fla. 4th DCA 1980) (prior similar incidents as evidence of foreseeability)",
      "negligentSecurityNote": "Florida's general negligence duty doctrine holds that where conduct or conditions create a foreseeable zone of risk, the law recognizes a duty to lessen the risk or take sufficient precautions (Stevens v. Jefferson). In the negligent-security context specifically, courts (e.g., Holley) look at the property's history of crime to assess foreseeability, but Florida does not appear to impose a rigid prior-similar-incidents-only requirement; totality-style evidence is generally admissible.",
      "additionalDefenses": "Florida shifted from pure comparative negligence to modified comparative negligence with a 51% bar for causes of action accruing on or after March 24, 2023, under HB 837 — a major, relatively recent change that significantly affects premises-liability exposure. This was not independently re-verified this session against the statute text and should be confirmed before publication.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Georgia": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "Ga. Code § 51-12-33",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- O.C.G.A. § 51-12-5.1(b)",
      "punitiveDamagesCap": "$250,000 flat cap in most tort cases -- O.C.G.A. § 51-12-5.1(g) -- with NO cap where the case involves product liability, or the defendant acted with specific intent to cause harm or while impaired by drugs/alcohol. Held constitutional by the Georgia Supreme Court in 2023.",
      "note": "PRIMARY-VERIFIED cap figure.",
      "visitorClassificationSystem": "Statutory Tripartite (reinstated by statute)",
      "visitorClassificationCitation": "O.C.G.A. §§ 51-3-1 (invitees), 51-3-2 (licensees), 51-3-3 (trespassers)",
      "visitorClassificationNote": "Georgia codifies the tripartite duty structure. § 51-3-1 requires an owner/occupier who induces others onto the property for a lawful purpose to exercise ordinary care to keep the premises and approaches safe for invitees.",
      "elementsToProve": [
        "Defendant (owner/occupier) had actual or constructive knowledge of the hazard",
        "Plaintiff lacked knowledge of the hazard despite the exercise of ordinary care, due to actions or conditions within the control of the owner/occupier (the 'superior knowledge' requirement)",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Robinson v. Kroger Co., 268 Ga. 735, 493 S.E.2d 403 (Ga. 1997)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": true,
      "premisesLiabilityDistinctNote": "Georgia draws a genuine, frequently litigated distinction between 'static condition' claims — governed by O.C.G.A. § 51-3-1's superior-knowledge, two-prong Robinson v. Kroger framework, where the owner's liability turns on knowledge superior to the plaintiff's — and 'active negligence' claims involving an owner's ongoing conduct, where the ordinary duty of care applies regardless of the plaintiff's own knowledge of the risk. This is conceptually similar to, though doctrinally distinct from, Texas's Keetch condition-versus-activity line, and correctly characterizing a claim as 'static condition' versus 'active negligence' is often outcome-determinative in Georgia premises litigation.",
      "noticeRule": "O.C.G.A. § 51-3-1 requires actual or constructive knowledge of the hazard on the part of the owner/occupier, coupled with the plaintiff's lack of equal or superior knowledge, per Robinson v. Kroger Co.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Traditional No-Duty Bar (operating through the 'equal/superior knowledge' rule rather than a separately labeled open-and-obvious doctrine)",
      "openAndObviousCitation": "Robinson v. Kroger Co., 268 Ga. 735, 493 S.E.2d 403 (Ga. 1997)",
      "openAndObviousNote": "Georgia does not use a separately named 'open and obvious' doctrine; instead, an obvious hazard is typically treated as one of which the invitee has equal or superior knowledge to the owner, defeating the superior-knowledge element of the Robinson v. Kroger test. A hazard that could not have been discovered by the owner differs from one the owner should have discovered (satisfying the owner's constructive-knowledge prong) which differs again from a hazard so obvious the invitee is deemed to have equal/superior knowledge (defeating the claim).",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": "Gregory v. Johnson, 249 Ga. 151, 289 S.E.2d 232 (Ga. 1982)",
      "attractiveNuisanceNote": "Georgia limits the doctrine to inherently dangerous instrumentalities that are attractive to children; it does not extend to ponds or other natural water hazards.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Georgia CVS Pharmacy, LLC v. Carmichael, 316 Ga. 718, 890 S.E.2d 209 (Ga. 2023)",
      "negligentSecurityNote": "In 2023 the Georgia Supreme Court (deciding Carmichael together with the companion Welch cases) clarified that reasonable foreseeability of third-party criminal conduct is assessed under the totality of the circumstances, and that prior incidents need not be identical or even 'substantially similar' to be relevant — proximity, timing, frequency, and similarity all inform the analysis. This significantly loosened what practitioners describe as an older, stricter requirement (associated with Sturbridge Partners, Ltd. v. Walker, 267 Ga. 785 (1997) — not independently re-verified this session) that had effectively required near-identical prior incidents.",
      "additionalDefenses": "Georgia applies modified comparative negligence with a 50% bar. Georgia's apportionment statute, O.C.G.A. § 51-12-33, allows a jury to apportion fault to a non-party criminal assailant in negligent-security cases, which can substantially reduce a proprietor-defendant's share of damages even where liability is established — a major state-specific practical consideration.",
      "researchConfidence": "high",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Hawaii": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Haw. Rev. Stat. § 663-31",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap identified.",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland)",
      "visitorClassificationCitation": "Pickard v. City and County of Honolulu, 51 Haw. 134, 452 P.2d 445 (1969)",
      "visitorClassificationNote": "Hawaii abolished the invitee/licensee/trespasser categories in 1969 (contemporaneous with California's Rowland v. Christian, 1968), holding that a landowner owes all entrants a duty of reasonable care under the circumstances. The old status categories may still bear on what the 'circumstances' require (e.g., a known trespasser's presence), but they no longer fix the duty itself.",
      "elementsToProve": [
        "Defendant owned, occupied, or controlled the premises",
        "A dangerous/hazardous condition existed on the premises",
        "Defendant knew or reasonably should have known of the condition (actual or constructive notice) — except where the mode-of-operation rule dispenses with this element",
        "Defendant failed to exercise reasonable care to remedy the condition or adequately warn of it",
        "Causation and damages"
      ],
      "elementsCitation": "Pickard v. City and County of Honolulu, 51 Haw. 134, 452 P.2d 445 (1969); general negligence/reasonable-care framework",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Hawaii does not treat 'premises liability' as a legally distinct cause of action from ordinary negligence the way Texas does under Keetch. Since Pickard abolished status-based duties, both condition-based and activity-based injury claims are analyzed under the single reasonable-care negligence standard.",
      "noticeRule": "Actual or constructive notice of the dangerous condition is generally required, with constructive notice presumed where routine inspection would have revealed the hazard — except in self-service/mode-of-operation situations (see below).",
      "modeOfOperationRuleAdopted": true,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — provisional",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Secondary sources indicate Hawaii treats obviousness of a danger as substituting for an express warning where the danger is one 'any reasonable person exercising ordinary attention... could be expected to avoid,' but also indicate an obvious condition does not automatically bar recovery entirely (comparative-fault plays a role). Not independently verified for Hawaii — I could not identify and confirm the specific Hawaii Supreme Court/ICA case establishing this rule in this research pass; treat the open-and-obvious classification above as provisional until a controlling citation is confirmed.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339) — provisional",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified for Hawaii — searches returned only generic, multi-state summaries of the Restatement (Second) of Torts §339 doctrine with no Hawaii-specific appellate case. Most likely adopted in some form given Hawaii's general adoption of Restatement negligence principles, but this should be confirmed against Hawaii case law before publishing.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for Hawaii",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Hawaii — I was unable to locate a Hawaii-specific negligent-security/third-party-crime foreseeability case in this research pass; only generic multi-jurisdiction discussion was returned.",
      "additionalDefenses": "Recreational Use immunity, Haw. Rev. Stat. ch. 520 (landowner not liable to recreational users absent willful/malicious failure to warn of a known danger); separate recreational-activity-business statute, HRS §663-1.54, requires reasonable care by commercial recreation operators despite ch. 520.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": null
    },
    "Idaho": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "Idaho Code § 6-801",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Idaho Code § 6-1604",
      "punitiveDamagesCap": "Greater of $250,000 or 3x compensatory damages -- Idaho Code § 6-1604(3)",
      "note": "",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": null,
      "visitorClassificationNote": "Idaho has NOT abolished the common-law tripartite classification (unlike Hawaii, Iowa, Kansas, and many neighboring states). Trespassers are owed only a duty to refrain from willful/wanton conduct; licensees and invitees retain traditional common-law duties. Not independently verified: I could not confirm a single controlling Idaho Supreme Court case name for the classification framework itself in this pass (secondary sources describe the rule but without a clean citation).",
      "elementsToProve": [
        "Plaintiff's status as invitee, licensee, or trespasser (determines duty owed)",
        "Existence of a dangerous condition",
        "Defendant's actual or constructive knowledge of the condition",
        "Breach of the duty corresponding to plaintiff's status",
        "Causation and damages"
      ],
      "elementsCitation": "Harrison v. Taylor, 115 Idaho 588, 768 P.2d 1321 (1989) (open-and-obvious/duty analysis)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified either way for Idaho. I found no authority stating Idaho draws a Texas/Keetch-style distinction between a premises 'condition' claim and an ordinary negligent-activity claim; Idaho's published discussion of premises law centers on the invitee/licensee/trespasser status framework rather than a condition/activity split.",
      "noticeRule": "Actual or constructive notice of the dangerous condition generally required for invitee/licensee claims; trespasser claims require only willful/wanton conduct once the trespasser's presence is known.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": "Harrison v. Taylor, 115 Idaho 588, 768 P.2d 1321, 1328 (1989)",
      "openAndObviousNote": "Idaho is notable for having eliminated the open-and-obvious danger rule as an independent defense entirely — Harrison v. Taylor holds the obviousness of a danger does not bar recovery as a matter of law but is instead relevant only to the invitee's comparative negligence. A hazard that could not have been discovered at all (hidden defect) is analyzed under ordinary notice principles; one that reasonably should have been discovered, or one that is fully obvious, are both folded into the comparative-fault calculus rather than cutting off the landowner's duty.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Nelson ex rel. Nelson v. City of Rupert, 128 Idaho 199, 911 P.2d 1109 (1996)",
      "attractiveNuisanceNote": "Idaho recognizes attractive nuisance for child trespassers; because the doctrine presupposes the child is technically a trespasser, Idaho courts have held the state's recreational-use immunity statute does not automatically defeat an attractive-nuisance claim.",
      "negligentSecurityForeseeabilityTest": "describe if mixed",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Idaho — searches returned only generic, non-Idaho-specific discussion of foreseeability in negligent-security claims; no controlling Idaho appellate case was identified in this pass.",
      "additionalDefenses": "Idaho recreational use immunity statute, Idaho Code §36-1604 (limits landowner liability to recreational users; does not itself expand liability or displace other common-law immunities/defenses, and does not bar attractive-nuisance claims).",
      "researchConfidence": "medium",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": null
    },
    "Illinois": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "735 ILCS 5/2-1116",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No general statutory cap on punitive damages in ordinary tort/premises-liability cases (Illinois has, at times, had a split-recovery statute directing a portion of certain punitive awards to the state, but no cap on the total amount).",
      "note": "",
      "visitorClassificationSystem": "Statutory Tripartite (reinstated by statute)",
      "visitorClassificationCitation": "Illinois Premises Liability Act, 740 ILCS 130/2 (1984)",
      "visitorClassificationNote": "The 1984 Act abolished the common-law distinction between invitees and licensees, merging them into a single 'reasonable care under the circumstances' category, but it deliberately preserved a separate, lower standard for trespassers (willful and wanton conduct only, generally limited to known/discovered trespassers). So Illinois is neither pure common-law tripartite nor fully unified — it is a hybrid, statute-created bipartite-plus-trespasser system.",
      "elementsToProve": [
        "Defendant owned/occupied/controlled the premises",
        "A condition on the premises posed an unreasonable risk of harm",
        "Defendant knew or in the exercise of reasonable care should have known of the condition and the risk (or the condition arose from defendant's mode of business operation)",
        "Defendant should have anticipated that entrants would not discover/appreciate the danger or would fail to protect themselves against it",
        "Defendant failed to exercise reasonable care",
        "Causation and damages"
      ],
      "elementsCitation": "740 ILCS 130/2; Illinois Pattern Jury Instructions — Civil 120.00 (Premises)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": true,
      "premisesLiabilityDistinctNote": "Illinois courts distinguish a claim based on a condition of the property (premises liability, with its added notice/foreseeability elements) from a claim based on a defendant's negligent activity on the property (ordinary negligence). This mirrors the Texas Keetch distinction, and the premises-liability route is generally harder for a plaintiff to establish because of the extra notice/foreseeability elements.",
      "noticeRule": "Actual or constructive notice generally required for static/naturally-occurring hazards; constructive notice may be shown by evidence the condition existed long enough that reasonable inspection would have discovered it.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Sollami v. Eaton, 201 Ill. 2d 1, 772 N.E.2d 215 (2002)",
      "openAndObviousNote": "Illinois generally follows Restatement §343A — an open and obvious danger negates the duty to warn — but recognizes two exceptions from Sollami v. Eaton: the 'distraction' exception (possessor should anticipate the entrant's attention will be diverted from the obvious hazard) and the 'deliberate encounter' exception (economic or similar compulsion makes confronting the known risk reasonable). A hazard that could not have been discovered at all is analyzed under ordinary notice rules rather than the open-and-obvious framework.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": "Kahn v. James Burton Co., 5 Ill. 2d 614, 126 N.E.2d 836 (1955)",
      "attractiveNuisanceNote": "Kahn replaced the old 'allurement' requirement (that the condition itself must have lured the child onto the land) with a straightforward foreseeability-of-harm-to-children negligence analysis, and eliminated the need to separately classify injured children as trespasser/licensee/invitee.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Illinois case law is fact-intensive and weighs the similarity, recency, location, frequency, and severity of prior incidents rather than requiring an exact prior-similar-incident match; a duty can arise even without any prior incident if harm was otherwise foreseeable. Not independently verified: I could not confirm a single leading Illinois Supreme Court case name for this test in this research pass and recommend confirming before publication (candidates commonly cited in practice include duty-foreseeability cases such as Rowe v. State Bank of Lombard, 125 Ill. 2d 203 (1988), but I did not verify that case addresses negligent security specifically).",
      "additionalDefenses": "Recreational Use of Land and Water Areas Act, 745 ILCS 65; Local Governmental and Governmental Employees Tort Immunity Act (745 ILCS 10) for public entities; comparative negligence (735 ILCS 5/2-1116, 50% bar).",
      "researchConfidence": "high",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Indiana": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Ind. Code § 34-51-2-6",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "NOT INDEPENDENTLY VERIFIED -- secondary sources disagree on the exact cap formula (a flat 3x compensatory versus a greater-of-$50,000-or-3x formula were both reported). Indiana Code § 34-51-3-4 also directs a significant statutory percentage of any punitive award to the state, which is well-corroborated and worth flagging regardless of the exact cap figure.",
      "note": "",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Burrell v. Meads, 569 N.E.2d 637 (Ind. 1991)",
      "visitorClassificationNote": "Indiana retains the traditional tripartite classification, but Burrell v. Meads changed the treatment of social guests, reclassifying invited social guests as invitees (owed a duty of reasonable care) rather than mere licensees, narrowing the practical gap between the two categories.",
      "elementsToProve": [
        "Defendant possessed the land",
        "Defendant knew, or by exercise of reasonable care would have discovered, the condition and should have realized it involved an unreasonable risk of harm to invitees",
        "Defendant should have expected invitees would not discover or realize the danger, or would fail to protect themselves against it",
        "Defendant failed to exercise reasonable care to protect invitees against the danger",
        "Causation and damages"
      ],
      "elementsCitation": "Burrell v. Meads, 569 N.E.2d 637 (Ind. 1991), adopting Restatement (Second) of Torts §343",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified for Indiana — I found no clear Indiana authority establishing a separate 'premises condition' cause of action distinct from an ordinary negligent-activity claim in the way Texas does under Keetch. Indiana analyzes premises claims under the general negligence elements (duty, breach, causation, damages) informed by Restatement §343's status-based duty content.",
      "noticeRule": "Actual or constructive notice of the dangerous condition required, consistent with Restatement §343(a) (defendant knew or by reasonable care would have discovered the condition).",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Indiana does not treat an open-and-obvious danger as an absolute bar to recovery; instead, the plaintiff's awareness of the hazard is addressed through Indiana's Comparative Fault Act and assumption-of-risk principles, and can still support liability if the landowner should have anticipated harm despite the danger's visibility. Not independently verified: I could not confirm a single controlling Indiana Supreme Court case name for this specific rule in this pass.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Indiana historically used a narrower 'allurement-implied invitation' theory (e.g., Chicago & E.R.R. v. Fox; Lewis v. Cleveland, C.C. & St. L. Ry.) before incorporating Restatement (Second) §339's foreseeability-based approach; Indiana courts sometimes describe this as a foreseeability test for injured child trespassers rather than using the 'attractive nuisance' label directly. Not independently verified with a controlling modern citation in this pass.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Delta Tau Delta, Beta Alpha Chapter v. Johnson, 712 N.E.2d 968 (Ind. 1999)",
      "negligentSecurityNote": "Indiana expressly adopted the totality-of-the-circumstances test over the narrower prior-similar-incidents and specific-harm rules. The number, nature, and location of prior incidents is a substantial factor, but the absence of prior similar incidents does not preclude a duty finding where the criminal act was otherwise foreseeable.",
      "additionalDefenses": "Indiana Comparative Fault Act, Ind. Code §34-51-2 (51%-or-greater plaintiff fault bars recovery); recreational-use-type immunities for certain public/agricultural land uses under Indiana Code Title 14.",
      "researchConfidence": "high",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Iowa": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Iowa Code § 668.3",
      "punitiveDamagesStandard": "Preponderance of Clear, Convincing Evidence (Iowa's own case law formulation is sometimes phrased distinctly -- verify exact jury-instruction language locally)",
      "punitiveDamagesCap": "No statutory cap identified for ordinary tort/premises-liability claims, though one secondary source described an unusually high multiplier (up to 5x) in extreme cases -- not independently confirmed.",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland)",
      "visitorClassificationCitation": "Koenig v. Koenig, 766 N.W.2d 635 (Iowa 2009)",
      "visitorClassificationNote": "The Iowa Supreme Court abolished the invitee/licensee distinction in 2009 as 'confusing' and unsound policy, adopting a single reasonable-care-under-all-the-circumstances standard for lawful visitors. Trespassers remain a separate, lower-duty category (subject to the attractive-nuisance exception for children).",
      "elementsToProve": [
        "Defendant possessed/controlled the premises",
        "A condition on the premises created an unreasonable risk of harm",
        "Defendant failed to exercise reasonable care under all the circumstances existing at the time and place of the injury",
        "Causation and damages"
      ],
      "elementsCitation": "Koenig v. Koenig, 766 N.W.2d 635 (Iowa 2009)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified either way, but Iowa's post-Koenig unified reasonable-care standard for premises conditions suggests no rigid Texas-style separation between a premises 'condition' claim and an ordinary negligent-activity claim; both appear to be analyzed under the general reasonable-care negligence framework.",
      "noticeRule": "Actual or constructive notice of the dangerous condition generally required; Restatement (Second) §343A's known-or-obvious-danger principle applies alongside §343.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Frantz v. Knights of Columbus, 205 N.W.2d 705 (Iowa 1973)",
      "openAndObviousNote": "Iowa applies Restatement §343A: a possessor is not liable for physical harm from a known or obvious danger unless the possessor should anticipate the harm despite such knowledge or obviousness (e.g., a distraction exception). 'Known' requires both awareness of the condition and appreciation of the danger's severity; 'obvious' means a reasonably prudent person would recognize both the condition and the risk. A hazard that could not have been discovered at all is analyzed under ordinary notice principles rather than §343A.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Iowa recognizes attractive nuisance for trespassing children where the landowner knew or should have known children were likely to trespass; Iowa authority indicates the condition need not itself be 'attractive' so long as trespass by children was foreseeable. Not independently verified with a specific controlling Iowa Supreme Court citation in this pass.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for Iowa",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Iowa — searches returned only generic, non-Iowa-specific discussion of negligent security and foreseeability; no controlling Iowa appellate case was identified in this pass.",
      "additionalDefenses": "Iowa recreational use statute, Iowa Code ch. 461C (no duty to keep premises safe for, or warn, recreational users; exception preserved for willful or malicious failure to guard or warn of a known danger).",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": null
    },
    "Kansas": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "Kan. Stat. Ann. § 60-258a",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Kan. Stat. Ann. § 60-3701(c)",
      "punitiveDamagesCap": "Lesser of the defendant's annual gross income or $5 million (higher tier available if the conduct was profit-motivated and the profit exceeded this cap) -- Kan. Stat. Ann. § 60-3701",
      "note": "Both secondary sources agreed on this figure without contradiction.",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland)",
      "visitorClassificationCitation": "Jones v. Hansen, 254 Kan. 499, 867 P.2d 303 (1994)",
      "visitorClassificationNote": "Jones v. Hansen eliminated the judicial distinction between licensees and invitees, adopting a single 'reasonableness under the circumstances' standard for lawful entrants. Kansas retained a separate, lower duty for trespassers: only to refrain from willfully, wantonly, or recklessly injuring them.",
      "elementsToProve": [
        "Defendant possessed/controlled the premises",
        "A condition on the premises posed an unreasonable risk of harm",
        "Defendant failed to act with reasonable care under all the circumstances",
        "Causation and damages"
      ],
      "elementsCitation": "Jones v. Hansen, 254 Kan. 499, 867 P.2d 303 (1994)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified for Kansas in this research pass (web-search budget was exhausted before this point) — say plainly this specific question was not confirmed against Kansas authority and should be checked before publication.",
      "noticeRule": "Actual or constructive notice generally required; duration/prior-complaint history can defeat an open-and-obvious defense. Constructive notice can also be dispensed with under the mode-of-operation rule (below).",
      "modeOfOperationRuleAdopted": true,
      "modeOfOperationCitation": "Jackson v. K-Mart Corp., 251 Kan. 700, 840 P.2d 463 (1992)",
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Kansas treats an open-and-obvious hazard as a factor rather than an automatic bar — a property owner is not necessarily required to guard against a condition a reasonable person would expect to encounter, but a lengthy, unaddressed, or previously-complained-of hazard can defeat the defense. Kansas's modified comparative-fault statute bars recovery only at 50% or greater plaintiff fault. Not independently verified with a specific controlling Kansas Supreme Court citation for the open-and-obvious rule itself in this pass.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Kansas applies the Restatement (Second) §339 elements for child trespassers (foreseeable trespass, unreasonable risk, children's inability to appreciate the danger, and burden of remedy slight compared to risk). Not independently verified with a specific controlling Kansas case in this pass.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Seibert v. Vic Regnier Builders, Inc., 253 Kan. 540, 856 P.2d 1332 (1993)",
      "negligentSecurityNote": "Seibert reversed a summary judgment that had been entered under the narrower 'prior similar incidents' rule and remanded for application of the totality-of-the-circumstances foreseeability test — the leading Kansas negligent-security/third-party-crime case, arising from an armed robbery/shooting in a shopping center's underground parking garage.",
      "additionalDefenses": "Kansas modified comparative fault (50% bar), K.S.A. 60-258a; Kansas recreational use statute limiting landowner liability to public recreational users.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Kentucky": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "Hilen v. Hays, 673 S.W.2d 713 (Ky. 1984)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Ky. Rev. Stat. § 411.184",
      "punitiveDamagesCap": "No statutory cap -- Kentucky's constitution (§ 54) has been read to prohibit the legislature from capping damages for death or personal injury.",
      "note": "",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": null,
      "visitorClassificationNote": "Kentucky is one of the states that has NOT abolished the traditional tripartite classification — invitees are owed the highest duty (reasonable inspection plus warning of known and discoverable hazards), licensees are owed a duty to warn of known hazards only, and trespassers are owed essentially no duty beyond avoiding intentional harm. Not independently verified with a single controlling Kentucky Supreme Court citation for the classification framework itself in this pass.",
      "elementsToProve": [
        "Plaintiff's status (invitee/licensee/trespasser) as of the time of injury",
        "Existence of a dangerous condition",
        "Defendant's actual or constructive knowledge of the condition (for invitees/licensees)",
        "Breach of the duty owed to that status",
        "Causation and damages"
      ],
      "elementsCitation": "Kentucky River Medical Center v. McIntosh, 319 S.W.3d 385 (Ky. 2010); Shelton v. Kentucky Easter Seals Society, Inc., 413 S.W.3d 901 (Ky. 2013)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified for Kentucky in this research pass; no authority was located either affirming or denying a Texas-style separate 'premises condition' cause of action distinct from ordinary negligent-activity claims.",
      "noticeRule": "Actual or constructive notice of the dangerous condition required for invitee claims (with McIntosh/Shelton now treating notice/obviousness questions as going to breach rather than duty); constructive notice may also be shown circumstantially, e.g. Lanier v. Wal-Mart Stores, Inc., 99 S.W.3d 431 (Ky. 2003).",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": "Kentucky River Medical Center v. McIntosh, 319 S.W.3d 385 (Ky. 2010); Shelton v. Kentucky Easter Seals Society, Inc., 413 S.W.3d 901 (Ky. 2013)",
      "openAndObviousNote": "McIntosh eliminated the open-and-obvious rule as an automatic bar to duty, holding that every premises owner owes invitees a general duty of reasonable care regardless of a hazard's obviousness; obviousness instead bears on breach and on the parties' comparative fault under Kentucky's pure comparative-fault regime (a plaintiff 20% at fault can still recover 80% of damages). Shelton refined this by shifting the analytical focus fully onto breach rather than duty.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": "North Hardin Developers v. Corkran, 839 S.W.2d 258 (Ky. 1992)",
      "attractiveNuisanceNote": "Kentucky follows the Restatement (Second) §339 elements but has narrowed the 'tender years' protection, holding a child of fourteen is presumptively too old to invoke the doctrine's protections.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Secondary sources describe Kentucky as using a totality-of-circumstances foreseeability standard (prior incidents, neighborhood crime patterns, lighting/security deficiencies), but I was unable to confirm a single leading Kentucky appellate case name for this test in this research pass — recommend confirming before publication.",
      "additionalDefenses": "Kentucky's pure comparative fault system (no percentage bar); Kentucky recreational use statute, KRS 411.190.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Louisiana": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "La. Civ. Code art. 2323",
      "punitiveDamagesStandard": "STATUTE-ONLY -- punitive damages are generally UNAVAILABLE in Louisiana absent a specific enabling statute (e.g., certain drunk-driving or product-defect claims); an ordinary negligence-based premises-liability claim will typically not support punitive damages at all.",
      "punitiveDamagesCap": "Not generally applicable given the statute-only availability rule above.",
      "note": "Confirm at the outset of any Louisiana matter whether a punitive-damages theory is even viable before spending resources developing egregious-conduct evidence.",
      "visitorClassificationSystem": "Hybrid/Other — describe",
      "visitorClassificationCitation": "Cates v. Beauregard Electric Cooperative, Inc., 328 So. 2d 367 (La. 1976); La. Civil Code arts. 2315, 2316, 2317, 2317.1, 2322",
      "visitorClassificationNote": "Louisiana is a civil-law jurisdiction that never adopted the common-law tripartite scheme as controlling. Following Cates, a plaintiff's status (invitee/licensee/trespasser) is only one factor within Louisiana's 'duty-risk' analysis under the general fault articles (arts. 2315-2316) and the custodial-liability articles for defective things and buildings (arts. 2317, 2317.1, 2322) — it is not independently determinative of duty.",
      "elementsToProve": [
        "Duty: whether defendant owed a duty to the plaintiff (custodian/owner of the thing or building under arts. 2317, 2317.1, or 2322, or a general duty under art. 2315)",
        "Breach: defendant knew or, in the exercise of reasonable care, should have known of the ruin/vice/defect (actual or constructive notice) and failed to exercise reasonable care to prevent the damage",
        "Cause-in-fact of the plaintiff's injury",
        "Scope of the duty/scope of protection: whether the risk and harm fall within the duty's scope of protection (legal/proximate cause)",
        "Damages",
        "For retail/merchant defendants: the heightened burden of La. R.S. 9:2800.6 — an unreasonably dangerous, reasonably foreseeable condition; that the merchant created the condition or had actual or constructive notice of it prior to the accident; and failure to exercise reasonable care"
      ],
      "elementsCitation": "Cates v. Beauregard Electric Cooperative, Inc., 328 So. 2d 367 (La. 1976); La. Civil Code art. 2317.1; La. R.S. 9:2800.6",
      "premisesLiabilityDistinctFromOrdinaryNegligence": true,
      "premisesLiabilityDistinctNote": "Louisiana's Civil Code creates a codified custodial-liability regime for 'things' and buildings (arts. 2317, 2317.1, 2322) that is analytically distinct from the general negligence article (art. 2315), imposing specific notice and 'ruin/vice/defect' elements not required for an ordinary negligent-activity claim; both, however, are folded into the same overall duty-risk analysis rather than existing as wholly separate torts.",
      "noticeRule": "Actual or constructive notice of the ruin, vice, or defect is required under Civil Code art. 2317.1, and actual or constructive notice is likewise an express element of the merchant liability statute, La. R.S. 9:2800.6.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": "La. R.S. 9:2800.6",
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Louisiana treats whether a condition is open and obvious as bearing on breach (via the risk-utility balancing test — social utility of the condition, likelihood/magnitude of harm, cost of prevention, and plaintiff's conduct) rather than on the existence of duty; an open-and-obvious condition is not per se non-dangerous, but the obviousness reduces the 'likelihood of harm' factor. Not independently verified with a specific controlling Louisiana Supreme Court citation in this pass — practitioner materials referencing recent Louisiana Supreme Court clarification of this analysis were found, but I could not confirm the exact case name/citation this session and recommend verifying (commonly-cited candidates in this area include Broussard v. State ex rel. Office of State Buildings and more recent Louisiana Supreme Court decisions refining it).",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Louisiana has long recognized attractive nuisance, applying what one law-review source describes as a 'strict test of foreseeability' — liability generally requires the condition be so enticing to children of tender years that it induces them to enter the property to meddle with it. Not independently verified with a specific controlling Louisiana Supreme Court citation in this pass.",
      "negligentSecurityForeseeabilityTest": "Balancing Test (e.g. Ann M.)",
      "negligentSecurityCitation": "Posecai v. Wal-Mart Stores, Inc., 752 So. 2d 762 (La. 1999)",
      "negligentSecurityNote": "Posecai adopted a sliding-scale balancing test weighing the foreseeability of harm against the burden of imposing a security duty: the most important factor is the existence, frequency, and similarity of prior crimes on the premises, but location, nature, and condition of the property also matter. A very high degree of foreseeability is required before a duty to hire security guards will be imposed; a lower degree can still support duties to add lighting, cameras, or similar lower-cost measures.",
      "additionalDefenses": "Louisiana pure comparative fault, Civil Code art. 2323; heightened merchant-liability notice burden under La. R.S. 9:2800.6 (enacted to require plaintiffs prove notice rather than relying on burden-shifting); Louisiana recreational-use immunity statutes, La. R.S. 9:2791 and 9:2795.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Balancing Test"
    },
    "Maine": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "Me. Rev. Stat. tit. 14, § 156",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Tuttle v. Raymond, 494 A.2d 1353 (Me. 1985)",
      "punitiveDamagesCap": "No statutory cap identified.",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland)",
      "visitorClassificationCitation": null,
      "visitorClassificationNote": "Maine has abolished the invitee/licensee distinction for lawful visitors, applying a single reasonable-care standard; trespassers remain a distinct, lower-duty category subject to the attractive-nuisance exception for children. Not independently verified in this pass: secondary sources describe this as a legislative abolition, but I could not confirm the specific Maine statute (as opposed to case law, commonly attributed in practice materials to Poulin v. Colby College, 402 A.2d 846 (Me. 1979)) — this distinction (statute vs. common law origin) should be confirmed before publication.",
      "elementsToProve": [
        "Defendant possessed/controlled the premises",
        "A dangerous condition existed",
        "Defendant knew or should have known of the condition",
        "Defendant failed to exercise reasonable care under the circumstances to remedy or warn of the condition",
        "Causation and damages"
      ],
      "elementsCitation": null,
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified for Maine in this research pass; no authority was located either affirming or denying a Texas-style separate 'premises condition' cause of action distinct from ordinary negligent-activity claims.",
      "noticeRule": "Actual or constructive notice generally required, but courts have signaled the analysis is fact-intensive and rarely resolved on summary judgment.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Maine courts have significantly limited the open-and-obvious defense: obviousness may negate the duty to warn, but does NOT necessarily negate the duty to remedy the hazard, and the defense fails where a visitor was likely to be distracted, unable to avoid the danger (e.g., no alternate route), or where the owner should otherwise have expected the danger to be encountered despite its obviousness. Not independently verified with a specific controlling Maine Law Court citation in this pass.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Maine recognizes an attractive-nuisance exception to the general trespasser no-duty rule, generally following the Restatement (Second) §339 elements. Not independently verified with a specific controlling Maine Law Court citation in this pass.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for Maine",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Maine — searches returned only generic marketing/secondary-source material with no controlling Maine appellate case identified in this pass.",
      "additionalDefenses": "Maine recreational/harvesting-use immunity statute, 14 M.R.S. §159-A — broadly bars liability to recreational or harvesting users (hunting, fishing, hiking, biking, and many other listed activities) regardless of whether permission was granted, subject to exceptions for willful/malicious failure to warn, commercial-recreation premises, and situations where consideration was paid for access.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": null
    },
    "Maryland": {
      "faultRule": "Pure Contributory",
      "faultRuleCitation": "Maryland common law (judicially retained -- reaffirmed by the Court of Appeals in Coleman v. Soccer Ass'n of Columbia, 432 Md. 679 (2013))",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Owens-Illinois, Inc. v. Zenobia, 325 Md. 420 (1992)",
      "punitiveDamagesCap": "No statutory cap identified for punitive damages specifically (Maryland does cap NON-ECONOMIC compensatory damages in personal injury cases generally, which is a different figure -- do not conflate the two).",
      "note": "One of only 5 pure contributory jurisdictions; Maryland's high court has expressly declined multiple invitations to abandon the rule.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": null,
      "visitorClassificationNote": "Maryland actually recognizes four categories, not three: invitee/business invitee, licensee by invitation (social guest), bare licensee, and trespasser — each with its own duty (ordinary care; warn of known non-obvious dangers; refrain from willful/wanton conduct and creating new undisclosed dangers; and refrain from willful/wanton injury/entrapment, respectively). Not independently verified with a single controlling Maryland appellate citation for the classification framework itself in this pass.",
      "elementsToProve": [
        "Plaintiff's status (invitee / licensee by invitation / bare licensee / trespasser)",
        "Existence of a dangerous condition",
        "Defendant's actual or constructive knowledge of the condition, gained in time to remove it or warn of it",
        "Breach of the duty owed to that status",
        "Causation and damages"
      ],
      "elementsCitation": "Deering Woods Condominium Ass'n v. Spoon, 377 Md. 250, 833 A.2d 17 (2003) (adopting Restatement (Second) of Torts §343 framework and actual/constructive notice standard)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified for Maryland in this research pass; no authority was located either affirming or denying a Texas-style separate 'premises condition' cause of action distinct from ordinary negligent-activity claims.",
      "noticeRule": "Plaintiff must show actual or constructive knowledge of the dangerous condition, gained in sufficient time to have given the owner/occupier an opportunity to remove it or warn of it (Deering Woods Condominium Ass'n v. Spoon, 377 Md. 250 (2003)).",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": "Deering Woods Condominium Ass'n v. Spoon, 377 Md. 250, 833 A.2d 17 (2003)",
      "openAndObviousDoctrine": "Traditional No-Duty Bar",
      "openAndObviousCitation": "Arrow Parking Corp. v. Cade",
      "openAndObviousNote": "Maryland's rule is unusually strong compared to most Restatement-343A states: there is generally no duty to warn of an open or obvious danger at all. Because Maryland is also one of the very few remaining pure contributory-negligence jurisdictions, an open-and-obvious hazard functions, in practice, as a recharacterized assumption-of-risk / contributory-negligence bar — any degree of plaintiff fault (including knowingly and voluntarily encountering an obvious danger) can completely bar recovery, unlike states where obviousness only reduces damages proportionally. I have only medium confidence in the specific 'Arrow Parking Corp. v. Cade' citation, drawn from a single secondary-source reference — verify before publication.",
      "attractiveNuisanceDoctrine": "Rejected/Not recognized",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Maryland is one of the few states whose courts have repeatedly declined to adopt the attractive nuisance doctrine, holding property owners to no higher duty toward trespassing children than toward adult trespassers (though a duty can still arise where a hazard violates a specific safety statute/regulation). Multiple independent practitioner sources confirm this rejection, but I could not confirm a single controlling case citation in this pass — recommend verifying before publication.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Hemmings v. Pelham Wood Ltd. Liability Ltd. Partnership, 375 Md. 522, 826 A.2d 443 (2003)",
      "negligentSecurityNote": "Hemmings holds a landlord may owe a duty to prevent a foreseeable third-party criminal attack where: (1) the landlord controlled the dangerous/defective condition; (2) the landlord knew or should have known of the condition; and (3) the harm suffered was a foreseeable result of that condition. Courts assess the adequacy of security against the foreseeable risk at that specific property rather than an industry-wide standard.",
      "additionalDefenses": "Maryland's pure contributory negligence rule (any percentage of plaintiff fault bars recovery entirely) — the single most important state-specific defense-side fact for Maryland premises cases; assumption of risk as a related, overlapping defense; Maryland recreational-use statute, Md. Code, Nat. Res. §5-1101 et seq.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Massachusetts": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Mass. Gen. Laws ch. 231, § 85",
      "punitiveDamagesStandard": "STATUTE-ONLY -- Massachusetts common law does not generally recognize punitive damages in ordinary tort claims; they are available only where a specific statute authorizes them (e.g., wrongful death, consumer protection).",
      "punitiveDamagesCap": "Not generally applicable given the statute-only availability rule above.",
      "note": "Confirm at the outset whether any Massachusetts statute actually authorizes punitive damages on the specific claim theory pled.",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland-style merger)",
      "visitorClassificationCitation": "Mounsey v. Ellard, 363 Mass. 693, 297 N.E.2d 43 (1973)",
      "visitorClassificationNote": "Mounsey abolished the invitee/licensee distinction for lawful entrants and imposes a single duty of reasonable care under the circumstances on possessors of land toward all lawful visitors. Trespassers are expressly excluded from this merger and remain owed only a duty to refrain from willful, wanton, or reckless conduct, per Schofield v. Merrill, 386 Mass. 244 (1982) (with the child-trespasser/attractive-nuisance exception below).",
      "elementsToProve": [
        "Defendant owed plaintiff a duty of reasonable care (as a lawful entrant, or the limited willful/wanton duty if a trespasser)",
        "Defendant breached that duty by failing to maintain the premises in reasonably safe condition, failing to warn of a hazard, or failing to remedy a dangerous condition it knew or should have known about",
        "Causation - the breach was the proximate cause of plaintiff's injury",
        "Damages"
      ],
      "elementsCitation": "Mounsey v. Ellard, 363 Mass. 693 (1973); standard negligence formulation applied in the premises context, e.g., Papadopoulos v. Target Corp., 457 Mass. 368 (2010)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Massachusetts does not draw a Keetch-style categorical line between a 'condition' claim and an 'activity' claim. Since Mounsey, premises-based injury claims are analyzed as ordinary negligence with a possessor's duty of reasonable care under the circumstances; there is no separate substantive doctrine requiring plaintiffs to elect between 'premises liability' and 'negligent activity' theories as in Texas.",
      "noticeRule": "For a hazardous-condition claim, plaintiff must show the possessor had actual notice of the dangerous condition or that it existed long enough (constructive notice) that reasonable inspection would have discovered it. See general application in Papadopoulos v. Target Corp., 457 Mass. 368 (2010), and prior snow/ice and slip-and-fall case law.",
      "modeOfOperationRuleAdopted": true,
      "modeOfOperationCitation": "Sheehan v. Roche Bros. Supermarkets, Inc., 448 Mass. 780, 863 N.E.2d 1276 (2007)",
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "O'Sullivan v. Shaw, 431 Mass. 201 (2000); Papadopoulos v. Target Corp., 457 Mass. 368 (2010)",
      "openAndObviousNote": "Massachusetts follows Restatement Sec. 343A: a landowner generally has no duty to warn of a danger that is open and obvious to a person of ordinary perception and judgment (O'Sullivan, diving-board case), but retains a duty to remedy the condition (not merely warn) if the landowner can and should anticipate that the danger will cause physical harm despite its obviousness (e.g., because entrants' attention may be distracted, or the risk is one entrants may unreasonably decide to encounter). A hazard that could not have been discovered by reasonable inspection generally creates no liability at all (no notice); one that should have been discovered (constructive notice) can support liability even if not obvious; one that is truly obvious shifts the analysis to Sec. 343A's foreseeability-despite-obviousness inquiry rather than automatically barring the claim.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Soule v. Massachusetts Electric Co., 378 Mass. 177 (1979)",
      "attractiveNuisanceNote": "Massachusetts applies the Restatement Second Sec. 339 factors for child trespassers encountering artificial conditions, requiring proof the possessor knew or should have known children were likely to trespass and that the risk was one children would not appreciate.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Whittaker v. Saraceno, 418 Mass. 196 (1994)",
      "negligentSecurityNote": "A landlord or commercial possessor owes a duty to guard against foreseeable criminal acts of third parties, but foreseeability requires evidence the possessor had reason to know of a specific threat or a pattern giving rise to reasonably foreseeable danger - general awareness that crime happens in the area is not enough. In Whittaker itself, the court found the particular assault was not foreseeable on the evidence presented.",
      "additionalDefenses": "Massachusetts recreational use statute, G.L. c. 21, Sec. 17C, limits liability of landowners who permit free public recreational use of their land to willful, wanton, or reckless conduct. Massachusetts also abolished the natural/unnatural snow-and-ice-accumulation distinction in Papadopoulos v. Target Corp. (2010), folding snow/ice claims into the ordinary reasonable-care framework.",
      "researchConfidence": "high",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Michigan": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Mich. Comp. Laws § 600.2959",
      "punitiveDamagesStandard": "STATUTE-ONLY -- Michigan does not generally allow common-law punitive/exemplary damages in ordinary tort claims; Michigan's 'exemplary damages' doctrine instead compensates the plaintiff for mental anguish/humiliation caused by the defendant's conduct, a different and more limited concept than punishment-oriented punitive damages elsewhere.",
      "punitiveDamagesCap": "Not generally applicable given the statute-only/different-doctrine structure above.",
      "note": "Do not assume a 'typical' punitive-damages theory transfers to Michigan without adjustment -- the doctrinal structure itself is different, not just the cap.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Stitt v. Holland Abundant Life Fellowship, 462 Mich. 591 (2000)",
      "visitorClassificationNote": "Michigan retains the traditional three-way classification and, unlike the Restatement Second Sec. 332, rejects a 'public invitee' category not tied to pecuniary/business benefit - Stitt narrowed invitee status to require that the visitor's presence confer a commercial or business benefit on the possessor. Social guests are licensees, owed only a duty to warn of known hidden dangers.",
      "elementsToProve": [
        "Plaintiff's status on the land (invitee, licensee, or trespasser), which fixes the scope of duty",
        "Existence of a dangerous condition on the land that posed an unreasonable risk of harm",
        "Possessor's actual or constructive notice of the condition (unless the possessor created it)",
        "Breach of the applicable duty (reasonable care for invitees; warning of known hidden dangers for licensees; refrain from wanton/willful injury for trespassers)",
        "Causation and damages"
      ],
      "elementsCitation": "Stitt v. Holland Abundant Life Fellowship, 462 Mich. 591 (2000); Clark v. Kmart Corp., 465 Mich. 141 (2001)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": true,
      "premisesLiabilityDistinctNote": "Michigan draws this distinction sharply. Under Buhalis v. Trinity Continuing Care Services, 296 Mich. App. 685 (2012), if the injury arose from a condition of the land, the claim sounds in premises liability - even if pled as ordinary negligence and even if the possessor 'created' the condition - and is governed by premises-liability notice/duty rules rather than general negligence rules. An ordinary-negligence theory survives only for the possessor's own contemporaneous overt acts.",
      "noticeRule": "Plaintiff must prove the premises possessor had actual notice of the dangerous condition, or that the condition existed for a sufficient length of time (or was of such a character) that the possessor should have discovered it through reasonable inspection (constructive notice).",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": "Kandil-Elsayed v. F & E Oil, Inc., 512 Mich. 95 (2023), overruling Lugo v. Ameritech Corp., 464 Mich. 512 (2001)",
      "openAndObviousNote": "Michigan underwent a major 2023 shift. Previously (Lugo), an open and obvious danger was treated as negating the possessor's duty altogether unless 'special aspects' made it unreasonably dangerous despite its obviousness. In July 2023, Kandil-Elsayed overruled that duty-based approach, holding the open-and-obvious character of a condition is instead relevant to breach and to the plaintiff's comparative fault, not to whether a duty exists at all - moving Michigan into a comparative-fault framework similar to many other states. A hazard that could not have been discovered supports notice-based liability if it should have been found by reasonable inspection; a truly obvious hazard no longer automatically defeats the claim but can reduce or bar recovery under comparative fault.",
      "attractiveNuisanceDoctrine": "Adopted with modifications (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Pippin v. Atallah, 245 Mich. App. 136 (2001); see also Rosario v. City of Lansing, 403 Mich. 124 (1978)",
      "attractiveNuisanceNote": "Michigan applies Restatement Sec. 339's factors for artificial conditions dangerous to trespassing children, but does not require that the condition itself have lured the child onto the property - only that the possessor knew or should have known children were likely to trespass and encounter an unappreciated risk.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances (with a narrow 'specific-relationship/responsive-duty' limitation)",
      "negligentSecurityCitation": "MacDonald v. PKT, Inc., 464 Mich. 322 (2001)",
      "negligentSecurityNote": "Michigan holds a merchant's duty regarding third-party criminal acts is generally limited to responding reasonably to situations occurring on the premises (e.g., summoning help), rather than a freestanding duty to anticipate and prevent crime through security measures based on foreseeability alone; MacDonald narrowed pre-existing foreseeability-based negligent-security law significantly.",
      "additionalDefenses": "Michigan's no-fault auto insurance scheme and governmental immunity (MCL 691.1407) intersect with many premises claims against public entities; the state also applies the 'fireman's rule' limiting recovery by first responders for risks inherent in their duties.",
      "researchConfidence": "high",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Minnesota": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Minn. Stat. § 604.01",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Minn. Stat. § 549.20",
      "punitiveDamagesCap": "No statutory cap identified.",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland-style merger)",
      "visitorClassificationCitation": "Peterson v. Balach, 294 Minn. 161, 199 N.W.2d 639 (1972)",
      "visitorClassificationNote": "Peterson abolished the invitee/licensee distinction and imposes a general duty of reasonable care under the circumstances on possessors toward lawful entrants, with the scope of the duty varying by the expected use of the land. The court expressly declined to decide the trespasser question in Peterson itself; Minnesota courts continue to apply a reduced (willful/wanton) duty to trespassers generally, subject to the attractive-nuisance exception for children.",
      "elementsToProve": [
        "Duty of reasonable care owed to the entrant under the circumstances",
        "Breach - possessor failed to use reasonable care to inspect, maintain, repair, or warn",
        "Proximate cause",
        "Damages"
      ],
      "elementsCitation": "Peterson v. Balach, 294 Minn. 161 (1972); Louis v. Louis, 636 N.W.2d 314 (Minn. 2001)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Minnesota treats premises-based injury claims as a species of ordinary negligence governed by the unified reasonable-care standard rather than a categorically separate cause of action; there is no Keetch-style pleading election between 'premises' and 'activity' theories.",
      "noticeRule": "Actual or constructive notice of the dangerous condition is required unless the possessor's own conduct created the hazard; constructive notice turns on whether the condition existed long enough that reasonable inspection would have revealed it.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Louis v. Louis, 636 N.W.2d 314 (Minn. 2001)",
      "openAndObviousNote": "Minnesota follows the Restatement Sec. 343A approach: a landowner is not liable to entrants for physical harm caused by known or obvious dangers unless the landowner should anticipate the harm despite the obviousness. The obviousness of a condition bears on breach and comparative fault rather than automatically eliminating the duty of reasonable care recognized in Peterson v. Balach.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Minnesota case law and secondary sources confirm application of Restatement Sec. 339-style attractive-nuisance principles (e.g., for swimming pools and similar artificial conditions attractive to children), but a single controlling modern Minnesota Supreme Court citation was not independently verified in this pass - flagged as medium confidence.",
      "negligentSecurityForeseeabilityTest": "Balancing Test (special-relationship / foreseeability balancing)",
      "negligentSecurityCitation": "Erickson v. Curtis Investment Co., 447 N.W.2d 165 (Minn. 1989)",
      "negligentSecurityNote": "Minnesota asks whether a special relationship existed such that the plaintiff entrusted safety to the possessor and the possessor accepted that entrustment, and separately whether the specific type of harm was foreseeable; in Erickson, the court held foreseeability of a sexual assault in a parking ramp was a jury question based on the totality of the security failures and circumstances shown.",
      "additionalDefenses": "Minnesota's comparative fault statute (Minn. Stat. Sec. 604.01) bars recovery where plaintiff's fault exceeds defendant's; Minnesota also has a recreational-use immunity statute (Minn. Stat. Sec. 604A.20 et seq.) limiting liability for landowners who permit free recreational access.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Balancing Test"
    },
    "Mississippi": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "Miss. Code § 11-7-15",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Miss. Code § 11-1-65",
      "punitiveDamagesCap": "Tiered cap based on the defendant's net worth, ranging from $20 million down to $2 million as net worth decreases (small businesses/individuals below a statutory net-worth floor may face no cap at all in some formulations) -- Miss. Code § 11-1-65(3)(a)",
      "note": "Mississippi's net-worth-tiered structure is unusual and should be confirmed against the current statute for the specific defendant's financial profile rather than assumed from a single flat figure.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Little by Little v. Bell, 719 So. 2d 757 (Miss. 1998); trespasser duty now codified at Miss. Code Ann. Sec. 95-5-31",
      "visitorClassificationNote": "Mississippi has repeatedly been asked to abolish the tripartite classification in favor of a unified reasonable-care standard and has declined to do so; the classification is applied with numerous fact-specific exceptions (e.g., a licensee who becomes an invitee for parts of a visit). In 2016 the legislature codified the trespasser standard and definition at Sec. 95-5-31.",
      "elementsToProve": [
        "Plaintiff's status (invitee/licensee/trespasser) determines the duty owed",
        "Existence of a dangerous condition and the possessor's actual or constructive knowledge of it (for invitee hazard claims)",
        "Breach of the duty appropriate to that status",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Little by Little v. Bell, 719 So. 2d 757 (Miss. 1998); Downs v. Choo, 656 So. 2d 84 (Miss. 1995)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Mississippi does not enforce a rigid Keetch-style separation between a 'condition' claim and an 'activity' claim; premises cases are analyzed within the traditional status-based negligence framework rather than as a wholly separate cause of action requiring an election of theories.",
      "noticeRule": "For invitees, plaintiff must show the possessor had actual knowledge of the dangerous condition or that the condition existed long enough that the possessor should have discovered it through reasonable care (constructive notice); Mississippi has rejected treating merchants as insurers of invitee safety.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": "Wal-Mart Stores, Inc. v. Littleton, 822 So. 2d 1024 (Miss. 2002) (declining to treat store as insurer; requiring proof beyond mere occurrence of harm)",
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": "Tharp v. Bunge Corp., 641 So. 2d 20 (Miss. 1994)",
      "openAndObviousNote": "Tharp abolished the open-and-obvious rule as a complete bar to recovery, holding it instead operates only as a comparative-negligence factor under Miss. Code Ann. Sec. 11-7-15. A possessor can no longer escape all liability merely because a hazard was visible; it must still take reasonable steps to alleviate known dangers, with the plaintiff's own fault in encountering an obvious hazard reducing (not eliminating) recovery.",
      "attractiveNuisanceDoctrine": "Adopted with modifications (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Keith v. Peterson, 922 So. 2d 4 (Miss. Ct. App. 2005); see also Miss. Code Ann. Sec. 95-5-31(3) (statutory child-trespasser exception)",
      "attractiveNuisanceNote": "Mississippi requires proof the possessor knew or should have known of the dangerous artificial condition and that children frequented the area, that the child could not appreciate the risk, and that the burden of correction was slight relative to the risk; the child need not have been literally attracted onto the property by the condition itself.",
      "negligentSecurityForeseeabilityTest": "Specific Harm Rule (\"atmosphere of violence\" test)",
      "negligentSecurityCitation": "Gatewood v. Sampson, 812 So. 2d 212 (Miss. 2002)",
      "negligentSecurityNote": "Mississippi expressly rejected a broad totality-of-the-circumstances test as approaching strict liability, instead requiring proof of either (1) actual/constructive knowledge of the particular assailant's violent tendencies, or (2) actual/constructive knowledge that an 'atmosphere of violence' existed on or near the premises, assessed via the pattern and frequency of prior criminal activity in the vicinity and on the premises itself (as in Doe v. Jameson Inn, Inc., 56 So. 3d 549 (Miss. 2011), a related foreseeability case).",
      "additionalDefenses": "Mississippi's Landowners Protection statute, Miss. Code Ann. Sec. 95-5-31, limits duty to trespassers to refraining from willful/wanton injury (with a discovered-peril and child-trespasser exception) and expressly preserves other common-law immunities and defenses.",
      "researchConfidence": "high",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Specific Harm Rule"
    },
    "Missouri": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "Gustafson v. Benda, 661 S.W.2d 11 (Mo. 1983)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Mo. Rev. Stat. § 510.263",
      "punitiveDamagesCap": "NOT INDEPENDENTLY VERIFIED -- one secondary source reported a specific cap (greater of $500,000 or 5x the net judgment) while another reported no cap at all; Missouri's punitive-damages cap statute has also had a genuinely complicated litigation history (a prior cap was held unconstitutional by the Missouri Supreme Court in Lewellen v. Franklin, 441 S.W.3d 136 (2014), as applied to common-law claims). Confirm current, binding law before relying on any specific figure.",
      "note": "",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Carter v. Kinney, 896 S.W.2d 926 (Mo. 1995)",
      "visitorClassificationNote": "Carter v. Kinney defines invitee status narrowly as requiring an invitation for a purpose connected with the possessor's business or that confers a mutual benefit; a social guest, even one invited to attend a Bible study at a private home, is a licensee, not an invitee, entitled only to a duty to warn of known hidden dangers.",
      "elementsToProve": [
        "Plaintiff's status on the land (invitee, licensee, or trespasser)",
        "A dangerous condition existed on the premises that posed an unreasonable risk of harm",
        "The possessor knew or by using ordinary care should have known of the condition (actual/constructive notice)",
        "The possessor should have realized the danger and failed to use ordinary care to remove it or warn of it",
        "Plaintiff's damages were caused by the failure to warn or remedy"
      ],
      "elementsCitation": "Harris v. Niehaus, 857 S.W.2d 222 (Mo. 1993); Carter v. Kinney, 896 S.W.2d 926 (Mo. 1995)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Missouri does not impose a rigid Keetch-style requirement that plaintiffs elect between premises-liability and ordinary-negligence theories; premises claims are analyzed under the status-based duty framework as a branch of negligence law, with status and notice folded into the standard negligence elements.",
      "noticeRule": "Plaintiff must show the possessor had actual knowledge of the dangerous condition, or that it existed for a length of time sufficient that the possessor, exercising ordinary care, should have discovered and remedied it (constructive notice).",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Traditional No-Duty Bar (with Restatement Sec. 343A-style foreseeability exception recognized in some appellate decisions)",
      "openAndObviousCitation": "Harris v. Niehaus, 857 S.W.2d 222 (Mo. 1993); see also Rapp v. Eagle Plumbing, Inc., 440 S.W.3d 519 (Mo. Ct. App. 2014)",
      "openAndObviousNote": "Missouri courts generally hold a possessor owes no duty to warn of a danger that is open and obvious as a matter of law to a reasonable invitee, though appellate decisions recognize a possessor may still be liable if it should have anticipated harm despite the obviousness (Restatement Sec. 343A logic). Not independently verified to full certainty in this research pass which single case is the definitive statewide statement of the 343A exception - flagged medium confidence on that narrower point.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Arbogast v. Terminal Railroad Ass'n of St. Louis, 452 S.W.2d 81 (Mo. 1970)",
      "attractiveNuisanceNote": "Missouri applies the Restatement Sec. 339 factors to hold possessors liable for artificial conditions dangerous to trespassing children where the possessor knew or should have known children were likely to trespass and would not appreciate the risk.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "L.A.C. v. Ward Parkway Shopping Center Co., 75 S.W.3d 247 (Mo. 2002); Faheen v. City Parking Corp., 734 S.W.2d 270 (Mo. Ct. App. 1987)",
      "negligentSecurityNote": "Missouri's Supreme Court in L.A.C. v. Ward Parkway adopted a totality-of-the-circumstances approach to foreseeability of third-party criminal acts (considering prior incidents, nature of the business, location, and other factors) rather than requiring identical prior similar incidents, building on the Court of Appeals' earlier foreseeability analysis in Faheen.",
      "additionalDefenses": "Missouri applies pure comparative fault; out-of-possession landlords generally owe reduced duties absent retained control over the defective area; Missouri also recognizes the 'fireman's rule' limiting recovery for on-duty first responders injured by the very hazard they were summoned to address.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Montana": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Mont. Code Ann. § 27-1-702",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Mont. Code Ann. § 27-1-221",
      "punitiveDamagesCap": "Lesser of $10 million or 3% of the defendant's net worth -- Mont. Code Ann. § 27-1-220",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland-style merger)",
      "visitorClassificationCitation": "Richardson v. Corvallis Public School District No. 1, 286 Mont. 309, 950 P.2d 748 (1997)",
      "visitorClassificationNote": "Montana adopted a general duty of reasonable care owed by possessors of land to all lawful entrants, moving away from the rigid invitee/licensee split. Trespassers continue to be treated separately under a reduced (willful/wanton) duty standard, subject to the attractive-nuisance exception for children discussed below.",
      "elementsToProve": [
        "Duty of reasonable care owed under the circumstances (or, for trespassers, a duty to refrain from willful/wanton injury)",
        "Breach - failure to exercise reasonable care in inspecting, maintaining, or warning of a dangerous condition",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Richardson v. Corvallis Public School District No. 1, 950 P.2d 748 (Mont. 1997)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Montana does not apply a Keetch-style categorical separation between condition-based premises claims and activity-based negligence claims; both are analyzed under the unified reasonable-care negligence framework.",
      "noticeRule": "Plaintiff must generally show the possessor had actual or constructive notice of the dangerous condition (i.e., it existed long enough, or was of a character, that reasonable inspection would have revealed it) absent proof the possessor created the condition. See, e.g., Knutson v. Barbour, 266 Mont. 170, 879 P.2d 696 (1994) (slip-and-fall analysis).",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — described here as the general modern rule; the single controlling Montana Supreme Court statement of this exact framework was not pinned down with full confidence in this research pass",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Montana case law (e.g., Steichen v. Talcott Properties, LLC, 2013 MT 2; Willden v. Neumann, 2008 MT 236) addresses open-and-obvious-type premises disputes, but a single definitive Montana Supreme Court holding squarely adopting Restatement Sec. 343A's 'anticipate harm despite obviousness' rule was not independently confirmed with a verified pin-cite in this pass — flagged as not fully independently verified; treat as medium/low confidence pending direct opinion review.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Limberhand v. Big Ditch Co., 218 Mont. 132, 706 P.2d 491 (1985); see also Mascarenas v. Booth, 174 Mont. 11, 568 P.2d 182 (1977)",
      "attractiveNuisanceNote": "Montana applies the Restatement Sec. 339(b) factors for artificial conditions dangerous to trespassing children, considering whether the possessor knew or should have known of both the likelihood of child trespass and the danger.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Saucier ex rel. Mallory v. McDonald's Restaurants of Montana, Inc., 2008 MT 63, 342 Mont. 29, 179 P.3d 481",
      "negligentSecurityNote": "Montana courts evaluate foreseeability of third-party criminal conduct based on the totality of surrounding circumstances rather than requiring identical prior incidents; the exact contours of Montana's test were not exhaustively verified against the full opinion text in this pass (medium confidence).",
      "additionalDefenses": "Montana's recreational-use statute (Mont. Code Ann. Sec. 70-16-302) limits liability for landowners who allow public recreational access without charge.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Nebraska": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "Neb. Rev. Stat. § 25-21,185.09",
      "punitiveDamagesStandard": "PROHIBITED -- Nebraska's constitution has been construed to bar punitive damages entirely (Miller v. Kingsley, 194 Neb. 123 (1975), and subsequent case law).",
      "punitiveDamagesCap": "Not applicable -- punitive damages are unavailable in Nebraska regardless of the conduct alleged.",
      "note": "GENUINE OUTLIER: do not plead or model any punitive-damages exposure for a Nebraska premises-liability matter, no matter how egregious the underlying facts.",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland-style merger)",
      "visitorClassificationCitation": "Heins v. Webster County, 250 Neb. 750, 552 N.W.2d 51 (1996)",
      "visitorClassificationNote": "Heins abolished the invitee/licensee distinction and established a duty of reasonable care owed to all lawful (nontrespassing) visitors, with the possessor's precautions to be judged by the foreseeability of the visit and the risk involved rather than by rigid status labels. A related unified-duty case is Aguallo v. City of Scottsbluff, 267 Neb. 801, 678 N.W.2d 82 (2004).",
      "elementsToProve": [
        "Duty of reasonable care owed to the entrant under the circumstances",
        "A dangerous condition existed that created an unreasonable risk of harm",
        "The possessor knew or through reasonable care should have known of the condition (notice)",
        "The possessor failed to use reasonable care to protect against the danger",
        "Causation and damages"
      ],
      "elementsCitation": "Heins v. Webster County, 552 N.W.2d 51 (Neb. 1996); Aguallo v. City of Scottsbluff, 678 N.W.2d 82 (Neb. 2004)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Nebraska does not maintain a Keetch-style separate cause of action for premises conditions versus activities; both fall within the unified reasonable-care negligence standard established in Heins.",
      "noticeRule": "Plaintiff must show actual notice or constructive notice (the condition existed long enough, or was of a character, that reasonable inspection would have disclosed it) unless the possessor created the condition.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": "Edwards v. Hy-Vee, Inc., 294 Neb. 237, 883 N.W.2d 40 (2016) (discussing constructive notice in the self-service retail context)",
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — general modern rule; not independently pinned to a single confirmed Nebraska holding in this pass",
      "openAndObviousCitation": "Sundermann v. Hy-Vee, Inc., 306 Neb. 749, 947 N.W.2d 492 (2020) (cited by secondary sources as a leading modern open-and-obvious decision; full holding text not independently confirmed here)",
      "openAndObviousNote": "Nebraska case law addresses open and obvious hazards in the context of the unified reasonable-care duty from Heins, generally treating obviousness as bearing on breach/comparative negligence rather than as an automatic bar, consistent with most modern jurisdictions - but the precise Nebraska formulation was not independently verified against full opinion text in this research pass (medium confidence).",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Wiles v. Metzger, 238 Neb. 943, 473 N.W.2d 113 (1991)",
      "attractiveNuisanceNote": "Nebraska applies the Restatement Sec. 339 factors to child trespassers encountering artificial conditions on land, requiring proof the possessor knew or should have known of both the risk of child trespass and the danger involved.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Erichsen v. No-Frills Supermarkets of Omaha, Inc., 246 Neb. 238, 518 N.W.2d 116 (1994)",
      "negligentSecurityNote": "Nebraska rejected a strict prior-similar-incidents requirement in favor of examining the totality of circumstances (location, nature of business, patterns of criminal activity) to determine whether a possessor knew or should have known of an unreasonable risk of third-party criminal conduct.",
      "additionalDefenses": "Nebraska's recreational liability statute (Neb. Rev. Stat. Sec. 37-729 et seq.) limits duties owed to those using land for recreational purposes without charge.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Nevada": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Nev. Rev. Stat. § 41.141",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Nev. Rev. Stat. § 42.005",
      "punitiveDamagesCap": "NOT INDEPENDENTLY VERIFIED -- secondary sources disagree on whether Nevada caps punitive damages at all (one source reported no cap; another reported a $300,000-or-3x formula tied to the size of the compensatory award). Confirm current, binding statutory text (Nev. Rev. Stat. § 42.005) before relying on a specific figure.",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland-style merger)",
      "visitorClassificationCitation": "Moody v. Manny's Auto Repair, 110 Nev. 320, 871 P.2d 935 (1994)",
      "visitorClassificationNote": "Nevada merged the invitee and licensee categories into a single duty of reasonable care under the circumstances. Trespassers remain subject to a separate, more limited duty (refrain from willful/wanton injury), subject to the attractive-nuisance exception for children.",
      "elementsToProve": [
        "Duty of reasonable care owed to the entrant",
        "A dangerous condition existed on the premises",
        "The possessor had actual or constructive notice of the condition (or created it)",
        "Breach of the duty to remedy or warn",
        "Causation and damages"
      ],
      "elementsCitation": "Moody v. Manny's Auto Repair, 871 P.2d 935 (Nev. 1994); Foster v. Costco Wholesale Corp., 128 Nev. 773, 291 P.3d 150 (2012)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Nevada does not enforce a Keetch-style separate premises-liability cause of action distinct from ordinary negligence; premises claims are analyzed under the unified reasonable-care negligence standard from Moody.",
      "noticeRule": "Plaintiff must show the possessor had actual knowledge of the hazardous condition or that it existed long enough that the possessor should have discovered it through reasonable inspection.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": "Foster v. Costco Wholesale Corp., 291 P.3d 150 (Nev. 2012) (addressing constructive notice in a self-service/warehouse-aisle setting)",
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Foster v. Costco Wholesale Corp., 128 Nev. 773, 291 P.3d 150 (2012)",
      "openAndObviousNote": "In Foster, the Nevada Supreme Court held that the open and obvious nature of a hazard (a pallet in a warehouse aisle) does not automatically defeat a premises liability claim where the possessor should still have anticipated harm - consistent with the Restatement Sec. 343A approach - rather than applying an absolute no-duty bar.",
      "attractiveNuisanceDoctrine": "Adopted with modifications (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Kimberlin v. Lear, 88 Nev. 492, 500 P.2d 1022 (1972)",
      "attractiveNuisanceNote": "Nevada recognizes attractive-nuisance-type liability for artificial conditions dangerous to child trespassers consistent with Restatement Sec. 339 principles; note that in Kimberlin itself the attractive-nuisance argument appeared in a dissent rather than unambiguously in the majority holding, so practitioners should confirm current application against more recent Nevada authority.",
      "negligentSecurityForeseeabilityTest": "Balancing Test (multi-factor foreseeability analysis)",
      "negligentSecurityCitation": "Estate of Smith ex rel. Smith v. Mahoney's Silver Nugget, Inc., 127 Nev. 855, 265 P.3d 688 (2011)",
      "negligentSecurityNote": "Nevada's Supreme Court clarified that duty in negligent-security cases turns on a multifaceted foreseeability analysis, refining earlier precedent from Doud v. Las Vegas Hilton Corp., 109 Nev. 1096, 864 P.2d 796 (1993); Nevada also has a statute (NRS 651.015) that limits innkeeper liability for guest injuries from criminal acts of third parties absent specified conditions, which interacts with the common-law foreseeability analysis.",
      "additionalDefenses": "NRS 651.015 limits hotel/motel/innkeeper liability for third-party criminal acts to specific circumstances (e.g., failure to provide adequate security after notice of danger); Nevada also recognizes recreational-use immunity under NRS 41.510.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Balancing Test"
    },
    "New Hampshire": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "N.H. Rev. Stat. § 507:7-d",
      "punitiveDamagesStandard": "PROHIBITED -- N.H. Rev. Stat. § 507:16 bars punitive damages in civil actions generally, subject to narrow statutory exceptions elsewhere in the code.",
      "punitiveDamagesCap": "Not applicable -- punitive damages are unavailable in New Hampshire in an ordinary premises-liability action.",
      "note": "GENUINE OUTLIER, statutory rather than constitutional -- confirm no narrow statutory exception applies before ruling out a punitive theory entirely.",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland-style merger)",
      "visitorClassificationCitation": "Ouellette v. Blanchard, 116 N.H. 552, 364 A.2d 631 (1976)",
      "visitorClassificationNote": "Ouellette merged the licensee and invitee categories into a single duty of reasonable care under all the circumstances. The majority opinion left the treatment of trespassers for a later case; New Hampshire continues to treat trespassers separately (limited to a willful/wanton duty), subject to the child-trespasser/attractive-nuisance exception.",
      "elementsToProve": [
        "Duty of reasonable care owed to the entrant under the circumstances",
        "Breach - failure to exercise reasonable care in maintaining the premises or warning of a hazard",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Ouellette v. Blanchard, 364 A.2d 631 (N.H. 1976)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "New Hampshire does not apply a Keetch-style separate premises-liability cause of action; premises-condition claims are analyzed under the unified reasonable-care negligence standard established in Ouellette.",
      "noticeRule": "Plaintiff must generally show the possessor had actual or constructive notice of the dangerous condition (i.e., the condition existed for a sufficient time, or was of a character, that reasonable inspection would have disclosed it), unless the possessor's own conduct created the hazard.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — general characterization; not independently pinned to full opinion text in this pass",
      "openAndObviousCitation": "Rallis v. Demoulas Super Markets, Inc., 159 N.H. 95, 977 A.2d 527 (2009)",
      "openAndObviousNote": "New Hampshire treats obviousness of a hazard as relevant to the reasonable-care analysis rather than as an automatic bar to a premises claim, generally consistent with the Restatement Sec. 343A approach followed elsewhere in New England, though the precise holding language of Rallis was not independently confirmed against full opinion text here (medium confidence).",
      "attractiveNuisanceDoctrine": "Adopted with modifications (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Labore ex rel. Labore v. Davison Construction Co., 101 N.H. 123, 135 A.2d 591 (1957)",
      "attractiveNuisanceNote": "New Hampshire recognizes heightened duties toward child trespassers encountering artificial conditions consistent with the general Restatement Sec. 339 framework; Labore is an older foundational case and practitioners should confirm against more recent New Hampshire appellate authority.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Walls v. Oxford Management Co., 137 N.H. 653, 633 A.2d 103 (1993)",
      "negligentSecurityNote": "In Walls, the New Hampshire Supreme Court addressed whether landlords owe tenants a duty to provide security against foreseeable criminal acts of third parties. Practitioner note: the precise scope of the duty adopted (and whether it requires prior similar incidents at the specific property versus a broader foreseeability showing) was not independently confirmed against full opinion text in this research pass - flagged as medium confidence; verify directly before relying on it for a filing.",
      "additionalDefenses": "New Hampshire's recreational-use statute (RSA 508:14) limits liability of landowners who permit free public recreational use of their land.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "New Jersey": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "N.J. Stat. § 2A:15-5.1",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- N.J. Stat. § 2A:15-5.12",
      "punitiveDamagesCap": "Greater of $350,000 or 5x compensatory damages -- N.J. Stat. § 2A:15-5.14",
      "note": "",
      "visitorClassificationSystem": "Hybrid/Other — nominal tripartite labels retained but duty set by a multi-factor fairness/foreseeability analysis",
      "visitorClassificationCitation": "Hopkins v. Fox & Lazo Realtors, 132 N.J. 426, 625 A.2d 1110 (1993)",
      "visitorClassificationNote": "New Jersey has not formally abolished the invitee/licensee/trespasser labels the way Massachusetts, Minnesota, Montana, Nebraska, or New Hampshire have, but its courts (starting with cases like Hopkins) determine the scope of a possessor's duty through a broader fairness/foreseeability balancing (foreseeability of harm, nature of the risk, opportunity and ability to exercise care, and public interest in the proposed solution) rather than mechanically applying the old common-law categories.",
      "elementsToProve": [
        "Existence of a duty, determined by weighing foreseeability of the risk of harm and considerations of fairness and public policy",
        "A dangerous condition existed on the property",
        "The possessor had actual or constructive notice of the condition (or created it, or the mode-of-operation rule applies)",
        "Breach of the duty to remedy or warn",
        "Causation and damages"
      ],
      "elementsCitation": "Hopkins v. Fox & Lazo Realtors, 625 A.2d 1110 (N.J. 1993); Nisivoccia v. Glass Gardens, Inc., 175 N.J. 559 (2003)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "New Jersey does not require plaintiffs to elect between a separate 'premises liability' cause of action and 'ordinary negligence' the way Texas does; both a condition-based claim and an activity-based claim are analyzed under New Jersey's unified negligence/duty-fairness framework from Hopkins.",
      "noticeRule": "Plaintiff must generally show actual or constructive notice of the dangerous condition (i.e., it existed long enough that reasonable inspection would have revealed it), except where the mode-of-operation rule shifts the burden to the defendant in self-service settings.",
      "modeOfOperationRuleAdopted": true,
      "modeOfOperationCitation": "Nisivoccia v. Glass Gardens, Inc., 175 N.J. 559, 818 A.2d 314 (2003); Bozza v. Vornado, Inc., 42 N.J. 355, 200 A.2d 777 (1964)",
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Brett v. Great American Recreation, Inc., 144 N.J. 479, 677 A.2d 705 (1996)",
      "openAndObviousNote": "New Jersey rejected a categorical rule that an open and obvious danger automatically eliminates a possessor's duty (even as to child trespassers in Brett itself); instead, possessors must take reasonably feasible protective measures against foreseeable injury even from visible hazards. A hazard that could not have been discovered by reasonable inspection generally supports no liability; one that should have been discovered (constructive notice) can support liability; a truly obvious one still requires the possessor to weigh the ease of remediation against the foreseeable risk under Brett.",
      "attractiveNuisanceDoctrine": "Adopted with modifications (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Vega by Muniz v. Piedilato, 154 N.J. 496, 713 A.2d 442 (1998); Brett v. Great American Recreation, Inc., 144 N.J. 479 (1996)",
      "attractiveNuisanceNote": "New Jersey applies a modified infant-trespasser rule drawing on Restatement Sec. 339, but Vega v. Piedilato held that a child's own significant recklessness in encountering a known, obvious danger can still defeat recovery even under this more protective framework.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Clohesy v. Food Circus Supermarkets, Inc., 149 N.J. 496, 694 A.2d 1017 (1997)",
      "negligentSecurityNote": "New Jersey's Supreme Court in Clohesy expressly rejected a rule requiring prior similar incidents on the premises, adopting instead a totality-of-the-circumstances approach to whether a business owner should have foreseen the risk of criminal conduct against patrons.",
      "additionalDefenses": "New Jersey's Landowners Liability Act (N.J.S.A. 2A:42A-2 et seq.) limits liability for landowners who permit free recreational or sport activity on their land; the state also recognizes reduced duties for out-of-possession landlords absent retained control over the defective area.",
      "researchConfidence": "medium-high",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "New Mexico": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "Scott v. Rizzo, 96 N.M. 682 (1981)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap identified.",
      "note": "",
      "visitorClassificationSystem": "Hybrid/Other — describe: Unified 'reasonable care under the circumstances' standard for lawful entrants (invitees and licensees merged into one category); trespassers remain a separate, lower-duty category",
      "visitorClassificationCitation": "Ford v. Board of County Commissioners of Dona Ana County, 118 N.M. 134, 879 P.2d 766, 771 (N.M. 1994)",
      "visitorClassificationNote": "Ford abolished the invitee/licensee distinction in favor of a general duty of ordinary/reasonable care owed to all lawful visitors, based on foreseeability of the entrant's presence, likelihood and severity of injury, and the burden of avoiding the risk. New Mexico's Uniform Jury Instructions (UJI 13-1309 NMRA) still treat trespassers as a distinct, lower-duty category, so this is not a full Rowland/Basso-style merger of all entrants.",
      "elementsToProve": [
        "Defendant owned, occupied, or controlled the premises",
        "A condition existed on the premises that posed an unreasonable risk of harm",
        "Defendant knew or, in the exercise of reasonable care, should have known of the condition and the risk (actual or constructive notice)",
        "Defendant failed to exercise ordinary care to protect against the danger, by remedying it or adequately warning of it",
        "The failure was a proximate cause of plaintiff's injury",
        "Damages"
      ],
      "elementsCitation": "Ford v. Bd. of County Comm'rs, 879 P.2d 766 (N.M. 1994); UJI 13-1309 NMRA (Duty of Owner or Occupant of Premises)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "New Mexico does not draw a Keetch-style bright-line distinction between a premises-condition claim and an ordinary negligence/activity claim. Both are governed by the same reasonable-care-under-the-circumstances standard announced in Ford; the applicable UJI instruction differs by fact pattern, but this is a pattern-instruction convenience, not a separate cause of action with different elements or a jurisdictional bar the way Texas treats it.",
      "noticeRule": "Actual or constructive notice of the dangerous condition. Constructive notice may be shown where the condition existed long enough that a reasonably prudent owner, through reasonable inspection, should have discovered and remedied it.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": "Mahoney v. J.C. Penney Co., 71 N.M. 244, 377 P.2d 663, 673 (N.M. 1962) (recurrent-condition doctrine)",
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — not a complete bar",
      "openAndObviousCitation": "Klopp v. Wackenhut Corp., 113 N.M. 153, 824 P.2d 293, 297 (N.M. 1992)",
      "openAndObviousNote": "New Mexico holds that an open-and-obvious condition is NOT a complete defense; it does not automatically eliminate the owner's duty of care in this comparative-fault state. A hazard the owner could not have discovered (no actual or constructive notice) generates no liability; one the owner should have discovered (constructive notice) triggers a duty to remedy or warn; and one that is open and obvious to the visitor bears on comparative fault/foreseeability rather than eliminating duty outright, particularly where the owner should anticipate the visitor will encounter it anyway (e.g., no alternate route).",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Carmona v. Hagerman Irrigation Co., 1998-NMSC-011, 125 N.M. 59, 957 P.2d 44, 62",
      "attractiveNuisanceNote": "New Mexico applies the full five-factor Restatement (Second) of Torts Sec. 339 test and has declined to categorically exempt any type of condition or defendant from the doctrine as a matter of law.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances (prior similar incidents are one factor, not a rigid prerequisite)",
      "negligentSecurityCitation": "Reichert v. Atler, 117 N.M. 623, 875 P.2d 379 (N.M. 1994); Bober v. New Mexico State Fair, 111 N.M. 644, 808 P.2d 614 (N.M. 1991)",
      "negligentSecurityNote": "New Mexico assesses the foreseeability of third-party criminal conduct under general negligence/duty principles rather than a rigid 'prior similar incidents' requirement; per Reichert, an owner's duty to protect invitees extends to foreseeable harm regardless of whether it results from intentional criminal conduct or merely negligent third-party conduct.",
      "additionalDefenses": "Pure comparative fault (Scott v. Rizzo, 96 N.M. 682, 634 P.2d 1234, 1242 (N.M. 1981)); premises claims against governmental entities are governed by the Tort Claims Act, NMSA Sec. 41-4-6, which requires both a legal interest in, and control of, the property; firefighter's rule recognized, Baldonado v. El Paso Natural Gas Co., 143 N.M. 297, 176 P.3d 277, 280 (N.M. 2007).",
      "researchConfidence": "high",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "New York": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "N.Y. C.P.L.R. § 1411",
      "punitiveDamagesStandard": "Clear and Convincing Evidence (a common-law standard, not a single codified statute)",
      "punitiveDamagesCap": "No statutory cap identified -- subject only to federal due-process limits.",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland-style, decided independently as New York's own rule)",
      "visitorClassificationCitation": "Basso v. Miller, 40 N.Y.2d 233, 352 N.E.2d 868, 872 (N.Y. 1976)",
      "visitorClassificationNote": "Basso abolished the invitee/licensee/trespasser trichotomy and adopted a single standard of reasonable care under all the circumstances, with foreseeability of the entrant's presence as the primary factor. Unlike New Mexico or North Carolina, New York's unified standard extends even to trespassers (subject to the entrant's unlawful status still being weighed as a circumstance), making it closer to California's Rowland v. Christian approach.",
      "elementsToProve": [
        "Defendant owned, occupied, or controlled the premises (or otherwise had a duty by contract, lease, or course of conduct)",
        "A dangerous or defective condition existed",
        "Defendant created the condition, or had actual or constructive notice of it and a reasonable opportunity to correct it",
        "Breach of the duty of reasonable care under the circumstances",
        "Proximate cause",
        "Damages"
      ],
      "elementsCitation": "Basso v. Miller, 352 N.E.2d 868 (N.Y. 1976); Gordon v. American Museum of Natural History, 67 N.Y.2d 836, 501 N.Y.S.2d 646 (N.Y. 1986) (notice standard)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "New York does not treat a premises-condition claim as a cause of action separate from ordinary negligence; both are analyzed under the single reasonable-care standard from Basso v. Miller. New York courts do distinguish, for evidentiary/notice purposes, a 'dangerous condition' theory (requires proof of notice) from a 'negligent manner of operation/activity' theory (does not require notice of a specific defect), but this is a proof distinction, not a Keetch-style jurisdictional bar creating a separate tort.",
      "noticeRule": "Actual or constructive notice required. To constitute constructive notice, a defect must be visible and apparent, and must exist for a sufficient length of time before the accident to permit the defendant's employees to discover and remedy it; a general awareness that a dangerous condition may exist is legally insufficient.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": "Not a broadly adopted doctrine; New York courts have confined a mode-of-operation-like approach largely to self-service retail contexts and have rejected extending it beyond that (e.g., rejected for a supermarket-entrance slush hazard unrelated to self-service operations). New York's closer analogue is the 'recurring condition' doctrine: Simoni v. 2095 Cruger Assocs., 285 A.D.2d 431, 432 (N.Y. App. Div. 1st Dep't 2001).",
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only, but with an additional 'not inherently dangerous' threshold for a complete duty bar — describe if different",
      "openAndObviousCitation": "Czorniewy v. Mosera, 298 A.D.2d 352, 352 (N.Y. App. Div. 2d Dep't 2002)",
      "openAndObviousNote": "New York's rule has two independent prongs: a landowner has no duty to warn of or protect against a condition that is BOTH open and obvious AND not inherently dangerous. If the condition is inherently dangerous, its obviousness affects only comparative fault, not the underlying duty. Appellate Divisions are not fully uniform — some departments hold obviousness eliminates only the duty to warn (not the duty to maintain safely), others treat it as a broader bar; this intra-state split is a genuine open question practitioners should flag by department.",
      "attractiveNuisanceDoctrine": "Rejected/Not recognized as a formal doctrine, but its underlying concern (foreseeability of child trespassers) is folded into the unified reasonable-care/foreseeability standard",
      "attractiveNuisanceCitation": "Morse v. Buffalo Tank Corp., 280 N.Y. 110, 19 N.E.2d 981, 983 (N.Y. 1939); Collentine v. City of New York, 279 N.Y. 119, 17 N.E.2d 792 (N.Y. 1938)",
      "attractiveNuisanceNote": "New York courts have stated the formal 'attractive nuisance' doctrine does not apply in this state, but a jury may still consider the well-known propensity of children to trespass, climb, and be drawn to dangerous objects (Collentine) as part of ordinary foreseeability analysis — especially after Basso folded trespasser status into the general reasonable-care standard.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Nallan v. Helmsley-Spear, Inc., 50 N.Y.2d 507, 407 N.E.2d 451 (N.Y. 1980)",
      "negligentSecurityNote": "New York asks whether a criminal act was a foreseeable consequence of conditions the landowner knew or should have known about, considering prior criminal incidents at the specific location, neighborhood crime rates, and known/ignored security deficiencies together; the jury need not find the precise circumstances of the injury foreseeable, only that there was a foreseeable risk of harm from third-party criminal activity generally. What security precautions are reasonable is almost always a jury question.",
      "additionalDefenses": "General Obligations Law Sec. 9-103 (recreational-use immunity: no duty to keep premises safe or warn of hazards for persons entering, without a fee, for enumerated recreational activities such as hunting, fishing, hiking, snowmobiling, etc.); firefighter's rule largely abolished by General Obligations Law Sec. 11-106; Labor Law Secs. 200/240/241 create separate, heightened duties in construction-site contexts distinct from ordinary premises liability.",
      "researchConfidence": "high",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "North Carolina": {
      "faultRule": "Pure Contributory",
      "faultRuleCitation": "North Carolina common law (judicially retained -- expressly reaffirmed by the NC Supreme Court)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- N.C. Gen. Stat. § 1D-15",
      "punitiveDamagesCap": "Greater of $250,000 or 3x compensatory damages (no cap for injuries caused by a driver impaired by alcohol/drugs) -- N.C. Gen. Stat. § 1D-25",
      "note": "One of only 5 pure contributory jurisdictions -- as a practical matter, because contributory negligence bars the underlying claim entirely, punitive damages rarely become relevant in an NC premises case unless the plaintiff can show they bore NO fault at all.",
      "visitorClassificationSystem": "Hybrid/Other — describe: Unified 'reasonable care' standard for all lawful visitors (invitees and licensees merged); trespassers remain a separate, lower-duty category",
      "visitorClassificationCitation": "Nelson v. Freeland, 349 N.C. 615, 507 S.E.2d 882 (N.C. 1998)",
      "visitorClassificationNote": "Nelson eliminated the invitee/licensee distinction and adopted a single duty of reasonable care toward all lawful visitors, reasoning that the old trichotomy caused confusion and no longer reflected modern negligence principles. The court expressly retained a separate, lower duty for trespassers (no duty except to refrain from willful/wanton injury), unlike New York's fuller merger.",
      "elementsToProve": [
        "Defendant owned, occupied, or controlled the premises",
        "A condition existed on the property posing an unreasonable risk of harm to lawful visitors",
        "Defendant knew, or in the exercise of reasonable care should have known, of the condition and the risk it posed",
        "Defendant failed to exercise reasonable care to protect the visitor from the danger (by removing the condition or warning of it)",
        "Proximate cause",
        "Damages, subject to North Carolina's pure contributory-negligence bar"
      ],
      "elementsCitation": "Nelson v. Freeland, 507 S.E.2d 882 (N.C. 1998)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Nelson expressly aligned premises liability with 'all other aspects of tort law' by basing it on ordinary negligence principles rather than a distinct doctrinal category tied to land status. North Carolina does not draw a Keetch-style line between a condition-based premises claim and an activity-based ordinary-negligence claim.",
      "noticeRule": "Actual or constructive notice of the dangerous condition, for a time sufficient to permit the owner, exercising reasonable care, to discover and correct or warn of it.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Traditional No-Duty Bar",
      "openAndObviousCitation": "Freeman v. Food Lion, LLC, 173 N.C. App. 207, 211 (N.C. Ct. App. 2005)",
      "openAndObviousNote": "North Carolina is among the minority of states where a finding that a hazard was open and obvious operates as a complete bar on the duty element (no duty to warn of open-and-obvious dangers, or dangers about which the visitor has equal or superior knowledge), rather than merely reducing damages under a comparative-fault scheme. Because North Carolina also retains pure contributory negligence, a plaintiff's own negligence in encountering an obvious hazard independently and completely bars recovery. The analysis remains fact-specific — lighting, distraction, and angle of approach can all defeat a claim that a condition was truly 'obvious' (see Draughon line of cases).",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Broadway v. Blythe Industries, Inc., 313 N.C. 150, 326 S.E.2d 8 (N.C. 1985)",
      "attractiveNuisanceNote": "North Carolina imposes an additional duty of ordinary care toward trespassing children, given their immaturity and inability to appreciate danger, applying the standard Restatement Sec. 339 factors (see also Griffin v. Woodard, 130 N.C. App. 253 (1997)).",
      "negligentSecurityForeseeabilityTest": "Prior Similar Incidents (as the dominant factor within a broader foreseeability inquiry)",
      "negligentSecurityCitation": "Foster v. Winston-Salem Joint Venture, 303 N.C. 636, 281 S.E.2d 36 (N.C. 1981)",
      "negligentSecurityNote": "Foster established foreseeability as the touchstone for a landowner's duty to protect business invitees from third-party criminal acts, and foreseeability is determined largely by past experience — courts look heavily at the number and nature of prior similar criminal incidents on or near the premises (in Foster itself, 36 prior incidents, 6-7 of them assaults, supported a jury finding of foreseeability), while also considering the character of the neighborhood and business.",
      "additionalDefenses": "Pure contributory negligence (one of only a handful of U.S. jurisdictions retaining this rule) completely bars recovery for any degree of plaintiff fault, subject to the last-clear-chance doctrine (Watson v. White, 309 N.C. 498, 308 S.E.2d 268 (N.C. 1983)) and an exception where the defendant's conduct was grossly negligent, willful, or wanton; children under 7 are conclusively presumed incapable of contributory negligence, and children 7-14 receive a rebuttable presumption of incapacity.",
      "researchConfidence": "high",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": "Prior Similar Incidents"
    },
    "North Dakota": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "N.D. Cent. Code § 32-03.2-02",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- N.D. Cent. Code § 32-03.2-11",
      "punitiveDamagesCap": "NOT INDEPENDENTLY VERIFIED -- secondary sources disagree on whether North Dakota caps punitive damages (one reported no cap; another reported a $250,000-or-2x formula). Confirm current, binding statutory text before relying on a specific figure.",
      "note": "",
      "visitorClassificationSystem": "Hybrid/Other — describe: Unified 'reasonable care under the circumstances' standard for licensees/invitees; trespassers remain a separate, lower-duty category",
      "visitorClassificationCitation": "O'Leary v. Coenen, 251 N.W.2d 746, 752 (N.D. 1977)",
      "visitorClassificationNote": "O'Leary abolished the common-law licensee/invitee distinction in favor of reasonable care under the circumstances — considering foreseeability of the entrant's presence, likelihood and severity of injury, and the burden of avoiding the risk — but expressly retained a lesser duty owed to trespassers.",
      "elementsToProve": [
        "A duty of reasonable care owed given the plaintiff's status and the surrounding circumstances",
        "Breach of that duty (e.g., allowing a dangerous condition to exist without remedy or warning)",
        "Actual or constructive notice of the condition, for hazard-based claims",
        "Proximate cause",
        "Damages"
      ],
      "elementsCitation": "O'Leary v. Coenen, 251 N.W.2d 746, 752 (N.D. 1977)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "North Dakota treats premises liability as an application of ordinary negligence principles, with duty defined by reasonable care under the circumstances rather than as a separate cause of action from an ordinary negligence/activity claim. No North Dakota authority drawing a Keetch-style distinction was located in this research pass.",
      "noticeRule": "Actual or constructive notice of the dangerous condition is generally required for a hazard-based claim, assessed under the general reasonable-care-under-the-circumstances standard from O'Leary.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — not an absolute bar",
      "openAndObviousCitation": "Groleau v. Bjornson Oil Co., 676 N.W.2d 763, 769 (N.D. 2004)",
      "openAndObviousNote": "An open-and-obvious condition generally relieves a North Dakota landowner of the duty to protect or warn, but this is not absolute: where the possessor has reason to expect that a lawful entrant's attention will be distracted so that the entrant will not discover or will forget the obvious danger, or will fail to protect against it, the duty of reasonable care persists. North Dakota has notably declined to treat natural accumulations of ice and snow as automatically open-and-obvious/no-duty, unlike many jurisdictions.",
      "attractiveNuisanceDoctrine": "describe if different — not clearly resolved",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified for North Dakota. Some secondary sources describe North Dakota as having rejected or significantly limited the Restatement Sec. 339 attractive-nuisance doctrine, but this research pass could not locate a specific, clearly-controlling North Dakota Supreme Court decision adopting or rejecting the doctrine outright before the search budget was exhausted. Treat this field with caution and verify directly against North Dakota Supreme Court authority before publication.",
      "negligentSecurityForeseeabilityTest": "describe if mixed — not independently verified",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for North Dakota — general research did not surface a leading North Dakota Supreme Court case specifically addressing the foreseeability standard for negligent-security/third-party-crime claims (North Dakota's small population correlates with sparse published precedent in this specific sub-area). Such claims would presumably be analyzed under the general O'Leary reasonable-care/foreseeability framework, but this is an inference rather than a confirmed holding, and should be verified before publication.",
      "additionalDefenses": "Recreational-use immunity statute, N.D. Cent. Code ch. 53-08 (no duty to keep premises safe or to warn of hazards for persons entering for recreational purposes; exceptions for willful/malicious conduct and where the owner charges a fee, subject to a commercial-purpose carve-out); modified comparative fault with a 50% bar rule, N.D. Cent. Code Sec. 32-03.2-02; assumption of risk is not a separate affirmative defense but is subsumed into the comparative-fault analysis (Iglehart v. Iglehart, 670 N.W.2d 343, 349 (N.D. 2003)).",
      "researchConfidence": "medium (low specifically for attractive nuisance and negligent security, which could not be independently verified this session)",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": null
    },
    "Ohio": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Ohio Rev. Code § 2315.33",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Ohio Rev. Code § 2315.21(D)(4)",
      "punitiveDamagesCap": "For an individual or 'small employer' defendant: the LESSER of 2x compensatory damages or 10% of the defendant's net worth at the time of the tort, capped at $350,000 -- Ohio Rev. Code § 2315.21(D)(2)(a). A separate, differently-structured limit applies to larger employers.",
      "note": "PRIMARY-VERIFIED cap figure and formula -- note this is the LESSER of the two figures, not the greater, which several secondary sources got backwards or oversimplified.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Gladon v. Greater Cleveland Regional Transit Authority, 75 Ohio St.3d 312, 662 N.E.2d 287, 291 (Ohio 1996); Shump v. First Continental-Robinwood Assocs., 71 Ohio St.3d 414, 644 N.E.2d 291 (Ohio 1994)",
      "visitorClassificationNote": "Ohio has retained the traditional three-tier classification rather than adopting a unified reasonable-care standard. The highest duty (to inspect the premises and warn of or repair hidden dangers) is owed to invitees; a duty to warn of known hidden dangers is owed to licensees; and only a duty to refrain from willful/wanton injury is owed to trespassers.",
      "elementsToProve": [
        "Plaintiff's status as invitee, licensee, or trespasser, which determines the duty owed",
        "Breach of that duty (for invitees, including a failure to discover and remedy or warn of a hazard)",
        "For hazard claims, that defendant created the condition or had actual or constructive notice of it in time to remedy it",
        "The breach was the proximate cause of the injury",
        "Damages"
      ],
      "elementsCitation": "Gladon v. Greater Cleveland Reg'l Transit Auth., 662 N.E.2d 287 (Ohio 1996)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Ohio does not recognize a Texas-style bright-line distinction between a premises-condition claim and an ordinary-negligence/activity claim. Premises liability in Ohio is simply negligence law overlaid with the invitee/licensee/trespasser duty framework, not a separate cause of action.",
      "noticeRule": "Actual or constructive notice of the hazardous condition; constructive notice requires that the hazard existed for a length of time sufficient that ordinary care would have discovered and corrected it.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": "Johnson v. Wagner Provision Co., 141 Ohio St. 584, 49 N.E.2d 925 (Ohio 1943) (self-service exception to the notice requirement)",
      "openAndObviousDoctrine": "Traditional No-Duty Bar",
      "openAndObviousCitation": "Armstrong v. Best Buy Co., 99 Ohio St.3d 79, 2003-Ohio-2573, 788 N.E.2d 1088 (Ohio 2003)",
      "openAndObviousNote": "In Ohio, an open-and-obvious danger operates as a complete bar to the existence of a duty as a matter of law — not merely a comparative-fault reduction. The 'attendant circumstances' doctrine is a recognized exception: if something diverts or distracts the visitor's attention from the hazard, the open-and-obvious bar may not apply; a statutory/regulatory violation constituting negligence per se is a further, separate exception.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Bennett v. Stanley, 92 Ohio St.3d 35, 2001-Ohio-128, 748 N.E.2d 41 (Ohio 2001)",
      "attractiveNuisanceNote": "Ohio formally adopted the full Restatement Sec. 339 attractive-nuisance test in 2001 in Bennett v. Stanley (a case arising from a drowning in a residential swimming pool); the court also held that an adult who attempts to rescue a child from the attractive nuisance assumes the child's protected status and is owed a duty of ordinary care.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances",
      "negligentSecurityCitation": "Simpson v. Big Bear Stores Co., 73 Ohio St.3d 130, 652 N.E.2d 702 (Ohio 1995)",
      "negligentSecurityNote": "Ohio evaluates the foreseeability of third-party criminal conduct under the totality of the circumstances rather than requiring identical prior incidents, but the circumstances must be 'somewhat overwhelming' before a duty to protect against criminal acts arises. Simpson additionally held that a business's duty under Restatement Sec. 344 does not extend to areas outside its possession and control, even where foreseeability alone might otherwise suggest a duty (the assault in Simpson occurred on adjacent land the store did not control).",
      "additionalDefenses": "Modified comparative fault (51% bar rule), Ohio Rev. Code Sec. 2315.33; express and primary assumption of risk bar recovery while secondary/implied assumption of risk is subsumed under comparative fault, Anderson v. Ceccardi, 6 Ohio St.3d 110, 451 N.E.2d 780, 783 (Ohio 1983); firefighter's rule recognized, Torchik v. Boyce, 121 Ohio St.3d 440, 2009-Ohio-1248 (Ohio 2009).",
      "researchConfidence": "high (medium specifically for the mode-of-operation citation, which reflects a well-known but not freshly re-verified 1943 Ohio Supreme Court case)",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Oklahoma": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Okla. Stat. tit. 23, § 13",
      "punitiveDamagesStandard": "Clear and Convincing Evidence, with an escalating tier structure tied to the degree of culpability found -- Okla. Stat. tit. 23, § 9.1",
      "punitiveDamagesCap": "Tiered by culpability finding (roughly $100,000-$500,000, or up to 2x compensatory damages at the higher tiers, with no cap where the jury finds the defendant acted intentionally and with malice) -- Okla. Stat. tit. 23, § 9.1. Secondary sources gave slightly different tier boundaries; confirm the current statute for the exact dollar thresholds.",
      "note": "",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Pickens v. Tulsa Metropolitan Ministry, 1997 OK 152, 951 P.2d 1079, 1083 (Okla. 1997)",
      "visitorClassificationNote": "Oklahoma retains the traditional tripartite classification and has not adopted a Rowland/Basso-style unified duty. The possessor's duty — to inspect and warn/repair, to warn of known hidden dangers, or merely to refrain from willful injury — still turns on whether the entrant is an invitee, licensee, or trespasser.",
      "elementsToProve": [
        "A duty to protect the plaintiff from injury, the scope of which is defined by the plaintiff's status as invitee, licensee, or trespasser",
        "Breach of that duty of care (for invitees, including actual or constructive knowledge of a dangerous condition)",
        "The breach was the proximate cause of the plaintiff's injury",
        "Damages"
      ],
      "elementsCitation": "Pickens v. Tulsa Metropolitan Ministry, 951 P.2d 1079 (Okla. 1997); Brown v. Alliance Real Estate Group, 1999 OK 7, 976 P.2d 1043",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified as to an explicit condition-versus-activity distinction. Oklahoma litigates premises-defect claims through the standard negligence elements overlaid with the invitee/licensee/trespasser duty framework; no Oklahoma authority describing a Keetch-style categorical separation between a 'premises defect' claim and an ordinary negligence claim was located in this research pass.",
      "noticeRule": "Actual or constructive notice of the dangerous condition, for a duration sufficient that reasonable inspection would have revealed it.",
      "modeOfOperationRuleAdopted": true,
      "modeOfOperationCitation": "Lingerfelt v. Winn-Dixie Texas, Inc., 1982 OK 44, 645 P.2d 485, 489 (Okla. 1982)",
      "openAndObviousDoctrine": "Traditional No-Duty Bar",
      "openAndObviousCitation": "Tucker v. ADG, Inc., 2004 OK 71, 102 P.3d 660, 669 (Okla. 2004); Brown v. Nicholson, 1997 OK 32, 935 P.2d 319",
      "openAndObviousNote": "Oklahoma treats an open-and-obvious danger as negating the possessor's duty altogether — litigated as a duty question on summary judgment (see also Scott v. Archon Group, 2008 OK 45, 191 P.3d 1207; Sholer v. ERC Mgmt. Group, 2011 OK 24, 256 P.3d 38) — rather than as a factor going only to comparative fault. The recurring litigation question is whether the undisputed evidentiary material shows the condition was open and obvious as a matter of law.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Knowles v. Tripledee Drilling Co., 1989 OK 40, 771 P.2d 208, 209 (Okla. 1989)",
      "attractiveNuisanceNote": "Oklahoma recognizes the attractive-nuisance doctrine for artificial conditions dangerous to trespassing children, applying the standard Restatement Sec. 339 factors.",
      "negligentSecurityForeseeabilityTest": "describe if mixed — not independently verified with a clearly-controlling leading case",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Oklahoma in this research pass. Searches for a leading Oklahoma Supreme Court case specifically establishing the foreseeability test for negligent-security/third-party-crime claims (analogous to California's Ann M. or New York's Nallan) did not return a clearly-confirmed controlling citation before the research budget was exhausted. Oklahoma negligent-security claims likely proceed under general premises-liability foreseeability principles tied to the invitee duty, but this should be independently confirmed before publication.",
      "additionalDefenses": "Modified comparative fault (51% bar rule), Okla. Stat. tit. 23 Sec. 13; assumption of risk retained as a distinct statutory defense, Okla. Stat. tit. 23 Sec. 12 (Oklahoma is unusual in preserving assumption of risk as a jury question rather than fully subsuming it into comparative fault, reflecting Okla. Const. art. XXIII Sec. 6).",
      "researchConfidence": "medium-high (low specifically for negligent security foreseeability test, which could not be independently verified)",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": null
    },
    "Oregon": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Or. Rev. Stat. § 31.600",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Or. Rev. Stat. § 31.730",
      "punitiveDamagesCap": "No cap on the total award, but Oregon uniquely redirects 70% of any punitive-damages award to the state's Criminal Injuries Compensation Account rather than the plaintiff -- Or. Rev. Stat. § 31.735",
      "note": "The split-recovery structure materially changes the practical incentive to pursue a punitive theory in Oregon even without a hard cap.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser), with duty content shaped by Restatement (Second) Secs. 343/343A",
      "visitorClassificationCitation": "Walsh v. C&K Market, Inc., 171 Or. App. 536, 16 P.3d 1179, 1181 (Or. Ct. App. 2000)",
      "visitorClassificationNote": "Oregon has retained the traditional tripartite classification rather than adopting a unified reasonable-care standard for premises cases specifically. Oregon's general negligence law (Fazzolari v. Portland School Dist. No. 1J, 303 Or. 1, 734 P.2d 1326 (1987)) emphasizes a foreseeability-based duty analysis that operates alongside, but has not displaced, the premises-liability status categories.",
      "elementsToProve": [
        "Defendant was the possessor of the land",
        "Plaintiff's status (invitee, licensee, or trespasser) and the corresponding duty owed",
        "Breach of that duty — for invitees, failure to use reasonable care to discover and correct or warn of a dangerous condition",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Walsh v. C&K Mkt., Inc., 16 P.3d 1179 (Or. Ct. App. 2000)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Not independently verified as an explicitly litigated doctrinal question. Oregon's general negligence framework under Fazzolari (foreseeability of harm defines duty absent a special status/relationship) applies across both 'activity' and 'condition' claims, and no Oregon authority drawing a Keetch-style bright line between the two theories was located in this research pass.",
      "noticeRule": "Actual or constructive notice of the dangerous condition is generally required for a hazard claim, assessed under ordinary reasonable-care principles.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — not an absolute bar",
      "openAndObviousCitation": "Dawson v. Payless for Drugs, 248 Or. 334, 433 P.2d 1019, 1021 (Or. 1967)",
      "openAndObviousNote": "Oregon follows the Restatement Sec. 343A approach: a possessor is not liable for physical harm caused by a known or obvious condition unless the possessor should anticipate the harm despite such knowledge or obviousness — for example, because the invitee's attention may be distracted, or the invitee has no reasonable alternative but to encounter the risk.",
      "attractiveNuisanceDoctrine": "describe if different — not independently verified with a specific controlling citation this session",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified for Oregon in this research pass. Oregon case law addressing child trespassers and artificial dangerous conditions was not confirmed with a specific controlling citation before the research budget was exhausted; this field should be verified directly against Oregon Supreme Court authority before publication.",
      "negligentSecurityForeseeabilityTest": "Totality of the Circumstances / General Foreseeability (Fazzolari framework)",
      "negligentSecurityCitation": "Piazza v. Kellim, 360 Or. 58, 377 P.3d 492 (Or. 2016)",
      "negligentSecurityNote": "Oregon does not require prior identical incidents. Piazza v. Kellim (arising from a fatal assault following a large teenage house party) held that the reasonable foreseeability of a third party's criminal conduct is assessed under Oregon's general common-law foreseeability principles from Fazzolari, considering the totality of circumstances known to the defendant rather than a rigid prior-incidents rule.",
      "additionalDefenses": "Recreational-use immunity, Or. Rev. Stat. Sec. 105.682 (an owner who permits public recreational use of land is generally immune from liability, subject to exceptions); firefighter's rule abolished, Christensen v. Murphy, 296 Or. 610, 678 P.2d 1210, 1218 (Or. 1984); limited duty of ordinary care to those traveling on land adjacent to the premises, Towe v. Sacagawea, Inc., 357 Or. 74, 347 P.3d 766, 783 (Or. 2015).",
      "researchConfidence": "medium (low specifically for attractive nuisance, which could not be independently verified)",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Totality of the Circumstances"
    },
    "Pennsylvania": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "42 Pa. Cons. Stat. § 7102",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap -- the Pennsylvania Supreme Court has held the state constitution's remedies clause forecloses a legislative cap on this kind of damages.",
      "note": "",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Jones v. Three Rivers Management Corp., 483 Pa. 75, 394 A.2d 546, 552 (Pa. 1978)",
      "visitorClassificationNote": "Pennsylvania has expressly adopted Restatement (Second) of Torts Secs. 343 and 343A and retains the traditional tripartite classification; it has not adopted a unified reasonable-care standard for all entrants.",
      "elementsToProve": [
        "Possessor status/control of the land",
        "Plaintiff's status as invitee, licensee, or trespasser and the corresponding duty owed",
        "For invitees: the possessor knew or by the exercise of reasonable care would have discovered the condition, and should have realized it involved an unreasonable risk of harm",
        "The possessor should expect that invitees will not discover or realize the danger, or will fail to protect themselves against it",
        "The possessor failed to exercise reasonable care to protect invitees against the danger",
        "Causation and damages"
      ],
      "elementsCitation": "Restatement (Second) of Torts Sec. 343, as adopted in Pennsylvania; Carrender v. Fitterer, 503 Pa. 178, 469 A.2d 120 (Pa. 1983)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Pennsylvania does not recognize a Keetch-style separate cause of action for premises conditions versus activities; premises liability is ordinary negligence law with duty defined by Restatement Sec. 343/343A and the visitor's status.",
      "noticeRule": "Actual or constructive notice of the dangerous condition — i.e., the possessor knew, or by the exercise of reasonable care would have discovered, the condition.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — not an absolute bar",
      "openAndObviousCitation": "Carrender v. Fitterer, 503 Pa. 178, 469 A.2d 120 (Pa. 1983); Campisi v. Acme Markets, Inc., 915 A.2d 117, 120 (Pa. Super. Ct. 2006)",
      "openAndObviousNote": "Under Sec. 343A as adopted in Pennsylvania, a possessor is not liable for known or obvious dangers unless the possessor should anticipate harm despite the obviousness — for example, because the invitee's attention is likely to be distracted, or the invitee has no practical alternative but to encounter the condition (e.g., the only path to the exit).",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Stahl v. Cocalico School District, 112 Pa. Commw. 50, 534 A.2d 1141, 1142 (Pa. Commw. Ct. 1987)",
      "attractiveNuisanceNote": "Pennsylvania applies the standard five-factor Restatement Sec. 339 test to artificial conditions dangerous to trespassing children.",
      "negligentSecurityForeseeabilityTest": "Specific Harm Rule leaning (notice of a pattern of prior similar criminal activity on the specific premises), rather than a pure totality-of-the-circumstances approach",
      "negligentSecurityCitation": "Feld v. Merriam, 506 Pa. 383, 485 A.2d 742 (Pa. 1984)",
      "negligentSecurityNote": "Feld v. Merriam — involving the armed robbery/assault of tenants in a large apartment complex's parking garage — is Pennsylvania's leading case. It held that a landlord's duty to protect against third-party criminal acts arises only where the landlord had actual or constructive notice, typically shown through a pattern of similar prior criminal activity on the premises, of the specific risk — making Pennsylvania's test more restrictive/notice-driven than pure 'totality of the circumstances' jurisdictions, though later Superior Court decisions (e.g., Feld's progeny) have applied it somewhat flexibly to the facts.",
      "additionalDefenses": "Modified comparative fault (51% bar rule), 42 Pa. Cons. Stat. Sec. 7102; firefighter's rule not yet adopted in Pennsylvania, Bole v. Erie Insurance Exchange, 967 A.2d 1017, 1021 (Pa. Super. Ct. 2009); out-of-possession landlord liability to tenants and third parties for defects existing at the time of leasing governed by Restatement Sec. 355 principles as applied in Pennsylvania case law.",
      "researchConfidence": "high (medium on mode-of-operation, which could not be independently confirmed this session)",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Specific Harm Rule"
    },
    "Rhode Island": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "R.I. Gen. Laws § 9-20-4",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap identified.",
      "note": "",
      "visitorClassificationSystem": "Hybrid/Other — describe: Unified 'reasonable care' standard for lawful entrants (invitees and licensees merged); trespassers treated as a separate category",
      "visitorClassificationCitation": "Mariorenzi v. Joseph DiPonte, Inc., 114 R.I. 294, 333 A.2d 127, 133 (R.I. 1975); Tantimonico v. Allendale Mutual Insurance Co., 637 A.2d 1056, 1062 (R.I. 1994)",
      "visitorClassificationNote": "Rhode Island abolished the invitee/licensee distinction in Mariorenzi, adopting a single reasonable-care standard for all lawful entrants, but has retained a separate, lesser standard of care for trespassers rather than fully merging all categories as New York did.",
      "elementsToProve": [
        "A legal duty of reasonable care owed by defendant to plaintiff given plaintiff's lawful presence on the property",
        "Breach of that duty — i.e., a dangerous condition known or reasonably discoverable that was not remedied or warned of",
        "Proximate causation",
        "Damages"
      ],
      "elementsCitation": "Mariorenzi v. Joseph DiPonte, Inc., 333 A.2d 127 (R.I. 1975)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Rhode Island treats premises liability as an application of ordinary negligence principles under its unified reasonable-care standard. No authority was found establishing a Keetch-style categorical distinction between condition-based and activity-based claims.",
      "noticeRule": "Actual or constructive notice of the dangerous condition is generally required, assessed under the reasonable-care standard.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "describe if different — likely aligned with a Sec. 343A-style exception but not confirmed with full confidence",
      "openAndObviousCitation": "Bucki v. Hawkins, 914 A.2d 491, 497 (R.I. 2007)",
      "openAndObviousNote": "Rhode Island recognizes that an open-and-obvious danger bears on the landowner's duty to warn, but this research pass could not confirm with full confidence, from primary-source text, whether Rhode Island treats obviousness as a complete duty bar or applies a Sec. 343A-style 'unless the possessor should anticipate the harm' exception. Treat the precise doctrinal characterization as medium confidence pending direct review of the full Bucki v. Hawkins opinion.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Haddad v. First National Stores, Inc., 109 R.I. 59, 64 (R.I. 1971)",
      "attractiveNuisanceNote": "Rhode Island recognizes the attractive-nuisance doctrine for artificial conditions dangerous to trespassing children, generally consistent with the Restatement Sec. 339 framework.",
      "negligentSecurityForeseeabilityTest": "describe if mixed — not independently verified with a clearly-controlling leading case",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Rhode Island. This research pass did not locate a clearly-established Rhode Island Supreme Court decision setting out a specific foreseeability test (e.g., prior-similar-incidents vs. totality-of-the-circumstances) for negligent-security claims against landowners; Rhode Island is a small jurisdiction with comparatively limited published precedent in this specific sub-area, and this field should be researched further before publication.",
      "additionalDefenses": "Pure comparative fault, R.I. Gen. Laws Sec. 9-20-4; firefighter's (public-safety officer's) rule recognized, Higgins v. Rhode Island Hospital, 35 A.3d 919, 922-23 (R.I. 2012).",
      "researchConfidence": "medium (low specifically for negligent security and the precise open-and-obvious characterization, neither independently confirmed this session)",
      "openAndObviousRule": null,
      "negligentSecurityTestNormalized": null
    },
    "South Carolina": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Nelson v. Concrete Supply Co., 303 S.C. 243 (1991)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- S.C. Code § 15-32-520",
      "punitiveDamagesCap": "Greater of $500,000 or 3x compensatory damages; up to 4x compensatory or $2 million where the defendant's conduct was particularly egregious (e.g., a documented pattern of similar prior conduct) -- S.C. Code § 15-32-530",
      "note": "",
      "visitorClassificationSystem": "Statutory Tripartite (reinstated by statute) — describe: common-law tripartite plus a separate child-trespasser category (Invitee/Licensee/Adult Trespasser/Child)",
      "visitorClassificationCitation": "Landry v. Hilton Head Plantation Property Owners Ass'n, 317 S.C. 200, 452 S.E.2d 619, 620 (S.C. Ct. App. 1994)",
      "visitorClassificationNote": "South Carolina retains the traditional common-law classifications and additionally separates adult trespassers from child trespassers (the latter governed by attractive-nuisance-style analysis), rather than adopting a unified reasonable-care standard as many neighboring states have.",
      "elementsToProve": [
        "Plaintiff's status (invitee, licensee, or trespasser) and the corresponding duty owed by the possessor",
        "Existence of a dangerous condition on the property",
        "The possessor had actual or constructive knowledge of the condition",
        "The possessor failed to exercise the requisite degree of care to remedy the condition or warn of it",
        "The breach proximately caused plaintiff's injury",
        "Damages"
      ],
      "elementsCitation": "Landry v. Hilton Head Plantation Prop. Owners Ass'n, 452 S.E.2d 619 (S.C. Ct. App. 1994)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "South Carolina treats premises liability as a species of ordinary negligence in which the scope of duty is set by the plaintiff's entrant status. No authority was found establishing a Keetch-style bright-line distinction between a premises-condition claim and an ordinary negligence/activity claim.",
      "noticeRule": "Actual or constructive notice of the dangerous condition required — i.e., the owner knew or should have known of it through reasonable inspection.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A) — not an absolute bar",
      "openAndObviousCitation": "Callander v. Charleston Doughnut Corp., 305 S.C. 123, 406 S.E.2d 361, 362 (S.C. 1991)",
      "openAndObviousNote": "South Carolina follows the Sec. 343A approach: an open-and-obvious condition generally relieves the possessor of the duty to warn, unless the possessor should anticipate the harm despite the obviousness — e.g., because the invitee will likely be distracted or has no reasonable alternative but to encounter the condition.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Henson v. International Paper Co., 374 S.C. 375, 650 S.E.2d 74, 77 (S.C. 2007)",
      "attractiveNuisanceNote": "South Carolina applies the Restatement Sec. 339 factors to artificial conditions dangerous to trespassing children, consistent with its separate 'child' visitor-classification category noted above.",
      "negligentSecurityForeseeabilityTest": "Balancing Test (a sliding-scale approach resembling California's Ann M.)",
      "negligentSecurityCitation": "Bass v. Gopal, Inc., 395 S.C. 129, 716 S.E.2d 910 (S.C. 2011)",
      "negligentSecurityNote": "Bass v. Gopal adopted a balancing approach under which the degree of foreseeability needed to establish a duty to protect against third-party crime varies inversely with the burden of the precautions required — a lesser showing of foreseeability suffices to require minimal, inexpensive security measures, while a much greater showing is needed to justify substantial expenditures (e.g., armed guards). This approach was reaffirmed in Lord v. D & J Enterprises, Inc., 407 S.C. 544, 757 S.E.2d 695 (S.C. 2014).",
      "additionalDefenses": "Modified comparative fault (51% bar rule), Nelson v. Concrete Supply Co., 303 S.C. 243, 399 S.E.2d 783 (S.C. 1991); firefighter's rule NOT recognized, Trousdell v. Cannon, 351 S.C. 636, 572 S.E.2d 264, 266 (S.C. 2002); recreational-use immunity, S.C. Code Ann. Sec. 27-3-10 et seq.",
      "researchConfidence": "high",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Balancing Test"
    },
    "South Dakota": {
      "faultRule": "Slight/Gross (unique -- see note)",
      "faultRuleCitation": "S.D. Codified Laws § 20-9-2",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No formal statutory cap identified; South Dakota does require a bifurcated trial on liability for punitive damages before the amount is tried.",
      "note": "GENUINE, WELL-DOCUMENTED NATIONAL OUTLIER: South Dakota does not use a percentage-based comparative fault allocation at all. Instead, the court asks only whether the plaintiff's negligence was 'slight' AND the defendant's was 'gross' in comparison -- if the plaintiff's own fault is found to be more than slight (the SD Supreme Court has held as little as 30% qualifies), recovery is barred entirely, similar in effect to contributory negligence despite not being labeled that way. See Wood v. City of Crooks (S.D. 1997). Model this claim type's baseProbability conservatively in South Dakota given how easily a plaintiff's own fault can exceed the vague 'slight' threshold.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Janis v. Nash Finch Co., 2010 SD 27, 780 N.W.2d 497; Musch v. H-D Elec. Co-op., Inc., 460 N.W.2d 149 (S.D. 1990)",
      "visitorClassificationNote": "South Dakota has NOT unified the common-law categories (no Rowland-style merger). Invitee-duty liability is 'predicated upon a landowner's superior knowledge concerning the dangers of his property' (Janis v. Nash Finch). Whether a hazard was 'known and obvious' so as to limit the landowner's duty is typically a fact question for the jury rather than a categorical bar (Musch).",
      "elementsToProve": [
        "Duty owed by the landowner based on plaintiff's status (invitee/licensee/trespasser)",
        "Landowner had actual or constructive knowledge of a hazardous condition (for invitee claims)",
        "Breach of the duty of ordinary/reasonable care under the circumstances",
        "Proximate causation",
        "Damages"
      ],
      "elementsCitation": "Janis v. Nash Finch Co., 2010 SD 27, 780 N.W.2d 497",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "South Dakota does not draw a Texas/Keetch-style formal distinction between a 'premises defect' claim and a 'negligent activity' claim. Premises cases in South Dakota are analyzed as ordinary negligence claims in which the applicable duty is set by the plaintiff's entrant status; there is no separate cause of action requiring proof of notice of a 'condition' as opposed to an ongoing 'activity.'",
      "noticeRule": "Actual or constructive notice of the dangerous condition is required for invitee claims; constructive notice requires that the condition existed long enough that a reasonably diligent landowner should have discovered and corrected it.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Traditional No-Duty Bar (fact-question variant)",
      "openAndObviousCitation": "Musch v. H-D Elec. Co-op., Inc., 460 N.W.2d 149 (S.D. 1990)",
      "openAndObviousNote": "A landowner's duty is limited as to conditions that are 'known and obvious,' but South Dakota treats whether a given condition actually was known/obvious as a jury question rather than resolving it as a matter of law in every case. A hazard that could not have been discovered with reasonable inspection presents a straightforward notice failure (no liability); one that should have been discovered raises constructive notice; one that is truly open and obvious to the plaintiff cuts toward no duty to warn, but South Dakota does not treat 'obviousness' as an automatic complete bar the way some states do.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339, implied by statute)",
      "attractiveNuisanceCitation": "SDCL 20-9-18 (recreational-use immunity statute expressly does not affect the attractive-nuisance doctrine)",
      "attractiveNuisanceNote": "South Dakota's recreational-use immunity statute carves out and preserves attractive-nuisance liability, confirming the doctrine remains viable in the state, presumably along Restatement Second Sec. 339 lines. I could not independently locate a South Dakota Supreme Court case applying the full five-factor Restatement test in this session.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for South Dakota",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for South Dakota — I could not locate a South Dakota Supreme Court case articulating a specific foreseeability test (prior similar incidents vs. totality vs. balancing) for negligent-security claims within the search budget available. Treat any specific-test claim for South Dakota as unconfirmed until checked against primary sources (e.g., Westlaw/Lexis).",
      "additionalDefenses": "South Dakota recreational-use immunity, SDCL Title 20, Ch. 9 (landowners owe no duty to keep premises safe for, or to warn of hazards to, persons using the land for recreation without charge). South Dakota also applies a distinctive comparative-negligence standard under SDCL 20-9-2 (plaintiff's negligence must be 'slight' and defendant's 'gross' by comparison for recovery — a 'slight-gross' formulation rather than the 50%/51% threshold used in most modified-comparative states); this specific formulation is based on general legal knowledge and was not independently re-confirmed via search this session.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": null
    },
    "Tennessee": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "McIntyre v. Balentine, 833 S.W.2d 52 (Tenn. 1992)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Hodges v. S.C. Toof & Co., 833 S.W.2d 896 (Tenn. 1992)",
      "punitiveDamagesCap": "Greater of 2x compensatory damages or $500,000 -- Tenn. Code § 29-39-104",
      "note": "",
      "visitorClassificationSystem": "Hybrid/Other — describe",
      "visitorClassificationCitation": "Hudson v. Gaitan, 675 S.W.2d 699 (Tenn. 1984) (merging licensee/invitee duty); Rice v. Sabir, 979 S.W.2d 305 (Tenn. 1998)",
      "visitorClassificationNote": "Tennessee merged the licensee and invitee categories, imposing a single duty of reasonable care on the landowner toward both social guests and business invitees, while retaining a lower (willful/wanton) duty toward trespassers. The duty is framed as arising from the landowner's 'position of control,' since the owner is normally best able to prevent harm.",
      "elementsToProve": [
        "A duty of care owed by the defendant to the plaintiff",
        "Conduct falling below the applicable standard of care amounting to a breach",
        "An injury or loss",
        "Causation in fact",
        "Proximate (legal) causation"
      ],
      "elementsCitation": "Rice v. Sabir, 979 S.W.2d 305 (Tenn. 1998)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Tennessee does NOT draw the Texas/Keetch-style distinction between a premises-defect claim and a negligent-activity claim. A premises liability claim in Tennessee is simply an ordinary negligence claim applied to a landowner/occupier defendant, using the standard 5-element negligence test; there is no separate procedural or substantive track requiring proof of an inert 'condition' versus a contemporaneous 'activity.'",
      "noticeRule": "The owner/occupier must have actual or constructive notice of a dangerous condition (i.e., knew or should have known of it through reasonable diligence) before liability attaches for failing to remove or warn of it.",
      "modeOfOperationRuleAdopted": "partial",
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": "Coln v. City of Savannah, 966 S.W.2d 34 (Tenn. 1998)",
      "openAndObviousNote": "Coln held that a danger being 'open and obvious' does not automatically eliminate the landowner's duty. Duty is instead analyzed by weighing the foreseeability and gravity of harm against the burden of alternative conduct; if a duty exists despite the obviousness, the openness of the danger is then folded into Tennessee's modified comparative-fault analysis rather than operating as a categorical bar. A hazard that could not have been discovered raises a notice problem; one that should have been discovered raises constructive notice; a truly obvious one still may support a duty if the foreseeable gravity of harm is high, subject to fault-apportionment at trial.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Restatement (Second) of Torts Sec. 339 (common-law adoption); a specific Tennessee Code citation (T.C.A. Sec. 29-34-208) appeared in a secondary source but could not be independently confirmed as the correct statutory home for the doctrine in this session",
      "attractiveNuisanceNote": "Tennessee's doctrine requires an artificial (man-made), not natural, condition. The specific statutory citation should be independently verified before publication; the substantive Restatement Sec. 339 elements are the safer citation to rely on.",
      "negligentSecurityForeseeabilityTest": "Balancing Test",
      "negligentSecurityCitation": "McClung v. Delta Square Ltd. Partnership, 937 S.W.2d 891 (Tenn. 1996)",
      "negligentSecurityNote": "McClung expressly rejected both the 'prior similar incidents' rule and a broad 'totality of the circumstances' approach, adopting instead a balancing test: a duty arises when the foreseeable probability and gravity of harm outweigh the burden on the defendant of taking precautions. This gives Tennessee courts more flexibility than a rigid prior-incidents rule but is less plaintiff-friendly than a pure totality test.",
      "additionalDefenses": "Tennessee Recreational Use Statute (T.C.A. Sec. 70-7-101 et seq.) limits liability to landowners who permit recreational use of land without charge, absent gross negligence or willful/wanton conduct. Tennessee applies modified comparative fault with a 50% bar (McIntyre v. Balentine, 833 S.W.2d 52 (Tenn. 1992)).",
      "researchConfidence": "medium",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": "Balancing Test"
    },
    "Texas": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Tex. Civ. Prac. & Rem. Code § 33.001",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Tex. Civ. Prac. & Rem. Code § 41.003",
      "punitiveDamagesCap": "Greater of $200,000, or 2x economic damages plus an amount equal to noneconomic damages up to $750,000 -- Tex. Civ. Prac. & Rem. Code § 41.008. Does not apply to certain felony-conduct-based claims.",
      "note": "PRIMARY-VERIFIED cap formula.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Rosas v. Buddies Food Store, 518 S.W.2d 534 (Tex. 1975)",
      "visitorClassificationNote": "Texas retains the full common-law tripartite classification and has not adopted a Rowland-style unified reasonable-care standard. The invitee duty (actual or constructive knowledge of an unreasonably dangerous condition) is the operative standard in the overwhelming majority of litigated premises cases. Note: the Rosas citation is based on general legal-research knowledge and was not independently re-confirmed via web search this session; verify before publication.",
      "elementsToProve": [
        "Actual or constructive knowledge of a condition on the premises by the owner/occupier",
        "The condition posed an unreasonable risk of harm",
        "The owner/occupier did not exercise reasonable care to reduce or eliminate the risk (e.g., by adequate warning or by making the condition reasonably safe)",
        "The owner/occupier's failure to use such care proximately caused the plaintiff's injury"
      ],
      "elementsCitation": "Corbin v. Safeway Stores, Inc., 648 S.W.2d 292 (Tex. 1983); Keetch v. Kroger Co., 845 S.W.2d 262 (Tex. 1992)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": true,
      "premisesLiabilityDistinctNote": "Texas is THE leading example of a state that treats a premises-liability claim (about a static/inert CONDITION) as legally distinct from an ordinary negligent-activity claim (about a contemporaneous ACTIVITY). Keetch v. Kroger Co., 845 S.W.2d 262 (Tex. 1992), holds that recovery on a negligent-activity theory requires the plaintiff to have been injured by or as a contemporaneous result of the activity itself, not by a condition the activity created; once the activity has ceased and only the resulting condition remains (there, a slippery floor after plant-spraying had ended), the claim sounds exclusively in premises liability, which requires proof the owner had actual or constructive knowledge of the condition. This matters enormously in practice: negligent-activity claims do not require proof of notice, but are only available while the activity is ongoing/contemporaneous with the injury; premises-defect claims require notice but apply to any static hazard regardless of who created it. The Texas Supreme Court has continued to police this line closely (e.g., in later slip-and-fall and construction-site cases), and mischaracterizing a claim as 'negligent activity' when it is really a 'premises defect' is an outcome-determinative pleading and jury-charge error in Texas practice.",
      "noticeRule": "Actual or constructive knowledge of the specific dangerous condition is required. Constructive notice requires proof it is 'more likely than not' that the condition existed long enough to give the proprietor a reasonable opportunity to discover it (Wal-Mart Stores, Inc. v. Gonzalez, 968 S.W.2d 934 (Tex. 1998)). A narrower exception exists where the premises owner's own conduct created the condition (e.g., its employee spilled the substance) — in that circumstance, some Texas authority treats the owner as charged with knowledge of what it created, but this is a narrower 'created-the-condition' rule, not a general mode-of-operation exception.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": "Wal-Mart Stores, Inc. v. Gonzalez, 968 S.W.2d 934 (Tex. 1998)",
      "openAndObviousDoctrine": "Traditional No-Duty Bar",
      "openAndObviousCitation": "Austin v. Kroger Texas, L.P., 465 S.W.3d 193 (Tex. 2015); Parker v. Highland Park, Inc., 565 S.W.2d 512 (Tex. 1978)",
      "openAndObviousNote": "Austin v. Kroger effectively revived the 'no duty' rule that Parker v. Highland Park (1978) had abolished: a landowner generally owes NO duty to warn of or make safe a condition that is open and obvious or already known to the invitee, because the invitee's awareness eliminates the landowner's duty altogether (rather than merely reducing damages via comparative fault). The Court retained a narrow 'necessary use' exception (drawn from Parker) for situations where the invitee had no practical choice but to encounter the known danger to complete a task the owner required. This is notably different from the Restatement Sec. 343A approach retained by many other states in this batch, which converts an open/obvious condition into a comparative-fault issue rather than a complete bar.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Texas Utilities Electric Co. v. Timmons, 947 S.W.2d 191 (Tex. 1997)",
      "attractiveNuisanceNote": "Texas closely follows the Restatement Sec. 339 five-element framework and requires an artificial condition; Texas courts have not fixed an outer age limit but most successful cases involve children roughly 12 or younger.",
      "negligentSecurityForeseeabilityTest": "Prior Similar Incidents, with an escalating-danger/immediate-circumstances extension",
      "negligentSecurityCitation": "Timberwalk Apartments, Partners, Inc. v. Cain, 972 S.W.2d 749 (Tex. 1998); Del Lago Partners, Inc. v. Smith, 307 S.W.3d 762 (Tex. 2010)",
      "negligentSecurityNote": "Timberwalk sets the baseline: foreseeability of third-party criminal conduct is judged by prior similar crimes on or near the property, weighed for proximity, recency, frequency, similarity, and publicity — evaluated prospectively, not with hindsight. Del Lago Partners expanded this by recognizing that foreseeability can also arise from an escalating situation immediately preceding the attack (there, an hours-long, increasingly violent altercation at a bar the owner failed to defuse), even absent a history of prior similar incidents. Practitioners should plead both theories where facts support them, since Texas has NOT adopted a broad totality-of-the-circumstances or specific-harm rule as its general test.",
      "additionalDefenses": "Texas Recreational Use Statute, Tex. Civ. Prac. & Rem. Code Ch. 75, sharply limits liability (down to a gross-negligence/willful-or-wanton/malicious standard) for owners who permit recreational entry, with enhanced protection for agricultural land. Texas uses proportionate responsibility (modified comparative fault, 51% bar) under Tex. Civ. Prac. & Rem. Code Ch. 33. Out-of-possession landlords generally owe no premises duty for conditions arising after the tenant takes possession absent a contractual undertaking to repair or unless the landlord retained control.",
      "researchConfidence": "high",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": "Prior Similar Incidents"
    },
    "Utah": {
      "faultRule": "Modified Comparative (50% Bar)",
      "faultRuleCitation": "Utah Code § 78B-5-818",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Utah Code § 78B-8-201",
      "punitiveDamagesCap": "No numeric statutory cap, but Utah uniquely redirects 50% of any punitive award above $50,000 to the state -- Utah Code § 78B-8-201(3)",
      "note": "Same split-recovery dynamic as Oregon -- materially changes practical incentives even without a hard dollar cap.",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Hale v. Beckstead, 2005 UT 24, 116 P.3d 263",
      "visitorClassificationNote": "Utah has not adopted a Rowland-style unified standard; it retains the tripartite classification but analyzes invitee claims through the lens of Restatement (Second) of Torts Secs. 343 and 343A read together, rather than the older, harsher common-law 'open and obvious' no-duty rule. The Hale citation reflects general legal-research knowledge cross-referenced with a secondary source describing 'the Hale court' adopting Secs. 343/343A; the exact reporter citation should be independently re-verified before publication.",
      "elementsToProve": [
        "Existence of a duty running from possessor to entrant (dependent on entrant's status)",
        "Breach of that duty (failure to exercise reasonable care commensurate with status)",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Jeffs v. West, 2012 UT 11, 275 P.3d 228 (general duty-analysis framework frequently applied in Utah premises cases)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Utah does not draw the Texas/Keetch-style distinction between a premises-defect claim and a negligent-activity claim; premises cases are analyzed under the ordinary negligence duty framework, calibrated by the entrant's status and by Restatement Secs. 343/343A.",
      "noticeRule": "Actual or constructive notice: the owner must have known, or through reasonable inspection should have known, of the hazard and had a reasonable opportunity to correct it.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Restatement (Second) of Torts Secs. 343, 343A, as applied in Utah case law (e.g., discussion in Hale v. Beckstead)",
      "openAndObviousNote": "Utah courts read Secs. 343 and 343A together: an owner is not liable merely because a danger was 'known or obvious,' UNLESS the owner should anticipate the harm despite the obviousness (e.g., because the invitee's attention will foreseeably be distracted, or the invitee has no reasonable alternative). This means an undiscoverable hazard raises a pure notice problem, a discoverable-but-undiscovered hazard raises constructive notice, and a truly obvious hazard shifts the focus to whether the owner should still have anticipated harm despite the obviousness — Utah's Supreme Court has not definitively resolved whether an unaddressed obvious hazard functions as a full bar or merely a comparative-fault factor, leaving some doctrinal ambiguity that should be flagged to Utah practitioners.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": "Restatement (Second) of Torts Sec. 339 (common-law adoption; also referenced indirectly in some municipal nuisance ordinances, e.g., Utah local code provisions listing 'attractive nuisance' hazards)",
      "attractiveNuisanceNote": "Utah recognizes the doctrine as an exception to the rule that landowners owe trespassers only a duty to refrain from willful/wanton injury, primarily protecting child trespassers. I could not independently confirm a specific landmark Utah Supreme Court case applying the full Restatement test within this session's search budget.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for Utah",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Utah — general secondary sources describe a totality-of-the-circumstances-style foreseeability inquiry (prior similar crimes, patterns of suspicious activity, property's crime-risk profile) as commonly applied, but I could not confirm a specific controlling Utah Supreme Court case articulating the test within the available search budget. Verify against primary Utah authority before publication.",
      "additionalDefenses": "Utah Recreational Use statute, Utah Code Title 57, Ch. 14, immunizes landowners who allow free recreational access from ordinary premises-liability duties (including a duty to warn), subject to a willful-misconduct exception. Utah applies modified comparative negligence (plaintiff barred if his/her fault equals or exceeds the defendant's, i.e., a 50% bar) under Utah Code Sec. 78B-5-818.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": null
    },
    "Vermont": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Vt. Stat. tit. 12, § 1036",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap identified.",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland)",
      "visitorClassificationCitation": "Sunday v. Stratton Corp., 136 Vt. 293, 390 A.2d 398 (1978)",
      "visitorClassificationNote": "Vermont abolished the common-law distinctions among invitees and licensees, holding that a landowner owes all lawful entrants a single duty of 'reasonable care in all circumstances.' This unified duty does NOT extend to trespassers, who are owed a lesser duty unless their presence was known or should reasonably have been anticipated by the owner. The duty is also non-delegable, meaning a landowner cannot escape it merely by leasing out occupancy to another.",
      "elementsToProve": [
        "Duty of reasonable care under all the circumstances",
        "Breach of that duty (failure to use reasonable diligence to maintain the property safely or to remedy/warn of known or discoverable hazards)",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Sunday v. Stratton Corp., 136 Vt. 293, 390 A.2d 398 (1978)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Vermont does not draw the Texas/Keetch-style distinction between a premises-defect claim and a negligent-activity claim; having unified the duty owed to all lawful visitors into a single reasonable-care standard, Vermont analyzes premises claims as ordinary negligence claims regardless of whether the alleged breach was a static condition or an ongoing activity.",
      "noticeRule": "The landowner must use reasonable diligence to discover and remedy hazardous conditions; actual or constructive notice of the specific hazard is the operative standard for liability.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Not independently verified with a specific Vermont Supreme Court citation in this session. Given Vermont's unified reasonable-care standard (which folds visitor-status distinctions into a single negligence inquiry) and Vermont's general adoption of comparative negligence, the strong inference is that an open/obvious condition functions as one factor bearing on breach and on the plaintiff's comparative fault rather than as an automatic, categorical no-duty bar — but this inference should be confirmed against a specific Vermont premises case before publication.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified with a specific Vermont case citation in this session; secondary sources describe Vermont as recognizing the doctrine (property owners can be liable for foreseeable dangers, like unfenced pools, that draw in child trespassers), consistent with the general Restatement Sec. 339 approach, but I could not confirm the controlling case.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for Vermont",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Vermont — I could not locate a specific controlling Vermont Supreme Court case articulating a foreseeability test for negligent security/third-party-crime claims within the available search budget.",
      "additionalDefenses": "Vermont's recreational-use statute, 12 V.S.A. Sec. 5793, provides that a landowner is not liable for injury to a person who enters land without paying consideration for a recreational use, absent willful or wanton misconduct; the statute does not apply to land owned by a municipality or the State, and a higher standard of care applies if a fee is charged. Vermont applies modified comparative negligence with a 51% bar (12 V.S.A. Sec. 1036).",
      "researchConfidence": "medium",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": null
    },
    "Virginia": {
      "faultRule": "Pure Contributory",
      "faultRuleCitation": "Virginia common law (judicially retained)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "$350,000 total per matter, regardless of the number of plaintiffs or defendants -- Va. Code § 8.01-38.1",
      "note": "One of only 5 pure contributory jurisdictions; punitive damages capped at a flat, relatively low $350,000 regardless of the underlying compensatory figure, unusual among states with a specific dollar cap (most tie the cap to a multiple of compensatory damages, so a large compensatory verdict yields a large punitive ceiling too -- Virginia's flat cap does not scale that way).",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser)",
      "visitorClassificationCitation": "Roll \"R\" Way Rinks, Inc. v. Smith, 218 Va. 321, 237 S.E.2d 157 (1977)",
      "visitorClassificationNote": "Virginia retains the full common-law tripartite classification and has not unified visitor duties. Invitees are owed ordinary care to maintain the premises in a reasonably safe condition and to warn of unsafe conditions the owner knows or should know of (unless the condition is open and obvious); licensees are owed only a duty to warn of known dangers not obvious to them, with no duty to inspect for unknown hazards; trespassers are generally owed no duty beyond refraining from willful/wanton injury.",
      "elementsToProve": [
        "Plaintiff's status as invitee, licensee, or trespasser (which fixes the duty owed)",
        "Breach of the duty corresponding to that status",
        "Proximate causation",
        "Damages"
      ],
      "elementsCitation": "Roll \"R\" Way Rinks, Inc. v. Smith, 218 Va. 321, 237 S.E.2d 157 (1977)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Virginia does not draw the Texas/Keetch-style distinction between a premises-defect claim and a negligent-activity claim. Virginia premises cases are analyzed as ordinary negligence claims, with the applicable duty defined by the entrant's classification rather than by whether the hazard was a static condition versus an ongoing activity.",
      "noticeRule": "The owner must have actual or constructive knowledge of the unsafe condition (i.e., knew or should have known through reasonable care) before a duty to warn or remedy attaches to invitees; licensees are owed a duty to warn only of dangers actually known to the owner.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Traditional No-Duty Bar",
      "openAndObviousCitation": "Roll \"R\" Way Rinks, Inc. v. Smith, 218 Va. 321, 237 S.E.2d 157 (1977)",
      "openAndObviousNote": "Virginia treats an open-and-obvious condition as eliminating the owner's duty to warn an invitee altogether (a true no-duty rule), rather than merely a factor for comparative fault — which is especially consequential in Virginia because of its pure contributory-negligence regime (see additionalDefenses). A hazard that could not have been discovered raises an ordinary notice failure; one that should have been discovered through reasonable inspection raises constructive notice; a genuinely open-and-obvious one cuts off the duty to warn entirely.",
      "attractiveNuisanceDoctrine": "Rejected/Not recognized",
      "attractiveNuisanceCitation": "Discussed in W.T. Muse, \"The Attractive Nuisance Doctrine in Virginia,\" 2 U. Rich. L. Rev. 279",
      "attractiveNuisanceNote": "Virginia is one of only two states (along with Maryland) that has never adopted the full attractive-nuisance doctrine. Virginia courts have nonetheless imposed liability in some child-trespasser cases involving hidden/latent dangers (e.g., an accessible high-voltage transformer) that are easily accessible to children known to congregate nearby, but this is treated as an application of ordinary-care principles to known child trespassers rather than adoption of the Restatement Sec. 339 doctrine itself.",
      "negligentSecurityForeseeabilityTest": "Prior Similar Incidents (a single sufficiently similar prior incident can suffice)",
      "negligentSecurityCitation": "Wright v. Webb, 234 Va. 527, 362 S.E.2d 919 (1987)",
      "negligentSecurityNote": "Wright v. Webb holds that, ordinarily, criminal assaults by third parties are not foreseeable, but evidence of prior criminal incidents on or near the property can establish the foreseeability necessary to impose a duty; Virginia does not categorically require multiple prior incidents — a single sufficiently similar one may suffice — but Virginia has not adopted a broad totality-of-the-circumstances test either.",
      "additionalDefenses": "Virginia is one of a small handful of jurisdictions (with Maryland, North Carolina, Alabama, and D.C.) still applying PURE CONTRIBUTORY NEGLIGENCE: any fault by the plaintiff, even 1%, bars recovery entirely. This makes the open-and-obvious no-duty rule and any comparative fault argument especially outcome-determinative in Virginia premises cases as compared to the other nine states in this batch.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": "Prior Similar Incidents"
    },
    "Washington": {
      "faultRule": "Pure Comparative",
      "faultRuleCitation": "Wash. Rev. Code § 4.22.005",
      "punitiveDamagesStandard": "PROHIBITED -- Washington does not recognize common-law punitive damages absent a specific enabling statute (a long-standing, frequently-litigated rule).",
      "punitiveDamagesCap": "Not applicable given the general prohibition above.",
      "note": "GENUINE OUTLIER -- do not model punitive exposure for an ordinary Washington premises-liability claim absent a specific statutory hook (e.g., certain consumer-protection-adjacent theories).",
      "visitorClassificationSystem": "Common-Law Tripartite (Invitee/Licensee/Trespasser), heavily governed by Restatement Secs. 343/343A",
      "visitorClassificationCitation": "Iwai v. State, 129 Wn.2d 84, 915 P.2d 1089 (1996)",
      "visitorClassificationNote": "Washington retains the tripartite classification (public invitee, business invitee, licensee, trespasser) but resolves the invitee duty largely through Restatement (Second) of Torts Secs. 343 and 343A as adopted in Iwai v. State, rather than through older rigid common-law formulas.",
      "elementsToProve": [
        "Possessor knew or through reasonable care would have discovered the condition and should have realized it involved an unreasonable risk of harm to invitees",
        "Possessor should have expected invitees would not discover or realize the danger, or would fail to protect themselves against it",
        "Possessor failed to exercise reasonable care to protect invitees against the danger",
        "Causation and damages"
      ],
      "elementsCitation": "Iwai v. State, 129 Wn.2d 84, 915 P.2d 1089 (1996) (adopting Restatement Sec. 343)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Washington does not have a formally distinct 'premises defect vs. negligent activity' cause-of-action split comparable to Texas's Keetch doctrine. Washington's Restatement Secs. 343/343A framework governs liability for dangerous conditions on land regardless of whether the hazard originated from a static condition or from an ongoing activity, though the specific facts can still affect how foreseeability and reasonable care are argued.",
      "noticeRule": "Actual or constructive notice: the possessor must know, or through the exercise of reasonable care would discover, the condition and its unreasonable risk before liability attaches to invitees.",
      "modeOfOperationRuleAdopted": true,
      "modeOfOperationCitation": "Pimentel v. Roundup Co., 100 Wn.2d 39, 666 P.2d 888 (1983)",
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A)",
      "openAndObviousCitation": "Iwai v. State, 129 Wn.2d 84, 915 P.2d 1089 (1996)",
      "openAndObviousNote": "Under Sec. 343A(1) as applied in Washington, a possessor is not liable for harm from a condition whose danger is known or obvious to the invitee UNLESS the possessor should anticipate the harm despite the obviousness (for example, where the invitee's attention is predictably distracted or has no reasonable alternative route). Washington courts have specifically held a landowner may still be liable even where the dangerous condition was known and obvious to the invitee, if the possessor should have anticipated the harm anyway — so a merely 'obvious' hazard does not by itself end the inquiry, unlike Texas's post-Austin no-duty rule.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339)",
      "attractiveNuisanceCitation": "Ochampaugh v. City of Seattle, 91 Wn.2d 514, 588 P.2d 1351 (1979)",
      "attractiveNuisanceNote": "Washington recognizes the doctrine for artificial conditions attractive to and dangerous for children trespassers, generally along Restatement Sec. 339 lines.",
      "negligentSecurityForeseeabilityTest": "Specific Harm Rule / narrower duty (declined to adopt broad Totality-of-the-Circumstances test)",
      "negligentSecurityCitation": "Nivens v. 7-11 Hoagy's Corner, 133 Wn.2d 192, 943 P.2d 286 (1997)",
      "negligentSecurityNote": "The Washington Supreme Court in Nivens held a business owes invitees a duty to protect against imminent or reasonably foreseeable criminal harm, but expressly declined to adopt a broad totality-of-the-circumstances or general notice-based duty to provide security personnel, reasoning that doing so would improperly shift the government's duty to prevent crime onto private businesses. This makes Washington's negligent-security duty comparatively narrower than in totality-of-the-circumstances jurisdictions, focused on specific, imminent, or clearly foreseeable danger rather than a generalized 'bad neighborhood/high-crime-area' showing.",
      "additionalDefenses": "Washington's recreational-use immunity statute, RCW 4.24.210, limits liability for landowners who allow the public to use land for outdoor recreation without a fee, absent known dangerous artificial latent conditions for which no warning was given. Washington is a pure comparative fault state (RCW 4.22.005) — a plaintiff can recover even if more than 50% at fault, with damages reduced proportionately, which is notably more plaintiff-favorable than the modified systems used by most other states in this batch.",
      "researchConfidence": "medium",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": "Specific Harm Rule"
    },
    "West Virginia": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Bradley v. Appalachian Power Co., 163 W.Va. 332 (1979)",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- W. Va. Code § 55-7-29",
      "punitiveDamagesCap": "NOT INDEPENDENTLY VERIFIED -- secondary sources disagree on the exact formula (a flat 4x compensatory versus a greater-of-$500,000-or-4x formula were both reported). Confirm current statutory text (W. Va. Code § 55-7-29) before relying on a specific figure.",
      "note": "",
      "visitorClassificationSystem": "Hybrid/Other — describe",
      "visitorClassificationCitation": "Mallet v. Pickens, 206 W. Va. 145, 522 S.E.2d 436 (1999); W. Va. Code Sec. 55-7-27; W. Va. Code Sec. 55-7-28",
      "visitorClassificationNote": "Mallet v. Pickens judicially abolished the common-law distinction between licensees and invitees, holding that landowners owe any non-trespassing entrant a duty of reasonable care under the circumstances; trespassers remain owed only a duty to refrain from willful or wanton injury, now codified at W. Va. Code Sec. 55-7-27. Separately, and importantly, the Legislature in 2015 enacted W. Va. Code Sec. 55-7-28 to LEGISLATIVELY RESTORE the open-and-obvious doctrine as a complete no-duty bar, overriding the West Virginia Supreme Court's 2013 decision in Hersh v. E-T Enterprises, Ltd. P'ship, 232 W. Va. 305, 752 S.E.2d 336 (2013), which had made open-and-obviousness merely a comparative-fault factor rather than a bar. So West Virginia's premises law is a hybrid: unified reasonable care for invitees/licensees (post-Mallet), but a statutorily reinstated categorical no-duty rule for open-and-obvious hazards.",
      "elementsToProve": [
        "Duty of reasonable care under the circumstances (for non-trespassing entrants)",
        "Breach of that duty",
        "Proximate causation",
        "Damages"
      ],
      "elementsCitation": "Mallet v. Pickens, 206 W. Va. 145, 522 S.E.2d 436 (1999)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "West Virginia does not draw the Texas/Keetch-style distinction between a premises-defect claim and a negligent-activity claim; premises claims are analyzed under the unified reasonable-care negligence standard set by Mallet v. Pickens.",
      "noticeRule": "Actual or constructive notice of the hazardous condition is required to establish breach of the reasonable-care duty.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Traditional No-Duty Bar (restored by statute)",
      "openAndObviousCitation": "W. Va. Code Sec. 55-7-28 (2015), overriding Hersh v. E-T Enterprises, Ltd. P'ship, 232 W. Va. 305 (2013)",
      "openAndObviousNote": "By statute, a possessor of real property owes no duty of care to protect others against dangers that are open, obvious, reasonably apparent, or as well known to the injured person as to the owner, and cannot be held civilly liable for injuries from such dangers — restoring West Virginia to a full no-duty bar and legislatively overruling Hersh's contrary holding that obviousness was merely a comparative-fault factor. A hazard that could not have been discovered remains an ordinary notice case; one that should have been discoverable raises constructive notice; a truly open-and-obvious one is now a complete bar to recovery in West Virginia, a notably defendant-favorable outlier compared to most other states in this batch (which follow the Restatement Sec. 343A comparative-fault-factor approach).",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339), presumed",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified for West Virginia with a specific controlling case in this session — the doctrine is widely assumed to be recognized at West Virginia common law along Restatement Sec. 339 lines, but I could not confirm a specific West Virginia Supreme Court of Appeals citation within the available search budget.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for West Virginia",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for West Virginia — I could not locate and confirm a controlling West Virginia case articulating a specific foreseeability test (prior similar incidents vs. totality vs. balancing) for negligent-security claims within the available search budget in this session.",
      "additionalDefenses": "W. Va. Code Sec. 55-7-27 codifies the trespasser no-duty (willful/wanton only) rule. West Virginia applies modified comparative fault with a 51% bar (part of the state's broader 2015 tort-reform package, alongside Sec. 55-7-28's open-and-obvious statute). West Virginia also has a recreational-use immunity statute (W. Va. Code Sec. 19-25-1 et seq.) limiting liability for owners who permit free recreational access to land.",
      "researchConfidence": "medium",
      "openAndObviousRule": "Traditional No-Duty Bar",
      "negligentSecurityTestNormalized": null
    },
    "Wisconsin": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Wis. Stat. § 895.045",
      "punitiveDamagesStandard": "Clear and Convincing Evidence -- Wis. Stat. § 895.043(3)",
      "punitiveDamagesCap": "Greater of $200,000 or 2x compensatory damages -- Wis. Stat. § 895.043(6)",
      "note": "",
      "visitorClassificationSystem": "Unified Reasonable Care (post-Rowland-style merger of licensee/invitee)",
      "visitorClassificationCitation": "Antoniewicz v. Reszczynski, 70 Wis.2d 836, 236 N.W.2d 1 (1975)",
      "visitorClassificationNote": "Antoniewicz abolished the distinction between the duty owed to licensees and invitees, creating a single common duty of ordinary care that a possessor of land owes to all non-trespassing persons on the land. Trespassers are treated separately and far more restrictively by statute: Wis. Stat. Sec. 895.529(2) provides that a possessor of real property owes NO duty of care to a trespasser except to refrain from willful, wanton, or reckless conduct (confirmed directly from the Wisconsin Civil Jury Instructions, Wis JI-Civil 8025).",
      "elementsToProve": [
        "Duty of ordinary care owed by the possessor to the entrant (or, for a trespasser, only a duty to refrain from willful/wanton/reckless conduct)",
        "Breach of that duty",
        "Causation",
        "Damages"
      ],
      "elementsCitation": "Antoniewicz v. Reszczynski, 70 Wis.2d 836, 236 N.W.2d 1 (1975)",
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Wisconsin does not draw the Texas/Keetch-style distinction between a premises-defect claim and a negligent-activity claim; ordinary premises cases are analyzed under the unified ordinary-care negligence standard from Antoniewicz. Note, however, that Wisconsin's separate Safe Place Statute (Wis. Stat. Sec. 101.11) DOES impose a distinct, heightened, non-delegable statutory duty for owners of 'public buildings' and employers regarding 'places of employment' — a genuinely Wisconsin-specific overlay on top of ordinary common-law premises negligence (see additionalDefenses/notice fields).",
      "noticeRule": "Actual or constructive notice of the hazardous condition under ordinary common-law premises claims. Separately, Wisconsin's Safe Place Statute (Sec. 101.11) imposes a heightened, structural/statutory duty on owners of public buildings to keep the premises 'as free from danger to the life, health, safety or welfare... as the nature of the place will reasonably permit' — a higher standard than ordinary negligence for qualifying structures, and one of the most litigated Wisconsin-specific premises doctrines.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "Comparative-Fault-Factor-Only",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Not independently verified with a specific Wisconsin Supreme Court citation in this session, but strongly inferable from Wisconsin's unified ordinary-care duty (Antoniewicz) combined with its comparative-negligence statute (Wis. Stat. Sec. 895.045, 51% bar): an open-and-obvious hazard functions as evidence bearing on breach and on the plaintiff's own negligence, not as a categorical no-duty bar. This should be confirmed against a specific Wisconsin premises case before publication.",
      "attractiveNuisanceDoctrine": "Adopted with modifications",
      "attractiveNuisanceCitation": "Wis. Stat. Sec. 895.529(3)(b); Christians v. Homestake Enterprises, Ltd., 101 Wis.2d 25, 303 N.W.2d 608 (1981); Restatement (Second) of Torts Sec. 339",
      "attractiveNuisanceNote": "Wisconsin has codified a five-element version of the Restatement Sec. 339 test at Wis. Stat. Sec. 895.529(3)(b) (confirmed directly from Wis JI-Civil 8025/8027): (1) an artificial condition inherently dangerous to children; (2) the possessor knew or should have known children trespassed; (3) the possessor knew or should have known the condition was inherently dangerous and posed an unreasonable risk of serious harm or death to children; (4) the child, due to youth, did not discover the condition or realize the risk; and (5) the possessor could have reasonably safeguarded against the danger without interfering with the condition's purpose. Notably, per the Wisconsin Civil Jury Instructions Committee, Wisconsin's comparative-negligence statute does NOT apply to reduce a child's recovery on an attractive-nuisance claim — a genuinely practitioner-relevant nuance.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for Wisconsin",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Wisconsin — I could not confirm a controlling Wisconsin case articulating a specific foreseeability test (prior similar incidents vs. totality vs. balancing) for negligent-security claims within the available search budget in this session.",
      "additionalDefenses": "Wisconsin's Safe Place Statute (Wis. Stat. Sec. 101.11) imposes a heightened, non-delegable duty on owners of public buildings and employers regarding places of employment, distinct from and more protective of plaintiffs than ordinary common-law premises negligence — a major Wisconsin-specific doctrine practitioners must separately plead and prove where applicable. Wisconsin also has a broad recreational-immunity statute (Wis. Stat. Sec. 895.52) that is one of the most protective in the nation for landowners who permit recreational access. Wisconsin applies modified comparative negligence with a 51% bar (Wis. Stat. Sec. 895.045).",
      "researchConfidence": "high",
      "openAndObviousRule": "Comparative-Fault-Factor-Only",
      "negligentSecurityTestNormalized": null
    },
    "Wyoming": {
      "faultRule": "Modified Comparative (51% Bar)",
      "faultRuleCitation": "Wyo. Stat. § 1-1-109",
      "punitiveDamagesStandard": "Clear and Convincing Evidence",
      "punitiveDamagesCap": "No statutory cap -- Wyoming's constitution (art. 10, § 4) has been read to prohibit the legislature from capping damages for death or personal injury.",
      "note": "",
      "visitorClassificationSystem": "Hybrid/Other — describe",
      "visitorClassificationCitation": "Clarke v. Beckwith, 858 P.2d 293 (Wyo. 1993) (per search-engine-summarized secondary source; NOT independently confirmed against primary case text this session)",
      "visitorClassificationNote": "Search results indicate Wyoming judicially merged the licensee and invitee categories, extending the invitee (reasonable care) duty to licensees, while trespassers remain a separate, lower-duty category. However, this specific case citation came only from an AI-generated search summary and was NOT independently confirmed against the primary case text in this session — verify Clarke v. Beckwith's holding and citation against a primary source (Westlaw/Lexis/official reporter) before relying on it for publication.",
      "elementsToProve": [
        "Duty owed based on entrant status (reasonable care for invitees/licensees; refrain from willful/wanton conduct toward trespassers)",
        "Breach of that duty",
        "Causation",
        "Damages"
      ],
      "elementsCitation": null,
      "premisesLiabilityDistinctFromOrdinaryNegligence": false,
      "premisesLiabilityDistinctNote": "Wyoming does not appear to draw the Texas/Keetch-style formal distinction between a premises-defect claim and a negligent-activity claim; no source located in this session suggests Wyoming treats these as separate causes of action. Premises claims are analyzed as ordinary negligence claims calibrated by entrant status.",
      "noticeRule": "Actual or constructive notice of the hazardous condition (standard formulation); not independently pinned to a specific Wyoming Supreme Court citation in this session.",
      "modeOfOperationRuleAdopted": false,
      "modeOfOperationCitation": null,
      "openAndObviousDoctrine": "No-Duty-to-Warn-but-Duty-to-Remedy (Restatement Second Sec. 343A), tentative",
      "openAndObviousCitation": null,
      "openAndObviousNote": "Secondary sources indicate Wyoming land possessors continue to owe a duty to exercise reasonable care to protect invitees from an unreasonable risk of harm even where the condition is open and obvious, with the condition's obviousness remaining 'a relevant inquiry' rather than an automatic bar — consistent with the Restatement Sec. 343A comparative-fault-oriented approach used by most non-Texas states in this batch. I could not confirm a specific controlling Wyoming Supreme Court citation for this proposition within the available search budget; verify before publication.",
      "attractiveNuisanceDoctrine": "Adopted (Restatement Second Sec. 339), presumed",
      "attractiveNuisanceCitation": null,
      "attractiveNuisanceNote": "Not independently verified for Wyoming with a specific controlling case in this session.",
      "negligentSecurityForeseeabilityTest": "Not independently verified for Wyoming",
      "negligentSecurityCitation": null,
      "negligentSecurityNote": "Not independently verified for Wyoming — I could not locate or confirm a controlling Wyoming case articulating a specific foreseeability test for negligent-security claims within the available search budget in this session.",
      "additionalDefenses": "Wyoming's Recreational Use Statute (Wyo. Stat. Sec. 34-19-101 et seq.) limits landowner liability for persons using land for recreational purposes without charge. Wyoming also has a Recreation Safety Act addressing inherent risks of certain sports/recreational activities (relevant given the state's ski and outdoor-recreation industry), which can bar claims arising from inherent risks of those activities regardless of ordinary premises-liability principles. Wyoming applies modified comparative negligence with a 50% bar (Wyo. Stat. Sec. 1-1-109).",
      "researchConfidence": "low",
      "openAndObviousRule": "No-Duty-to-Warn-but-Duty-to-Remedy",
      "negligentSecurityTestNormalized": null
    }
  }
};
