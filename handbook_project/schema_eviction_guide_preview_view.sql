-- CREdocket — Public preview blurbs for the Commercial Eviction Handbook
--
-- Right now clicking any state (other than one you've already unlocked
-- by signing in) shows zero content before the sign-in wall -- just the
-- state name and classification badge. Every chapter already has a
-- one-sentence `blurb` in eviction_guide_chapters that's exactly the
-- right teaser (informative, not the substantive legal text), but that
-- column sits behind the same authenticated-only RLS policy as the real
-- chapter `sections`.
--
-- This adds a narrow public VIEW exposing ONLY slug + blurb (never
-- sections) to anon + authenticated, so a visitor can read a genuine,
-- real, per-state teaser before being asked to sign in -- without
-- weakening the RLS policy on the underlying table at all.
--
-- Run in Supabase SQL Editor.

create or replace view public.eviction_guide_chapter_previews as
  select slug, blurb from public.eviction_guide_chapters;

grant select on public.eviction_guide_chapter_previews to anon, authenticated;

notify pgrst, 'reload schema';
