/* =========================================================
   CREdocket — Litigation Value Estimator: full report generation
   Adapted from the original commercial-lease-dispute-only report
   (PR #3) to work across all 8 litigation categories — dynamic
   role labels (sideA/sideB per category, not just landlord/tenant),
   plus real case citations per claim, which the original didn't have.
   ========================================================= */

window.CV_REPORT = (function () {
  "use strict";

  function fmtMoney(n) { return n < 0 ? "-$" + Math.round(-n).toLocaleString("en-US") : "$" + Math.round(n).toLocaleString("en-US"); }
  function fmtMoneyRange(range) {
    if (!range) return "—";
    return Math.round(range[0]) === Math.round(range[1]) ? fmtMoney(range[0]) : fmtMoney(range[0]) + " – " + fmtMoney(range[1]);
  }
  function pct(range) { return Math.round(range[0] * 100) + "–" + Math.round(range[1] * 100) + "%"; }

  function requestFullReport(evalResult, ctx) {
    if (!evalResult || !evalResult.claims || !evalResult.claims.length) {
      alert("Estimate a matter first to generate a report.");
      return;
    }
    generatePdf(evalResult, ctx);
  }

  function generatePdf(evalResult, ctx) {
    if (typeof window.jspdf === "undefined") {
      alert("PDF generation isn't available right now — please try again in a moment.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const marginX = 56;
    let y = 64;
    const pageW = doc.internal.pageSize.getWidth();
    const maxW = pageW - marginX * 2;
    const NAVY = "#1B2A4A";
    const GOLD = "#9C7A32";
    const MUTED = "#5A5A5A";
    const INK = "#222222";

    function addPageIfNeeded(needed) {
      if (y + needed > 740) { doc.addPage(); y = 64; }
    }
    function heading(text, size) {
      addPageIfNeeded(30);
      doc.setFont("helvetica", "bold"); doc.setFontSize(size); doc.setTextColor(NAVY);
      doc.text(text, marginX, y);
      y += size * 0.9;
    }
    function body(text, opts) {
      opts = opts || {};
      doc.setFont("helvetica", opts.bold ? "bold" : "normal");
      doc.setFontSize(opts.size || 10.5);
      doc.setTextColor(opts.color || INK);
      const lines = doc.splitTextToSize(text, maxW);
      addPageIfNeeded(lines.length * 14 + 6);
      doc.text(lines, marginX, y);
      y += lines.length * 14 + (opts.gap || 8);
    }
    function rule() {
      addPageIfNeeded(14);
      doc.setDrawColor(216, 211, 196); doc.line(marginX, y, pageW - marginX, y);
      y += 16;
    }
    // A real column-aligned table -- claim, likelihood, damages if
    // successful, expected value -- so the reader can see how the case
    // value range (and the best-guess figure on the title page) was
    // actually reached in one look, the same way the on-screen summary
    // table works. colWidths must sum to maxW.
    function table(headers, rows, colWidths, opts) {
      opts = opts || {};
      addPageIfNeeded(24);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(NAVY);
      let x = marginX;
      headers.forEach((h, i) => { doc.text(h, x, y); x += colWidths[i]; });
      y += 6;
      doc.setDrawColor(156, 122, 50); doc.setLineWidth(1);
      doc.line(marginX, y, marginX + colWidths.reduce((a, b) => a + b, 0), y);
      y += 14;
      rows.forEach((row, rowIdx) => {
        const isTotal = opts.totalRowIndex === rowIdx;
        doc.setFont("helvetica", isTotal ? "bold" : "normal");
        doc.setFontSize(9);
        doc.setTextColor(isTotal ? NAVY : INK);
        const wrapped = row.map((cell, i) => doc.splitTextToSize(String(cell), colWidths[i] - 8));
        const lineCount = Math.max(...wrapped.map((w) => w.length));
        addPageIfNeeded(lineCount * 12 + 8);
        if (isTotal) {
          doc.setDrawColor(216, 211, 196);
          doc.line(marginX, y - 6, marginX + colWidths.reduce((a, b) => a + b, 0), y - 6);
        }
        let cx = marginX;
        wrapped.forEach((lines, i) => { doc.text(lines, cx, y); cx += colWidths[i]; });
        y += lineCount * 12 + 6;
      });
      y += 8;
    }

    const roleLabel = ctx.side === "sideA" ? ctx.roles.sideA : ctx.roles.sideB;

    // Title page
    doc.setFillColor(254, 253, 251); doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), "F");
    y = 220;
    doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(NAVY);
    doc.text("Litigation Value Estimate", marginX, y);
    y += 30;
    doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(MUTED);
    doc.text(ctx.categoryLabel, marginX, y);
    y += 24;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor("#B45309");
    doc.text("BETA — MODELING IN ACTIVE DEVELOPMENT", marginX, y);
    y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(MUTED);
    doc.text(`Prepared ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} — CREdocket Litigation Value Estimator`, marginX, y);
    y += 40;
    doc.setDrawColor(156, 122, 50); doc.setLineWidth(1.2);
    doc.line(marginX, y, marginX + 200, y); y += 20;
    if (typeof ctx.bestGuessValue === "number") {
      doc.setFont("helvetica", "bold"); doc.setFontSize(26); doc.setTextColor(NAVY);
      doc.text(fmtMoney(ctx.bestGuessValue), marginX, y);
      y += 16;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(MUTED);
      doc.text(`Best-guess case value — ${roleLabel} view`, marginX, y);
      y += 20;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(INK);
      doc.text(`Full range: ${fmtMoneyRange(ctx.net)}`, marginX, y);
    } else {
      doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(NAVY);
      doc.text(fmtMoneyRange(ctx.net), marginX, y);
      y += 18;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(MUTED);
      doc.text(`Estimated net position — ${roleLabel} view`, marginX, y);
    }

    doc.addPage(); y = 64;

    heading("Disclaimer", 13);
    body("This is a beta tool. The underlying probability and damages modeling is still being actively developed and refined as more real case data is incorporated — the ranges in this report should be treated as an early, evolving estimate, not a finished or stable model.", { size: 9, color: "#B45309", bold: true, gap: 10 });
    body("This report is an informational estimate for negotiation and planning purposes only. It is not legal advice, does not predict the outcome of any specific case, and does not create an attorney-client relationship. Every probability and damages range is anchored to a specific legal rule and/or cited comparable case outcomes — but real outcomes depend on facts, evidence, judge, venue, and arguments an automated tool cannot fully weigh. Consult qualified local counsel before making any decision based on this estimate.", { size: 9, color: MUTED, gap: 16 });

    if (ctx.likelyOutcome) {
      heading("Executive Discovery", 13);
      body(ctx.likelyOutcome, { size: 10.5, gap: 16 });
      rule();
    }

    heading("Summary", 13);
    body(`Category: ${ctx.categoryLabel}`, { bold: true, gap: 4 });
    body(`Your side: ${roleLabel}`, { bold: true, gap: 4 });
    if (typeof ctx.bestGuessValue === "number") {
      body(`Best-guess case value: ${fmtMoney(ctx.bestGuessValue)}`, { bold: true, size: 12, gap: 4 });
      body(`Full range: ${fmtMoneyRange(ctx.net)}`, { gap: 16 });
    } else {
      body(`Total estimated net position: ${fmtMoneyRange(ctx.net)}`, { bold: true, size: 12, gap: 16 });
    }
    rule();

    if (evalResult.claims && evalResult.claims.length) {
      heading("Damage & Probability Modeling", 13);
      body("How the case value range above was reached -- likelihood and damages for each claim, and the resulting expected value.", { size: 9, color: MUTED, gap: 10 });
      const rows = evalResult.claims.map((c) => [
        c.label,
        c.probability ? pct(c.probability) : "—",
        c.damagesRange ? fmtMoneyRange(c.damagesRange) : "—",
        c.expectedValueRange && !c.isBenchmark ? fmtMoneyRange(c.expectedValueRange) : "—",
      ]);
      rows.push(["Net position", "", "", fmtMoneyRange(ctx.net)]);
      table(["Claim", "Likelihood", "Damages if successful", "Expected value"], rows, [190, 75, 130, 105], { totalRowIndex: rows.length - 1 });
      rule();
    }

    if (ctx.costData) {
      const { costEstimate, netAfterCosts, comparison } = ctx.costData;
      heading("Cost to Litigate & Settlement Comparison", 13);
      body(`Estimated attorney fees (${costEstimate.pathLabel}): ${fmtMoneyRange(costEstimate.costRange)}`, { gap: 4 });
      body(`Estimated time to resolution: ${costEstimate.monthsRange[0]}–${costEstimate.monthsRange[1]} months`, { gap: 4 });
      body(`Net position after litigation costs: ${fmtMoneyRange(netAfterCosts)}`, { bold: true, size: 11.5, gap: 8 });
      body(costEstimate.isCustom ? "Uses your own attorney-fee estimate." : "Uses general commercial-litigation industry cost norms for this category — not individually cited to a real case the way the claim analysis above is.", { size: 8.5, color: MUTED, gap: 8 });
      if (comparison) {
        let verdict;
        if (comparison.clearlyFavorsLitigating) verdict = `Litigating clears the ${fmtMoney(comparison.settlementOnTable)} settlement on the table even in the worst-case scenario.`;
        else if (comparison.clearlyFavorsSettling) verdict = `The ${fmtMoney(comparison.settlementOnTable)} settlement on the table beats litigating even in the best-case scenario.`;
        else verdict = `Result depends on where the actual outcome lands within the range — litigating could net more or less than the ${fmtMoney(comparison.settlementOnTable)} settlement on the table.`;
        body(verdict, { bold: true, size: 10, color: NAVY, gap: 12 });
      }
      rule();
    }

    heading("Claim-by-Claim Analysis", 14);
    evalResult.claims.forEach((c) => {
      addPageIfNeeded(90);
      const claimSpec = ctx.catSpec && ctx.catSpec.claimTypes ? ctx.catSpec.claimTypes[c.claimKey] : null;
      const claimSideLabel = claimSpec && claimSpec.side === "sideA" ? ctx.roles.sideA : claimSpec && claimSpec.side === "sideB" ? ctx.roles.sideB : "";
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(NAVY);
      doc.text(c.label, marginX, y); y += 16;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(MUTED);
      const metaLine = `${claimSideLabel ? claimSideLabel + " claim  |  " : ""}Likelihood: ${pct(c.probability)}${c.damagesRange ? "  |  Damages if successful: " + fmtMoneyRange(c.damagesRange) : ""}`;
      doc.text(metaLine, marginX, y);
      y += 16;
      if (c.expectedValueRange && !c.isBenchmark) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(NAVY);
        doc.text(`Expected value: ${fmtMoneyRange(c.expectedValueRange)}`, marginX, y);
        y += 16;
      }
      if (c.note) body(c.note, { size: 9.5, color: INK, gap: 10 });
      if (c.citations && c.citations.length) {
        doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(GOLD);
        addPageIfNeeded(14);
        doc.text("Grounded in real cases:", marginX, y);
        y += 13;
        c.citations.slice(0, 3).forEach((cit) => {
          const line = `${cit.caseName}${cit.year ? " (" + cit.year + ")" : ""}${cit.dollarAmount ? " — " + fmtMoney(cit.dollarAmount) : ""}`;
          body(line, { size: 8.5, color: MUTED, gap: 4 });
        });
        y += 6;
      }
      rule();
    });

    if (ctx.narrative) {
      heading("Comprehensive Analysis", 14);
      body(ctx.narrative, { size: 9.5, gap: 16 });
      rule();
    }

    heading("Methodology", 13);
    body("This is a structured, rules-based expected-value model (probability of success × damages, summed across applicable claims), not a statistical prediction from a licensed litigation-analytics platform. Probability ranges are calibrated against real, cited case outcomes and, where relevant, verified state law. Expected value = probability × damages for each claim; the total is the sum across all identified claims for your side, presented as a range rather than a single figure.", { size: 9.5, color: MUTED, gap: 16 });

    heading("About CREdocket", 13);
    body("CREdocket tracks litigation, regulatory actions, and legal developments affecting commercial real estate owners, managers, developers, and REITs. Learn more at credocket.com.", { size: 9.5, color: MUTED });

    const fname = `Litigation_Value_Estimate_${(ctx.categoryLabel || "estimate").replace(/[^a-zA-Z0-9]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fname);
  }

  return { requestFullReport };
})();
