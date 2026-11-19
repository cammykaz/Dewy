/* JournalLibrary.js */

// Slide-out drawer listing every journal (task list), most recent planning activity first.
// Journals can be opened, put away (removed from the desk), or placed back on the desk.
// Putting a journal away only sets onDesk: false; its tasks and saved desk position are kept.

import React, { useEffect, useMemo, useState } from 'react';
import { useTasks } from '../context/TasksContext';
import { byMostRecentActivity } from '../utils/taskListSort';
import { coverColor, isOnDesk } from '../utils/journals';

// canDelete(list) decides whether a row offers Delete; onDelete(list) asks the desk to confirm it.
function JournalLibrary({ onClose, onOpenJournal, canDelete, onDelete }) {
  const { taskLists = [], setTaskListOnDesk } = useTasks();
  const [search, setSearch] = useState('');

  // Escape closes the drawer
  useEffect(() => {
    const handleKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const journalsByActivity = useMemo(() => taskLists.slice().sort(byMostRecentActivity), [taskLists]);
  const query = search.trim().toLowerCase();
  const visibleJournals = query
    ? journalsByActivity.filter((list) => (list.name || '').toLowerCase().includes(query))
    : journalsByActivity;

  return (
    <>
      <div className="library-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="journal-library" role="dialog" aria-label="Journal Library">
        <div className="library-header">
          <h2>Journal Library</h2>
          <button type="button" className="library-close" aria-label="Close library" onClick={onClose}>
            ×
          </button>
        </div>

        <input
          type="search"
          className="library-search"
          aria-label="Search journals"
          placeholder="Search journals"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />

        {visibleJournals.length === 0 ? (
          <p className="library-empty">
            {query ? 'No journals match that name.' : 'No journals yet.'}
          </p>
        ) : (
          <ul className="library-list" aria-label="Journals">
            {visibleJournals.map((list) => {
              const onDesk = isOnDesk(list);
              return (
                <li key={list.id} className="library-item">
                  <span className="library-swatch" style={{ '--cover': coverColor(list.id) }} aria-hidden="true" />
                  <span className="library-item-text">
                    <span className="library-item-name" title={list.name}>{list.name}</span>
                    <span className="library-item-status">{onDesk ? 'On desk' : 'Put away'}</span>
                  </span>
                  <span className="library-item-actions">
                    <button type="button" aria-label={`Open ${list.name}`} onClick={() => onOpenJournal(list.id)}>
                      Open
                    </button>
                    {onDesk ? (
                      <button
                        type="button"
                        aria-label={`Put away ${list.name}`}
                        onClick={() => setTaskListOnDesk(list.id, false)}
                      >
                        Put away
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="library-place"
                        aria-label={`Place ${list.name} on desk`}
                        onClick={() => setTaskListOnDesk(list.id, true)}
                      >
                        Place on desk
                      </button>
                    )}
                    {canDelete(list) && (
                      <button
                        type="button"
                        className="library-delete"
                        aria-label={`Delete ${list.name}`}
                        onClick={() => onDelete(list)}
                      >
                        Delete
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </>
  );
}

export default JournalLibrary;
