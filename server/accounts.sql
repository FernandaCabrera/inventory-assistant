-- MiKardex accounts. Run this once in Supabase: SQL Editor > New query > paste > Run.
-- It can be run again safely: it only creates what is missing.
--
-- What is kept: the email of each account, the state of its plan, and the summary of each
-- analysis (date, file name and key figures). The products of an inventory are never stored.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  lang text,
  marketing_ok boolean not null default false,  -- ticked "send me tips and news"
  uploads_used integer not null default 0,      -- files analyzed, for the free limit
  plan_code text                                -- PayPal subscription id (I-...) or an access code
);

-- The 6-digit code emailed to sign in. One per email, replaced by the next one.
create table if not exists login_codes (
  email text primary key,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sent_at timestamptz not null default now()
);

-- A browser that is signed in. Only a hash of its key is kept.
create table if not exists sessions (
  token_hash text primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- One row per file analyzed: the figures, not the products.
create table if not exists analyses (
  id bigint generated always as identity primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  file_name text,
  figures jsonb not null
);
create index if not exists analyses_account_date on analyses (account_id, created_at desc);
create index if not exists sessions_account on sessions (account_id);

-- Nobody reads these tables from a browser: only the server does, with the secret key.
-- Row level security with no policies closes them to every other key.
alter table accounts enable row level security;
alter table login_codes enable row level security;
alter table sessions enable row level security;
alter table analyses enable row level security;

-- The server's key works as the role "service_role". Projects created since 30 May 2026 give it
-- nothing on new tables until it is granted here (older projects already do; this changes nothing
-- for them). The keys a browser could use get nothing at all.
grant select, insert, update, delete on accounts, login_codes, sessions, analyses to service_role;
revoke all on accounts, login_codes, sessions, analyses from anon, authenticated;
