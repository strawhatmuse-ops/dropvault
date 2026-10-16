import { useRef, useState } from 'react';
import { humanSize } from '../lib/helpers.js';

/**
 * Drag-and-drop + click-to-browse upload zone.
 * Props: onFiles(FileList | File[]) -> void, disabled
 */
export default function UploadZone({ onFiles, disabled }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  function handleDrop(e) {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = e.dataTransfer?.files;
    if (files && files.length) onFiles(files);
  }

  return (
    <div
      className={`dropzone${dragging ? ' dragging' : ''}${disabled ? ' disabled' : ''}`}
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
      aria-label="Upload files"
    >
      <div className="dropicon">⇪</div>
      <p>
        <strong>Drag &amp; drop files here</strong>
      </p>
      <p className="muted">or click to browse — multiple files welcome</p>
      <input
        ref={inputRef}
        type="file"
        multiple
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
