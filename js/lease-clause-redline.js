/* =========================================================
   CREdocket — Lease Clause Redline Checker page logic
   -----------------------------------------------------------
   Shares the Litigation Value Estimator's credit balance and
   sign-in gating pattern by design (see the Edge Function's own
   header comment) -- the balance check below queries the exact
   same tables case-valuation.js does.
   ========================================================= */

(function () {
  "use strict";
  if (typeof LEASE_REDLINE_DATA === "undefined") return;
  const sb = window.RELAW_SUPABASE;
  if (!sb) return;

  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  const REDLINE_FN_URL = SUPABASE_URL + "/functions/v1/lease-clause-redline";
  const STRIPE_PAYMENT_LINK_URL = "https://buy.stripe.com/dRm9AL34yaOSeLJetz1B601";
  const PRICE_DISPLAY = "$49 one-time — 10 analysis credits (shared with the Litigation Value Estimator)";

  const clauseTypeSelect = document.getElementById("lr-clause-type");
  const representingSelect = document.getElementById("lr-representing");
  const clauseTextEl = document.getElementById("lr-clause-text");
  const fileInput = document.getElementById("lr-file-input");
  const fileBrowseBtn = document.getElementById("lr-file-browse-btn");
  const fileStatus = document.getElementById("lr-file-status");
  const uploadHost = document.getElementById("lr-upload-host");
  const resultsHost = document.getElementById("lr-results-host");
  if (!clauseTypeSelect) return;

  Object.entries(LEASE_REDLINE_DATA.clauseTypes).forEach(([key, spec]) => {
    const opt = document.createElement("option");
    opt.value = key; opt.textContent = spec.label;
    clauseTypeSelect.appendChild(opt);
  });

  // ---- File extraction (mirrors js/case-valuation.js's extractText) ----
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
    throw new Error("Unsupported file type — upload a PDF, .docx, or .txt file, or paste the text directly.");
  }

  fileBrowseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileStatus.textContent = `Extracting text from ${file.name}…`;
    try {
      const text = await extractText(file);
      if (!text) {
        fileStatus.textContent = `No text found in ${file.name} — this usually means a scanned/image-only PDF. Paste the text directly instead.`;
        return;
      }
      clauseTextEl.value = text;
      fileStatus.textContent = `Loaded ${file.name} — review/trim to just the relevant clause below before analyzing.`;
    } catch (err) {
      fileStatus.textContent = err.message || "Couldn't extract text from that file.";
    }
    fileInput.value = "";
  });

  // ---- Credit balance + gating (same tables as the Value Estimator) ----
  async function getCreditBalance() {
    const [{ data: purchases, error: pErr }, { count, error: cErr }] = await Promise.all([
      sb.from("case_valuation_purchases").select("credits_granted"),
      sb.from("case_valuation_analyses").select("id", { count: "exact", head: true }),
    ]);
    if (pErr || cErr) return null;
    const total = (purchases || []).reduce((s, p) => s + (p.credits_granted || 0), 0);
    const used = count || 0;
    return { total, used, remaining: total - used };
  }

  function signInCardHtml() {
    return `
      <div class="gate-card">
        <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
        <h3 style="margin-bottom:8px;">Sign in to run the redline checker</h3>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">This runs on the same purchased analysis credits as the Litigation Value Estimator.</p>
        <button type="button" class="btn btn-primary btn-sm" id="lr-signin-btn">Sign in to continue</button>
      </div>`;
  }
  function noCreditsCardHtml(bal) {
    const usedNote = bal && bal.total > 0
      ? `<p class="text-muted" style="font-size:12px; margin-bottom:16px;">You've used ${bal.used} of ${bal.total} purchased credits.</p>`
      : "";
    return `
      <div class="gate-card eg-purchase-card">
        <div class="eyebrow" style="margin-bottom:8px;">Analysis Credits Required</div>
        <h3 style="margin-bottom:4px;">Analyze a lease clause</h3>
        <div class="eg-purchase-price">${PRICE_DISPLAY}</div>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:12px;">Each credit analyzes one clause and works across both the Redline Checker and the Litigation Value Estimator. Credits never expire and stack across purchases.</p>
        ${usedNote}
        <a href="${STRIPE_PAYMENT_LINK_URL}" target="_blank" rel="noopener" class="btn btn-primary btn-sm">Purchase Credits</a>
      </div>`;
  }

  const SPINNER = `<span class="cv-spinner" aria-hidden="true"></span>`;

  async function renderUploadZone() {
    const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
    if (!session) {
      uploadHost.innerHTML = signInCardHtml();
      const btn = document.getElementById("lr-signin-btn");
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
    uploadHost.innerHTML = `
      <div class="card" style="padding:20px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;">
        <span class="badge badge-live">${bal.remaining} of ${bal.total} analysis credits remaining</span>
        <button type="button" class="btn btn-primary" id="lr-analyze-btn">Analyze Clause</button>
      </div>
      <div id="lr-status" class="cv-ai-status"></div>`;
    document.getElementById("lr-analyze-btn").addEventListener("click", runAnalysis);
  }

  function setStatus(text, opts) {
    const el = document.getElementById("lr-status");
    if (!el) return;
    opts = opts || {};
    el.className = "cv-ai-status" + (opts.error ? " is-error" : "");
    el.innerHTML = "";
    if (opts.spinner) el.insertAdjacentHTML("beforeend", SPINNER);
    const span = document.createElement("span");
    span.textContent = text;
    el.appendChild(span);
  }

  function termCardHtml(termId, termMeta, aiTerm) {
    const badgeClass = {
      "market-standard": "lr-badge-neutral",
      "favors-landlord": "lr-badge-landlord",
      "favors-tenant": "lr-badge-tenant",
      "unusual-or-unclear": "lr-badge-warn",
      "not-addressed": "lr-badge-warn",
    }[aiTerm.marketComparison] || "lr-badge-neutral";
    const badgeLabel = {
      "market-standard": "Market Standard",
      "favors-landlord": "Favors Landlord",
      "favors-tenant": "Favors Tenant",
      "unusual-or-unclear": "Unusual / Unclear",
      "not-addressed": "Not Addressed",
    }[aiTerm.marketComparison] || aiTerm.marketComparison;
    return `
      <div class="lr-term-card card">
        <div class="lr-term-top">
          <h4>${termMeta.label}</h4>
          <span class="detail-tag ${badgeClass}">${badgeLabel}</span>
        </div>
        <p class="lr-term-says"><strong>What your clause says:</strong> ${aiTerm.whatTheClauseSays}</p>
        <p class="cv-note">${aiTerm.explanation}</p>
        <div class="lr-term-reference">
          <div class="lr-term-reference-row"><span class="lr-term-reference-label">Market standard</span><span>${termMeta.marketStandard}</span></div>
          <div class="lr-term-reference-row"><span class="lr-term-reference-label">Favors landlord</span><span>${termMeta.landlordFavorable}</span></div>
          <div class="lr-term-reference-row"><span class="lr-term-reference-label">Favors tenant</span><span>${termMeta.tenantFavorable}</span></div>
        </div>
      </div>`;
  }

  function renderResult(json) {
    const a = json.analysis || {};
    const clauseSpec = LEASE_REDLINE_DATA.clauseTypes[json.clauseType];
    const riskColorVar = { low: "--status-ruling", moderate: "--status-pending", high: "--status-appeal" }[a.overallRiskLevel] || "--status-pending";

    const termCards = (clauseSpec ? clauseSpec.keyTerms : []).map((termMeta) => {
      const aiTerm = a[termMeta.id];
      if (!aiTerm) return "";
      return termCardHtml(termMeta.id, termMeta, aiTerm);
    }).join("");

    const concernsHtml = (a.topConcerns || []).length
      ? `<div class="card" style="padding:20px; margin-top:16px;"><div class="eyebrow" style="margin-bottom:10px;">Top Concerns</div><ul class="lr-list">${a.topConcerns.map((c) => `<li>${c}</li>`).join("")}</ul></div>`
      : "";
    const revisionsHtml = (a.suggestedRevisions || []).length
      ? `<div class="card" style="padding:20px; margin-top:16px;"><div class="eyebrow" style="margin-bottom:10px;">Suggested Revisions</div>${a.suggestedRevisions.map((r) => `<div class="lr-revision"><div class="lr-revision-issue">${r.issue}</div><div class="lr-revision-suggestion">${r.suggestion}</div></div>`).join("")}</div>`
      : "";

    resultsHost.innerHTML = `
      <div class="cv-summary card">
        <div class="eyebrow" style="margin-bottom:8px;">${json.clauseTypeLabel} — Representing ${json.representingParty}</div>
        <div class="lr-risk-level" style="color:var(${riskColorVar});">${(a.overallRiskLevel || "").toUpperCase()} RISK</div>
      </div>
      ${concernsHtml}
      <div class="eyebrow" style="margin:20px 0 10px;">Term-by-Term Comparison</div>
      <div class="lr-term-grid">${termCards}</div>
      ${revisionsHtml}
      <div class="card" style="padding:20px; margin-top:16px;"><div class="eyebrow" style="margin-bottom:8px;">Comprehensive Analysis</div><p class="cv-note" style="font-size:13.5px; line-height:1.7;">${a.narrative || ""}</p></div>
      <p class="text-muted" style="font-size:12px; margin-top:14px;">${LEASE_REDLINE_DATA.disclaimer}</p>`;
    resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function runAnalysis() {
    const clauseType = clauseTypeSelect.value;
    const representingParty = representingSelect.value;
    const clauseText = clauseTextEl.value.trim();
    if (!clauseText) {
      setStatus("Paste or upload a clause first.", { error: true });
      return;
    }
    const btn = document.getElementById("lr-analyze-btn");
    btn.disabled = true;
    btn.innerHTML = `${SPINNER}<span>Analyzing…</span>`;
    resultsHost.innerHTML = "";
    setStatus("Analyzing… this can take 30-90 seconds for a thorough read.", { spinner: true });

    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) throw new Error("Your session expired — sign in again and retry.");
      const resp = await fetch(REDLINE_FN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ clauseText, clauseType, representingParty }),
      });
      const json = await resp.json().catch(() => null);
      if (resp.ok && json && json.analysis) {
        setStatus("");
        renderResult(json);
      } else {
        setStatus("");
        resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Analysis Didn't Run</div><p class="text-secondary" style="font-size:13.5px;">${(json && json.error) || "Something went wrong — try again."}</p></div>`;
        resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    } catch (err) {
      setStatus("");
      resultsHost.innerHTML = `<div class="gate-card is-error"><div class="eyebrow" style="margin-bottom:8px;">Analysis Didn't Run</div><p class="text-secondary" style="font-size:13.5px;">${err.message || "Something went wrong — try again."}</p></div>`;
      resultsHost.scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
      btn.disabled = false;
      renderUploadZone();
    }
  }

  sb.auth.getSession().then(() => renderUploadZone());
  renderUploadZone();
})();
