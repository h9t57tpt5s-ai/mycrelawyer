-- CREdocket — Commercial Eviction Handbook: schema
-- Run this FIRST, before seed_chapters.sql.

-- Tracks who has purchased the full handbook. Rows are only ever
-- written by you (via SQL Editor / Table Editor, which runs with
-- admin privileges and bypasses RLS) after confirming a Stripe
-- payment — never writable by the anon/authenticated client roles.
create table if not exists public.handbook_purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  product text not null default 'eviction-guide-2026',
  purchased_at timestamptz not null default now(),
  unique (user_id, product)
);

alter table public.handbook_purchases enable row level security;

create policy "Users can check their own purchase"
  on public.handbook_purchases for select
  to authenticated
  using (auth.uid() = user_id);

-- The 50 gated state chapters (everything except Texas, which stays
-- free/public in js/eviction-guide-data.js). Only a signed-in user
-- with a matching handbook_purchases row can read any row here.
create table if not exists public.eviction_guide_chapters (
  id bigint generated always as identity primary key,
  state text not null unique,
  slug text not null unique,
  chapter int not null,
  classification text not null,
  self_help_available text,
  possession_damages_combined text,
  blurb text,
  sections jsonb not null
);

alter table public.eviction_guide_chapters enable row level security;

create policy "Purchasers can read gated chapters"
  on public.eviction_guide_chapters for select
  to authenticated
  using (
    exists (
      select 1 from public.handbook_purchases hp
      where hp.user_id = auth.uid()
        and hp.product = 'eviction-guide-2026'
    )
  );

notify pgrst, 'reload schema';
