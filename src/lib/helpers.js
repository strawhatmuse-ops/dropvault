/** Normalize free text into a valid-ish slug: lowercase, [a-z0-9-], max 48 chars. */
export function normalizeSlug(input) {
  return (input || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function isValidSlug(slug) {
  return /^[a-z0-9-]{3,48}$/.test(slug || '');
}

export function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

export function formatDate(iso) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

/** Make a filename safe for a storage object key segment. */
export function sanitizeFilename(name) {
  const base = String(name || 'file').split(/[\\/]/).pop();
  const safe = base
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 120);
  return safe || 'file';
}

export function randomId() {
  return crypto.randomUUID();
}

export function unlockFlagKey(slug) {
  return `dv_unlocked_${slug}`;
}
