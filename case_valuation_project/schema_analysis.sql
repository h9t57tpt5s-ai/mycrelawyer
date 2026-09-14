-- CREdocket — Litigation Value Estimator: document-analysis usage log
-- Backs the per-user rate limit checked by the analysis Edge Function
-- before every Claude API call. Run this alongside schema_purchases.sql
-- (already sent) — this is additive, not a replacement.

create table if not exists public.case_valuation_analyses (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text,
  created_at timestamptz not null default now()
);

alter table public.case_valuation_analyses enable row level security;

-- Users can see their own usage (e.g. to show "X of 20 used this month"
-- in the UI); nothing is client-writable — only the Edge Function
-- (service role, bypasses RLS) inserts rows, after it has already
-- verified payment and is about to call Claude.
create policy "Users can view their own analysis history"
  on public.case_valuation_analyses for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists case_valuation_analyses_user_created_idx
  on public.case_valuation_analyses (user_id, created_at);

notify pgrst, 'reload schema';
