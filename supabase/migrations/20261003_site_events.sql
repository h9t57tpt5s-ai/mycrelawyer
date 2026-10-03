-- CREdocket: anonymous engagement events (js/track.js), for the funnel
-- Vercel's page counts cannot show: matter opened -> sign-in prompt ->
-- signed in -> full write-up read -> watchlist or share.
--
-- Privacy: no cookies, no IP address, no user id, no names, no search
-- text. `session` is a random id kept in the tab's sessionStorage (gone
-- when the tab closes); `referrer` is the referring domain only.
--
-- Browsers may only INSERT, and only rows of the listed event types with
-- short fields. Nobody can read the table from a browser; the site-metrics
-- Edge Function (service role) aggregates it for the weekly email.

create table if not exists public.site_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event text not null check (event in (
    'page_view', 'matter_page_view', 'panel_open', 'gate_shown', 'signin_open',
    'signup', 'signin', 'magic_link_sent', 'full_read', 'watchlist_cta',
    'share', 'source_click', 'search', 'permalink'
  )),
  page text check (char_length(page) <= 200),
  case_id text check (char_length(case_id) <= 40),
  detail text check (char_length(detail) <= 60),
  referrer text check (char_length(referrer) <= 100),
  session text check (char_length(session) <= 40),
  signed_in boolean
);

create index if not exists site_events_created_idx on public.site_events (created_at);

alter table public.site_events enable row level security;

drop policy if exists "Browsers can log engagement events" on public.site_events;
create policy "Browsers can log engagement events"
  on public.site_events for insert
  to anon, authenticated
  with check (true);
