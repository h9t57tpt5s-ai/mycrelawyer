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
  // No predictions logged yet as of 2026-09-15 -- this registry was
  // just built. The first entries require a signed-in session running
  // real analyses on real pending matters; see the instructions above.
];
