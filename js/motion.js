/* =========================================================
   MyCRELawyer — Motion layer
   Hero cursor-parallax, scroll parallax, card spotlight,
   magnetic buttons. Skipped entirely under prefers-reduced-motion.
   ========================================================= */

(function () {
  "use strict";

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduceMotion) return;

  /* ---------- Hero cursor parallax ---------- */
  const hero = document.querySelector(".hero");
  if (hero) {
    const layers = hero.querySelectorAll(".parallax-layer");
    let targetX = 0, targetY = 0, curX = 0, curY = 0;
    let rafId = null;

    function tick() {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      layers.forEach((layer) => {
        const depth = parseFloat(layer.getAttribute("data-depth")) || 8;
        const dx = curX * depth;
        const dy = curY * depth * 0.6;
        layer.setAttribute("transform", `translate(${dx.toFixed(2)}, ${dy.toFixed(2)})`);
      });
      if (Math.abs(targetX - curX) > 0.01 || Math.abs(targetY - curY) > 0.01) {
        rafId = requestAnimationFrame(tick);
      } else {
        rafId = null;
      }
    }

    function startLoop() {
      if (!rafId) rafId = requestAnimationFrame(tick);
    }

    hero.addEventListener("mousemove", (e) => {
      const rect = hero.getBoundingClientRect();
      targetX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      targetY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      startLoop();
    });
    hero.addEventListener("mouseleave", () => {
      targetX = 0;
      targetY = 0;
      startLoop();
    });

    /* ---------- Hero scroll parallax ---------- */
    const heroContainer = hero.querySelector(":scope > .container");
    if (heroContainer) {
      let scrollRaf = null;
      function onScroll() {
        const progress = Math.min(window.scrollY / (hero.offsetHeight || 800), 1);
        heroContainer.style.transform = `translateY(${progress * 46}px)`;
        heroContainer.style.opacity = String(1 - progress * 0.55);
        scrollRaf = null;
      }
      window.addEventListener(
        "scroll",
        () => {
          if (!scrollRaf) scrollRaf = requestAnimationFrame(onScroll);
        },
        { passive: true }
      );
    }
  }

  /* ---------- Card spotlight (cursor-follow glow) ---------- */
  document.addEventListener("mousemove", (e) => {
    const card = e.target.closest(".card");
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    card.style.setProperty("--mx", mx + "%");
    card.style.setProperty("--my", my + "%");
  });

  /* ---------- Magnetic buttons ---------- */
  document.querySelectorAll(".btn-primary").forEach((btn) => {
    let raf = null;
    btn.addEventListener("mousemove", (e) => {
      const rect = btn.getBoundingClientRect();
      const mx = (e.clientX - rect.left - rect.width / 2) * 0.25;
      const my = (e.clientY - rect.top - rect.height / 2) * 0.35 - 2;
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        btn.style.transform = `translate(${mx.toFixed(1)}px, ${my.toFixed(1)}px)`;
      });
    });
    btn.addEventListener("mouseleave", () => {
      if (raf) cancelAnimationFrame(raf);
      btn.style.transform = "";
    });
  });
})();
