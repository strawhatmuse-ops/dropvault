import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { normalizeSlug, isValidSlug } from '../lib/helpers.js';

const STEPS = [
  {
    n: '1',
    title: 'Pick a name',
    text: 'Type any space name — like my-trip-photos. That name becomes the space URL.',
  },
  {
    n: '2',
    title: 'Set a password',
    text: 'First visit claims the space. Set a password; only people with it can get in.',
  },
  {
    n: '3',
    title: 'Drop files',
    text: 'Upload files, share the space link + password. Anyone with both sees the files.',
  },
];

export default function Home() {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  function go(e) {
    e.preventDefault();
    const slug = normalizeSlug(value);
    if (!isValidSlug(slug)) {
      setError('Use 3–48 characters: lowercase letters, numbers and dashes.');
      return;
    }
    navigate(`/${slug}`);
  }

  return (
    <div className="page">
      <header className="brandbar">
        <Link className="brand" to="/">DropVault</Link>
      </header>

      <main className="hero">
        <h1>DropVault</h1>
        <p className="tagline">
          Password-protected file spaces. Pick a name, set a password, drop files —
          like ProtectedText, but for files.
        </p>

        <form className="gobox" onSubmit={go}>
          <input
            className="textinput big"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError('');
            }}
            placeholder="Enter a space name…"
            aria-label="Space name"
            autoFocus
          />
          <button className="btn primary big" type="submit">
            Go
          </button>
        </form>
        {error && <p className="error">{error}</p>}
        <p className="hint">Visiting a name that doesn't exist yet lets you claim it.</p>

        <section className="steps">
          {STEPS.map((s) => (
            <div className="step" key={s.n}>
              <div className="stepnum">{s.n}</div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </section>

        <p className="footnote">
          No accounts. The space URL + password is the key — share both with people you trust,
          and use a strong password.
        </p>
      </main>
    </div>
  );
}
