-- CREdocket: "Email me when the court rules in this case" (2026-10-07).
--
-- A signed-in reader follows one federal docket (a tracker matter's
-- CourtListener docket, or a Chapter 11 petition page). The daily docket
-- job (scripts/track_dockets.py) sends each new ruling or closing it finds
-- to the docket-follows Edge Function, which emails every follower once per
-- event (docket_follow_sends) and only for events dated on or after the
-- follow. Every email carries a one-click unfollow link (token).
--
-- Readers manage their own follows from the browser (RLS below); the send
-- log is server-only.

create table if not exists public.docket_follows (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  docket_id bigint not null check (docket_id > 0),
  label text not null check (char_length(label) between 1 and 200),
  page_path text not null check (page_path ~ '^/(matters|chapter-11)/[A-Za-z0-9._-]+\.html$'),
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  unique (user_id, docket_id)
);
create index if not exists docket_follows_docket on public.docket_follows (docket_id);

alter table public.docket_follows enable row level security;
drop policy if exists "read own follows" on public.docket_follows;
create policy "read own follows" on public.docket_follows for select using (auth.uid() = user_id);
drop policy if exists "add own follows" on public.docket_follows;
create policy "add own follows" on public.docket_follows for insert with check (auth.uid() = user_id);
drop policy if exists "remove own follows" on public.docket_follows;
create policy "remove own follows" on public.docket_follows for delete using (auth.uid() = user_id);

-- At most 200 followed cases per reader.
create or replace function public.docket_follows_cap() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.docket_follows where user_id = new.user_id) >= 200 then
    raise exception 'You can follow up to 200 cases. Unfollow one on your account page first.';
  end if;
  return new;
end $$;
drop trigger if exists docket_follows_cap on public.docket_follows;
create trigger docket_follows_cap before insert on public.docket_follows for each row execute function public.docket_follows_cap();

create table if not exists public.docket_follow_sends (
  follow_id bigint not null references public.docket_follows (id) on delete cascade,
  event_key text not null check (char_length(event_key) <= 400),
  sent_at timestamptz not null default now(),
  emailed boolean,
  primary key (follow_id, event_key)
);
alter table public.docket_follow_sends enable row level security;

-- Engagement count for the new button (js/track.js).
alter table public.site_events drop constraint if exists site_events_event_check;
alter table public.site_events add constraint site_events_event_check check (event in (
  'page_view', 'matter_page_view', 'panel_open', 'gate_shown', 'signin_open',
  'signup', 'signin', 'magic_link_sent', 'full_read', 'watchlist_cta',
  'share', 'source_click', 'search', 'permalink',
  'contact_submit', 'contact_email_click', 'docket_follow'
));
