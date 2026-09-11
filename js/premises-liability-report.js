/* =========================================================
   CREdocket — Premises Liability & Negligence Handbook: PDF export
   Free, no purchase gate -- unlike the Case Value Calculator's report
   (js/case-valuation-report.js), which this file's jsPDF helper
   pattern is deliberately mirrored from for visual consistency across
   CREdocket's PDF exports. Reads the general-framework text straight
   out of the DOM (rather than duplicating it as literal strings here)
   so the PDF can never drift from what the page itself says, and
   reads the 51-jurisdiction table straight out of
   CASE_VALUATION_DATA.premisesLiabilityStateModifiers so it can never
   drift from what powers the Case Value Calculator's own Premises
   Liability / Negligence category.
   ========================================================= */

(function () {
  "use strict";
  const btn = document.getElementById("pl-download-btn");
  if (!btn) return;

  function textOf(id) {
    const el = document.getElementById(id);
    return el ? el.textContent.trim() : "";
  }

  async function loadImageDataUrl(url) {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function generatePdf() {
    if (!window.RELAW_AUTH || !window.RELAW_AUTH.getSession()) {
      if (window.RELAW_AUTH) window.RELAW_AUTH.openSignInModal();
      return;
    }
    if (typeof window.jspdf === "undefined") {
      alert("PDF generation isn't available right now — please try again in a moment.");
      return;
    }
    if (typeof CASE_VALUATION_DATA === "undefined" || !CASE_VALUATION_DATA.premisesLiabilityStateModifiers) {
      alert("Handbook data isn't available right now — please reload and try again.");
      return;
    }
    const MODS = CASE_VALUATION_DATA.premisesLiabilityStateModifiers;
    const STATES = Object.keys(MODS).sort();

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

    // ---------- Title page ----------
    doc.setFillColor(254, 253, 251); doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), "F");
    y = 220;
    doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(NAVY);
    doc.text("Premises Liability & Negligence Handbook", marginX, y, { maxWidth: maxW });
    y += 56;
    doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(MUTED);
    doc.text("A 51-Jurisdiction Reference Guide", marginX, y);
    y += 24;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(MUTED);
    doc.text(`Prepared ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })} — CREdocket Litigation Tools`, marginX, y);
    y += 30;
    doc.setDrawColor(156, 122, 50); doc.setLineWidth(1.2);
    doc.line(marginX, y, marginX + 200, y); y += 24;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(INK);
    doc.text("Elements to prove, defenses available, the comparative/contributory fault rule, and", marginX, y); y += 15;
    doc.text("the standard to recover punitive damages — for every state plus D.C.", marginX, y); y += 15;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor("#16a34a");
    y += 14;
    doc.text("FREE — no purchase required for any jurisdiction.", marginX, y);

    doc.addPage(); y = 64;

    // ---------- Disclaimer ----------
    heading("Disclaimer", 13);
    body("This is general legal information for orientation purposes only — not legal advice for any specific matter, and not a substitute for a licensed attorney in the relevant jurisdiction. Comparative-fault rules, punitive-damages standards, and statutory caps change through legislation and case law; always confirm current, binding authority before relying on anything in this document.", { size: 9.5, color: MUTED, gap: 12 });
    body("Every state-specific figure in this handbook traces to a cited statute or case, cross-checked against the same research used to power CREdocket's Case Value Calculator (Premises Liability / Negligence category). Where secondary sources disagreed and a figure could not be independently confirmed, this handbook says so explicitly rather than presenting an unverified number.", { size: 9.5, color: MUTED, gap: 16 });
    rule();

    // ---------- General framework (pulled straight from the page) ----------
    heading("The General Framework", 14);
    body("Eight questions where the real answer is almost always \"it depends on the state\" -- this framework is the map, not the territory. Each state's own chapter below gives the actual, cited answer for that jurisdiction.", { size: 9, color: MUTED, gap: 12 });

    const FRAMEWORK_TOPICS = [
      ["1. Elements to Prove", "pl-elements-text"],
      ["2. Visitor Classification", "pl-classification-text"],
      ["3. Is Premises Liability Its Own Claim?", "pl-distinct-text"],
      ["4. Notice & Mode of Operation", "pl-notice-text"],
      ["5. Open & Obvious Hazards", "pl-openobvious-text"],
      ["6. Attractive Nuisance", "pl-attractive-text"],
      ["7. When a Crime Is Committed on the Premises", "pl-security-text"],
      ["8. Comparative Fault & Punitive Damages", "pl-punitive-text"]
    ];
    FRAMEWORK_TOPICS.forEach(([label, id]) => {
      heading(label, 12);
      body(textOf(id), { size: 9.5, gap: 12 });
    });
    heading("Other Recurring Defenses", 12);
    body(textOf("pl-defenses-text"), { size: 9.5, gap: 14 });
    rule();

    // ---------- State-by-state reference ----------
    doc.addPage(); y = 64;
    heading("State-by-State Reference", 15);
    body("All 50 states plus D.C. Fields marked \"not independently verified\" reflect this handbook's discipline of never presenting a fabricated citation -- confirm those against a primary source before relying on them in an actual matter.", { size: 9, color: MUTED, gap: 16 });

    function fieldBlock(label, valueText, citation, extraNote) {
      addPageIfNeeded(28);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(GOLD);
      doc.text(label, marginX, y); y += 12;
      const citeSuffix = citation ? ` — ${citation}` : " (not independently verified)";
      body(`${valueText || "Not yet researched"}${citeSuffix}`, { size: 9, gap: extraNote ? 4 : 8 });
      if (extraNote) body(extraNote, { size: 8.5, color: MUTED, gap: 8 });
    }

    STATES.forEach((name) => {
      const m = MODS[name];
      addPageIfNeeded(90);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(NAVY);
      doc.text(name, marginX, y); y += 18;

      fieldBlock("Visitor Classification System", m.visitorClassificationSystem, m.visitorClassificationCitation, m.visitorClassificationNote);

      addPageIfNeeded(20);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(GOLD);
      doc.text("Elements to Prove", marginX, y); y += 12;
      if (Array.isArray(m.elementsToProve) && m.elementsToProve.length) {
        m.elementsToProve.forEach((el, i) => body(`${i + 1}. ${el}`, { size: 9, gap: 4 }));
      } else {
        body("Not yet researched", { size: 9, gap: 4 });
      }
      body(m.elementsCitation ? `— ${m.elementsCitation}` : "(citation not independently verified)", { size: 8.5, color: MUTED, gap: 8 });

      addPageIfNeeded(20);
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(GOLD);
      doc.text(`Distinct From Ordinary Negligence? ${m.premisesLiabilityDistinctFromOrdinaryNegligence ? "YES" : "NO"}`, marginX, y); y += 12;
      body(m.premisesLiabilityDistinctNote || "Not yet researched", { size: 9, gap: 8 });

      const modeOfOp = m.modeOfOperationRuleAdopted === true ? "Yes" : m.modeOfOperationRuleAdopted === "partial" ? "Partially" : m.modeOfOperationRuleAdopted === false ? "No" : "Unclear";
      fieldBlock("Notice Requirement", m.noticeRule, null, `Mode-of-operation rule adopted: ${modeOfOp}${m.modeOfOperationCitation ? " — " + m.modeOfOperationCitation : ""}`);

      fieldBlock("Open & Obvious Hazards", m.openAndObviousDoctrine, m.openAndObviousCitation, m.openAndObviousNote);
      fieldBlock("Attractive Nuisance", m.attractiveNuisanceDoctrine, m.attractiveNuisanceCitation, m.attractiveNuisanceNote);
      fieldBlock("Negligent Security Foreseeability Test", m.negligentSecurityForeseeabilityTest, m.negligentSecurityCitation, m.negligentSecurityNote);
      fieldBlock("Comparative / Contributory Fault Rule", m.faultRule, m.faultRuleCitation);
      fieldBlock("Other State-Specific Defenses", m.additionalDefenses, null);
      fieldBlock("Punitive Damages: Evidentiary Standard", m.punitiveDamagesStandard, null);
      fieldBlock("Punitive Damages: Statutory Cap", m.punitiveDamagesCap, null);

      if (m.note) body(m.note, { size: 8, color: MUTED, gap: 8 });
      if (m.researchConfidence) body(`Research confidence: ${m.researchConfidence}`, { size: 8, color: MUTED, gap: 8 });
      rule();
    });

    heading("About the Author", 13);
    addPageIfNeeded(90);
    try {
      const imgData = await loadImageDataUrl("img/jeff-novel.png");
      doc.addImage(imgData, "PNG", marginX, y, 64, 64);
    } catch (err) { /* image optional -- text bio still renders without it */ }
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(NAVY);
    doc.text("Jeff Novel", marginX + 76, y + 14);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(MUTED);
    doc.text("Contributing Author, CREdocket", marginX + 76, y + 28);
    y += 76;
    body("Jeff has spent over two decades trying commercial real estate disputes in state and federal courtrooms, and before arbitration panels, nationwide. He represents developers, retailers, and multifamily owners and managers in landlord-tenant and lease disputes, construction and contractor claims, purchase-and-sale and title fights, and premises liability and negligence matters arising on commercial property.", { size: 9.5, color: MUTED, gap: 10 });
    body("That trial experience — including the duty, notice, and comparative-fault fights this guide covers — shapes the state-by-state guidance in it.", { size: 9.5, color: MUTED, gap: 10 });
    body("Full bio & recent analysis: credocket.com/author-jeff-novel.html", { size: 9, color: MUTED, gap: 14 });
    rule();

    heading("About CREdocket", 13);
    body("CREdocket tracks litigation, regulatory actions, and legal developments affecting commercial real estate owners, managers, developers, and REITs. Learn more at credocket.com.", { size: 9.5, color: MUTED });

    const fname = `Premises_Liability_Negligence_Handbook_CREdocket_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fname);
  }

  btn.addEventListener("click", generatePdf);
})();
