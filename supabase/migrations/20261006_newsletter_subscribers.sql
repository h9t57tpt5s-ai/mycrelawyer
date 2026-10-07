-- CREdocket: weekly "New on CREdocket" newsletter subscribers.
--
-- Replaces the beehiiv signup box, whose subscribers never received
-- anything (beehiiv only sends issues someone writes by hand). The
-- newsletter Edge Function is the only reader and writer: sign-up with a
-- confirmation email (double opt-in), one-click unsubscribe, and the weekly
-- send. Account holders are not stored here; they get the existing
-- weekly-digest (pg_cron, Mondays 12:00 UTC) and are skipped by the
-- newsletter send so nobody gets both.
--
-- RLS on with no policies: no browser can read or write this table.

create table if not exists public.newsletter_subscribers (
  id bigint generated always as identity primary key,
  email text not null unique check (email = lower(email) and char_length(email) <= 254),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'unsubscribed')),
  token uuid not null unique default gen_random_uuid(),
  source text check (char_length(source) <= 60),
  created_at timestamptz not null default now(),
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  unsubscribed_at timestamptz,
  last_sent_at timestamptz
);

alter table public.newsletter_subscribers enable row level security;
