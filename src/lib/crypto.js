/**
 * Client-side password crypto.
 * The server NEVER sees the password — only a salted SHA-256 hash is stored,
 * same philosophy as ProtectedText.
 */

/** 32 random hex chars from a CSPRNG. */
export function randomSalt() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** password_hash = hex( SHA-256( salt + password ) ) */
export function hashPassword(password, salt) {
  return sha256Hex(salt + password);
}

/** Recompute and compare in (roughly) constant time. */
export async function verifyPassword(password, salt, expectedHash) {
  if (typeof expectedHash !== 'string' || expectedHash.length === 0) return false;
  const actual = await hashPassword(password, salt);
  if (actual.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) {
    diff |= actual.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}
