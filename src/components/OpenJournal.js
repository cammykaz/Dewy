/* OpenJournal.js */

// A journal opened from the desk, as a lightbox: a frosted-glass journal fills most of the screen,
// and the desk and shelf stay visible behind a blurred scrim around its edges. Clicking those edges,
// Close, Escape (handled by Desk), or browser Back lays the journal back down.
// While open it behaves as a modal dialog: focus moves into it and Tab stays within it.

import React, { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function OpenJournal({ name, color, onClose, children }) {
  const panelRef = useRef(null);
  const headingRef = useRef(null);

  // Move focus into the journal when it opens
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // The page behind doesn't scroll while the journal is open
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = overflow; };
  }, []);

  // Keep Tab cycling within the journal
  const handleKeyDown = (e) => {
    if (e.key !== 'Tab') return;
    const focusable = [...panelRef.current.querySelectorAll(FOCUSABLE)];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === headingRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="journal-overlay" style={{ '--cover': color }}>
      {/* The blurred desk around the journal: clicking it lays the journal back down */}
      <div className="journal-scrim" aria-hidden="true" onClick={onClose} />

      <article
        className="open-journal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="open-journal-title"
        ref={panelRef}
        onKeyDown={handleKeyDown}
      >
        <header className="open-journal-header">
          <h2 id="open-journal-title" className="open-journal-title" tabIndex={-1} ref={headingRef}>
            {name}
          </h2>
          <button type="button" className="open-journal-close" aria-label={`Close ${name}`} onClick={onClose}>
            Close
          </button>
        </header>
        <div className="open-journal-page">{children}</div>
      </article>
    </div>
  );
}

export default OpenJournal;
