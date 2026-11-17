-- One row per account that has been sent the welcome email
-- (supabase/functions/newsletter/welcome.ts). Written only by the
-- newsletter Edge Function with the service role; no public access.
create table if not exists public.welcome_sends (
  user_id uuid primary key references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now()
);
alter table public.welcome_sends enable row level security;
