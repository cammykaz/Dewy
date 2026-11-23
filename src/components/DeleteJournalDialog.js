/* DeleteJournalDialog.js */

// Confirmation before permanently deleting a journal (task list) and all of its tasks.
// Cancel is focused first. While deleting, the dialog can't be dismissed; if deletion fails it stays
// open with an error so the user can retry or cancel.

import React, { useEffect, useRef, useState } from 'react';

const GENERIC_ERROR = "Couldn't delete this journal. It's still here — check your connection and try again.";

function DeleteJournalDialog({ journalName, onCancel, onConfirm }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);
  const cancelButtonRef = useRef(null);

  // Focus Cancel on open; return focus to whatever opened the dialog when it closes
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    cancelButtonRef.current?.focus();
    return () => {
      if (previouslyFocused?.isConnected) previouslyFocused.focus();
    };
  }, []);

  const cancel = () => {
    if (!isDeleting) onCancel();
  };

  // Escape cancels. Capture phase + stopPropagation so nothing behind the dialog also reacts to it.
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (!isDeleting) onCancel();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isDeleting, onCancel]);

  const confirm = async () => {
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm(); // on success the parent closes the dialog
    } catch (e) {
      setError(e.userMessage || GENERIC_ERROR);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="dialog-backdrop" onClick={cancel} aria-hidden="true" />
      <div
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-journal-title"
        aria-describedby="delete-journal-description"
      >
        <h2 id="delete-journal-title">Delete “{journalName}”?</h2>
        <p id="delete-journal-description">
          This permanently deletes the journal and all of its tasks. This can't be undone.
        </p>
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <div className="dialog-actions">
          <button type="button" ref={cancelButtonRef} className="desk-action" onClick={cancel} disabled={isDeleting}>
            Cancel
          </button>
          <button type="button" className="desk-action danger" onClick={confirm} disabled={isDeleting}>
            {isDeleting ? 'Deleting…' : 'Delete journal'}
          </button>
        </div>
      </div>
    </>
  );
}

export default DeleteJournalDialog;
