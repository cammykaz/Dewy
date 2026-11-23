/* Journal.js */

// A single journal (task list) lying on the desk. Clicking the cover (or pressing Enter/Space, since
// it's a button) opens it. When the journal can be deleted, a small "⋯" menu offers Open and Delete….

import React, { useEffect, useRef, useState } from 'react';

// isArriving plays a short landing animation (the journal was just taken down from the shelf)
function Journal({ id, name, color, rotation, isArriving, onOpen, onDelete }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuAreaRef = useRef(null);
  const menuButtonRef = useRef(null);

  // Close the menu when interacting anywhere else
  useEffect(() => {
    if (!isMenuOpen) return;
    const handlePointerDown = (e) => {
      if (!menuAreaRef.current?.contains(e.target)) setIsMenuOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isMenuOpen]);

  const closeMenu = () => {
    setIsMenuOpen(false);
    menuButtonRef.current?.focus();
  };

  const style = { '--cover': color, '--rotation': `${rotation}deg` };
  if (isMenuOpen) style.zIndex = 1; // keep the open menu above neighbouring journals

  return (
    <div className={`journal${isArriving ? ' is-arriving' : ''}`} style={style}>
      <button
        type="button"
        className="journal-cover"
        data-journal-id={id}
        aria-label={`Open ${name}`}
        title={name}
        onClick={onOpen}
      >
        <span className="journal-label">
          <span className="journal-title">{name}</span>
        </span>
      </button>

      {onDelete && (
        <div className="journal-menu-area" ref={menuAreaRef}>
          <button
            type="button"
            ref={menuButtonRef}
            className="journal-menu-button"
            aria-label={`Actions for ${name}`}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            ⋯
          </button>
          {isMenuOpen && (
            <div
              className="journal-menu"
              role="menu"
              aria-label={`${name} actions`}
              onKeyDown={(e) => { if (e.key === 'Escape') closeMenu(); }}
            >
              <button type="button" role="menuitem" autoFocus onClick={() => { setIsMenuOpen(false); onOpen(); }}>
                Open
              </button>
              <button
                type="button"
                role="menuitem"
                className="journal-menu-delete"
                onClick={() => { setIsMenuOpen(false); onDelete(); }}
              >
                Delete…
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Journal;
