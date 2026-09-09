-- CREdocket — Make the Commercial Eviction Handbook fully free
-- Run in Supabase SQL Editor. Replaces the purchase-gated RLS policy
-- on eviction_guide_chapters (schema.sql) with an open one so anyone
-- — signed in or not — can read every state's chapter, matching the
-- free model already used by the Premises Liability & Negligence
-- Guide. handbook_purchases itself is left untouched (harmless if
-- unused) in case the paywall is ever restored.

drop policy if exists "Purchasers can read gated chapters" on public.eviction_guide_chapters;

create policy "Anyone can read eviction guide chapters"
  on public.eviction_guide_chapters for select
  to anon, authenticated
  using (true);

notify pgrst, 'reload schema';

-- To restore the paywall later, run:
--   drop policy if exists "Anyone can read eviction guide chapters" on public.eviction_guide_chapters;
--   (then re-run the original "Purchasers can read gated chapters" policy from schema.sql)
-- and revert js/eviction-guide.js + eviction-guide.html to the commit
-- before this file was added.
