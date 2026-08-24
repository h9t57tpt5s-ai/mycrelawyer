/* =========================================================
   CREdocket — Litigation Value Estimator: AI Document Analysis
   -----------------------------------------------------------
   Upload/paste a pleading, get it analyzed against the same
   cited-case framework as the manual-entry tool. This is the
   FRONT END only — it talks to the case-valuation-analyze Edge
   Function, which already enforces the credit balance and rate
   limit server-side (see supabase/functions/case-valuation-analyze
   /index.ts). Until an ANTHROPIC_API_KEY secret is set on that
   function, every real submission will come back as HTTP 501
   "not_configured" -- that is the correct, safe behavior right
   now, not a bug in this file.

   Text extraction happens entirely client-side (PDF via pdf.js,
   .docx via mammoth.js, .txt via FileReader) -- the raw file is
   never uploaded or stored anywhere; only the extracted text is
   sent to the Edge Function for analysis, and the function's own
   log table (case_valuation_analyses) never stores that text,
   only a category + timestamp. Nothing about the document persists
   server-side beyond that log line.
   ========================================================= */

(function () {
  "use strict";
  const host = document.getElementById("cv-ai-gate-host");
  if (!host) return;
  const sb = window.RELAW_SUPABASE;
  if (!sb) return;

  // Same publishable key as js/supabase-client.js -- safe to ship
  // client-side by design (Supabase governs access via RLS).
  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  const ANALYZE_FN_URL = SUPABASE_URL + "/functions/v1/case-valuation-analyze";

  const STRIPE_PAYMENT_LINK_URL = "https://buy.stripe.com/dRm9AL34yaOSeLJetz1B601";
  const PRICE_DISPLAY = "$49 one-time — 10 analysis credits";

  const CATEGORIES = [
    { slug: "lease-disputes", label: "Landlord-Tenant / Lease Disputes" },
    { slug: "lending-foreclosure", label: "Lending & Foreclosure" },
    { slug: "reit-securities", label: "REIT & Real Estate Securities" },
    { slug: "construction-defect", label: "Construction Defect" },
    { slug: "environmental", label: "Environmental" },
    { slug: "eminent-domain", label: "Eminent Domain" },
    { slug: "zoning-land-use", label: "Zoning & Land Use" }
  ];

  const MAX_CHARS = 50000; // keeps a future real API call bounded/affordable

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  /* ---------- text extraction ---------- */
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

  /* ---------- credit balance (client-side read; the Edge Function
     re-checks this server-side on submit regardless -- this is only
     for showing the user where they stand, not the real gate) ------ */
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

  /* ---------- gate rendering ---------- */
  function signInCardHtml() {
    return `
      <div class="gate-card">
        <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
        <h3 style="margin-bottom:8px;">Sign in to upload a document</h3>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">AI document analysis runs on purchased credits tied to your account. Sign in first, then purchase credits if you don't have any yet.</p>
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
        <h3 style="margin-bottom:4px;">Upload a pleading for AI analysis</h3>
        <div class="eg-purchase-price">${PRICE_DISPLAY}</div>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:12px;">Each credit analyzes one document. Credits never expire and stack across purchases.</p>
        ${usedNote}
        <a href="${STRIPE_PAYMENT_LINK_URL}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Purchase Credits</a>
      </div>`;
  }

  function categoryRoles(slug) {
    try {
      // CASE_VALUATION_DATA is a top-level `const` in js/case-valuation-data.js
      // -- a classic-script global lexical binding, not a window property.
      return (typeof CASE_VALUATION_DATA !== "undefined") ? CASE_VALUATION_DATA.spec.categories[slug].roles : null;
    } catch (e) {
      return null;
    }
  }

  function uploadFormHtml(bal) {
    const catOptions = CATEGORIES.map((c) => `<option value="${c.slug}">${c.label}</option>`).join("");
    return `
      <div class="cv-ai-balance">
        <span class="badge badge-live">${bal.remaining} of ${bal.total} credits remaining</span>
      </div>
      <form id="cv-ai-form">
        <div class="cv-controls">
          <div class="cv-field">
            <label for="cv-ai-category">Litigation category</label>
            <select id="cv-ai-category" required>
              <option value="">Select a category…</option>
              ${catOptions}
            </select>
          </div>
          <div class="cv-field">
            <label for="cv-ai-side">Which side do you represent?</label>
            <select id="cv-ai-side">
              <option value="">Let the AI determine from the documents</option>
            </select>
          </div>
        </div>

        <div class="cv-ai-dropzone" id="cv-ai-dropzone">
          <input type="file" id="cv-ai-file" accept=".pdf,.docx,.txt" multiple style="display:none;" />
          <div class="cv-ai-dropzone-inner">
            <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <p><strong>Drop pleadings here</strong> or <button type="button" class="text-accent" id="cv-ai-browse-btn" style="background:none; border:none; padding:0; font:inherit; cursor:pointer; text-decoration:underline;">browse files</button></p>
            <p class="text-muted" style="font-size:12px;">PDF, .docx, or .txt — add as many as you have (the original petition, an answer, a counterclaim). Nothing is uploaded until you click Analyze, and no raw file is stored.</p>
          </div>
          <div class="cv-ai-filelist" id="cv-ai-filelist"></div>
        </div>

        <div class="cv-field">
          <label for="cv-ai-pastetext">Additional context or text (optional)</label>
          <textarea id="cv-ai-pastetext" rows="4" placeholder="Paste any extra text here — it's added alongside the files above, or can be used on its own instead of uploading anything."></textarea>
        </div>

        <div class="cv-controls">
          <div class="cv-field">
            <label for="cv-ai-expecttotrial">Expect this to go to trial, or settle/motion first?</label>
            <select id="cv-ai-expecttotrial">
              <option value="false" selected>Settlement or motion practice</option>
              <option value="true">Full trial</option>
            </select>
          </div>
          <div class="cv-field">
            <label for="cv-ai-settlement">Settlement currently on the table ($, optional)</label>
            <input id="cv-ai-settlement" type="number" step="any" />
          </div>
        </div>

        <button type="submit" class="btn btn-primary btn-sm" id="cv-ai-submit-btn">
          Analyze Documents
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </form>
      <div id="cv-ai-status" class="cv-ai-status"></div>
      <div id="cv-ai-results"></div>
    `;
  }

  function renderFileList(filenameEl, files) {
    if (!files.length) { filenameEl.innerHTML = ""; return; }
    filenameEl.innerHTML = files.map((f, i) => `
      <span class="cv-ai-file-chip">${f.name}<button type="button" class="cv-ai-file-remove" data-idx="${i}" aria-label="Remove ${f.name}">&times;</button></span>
    `).join("");
  }

  function wireUploadForm(bal) {
    const form = document.getElementById("cv-ai-form");
    const fileInput = document.getElementById("cv-ai-file");
    const dropzone = document.getElementById("cv-ai-dropzone");
    const browseBtn = document.getElementById("cv-ai-browse-btn");
    const filenameEl = document.getElementById("cv-ai-filelist");
    const pasteEl = document.getElementById("cv-ai-pastetext");
    const statusEl = document.getElementById("cv-ai-status");
    const resultsEl = document.getElementById("cv-ai-results");
    const submitBtn = document.getElementById("cv-ai-submit-btn");
    const categorySelect = document.getElementById("cv-ai-category");
    const sideSelect = document.getElementById("cv-ai-side");

    let chosenFiles = [];

    categorySelect.addEventListener("change", () => {
      const roles = categoryRoles(categorySelect.value);
      sideSelect.innerHTML = `<option value="">Let the AI determine from the documents</option>` +
        (roles ? `<option value="sideA">${roles.sideA}</option><option value="sideB">${roles.sideB}</option>` : "");
    });

    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      chosenFiles = chosenFiles.concat(Array.from(fileInput.files || []));
      fileInput.value = "";
      renderFileList(filenameEl, chosenFiles);
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
        renderFileList(filenameEl, chosenFiles);
      }
    });
    filenameEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".cv-ai-file-remove");
      if (!btn) return;
      chosenFiles.splice(parseInt(btn.getAttribute("data-idx"), 10), 1);
      renderFileList(filenameEl, chosenFiles);
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      resultsEl.innerHTML = "";
      const category = categorySelect.value;
      if (!category) { statusEl.textContent = "Select a litigation category first."; statusEl.className = "cv-ai-status is-error"; return; }
      if (!chosenFiles.length && !pasteEl.value.trim()) { statusEl.textContent = "Upload at least one file or paste the document text first."; statusEl.className = "cv-ai-status is-error"; return; }

      submitBtn.disabled = true;
      let documentText = "";
      try {
        const sections = [];
        for (let i = 0; i < chosenFiles.length; i++) {
          const f = chosenFiles[i];
          statusEl.textContent = `Extracting text (${i + 1} of ${chosenFiles.length}: ${f.name})…`;
          statusEl.className = "cv-ai-status";
          const text = await extractText(f);
          if (text) sections.push(`=== Document ${i + 1}: ${f.name} ===\n${text}`);
        }
        if (pasteEl.value.trim()) {
          sections.push(chosenFiles.length ? `=== Additional context ===\n${pasteEl.value.trim()}` : pasteEl.value.trim());
        }
        documentText = sections.join("\n\n");
        if (!documentText) throw new Error("No text could be extracted — try pasting the text directly instead.");
        if (documentText.length > MAX_CHARS) {
          documentText = documentText.slice(0, MAX_CHARS);
          statusEl.textContent = `Combined document text truncated to the first ${MAX_CHARS.toLocaleString()} characters for analysis…`;
        } else {
          statusEl.textContent = "Analyzing…";
        }

        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error("Your session expired — sign in again and retry.");

        const resp = await fetch(ANALYZE_FN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": SUPABASE_PUBLISHABLE_KEY
          },
          body: JSON.stringify({
            documentText,
            category,
            userSide: sideSelect.value || null,
            expectToTrial: document.getElementById("cv-ai-expecttotrial").value === "true",
            settlementOnTable: parseFloat(document.getElementById("cv-ai-settlement").value) || null
          })
        });
        const json = await resp.json().catch(() => ({}));

        if (resp.ok) {
          statusEl.textContent = "";
          resultsEl.innerHTML = renderAnalysisResult(json);
          return;
        }

        statusEl.textContent = "";
        if (resp.status === 402) {
          resultsEl.innerHTML = noCreditsCardHtml({ total: bal.total, used: bal.total });
        } else if (resp.status === 429) {
          resultsEl.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">${json.error || "You've hit today's request limit — try again tomorrow."}</p></div>`;
        } else if (resp.status === 501) {
          resultsEl.innerHTML = `<div class="gate-card"><div class="eyebrow" style="margin-bottom:8px;">Coming Soon</div><p class="text-secondary" style="font-size:13.5px;">AI document analysis is being finalized on our end — the upload and access checks above are fully live, but the analysis engine itself isn't switched on yet. Check back soon, and your credit was <strong>not</strong> used for this attempt.</p></div>`;
        } else if (resp.status === 401) {
          resultsEl.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">Your session expired — refresh the page and sign in again.</p></div>`;
        } else {
          resultsEl.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">${(json && json.error) || "Something went wrong — try again."}</p></div>`;
        }
      } catch (err) {
        statusEl.textContent = "";
        resultsEl.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">${err.message || "Something went wrong — try again."}</p></div>`;
      } finally {
        submitBtn.disabled = false;
        renderGate(); // refresh the credit balance shown at the top
      }
    });
  }

  // Response shape from case-valuation-analyze on success:
  //   {
  //     extractedFacts: { ...same keys js/case-valuation.js's QUESTIONS uses,
  //                        plus filingParty: "sideA"|"sideB"... },
  //     analysis: {
  //       narrative: string,            // the reasoned, judgment-style writeup
  //       likelyOutcome: string,        // short bottom-line summary
  //       damagesRange: [number, number],  // net position for the filing party
  //       roleLabel: string,            // e.g. "Landlord" -- which side filed
  //       categoryLabel: string,
  //       claims: [{ claimKey, label, probability, damagesRange,
  //                  expectedValueRange, note, isBenchmark, citations }],
  //       citedCases: [{ caseName, sourceUrl, year, dollarAmount }]
  //     }
  //   }
  // The dollar/probability numbers and case citations are all computed by
  // the same deterministic engine the manual-entry tool uses server-side
  // -- only the narrative prose itself is AI-generated.
  const fmtRange = (lo, hi) => (window.RELAW_VALUATION ? window.RELAW_VALUATION.fmtRange(lo, hi) : `$${Math.round(lo).toLocaleString()} – $${Math.round(hi).toLocaleString()}`);
  const fmtMoney = (n) => (window.RELAW_VALUATION ? window.RELAW_VALUATION.fmt(n) : `$${Math.round(n).toLocaleString()}`);

  function aiClaimCardHtml(c) {
    const evRange = c.expectedValueRange;
    return `
      <div class="cv-claim-card">
        <div class="cv-claim-top">
          <h4>${c.label}</h4>
          <span class="cv-prob">${Math.round(c.probability[0] * 100)}–${Math.round(c.probability[1] * 100)}% likelihood</span>
        </div>
        ${c.damagesRange ? `<div class="cv-damages">Damages range: ${fmtRange(c.damagesRange[0], c.damagesRange[1])}</div>` : ""}
        ${evRange && !c.isBenchmark ? `<div class="cv-ev">Expected value: <strong>${fmtRange(evRange[0], evRange[1])}</strong></div>` : ""}
        ${c.note ? `<p class="cv-note">${c.note}</p>` : ""}
        ${(c.citations || []).length ? `<div class="cv-citations"><div class="cv-citations-label">Grounded in real cases:</div>${c.citations.map((cit) => `
          <div class="cv-citation">
            <a href="${cit.sourceUrl}" target="_blank" rel="noopener">${cit.caseName}</a>
            ${cit.year ? ` (${cit.year})` : ""}
            ${cit.dollarAmount ? ` — ${fmtMoney(cit.dollarAmount)}` : ""}
          </div>`).join("")}</div>` : ""}
      </div>`;
  }

  function renderAnalysisResult(json) {
    const a = json.analysis || {};
    const facts = json.extractedFacts || {};
    const factEntries = Object.entries(facts).filter(([k, v]) => k !== "filingParty" && v !== null && v !== undefined && v !== "");
    const factsHtml = factEntries.length
      ? `<div class="cv-ai-facts"><div class="cv-citations-label">Facts extracted from your document:</div>${factEntries.map(([k, v]) => `<span class="detail-tag">${k}: ${v}</span>`).join("")}</div>`
      : "";
    const claimsHtml = (a.claims || []).length
      ? `<div class="cv-claims" style="margin-top:16px;">${a.claims.map(aiClaimCardHtml).join("")}</div>`
      : "";
    return `
      <div class="cv-summary card">
        <div class="eyebrow" style="margin-bottom:8px;">AI Analysis — Probability-Weighted Prediction${a.roleLabel ? ` — ${a.roleLabel} view` : ""}</div>
        ${a.damagesRange ? `<div class="cv-net">${fmtRange(a.damagesRange[0], a.damagesRange[1])}</div>` : ""}
        ${a.likelyOutcome ? `<p class="text-secondary" style="font-size:13.5px; margin-top:8px;">${a.likelyOutcome}</p>` : ""}
      </div>
      ${a.narrative ? `<div class="card" style="padding:20px; margin-top:16px;"><div class="eyebrow" style="margin-bottom:8px;">Reasoning</div><p class="cv-note" style="font-size:13.5px; line-height:1.7;">${a.narrative}</p></div>` : ""}
      ${factsHtml}
      ${claimsHtml}
      <p class="text-muted" style="font-size:12px; margin-top:14px;">This is a probability-weighted prediction generated from the document you provided, not a legal opinion, adjudication, or substitute for counsel.</p>`;
  }

  /* ---------- gate orchestration ---------- */
  async function renderGate() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session) {
      host.innerHTML = signInCardHtml();
      const btn = document.getElementById("cv-ai-signin-btn");
      if (btn && window.RELAW_AUTH) btn.addEventListener("click", () => window.RELAW_AUTH.openSignInModal());
      return;
    }
    host.innerHTML = `<div class="gate-card is-loading">Checking your credit balance…</div>`;
    const bal = await getCreditBalance();
    if (!bal) {
      host.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">Couldn't check your credit balance — refresh and try again.</p></div>`;
      return;
    }
    if (bal.remaining <= 0) {
      host.innerHTML = noCreditsCardHtml(bal);
      return;
    }
    host.innerHTML = uploadFormHtml(bal);
    wireUploadForm(bal);
  }

  sb.auth.getSession().then(() => renderGate());
  sb.auth.onAuthStateChange(() => renderGate());
})();
