-- CREdocket: record of watchlist and portfolio alerts already sent, so the
-- same alert is never emailed twice.
--
-- check-and-send-watchlist-alerts is called for every matter the sync job
-- processes, including re-syncs (a rerun, or the digest routine updating a
-- matter's status). Before 2026-10-01 it kept no record, so every re-sync
-- emailed every match again as if it were new. With this table it skips an
-- alert already sent for the same matter at the same status, and sends a
-- clearly labeled update when the matter's status has changed.
--
-- Rows with emailed = false are the baseline: matches that existed when
-- de-duplication went live, recorded without sending anything so old
-- matters are not re-alerted.
--
-- Written only by the Edge Function (service role). RLS is on with no
-- policies, so no browser client can read or write it.

create table if not exists public.alert_sends (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('watchlist', 'portfolio')),
  target_id text not null,          -- watchlists.id or portfolio_entities.id
  case_id text not null,            -- case_data.id, e.g. live-208
  case_status text not null default '',
  emailed boolean not null default true,
  sent_at timestamptz not null default now(),
  unique (kind, target_id, case_id, case_status)
);

create index if not exists alert_sends_case_idx on public.alert_sends (case_id);

alter table public.alert_sends enable row level security;
