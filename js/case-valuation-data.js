/* =========================================================
   CREdocket — Litigation Value Estimator: engine spec + citations
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
              "discountRate": [0.05, 0.09],
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
              "formula": "monthlyRent * holdoverMultiplier * holdoverMonths",
              "note": "holdoverMultiplier pulled from the specific state's chapter text, not assumed"
            }
          },
          "attorney_fees": {
            "side": "sideA",
            "label": "Attorney's Fees",
            "appliesIf": "hasFeeShiftingClause",
            "baseProbability": "weighted average of probabilities of the other pursued claims",
            "damages": {
              "formula": "principalDamages * feeRatio",
              "feeRatio": "tiered by principal size, not a flat ratio -- under $100k: [0.20, 0.40]; $100k-$1M: [0.08, 0.20]; over $1M: [0.01, 0.06]",
              "note": "Attorney fees scale sub-linearly with claim size -- litigating a small claim still costs a similar baseline in hours, while a large claim's fees don't grow proportionally with the dollars at stake. See The Village at Brocks Gap, LLC v. Singleton Ventures, LLC citation, where fees + costs totaled ~1.3% of a ~$4.19M accelerated-rent recovery -- far below a flat 15-40% assumption."
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
              "formula": "actualDamages + (statutoryPenaltyMultiplier ? actualDamages * (statutoryPenaltyMultiplier - 1) : 0)",
              "note": "actualDamages = relocation + lost inventory + provable lost profits, minus any lease consequential-damages waiver; statutoryPenaltyMultiplier pulled per-state from handbook chapter, not assumed to exist"
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
              "formula": "outstandingLoanBalance + accruedInterestAndFees + lenderProtectiveAdvances - foreclosureSaleProceeds",
              "researchNote": "19-case sample: undisputed defaults produce stipulated judgments tracking loan balance closely (AFF IV 200 Miami v. Stonerock: $65.7M judgment on $41.1M principal). Recovery-against-judgment varies enormously by asset quality — severely impaired assets can see near-zero sale recovery (750 Lexington Ave: $155.9M judgment, property reverted for $1,000 after zero-bid auction) up to ~45% (KeyBank Tower Columbus: $5.1M sale vs $9.3M claim). Lender protective advances (taxes, insurance) can meaningfully inflate the judgment beyond original principal (Hillsboro Beach Resort: $26M loan + ~$2.9M advances = $40M judgment). Deficiency-judgment AVAILABILITY itself varies by state/foreclosure method — needs a state-law modifier, not yet built."
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
            "damages": {
              "formula": "guaranteedLoanBalance (full recourse) or triggerSpecificLossAmount (springing/partial carve-out)",
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
            "note": "Confirmed low (kept at 0.15–0.35): 19-case sample shows 1980s-era cases succeeded with large verdicts (K.M.C. v. Irving Trust, Barrett v. Bank of America, $6.6–$7.5M) under now-dated, more borrower-friendly doctrine. Recent CRE lender-liability suits (Steinway Tower/111 W57, Via Mizner/Mandarin Oriental) are trending toward procedural wins (reinstated claims, remands, a 6-week TRO) rather than dollar outcomes, and take years to resolve even when they eventually succeed.",
            "damages": {
              "formula": "comparable-case-informed range; consequential/lost-profit damages often limited by loan-agreement waiver clauses",
              "isRange": true
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
            "note": "Stanford Securities Class Action Clearinghouse (the designated primary source) was inaccessible for this research pass (site under construction, expected back Winter 2026) — rerun once it's back online, since it would likely surface more, smaller mortgage-REIT and non-traded-REIT settlements this pass couldn't find via general web search.",
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
            "note": "Sample too thin to refine (both sampled cases — Princeton/TWBTA, Clark Construction/Perkins Eastman — have undisclosed final outcomes, only amounts sought). Base rate kept at the original preliminary estimate.",
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
            "note": "PRELIMINARY -- outcome heavily contract-language-dependent (broad-form vs. comparative-fault indemnity clauses, which many states restrict or void by statute)",
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
              "note": "PRELIMINARY -- allocationShare is fact-specific (equitable factors under CERCLA §113(f)); refine typical allocation patterns from research",
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
            "note": "Revised DOWN slightly from the original preliminary estimate: the small sample skewed toward insurers winning on pollution-exclusion/site-development-exclusion grounds (Regency Centers v. Indian Harbor: no coverage owed for legacy dry-cleaner contamination). None of the 3 sampled cases disclosed the underlying remediation-cost dollar figure — the disclosed 'outcome' in this claim type is frequently binary (coverage owed / not owed) rather than a dollar figure.",
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
            "note": "Revised UP from the original preliminary estimate: all 3 sampled challenges succeeded in invalidating the rezoning (Allen Distribution, Lathan, Chaffier). Treat this cautiously — successful challenges are more likely to get published/cited as precedent than unsuccessful ones, so this small sample may be outcome-selection-biased upward. Remedy is categorically injunctive/declaratory (invalidating the ordinance), never damages."
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
            "note": "Sample (2 cases, Mammoth Lakes $30M+fees and Cle Elum $22M arbitration award) is both small and success-skewed — no losing case was found with comparable documentation. Base rate kept at the original preliminary estimate pending a more balanced sample; treat the high end of the damages range with real confidence (both anchor cases are well-documented) but the probability range as still largely a placeholder."
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
      },
      {
        "caseName": "The Village at Brocks Gap, LLC v. Singleton Ventures, LLC",
        "citation": "Case No. CV-2020-900604 (Cir. Ct. Jefferson Cnty., Ala., Bessemer Div.) (Pl.'s Mot. Summ. J., filed Feb. 17, 2022)",
        "jurisdiction": "AL",
        "year": 2022,
        "outcome": "The landlord's motion sought attorneys' fees of $52,905.00 plus $3,526.06 in costs -- together representing only about 1.3% of the $4,189,177.66 in rental damages sought in the same filing, a useful real-world data point that attorney-fee awards do not scale linearly with the size of a commercial lease claim.",
        "dollarAmount": 52905,
        "url": null,
        "confidence": "high",
        "notes": "Same filing as the accelerated_rent and releasing_mitigation_costs citations for this category. Illustrates the low end of the fee-to-damages ratio for a large accelerated-rent claim; contrast with the smaller claims in this array, where fees run a much higher percentage of the principal. No public URL available for this record -- verify via the case number and court above."
      }
    ],
    "property_damage": [],
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
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Alaska": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Arizona": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Arkansas": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "See chapter"
    },
    "California": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Colorado": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Connecticut": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Varies",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Delaware": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Varies",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "District of Columbia": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Florida": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Georgia": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Hawaii": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Idaho": {
      "classification": "Neutral",
      "selfHelpAvailable": "Uncertain",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Illinois": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Indiana": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Iowa": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Uncertain",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Kansas": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Kentucky": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Louisiana": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Maine": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Uncertain",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Maryland": {
      "classification": "Neutral",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Massachusetts": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Michigan": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Minnesota": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "No",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Mississippi": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Missouri": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Montana": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Nebraska": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Nevada": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "Varies",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "New Hampshire": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "New Jersey": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "New Mexico": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Uncertain",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "New York": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "North Carolina": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "North Dakota": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Ohio": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Oklahoma": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Oregon": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "Often Separate",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Pennsylvania": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Rhode Island": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "South Carolina": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "South Dakota": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "See chapter"
    },
    "Tennessee": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Texas": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Utah": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "See chapter"
    },
    "Vermont": {
      "classification": "Neutral",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "Varies",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Virginia": {
      "classification": "Landlord-Friendly",
      "selfHelpAvailable": "Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "Washington": {
      "classification": "Neutral",
      "selfHelpAvailable": "Not Available",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    },
    "West Virginia": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "See chapter"
    },
    "Wisconsin": {
      "classification": "Tenant-Friendly",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine",
      "mitigationDuty": "Unclear",
      "holdoverStatutoryPenalty": true,
      "accelerationClauseNote": "See chapter"
    },
    "Wyoming": {
      "classification": "Neutral",
      "selfHelpAvailable": "Conditional",
      "possessionDamagesCombined": "May Combine (cap applies)",
      "mitigationDuty": "Yes",
      "holdoverStatutoryPenalty": false,
      "accelerationClauseNote": "Generally enforceable if expressly stated"
    }
  }
};
