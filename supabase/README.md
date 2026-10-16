# DropVault — Supabase schema

`schema.sql` sets up everything DropVault needs on the existing Supabase project
(`pzdisieeauzwgtjyicit`, ap-south-1 Mumbai — shared with Orbyt, so it costs ₹0 extra).

## What it creates

- **`public.filedrop_spaces`** — one row per password-protected space.
  `slug` is the space's URL (`dropvault.app/<slug>`); slugs are lowercase
  letters, digits and dashes, 3–48 chars. Deleting a space cascades to its files.
- **`public.filedrop_files`** — metadata for each uploaded file (name, size,
  mime type, storage path). The actual bytes live in storage.
- **Index** `filedrop_files_space_id_idx` for fast per-space listing.
- **Storage bucket `filedrop`** (public) — files are stored under
  `<space_uuid>/<file_uuid>_<safe_name>`, i.e. paths contain two UUIDs and
  cannot be guessed.
- **RLS policies** (all prefixed `dv_`): anon may SELECT/INSERT spaces,
  SELECT/INSERT/DELETE files, and the same on the bucket's storage objects.
  No UPDATE policy exists anywhere — rows are immutable once written.

## Password model

- When a space is created, the browser generates a random salt and stores
  `sha256(salt || password)` (hex) in `password_hash`. **The server never sees
  the password** — same philosophy as ProtectedText.
- To unlock a space, the browser fetches the space row (salt + hash), hashes
  the entered password with the salt, and compares locally. Only on a match
  does the app query that space's files.

## Threat model (honest version)

- The anon key can read every space's `salt` + `password_hash`. That means an
  attacker with the anon key can run **offline brute-force / dictionary attacks**
  against weak passwords. **Use a strong, unique password per space.**
- File URLs in the public bucket are unguessable (UUID paths), but anyone who
  obtains a full URL can download the file — don't forward file URLs to people
  who shouldn't have the space password.
- This is a casual-sharing tool in the spirit of ProtectedText, not a hardened
  vault. For genuinely sensitive material, encrypt files client-side before
  upload (future work, not implemented).

## Running it

Paste `schema.sql` into the Supabase dashboard SQL editor and run. It is
idempotent — safe to run twice (re-runs drop and recreate the `dv_*` policies).
