/* Desk.js */

// The home surface: a bookshelf above a desk.
// - The desk holds the few journals (task lists) used most recently — opened from here, or planned in.
// - The shelf holds every other journal as a spine. Clicking one takes it down onto the desk (without
//   opening it), and the least recently used desk journal goes back up to the shelf.
// Both are derived from the lists themselves, so there are no saved positions to fall out of date.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Journal from './Journal';
import Bookshelf from './Bookshelf';
import DeleteJournalDialog from './DeleteJournalDialog';
import { useTasks } from '../context/TasksContext';
import { byMostRecentUse } from '../utils/taskListSort';
import { coverColor, coverRotation, isReservedJournalName, DEFAULT_TASK_LIST_NAME } from '../utils/journals';
import './Desk.css';

// How many journals lie on the desk
export const DESK_JOURNAL_COUNT = 3;

function NewJournalForm({ onCreate }) {
  const [isNaming, setIsNaming] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState(null);

  const close = () => {
    setName('');
    setError(null);
    setIsNaming(false);
  };

  if (!isNaming) {
    return (
      <button type="button" className="desk-action" onClick={() => setIsNaming(true)}>
        + New journal
      </button>
    );
  }

  return (
    <form
      className="new-journal-form"
      onSubmit={(e) => {
        e.preventDefault();
        const trimmedName = name.trim();
        if (isReservedJournalName(trimmedName)) {
          setError(`“${DEFAULT_TASK_LIST_NAME}” is reserved for your system journal. Please choose another name.`);
          return;
        }
        if (trimmedName) onCreate(trimmedName);
        close();
      }}
    >
      <input
        type="text"
        aria-label="New journal name"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'new-journal-error' : undefined}
        placeholder="Name your journal"
        value={name}
        onChange={(e) => { setName(e.target.value); setError(null); }}
        onKeyDown={(e) => { if (e.key === 'Escape') close(); }}
        onBlur={() => { if (!name.trim()) close(); }}
        autoFocus
      />
      <button type="submit" className="desk-action">Add</button>
      {error && <p id="new-journal-error" className="new-journal-error" role="alert">{error}</p>}
    </form>
  );
}

function Desk({ onOpenJournal }) {
  const { taskLists = [], createTaskList, deleteTaskList, defaultTaskListId, takeDownTaskList } = useTasks();
  const [journalToDelete, setJournalToDelete] = useState(null);
  const [arrivedJournalId, setArrivedJournalId] = useState(null);
  const deskRef = useRef(null);

  const [deskJournals, shelvedJournals] = useMemo(() => {
    const byUse = taskLists.slice().sort(byMostRecentUse);
    return [byUse.slice(0, DESK_JOURNAL_COUNT), byUse.slice(DESK_JOURNAL_COUNT)];
  }, [taskLists]);

  // Taking a journal down from the shelf puts it on the desk without opening it
  const takeDown = (taskListId) => {
    takeDownTaskList(taskListId);
    setArrivedJournalId(taskListId);
  };

  // The spine that was clicked is gone from the shelf, so keyboard focus follows the journal down
  useEffect(() => {
    if (!arrivedJournalId) return;
    const covers = deskRef.current?.querySelectorAll('[data-journal-id]') || [];
    [...covers].find((cover) => cover.dataset.journalId === arrivedJournalId)?.focus();
  }, [arrivedJournalId]);

  // The system Default Task List is never offered for deletion (checked by ID and, while that's
  // still loading, by name). deleteTaskList enforces the same rule.
  const canDelete = (list) =>
    Boolean(defaultTaskListId) && list.id !== defaultTaskListId && !isReservedJournalName(list.name);

  const closeDeleteDialog = useCallback(() => setJournalToDelete(null), []);
  const confirmDelete = async () => {
    await deleteTaskList(journalToDelete.id); // throws on failure; the dialog shows the error
    setJournalToDelete(null);
  };

  return (
    <section className="desk-view" aria-label="Your journals">
      <div className="desk-toolbar">
        <NewJournalForm onCreate={createTaskList} />
      </div>

      <Bookshelf journals={shelvedJournals} onTakeDown={takeDown} />

      <div className="desk" ref={deskRef}>
        {deskJournals.length === 0 ? (
          <p className="desk-empty">Your desk is clear. Start a new journal.</p>
        ) : (
          <ul className="desk-journals" aria-label="On your desk">
            {deskJournals.map((list) => (
              <li key={list.id}>
                <Journal
                  id={list.id}
                  isArriving={list.id === arrivedJournalId}
                  name={list.name}
                  color={coverColor(list.id)}
                  rotation={coverRotation(list.id)}
                  onOpen={() => onOpenJournal(list.id)}
                  onDelete={canDelete(list) ? () => setJournalToDelete(list) : undefined}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {journalToDelete && (
        <DeleteJournalDialog
          journalName={journalToDelete.name}
          onCancel={closeDeleteDialog}
          onConfirm={confirmDelete}
        />
      )}
    </section>
  );
}

export default Desk;
