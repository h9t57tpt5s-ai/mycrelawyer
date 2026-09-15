/* =========================================================
   CREdocket — Lease Clause Redline Checker: full report generation
   Mirrors js/case-valuation-report.js's structure and visual style
   (same NAVY/GOLD/MUTED palette, same heading/body/rule helpers) so a
   subscriber who uses both AI tools gets a consistent-feeling
   deliverable, not two differently-designed PDFs. This is a genuinely
   separate file, not a shared module, because the underlying data
   shape is different enough (clause term-by-term comparison vs.
   claim-by-claim probability/damages) that sharing one generator would
   mean threading two incompatible shapes through the same functions.
   ========================================================= */

window.LR_REPORT = (function () {
  "use strict";

  function notify(message, opts) {
    if (window.RELAW_UTILS && window.RELAW_UTILS.showToast) window.RELAW_UTILS.showToast(message, opts);
    else alert(message);
  }

  function requestFullReport(json) {
    if (!json || !json.analysis) {
      notify("Analyze a clause first to generate a report.", { error: true });
      return;
    }
    generatePdf(json);
  }

  function generatePdf(json) {
    if (typeof window.jspdf === "undefined") {
      notify("PDF generation isn't available right now — please try again in a moment.", { error: true });
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
    // Same generic low/moderate/high risk palette as the on-screen
    // .lr-risk-level styling (--ui-success/--ui-warning/--ui-danger) --
    // hex-coded here since a PDF can't reference CSS custom properties.
    const RISK_COLOR = { low: "#1a8a5f", moderate: "#B45309", high: "#d94949" };

    function addPageIfNeeded(needed) { if (y + needed > 740) { doc.addPage(); y = 64; } }
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
    function subHeading(text) {
      const size = 11;
      addPageIfNeeded(size * 0.95 + 10);
      doc.setFillColor(156, 122, 50);
      doc.rect(marginX, y - size * 0.72, 5, 5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(size); doc.setTextColor(NAVY);
      doc.text(text, marginX + 12, y);
      y += size * 0.95 + 4;
    }

    const a = json.analysis || {};
    const clauseSpec = (window.LEASE_REDLINE_DATA && window.LEASE_REDLINE_DATA.clauseTypes[json.clauseType]) || null;
    const riskLevel = (a.overallRiskLevel || "").toLowerCase();
    const riskColor = RISK_COLOR[riskLevel] || MUTED;
    const BADGE_LABEL = {
      "market-standard": "Market Standard", "favors-landlord": "Favors Landlord",
      "favors-tenant": "Favors Tenant", "unusual-or-unclear": "Unusual / Unclear",
      "not-addressed": "Not Addressed",
    };

    // Title page
    doc.setFillColor(254, 253, 251); doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), "F");
    y = 220;
    doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(NAVY);
    doc.text("Lease Clause Redline Report", marginX, y);
    y += 30;
    doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(MUTED);
    doc.text(`${json.clauseTypeLabel || "Lease Clause"} — Representing ${json.representingParty || "—"}`, marginX, y);
    y += 24;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor("#B45309");
    doc.text("BETA — MODELING IN ACTIVE DEVELOPMENT", marginX, y);
    y += 18;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(MUTED);
    doc.text(`Prepared ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} — CREdocket Lease Clause Redline Checker`, marginX, y);
    y += 40;
    doc.setDrawColor(156, 122, 50); doc.setLineWidth(1.2);
    doc.line(marginX, y, marginX + 200, y); y += 30;
    doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(riskColor);
    doc.text(`${(a.overallRiskLevel || "UNKNOWN").toUpperCase()} RISK`, marginX, y);
    y += 16;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(MUTED);
    doc.text("Overall risk to the side you represent, across every term reviewed below.", marginX, y);

    doc.addPage(); y = 64;

    heading("Disclaimer", 13);
    body("This is a beta tool. \"Market standard\" reflects common negotiated middle ground across institutional commercial leases generally — it varies by asset class, submarket, and relative negotiating leverage, and is not itself grounded in case law or statute the way this site's other tools are.", { size: 9, color: "#B45309", bold: true, gap: 10 });
    body((window.LEASE_REDLINE_DATA && window.LEASE_REDLINE_DATA.disclaimer) || "This tool is not legal advice, does not review the clause for enforceability or drafting defects a court might find, and does not create an attorney-client relationship. Have any clause reviewed by qualified counsel before relying on it.", { size: 9, color: MUTED, gap: 16 });

    if ((a.topConcerns || []).length) {
      heading("Top Concerns", 13);
      a.topConcerns.forEach((c) => body("•  " + c, { size: 10, gap: 8 }));
      rule();
    }

    if (clauseSpec && clauseSpec.keyTerms && clauseSpec.keyTerms.length) {
      heading("Term-by-Term Comparison", 14);
      clauseSpec.keyTerms.forEach((termMeta) => {
        const aiTerm = a[termMeta.id];
        if (!aiTerm) return;
        addPageIfNeeded(110);
        doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(NAVY);
        doc.text(termMeta.label, marginX, y);
        const badgeText = BADGE_LABEL[aiTerm.marketComparison] || aiTerm.marketComparison || "";
        if (badgeText) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(GOLD);
          doc.text(badgeText.toUpperCase(), pageW - marginX - doc.getTextWidth(badgeText.toUpperCase()), y);
        }
        y += 18;
        if (aiTerm.whatTheClauseSays) body(`What your clause says: ${aiTerm.whatTheClauseSays}`, { size: 9.5, gap: 6 });
        if (aiTerm.explanation) body(aiTerm.explanation, { size: 9.5, color: INK, gap: 8 });
        subHeading("Reference");
        body(`Market standard: ${termMeta.marketStandard}`, { size: 8.5, color: MUTED, gap: 4 });
        body(`Favors landlord: ${termMeta.landlordFavorable}`, { size: 8.5, color: MUTED, gap: 4 });
        body(`Favors tenant: ${termMeta.tenantFavorable}`, { size: 8.5, color: MUTED, gap: 10 });
        rule();
      });
    }

    if ((a.suggestedRevisions || []).length) {
      heading("Suggested Revisions", 13);
      a.suggestedRevisions.forEach((r) => {
        body(r.issue, { bold: true, size: 10.5, gap: 4 });
        body(r.suggestion, { size: 9.5, color: MUTED, gap: 12 });
      });
      rule();
    }

    if (a.narrative) {
      heading("Comprehensive Analysis", 13);
      const paragraphs = a.narrative.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      (paragraphs.length ? paragraphs : [a.narrative]).forEach((p, i, arr) => {
        body(p, { size: 9.5, gap: i === arr.length - 1 ? 18 : 8 });
      });
      rule();
    }

    heading("About CREdocket", 13);
    body("CREdocket tracks litigation, regulatory actions, and legal developments affecting commercial real estate owners, managers, developers, and REITs. Learn more at credocket.com.", { size: 9.5, color: MUTED });

    const fname = `Lease_Clause_Redline_${(json.clauseTypeLabel || "report").replace(/[^a-zA-Z0-9]+/g, "_")}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fname);
  }

  return { requestFullReport };
})();
