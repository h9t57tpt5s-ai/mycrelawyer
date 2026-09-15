-- CREdocket — Client-side data-load failure log
--
-- Every page's guard script (right after <script src="js/data.js">)
-- checks whether RELAW_DATA came through intact -- either completely
-- undefined, or defined but with an implausibly small cases array
-- (a truncated/partial transfer of that 900KB+ file can still parse as
-- valid JS if the cut lands on a clean boundary). Whenever it detects
-- either state, it now logs one row here (fire-and-forget, before
-- triggering its own automatic reload) so occurrences are visible here
-- instead of only when a visitor happens to notice and report it.
--
-- Public insert-only: no SELECT/UPDATE/DELETE for the anon/publishable
-- key -- a visitor's browser can add a row about its own failure, but
-- can never read, alter, or delete anyone else's. Jeff (or Claude, via
-- a query Jeff runs and pastes back) reads this from the Supabase
-- dashboard/SQL editor using the project's own admin access.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.

create table if not exists public.client_data_load_failures (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text not null,               -- e.g. "/litigation.html"
  reason text not null,             -- 'undefined' | 'too_few_cases'
  cases_found integer,              -- null if reason = 'undefined'
  attempt integer not null,         -- 0 = first load, 1-2 = retry attempts
  user_agent text
);

alter table public.client_data_load_failures enable row level security;

drop policy if exists "Anyone can log a load failure" on public.client_data_load_failures;
create policy "Anyone can log a load failure"
  on public.client_data_load_failures for insert
  to anon
  with check (true);

-- Handy query for checking in on this later:
--   select created_at, path, reason, cases_found, attempt, user_agent
--   from client_data_load_failures
--   order by created_at desc
--   limit 50;
