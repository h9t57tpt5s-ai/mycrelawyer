/* Weekly email sign-up box in the band above every page's footer
   (replaced the beehiiv embed, 2026-10-06). Posts to the newsletter Edge
   Function, which emails a confirmation link (double opt-in). */
(function () {
  const FN = "https://ribmcdyoydhmafnyfhpp.supabase.co/functions/v1/newsletter";
  document.querySelectorAll("[data-newsletter-form]").forEach((form) => {
    const input = form.querySelector("input[type=email]");
    const status = form.querySelector("[data-newsletter-status]");
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
      try {
        const r = await fetch(FN, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "subscribe", email: input.value, source: "footer:" + location.pathname.slice(0, 50) }),
        });
        const d = await r.json();
        status.textContent = d.ok ? (d.already ? "You're already subscribed." : "Check your inbox and click the link to confirm.") : (d.error || "Something went wrong. Try again.");
        status.className = "gate-form-status " + (d.ok ? "is-success" : "is-error");
        if (d.ok && window.RELAW_TRACK) window.RELAW_TRACK("signup", { detail: "newsletter" });
      } catch (err) {
        status.textContent = "Couldn't reach the server. Try again.";
        status.className = "gate-form-status is-error";
      }
      btn.disabled = false;
    });
  });
})();
