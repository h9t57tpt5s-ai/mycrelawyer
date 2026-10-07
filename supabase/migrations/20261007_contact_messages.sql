-- CREdocket: messages sent through the contact form (contact.html).
--
-- The contact Edge Function saves each message here, then emails it to
-- admin@credocket.com with reply-to set to the sender. Keeping a copy means
-- a message is not lost if the email fails (emailed = false), and the
-- function counts recent rows per ip_hash to allow at most five messages an
-- hour from one connection. ip_hash is a salted SHA-256 prefix, never the
-- raw address.
--
-- RLS on with no policies: no browser can read or write this table.

create table if not exists public.contact_messages (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) <= 120),
  email text not null check (char_length(email) <= 254),
  org text check (char_length(org) <= 160),
  role text check (char_length(role) <= 60),
  message text not null check (char_length(message) <= 5000),
  matter text check (char_length(matter) <= 200),
  jurisdiction text check (char_length(jurisdiction) <= 160),
  page text check (char_length(page) <= 200),
  ip_hash text,
  emailed boolean
);

create index if not exists contact_messages_ip_recent on public.contact_messages (ip_hash, created_at desc);

alter table public.contact_messages enable row level security;
