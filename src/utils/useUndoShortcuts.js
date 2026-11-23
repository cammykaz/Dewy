/* useUndoShortcuts.js */

// App-wide undo/redo keyboard shortcuts:
//   Undo: Ctrl+Z (⌘Z on Mac)
//   Redo: Ctrl+Shift+Z or Ctrl+Y (⌘⇧Z on Mac)
// While typing in a text field the browser's own text undo applies instead, and nothing happens
// while a confirmation dialog is open. Checkboxes and dropdowns don't count as typing, so a task's
// completion or impact/time can be undone right after changing it.

import { useEffect } from 'react';

const TEXT_INPUT_TYPES = new Set(['text', 'search', 'email', 'password', 'number', 'url', 'tel', 'date', 'time', 'datetime-local', 'month', 'week']);

export const isTypingTarget = (element) => {
  if (!element || !element.tagName) return false;
  if (element.isContentEditable || element.tagName === 'TEXTAREA') return true;
  return element.tagName === 'INPUT' && TEXT_INPUT_TYPES.has((element.type || 'text').toLowerCase());
};

export function useUndoShortcuts(undo, redo) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      const isUndo = key === 'z' && !e.shiftKey;
      const isRedo = (key === 'z' && e.shiftKey) || (key === 'y' && !e.shiftKey);
      if (!isUndo && !isRedo) return;
      if (isTypingTarget(e.target) || document.querySelector('[role="alertdialog"]')) return;
      e.preventDefault();
      if (isUndo) undo?.();
      else redo?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);
}
