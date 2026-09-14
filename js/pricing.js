/* =========================================================
   CREdocket — Pricing page: wires the Practitioner/Firm Subscribe
   buttons to their Stripe Payment Links.

   The two URLs below are the real Practitioner ($89/mo) and Firm
   ($249/mo) Stripe Payment Links (filled in 2026-09-13). Same "plain
   Payment Link, opened in a new tab" pattern js/case-valuation.js
   already uses for the one-time $49/10-credit pack
   (STRIPE_PAYMENT_LINK_URL) -- no custom Checkout Session code,
   consistent with the rest of this site's Stripe integration.

   Sign-in is required before opening the link (unlike the one-time
   pack, which only ever renders its own buy button post-sign-in
   already) because this page is public/ungated -- the webhook grants
   a subscription by matching the Stripe checkout email to an EXISTING
   CREdocket account (supabase/functions/stripe-case-valuation-webhook's
   findUserIdByEmail), so someone who pays without an account first
   would have their payment succeed in Stripe but silently fail to
   grant access on this site.
   ========================================================= */

(function () {
  "use strict";

  const PLANS = {
    practitioner: { url: "https://buy.stripe.com/8x214fcF8g9cbzx4SZ1B602", label: "Practitioner" },
    firm: { url: "https://buy.stripe.com/cNi6oz7kO5uy331adj1B603", label: "Firm" },
  };

  function wireSubscribeButton(id, plan) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const session = window.RELAW_AUTH && window.RELAW_AUTH.getSession();
      if (!session || !session.user) {
        if (window.RELAW_UTILS && window.RELAW_UTILS.showToast) {
          window.RELAW_UTILS.showToast(`Sign in first (free, no card required) so your ${plan.label} subscription can be linked to your account.`, { error: true });
        }
        if (window.RELAW_AUTH) window.RELAW_AUTH.openSignInModal();
        return;
      }
      window.open(plan.url, "_blank", "noopener");
    });
  }

  wireSubscribeButton("pricing-subscribe-practitioner", PLANS.practitioner);
  wireSubscribeButton("pricing-subscribe-firm", PLANS.firm);
})();
