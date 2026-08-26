-- CREdocket — Litigation Tools click-through terms: server-side acceptance log
--
-- Signed-in users get a real evidentiary record here (who, which
-- version, when) beyond the client-side localStorage flag that
-- js/terms-gate.js also sets -- a client-side flag alone proves
-- nothing if acceptance is ever disputed. Anonymous visitors are only
-- covered by the localStorage flag, since there's no reliable way to
-- attribute an anonymous acceptance to anyone.
--
-- Run this in the Supabase SQL Editor.

create table if not exists public.terms_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  tool text not null,
  accepted_at timestamptz not null default now()
);

alter table public.terms_acceptances enable row level security;

-- Insert-only from the client, and only for yourself -- no update/delete
-- policy at all, so an accepted record can't be altered or removed
-- through the client once written.
drop policy if exists "Users can log their own terms acceptance" on public.terms_acceptances;
create policy "Users can log their own terms acceptance"
  on public.terms_acceptances for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own terms acceptance" on public.terms_acceptances;
create policy "Users can view their own terms acceptance"
  on public.terms_acceptances for select
  to authenticated
  using (auth.uid() = user_id);

notify pgrst, 'reload schema';
