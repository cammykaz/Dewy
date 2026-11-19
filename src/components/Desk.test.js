import React, { createContext, useContext, useState } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import Desk from './Desk';
import { JOURNAL_WIDTH, JOURNAL_HEIGHT } from './Journal';
import { useTasks } from '../context/TasksContext';

jest.mock('../context/TasksContext', () => ({ useTasks: jest.fn() }));

// jsdom has no layout or PointerEvent: give the desk a size and polyfill PointerEvent
const DESK_WIDTH = 1000;
const DESK_HEIGHT = 625;
const RANGE_X = DESK_WIDTH - JOURNAL_WIDTH; // 868
const RANGE_Y = DESK_HEIGHT - JOURNAL_HEIGHT; // 449

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return this.classList.contains('desk') ? DESK_WIDTH : 0; },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get() { return this.classList.contains('desk') ? DESK_HEIGHT : 0; },
  });
  if (!window.PointerEvent) {
    window.PointerEvent = class PointerEvent extends MouseEvent {
      constructor(type, params = {}) {
        super(type, params);
        this.pointerId = params.pointerId ?? 1;
      }
    };
  }
});

afterEach(() => {
  delete window.matchMedia;
});

const timestamp = (ms) => ({ toMillis: () => ms });
const useNarrowScreen = () => {
  window.matchMedia = (query) => ({ matches: true, media: query, addEventListener() {}, removeEventListener() {} });
};

// Stand-in for TasksContext that keeps taskLists in state, mirroring how the real context merges
// fields locally, so the desk and library update as they would in the app.
const FakeTasks = createContext(null);
function FakeTasksProvider({ initialLists, defaultTaskListId, spies, children }) {
  const [taskLists, setTaskLists] = useState(initialLists);
  const merge = (id, fields) => setTaskLists((lists) => lists.map((l) => (l.id === id ? { ...l, ...fields } : l)));
  const value = {
    taskLists,
    defaultTaskListId,
    createTaskList: spies.createTaskList,
    updateTaskListPosition: (id, deskPosition) => { spies.updateTaskListPosition(id, deskPosition); merge(id, { deskPosition }); },
    setTaskListOnDesk: (id, onDesk) => { spies.setTaskListOnDesk(id, onDesk); merge(id, { onDesk }); },
    // Like the real context: removes the list only once deletion succeeds; rejects otherwise
    deleteTaskList: async (id) => {
      await spies.deleteTaskList(id);
      setTaskLists((lists) => lists.filter((l) => l.id !== id));
    },
  };
  return <FakeTasks.Provider value={value}>{children}</FakeTasks.Provider>;
}

const renderDesk = (taskLists, { defaultTaskListId = 'default-id' } = {}) => {
  const spies = {
    createTaskList: jest.fn(),
    updateTaskListPosition: jest.fn(),
    setTaskListOnDesk: jest.fn(),
    deleteTaskList: jest.fn(async () => {}),
  };
  useTasks.mockImplementation(() => useContext(FakeTasks));
  const onOpenJournal = jest.fn();
  render(
    <FakeTasksProvider initialLists={taskLists} defaultTaskListId={defaultTaskListId} spies={spies}>
      <Desk onOpenJournal={onOpenJournal} />
    </FakeTasksProvider>
  );
  return { ...spies, onOpenJournal };
};

const desk = () => document.querySelector('.desk');
const cover = (name) => within(desk() || screen.getByRole('region')).getByRole('button', { name: `Open ${name}` });
const journalOnDesk = (name) => cover(name).closest('.journal');
const queryCover = (name) => within(desk()).queryByRole('button', { name: `Open ${name}` });

