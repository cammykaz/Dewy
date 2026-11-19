/* Journal.js */

// A single journal representing one task list.
// Clicking the cover (or pressing Enter/Space, since it's a button) opens it. On the desk it can also be
// dragged: the in-progress position lives here so dragging doesn't re-render the whole app, and the final
// position is reported once, when the drag ends. A small "⋯" menu offers Open and Put away.

import React, { useEffect, useRef, useState } from 'react';

// Keep in sync with .journal in Desk.css
export const JOURNAL_WIDTH = 132;
export const JOURNAL_HEIGHT = 176;
// Pointer movement (px) below this is treated as a click rather than a drag
export const DRAG_THRESHOLD = 5;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Desk mode: pass left/top/zIndex (px), range ({ width, height } of free space), and onMoveEnd(left, top).
 * Stack mode (narrow screens): omit them; the journal is a plain tappable cover.
 * Pass onPutAway to show the journal's action menu, and onDelete to include "Delete…" in it.
 */
function Journal({ name, color, rotation, left, top, zIndex, range, onOpen, onMoveEnd, onPutAway, onDelete }) {
  const isDraggable = Boolean(onMoveEnd && range);
  const dragRef = useRef(null); // { pointerId, startX, startY, startLeft, startTop, left, top, moved }
  const suppressClickRef = useRef(false); // the click that follows a drag shouldn't open the journal
  const [dragPosition, setDragPosition] = useState(null);
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

  const handlePointerDown = (e) => {
    if (!isDraggable || e.button !== 0) return;
    suppressClickRef.current = false;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: left,
      startTop: top,
      left,
      top,
      moved: false,
    };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handlePointerMove = (e) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    drag.left = clamp(drag.startLeft + dx, 0, range.width);
    drag.top = clamp(drag.startTop + dy, 0, range.height);
    setDragPosition({ left: drag.left, top: drag.top });
  };

  const endDrag = (e, shouldSave) => {
    const drag = dragRef.current;
    if (!drag || e.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return; // a click; onClick will open the journal
    suppressClickRef.current = true;
    if (shouldSave) onMoveEnd(drag.left, drag.top);
    setDragPosition(null);
  };

  const handleClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen();
  };

  const isDragging = dragPosition !== null;
  const style = { '--cover': color, '--rotation': `${rotation}deg` };
  if (isDraggable) {
    style.left = isDragging ? dragPosition.left : left;
    style.top = isDragging ? dragPosition.top : top;
    style.zIndex = zIndex;
  }
  // While dragging or showing its menu, a journal sits above all others
  if (isDragging || isMenuOpen) style.zIndex = 10000;

  return (
    <div className={`journal${isDragging ? ' is-dragging' : ''}`} style={style}>
      <button
        type="button"
        className="journal-cover"
        aria-label={`Open ${name}`}
        title={name}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => endDrag(e, true)}
        onPointerCancel={(e) => endDrag(e, false)}
      >
        <span className="journal-label">
          <span className="journal-title">{name}</span>
        </span>
      </button>

      {onPutAway && (
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
              <button type="button" role="menuitem" onClick={() => { setIsMenuOpen(false); onPutAway(); }}>
                Put away
              </button>
              {onDelete && (
                <button
                  type="button"
                  role="menuitem"
                  className="journal-menu-delete"
                  onClick={() => { setIsMenuOpen(false); onDelete(); }}
                >
                  Delete…
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default Journal;
