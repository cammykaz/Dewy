/* Desk.js */

// The home surface: a bookshelf above a desk.
// - The desk holds the few journals (task lists) used most recently — opened from here, or planned in.
// - The shelf holds every other journal as a spine. Clicking one takes it down onto the desk (without
//   opening it), and the least recently used desk journal goes back up to the shelf.
// - A journal opens as a lightbox over the room: the desk and shelf stay visible, blurred, around its
//   edges. Clicking those edges, Close, Escape, or browser Back lays it back down.
// Both are derived from the lists themselves, so there are no saved positions to fall out of date.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Journal from './Journal';
import OpenJournal from './OpenJournal';
import Bookshelf from './Bookshelf';
import DeleteJournalDialog from './DeleteJournalDialog';
import TaskManager from './TaskManager';
import { useTasks } from '../context/TasksContext';
import { byMostRecentUse } from '../utils/taskListSort';
import { isTypingTarget } from '../utils/useUndoShortcuts';
import { coverColor, coverRotation, isReservedJournalName, DEFAULT_TASK_LIST_NAME } from '../utils/journals';
import './Desk.css';

// Escape closes the open journal, unless it's already doing something closer to hand: leaving a
// text field, closing a dropdown or a journal's menu, or dismissing a dialog
const escapeBelongsElsewhere = (target) =>
  isTypingTarget(target) ||
  target?.tagName === 'SELECT' ||
  Boolean(target?.closest?.('[role="menu"]')) ||
  Boolean(document.querySelector('[role="alertdialog"]'));

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

// openJournalId: the journal open on the desk, if any
function Desk({ openJournalId = null, onOpenJournal, onCloseJournal }) {
  const { taskLists = [], createTaskList, deleteTaskList, defaultTaskListId, takeDownTaskList } = useTasks();
  const [journalToDelete, setJournalToDelete] = useState(null);
  const [arrivedJournalId, setArrivedJournalId] = useState(null);
  const deskRef = useRef(null);
  const roomRef = useRef(null);

  const openList = taskLists.find((list) => list.id === openJournalId) || null;

  const [deskJournals, shelvedJournals] = useMemo(() => {
    const byUse = taskLists.slice().sort(byMostRecentUse);
    return [byUse.slice(0, DESK_JOURNAL_COUNT), byUse.slice(DESK_JOURNAL_COUNT)];
  }, [taskLists]);

  // While a journal is open, the room behind it can be seen but not used (the lightbox is modal)
  useEffect(() => {
    roomRef.current?.toggleAttribute('inert', Boolean(openList));
  }, [openList]);

  const focusCover = useCallback((taskListId) => {
    const covers = deskRef.current?.querySelectorAll('[data-journal-id]') || [];
    [...covers].find((cover) => cover.dataset.journalId === taskListId)?.focus();
  }, []);

  // Taking a journal down from the shelf puts it on the desk without opening it
  const takeDown = (taskListId) => {
    takeDownTaskList(taskListId);
    setArrivedJournalId(taskListId);
  };

  // The spine that was clicked is gone from the shelf, so keyboard focus follows the journal down
  useEffect(() => {
    if (arrivedJournalId) focusCover(arrivedJournalId);
  }, [arrivedJournalId, focusCover]);

  // When a journal closes (Close, Escape, or browser Back), focus returns to its cover
  const previousOpenIdRef = useRef(openList?.id ?? null);
  useEffect(() => {
    const previousOpenId = previousOpenIdRef.current;
    previousOpenIdRef.current = openList?.id ?? null;
    if (previousOpenId && !openList) focusCover(previousOpenId);
  }, [openList, focusCover]);

  // Escape lays the open journal back down
  useEffect(() => {
    if (!openList || !onCloseJournal) return;
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented || escapeBelongsElsewhere(e.target)) return;
      onCloseJournal();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [openList, onCloseJournal]);

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
      <div className="desk-room" ref={roomRef}>
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
      </div>

      {openList && (
        <OpenJournal name={openList.name} color={coverColor(openList.id)} onClose={onCloseJournal}>
          <TaskManager inJournal />
        </OpenJournal>
      )}

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
