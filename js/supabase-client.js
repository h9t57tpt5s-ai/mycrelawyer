/* =========================================================
   CREdocket — Supabase client init
   The publishable/anon key below is safe to ship in client-side
   code by design (Supabase governs access via Row Level Security,
   not by keeping this key secret). Never put the service_role /
   secret key here or anywhere else in this static site.
   ========================================================= */

window.RELAW_SUPABASE = (function () {
  if (typeof supabase === "undefined") return null;
  const SUPABASE_URL = "https://ribmcdyoydhmafnyfhpp.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_77xSJub0DOpnTSM4nzhVaQ_aztB5p3f";
  return supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
})();
