/* Desk.js */

// The home surface: a calm desk with the journals (task lists) the user is actively working with.
// - Wide screens: journals sit where the user left them and can be dragged anywhere on the desk.
// - Narrow screens: journals are shown as a simple tappable stack (saved desk positions are untouched).
// Journals put away (onDesk: false) live in the Journal Library drawer instead.
//
// Journal positions are stored on each task-list document as deskPosition: { x, y, z }.
// x and y are 0–1 fractions of the desk's free space (desk size minus journal size), so the
// arrangement scales with the desk and journals always stay inside it. z is the stacking order.

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Journal, { JOURNAL_WIDTH, JOURNAL_HEIGHT } from './Journal';
import JournalLibrary from './JournalLibrary';
import DeleteJournalDialog from './DeleteJournalDialog';
import { useTasks } from '../context/TasksContext';
import { byMostRecentActivity, toMillis } from '../utils/taskListSort';
import {
  hashString, coverColor, coverRotation, isOnDesk, isReservedJournalName, DEFAULT_TASK_LIST_NAME,
} from '../utils/journals';
import './Desk.css';

export const NARROW_SCREEN_QUERY = '(max-width: 640px)';

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

// Default spot for a journal that hasn't been moved yet: a loose 5×2 layout in creation order,
// then gently cascading. Based on creation order across all lists (including put-away ones), so
// spots don't shift as other journals are moved, put away, or restored.
const COLUMNS = 5;
const ROWS = 2;
export const defaultDeskPosition = (index, id) => {
  const slot = index % (COLUMNS * ROWS);
  const layer = Math.floor(index / (COLUMNS * ROWS));
  const column = slot % COLUMNS;
  const row = Math.floor(slot / COLUMNS);
  const jitter = (hashString(id) % 100) / 100 - 0.5; // -0.5 to 0.5, so it doesn't look like a grid
  return {
    x: clamp01(0.06 + column * (0.88 / (COLUMNS - 1)) + layer * 0.03 + jitter * 0.04),
    y: clamp01(0.15 + row * 0.65 + layer * 0.06 + jitter * 0.06),
    z: 0,
  };
};

const byCreation = (a, b) =>
  toMillis(a.createdAt) - toMillis(b.createdAt) || (a.name || '').localeCompare(b.name || '');

function useMediaQuery(query) {
  const getMatches = () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(getMatches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mediaQuery = window.matchMedia(query);
    const handleChange = () => setMatches(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener?.('change', handleChange);
    return () => mediaQuery.removeEventListener?.('change', handleChange);
  }, [query]);
  return matches;
}

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
  const {
    taskLists = [], createTaskList, updateTaskListPosition, setTaskListOnDesk, deleteTaskList, defaultTaskListId,
  } = useTasks();
  const [journalToDelete, setJournalToDelete] = useState(null);
  const isNarrow = useMediaQuery(NARROW_SCREEN_QUERY);
  const deskRef = useRef(null);
  const libraryButtonRef = useRef(null);
  const [deskSize, setDeskSize] = useState({ width: 0, height: 0 });
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);

  // Measure the desk before paint, and again whenever it resizes
  useLayoutEffect(() => {
    const desk = deskRef.current;
    if (!desk) return;
    const measure = () => setDeskSize({ width: desk.clientWidth, height: desk.clientHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(desk);
    return () => observer.disconnect();
  }, [isNarrow]);

  // Each journal's default spot comes from its place among all lists, then put-away ones are hidden
  const deskJournals = useMemo(
    () => taskLists
      .slice()
      .sort(byCreation)
      .map((list, index) => ({ list, defaultPosition: defaultDeskPosition(index, list.id) }))
      .filter(({ list }) => isOnDesk(list)),
    [taskLists]
  );
  const stackJournals = useMemo(
    () => taskLists.filter(isOnDesk).sort(byMostRecentActivity),
    [taskLists]
  );

  const range = {
    width: Math.max(0, deskSize.width - JOURNAL_WIDTH),
    height: Math.max(0, deskSize.height - JOURNAL_HEIGHT),
  };

  const handleMoveEnd = (list, left, top) => {
    const topZ = Math.max(0, ...taskLists.map((l) => l.deskPosition?.z || 0));
    updateTaskListPosition(list.id, {
      x: range.width ? left / range.width : 0,
      y: range.height ? top / range.height : 0,
      z: topZ + 1, // bring to front
    });
  };

  const closeLibrary = useCallback(() => {
    setIsLibraryOpen(false);
    libraryButtonRef.current?.focus();
  }, []);

  // The system Default Task List is never offered for deletion (checked by ID and, while that's
  // still loading, by name). deleteTaskList enforces the same rule.
  const canDelete = (list) =>
    Boolean(defaultTaskListId) && list.id !== defaultTaskListId && !isReservedJournalName(list.name);

  const journalProps = (list) => ({
    name: list.name,
    color: coverColor(list.id),
    rotation: coverRotation(list.id),
    onOpen: () => onOpenJournal(list.id),
    onPutAway: () => setTaskListOnDesk(list.id, false),
    onDelete: canDelete(list) ? () => setJournalToDelete(list) : undefined,
  });

  const closeDeleteDialog = useCallback(() => setJournalToDelete(null), []);
  const confirmDelete = async () => {
    await deleteTaskList(journalToDelete.id); // throws on failure; the dialog shows the error
    setJournalToDelete(null);
  };

  const emptyDeskMessage = (
    <p className="desk-empty">
      Your desk is clear. Open the Journal Library to bring a journal back, or start a new one.
    </p>
  );

  return (
    <section className="desk-view" aria-label="Your journals">
      <div className="desk-toolbar">
        <button
          type="button"
          ref={libraryButtonRef}
          className="desk-action"
          aria-expanded={isLibraryOpen}
          onClick={() => setIsLibraryOpen((open) => !open)}
        >
          Journal Library
        </button>
        <NewJournalForm onCreate={createTaskList} />
      </div>

      {isNarrow ? (
        stackJournals.length === 0 && taskLists.length > 0 ? emptyDeskMessage : (
          <ul className="journal-stack">
            {stackJournals.map((list) => (
              <li key={list.id}>
                <Journal {...journalProps(list)} />
              </li>
            ))}
          </ul>
        )
      ) : (
        <div className="desk" ref={deskRef}>
          {deskJournals.length === 0 && taskLists.length > 0 && emptyDeskMessage}
          {deskJournals.map(({ list, defaultPosition }) => {
            const position = list.deskPosition || defaultPosition;
            return (
              <Journal
                key={list.id}
                {...journalProps(list)}
                left={clamp01(position.x) * range.width}
                top={clamp01(position.y) * range.height}
                zIndex={(position.z || 0) + 1}
                range={range}
                onMoveEnd={(left, top) => handleMoveEnd(list, left, top)}
              />
            );
          })}
        </div>
      )}

      {isLibraryOpen && (
        <JournalLibrary
          onClose={closeLibrary}
          onOpenJournal={onOpenJournal}
          canDelete={canDelete}
          onDelete={setJournalToDelete}
        />
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
