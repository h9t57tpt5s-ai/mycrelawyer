-- CREdocket: let readers follow federal lawsuits too (Federal Lawsuit
-- Watch pages at /federal-cases/<slug>.html, 2026-10-07). Widens the
-- page_path check from 20261008_docket_follows.sql; nothing else changes.
alter table public.docket_follows drop constraint if exists docket_follows_page_path_check;
alter table public.docket_follows add constraint docket_follows_page_path_check
  check (page_path ~ '^/(matters|chapter-11|federal-cases)/[A-Za-z0-9._-]+\.html$');
