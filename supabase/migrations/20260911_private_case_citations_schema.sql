-- CREdocket: private, RLS-locked table holding the case-citation research
-- bench (real settlement/verdict outcomes with dollar amounts and sources)
-- that grounds the Case Value Calculator and Settlement Benchmarks search.
--
-- Schema only. This repository is PUBLIC on GitHub -- the actual citation
-- data (403 real, individually-researched cases) is deliberately NOT
-- committed here. That data was seeded via a one-time INSERT run directly
-- in the Supabase SQL Editor and delivered to Jeff privately, outside git,
-- for exactly the same reason this whole migration exists: committing it
-- to a public repo would just move the leak from the website to GitHub.
--
-- To re-seed or update this table going forward: generate a fresh
-- `insert into private_case_citations (id, citations, updated_at) values
-- ('main', $$...$$::jsonb, now()) on conflict (id) do update set
-- citations = excluded.citations, updated_at = now();` locally (see
-- js/case-valuation-data.js's history prior to 2026-09-11 for the last
-- public copy of this data's shape, or query this table directly with
-- the service-role key), and run it in the SQL Editor -- never as a git
-- commit.

create table if not exists private_case_citations (
  id text primary key default 'main',
  citations jsonb not null,
  updated_at timestamptz not null default now()
);

-- RLS enabled with NO policies defined = default-deny for every role
-- except the service role, which bypasses RLS entirely. This is what
-- actually makes the table private -- do not add a permissive policy
-- here without knowing exactly what you're exposing again.
alter table private_case_citations enable row level security;
