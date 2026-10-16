/** Minimal file-type icon: document glyph with the extension label. No emojis. */
function extOf(name) {
  const parts = String(name || '').split('.');
  return parts.length > 1 ? parts.pop().toLowerCase().slice(0, 4) : '';
}

export default function FileIcon({ name }) {
  const ext = extOf(name);
  return (
    <div className="fileicon" aria-hidden>
      <svg viewBox="0 0 44 52" fill="none">
        <path
          d="M6 2h20l12 12v36H6V2z"
          fill="#eef0ff"
          stroke="#4f46e5"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <path
          d="M26 2v12h12"
          fill="none"
          stroke="#4f46e5"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <text
          x="22"
          y="40"
          textAnchor="middle"
          fontSize={ext.length > 3 ? 8 : 10}
          fontWeight="800"
          fill="#4f46e5"
          fontFamily="ui-sans-serif, system-ui, sans-serif"
        >
          {ext ? ext.toUpperCase() : 'FILE'}
        </text>
      </svg>
    </div>
  );
}
