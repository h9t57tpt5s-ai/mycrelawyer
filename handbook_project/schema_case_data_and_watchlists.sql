-- CREdocket — case_data + watchlists: schema & RLS documentation
--
-- Neither of these tables had a schema file anywhere in the repo despite
-- being live in production (case_data already holds 85+ real rows,
-- synced by .github/workflows/supabase-sync.yml; watchlists backs
-- account.html's Watchlists feature). This file documents/reproduces
-- both, and is safe to run even if they already exist -- every
-- statement is idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS +
-- CREATE POLICY), so running it against the live database won't alter
-- an already-existing table's real column structure, only add/replace
-- the named policies below.
--
-- Run in Supabase SQL Editor.

-- ---------- case_data ----------
-- Server-side mirror of js/data.js's `cases` array, kept in sync by the
-- GitHub Actions workflow whenever a new case is added (see .sync/*.json
-- and .github/workflows/supabase-sync.yml). This is what lets Watchlists
-- -- and, going forward, any other feature needing to query the tracker
-- data server-side -- work at all; the static JS bundle alone can't be
-- queried from a database.
create table if not exists public.case_data (
  id text primary key,
  title text not null,
  category text,
  status text,
  date date,
  jurisdiction text,
  state text,
  amount text,
  source text,
  source_url text,
  summary text,
  significance text,
  judge text,
  tags jsonb,
  synced_at timestamptz not null default now()
);

alter table public.case_data enable row level security;

-- Read: fully public. This mirrors data that already ships to every
-- visitor in the static js/data.js bundle -- nothing here is
-- confidential.
drop policy if exists "Anyone can read case data" on public.case_data;
create policy "Anyone can read case data"
  on public.case_data for select
  to anon, authenticated
  using (true);

-- Write: open to anon, matching how the sync workflow already operates
-- today (it calls the REST API directly with only the public anon key,
-- no service-role secret, since GitHub Actions has no user session to
-- authenticate with). Accepted tradeoff: the content is public read-only
-- reference data, so the worst case of this being misused is spam or
-- vandalism of a non-sensitive table, not a real data leak -- but it's
-- worth tightening later (e.g. routing the sync through an
-- AUTOMATION_SECRET-gated Edge Function instead of a direct REST write)
-- if this table ever needs to hold anything more sensitive than public
-- case summaries.
drop policy if exists "Automation can write case data" on public.case_data;
create policy "Automation can write case data"
  on public.case_data for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Automation can update case data" on public.case_data;
create policy "Automation can update case data"
  on public.case_data for update
  to anon, authenticated
  using (true)
  with check (true);

-- ---------- watchlists ----------
-- Backs account.html's Watchlists feature (js/watchlists.js). Each row
-- is one saved filter (states/categories/keyword) owned by exactly one
-- signed-in user. This table had NO schema file and, per tonight's RLS
-- audit, returned an empty (not error) result to an anonymous read --
-- consistent with either "already correctly RLS'd" or "no RLS at all,
-- just no rows yet since the feature has never really worked." The
-- policies below make it unambiguously the former.
create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  states text[],
  categories text[],
  keyword text,
  created_at timestamptz not null default now()
);

alter table public.watchlists enable row level security;

-- A user can only ever see, create, or delete their OWN watchlists --
-- never anyone else's. check-and-send-watchlist-alerts reads across ALL
-- watchlists using the service-role key, which bypasses RLS entirely,
-- so this restriction doesn't block that job.
drop policy if exists "Users can read their own watchlists" on public.watchlists;
create policy "Users can read their own watchlists"
  on public.watchlists for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can create their own watchlists" on public.watchlists;
create policy "Users can create their own watchlists"
  on public.watchlists for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own watchlists" on public.watchlists;
create policy "Users can delete their own watchlists"
  on public.watchlists for delete
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
