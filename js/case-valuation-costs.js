/* =========================================================
   CREdocket — Case Value Calculator: cost-to-litigate layer
   Turns "here's your exposure" into "does litigating actually beat
   settling, net of what it costs to get there." These cost/timeline
   ranges are general commercial-litigation industry norms (published
   cost surveys, typical fee patterns by case complexity) — NOT
   individually cited to a specific real case the way the probability/
   damages numbers elsewhere in this tool are. Flagged as such
   everywhere they're shown, on purpose: this tool's whole credibility
   rests on being honest about what's grounded in a real citation and
   what's a general estimate.
   ========================================================= */

(function () {
  "use strict";

  // [low, high] — legal fees only, doesn't include expert witnesses,
  // court costs, or the value of management time diverted to the matter.
  const COST_NORMS = {
    "lease-disputes": {
      settlementOrMotion: { cost: [8000, 35000], months: [2, 6] },
      trial: { cost: [40000, 120000], months: [8, 18] }
    },
    "lending-foreclosure": {
      settlementOrMotion: { cost: [15000, 50000], months: [3, 9] },
      trial: { cost: [75000, 250000], months: [12, 24] }
    },
    "reit-securities": {
      settlementOrMotion: { cost: [75000, 300000], months: [6, 18] },
      trial: { cost: [500000, 3000000], months: [24, 48] }
    },
    "construction-defect": {
      settlementOrMotion: { cost: [40000, 150000], months: [6, 14] },
      trial: { cost: [200000, 750000], months: [18, 36] }
    },
    "environmental": {
      settlementOrMotion: { cost: [50000, 200000], months: [8, 18] },
      trial: { cost: [300000, 1000000], months: [24, 48] }
    },
    "eminent-domain": {
      settlementOrMotion: { cost: [20000, 75000], months: [4, 10] },
      trial: { cost: [100000, 350000], months: [12, 24] }
    },
    "zoning-land-use": {
      settlementOrMotion: { cost: [15000, 60000], months: [3, 9] },
      trial: { cost: [75000, 250000], months: [12, 24] }
    }
  };

  /**
   * @param {string} categorySlug
   * @param {object} opts
   *   expectToTrial: boolean — user's expectation of whether this goes to trial
   *   customCostLow/customCostHigh: number — user override in dollars, replaces the norm entirely if provided
   * @returns {object} { costRange: [lo,hi], monthsRange: [lo,hi], isCustom: bool, pathLabel: string }
   */
  function estimateCost(categorySlug, opts) {
    opts = opts || {};
    const norms = COST_NORMS[categorySlug] || COST_NORMS["lease-disputes"];
    const path = opts.expectToTrial ? norms.trial : norms.settlementOrMotion;
    const pathLabel = opts.expectToTrial ? "litigated through trial" : "resolved via settlement or dispositive motion, without a full trial";

    if (typeof opts.customCostLow === "number" && typeof opts.customCostHigh === "number") {
      return { costRange: [opts.customCostLow, opts.customCostHigh], monthsRange: path.months, isCustom: true, pathLabel };
    }
    return { costRange: path.cost, monthsRange: path.months, isCustom: false, pathLabel };
  }

  /**
   * Net position after litigation costs, and — if the user has an actual
   * settlement offer on the table — a direct comparison against it.
   * @param {[number,number]} netRange - the existing engine's net expected value range
   * @param {object} costEstimate - output of estimateCost()
   * @param {number|null} settlementOnTable - a real number the user is actually weighing
   */
  function compareToSettlement(netRange, costEstimate, settlementOnTable) {
    const netAfterCosts = [
      netRange[0] - costEstimate.costRange[1], // worst case: low recovery, high cost
      netRange[1] - costEstimate.costRange[0]  // best case: high recovery, low cost
    ];
    let comparison = null;
    if (typeof settlementOnTable === "number") {
      comparison = {
        settlementOnTable,
        deltaRange: [netAfterCosts[0] - settlementOnTable, netAfterCosts[1] - settlementOnTable],
        // true only if litigating clears the settlement offer even in the worst case
        clearlyFavorsLitigating: netAfterCosts[0] > settlementOnTable,
        // true only if the settlement offer beats litigating even in the best case
        clearlyFavorsSettling: netAfterCosts[1] < settlementOnTable
      };
    }
    return { netAfterCosts, comparison };
  }

  window.RELAW_VALUATION_COSTS = { estimateCost, compareToSettlement, COST_NORMS };
})();
