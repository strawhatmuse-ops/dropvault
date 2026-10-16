import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { hashPassword, randomSalt, verifyPassword } from '../lib/crypto.js';
import {
  formatDate,
  humanSize,
  isValidSlug,
  randomId,
  sanitizeFilename,
  unlockFlagKey,
} from '../lib/helpers.js';
import UploadZone, { UploadItem } from '../components/UploadZone.jsx';

const BUCKET = 'filedrop';
let uploadSeq = 0;

export default function Space() {
  const { slug } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | invalid | claim | unlock | open | error
  const [fatal, setFatal] = useState('');
  const [space, setSpace] = useState(null);
  const [files, setFiles] = useState([]);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const [uploads, setUploads] = useState([]);
  const [copied, setCopied] = useState(false);
  const slugRef = useRef(slug);
  slugRef.current = slug;

  const loadFiles = useCallback(async (spaceId) => {
    const { data, error } = await supabase
      .from('filedrop_files')
      .select('id, file_name, storage_path, size_bytes, mime_type, created_at')
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false });
    if (error) {
      setFatal(`Could not load files: ${error.message}`);
      return;
    }
    setFiles(data || []);
  }, []);

  // Fetch the space on slug change.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setPhase('loading');
      setFatal('');
      setSpace(null);
      setFiles([]);
      setUploads([]);
      setPassword('');
      setConfirm('');
      setFormError('');

      if (!isValidSlug(slug)) {
        setPhase('invalid');
        return;
      }
      const { data, error } = await supabase
        .from('filedrop_spaces')
        .select('id, slug, password_hash, salt, created_at')
        .eq('slug', slug)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setFatal(`Could not reach the database: ${error.message}`);
        setPhase('error');
        return;
      }
      if (!data) {
        setPhase('claim');
        return;
      }
      setSpace(data);
      if (sessionStorage.getItem(unlockFlagKey(slug)) === '1') {
        await loadFiles(data.id);
        if (!cancelled) setPhase('open');
      } else {
        setPhase('unlock');
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [slug, loadFiles]);

  async function handleClaim(e) {
    e.preventDefault();
    setFormError('');
    if (password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      setFormError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const salt = randomSalt();
      const password_hash = await hashPassword(password, salt);
      const { data, error } = await supabase
        .from('filedrop_spaces')
        .insert({ slug, salt, password_hash })
        .select('id, slug, password_hash, salt, created_at')
        .single();
      if (error) {
        // Someone claimed it in the meantime — fall back to unlock.
        if (error.code === '23505') {
          const { data: existing } = await supabase
            .from('filedrop_spaces')
            .select('id, slug, password_hash, salt, created_at')
            .eq('slug', slug)
            .single();
          if (existing) {
            setSpace(existing);
            setPhase('unlock');
            setFormError('Someone just claimed this space — enter its password to unlock it.');
            return;
          }
        }
        setFormError(`Could not create the space: ${error.message}`);
        return;
      }
      setSpace(data);
      sessionStorage.setItem(unlockFlagKey(slug), '1');
      await loadFiles(data.id);
      setPhase('open');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlock(e) {
    e.preventDefault();
    setFormError('');
    if (!password) {
      setFormError('Enter the space password.');
      return;
    }
    setBusy(true);
    try {
      const ok = await verifyPassword(password, space.salt, space.password_hash);
      if (!ok) {
        setFormError('Wrong password. Try again.');
        setPassword('');
        return;
      }
      sessionStorage.setItem(unlockFlagKey(slug), '1');
      await loadFiles(space.id);
      setPhase('open');
    } finally {
      setBusy(false);
    }
  }

  function lockSpace() {
    sessionStorage.removeItem(unlockFlagKey(slug));
    setPhase('unlock');
    setPassword('');
    setFormError('');
  }

  async function handleFilesPicked(fileList) {
    const picked = Array.from(fileList || []);
    if (!picked.length || !space) return;
    const items = picked.map((f) => ({
      id: `u${++uploadSeq}`,
      name: f.name,
      size: f.size,
      status: 'queued',
      error: null,
    }));
    setUploads((prev) => [...items, ...prev]);

    let anyDone = false;
    for (let i = 0; i < picked.length; i++) {
      const file = picked[i];
      const item = items[i];
      setUploads((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'uploading' } : u)));
      try {
        const path = `${space.id}/${randomId()}_${sanitizeFilename(file.name)}`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file);
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from('filedrop_files').insert({
          space_id: space.id,
          file_name: file.name,
          storage_path: path,
          size_bytes: file.size,
          mime_type: file.type || null,
        });
        if (insErr) {
          // Metadata write failed — don't orphan bytes.
          await supabase.storage.from(BUCKET).remove([path]);
          throw insErr;
        }
        anyDone = true;
        setUploads((prev) => prev.map((u) => (u.id === item.id ? { ...u, status: 'done' } : u)));
      } catch (err) {
        setUploads((prev) =>
          prev.map((u) => (u.id === item.id ? { ...u, status: 'error', error: err.message } : u)),
        );
      }
    }
    if (anyDone) loadFiles(space.id);
  }

  async function handleDelete(f) {
    if (!window.confirm(`Delete "${f.file_name}"? This cannot be undone.`)) return;
    const { error: storErr } = await supabase.storage.from(BUCKET).remove([f.storage_path]);
    if (storErr) {
      alert(`Could not delete the file bytes: ${storErr.message}`);
      return;
    }
    const { error: rowErr } = await supabase.from('filedrop_files').delete().eq('id', f.id);
    if (rowErr) {
      alert(`File bytes deleted but the listing entry could not be removed: ${rowErr.message}`);
    }
    loadFiles(space.id);
  }

  function downloadUrl(path) {
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  async function copyLink() {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const totalBytes = files.reduce((n, f) => n + (Number(f.size_bytes) || 0), 0);

  return (
    <div className="page">
      <header className="brandbar">
        <Link className="brand" to="/">
          DropVault
        </Link>
        <span className="crumb">/ {slug}</span>
      </header>

      <main className="narrow">
        {phase === 'loading' && <p className="muted center">Opening space…</p>}

        {phase === 'invalid' && (
          <div className="card center">
            <h2>That name won't work</h2>
            <p className="muted">
              Space names need 3–48 characters: lowercase letters, numbers and dashes.
            </p>
            <Link className="btn primary" to="/">
              Pick another name
            </Link>
          </div>
        )}

        {phase === 'error' && (
          <div className="card center">
            <h2>Something went wrong</h2>
            <p className="error">{fatal}</p>
            <Link className="btn" to="/">
              Back home
            </Link>
          </div>
        )}

        {phase === 'claim' && (
          <div className="card">
            <h2>This space is empty — claim it</h2>
            <p className="muted">
              <strong className="slugname">{slug}</strong> doesn't exist yet. Set a password to
              create it. Anyone with the link + password can see what's inside.
            </p>
            <form onSubmit={handleClaim} className="stack">
              <input
                className="textinput"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Set a password (min 6 characters)"
                autoComplete="new-password"
              />
              <input
                className="textinput"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Confirm password"
                autoComplete="new-password"
              />
              {formError && <p className="error">{formError}</p>}
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? 'Creating…' : 'Create space'}
              </button>
            </form>
          </div>
        )}

        {phase === 'unlock' && space && (
          <div className="card">
            <h2>
              Space <span className="slugname">{slug}</span> is locked
            </h2>
            <p className="muted">Enter the password to see the files inside.</p>
            <form onSubmit={handleUnlock} className="stack">
              <input
                className="textinput"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Space password"
                autoComplete="current-password"
                autoFocus
              />
              {formError && <p className="error">{formError}</p>}
              <button className="btn primary" type="submit" disabled={busy}>
                {busy ? 'Unlocking…' : 'Unlock'}
              </button>
            </form>
          </div>
        )}

        {phase === 'open' && space && (
          <>
            <div className="spacehead">
              <div>
                <h2 className="spacetitle">
                  <span className="slugname">{slug}</span>
                </h2>
                <p className="muted small">
                  {files.length} file{files.length === 1 ? '' : 's'} · {humanSize(totalBytes)}
                </p>
              </div>
              <div className="spaceactions">
                <button className="btn" onClick={copyLink}>
                  {copied ? 'Copied!' : 'Copy space link'}
                </button>
                <button className="btn ghost" onClick={lockSpace}>
                  Lock
                </button>
              </div>
            </div>

            <UploadZone onFiles={handleFilesPicked} disabled={false} />

            {uploads.length > 0 && (
              <div className="uploads">
                {uploads.map((u) => (
                  <UploadItem
                    key={u.id}
                    item={u}
                    onDismiss={(id) => setUploads((prev) => prev.filter((x) => x.id !== id))}
                  />
                ))}
              </div>
            )}

            <section className="filelist">
              {files.length === 0 ? (
                <p className="muted center empty">
                  No files yet — drop some above to get started.
                </p>
              ) : (
                files.map((f) => (
                  <div className="filerow" key={f.id}>
                    <div className="filemeta">
                      <span className="filename" title={f.file_name}>
                        {f.file_name}
                      </span>
                      <span className="muted small">
                        {humanSize(f.size_bytes)} · {formatDate(f.created_at)}
                      </span>
                    </div>
                    <div className="filerowactions">
                      <a
                        className="btn small"
                        href={downloadUrl(f.storage_path)}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={f.file_name}
                      >
                        Download
                      </a>
                      <button className="btn small danger" onClick={() => handleDelete(f)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
