/* =========================================================
   CREdocket — Commercial Eviction Handbook: PDF export
   Mirrors js/premises-liability-report.js's jsPDF pattern for visual
   consistency across CREdocket's PDF exports. Unlike that file, most
   of this handbook's chapter text lives in Supabase rather than a
   local data file, so this fetches every state in one query before
   building the PDF (its RLS policy grants SELECT to anon +
   authenticated unconditionally -- see
   handbook_project/schema_eviction_guide_make_free.sql -- but the
   button itself still requires a signed-in session, consistent with
   the page's own per-chapter sign-in gate in js/eviction-guide.js).
   ========================================================= */

(function () {
  "use strict";
  const btn = document.getElementById("eg-download-btn");
  if (!btn || typeof EVICTION_GUIDE_DATA === "undefined") return;

  const sb = window.RELAW_SUPABASE;
  const originalLabel = btn.innerHTML;

  function setBusy(label) {
    btn.disabled = true;
    btn.innerHTML = label;
  }
  function resetButton() {
    btn.disabled = false;
    btn.innerHTML = originalLabel;
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
    if (!sb) {
      alert("Couldn't reach the database — please reload and try again.");
      return;
    }

    setBusy("Fetching chapters…");
    let rows = [];
    try {
      const { data, error } = await sb.from("eviction_guide_chapters").select("slug, blurb, sections");
      if (error) throw error;
      rows = data || [];
    } catch (err) {
      resetButton();
      alert("Couldn't load the full handbook right now — please try again in a moment.");
      return;
    }
    const bySlug = {};
    rows.forEach((r) => { bySlug[r.slug] = r; });
    setBusy("Building PDF…");

    const d = EVICTION_GUIDE_DATA;
    const STATES = d.states.filter((s) => s.slug !== d.freeStateSlug).sort((a, b) => a.name.localeCompare(b.name));

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
    function classificationColor(c) {
      if (c === "Landlord-Friendly") return "#16a34a";
      if (c === "Tenant-Friendly") return "#dc2626";
      return "#64748b";
    }
    function chapter(name, chapterNum, classification, blurb, sections) {
      addPageIfNeeded(90);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(NAVY);
      doc.text(`Chapter ${chapterNum}: ${name}`, marginX, y); y += 16;
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(classificationColor(classification));
      doc.text(classification, marginX, y); y += 16;
      if (blurb) body(blurb, { size: 9.5, color: MUTED, gap: 10 });
      (sections || []).forEach((sec) => {
        addPageIfNeeded(24);
        doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.setTextColor(GOLD);
        doc.text(sec.label, marginX, y); y += 13;
        body(sec.content, { size: 9.5, gap: 10 });
      });
      rule();
    }

    // ---------- Title page ----------
    doc.setFillColor(254, 253, 251); doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), "F");
    y = 220;
    doc.setFont("helvetica", "bold"); doc.setFontSize(24); doc.setTextColor(NAVY);
    doc.text(d.meta.title, marginX, y, { maxWidth: maxW });
    y += 56;
    doc.setFont("helvetica", "normal"); doc.setFontSize(13); doc.setTextColor(MUTED);
    doc.text(d.subtitle || d.meta.subtitle, marginX, y, { maxWidth: maxW });
    y += 24;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(MUTED);
    doc.text(`${d.meta.edition} — ${d.meta.publisher}, prepared ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`, marginX, y);
    y += 30;
    doc.setDrawColor(156, 122, 50); doc.setLineWidth(1.2);
    doc.line(marginX, y, marginX + 200, y); y += 24;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(INK);
    doc.text("Statutory Notice, Self-Help / Commercial Lockout, Jurisdiction & Venue, Timing, and", marginX, y); y += 15;
    doc.text("Damages — for all 50 states plus D.C.", marginX, y); y += 15;
    doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor("#16a34a");
    y += 14;
    doc.text("FREE with a CREdocket account — no purchase required.", marginX, y);

    doc.addPage(); y = 64;

    // ---------- Scope & Disclaimer ----------
    heading("Scope & Disclaimer", 13);
    body(d.scope, { size: 9.5, color: MUTED, gap: 12 });
    body(d.disclaimer, { size: 9.5, color: MUTED, gap: 12 });
    body(d.revisionBasis, { size: 8.5, color: MUTED, gap: 16 });
    rule();

    // ---------- Texas ----------
    heading("Chapters", 15);
    body("Each chapter answers the same five questions. Classification is a general orientation tool, not a prediction of any specific case's outcome.", { size: 9, color: MUTED, gap: 14 });
    const txMeta = d.states.find((s) => s.slug === d.freeStateSlug);
    chapter(txMeta.name, txMeta.chapter, txMeta.classification, d.texasFull.blurb, d.texasFull.sections);

    // ---------- Every other state ----------
    STATES.forEach((s) => {
      const row = bySlug[s.slug];
      if (row) {
        chapter(s.name, s.chapter, s.classification, row.blurb, row.sections);
      } else {
        addPageIfNeeded(60);
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(NAVY);
        doc.text(`Chapter ${s.chapter}: ${s.name}`, marginX, y); y += 16;
        body("This chapter wasn't available at the time this PDF was generated.", { size: 9.5, color: MUTED, gap: 10 });
        rule();
      }
    });

    heading("About CREdocket", 13);
    body("CREdocket tracks litigation, regulatory actions, and legal developments affecting commercial real estate owners, managers, developers, and REITs. Learn more at credocket.com.", { size: 9.5, color: MUTED });

    const fname = `Commercial_Eviction_Handbook_CREdocket_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fname);
    resetButton();
  }

  btn.addEventListener("click", () => { generatePdf(); });
})();
