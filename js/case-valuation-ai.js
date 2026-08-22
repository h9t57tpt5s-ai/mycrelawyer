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

  function uploadFormHtml(bal) {
    const catOptions = CATEGORIES.map((c) => `<option value="${c.slug}">${c.label}</option>`).join("");
    return `
      <div class="cv-ai-balance">
        <span class="badge badge-live">${bal.remaining} of ${bal.total} credits remaining</span>
      </div>
      <form id="cv-ai-form">
        <div class="cv-field">
          <label for="cv-ai-category">Litigation category</label>
          <select id="cv-ai-category" required>
            <option value="">Select a category…</option>
            ${catOptions}
          </select>
        </div>

        <div class="cv-ai-dropzone" id="cv-ai-dropzone">
          <input type="file" id="cv-ai-file" accept=".pdf,.docx,.txt" style="display:none;" />
          <div class="cv-ai-dropzone-inner">
            <svg viewBox="0 0 24 24" fill="none" width="26" height="26"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <p><strong>Drop a pleading here</strong> or <button type="button" class="text-accent" id="cv-ai-browse-btn" style="background:none; border:none; padding:0; font:inherit; cursor:pointer; text-decoration:underline;">browse a file</button></p>
            <p class="text-muted" style="font-size:12px;">PDF, .docx, or .txt — nothing is uploaded until you click Analyze, and the raw file is never stored.</p>
          </div>
          <p class="cv-ai-filename" id="cv-ai-filename"></p>
        </div>

        <div class="cv-field">
          <label for="cv-ai-pastetext">Or paste the text directly</label>
          <textarea id="cv-ai-pastetext" rows="6" placeholder="Paste the pleading's text here instead of uploading a file…"></textarea>
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
          Analyze Document
          <svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </form>
      <div id="cv-ai-status" class="cv-ai-status"></div>
      <div id="cv-ai-results"></div>
    `;
  }

  function wireUploadForm(bal) {
    const form = document.getElementById("cv-ai-form");
    const fileInput = document.getElementById("cv-ai-file");
    const dropzone = document.getElementById("cv-ai-dropzone");
    const browseBtn = document.getElementById("cv-ai-browse-btn");
    const filenameEl = document.getElementById("cv-ai-filename");
    const pasteEl = document.getElementById("cv-ai-pastetext");
    const statusEl = document.getElementById("cv-ai-status");
    const resultsEl = document.getElementById("cv-ai-results");
    const submitBtn = document.getElementById("cv-ai-submit-btn");

    let chosenFile = null;

    browseBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      chosenFile = fileInput.files[0] || null;
      filenameEl.textContent = chosenFile ? `Selected: ${chosenFile.name}` : "";
      if (chosenFile) pasteEl.value = "";
    });
    ["dragover", "dragenter"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); })
    );
    ["dragleave", "dragend", "drop"].forEach((evt) =>
      dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("is-dragover"); })
    );
    dropzone.addEventListener("drop", (e) => {
      const f = e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) {
        chosenFile = f;
        fileInput.files = e.dataTransfer.files;
        filenameEl.textContent = `Selected: ${f.name}`;
        pasteEl.value = "";
      }
    });
    pasteEl.addEventListener("input", () => {
      if (pasteEl.value.trim()) { chosenFile = null; fileInput.value = ""; filenameEl.textContent = ""; }
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      resultsEl.innerHTML = "";
      const category = document.getElementById("cv-ai-category").value;
      if (!category) { statusEl.textContent = "Select a litigation category first."; statusEl.className = "cv-ai-status is-error"; return; }
      if (!chosenFile && !pasteEl.value.trim()) { statusEl.textContent = "Upload a file or paste the document text first."; statusEl.className = "cv-ai-status is-error"; return; }

      submitBtn.disabled = true;
      let documentText = "";
      try {
        if (chosenFile) {
          statusEl.textContent = "Extracting text from the document…";
          statusEl.className = "cv-ai-status";
          documentText = await extractText(chosenFile);
        } else {
          documentText = pasteEl.value.trim();
        }
        if (!documentText) throw new Error("No text could be extracted from that file — try pasting the text directly instead.");
        if (documentText.length > MAX_CHARS) {
          documentText = documentText.slice(0, MAX_CHARS);
          statusEl.textContent = `Document truncated to the first ${MAX_CHARS.toLocaleString()} characters for analysis…`;
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

  // Renders a future real analysis response. Expected shape, once the
  // Claude call is wired up in the Edge Function:
  //   {
  //     extractedFacts: { ...same keys the manual-entry engine uses... },
  //     analysis: {
  //       narrative: string,            // the reasoned, judgment-style writeup
  //       likelyOutcome: string,        // short bottom-line summary
  //       damagesRange: [number, number],
  //       probability: number,          // 0-1
  //       citedCases: [{ caseName, sourceUrl, year, dollarAmount }]
  //     }
  //   }
  function renderAnalysisResult(json) {
    const a = json.analysis || {};
    const facts = json.extractedFacts || {};
    const factsHtml = Object.keys(facts).length
      ? `<div class="cv-ai-facts"><div class="cv-citations-label">Facts extracted from your document:</div>${Object.entries(facts).map(([k, v]) => `<div class="detail-tag">${k}: ${v}</div>`).join("")}</div>`
      : "";
    const citesHtml = (a.citedCases || []).length
      ? `<div class="cv-citations"><div class="cv-citations-label">Grounded in real cases:</div>${a.citedCases.map((c) => `<div class="cv-citation"><a href="${c.sourceUrl}" target="_blank" rel="noopener">${c.caseName}</a>${c.year ? ` (${c.year})` : ""}</div>`).join("")}</div>`
      : "";
    return `
      <div class="cv-claim-card">
        <div class="eyebrow" style="margin-bottom:8px;">AI Analysis — Probability-Weighted Prediction</div>
        ${a.likelyOutcome ? `<h4>${a.likelyOutcome}</h4>` : ""}
        ${a.damagesRange ? `<div class="cv-damages">Estimated damages range: ${window.RELAW_VALUATION ? window.RELAW_VALUATION.fmtRange(a.damagesRange[0], a.damagesRange[1]) : a.damagesRange.join(" – ")}</div>` : ""}
        ${a.narrative ? `<p class="cv-note">${a.narrative}</p>` : ""}
        ${factsHtml}
        ${citesHtml}
        <p class="text-muted" style="font-size:12px; margin-top:14px;">This is a probability-weighted prediction generated by AI from the document you provided, not a legal opinion, adjudication, or substitute for counsel.</p>
      </div>`;
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
