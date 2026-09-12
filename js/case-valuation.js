/* =========================================================
   CREdocket — Case Value Calculator page logic
   -----------------------------------------------------------
   One unified, AI-first interface: the user describes their case in a
   single freeform text bar and/or drops in documents. There's no more
   category or side dropdown, and no more per-category manual-field
   questionnaire -- the litigation category is classified server-side
   (from the description + any document text combined), so every
   estimate now runs through the AI backend and is gated on purchased
   analysis credits.

   Document text extraction happens entirely client-side (PDF via
   pdf.js, .docx via mammoth.js, .txt via FileReader) -- the raw file
   is never uploaded or stored anywhere; only the extracted text is
   sent to the case-valuation-analyze Edge Function, which already
   enforces the credit balance and rate limit server-side. Until an
   ANTHROPIC_API_KEY secret is set on that function, a real submission
   comes back as HTTP 501 "not_configured" -- that's the correct, safe
   behavior, not a bug in this file.
   ========================================================= */

(function () {
  "use strict";
  // The client-side rules engine (js/case-valuation-engine.js) and its
  // shared case-law data file (js/case-valuation-data.js) were both
  // removed from this page along with the manual-entry form they served
  // -- the litigation category, facts, and every dollar figure now come
  // back from the AI backend's response instead of being computed here.
  // These three tiny formatting helpers are all that's left of what used
  // to be `window.RELAW_VALUATION`'s exports; kept as plain local
  // functions rather than reviving a dependency on either deleted file.
  const V = {
    fmt: (n) => (n < 0 ? "-$" + Math.round(-n).toLocaleString("en-US") : "$" + Math.round(n).toLocaleString("en-US")),
    fmtRange: (lo, hi) => (Math.round(lo) === Math.round(hi) ? V.fmt(lo) : `${V.fmt(lo)} – ${V.fmt(hi)}`),
    pct: (r) => `${Math.round(r[0] * 100)}–${Math.round(r[1] * 100)}%`,
  };

  // ---- CONFIG ---------------------------------------------------------
  const STRIPE_PAYMENT_LINK_URL = "https://buy.stripe.com/dRm9AL34yaOSeLJetz1B601";
  const PRICE_DISPLAY = "$49 one-time — 10 analysis credits";
  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  // Same publishable key as js/supabase-client.js -- safe to ship
  // client-side by design (Supabase governs access via RLS).
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  const ANALYZE_FN_URL = SUPABASE_URL + "/functions/v1/case-valuation-analyze";
  // 50,000 was confirmed (via Supabase's own function logs -- execution_time_ms
  // 150325, sb_error_code WORKER_RESOURCE_LIMIT) to run past the free-tier
  // 150s wall-clock ceiling on a real 3-document submission. Cut hard until
  // the project is on a paid plan with real headroom (400s) -- this is a
  // stopgap to keep testing usable, not a permanent size target.
  const MAX_DOC_CHARS = 18000;
  // --------------------------------------------------------------------

  const sb = window.RELAW_SUPABASE;

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const uploadHost = document.getElementById("cv-upload-host");
  const resultsHost = document.getElementById("cv-results-host");
  const form = document.getElementById("cv-form");
  if (!uploadHost || !resultsHost || !form) return;

  /* ---------- entitlement checks ----------------------------------
     getCreditBalance(): live remaining-credit count -- gates the whole
     "describe your case / upload documents" analysis flow, since every
     analysis now runs through the AI backend (which also classifies the
     litigation category from the description + document text -- there's
     no more client-side category dropdown to key a free deterministic
     estimate off of). Every purchase adds credits; they're consumed one
     per analysis and never expire. */
  async function getCreditBalance() {
    const [{ data: purchases, error: pErr }, { count, error: cErr }] = await Promise.all([
      sb.from("case_valuation_purchases").select("credits_granted"),
      sb.from("case_valuation_analyses").select("id", { count: "exact", head: true })
    ]);
    if (pErr || cErr) return null;
    const total = (purchases || []).reduce((s, p) => s + (p.credits_granted || 0), 0);
    const used = count || 0;
    return { total, used, remaining: total - used };
  }

  function claimResultHtml(c) {
    const evRange = c.expectedValueRange;
    return `
      <div class="cv-claim-card">
        <div class="cv-claim-top">
          <h4>${c.label}</h4>
          <span class="cv-prob">${V.pct ? V.pct(c.probability) : `${Math.round(c.probability[0] * 100)}–${Math.round(c.probability[1] * 100)}%`} likelihood</span>
        </div>
        ${c.damagesRange ? `<div class="cv-damages">Damages range: ${V.fmtRange(c.damagesRange[0], c.damagesRange[1])}</div>` : ""}
        ${evRange && !c.isBenchmark ? `<div class="cv-ev">Expected value: <strong>${V.fmtRange(evRange[0], evRange[1])}</strong></div>` : ""}
        ${c.note ? `<p class="cv-note">${c.note}</p>` : ""}
        ${(c.citations || []).length ? `<div class="cv-citations"><div class="cv-citations-label">Grounded in real cases:</div>${c.citations.map((cit) => `
          <div class="cv-citation">
            ${cit.url ? `<a href="${cit.url}" target="_blank" rel="noopener">${cit.caseName}</a>` : cit.caseName}
            ${cit.year ? ` (${cit.year})` : ""}
            ${cit.dollarAmount ? ` — ${V.fmt(cit.dollarAmount)}` : ""}
          </div>`).join("")}</div>` : ""}
      </div>`;
  }

  function collectCostFacts() {
    const out = {};
    document.querySelectorAll("[data-cost-key]").forEach((el) => {
      const key = el.getAttribute("data-cost-key");
      const type = el.getAttribute("data-type");
      const raw = el.value;
      if (raw === "") return;
      if (type === "boolean") out[key] = raw === "true";
      else out[key] = parseFloat(raw);
    });
    return out;
  }

  // The user's side ("sideA"/"sideB") relative to whatever category the
  // backend classifies -- captured via the lightweight two-button toggle
  // inside the case-description card (see uploadZoneHtml()/wireUploadZone()
  // below), since there's no more category-specific role-labeled <select>
  // to key this off of: the category itself is now classified server-side
  // from the freeform description + document text combined, not chosen by
  // the user up front. cvUserSideChosen tracks whether the user
  // deliberately picked a side (vs. it being auto-filled from AI-extracted
  // facts in renderAiResult below).
  let cvUserSide = null;
  let cvUserSideChosen = false;

  // Auto-grows a textarea to fit its content, chat-bar style, instead of
  // showing an internal scrollbar.
  function autoGrowTextarea(el) {
    // Guards against measuring scrollHeight while the element (or an
    // ancestor) hasn't been laid out yet -- e.g. read synchronously right
    // after an innerHTML swap, before the browser has resolved a real
    // width for it -- which can otherwise wrap the placeholder text into
    // an enormous, wrong scrollHeight that then gets baked in as a fixed
    // inline height. If the box doesn't have a sane width yet, defer one
    // frame and try again instead of trusting a bogus reading now.
    if (el.offsetWidth < 40) {
      requestAnimationFrame(() => autoGrowTextarea(el));
      return;
    }
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 480) + "px";
  }

  // The form no longer has its own submit button -- the actual call to
  // action lives inside the async, credit-gated card rendered into
  // #cv-upload-host (see renderUploadZone() below), since every estimate
  // now runs through the AI backend. This is just a safety net so an
  // Enter keypress in one of the cost-section number fields can't trigger
  // a real page navigation/reload.
  form.addEventListener("submit", (e) => e.preventDefault());

  /* =========================================================
     Case description + document upload / AI analysis -- gated to users
     with remaining analysis credits. Extracts uploaded-document text
     client-side, sends it (together with the freeform case description)
     to the Edge Function -- which enforces credits + rate limit
     server-side regardless of what this UI shows, and classifies the
     litigation category itself from that combined text -- then uses the
     response to render the full result: net position, claim-by-claim
     breakdown with citations, and the AI-written narrative.
     ========================================================= */

  async function extractPdfText(file) {
    const buf = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({ data: buf }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      text += content.items.map((it) => it.str).join(" ") + "\n\n";
    }
    return text.trim();
  }

  async function extractDocxText(file) {
    const buf = await file.arrayBuffer();
    const result = await window.mammoth.extractRawText({ arrayBuffer: buf });
    return result.value.trim();
  }

  async function extractText(file) {
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "txt") return (await file.text()).trim();
    if (ext === "pdf") return await extractPdfText(file);
    if (ext === "docx") return await extractDocxText(file);
    throw new Error("Unsupported file type — upload a PDF, .docx, or .txt file, or paste the text directly below.");
  }

  function signInCardHtml() {
    return `
      <div class="gate-card">
        <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
        <h3 style="margin-bottom:8px;">Sign in to get an estimate</h3>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">Describing your case and/or uploading documents for AI-assisted analysis runs on purchased analysis credits tied to your account.</p>
        <button type="button" class="btn btn-primary btn-sm" id="cv-ai-signin-btn">Sign in to continue</button>
      </div>`;
  }

  function noCreditsCardHtml(bal) {
    const usedNote = bal && bal.total > 0
      ? `<p class="text-muted" style="font-size:12px; margin-bottom:16px;">You've used ${bal.used} of ${bal.total} purchased credits.</p>`
      : "";
    return `
      <div class="gate-card eg-purchase-card">
        <div class="eyebrow" style="margin-bottom:8px;">Analysis Credits Required</div>
        <h3 style="margin-bottom:4px;">Describe your case or upload documents for AI-assisted analysis</h3>
        <div class="eg-purchase-price">${PRICE_DISPLAY}</div>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:12px;">Each credit analyzes one matter and unlocks the full claim-by-claim breakdown, citations, and PDF report. Credits never expire and stack across purchases.</p>
        ${usedNote}
        <a href="${STRIPE_PAYMENT_LINK_URL}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Purchase Credits</a>
      </div>`;
  }

  // Preserved analysis fragments across "Add More Information" follow-ups
  // (oldest first) -- each entry is the full result HTML from a prior
  // pass, kept so a follow-up analysis never erases what came before it.
  // Reset to [] whenever a genuinely new, independent analysis starts
  // (the main "Analyze Documents" button), since that's an unrelated case.
  let resultHistory = [];

  function historyHtml() {
    if (!resultHistory.length) return "";
    return resultHistory.map((html, i) => `
      <details class="cv-history-entry">
        <summary>Previous analysis${resultHistory.length > 1 ? ` #${i + 1}` : ""} (before additional information was added)</summary>
        <div class="cv-history-body">${html}</div>
      </details>`).join("");
  }

  function followupFormHtml() {
    return `
      <div class="card cv-followup-card" style="padding:20px; margin-top:16px; border-style:dashed;">
        <div class="eyebrow" style="margin-bottom:8px;">Add More Information</div>
        <p class="text-secondary" style="font-size:13px; line-height:1.6; margin-bottom:14px;">Have another document, a new ruling, or updated facts? Add it below for an updated analysis — everything above stays saved, not overwritten.</p>
        <div class="cv-ai-dropzone" id="cv-followup-dropzone">
          <input type="file" id="cv-followup-file" accept=".pdf,.docx,.txt" multiple style="display:none;" />
          <div class="cv-ai-dropzone-inner">
            <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <p><strong>Drop additional documents here</strong> or <button type="button" class="text-accent" id="cv-followup-browse-btn" style="background:none; border:none; padding:0; font:inherit; cursor:pointer; text-decoration:underline;">browse files</button></p>
            <p class="text-muted" style="font-size:12px;">PDF, .docx, or .txt</p>
          </div>
          <div class="cv-ai-filelist" id="cv-followup-filelist"></div>
        </div>
        <div class="cv-field">
          <label for="cv-followup-pastetext">Or paste additional text</label>
          <textarea id="cv-followup-pastetext" rows="3" placeholder="What's new — a ruling, a new document, updated settlement posture…"></textarea>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="cv-followup-analyze-btn">
          Update Analysis With New Information
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <p class="text-muted" style="font-size:11.5px; margin-top:8px;">Uses 1 analysis credit, same as a new analysis.</p>
        <div id="cv-followup-status" class="cv-ai-status"></div>
      </div>`;
  }

  // The single unified "tell us about your case" card -- a large,
  // auto-growing freeform description bar (the AI-chat-style replacement
  // for the old category/side dropdowns and per-category manual-field
  // questionnaire) sitting directly above the existing document dropzone,
  // so the two read as one flow. The litigation category is no longer
  // picked here at all -- the backend classifies it from whatever
  // combination of description text and document text comes through.
  function uploadZoneHtml(bal) {
    return `
      <div class="card cv-upload-card" style="padding:20px; margin-bottom:20px;">
        <div class="cv-ai-balance">
          <span class="badge badge-live">${bal.remaining} of ${bal.total} analysis credits remaining</span>
        </div>
        <p class="text-secondary" style="font-size:13px; line-height:1.6; margin:10px 0 14px;">Tell us what happened, upload the original petition, an answer, a counterclaim — or both. The more detail you give, the better the estimate. Nothing you upload is stored — only the extracted text is sent for analysis.</p>

        <div class="cv-field">
          <label for="cv-description">Describe your case</label>
          <textarea id="cv-description" class="cv-description-bar" rows="3" placeholder="Describe your case — e.g. &quot;I'm a commercial landlord in Texas, my tenant broke a 5-year lease with 2 years left and stopped paying rent...&quot;"></textarea>
        </div>

        <div class="cv-side-toggle-wrap">
          <span class="cv-side-toggle-label">Your side (optional)</span>
          <div class="cv-side-toggle" id="cv-side-toggle" role="group" aria-label="Your side">
            <button type="button" class="cv-side-toggle-btn" data-side="sideA">I'm bringing this claim</button>
            <button type="button" class="cv-side-toggle-btn" data-side="sideB">I'm responding to a claim</button>
          </div>
        </div>

        <div class="cv-ai-dropzone" id="cv-ai-dropzone">
          <input type="file" id="cv-ai-file" accept=".pdf,.docx,.txt" multiple style="display:none;" />
          <div class="cv-ai-dropzone-inner">
            <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <p><strong>Drop pleadings here</strong> or <button type="button" class="text-accent" id="cv-ai-browse-btn" style="background:none; border:none; padding:0; font:inherit; cursor:pointer; text-decoration:underline;">browse files</button></p>
            <p class="text-muted" style="font-size:12px;">PDF, .docx, or .txt</p>
          </div>
          <div class="cv-ai-filelist" id="cv-ai-filelist"></div>
        </div>
        <div class="cv-field">
          <label for="cv-ai-pastetext">Or paste document text directly (optional, adds to any files above)</label>
          <textarea id="cv-ai-pastetext" rows="3" placeholder="Paste document text here…"></textarea>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="cv-ai-analyze-btn">
          Estimate My Case
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div id="cv-ai-status" class="cv-ai-status"></div>
      </div>`;
  }

  function renderFileList(container, files) {
    if (!files.length) { container.innerHTML = ""; return; }
    container.innerHTML = files.map((f, i) => `
      <span class="cv-ai-file-chip">${f.name}<button type="button" class="cv-ai-file-remove" data-idx="${i}" aria-label="Remove ${f.name}">&times;</button></span>
    `).join("");
  }

  // A scannable at-a-glance table -- issue, likelihood, damages if
  // successful, expected value -- so someone can see how the case value
  // range (and the best-guess figure above it) was actually reached,
  // instead of reading through prose cards for it. Mirrors the same EV
  // formula used in the PDF download handler below (damages x
  // probability, taken range-wise).
  function summaryTableHtml(a) {
    const issues = a.issues || [];
    if (!issues.length) return "";
    const rows = issues.map((iss) => {
      const prob = iss.probabilityRange;
      const dmg = iss.damagesRange;
      const ev = dmg && prob ? [dmg[0] * prob[0], dmg[1] * prob[1]] : null;
      return `
        <tr>
          <td class="cv-summary-table-issue">${iss.label}</td>
          <td>${prob ? `${Math.round(prob[0] * 100)}–${Math.round(prob[1] * 100)}%` : "—"}</td>
          <td>${dmg ? V.fmtRange(dmg[0], dmg[1]) : "—"}</td>
          <td><strong>${ev ? V.fmtRange(ev[0], ev[1]) : "—"}</strong></td>
        </tr>`;
    }).join("");
    const bestGuessCell = typeof a.bestGuessValue === "number" ? ` <span class="text-muted">(best guess: ${V.fmt(a.bestGuessValue)})</span>` : "";
    const totalRow = a.damagesRange
      ? `<tr class="cv-summary-table-total"><td>Net position</td><td></td><td></td><td><strong>${V.fmtRange(a.damagesRange[0], a.damagesRange[1])}</strong>${bestGuessCell}</td></tr>`
      : "";
    return `
      <div class="cv-summary-table-wrap">
        <table class="cv-summary-table">
          <thead><tr><th>Claim</th><th>Likelihood</th><th>Damages if successful</th><th>Expected value</th></tr></thead>
          <tbody>${rows}${totalRow}</tbody>
        </table>
      </div>`;
  }

  // Renders the full AI-analysis result (net position, narrative, extracted
  // facts, claim-by-claim breakdown) into the shared results area, and
  // pre-fills the shared form fields so the user can review/tweak them.
  // An AI-identified issue isn't the same shape as a baseline-engine claim
  // (it has freeform analysis text and an optional, not-always-present
  // probability/damages range, since not every issue reduces to a dollar
  // figure) -- its own card, visually consistent with claimResultHtml.
  function issueResultHtml(iss) {
    return `
      <div class="cv-claim-card">
        <div class="cv-claim-top">
          <h4>${iss.label}</h4>
          ${iss.probabilityRange ? `<span class="cv-prob">${Math.round(iss.probabilityRange[0] * 100)}–${Math.round(iss.probabilityRange[1] * 100)}% likelihood</span>` : ""}
        </div>
        ${iss.damagesRange ? `<div class="cv-damages">Value range: ${V.fmtRange(iss.damagesRange[0], iss.damagesRange[1])}</div>` : ""}
        ${iss.analysis ? `<p class="cv-note">${iss.analysis}</p>` : ""}
        ${(iss.citations || []).length ? `<div class="cv-citations"><div class="cv-citations-label">Grounded in real cases:</div>${iss.citations.map((cit) => `
          <div class="cv-citation">
            ${cit.url ? `<a href="${cit.url}" target="_blank" rel="noopener">${cit.caseName}</a>` : cit.caseName}
            ${cit.year ? ` (${cit.year})` : ""}
            ${cit.dollarAmount ? ` — ${V.fmt(cit.dollarAmount)}` : ""}
          </div>`).join("")}</div>` : ""}
      </div>`;
  }

  // Renders the AI's comprehensive analysis as distinct, titled sections
  // instead of one undifferentiated wall of prose -- the model already
  // organizes its reasoning this way (narrativeSections is an array of
  // {heading, body}), this just gives that structure real visual form.
  // Each section gets its own heading and, since a single section's body
  // can itself run several paragraphs, splits on blank lines so it never
  // collapses back into one dense block.
  function narrativeSectionsHtml(sections) {
    if (!Array.isArray(sections) || !sections.length) return "";
    return sections.map((s) => {
      const paragraphs = (s.body || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
      const bodyHtml = paragraphs.length
        ? paragraphs.map((p) => `<p>${p}</p>`).join("")
        : `<p>${s.body || ""}</p>`;
      return `<div class="cv-narrative-section">
        ${s.heading ? `<h4 class="cv-narrative-heading">${s.heading}</h4>` : ""}
        <div class="cv-narrative-body">${bodyHtml}</div>
      </div>`;
    }).join("");
  }

  // Holds just the most recent fresh analysis fragment (not the history
  // wrapper, not the follow-up form) so the NEXT render can archive it
  // into resultHistory before replacing it -- kept separate from
  // resultHistory itself so archiving never nests an old follow-up form
  // or an old history block inside a new history entry.
  let lastFreshFragmentHtml = "";

  function renderAiResult(json, emptyFiles, followupContext, truncationNote) {
    if (lastFreshFragmentHtml) resultHistory.push(lastFreshFragmentHtml);
    const a = json.analysis || {};
    const facts = json.extractedFacts || {};
    const baseline = a.baseline || {};
    // .is-advisory (amber), not .is-error (red) -- these three notes sit
    // ALONGSIDE a real, successful analysis result. They're routine and
    // self-correctable, not a broken request, and reusing .is-error's red
    // for them either reads as alarming when nothing actually failed, or
    // trains a user to tune out red entirely, including when something
    // genuinely did fail (session expired, rate limited, server error --
    // those replace the WHOLE result and correctly stay .is-error below).
    const emptyFilesHtml = (emptyFiles && emptyFiles.length)
      ? `<div class="gate-card is-advisory" style="margin-bottom:16px;"><div class="eyebrow" style="margin-bottom:6px;">Heads Up</div><p class="text-secondary" style="font-size:13px; line-height:1.6;">No text could be read from <strong>${emptyFiles.join(", ")}</strong> — this is almost always a scanned or image-only PDF with no selectable text layer, so it was skipped. The analysis below only reflects your other document(s). Try a text-based copy of ${emptyFiles.length === 1 ? "that file" : "those files"} if you have one, or paste its text directly.</p></div>`
      : "";
    // Unlike the transient "Analyzing…" wait-message note, this stays
    // visible in the actual result -- a truncation that happened during a
    // 30-90s wait is easy to never see otherwise. See where truncationNote
    // is built (both call sites) for exactly what it covers.
    const truncationNoteHtml = truncationNote
      ? `<div class="gate-card is-advisory" style="margin-bottom:16px;"><div class="eyebrow" style="margin-bottom:6px;">Heads Up — Part of Your Document Wasn't Read</div><p class="text-secondary" style="font-size:13px; line-height:1.6;">${truncationNote}</p></div>`
      : "";
    // The backend deliberately returns damagesRange: null (never an
    // invented "typical case" number) when nothing you gave it actually
    // pins down a dollar figure -- see js/case-valuation.js's sibling
    // Edge Function for the full reasoning. Surface that as a clear,
    // actionable warning up top, not a blank space where a number used
    // to be -- and point directly at the "add more information" box
    // below, since that's the exact mechanism to resolve it.
    const missingInfoHtml = (a.damagesRange == null)
      ? `<div class="gate-card is-advisory" style="margin-bottom:16px;">
          <div class="eyebrow" style="margin-bottom:6px;">Can't Estimate a Dollar Value Yet</div>
          <p class="text-secondary" style="font-size:13.5px; line-height:1.6;">${a.whatIsNeededForEstimate || "Add specific dollar figures for this dispute so a damages range can be computed."}</p>
          <p class="text-secondary" style="font-size:13px; line-height:1.6; margin-top:8px;">The legal analysis below is still complete — add these details in the box further down and re-analyze to get an actual dollar range.</p>
        </div>`
      : "";

    // Auto-fill the side toggle from the AI-extracted filing party, but
    // only if the user hasn't deliberately picked a side themselves --
    // wireUploadZone() re-reads cvUserSide when it re-renders the toggle.
    if (facts && (facts.filingParty === "sideA" || facts.filingParty === "sideB") && !cvUserSideChosen) {
      cvUserSide = facts.filingParty;
    }

    const factEntries = Object.entries(facts).filter(([k, v]) => k !== "filingParty" && k !== "state" && v !== null && v !== undefined && v !== "");
    const factsHtml = factEntries.length
      ? `<div class="cv-ai-facts"><div class="cv-citations-label">Facts extracted from your case description and documents:</div>${factEntries.map(([k, v]) => `<span class="detail-tag">${k}: ${v}</span>`).join("")}</div>`
      : "";
    // The jurisdiction the whole analysis is anchored to (Texas law, Texas
    // cases, Texas statutes throughout) was previously only ever mentioned
    // in passing inside the prose -- easy to miss, and impossible to
    // verify at a glance. Pulled out as its own clearly-labeled fact,
    // right alongside category and side, wherever those are shown.
    const stateName = facts.state && typeof RELAW_DATA !== "undefined" && RELAW_DATA.states
      ? (RELAW_DATA.states[facts.state] || facts.state)
      : null;
    const metaRowHtml = `<div style="display:flex; flex-wrap:wrap; gap:8px; margin-top:12px;">
      ${a.categoryLabel ? `<span class="detail-tag">Category: ${a.categoryLabel}</span>` : ""}
      ${stateName ? `<span class="detail-tag">Jurisdiction: ${stateName}</span>` : `<span class="detail-tag" style="color:var(--status-pending);">Jurisdiction: not stated</span>`}
      ${a.roleLabel ? `<span class="detail-tag">Your side: ${a.roleLabel}</span>` : ""}
    </div>`;
    const issuesHtml = (a.issues || []).length
      ? `<div class="eyebrow" style="margin:20px 0 8px;">Claim-by-Claim Detail</div><div class="cv-claims">${a.issues.map(issueResultHtml).join("")}</div>`
      : "";
    const baselineClaimsHtml = (baseline.claims || []).length
      ? `<div class="cv-claims" style="margin-top:12px;">${baseline.claims.map(claimResultHtml).join("")}</div>`
      : `<p class="text-muted" style="font-size:12.5px;">The fixed-formula baseline model found no matching claims from the extracted checkbox-style facts — the AI's own analysis above reads the actual document, not just this baseline.</p>`;

    const freshFragmentHtml = `
      ${emptyFilesHtml}
      ${truncationNoteHtml}
      ${missingInfoHtml}
      <div class="cv-summary card">
        <div class="eyebrow" style="margin-bottom:8px;">AI Analysis — Probability-Weighted Prediction${a.roleLabel ? ` — ${a.roleLabel} view` : ""}</div>
        ${typeof a.bestGuessValue === "number" ? `<div class="cv-net">${V.fmt(a.bestGuessValue)}</div><p class="text-muted" style="font-size:12px; margin-top:2px;">Best-guess case value</p>` : (a.damagesRange ? `<div class="cv-net">${V.fmtRange(a.damagesRange[0], a.damagesRange[1])}</div>` : `<div class="cv-net" style="font-size:1.3rem; color:var(--text-muted);">No estimate yet</div><p class="text-muted" style="font-size:12px; margin-top:2px;">See "Can't Estimate a Dollar Value Yet" above</p>`)}
        ${a.damagesRange && typeof a.bestGuessValue === "number" ? `<div style="margin-top:12px;"><span class="detail-tag" title="Kept alongside the single figure above because the range itself is informative, not just noise around a guess.">Full range: ${V.fmtRange(a.damagesRange[0], a.damagesRange[1])}</span></div>` : ""}
        ${metaRowHtml}
      </div>
      ${a.likelyOutcome ? `<div class="card" style="padding:20px; margin-top:16px;"><div class="eyebrow" style="margin-bottom:8px;">Executive Discovery</div><p class="text-secondary" style="font-size:14px; line-height:1.6;">${a.likelyOutcome}</p></div>` : ""}
      ${summaryTableHtml(a)}
      ${(a.narrativeSections || []).length ? `<div class="card" style="padding:24px; margin-top:16px;"><div class="eyebrow" style="margin-bottom:16px;">Comprehensive Analysis</div>${narrativeSectionsHtml(a.narrativeSections)}</div>` : ""}
      <div id="cv-gated-content" style="margin-top:16px;">
        <div class="card" style="padding:20px;">
          <button type="button" class="btn btn-ghost btn-sm" id="cv-download-report">
            Download PDF Report
            <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        ${factsHtml}
        ${issuesHtml}
      </div>
      <div class="card" style="padding:20px; margin-top:16px; border-style:dashed;">
        <div class="eyebrow" style="margin-bottom:8px;">Baseline Model Estimate (reference only)</div>
        <p class="text-muted" style="font-size:12px; line-height:1.6; margin-bottom:10px;">The same fixed-formula engine the manual form uses, run on the facts extracted from your documents — a mechanical cross-check, not the AI's conclusion. ${baseline.damagesRange ? `Baseline net position: <strong>${V.fmtRange(baseline.damagesRange[0], baseline.damagesRange[1])}</strong>.` : ""}</p>
        ${baselineClaimsHtml}
      </div>
      <p class="text-muted" style="font-size:12px; margin-top:14px;">This is a probability-weighted prediction generated from the documents you provided, not a legal opinion, adjudication, or substitute for counsel.</p>`;

    lastFreshFragmentHtml = freshFragmentHtml;
    resultsHost.innerHTML = historyHtml() + freshFragmentHtml + followupFormHtml();

    const downloadBtn = document.getElementById("cv-download-report");
    if (downloadBtn && window.CV_REPORT) {
      downloadBtn.addEventListener("click", () => {
        window.CV_REPORT.requestFullReport({ claims: (a.issues || []).map((iss) => ({
          claimKey: iss.label, label: iss.label,
          probability: iss.probabilityRange || [0, 0],
          damagesRange: iss.damagesRange || null,
          expectedValueRange: iss.damagesRange && iss.probabilityRange
            ? [iss.damagesRange[0] * iss.probabilityRange[0], iss.damagesRange[1] * iss.probabilityRange[1]] : null,
          note: iss.analysis, isBenchmark: false, citations: iss.citations || [],
        })) }, {
          categoryLabel: a.categoryLabel,
          jurisdictionLabel: stateName,
          // The backend already resolves a category-specific role label for
          // the user's own side (e.g. "Landlord", "Lender") into
          // a.roleLabel -- that already accounts for which side the user
          // said they're on, so just render it directly as "sideA" rather
          // than re-deriving a generic sideA/sideB pair here. Falls back to
          // a generic label only if the backend didn't return one --
          // case-valuation-report.js dereferences roles.sideA/sideB
          // unconditionally, so this must never be null.
          roles: { sideA: a.roleLabel || "Your side", sideB: "Other side" },
          side: "sideA",
          // null (not [0,0]) when the backend declined to invent a number --
          // [0,0] would render as a real, misleading "$0" estimate in the
          // PDF rather than "no estimate yet."
          net: a.damagesRange || null,
          whatIsNeededForEstimate: a.whatIsNeededForEstimate || null,
          bestGuessValue: typeof a.bestGuessValue === "number" ? a.bestGuessValue : null,
          likelyOutcome: a.likelyOutcome || null,
          narrativeSections: a.narrativeSections || [],
          catSpec: null,
          costData: null
        });
      });
    }

    if (followupContext) wireFollowupForm(followupContext.documentText, followupContext.userSide, followupContext.description, facts);
  }

  // Wires the "Add More Information" form that renderAiResult appends
  // after every result. Combines the newly provided text/files with
  // everything already analyzed (priorDocumentText) and re-runs a full
  // analysis over the combined set -- renderAiResult itself archives the
  // just-superseded result into resultHistory before replacing it, so
  // nothing already shown is lost. priorDescription is the original
  // freeform case description from the initial analysis -- re-sent as-is
  // on every follow-up since the request contract always requires it.
  // priorExtractedFacts is the previous pass's structured extraction
  // (json.extractedFacts) -- see its use below, right where the combined
  // text gets built, for why it has to travel separately from the raw text.
  function wireFollowupForm(priorDocumentText, priorUserSide, priorDescription, priorExtractedFacts) {
    const SPINNER = `<span class="cv-spinner" aria-hidden="true"></span>`;
    const dropzone = document.getElementById("cv-followup-dropzone");
    const fileInput = document.getElementById("cv-followup-file");
    const browseBtn = document.getElementById("cv-followup-browse-btn");
    const filelistEl = document.getElementById("cv-followup-filelist");
    const pasteEl = document.getElementById("cv-followup-pastetext");
    const analyzeBtn = document.getElementById("cv-followup-analyze-btn");
    const statusEl = document.getElementById("cv-followup-status");
    if (!dropzone || !analyzeBtn) return;

    let followupFiles = [];

    function setFollowupStatus(text, opts) {
      opts = opts || {};
      statusEl.className = "cv-ai-status" + (opts.error ? " is-error" : "");
      statusEl.innerHTML = opts.spinner ? SPINNER : "";
      if (text) {
        const span = document.createElement("span");
        span.textContent = text;
        statusEl.appendChild(span);
      }
    }

    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      followupFiles = followupFiles.concat(Array.from(fileInput.files || []));
      renderFileList(filelistEl, followupFiles);
    });
    ["dragenter", "dragover"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); })
    );
    ["dragleave", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("is-dragover"); })
    );
    dropzone.addEventListener("drop", (e) => {
      const dropped = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (dropped.length) {
        followupFiles = followupFiles.concat(dropped);
        renderFileList(filelistEl, followupFiles);
      }
    });
    filelistEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".cv-ai-file-remove");
      if (!btn) return;
      followupFiles.splice(parseInt(btn.getAttribute("data-idx"), 10), 1);
      renderFileList(filelistEl, followupFiles);
    });

    const analyzeBtnOriginalHtml = analyzeBtn.innerHTML;

    analyzeBtn.addEventListener("click", async () => {
      if (!followupFiles.length && !pasteEl.value.trim()) {
        setFollowupStatus("Add at least one file or paste some new text first.", { error: true });
        return;
      }
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = `${SPINNER}<span>Analyzing…</span>`;
      try {
        const sections = [];
        const emptyFiles = [];
        for (let i = 0; i < followupFiles.length; i++) {
          const f = followupFiles[i];
          setFollowupStatus(`Extracting text (${i + 1} of ${followupFiles.length}: ${f.name})…`, { spinner: true });
          const text = await extractText(f);
          if (text) sections.push(`=== New Document ${i + 1}: ${f.name} ===\n${text}`);
          else emptyFiles.push(f.name);
        }
        if (pasteEl.value.trim()) sections.push(`=== New Information (pasted) ===\n${pasteEl.value.trim()}`);
        const newInfoText = sections.join("\n\n");
        if (!newInfoText) {
          const which = emptyFiles.length ? ` (${emptyFiles.join(", ")})` : "";
          throw new Error(
            emptyFiles.length
              ? `No text could be read from ${emptyFiles.length === 1 ? "this file" : "these files"}${which} — this usually means it's a scanned or image-only PDF. Try a text-based copy, or paste the text directly instead.`
              : "No new text to add — try pasting the text directly instead."
          );
        }

        // BUG THIS FIXES: when newInfoText alone was already close to (or
        // over) MAX_DOC_CHARS, "trim the older material first" meant the
        // ENTIRE original document could get silently dropped -- not just
        // shortened -- leaving the backend with nothing but the new
        // document. A reply brief with no dollar figures of its own then
        // reported "can't estimate a dollar value" even though the
        // original petition/lease (now completely gone from the request)
        // had every figure needed. Raising MAX_DOC_CHARS isn't the fix --
        // it's deliberately capped below the server's own ceiling after a
        // real Supabase free-tier timeout on a 3-document submission (see
        // the comment on MAX_DOC_CHARS above).
        //
        // Fix: carry the PREVIOUS PASS'S ALREADY-EXTRACTED FACTS forward
        // as a compact, never-trimmed summary, separate from the raw
        // document text. It's a handful of short field:value pairs --
        // orders of magnitude smaller than the raw text it came from --
        // so it always fits, and it means a known dollar figure can never
        // be lost to truncation again even if the raw prior text has to
        // be cut down hard (or dropped entirely) to make room for a large
        // new document.
        const priorFactsSummary = priorExtractedFacts && Object.keys(priorExtractedFacts).length
          ? "=== Facts already established from the prior document(s) in this analysis -- these are CONFIRMED, carry them forward even though the newly added material below may not repeat them ===\n" +
            Object.entries(priorExtractedFacts)
              .filter(([, v]) => v !== null && v !== undefined && v !== "")
              .map(([k, v]) => `${k}: ${v}`)
              .join("\n").slice(0, 4000) + "\n\n"
          : "";

        // Combine with everything already analyzed. If the total would
        // exceed the same cap the initial analysis uses, trim from the
        // OLDER material first, not the new addition -- new information
        // is the entire point of this request, so it should never be
        // the part silently dropped. The confirmed-facts summary above is
        // reserved off the top and never trimmed, regardless.
        const header = "\n\n=== Additional Information (added after the initial analysis) ===\n";
        const roomForPrior = MAX_DOC_CHARS - priorFactsSummary.length - header.length - newInfoText.length;
        let combinedText;
        // Persisted warning for this combine step, same reasoning as the
        // initial-upload path above -- stays visible in the result itself,
        // not just the wait spinner.
        let truncationNote = null;
        if (roomForPrior < 0) {
          combinedText = (priorFactsSummary + newInfoText).slice(0, MAX_DOC_CHARS);
          truncationNote = `The newly added material was long enough on its own that none of the original document's raw text fit within this tool's ${MAX_DOC_CHARS.toLocaleString()}-character analysis limit. The facts already confirmed from the original document were still carried forward (see the facts list below), but its raw text was not re-read this round.`;
        } else {
          const trimmedPrior = priorDocumentText.length > roomForPrior ? priorDocumentText.slice(0, roomForPrior) : priorDocumentText;
          combinedText = priorFactsSummary + trimmedPrior + header + newInfoText;
          if (priorDocumentText.length > roomForPrior) {
            truncationNote = `The combined document text exceeded this tool's ${MAX_DOC_CHARS.toLocaleString()}-character analysis limit, so only part of the original document's raw text was re-read this round (the facts already confirmed from it were still carried forward in full — see the facts list below). The newly added material was kept in full.`;
          }
        }

        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error("Your session expired — sign in again and retry.");

        const costFacts = collectCostFacts();
        const waitMessages = [
          "Analyzing… (reading the full, updated document set)",
          "Still analyzing — reasoning through the claims and defenses can take a minute or more…",
          "Still working — a thorough analysis of a long document can take a couple of minutes…",
        ];
        let waitStep = 0;
        setFollowupStatus(waitMessages[0], { spinner: true });
        const waitTimer = setInterval(() => {
          waitStep = Math.min(waitStep + 1, waitMessages.length - 1);
          setFollowupStatus(waitMessages[waitStep], { spinner: true });
        }, 25000);
        let resp;
        try {
          resp = await fetch(ANALYZE_FN_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
              "apikey": SUPABASE_PUBLISHABLE_KEY
            },
            body: JSON.stringify({
              description: priorDescription || "",
              documentText: combinedText,
              userSide: priorUserSide || null,
              expectToTrial: !!costFacts.expectToTrial,
              settlementOnTable: costFacts.settlementOnTable || null
            })
          });
        } finally {
          clearInterval(waitTimer);
        }
        const json = await resp.json().catch(() => ({}));

        if (resp.ok && json && json.analysis) {
          setFollowupStatus("");
          renderAiResult(json, emptyFiles, { documentText: combinedText, userSide: priorUserSide, description: priorDescription }, truncationNote);
          resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        if (json && json.error === "unrecognized-category") {
          setFollowupStatus(json.message || "We couldn't tell what kind of commercial real estate dispute this update describes — add a bit more detail (the type of dispute, the parties, what's being claimed) and try again.", { error: true });
        } else if (resp.status === 402) {
          const bal = await getCreditBalance();
          setFollowupStatus("");
          statusEl.innerHTML = noCreditsCardHtml(bal || { total: 0, used: 0 });
        } else {
          setFollowupStatus((json && json.error) || "Something went wrong updating the analysis — try again.", { error: true });
        }
      } catch (err) {
        setFollowupStatus(err.message || "Something went wrong — try again.", { error: true });
      } finally {
        analyzeBtn.disabled = false;
        analyzeBtn.innerHTML = analyzeBtnOriginalHtml;
      }
    });
  }

  function wireUploadZone(bal) {
    const dropzone = document.getElementById("cv-ai-dropzone");
    const fileInput = document.getElementById("cv-ai-file");
    const browseBtn = document.getElementById("cv-ai-browse-btn");
    const filelistEl = document.getElementById("cv-ai-filelist");
    const pasteEl = document.getElementById("cv-ai-pastetext");
    const statusEl = document.getElementById("cv-ai-status");
    const analyzeBtn = document.getElementById("cv-ai-analyze-btn");
    const SPINNER = `<span class="cv-spinner" aria-hidden="true"></span>`;

    // Centralizes every status-line update so the spinner shows up
    // consistently for every "still working" state instead of only some
    // of them -- text alone that changes every 25s is too easy to miss;
    // a visible, continuously-moving spinner is not. Some of these
    // messages embed a user-supplied filename, so the text portion is
    // set via textContent (a fresh element per call), never interpolated
    // into innerHTML directly -- a filename containing "<" or "&" must
    // not be treated as markup.
    function setStatus(text, opts) {
      opts = opts || {};
      statusEl.className = "cv-ai-status" + (opts.error ? " is-error" : "");
      statusEl.innerHTML = opts.spinner ? SPINNER : "";
      if (text) {
        const span = document.createElement("span");
        span.textContent = text;
        statusEl.appendChild(span);
      }
    }

    let chosenFiles = [];

    const descriptionEl = document.getElementById("cv-description");
    if (descriptionEl) {
      descriptionEl.addEventListener("input", () => autoGrowTextarea(descriptionEl));
      autoGrowTextarea(descriptionEl);
    }

    // Lightweight two-button toggle standing in for the old side <select>.
    // Clicking the already-active button deselects it (side back to
    // null/unknown) rather than forcing a choice -- getting this wrong
    // flips which party bears which litigation risk, so "unset" has to
    // stay a real, easy-to-reach option, not just the initial state.
    const sideToggleEl = document.getElementById("cv-side-toggle");
    function updateSideToggleUI() {
      if (!sideToggleEl) return;
      sideToggleEl.querySelectorAll(".cv-side-toggle-btn").forEach((btn) => {
        btn.classList.toggle("is-active", btn.getAttribute("data-side") === cvUserSide);
      });
    }
    if (sideToggleEl) {
      updateSideToggleUI();
      sideToggleEl.addEventListener("click", (e) => {
        const btn = e.target.closest(".cv-side-toggle-btn");
        if (!btn) return;
        const val = btn.getAttribute("data-side");
        cvUserSideChosen = true;
        cvUserSide = cvUserSide === val ? null : val;
        updateSideToggleUI();
      });
    }

    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      chosenFiles = chosenFiles.concat(Array.from(fileInput.files || []));
      fileInput.value = "";
      renderFileList(filelistEl, chosenFiles);
    });
    ["dragover", "dragenter"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); })
    );
    ["dragleave", "dragend", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("is-dragover"); })
    );
    dropzone.addEventListener("drop", (e) => {
      const dropped = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (dropped.length) {
        chosenFiles = chosenFiles.concat(dropped);
        renderFileList(filelistEl, chosenFiles);
      }
    });
    filelistEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".cv-ai-file-remove");
      if (!btn) return;
      chosenFiles.splice(parseInt(btn.getAttribute("data-idx"), 10), 1);
      renderFileList(filelistEl, chosenFiles);
    });

    analyzeBtn.addEventListener("click", async () => {
      const description = (descriptionEl && descriptionEl.value ? descriptionEl.value : "").trim();
      if (!description && !chosenFiles.length && !pasteEl.value.trim()) {
        setStatus("Describe your case, or upload/paste a document, before requesting an estimate.", { error: true });
        return;
      }

      // A fresh run from the main upload zone is a new, unrelated matter --
      // clear any "Add More Information" history from a previous case so
      // it doesn't carry over and get shown alongside this one.
      resultHistory = [];
      lastFreshFragmentHtml = "";

      // renderUploadZone() in the finally block below fully re-renders
      // this button from uploadZoneHtml() once the request settles, so
      // swapping its content here needs no manual restore.
      analyzeBtn.disabled = true;
      analyzeBtn.innerHTML = `${SPINNER}<span>Analyzing…</span>`;
      resultsHost.innerHTML = "";
      try {
        const sections = [];
        const emptyFiles = [];
        for (let i = 0; i < chosenFiles.length; i++) {
          const f = chosenFiles[i];
          setStatus(`Extracting text (${i + 1} of ${chosenFiles.length}: ${f.name})…`, { spinner: true });
          const text = await extractText(f);
          if (text) sections.push(`=== Document ${i + 1}: ${f.name} ===\n${text}`);
          else emptyFiles.push(f.name);
        }
        if (pasteEl.value.trim()) {
          sections.push(chosenFiles.length ? `=== Additional context ===\n${pasteEl.value.trim()}` : pasteEl.value.trim());
        }
        let documentText = sections.join("\n\n");
        if (!documentText && !description) {
          // Almost always means every uploaded file was a scanned/image-only
          // PDF with no embedded text layer -- pdf.js can only read text
          // that's actually encoded in the file, not pixels on a page. Say
          // that plainly rather than a generic "no text" message, since the
          // fix (re-scan with OCR, or a text-based copy) is different from
          // a real extraction failure. Only fatal here because there's also
          // no case description to fall back on.
          const which = emptyFiles.length ? ` (${emptyFiles.join(", ")})` : "";
          throw new Error(
            emptyFiles.length
              ? `No text could be read from ${emptyFiles.length === 1 ? "this file" : "these files"}${which} — this usually means it's a scanned or image-only PDF with no selectable text, not a real error. Try a text-based/"born digital" copy if you have one, add a case description above, or paste the text directly below instead.`
              : "No text could be extracted — try pasting the text directly instead, or add a case description above."
          );
        }
        const emptyNote = emptyFiles.length ? ` (no text found in ${emptyFiles.join(", ")}, likely scanned/image-only — continuing with the rest)` : "";
        const wasTruncated = documentText.length > MAX_DOC_CHARS;
        const truncNote = wasTruncated
          ? `Combined document text truncated to the first ${MAX_DOC_CHARS.toLocaleString()} characters for analysis.${emptyNote}`
          : emptyNote ? `Analyzing.${emptyNote}` : "";
        // Persisted version of the same warning -- the wait-message note
        // above (truncNote/notePrefix below) only shows while the spinner
        // is up and disappears the moment the result renders, so a user
        // who doesn't read it during the 30-90s wait would have no way of
        // knowing part of their document was never sent at all. Passed
        // through to renderAiResult so it stays visible in the result itself.
        const truncationNote = wasTruncated
          ? `Your uploaded document(s) totaled more than this tool's ${MAX_DOC_CHARS.toLocaleString()}-character analysis limit, so only the first ${MAX_DOC_CHARS.toLocaleString()} characters were actually read — anything after that point in the combined text was not analyzed. If a fact that matters (a dollar figure, a date, a defense) falls later in a long document, add it directly in the case description box above, or use "Add More Information" below to add it as its own shorter entry.`
          : null;
        if (wasTruncated) documentText = documentText.slice(0, MAX_DOC_CHARS);

        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error("Your session expired — sign in again and retry.");

        const costFacts = collectCostFacts();
        // The comprehensive-analysis pass runs Opus at max ("xhigh")
        // reasoning effort over the full document -- a real, working
        // request commonly takes 30-90+ seconds, not the few seconds
        // "Analyzing…" alone implies. Without a progress update this
        // reads as stuck/broken well before it actually is. Keeps
        // whatever truncation/empty-file note was just set (that context
        // matters and shouldn't disappear the moment the request starts)
        // by prefixing it to each rotating message instead of overwriting it.
        const notePrefix = truncNote ? truncNote + " " : "";
        const waitMessages = [
          notePrefix + "Analyzing… (reading the full document)",
          notePrefix + "Still analyzing — reasoning through the claims and defenses can take a minute or more…",
          notePrefix + "Still working — a thorough analysis of a long document can take a couple of minutes…",
        ];
        let waitStep = 0;
        setStatus(waitMessages[0], { spinner: true });
        const waitTimer = setInterval(() => {
          waitStep = Math.min(waitStep + 1, waitMessages.length - 1);
          setStatus(waitMessages[waitStep], { spinner: true });
        }, 25000);
        let resp;
        try {
          resp = await fetch(ANALYZE_FN_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${session.access_token}`,
              "apikey": SUPABASE_PUBLISHABLE_KEY
            },
            body: JSON.stringify({
              description,
              documentText,
              userSide: cvUserSide || null,
              expectToTrial: !!costFacts.expectToTrial,
              settlementOnTable: costFacts.settlementOnTable || null
            })
          });
        } finally {
          clearInterval(waitTimer);
        }
        const json = await resp.json().catch(() => ({}));

        // The slow analysis path now streams its HTTP response (heartbeat
        // bytes while the Claude calls run, so the platform's idle
        // timeout doesn't kill the connection) -- its status is always
        // 200 whether the analysis actually succeeded or failed, since
        // the status can't change after streaming has already started.
        // Only the fast pre-analysis checks (credits, rate limit, auth,
        // not-configured) still use a real distinct status code below, so
        // success here has to be "resp.ok AND we actually got an
        // analysis back," not resp.ok alone.
        if (resp.ok && json && json.analysis) {
          setStatus("");
          renderAiResult(json, emptyFiles, { documentText, userSide: cvUserSide || null, description }, truncationNote);
          resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }

        setStatus("");
        if (json && json.error === "unrecognized-category") {
          resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Need More Detail</div><p class="text-secondary" style="font-size:13.5px;">${json.message || "We couldn't tell what kind of commercial real estate dispute this is from the information provided. Add a bit more detail above — the type of dispute, the parties involved, and what's being claimed — and try again."}</p></div>`;
        } else if (resp.status === 402) {
          resultsHost.innerHTML = noCreditsCardHtml({ total: bal.total, used: bal.total });
        } else if (resp.status === 429) {
          resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Analysis Didn't Run</div><p class="text-secondary" style="font-size:13.5px;">${json.error || "You've hit today's request limit — try again tomorrow."}</p></div>`;
        } else if (resp.status === 501) {
          resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Analysis Not Available Yet</div><p class="text-secondary" style="font-size:13.5px;">AI document analysis is being finalized on our end — the upload and access checks are fully live, but the analysis engine itself isn't switched on yet. Check back soon, and your credit was <strong>not</strong> used for this attempt.</p></div>`;
        } else if (resp.status === 401) {
          resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Analysis Didn't Run</div><p class="text-secondary" style="font-size:13.5px;">Your session expired — refresh the page and sign in again.</p></div>`;
        } else {
          resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Analysis Didn't Run</div><p class="text-secondary" style="font-size:13.5px;">${(json && json.error) || "Something went wrong — try again."}</p></div>`;
        }
        resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch (err) {
        setStatus("");
        resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Analysis Didn't Run</div><p class="text-secondary" style="font-size:13.5px;">${err.message || "Something went wrong — try again."}</p></div>`;
        resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
      } finally {
        analyzeBtn.disabled = false;
        renderUploadZone();
      }
    });
  }

  async function renderUploadZone() {
    if (!uploadHost || !sb) return;
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session) {
      uploadHost.innerHTML = signInCardHtml();
      const btn = document.getElementById("cv-ai-signin-btn");
      if (btn && window.RELAW_AUTH) btn.addEventListener("click", () => window.RELAW_AUTH.openSignInModal());
      return;
    }
    uploadHost.innerHTML = `<div class="gate-card is-loading">Checking your credit balance…</div>`;
    const bal = await getCreditBalance();
    if (!bal) {
      uploadHost.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">Couldn't check your credit balance — refresh and try again.</p></div>`;
      return;
    }
    if (bal.remaining <= 0) {
      uploadHost.innerHTML = noCreditsCardHtml(bal);
      return;
    }
    uploadHost.innerHTML = uploadZoneHtml(bal);
    wireUploadZone(bal);
  }

  if (sb) {
    sb.auth.getSession().then(() => renderUploadZone());
    sb.auth.onAuthStateChange(() => renderUploadZone());
  }
})();
