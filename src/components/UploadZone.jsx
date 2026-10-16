import { useRef, useState } from 'react';
import { humanSize } from '../lib/helpers.js';

/**
 * Drag-and-drop + click-to-browse upload zone (single file).
 * Props: onFiles(FileList | File[]) -> void, disabled, mode: 'upload' | 'replace'
 */
export default function UploadZone({ onFiles, disabled, mode = 'upload' }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const replace = mode === 'replace';

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = e.dataTransfer?.files;
    if (files && files.length) onFiles(files);
  }

  return (
    <div
      className={`dropzone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}${
        replace ? ' replace' : ''
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => {
        if (!disabled) inputRef.current?.click();
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !disabled) inputRef.current?.click();
      }}
      aria-label={replace ? 'Replace file' : 'Upload file'}
    >
      <div className="dropicon">⇪</div>
      {replace ? (
        <>
          <p>
            <strong>Replace file</strong>
          </p>
          <p className="muted">Drop a new file here or click to browse · up to 100MB</p>
          <p className="dropnote">Uploading a new file will replace the current one.</p>
        </>
      ) : (
        <>
          <p>
            <strong>Drag &amp; drop your file here</strong>
          </p>
          <p className="muted">or click to browse · up to 100MB</p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** One row of the upload progress list. */
export function UploadItem({ item, onDismiss }) {
  const done = item.status === 'done';
  const failed = item.status === 'error';
  return (
    <div className={`uploaditem${failed ? ' failed' : ''}`}>
      <span className="uistatus" aria-hidden>
        {done ? '✓' : failed ? '✕' : '…'}
      </span>
      <span className="uiname" title={item.name}>
        {item.name}
      </span>
      <span className="uisize muted">{humanSize(item.size)}</span>
      {failed && <span className="uierror">{item.error || 'Upload failed'}</span>}
      {(done || failed) && (
        <button className="linkbtn" onClick={() => onDismiss(item.id)}>
          dismiss
        </button>
      )}
    </div>
  );
}