// Simulate a pointer gesture: down at (100,100), optional moves, up, then the browser's click
const gesture = (element, moves) => {
  fireEvent.pointerDown(element, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
  moves.forEach(([x, y]) => fireEvent.pointerMove(element, { pointerId: 1, clientX: x, clientY: y }));
  const [lastX, lastY] = moves[moves.length - 1] || [100, 100];
  fireEvent.pointerUp(element, { pointerId: 1, clientX: lastX, clientY: lastY });
  fireEvent.click(element);
};

const lists = [
  { id: 'a', name: 'Work', createdAt: timestamp(1), deskPosition: { x: 0.5, y: 0.5, z: 3 } },
  { id: 'b', name: 'Home', createdAt: timestamp(2), deskPosition: { x: 0, y: 0, z: 7 } },
];

describe('desk', () => {
  test('journals render at their saved positions and stacking order', () => {
    renderDesk(lists);
    expect(journalOnDesk('Work')).toHaveStyle({ left: `${0.5 * RANGE_X}px`, top: `${0.5 * RANGE_Y}px`, zIndex: '4' });
    expect(journalOnDesk('Home')).toHaveStyle({ left: '0px', top: '0px', zIndex: '8' });
  });

  test('a click opens the journal without saving a position', () => {
    const { onOpenJournal, updateTaskListPosition } = renderDesk(lists);
    gesture(cover('Work'), []);
    expect(onOpenJournal).toHaveBeenCalledWith('a');
    expect(updateTaskListPosition).not.toHaveBeenCalled();
  });

  test('movement below the drag threshold still counts as a click', () => {
    const { onOpenJournal, updateTaskListPosition } = renderDesk(lists);
    gesture(cover('Work'), [[102, 103]]);
    expect(onOpenJournal).toHaveBeenCalledWith('a');
    expect(updateTaskListPosition).not.toHaveBeenCalled();
  });

  test('dragging moves the journal, saves once on release, brings it to front, and does not open it', () => {
    const { onOpenJournal, updateTaskListPosition } = renderDesk(lists);
    const work = cover('Work');

    fireEvent.pointerDown(work, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(work, { pointerId: 1, clientX: 150, clientY: 120 });
    fireEvent.pointerMove(work, { pointerId: 1, clientX: 200, clientY: 150 });
    // Follows the pointer during the drag, without saving yet
    expect(journalOnDesk('Work')).toHaveStyle({ left: `${0.5 * RANGE_X + 100}px`, top: `${0.5 * RANGE_Y + 50}px` });
    expect(journalOnDesk('Work')).toHaveClass('is-dragging');
    expect(updateTaskListPosition).not.toHaveBeenCalled();

    fireEvent.pointerUp(work, { pointerId: 1, clientX: 200, clientY: 150 });
    fireEvent.click(work);

    expect(updateTaskListPosition).toHaveBeenCalledTimes(1);
    const [id, position] = updateTaskListPosition.mock.calls[0];
    expect(id).toBe('a');
    expect(position.x).toBeCloseTo((0.5 * RANGE_X + 100) / RANGE_X);
    expect(position.y).toBeCloseTo((0.5 * RANGE_Y + 50) / RANGE_Y);
    expect(position.z).toBe(8); // above Home (z 7)
    expect(onOpenJournal).not.toHaveBeenCalled();
    expect(journalOnDesk('Work')).toHaveStyle({ zIndex: '9' });
  });

  test('a click after a drag opens the journal normally', () => {
    const { onOpenJournal } = renderDesk(lists);
    gesture(cover('Work'), [[200, 200]]);
    expect(onOpenJournal).not.toHaveBeenCalled();
    gesture(cover('Work'), []);
    expect(onOpenJournal).toHaveBeenCalledWith('a');
  });

  test('journals stay within the desk boundaries', () => {
    const { updateTaskListPosition } = renderDesk(lists);
    gesture(cover('Work'), [[5000, -5000]]);
    expect(updateTaskListPosition).toHaveBeenCalledWith('a', { x: 1, y: 0, z: 8 });
  });

  test('a cancelled drag does not save', () => {
    const { updateTaskListPosition } = renderDesk(lists);
    const work = cover('Work');
    fireEvent.pointerDown(work, { pointerId: 1, button: 0, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(work, { pointerId: 1, clientX: 300, clientY: 300 });
    fireEvent.pointerCancel(work, { pointerId: 1 });
    expect(updateTaskListPosition).not.toHaveBeenCalled();
    expect(journalOnDesk('Work')).toHaveStyle({ left: `${0.5 * RANGE_X}px` });
  });

  test('lists without saved positions get distinct default spots inside the desk', () => {
    renderDesk([
      { id: 'x1', name: 'One', createdAt: timestamp(1) },
      { id: 'x2', name: 'Two', createdAt: timestamp(2) },
      { id: 'x3', name: 'Three', createdAt: timestamp(3) },
    ]);
    const spots = ['One', 'Two', 'Three'].map((name) => {
      const { left, top } = journalOnDesk(name).style;
      return [parseFloat(left), parseFloat(top)];
    });
    spots.forEach(([left, top]) => {
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left).toBeLessThanOrEqual(RANGE_X);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(top).toBeLessThanOrEqual(RANGE_Y);
    });
    expect(new Set(spots.map(String)).size).toBe(3);
  });

  test('narrow screens show a tappable stack in activity order, without dragging', () => {
    useNarrowScreen();
    const { onOpenJournal, updateTaskListPosition } = renderDesk([
      { id: 'a', name: 'Older', lastActivityAt: timestamp(1), deskPosition: { x: 0.5, y: 0.5, z: 1 } },
      { id: 'b', name: 'Newer', lastActivityAt: timestamp(2) },
      { id: 'c', name: 'Stored', lastActivityAt: timestamp(3), onDesk: false },
    ]);
    const stack = document.querySelector('.journal-stack');
    const names = Array.from(stack.querySelectorAll('.journal-cover')).map((b) => b.textContent);
    expect(names).toEqual(['Newer', 'Older']); // put-away journals stay in the library

    gesture(within(stack).getByRole('button', { name: 'Open Older' }), [[300, 300]]);
    expect(updateTaskListPosition).not.toHaveBeenCalled();
    expect(onOpenJournal).toHaveBeenCalledWith('a');
  });

  test('New journal creates a task list with the trimmed name', () => {
    const { createTaskList } = renderDesk(lists);
    fireEvent.click(screen.getByRole('button', { name: '+ New journal' }));
    const input = screen.getByRole('textbox', { name: 'New journal name' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '  Ideas  ' } });
    fireEvent.submit(input.closest('form'));
    expect(createTaskList).toHaveBeenCalledWith('Ideas');
    expect(screen.getByRole('button', { name: '+ New journal' })).toBeInTheDocument();
  });

  test('New journal can be cancelled with Escape, and empty names are ignored', () => {
    const { createTaskList } = renderDesk(lists);
    fireEvent.click(screen.getByRole('button', { name: '+ New journal' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New journal name' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ New journal' }));
    fireEvent.submit(screen.getByRole('textbox', { name: 'New journal name' }).closest('form'));
    expect(createTaskList).not.toHaveBeenCalled();
  });
});

describe('journal titles', () => {
  const longName = 'Monkery Breath Gasoline Kaboof';

  test('the full title is available as a tooltip and accessible name on the desk', () => {
    renderDesk([{ id: 'a', name: longName, createdAt: timestamp(1) }]);
    const journalCover = cover(longName);
    expect(journalCover).toHaveAttribute('title', longName);
    expect(journalCover).toHaveAccessibleName(`Open ${longName}`);
    // The visible title sits in its own clamped element inside the label plate
    expect(journalCover.querySelector('.journal-label > .journal-title')).toHaveTextContent(longName);
  });

  test('the full title is available in the narrow stack and the library', () => {
    useNarrowScreen();
    renderDesk([{ id: 'a', name: longName, createdAt: timestamp(1) }]);
    const stackCover = within(document.querySelector('.journal-stack')).getByRole('button', { name: `Open ${longName}` });
    expect(stackCover).toHaveAttribute('title', longName);
    expect(stackCover.querySelector('.journal-title')).toHaveTextContent(longName);

    fireEvent.click(screen.getByRole('button', { name: 'Journal Library' }));
    const library = screen.getByRole('dialog', { name: 'Journal Library' });
    expect(within(library).getByText(longName)).toHaveAttribute('title', longName);
  });
});

describe('putting journals away', () => {
  const openMenu = (name) => fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));

  test('journals with onDesk: false are not on the desk; lists without the field are', () => {
    renderDesk([
      { id: 'a', name: 'Legacy', createdAt: timestamp(1) },
      { id: 'b', name: 'Shown', createdAt: timestamp(2), onDesk: true },
      { id: 'c', name: 'Stored', createdAt: timestamp(3), onDesk: false },
    ]);
    expect(queryCover('Legacy')).toBeInTheDocument();
    expect(queryCover('Shown')).toBeInTheDocument();
    expect(queryCover('Stored')).not.toBeInTheDocument();
  });

  test('the journal menu puts a journal away', () => {
    const { setTaskListOnDesk, onOpenJournal } = renderDesk(lists);
    openMenu('Work');
    const menu = screen.getByRole('menu', { name: 'Work actions' });
    expect(within(menu).getByRole('menuitem', { name: 'Open' })).toHaveFocus();

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Put away' }));
    expect(setTaskListOnDesk).toHaveBeenCalledWith('a', false);
    expect(onOpenJournal).not.toHaveBeenCalled();
    expect(queryCover('Work')).not.toBeInTheDocument();
    expect(queryCover('Home')).toBeInTheDocument();
  });

  test('the journal menu can open the journal, and closes with Escape', () => {
    const { onOpenJournal } = renderDesk(lists);
    openMenu('Work');
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Work' })).toHaveFocus();

    openMenu('Work');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onOpenJournal).toHaveBeenCalledWith('a');
  });

  test('opening the menu does not start a drag or open the journal', () => {
    const { onOpenJournal, updateTaskListPosition } = renderDesk(lists);
    gesture(screen.getByRole('button', { name: 'Actions for Work' }), [[300, 300]]);
    expect(updateTaskListPosition).not.toHaveBeenCalled();
    expect(onOpenJournal).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  test('clicking elsewhere closes the menu', () => {
    renderDesk(lists);
    openMenu('Work');
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('putting away an unmoved journal does not shift the others', () => {
    renderDesk([
      { id: 'x1', name: 'One', createdAt: timestamp(1) },
      { id: 'x2', name: 'Two', createdAt: timestamp(2) },
      { id: 'x3', name: 'Three', createdAt: timestamp(3) },
    ]);
    const before = journalOnDesk('Three').style.left;
    openMenu('One');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Put away' }));
    expect(journalOnDesk('Three').style.left).toBe(before);
  });

  test('an empty desk explains how to bring journals back', () => {
    renderDesk([{ id: 'a', name: 'Stored', createdAt: timestamp(1), onDesk: false }]);
    expect(screen.getByText(/Your desk is clear/)).toBeInTheDocument();
  });
});

describe('Journal Library', () => {
  const openLibrary = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Journal Library' }));
    return screen.getByRole('dialog', { name: 'Journal Library' });
  };
  const libraryNames = (library) =>
    Array.from(library.querySelectorAll('.library-item-name')).map((el) => el.textContent);

  const collection = [
    { id: 'a', name: 'Garden', lastActivityAt: timestamp(1), deskPosition: { x: 0.2, y: 0.3, z: 2 } },
    { id: 'b', name: 'Work', lastActivityAt: timestamp(3) },
    { id: 'c', name: 'Gift ideas', lastActivityAt: timestamp(2), onDesk: false, deskPosition: { x: 0.7, y: 0.4, z: 5 } },
  ];

  test('lists every journal by most recent activity, with its desk status', () => {
    renderDesk(collection);
    const library = openLibrary();
    expect(libraryNames(library)).toEqual(['Work', 'Gift ideas', 'Garden']);
    expect(within(library).getByRole('button', { name: 'Place Gift ideas on desk' })).toBeInTheDocument();
    expect(within(library).getByRole('button', { name: 'Put away Work' })).toBeInTheDocument();
    expect(within(library).getAllByText('Put away', { selector: '.library-item-status' })).toHaveLength(1);
  });

  test('search filters journals by name, case-insensitively', () => {
    renderDesk(collection);
    const library = openLibrary();
    const search = within(library).getByRole('searchbox', { name: 'Search journals' });
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: '  gI ' } });
    expect(libraryNames(library)).toEqual(['Gift ideas']);

    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(within(library).getByText('No journals match that name.')).toBeInTheDocument();
  });

  test('placing a journal back on the desk restores it at its saved position', () => {
    const { setTaskListOnDesk, updateTaskListPosition } = renderDesk(collection);
    expect(queryCover('Gift ideas')).not.toBeInTheDocument();

    const library = openLibrary();
    fireEvent.click(within(library).getByRole('button', { name: 'Place Gift ideas on desk' }));

    expect(setTaskListOnDesk).toHaveBeenCalledWith('c', true);
    expect(updateTaskListPosition).not.toHaveBeenCalled();
    expect(journalOnDesk('Gift ideas')).toHaveStyle({ left: `${0.7 * RANGE_X}px`, top: `${0.4 * RANGE_Y}px`, zIndex: '6' });
    expect(within(library).getByRole('button', { name: 'Put away Gift ideas' })).toBeInTheDocument();
  });

  test('put away and restore round-trips a moved journal to the same spot', () => {
    renderDesk(collection);
    const before = journalOnDesk('Garden').getAttribute('style');
    const library = openLibrary();
    fireEvent.click(within(library).getByRole('button', { name: 'Put away Garden' }));
    expect(queryCover('Garden')).not.toBeInTheDocument();
    fireEvent.click(within(library).getByRole('button', { name: 'Place Garden on desk' }));
    expect(journalOnDesk('Garden').getAttribute('style')).toBe(before);
  });

  test('a journal can be opened from the library, even when put away', () => {
    const { onOpenJournal } = renderDesk(collection);
    const library = openLibrary();
    fireEvent.click(within(library).getByRole('button', { name: 'Open Gift ideas' }));
    expect(onOpenJournal).toHaveBeenCalledWith('c');
  });

  test('the library closes with Escape, the close button, or the backdrop, returning focus', () => {
    renderDesk(collection);
    const libraryButton = screen.getByRole('button', { name: 'Journal Library' });

    openLibrary();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(libraryButton).toHaveFocus();

    const library = openLibrary();
    fireEvent.click(within(library).getByRole('button', { name: 'Close library' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    openLibrary();
    fireEvent.click(document.querySelector('.library-backdrop'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('the library is available on narrow screens', () => {
    useNarrowScreen();
    const { setTaskListOnDesk } = renderDesk(collection);
    const library = openLibrary();
    fireEvent.click(within(library).getByRole('button', { name: 'Place Gift ideas on desk' }));
    expect(setTaskListOnDesk).toHaveBeenCalledWith('c', true);
    const stack = document.querySelector('.journal-stack');
    expect(within(stack).getByRole('button', { name: 'Open Gift ideas' })).toBeInTheDocument();
  });
});

describe('deleting journals', () => {
  const journals = [
    { id: 'default-id', name: 'Default Task List', createdAt: timestamp(1) },
    { id: 'a', name: 'Work', createdAt: timestamp(2), deskPosition: { x: 0.5, y: 0.5, z: 1 } },
    { id: 'b', name: 'Stored', createdAt: timestamp(3), onDesk: false },
  ];
  const openMenu = (name) => fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  const startDeleteFromMenu = (name) => {
    openMenu(name);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    return screen.getByRole('alertdialog');
  };
  const openLibrary = () => {
    fireEvent.click(screen.getByRole('button', { name: 'Journal Library' }));
    return screen.getByRole('dialog', { name: 'Journal Library' });
  };
  // Lets the dialog's async confirm settle
  const flush = () => act(async () => {});

  test('the confirmation names the journal and says its tasks are permanently deleted', () => {
    renderDesk(journals);
    const dialog = startDeleteFromMenu('Work');
    expect(dialog).toHaveAccessibleName('Delete “Work”?');
    expect(dialog).toHaveAccessibleDescription(/permanently deletes the journal and all of its tasks/);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  test('Cancel, Escape, and the backdrop leave everything unchanged', () => {
    const { deleteTaskList } = renderDesk(journals);

    fireEvent.click(within(startDeleteFromMenu('Work')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    startDeleteFromMenu('Work');
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    startDeleteFromMenu('Work');
    fireEvent.click(document.querySelector('.dialog-backdrop'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    expect(deleteTaskList).not.toHaveBeenCalled();
    expect(queryCover('Work')).toBeInTheDocument();
  });

  test('confirming deletes the journal and removes it from the desk and library', async () => {
    const { deleteTaskList } = renderDesk(journals);
    const dialog = startDeleteFromMenu('Work');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete journal' }));
    await flush();

    expect(deleteTaskList).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(queryCover('Work')).not.toBeInTheDocument();
    expect(within(openLibrary()).queryByText('Work')).not.toBeInTheDocument();
  });

  test('a put-away journal can be deleted from the library without closing it', async () => {
    const { deleteTaskList } = renderDesk(journals);
    const library = openLibrary();
    fireEvent.click(within(library).getByRole('button', { name: 'Delete Stored' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete journal' }));
    await flush();

    expect(deleteTaskList).toHaveBeenCalledWith('b');
    expect(within(library).queryByText('Stored')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Journal Library' })).toBeInTheDocument();
  });

  test('Escape in the confirmation does not also close the library', () => {
    renderDesk(journals);
    fireEvent.click(within(openLibrary()).getByRole('button', { name: 'Delete Stored' }));
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Journal Library' })).toBeInTheDocument();
  });

  test('while deleting, the dialog shows progress and cannot be dismissed', async () => {
    const { deleteTaskList } = renderDesk(journals);
    let finish;
    deleteTaskList.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const dialog = startDeleteFromMenu('Work');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete journal' }));

    expect(within(dialog).getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('.dialog-backdrop'));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await act(async () => finish());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test('a Firestore failure keeps the journal and the dialog open with an error, and can be retried', async () => {
    const { deleteTaskList } = renderDesk(journals);
    deleteTaskList.mockRejectedValueOnce(new Error('unavailable'));
    const dialog = startDeleteFromMenu('Work');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete journal' }));
    await flush();

    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Couldn't delete this journal/);
    expect(within(dialog).getByRole('button', { name: 'Delete journal' })).toBeEnabled();
    expect(queryCover('Work')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete journal' }));
    await flush();
    expect(deleteTaskList).toHaveBeenCalledTimes(2);
    expect(queryCover('Work')).not.toBeInTheDocument();
  });

  test('a refusal from the context shows its own message', async () => {
    const { deleteTaskList } = renderDesk(journals);
    deleteTaskList.mockRejectedValueOnce(Object.assign(new Error('busy'), { userMessage: 'Still saving, try again.' }));
    const dialog = startDeleteFromMenu('Work');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete journal' }));
    await flush();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Still saving, try again.');
  });

  test('the Default Task List offers no Delete action on the desk or in the library', () => {
    renderDesk(journals);
    openMenu('Default Task List');
    expect(screen.getByRole('menuitem', { name: 'Put away' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Delete…' })).not.toBeInTheDocument();

    const library = openLibrary();
    expect(within(library).queryByRole('button', { name: 'Delete Default Task List' })).not.toBeInTheDocument();
    expect(within(library).getByRole('button', { name: 'Delete Work' })).toBeInTheDocument();
  });

  test('no journal can be deleted until the Default Task List is known', () => {
    renderDesk(journals, { defaultTaskListId: null });
    openMenu('Work');
    expect(screen.queryByRole('menuitem', { name: 'Delete…' })).not.toBeInTheDocument();
  });

  test('Put away stays separate from Delete', () => {
    const { deleteTaskList, setTaskListOnDesk } = renderDesk(journals);
    openMenu('Work');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Put away' }));
    expect(setTaskListOnDesk).toHaveBeenCalledWith('a', false);
    expect(deleteTaskList).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  test('New journal refuses the reserved Default name and keeps the form open', () => {
    const { createTaskList } = renderDesk(journals);
    fireEvent.click(screen.getByRole('button', { name: '+ New journal' }));
    const input = screen.getByRole('textbox', { name: 'New journal name' });
    fireEvent.change(input, { target: { value: '  DEFAULT task list ' } });
    fireEvent.submit(input.closest('form'));

    expect(createTaskList).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/reserved/);
    expect(input).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(input, { target: { value: 'Default Task List ideas' } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.submit(input.closest('form'));
    expect(createTaskList).toHaveBeenCalledWith('Default Task List ideas');
  });
});
