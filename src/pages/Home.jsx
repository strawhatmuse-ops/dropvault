import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { normalizeSlug, isValidSlug } from '../lib/helpers.js';

const STEPS = [
  {
    n: '1',
    title: 'Pick a name',
    text: 'Type any space name — like diwali-photos. That name becomes the space URL.',
  },
  {
    n: '2',
    title: 'Set a password',
    text: 'First visit claims the space. Set a password — only people with it can get in.',
  },
  {
    n: '3',
    title: 'Drop a file',
    text: 'Upload one file per space. Share the link + password; anyone with both can download it.',
  },
];

const FEATURES = [
  {
    icon: 'user',
    title: 'No account needed',
    text: 'No sign-up, no email, no tracking. A space name + password is the whole system.',
  },
  {
    icon: 'lock',
    title: 'Password-protected',
    text: 'Every space is locked. Passwords are checked in your browser — the server never sees them.',
  },
  {
    icon: 'link',
    title: 'One permanent link',
    text: 'Each space lives at one URL forever. Uploading a new file simply replaces the old one.',
  },
  {
    icon: 'download',
    title: 'Direct downloads',
    text: 'No waiting rooms, no countdown timers. Share the link and people download straight away.',
  },
];

const FAQS = [
  {
    q: 'Is DropVault free?',
    a: 'Yes — completely free, no accounts, no ads, no tracking. It runs on shared free-tier infrastructure, so keep files reasonably sized.',
  },
  {
    q: 'How long do my files stay?',
    a: 'Until you replace or delete them — there is no automatic expiry. That said, this is a casual sharing tool, not archival storage, so keep your own backup of anything important.',
  },
  {
    q: 'Who can see my files?',
    a: 'Anyone who has both the space URL and the password. Spaces are never listed publicly. Use a strong password — anyone who guesses a space name can try passwords against it.',
  },
  {
    q: 'What happens when I upload a new file?',
    a: 'Each space holds exactly one file. The new file uploads first, and only after it succeeds is the old one deleted — so a failed upload never loses your file.',
  },
];

function FeatureIcon({ kind }) {
  const paths = {
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
      </>
    ),
    link: (
      <>
        <path d="M10 14a4 4 0 0 0 6 0l3-3a4 4 0 0 0-6-6l-1.5 1.5" />
        <path d="M14 10a4 4 0 0 0-6 0l-3 3a4 4 0 0 0 6 6l1.5-1.5" />
      </>
    ),
    download: (
      <>
        <path d="M12 4v11" />
        <path d="M7 11l5 5 5-5" />
        <path d="M4 20h16" />
      </>
    ),
  };
  return (
    <svg
      className="featureicon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {paths[kind]}
    </svg>
  );
}

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
        <Link className="brand" to="/">
          DropVault
        </Link>
      </header>

      <main className="hero">
        <p className="herobadge">No accounts · No tracking</p>
        <h1>DropVault</h1>
        <p className="tagline">
          Password-protected file spaces. Pick a name, set a password, drop a file — like
          ProtectedText, but for files.
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

        <section className="section">
          <h2 className="sectiontitle">How it works</h2>
          <div className="steps">
            {STEPS.map((s) => (
              <div className="step" key={s.n}>
                <div className="stepnum">{s.n}</div>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2 className="sectiontitle">Why DropVault</h2>
          <div className="features">
            {FEATURES.map((f) => (
              <div className="feature" key={f.title}>
                <div className="featureiconwrap">
                  <FeatureIcon kind={f.icon} />
                </div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2 className="sectiontitle">Questions</h2>
          <div className="faq">
            {FAQS.map((f) => (
              <details className="faqitem" key={f.q}>
                <summary>{f.q}</summary>
                <p className="faqbody">{f.a}</p>
              </details>
            ))}
          </div>
        </section>
      </main>

      <footer className="pagefoot">
        DropVault — password-protected file spaces. The space URL + password is the key: share
        both with people you trust, and use a strong password.
      </footer>
    </div>
  );
}
