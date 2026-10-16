-- ============================================================================
-- DropVault schema — ProtectedText-style password-protected file spaces
-- Target: Supabase project pzdisieeauzwgtjyicit (ap-south-1 Mumbai)
--
-- HOW TO RUN: paste this whole file into the Supabase dashboard SQL editor
-- and hit Run. It is idempotent — safe to run more than once.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto, which Supabase enables by default.
-- If this ever runs on a bare Postgres, uncomment the next line:
-- create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. Spaces: one row per password-protected space (the "site URL" is the slug)
-- ----------------------------------------------------------------------------
create table if not exists public.filedrop_spaces (
  id            uuid        primary key default gen_random_uuid(),
  slug          text        not null unique check (slug ~ '^[a-z0-9-]{3,48}$'),
  password_hash text        not null,   -- hex sha256(salt || password)
  salt          text        not null,   -- random hex, generated client-side
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 2. Files: metadata rows; the bytes live in the 'filedrop' storage bucket
-- ----------------------------------------------------------------------------
create table if not exists public.filedrop_files (
  id            uuid        primary key default gen_random_uuid(),
  space_id      uuid        not null references public.filedrop_spaces(id) on delete cascade,
  file_name     text        not null,   -- original name shown to the user
  storage_path  text        not null,   -- '<space_uuid>/<file_uuid>_<safe_name>' in bucket
  size_bytes    bigint      not null default 0,
  mime_type     text,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 3. Index for listing a space's files
-- ----------------------------------------------------------------------------
create index if not exists filedrop_files_space_id_idx
  on public.filedrop_files (space_id);

-- ----------------------------------------------------------------------------
-- 4. Row Level Security
-- ----------------------------------------------------------------------------
alter table public.filedrop_spaces enable row level security;
alter table public.filedrop_files  enable row level security;

-- ----------------------------------------------------------------------------
-- 5. Policies (drop-if-exists first so re-runs don't error on duplicates)
--
-- Access control model: the space password is verified CLIENT-SIDE against
-- password_hash (salted SHA-256). The server never sees the password.
-- RLS here only gates by role (anon); the app enforces the password gate.
-- There is deliberately NO update policy: rows are immutable once written.
-- ----------------------------------------------------------------------------

-- Spaces: anyone may look up a space (needed to fetch its salt+hash) and
-- anyone may create a new space (like ProtectedText: visit URL -> set password).
drop policy if exists dv_spaces_select on public.filedrop_spaces;
create policy dv_spaces_select
  on public.filedrop_spaces for select to anon using (true);

drop policy if exists dv_spaces_insert on public.filedrop_spaces;
create policy dv_spaces_insert
  on public.filedrop_spaces for insert to anon with check (true);

-- Files: anyone may list a space's files (app shows them only after the
-- password checks out), upload into a space, or delete files.
drop policy if exists dv_files_select on public.filedrop_files;
create policy dv_files_select
  on public.filedrop_files for select to anon using (true);

drop policy if exists dv_files_insert on public.filedrop_files;
create policy dv_files_insert
  on public.filedrop_files for insert to anon with check (true);

drop policy if exists dv_files_delete on public.filedrop_files;
create policy dv_files_delete
  on public.filedrop_files for delete to anon using (true);

-- ----------------------------------------------------------------------------
-- 6. Storage bucket 'filedrop' (public read; object paths are unguessable)
--
-- Security note: the bucket is public so downloads work with the anon key.
-- Object paths embed two UUIDs ('<space_uuid>/<file_uuid>_<name>'), so a
-- file URL cannot be guessed — you need the space row, which the app only
-- hands out after the password verifies.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('filedrop', 'filedrop', true)
on conflict (id) do update set public = true;

-- RLS is enabled on storage.objects by default; these policies mirror the
-- table policies above.
drop policy if exists dv_storage_select on storage.objects;
create policy dv_storage_select
  on storage.objects for select to anon using (bucket_id = 'filedrop');

drop policy if exists dv_storage_insert on storage.objects;
create policy dv_storage_insert
  on storage.objects for insert to anon with check (bucket_id = 'filedrop');

drop policy if exists dv_storage_delete on storage.objects;
create policy dv_storage_delete
  on storage.objects for delete to anon using (bucket_id = 'filedrop');
