/* =========================================================
   CREdocket — Contribute a Settlement page logic
   Two-document upload (petition/complaint + non-confidential settlement),
   client-side text extraction (same pdf.js/mammoth.js pattern as the
   Case Value Calculator's document-upload tool), submission to the
   contribute-settlement Edge Function, plus a read-only submission-
   history list and the public aggregate-benchmarks panel.

   Consistent with the rest of the site's document-upload tools: the raw
   file never leaves the browser except as extracted text.
   ========================================================= */

(function () {
  "use strict";
  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  const CONTRIBUTE_FN_URL = SUPABASE_URL + "/functions/v1/contribute-settlement";
  const MAX_DOC_CHARS = 40000; // mirrors the server-side cap in contribute-settlement/index.ts

  const sb = window.RELAW_SUPABASE;
  const host = document.getElementById("cs-host");
  const submissionsHost = document.getElementById("cs-submissions-host");
  const benchmarksHost = document.getElementById("cs-benchmarks-host");
  if (!host) return;

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

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
    throw new Error("Unsupported file type — upload a PDF, .docx, or .txt file.");
  }

  function signInCardHtml() {
    return `
      <div class="gate-card">
        <div class="eyebrow" style="margin-bottom:8px;">Free account required</div>
        <h3 style="margin-bottom:8px;">Sign in to contribute</h3>
        <p class="text-secondary" style="font-size:13.5px; line-height:1.6; margin-bottom:16px;">Contributing is free and credits are tied to your account, so you'll need to sign in first.</p>
        <button type="button" class="btn btn-primary btn-sm" id="cs-signin-btn">Sign in to continue</button>
      </div>`;
  }

  function dropzoneHtml(id, label, hint) {
    return `
      <div>
        <span class="cs-dropzone-label">${label}</span>
        <div class="cv-ai-dropzone" id="${id}-dropzone">
          <input type="file" id="${id}-file" accept=".pdf,.docx,.txt" style="display:none;" />
          <div class="cv-ai-dropzone-inner">
            <svg viewBox="0 0 24 24" fill="none" width="24" height="24"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <p><strong>Drop file here</strong> or <button type="button" class="text-accent" id="${id}-browse-btn" style="background:none; border:none; padding:0; font:inherit; cursor:pointer; text-decoration:underline;">browse</button></p>
            <p class="text-muted" style="font-size:11.5px;">${hint}</p>
          </div>
          <div class="cv-ai-filelist" id="${id}-filelist"></div>
        </div>
      </div>`;
  }

  function formHtml() {
    return `
      <div class="card cv-upload-card" style="padding:20px;">
        <div class="cs-dropzone-grid">
          ${dropzoneHtml("cs-petition", "Petition / Complaint", "PDF, .docx, or .txt")}
          ${dropzoneHtml("cs-settlement", "Settlement Agreement or Final Order/Judgment", "PDF, .docx, or .txt — must NOT be confidential")}
        </div>
        <div class="cs-cert-row">
          <input type="checkbox" id="cs-cert-checkbox" />
          <label for="cs-cert-checkbox">I certify that the settlement/order I'm uploading is <strong>not</strong> subject to a confidentiality or non-disclosure provision, that I am authorized to share it, and that the facts in these documents are genuine and not fabricated or altered.</label>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="cs-submit-btn" disabled>
          Submit for Review
          <svg viewBox="0 0 24 24" fill="none" width="16" height="16"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div id="cs-status" class="cv-ai-status"></div>
        <div id="cs-result"></div>
      </div>`;
  }

  function wireForm() {
    host.innerHTML = formHtml();
    const certCheckbox = document.getElementById("cs-cert-checkbox");
    const submitBtn = document.getElementById("cs-submit-btn");
    const statusEl = document.getElementById("cs-status");
    const resultEl = document.getElementById("cs-result");
    const SPINNER = `<span class="cv-spinner" aria-hidden="true"></span>`;

    let petitionFile = null, settlementFile = null;

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

    function wireDropzone(id, onFile) {
      const dropzone = document.getElementById(id + "-dropzone");
      const fileInput = document.getElementById(id + "-file");
      const browseBtn = document.getElementById(id + "-browse-btn");
      const filelistEl = document.getElementById(id + "-filelist");
      function setFile(f) {
        onFile(f);
        filelistEl.innerHTML = f ? `<span class="cv-ai-file-chip">${f.name}<button type="button" class="cv-ai-file-remove" aria-label="Remove">&times;</button></span>` : "";
        const removeBtn = filelistEl.querySelector(".cv-ai-file-remove");
        if (removeBtn) removeBtn.addEventListener("click", () => setFile(null));
      }
      browseBtn.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", () => {
        if (fileInput.files && fileInput.files[0]) setFile(fileInput.files[0]);
        fileInput.value = "";
      });
      ["dragover", "dragenter"].forEach((evt) =>
        dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("is-dragover"); })
      );
      ["dragleave", "dragend"].forEach((evt) =>
        dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("is-dragover"); })
      );
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("is-dragover");
        const dropped = (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) || null;
        if (dropped) setFile(dropped);
      });
    }

    wireDropzone("cs-petition", (f) => { petitionFile = f; updateSubmitEnabled(); });
    wireDropzone("cs-settlement", (f) => { settlementFile = f; updateSubmitEnabled(); });

    function updateSubmitEnabled() {
      submitBtn.disabled = !(petitionFile && settlementFile && certCheckbox.checked);
    }
    certCheckbox.addEventListener("change", updateSubmitEnabled);

    submitBtn.addEventListener("click", async () => {
      submitBtn.disabled = true;
      resultEl.innerHTML = "";
      try {
        setStatus("Reading documents…", { spinner: true });
        const [petitionText, settlementText] = await Promise.all([
          extractText(petitionFile),
          extractText(settlementFile),
        ]);
        if (!petitionText || !settlementText) {
          throw new Error("No text could be read from one or both files — this usually means a scanned/image-only PDF with no selectable text. Try a text-based copy.");
        }

        const { data: { session } } = await sb.auth.getSession();
        if (!session) throw new Error("Your session expired — sign in again and retry.");

        setStatus("Extracting facts and submitting for review…", { spinner: true });
        const resp = await fetch(CONTRIBUTE_FN_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${session.access_token}`,
            "apikey": SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({
            petitionText: petitionText.slice(0, MAX_DOC_CHARS),
            settlementText: settlementText.slice(0, MAX_DOC_CHARS),
            userAttestedNonConfidential: true,
          }),
        });
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json.error || `Request failed (${resp.status})`);

        setStatus("");
        const ex = json.extracted || {};
        const rows = [
          ["Category", ex.category], ["Property type", ex.propertyType], ["Jurisdiction", ex.jurisdiction],
          ["Claimed amount", ex.claimedAmount != null ? "$" + Number(ex.claimedAmount).toLocaleString("en-US") : null],
          ["Settled amount", ex.settledAmount != null ? "$" + Number(ex.settledAmount).toLocaleString("en-US") : null],
          ["Key drivers", ex.keyFactualDrivers],
        ].filter(([, v]) => v);
        const flaggedNote = json.confidentialityFlagged
          ? `<p class="text-secondary" style="font-size:12.5px; margin-top:10px;"><strong>Flagged for extra review:</strong> our automated scan found language in the settlement text that may indicate a confidentiality provision. A reviewer will look closely before any credit is granted — if this is a false positive (e.g. "confidential business information" used in an unrelated clause), it'll still be approved once confirmed.</p>`
          : "";
        resultEl.innerHTML = `
          <div class="gate-card" style="margin-top:14px; text-align:left;">
            <div class="eyebrow" style="margin-bottom:8px;">Submitted — Status: ${json.status === "flagged" ? "Flagged for Review" : "Pending Review"}</div>
            <p class="text-secondary" style="font-size:13px; margin-bottom:10px;">Here's what we extracted. A reviewer will confirm it before any credit is granted.</p>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${rows.map(([k, v]) => `<span class="detail-tag">${k}: ${v}</span>`).join("")}
            </div>
            ${flaggedNote}
          </div>`;
        petitionFile = null; settlementFile = null;
        document.getElementById("cs-petition-filelist").innerHTML = "";
        document.getElementById("cs-settlement-filelist").innerHTML = "";
        certCheckbox.checked = false;
        updateSubmitEnabled();
        loadSubmissions();
      } catch (err) {
        setStatus((err && err.message) || "Something went wrong — try again.", { error: true });
        submitBtn.disabled = false;
      }
    });
  }

  function statusPillHtml(status) {
    const label = { pending_review: "Pending Review", flagged: "Flagged for Review", approved: "Approved", rejected: "Not Approved" }[status] || status;
    return `<span class="cs-status-pill cs-status-${status}">${label}</span>`;
  }

  async function loadSubmissions() {
    if (!sb) return;
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      submissionsHost.innerHTML = `<p class="text-muted" style="font-size:13px;">Sign in to see your submission history.</p>`;
      return;
    }
    const { data, error } = await sb
      .from("settlement_contributions")
      .select("id, category, jurisdiction, status, credits_awarded, created_at")
      .order("created_at", { ascending: false })
      .limit(25);
    if (error) {
      submissionsHost.innerHTML = `<p class="text-muted" style="font-size:13px;">Couldn't load your submissions right now.</p>`;
      return;
    }
    if (!data || !data.length) {
      submissionsHost.innerHTML = `<p class="text-muted" style="font-size:13px;">No submissions yet — upload your first pair of documents above.</p>`;
      return;
    }
    submissionsHost.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="cs-submissions-table">
          <thead><tr><th>Submitted</th><th>Category</th><th>Jurisdiction</th><th>Status</th><th>Credits</th></tr></thead>
          <tbody>
            ${data.map((r) => `
              <tr>
                <td>${new Date(r.created_at).toLocaleDateString("en-US")}</td>
                <td>${r.category || "—"}</td>
                <td>${r.jurisdiction || "—"}</td>
                <td>${statusPillHtml(r.status)}</td>
                <td>${r.credits_awarded != null ? r.credits_awarded : "—"}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  async function loadBenchmarks() {
    if (!sb) { benchmarksHost.innerHTML = `<p class="text-muted" style="font-size:13px;">Not available right now.</p>`; return; }
    const { data, error } = await sb.rpc("get_settlement_benchmarks");
    if (error) {
      benchmarksHost.innerHTML = `<p class="text-muted" style="font-size:13px;">Not enough contributed data yet to show benchmarks — check back soon.</p>`;
      return;
    }
    if (!data || !data.length) {
      benchmarksHost.innerHTML = `<p class="text-muted" style="font-size:13px;">No slice has reached the minimum of 3 contributions yet — be among the first to change that.</p>`;
      return;
    }
    const fmt = (n) => n == null ? "—" : "$" + Math.round(Number(n)).toLocaleString("en-US");
    benchmarksHost.innerHTML = `
      <div style="overflow-x:auto;">
        <table class="cs-benchmarks-table">
          <thead><tr><th>Category</th><th>Jurisdiction</th><th>Property Type</th><th>Contributions</th><th>Median</th><th>Range</th></tr></thead>
          <tbody>
            ${data.map((r) => `
              <tr>
                <td>${r.category || "—"}</td>
                <td>${r.jurisdiction || "—"}</td>
                <td>${r.property_type || "—"}</td>
                <td>${r.contribution_count}</td>
                <td>${fmt(r.median_settled)}</td>
                <td>${fmt(r.min_settled)} – ${fmt(r.max_settled)}</td>
              </tr>`).join("")}
          </tbody>
        </table>
      </div>`;
  }

  async function init() {
    if (!sb) { host.innerHTML = `<div class="gate-card"><p class="text-secondary" style="font-size:13.5px;">This feature isn't available right now.</p></div>`; return; }
    const { data: { session } } = await sb.auth.getSession();
    if (!session) {
      host.innerHTML = signInCardHtml();
      const btn = document.getElementById("cs-signin-btn");
      if (btn && window.RELAW_AUTH) btn.addEventListener("click", () => window.RELAW_AUTH.openSignInModal());
    } else {
      wireForm();
    }
    loadSubmissions();
    loadBenchmarks();
  }

  init();
  if (sb) sb.auth.onAuthStateChange(() => init());
})();
