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
  }
};
