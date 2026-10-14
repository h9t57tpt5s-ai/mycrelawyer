/* Weekly email sign-up boxes: the band above every page's footer (replaced
   the beehiiv embed, 2026-10-06), matter pages, and the end of a full
   write-up in the tracker panel (2026-10-14). Posts to the newsletter Edge
   Function, which emails a confirmation link (double opt-in). A form's
   data-newsletter-source says where it sits, so the subscriber list shows
   which placement works; the default is "footer:<path>".
   window.RELAW_NEWSLETTER.wire(root) wires forms added after page load. */
(function () {
  const FN = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/newsletter";
  function wire(root) {
    (root || document).querySelectorAll("[data-newsletter-form]").forEach((form) => {
      if (form.dataset.wired) return;
      form.dataset.wired = "1";
      const input = form.querySelector("input[type=email]");
      const status = form.querySelector("[data-newsletter-status]") || form.parentElement.querySelector("[data-newsletter-status]");
      form.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) {
          status.className = "gate-form-status is-error";
          status.textContent = "Enter a valid email address.";
          return;
        }
        const btn = form.querySelector("button");
        btn.disabled = true;
        status.className = "gate-form-status";
        status.textContent = "Sending…";
        const source = (form.dataset.newsletterSource || "footer:" + location.pathname).slice(0, 60);
        try {
          const r = await fetch(FN, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "subscribe", email: input.value, source }),
          });
          const d = await r.json();
          status.textContent = d.ok ? (d.already ? "You're already subscribed." : "Check your inbox and click the link to confirm.") : (d.error || "Something went wrong. Try again.");
          status.className = "gate-form-status " + (d.ok ? "is-success" : "is-error");
          if (d.ok && window.RELAW_TRACK) window.RELAW_TRACK("signup", { detail: "newsletter", caseId: form.dataset.caseId || undefined });
        } catch (err) {
          status.textContent = "Couldn't reach the server. Try again.";
          status.className = "gate-form-status is-error";
        }
        btn.disabled = false;
      });
    });
  }
  window.RELAW_NEWSLETTER = { wire };
  wire(document);
})();
