/* =========================================================
   CREdocket -- Case Value Estimator: full report generation
   NOTE: Not yet gated behind payment -- this is intentional for now,
   so the product itself can be reviewed/tested before we wire up a
   Stripe Payment Link + Supabase purchase table for it (same pattern
   as the handbook, once pricing/access is decided).
   ========================================================= */

window.CV_REPORT = (function () {
  "use strict";

  function fmtMoney(n) { return "$" + Math.round(n).toLocaleString(); }
  function fmtMoneyRange(range) { return fmtMoney(range[0]) + " - " + fmtMoney(range[1]); }
  function pct(range) { return Math.round(range[0] * 100) + "-" + Math.round(range[1] * 100) + "%"; }

  function requestFullReport(result, answers) {
    if (!result || !result.claims || !result.claims.length) {
      alert("Complete the questionnaire first to generate a report.");
      return;
    }
    generatePdf(result, answers);
  }

  function generatePdf(result, answers) {
    if (typeof window.jspdf === "undefined") {
      alert("PDF generation isn't available right now -- please try again in a moment.");
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

    // Title page
    doc.setFillColor(254, 253, 251); doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), "F");
    y = 220;
    doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(NAVY);
    doc.text("Case Value Estimate", marginX, y);
    y += 30;
    doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(MUTED);
    doc.text(`Commercial Lease Dispute -- ${answers.state}`, marginX, y);
    y += 20;
    doc.setFontSize(10);
    doc.text(`Prepared ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} -- CREdocket Case Value Estimator`, marginX, y);
    y += 40;
    doc.setDrawColor(156, 122, 50); doc.setLineWidth(1.2);
    doc.line(marginX, y, marginX + 200, y); y += 20;
    doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(NAVY);
    doc.text(fmtMoneyRange(result.totalRange), marginX, y);
    y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(MUTED);
    doc.text(answers.role === "landlord" ? "Estimated net recovery range" : "Estimated net exposure/recovery range", marginX, y);

    doc.addPage(); y = 64;

    heading("Disclaimer", 13);
    body("This report is an informational estimate for negotiation and planning purposes only. It is not legal advice, does not predict the outcome of any specific case, and does not create an attorney-client relationship. Every probability and damages range is anchored to the subject state's verified law and, where available, cited comparable case outcomes -- but real outcomes depend on facts, evidence, judge, venue, and arguments an automated tool cannot fully weigh. Consult qualified local counsel before making any decision based on this estimate.", { size: 9, color: MUTED, gap: 16 });

    heading("Summary", 13);
    body(`Role: ${answers.role === "landlord" ? "Landlord (plaintiff-side claims)" : "Tenant (plaintiff-side claims)"}`, { bold: true, gap: 4 });
    body(`Jurisdiction: ${answers.state}`, { bold: true, gap: 4 });
    body(`Monthly rent: ${fmtMoney(answers.monthlyRent)} | Remaining term at dispute: ${answers.remainingMonths} months`, { gap: 4 });
    body(`Total estimated range: ${fmtMoneyRange(result.totalRange)}`, { bold: true, size: 12, gap: 16 });
    rule();

    heading("Claim-by-Claim Analysis", 14);
    result.claims.forEach((c) => {
      addPageIfNeeded(90);
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(NAVY);
      doc.text(c.label, marginX, y); y += 16;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9.5); doc.setTextColor(MUTED);
      doc.text(`${c.side === "landlord" ? "Landlord claim" : "Tenant claim"}  |  Probability of success: ${pct(c.probabilityRange)}  |  Damages if successful: ${fmtMoneyRange(c.damagesRange)}`, marginX, y);
      y += 16;
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(NAVY);
      doc.text(`Expected value: ${fmtMoneyRange(c.expectedRange)}`, marginX, y);
      y += 16;
      body(c.why, { size: 9.5, color: INK, gap: 18 });
      rule();
    });

    heading("Methodology", 13);
    body("This is a structured, rules-based expected-value model (probability of success x damages, summed across claims), not a statistical prediction from a licensed litigation-analytics platform. Probability ranges are calibrated against the subject state's verified commercial-eviction law (statutory notice, self-help availability, mitigation duty, and damages rules) and, where available, real published case outcomes. Expected value = probability x damages for each claim; the total is the sum across all identified claims for your side, presented as a range rather than a single figure.", { size: 9.5, color: MUTED, gap: 16 });

    heading("About CREdocket", 13);
    body("CREdocket tracks litigation, regulatory actions, and legal developments affecting commercial real estate owners, managers, developers, and REITs. Learn more at credocket.com.", { size: 9.5, color: MUTED });

    const fname = `Case_Value_Estimate_${(answers.state || "state").replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fname);
  }

  return { requestFullReport };
})();
