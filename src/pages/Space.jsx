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
import FileIcon from '../components/FileIcon.jsx';

const BUCKET = 'filedrop';
const FILE_COLS = 'id, file_name, storage_path, size_bytes, mime_type, created_at';
const MAX_FILE_BYTES = 512 * 1024 * 1024; // 512MB client-side cap
let uploadSeq = 0;

export default function Space() {
  const { slug } = useParams();
  const [phase, setPhase] = useState('loading'); // loading | invalid | claim | unlock | open | error
  const [fatal, setFatal] = useState('');
  const [space, setSpace] = useState(null);
  const [file, setFile] = useState(null); // single file per space

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');

  const [upload, setUpload] = useState(null); // single in-flight upload
  const [copied, setCopied] = useState(false);
  const slugRef = useRef(slug);
  slugRef.current = slug;

  const loadFile = useCallback(async (spaceId) => {
    const { data, error } = await supabase
      .from('filedrop_files')
      .select(FILE_COLS)
      .eq('space_id', spaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      setFatal(`Could not load the file: ${error.message}`);
      return;
    }
    setFile(data || null);
  }, []);

  // Fetch the space on slug change.
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setPhase('loading');
      setFatal('');
      setSpace(null);
      setFile(null);
      setUpload(null);
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
        await loadFile(data.id);
        if (!cancelled) setPhase('open');
      } else {
        setPhase('unlock');
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [slug, loadFile]);

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
      await loadFile(data.id);
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
      await loadFile(space.id);
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

  /**
   * Single-file semantics: uploading a new file REPLACES the old one.
   * Ordering keeps the old file safe: upload new bytes → insert new row →
   * only then delete the old object + old row. Any failure keeps the old file.
   */
  async function handleFilePicked(fileList) {
    const picked = fileList && fileList[0];
    if (!picked || !space) return;
    if (upload && upload.status === 'uploading') return;
    if (picked.size > MAX_FILE_BYTES) {
      setUpload({
        id: `u${++uploadSeq}`,
        name: picked.name,
        size: picked.size,
        status: 'error',
        error: `Files up to 512MB — this one is ${humanSize(picked.size)}.`,
      });
      return;
    }
    setUpload({
      id: `u${++uploadSeq}`,
      name: picked.name,
      size: picked.size,
      status: 'uploading',
      error: null,
    });
    const previous = file;
    try {
      const path = `${space.id}/${randomId()}_${sanitizeFilename(picked.name)}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, picked);
      if (upErr) throw upErr;
      const { data: row, error: insErr } = await supabase
        .from('filedrop_files')
        .insert({
          space_id: space.id,
          file_name: picked.name,
          storage_path: path,
          size_bytes: picked.size,
          mime_type: picked.type || null,
        })
        .select(FILE_COLS)
        .single();
      if (insErr) {
        // Metadata write failed — don't orphan bytes, keep the old file.
        await supabase.storage.from(BUCKET).remove([path]);
        throw insErr;
      }
      // New file is safely stored — now clean up the old one (best effort).
      if (previous) {
        const { error: roErr } = await supabase.storage
          .from(BUCKET)
          .remove([previous.storage_path]);
        const { error: rrErr } = await supabase
          .from('filedrop_files')
          .delete()
          .eq('id', previous.id);
        if (roErr || rrErr) {
          console.warn('Old file cleanup failed (new file is live):', roErr, rrErr);
        }
      }
      setFile(row);
      setUpload((u) => (u ? { ...u, status: 'done' } : u));
    } catch (err) {
      setUpload((u) => (u ? { ...u, status: 'error', error: err.message } : u));
    }
  }

  async function handleDelete() {
    if (!file) return;
    if (!window.confirm(`Delete "${file.file_name}"? This cannot be undone.`)) return;
    const { error: storErr } = await supabase.storage.from(BUCKET).remove([file.storage_path]);
    if (storErr) {
      alert(`Could not delete the file: ${storErr.message}`);
      return;
    }
    const { error: rowErr } = await supabase.from('filedrop_files').delete().eq('id', file.id);
    if (rowErr) {
      alert(`File bytes deleted but the listing entry could not be removed: ${rowErr.message}`);
    }
    setFile(null);
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
            <p className="muted">Enter the password to see the file inside.</p>
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
                  {file
                    ? `${humanSize(file.size_bytes)} · uploaded ${formatDate(file.created_at)}`
                    : 'Empty space'}
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

            {file ? (
              <>
              <div className="filecard">
                <FileIcon name={file.file_name} />
                <div className="filecard-main">
                  <div className="filecard-name" title={file.file_name}>
                    {file.file_name}
                  </div>
                  <div className="filecard-meta">
                    {humanSize(file.size_bytes)} · {formatDate(file.created_at)}
                  </div>
                  <div className="filecard-actions">
                    <a
                      className="btn primary"
                      href={downloadUrl(file.storage_path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={file.file_name}
                    >
                      Download
                    </a>
                    <button className="btn danger" onClick={handleDelete}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
              <p className="madewith">
                Made with{' '}
                <a
                  href="https://strawhatmuse-ops.github.io/dropvault/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  DropVault
                </a>
              </p>
              </>
            ) : (
              <div className="emptystate">
                <div className="emptystate-icon" aria-hidden>
                  <svg
                    viewBox="0 0 44 52"
                    fill="none"
                    width="44"
                    height="52"
                  >
                    <path
                      d="M6 2h20l12 12v36H6V2z"
                      stroke="#c9cede"
                      strokeWidth="2.5"
                      strokeLinejoin="round"
                      strokeDasharray="5 4"
                    />
                    <path d="M26 2v12h12" stroke="#c9cede" strokeWidth="2.5" />
                  </svg>
                </div>
                <h3>This space is empty</h3>
                <p>Drop your file below — one file lives here at a time.</p>
              </div>
            )}

            <UploadZone
              mode={file ? 'replace' : 'upload'}
              onFiles={handleFilePicked}
              disabled={upload?.status === 'uploading'}
            />

            {upload && (
              <div className="uploads">
                <UploadItem item={upload} onDismiss={() => setUpload(null)} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
