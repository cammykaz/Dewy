import React, { createContext, useContext, useState } from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import Desk, { DESK_JOURNAL_COUNT } from './Desk';
import { SHELF_SEARCH_THRESHOLD } from './Bookshelf';
import { useTasks } from '../context/TasksContext';

jest.mock('../context/TasksContext', () => ({ useTasks: jest.fn() }));
jest.mock('./TaskManager', () => () => <div>Task manager</div>);

const timestamp = (ms) => ({ toMillis: () => ms });

// Stand-in for TasksContext that keeps taskLists in state, so the desk and shelf update as they
// would in the app. Picking a journal up records lastPickedUpAt, as markTaskListPickedUp does.
const FakeTasks = createContext(null);
let clock = 1000;
function FakeTasksProvider({ initialLists, defaultTaskListId, spies, children }) {
  const [taskLists, setTaskLists] = useState(initialLists);
  const pickUp = (id) => {
    clock += 1;
    setTaskLists((lists) => lists.map((l) => (l.id === id ? { ...l, lastPickedUpAt: timestamp(clock) } : l)));
  };
  const value = {
    taskLists,
    defaultTaskListId,
    createTaskList: spies.createTaskList,
    markTaskListPickedUp: pickUp,
    takeDownTaskList: (id) => { spies.takeDownTaskList(id); pickUp(id); },
    // Like the real context: removes the list only once deletion succeeds; rejects otherwise
    deleteTaskList: async (id) => {
      await spies.deleteTaskList(id);
      setTaskLists((lists) => lists.filter((l) => l.id !== id));
    },
  };
  return <FakeTasks.Provider value={value}>{children}</FakeTasks.Provider>;
}

// Opens and closes journals the way App does (App keeps which journal is open)
function DeskThatOpens({ onOpenJournal, onCloseJournal }) {
  const { markTaskListPickedUp } = useTasks();
  const [openId, setOpenId] = useState(null);
  return (
    <Desk
      openJournalId={openId}
      onOpenJournal={(id) => { onOpenJournal(id); markTaskListPickedUp(id); setOpenId(id); }}
      onCloseJournal={() => { onCloseJournal(); setOpenId(null); }}
    />
  );
}

const renderDesk = (taskLists, { defaultTaskListId = 'default-id' } = {}) => {
  const spies = { createTaskList: jest.fn(), takeDownTaskList: jest.fn(), deleteTaskList: jest.fn(async () => {}) };
  useTasks.mockImplementation(() => useContext(FakeTasks));
  const onOpenJournal = jest.fn();
  const onCloseJournal = jest.fn();
  render(
    <FakeTasksProvider initialLists={taskLists} defaultTaskListId={defaultTaskListId} spies={spies}>
      <DeskThatOpens onOpenJournal={onOpenJournal} onCloseJournal={onCloseJournal} />
    </FakeTasksProvider>
  );
  return { ...spies, onOpenJournal, onCloseJournal };
};

const deskNames = () =>
  [...document.querySelectorAll('.desk .journal-cover')].map((el) => el.getAttribute('title'));
const shelfNames = () =>
  [...document.querySelectorAll('.bookshelf .spine')].map((el) => el.getAttribute('title'));
const shelf = () => screen.getByRole('region', { name: 'Bookshelf' });
const spine = (name) => within(shelf()).getByRole('button', { name: `Take ${name} down to the desk` });
const cover = (name) => within(document.querySelector('.desk')).getByRole('button', { name: `Open ${name}` });
const openJournal = () => screen.queryByRole('dialog');

// Six lists, most recently used first: F (opened recently), E, D, C, B, A
const sixLists = [
  { id: 'a', name: 'A', createdAt: timestamp(1) },
  { id: 'b', name: 'B', createdAt: timestamp(2) },
  { id: 'c', name: 'C', createdAt: timestamp(3) },
  { id: 'd', name: 'D', createdAt: timestamp(4), lastActivityAt: timestamp(40) },
  { id: 'e', name: 'E', createdAt: timestamp(5), lastActivityAt: timestamp(50) },
  { id: 'f', name: 'F', createdAt: timestamp(6), lastPickedUpAt: timestamp(60) },
];

describe('desk and shelf', () => {
  test(`the ${DESK_JOURNAL_COUNT} most recently used journals lie on the desk; the rest are shelved`, () => {
    renderDesk(sixLists);
    expect(deskNames()).toEqual(['F', 'E', 'D']);
    expect(shelfNames()).toEqual(['C', 'B', 'A']);
  });

  test('both planning activity and opening count as use', () => {
    renderDesk([
      { id: 'a', name: 'Planned', createdAt: timestamp(1), lastActivityAt: timestamp(30) },
      { id: 'b', name: 'Opened', createdAt: timestamp(2), lastPickedUpAt: timestamp(20) },
      { id: 'c', name: 'New', createdAt: timestamp(10) },
      { id: 'd', name: 'Old', createdAt: timestamp(5) },
    ]);
    expect(deskNames()).toEqual(['Planned', 'Opened', 'New']);
    expect(shelfNames()).toEqual(['Old']);
  });

  test('clicking a spine takes the journal down without opening it; the least recent desk journal is shelved', () => {
    const { onOpenJournal, takeDownTaskList } = renderDesk(sixLists);
    fireEvent.click(spine('B'));
    expect(onOpenJournal).not.toHaveBeenCalled();
    expect(takeDownTaskList).toHaveBeenCalledWith('b'); // the undoable action
    expect(deskNames()).toEqual(['B', 'F', 'E']);
    expect(shelfNames()).toEqual(['D', 'C', 'A']);
  });

  test('a journal taken down lands with focus, ready to open with Enter', () => {
    const { onOpenJournal } = renderDesk(sixLists);
    fireEvent.click(spine('B'));
    const landed = cover('B');
    expect(landed).toHaveFocus();
    expect(landed.closest('.journal')).toHaveClass('is-arriving');
    expect(cover('F').closest('.journal')).not.toHaveClass('is-arriving');

    fireEvent.click(landed);
    expect(onOpenJournal).toHaveBeenCalledWith('b');
  });

  test('opening a desk journal opens it and keeps it on the desk', () => {
    const { onOpenJournal } = renderDesk(sixLists);
    fireEvent.click(cover('D'));
    expect(onOpenJournal).toHaveBeenCalledWith('d');
    expect(openJournal()).toHaveAccessibleName('D');
    expect(deskNames()).toEqual(['D', 'F', 'E']);
    expect(shelfNames()).toEqual(['C', 'B', 'A']);
  });

  test('with only a few journals the shelf is empty and says so', () => {
    renderDesk(sixLists.slice(0, 2));
    expect(deskNames()).toHaveLength(2);
    expect(within(shelf()).getByText('Older journals will rest here.')).toBeInTheDocument();
  });

  test('with no journals, the desk invites starting one', () => {
    renderDesk([]);
    expect(screen.getByText('Your desk is clear. Start a new journal.')).toBeInTheDocument();
  });

  test('saved desk positions and put-away flags from the old desk are ignored', () => {
    renderDesk([
      { id: 'a', name: 'Was put away', createdAt: timestamp(3), onDesk: false },
      { id: 'b', name: 'Was dragged', createdAt: timestamp(2), deskPosition: { x: 0.9, y: 0.9, z: 8 } },
    ]);
    expect(deskNames()).toEqual(['Was put away', 'Was dragged']);
    expect(document.querySelector('.journal').style.left).toBe('');
  });

  test('deleting a desk journal brings the most recent shelved journal down without reordering the rest', async () => {
    renderDesk(sixLists);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for E' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete journal' }));
    await act(async () => {});
    expect(deskNames()).toEqual(['F', 'D', 'C']);
    expect(shelfNames()).toEqual(['B', 'A']);
  });
});

describe('a journal open as a lightbox', () => {
  test('shows its tasks under its title, over the desk and shelf, which stay in view but out of use', () => {
    renderDesk(sixLists);
    expect(openJournal()).not.toBeInTheDocument();
    fireEvent.click(cover('E'));

    const journal = openJournal();
    expect(journal).toHaveAttribute('aria-modal', 'true');
    expect(within(journal).getByRole('heading', { name: 'E' })).toHaveFocus();
    expect(within(journal).getByText('Task manager')).toBeInTheDocument();
    expect(deskNames()).toEqual(['E', 'F', 'D']);
    expect(shelfNames()).toEqual(['C', 'B', 'A']);
    expect(document.querySelector('.desk-room')).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
  });

  test('Close lays it back on the desk, returns focus to its cover, and frees the room', () => {
    const { onCloseJournal } = renderDesk(sixLists);
    fireEvent.click(cover('E'));
    fireEvent.click(screen.getByRole('button', { name: 'Close E' }));
    expect(onCloseJournal).toHaveBeenCalledTimes(1);
    expect(openJournal()).not.toBeInTheDocument();
    expect(cover('E')).toHaveFocus();
    expect(document.querySelector('.desk-room')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
  });

  test('clicking the blurred desk around the journal lays it down; clicking inside does not', () => {
    const { onCloseJournal } = renderDesk(sixLists);
    fireEvent.click(cover('E'));
    fireEvent.click(within(openJournal()).getByText('Task manager'));
    expect(onCloseJournal).not.toHaveBeenCalled();

    fireEvent.click(document.querySelector('.journal-scrim'));
    expect(onCloseJournal).toHaveBeenCalledTimes(1);
    expect(openJournal()).not.toBeInTheDocument();
  });

  test('Escape closes it, but not while typing or in a dropdown', () => {
    const { onCloseJournal } = renderDesk(sixLists);
    fireEvent.click(cover('E'));
    const input = document.createElement('input');
    const select = document.createElement('select');
    openJournal().append(input, select);

    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(select, { key: 'Escape' });
    expect(onCloseJournal).not.toHaveBeenCalled();

    fireEvent.keyDown(openJournal(), { key: 'Escape' });
    expect(onCloseJournal).toHaveBeenCalledTimes(1);
    expect(openJournal()).not.toBeInTheDocument();
  });

  test('Tab stays within the journal', () => {
    renderDesk(sixLists);
    fireEvent.click(cover('E'));
    const close = screen.getByRole('button', { name: 'Close E' });
    const extra = document.createElement('button');
    openJournal().querySelector('.open-journal-page').append(extra);

    extra.focus();
    fireEvent.keyDown(extra, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(extra).toHaveFocus();
  });
});

describe('shelf search', () => {
  const manyLists = Array.from({ length: DESK_JOURNAL_COUNT + SHELF_SEARCH_THRESHOLD + 1 }, (_, i) => ({
    id: `list${i}`,
    name: `Journal ${i}`,
    createdAt: timestamp(100 - i),
  }));

  test('is hidden while the shelf is small', () => {
    renderDesk(sixLists);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument();
  });

  test('appears with many shelved journals and filters spines by name, case-insensitively', () => {
    renderDesk(manyLists);
    const search = screen.getByRole('searchbox', { name: 'Search the shelf' });
    fireEvent.change(search, { target: { value: 'journal 1' } });
    expect(shelfNames().every((name) => name.toLowerCase().includes('journal 1'))).toBe(true);
    expect(shelfNames().length).toBeGreaterThan(0);

    fireEvent.change(search, { target: { value: 'nothing like this' } });
    expect(shelfNames()).toEqual([]);
    expect(screen.getByText('No shelved journals match that name.')).toBeInTheDocument();
  });
});

describe('journal titles', () => {
  const longName = 'Monkery Breath Gasoline Kaboof';

  test('the full title is a tooltip and accessible name on the desk', () => {
    renderDesk([{ id: 'a', name: longName, createdAt: timestamp(1) }]);
    const journalCover = cover(longName);
    expect(journalCover).toHaveAttribute('title', longName);
    expect(journalCover).toHaveAccessibleName(`Open ${longName}`);
    expect(journalCover.querySelector('.journal-label > .journal-title')).toHaveTextContent(longName);
  });

  test('the full title is a tooltip and accessible name on a spine', () => {
    renderDesk([...sixLists, { id: 'z', name: longName, createdAt: timestamp(0) }]);
    expect(spine(longName)).toHaveAttribute('title', longName);
    expect(spine(longName).querySelector('.spine-title')).toHaveTextContent(longName);
  });
});

describe('new journal', () => {
  test('creates a task list with the trimmed name', () => {
    const { createTaskList } = renderDesk(sixLists);
    fireEvent.click(screen.getByRole('button', { name: '+ New journal' }));
    const input = screen.getByRole('textbox', { name: 'New journal name' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '  Ideas  ' } });
    fireEvent.submit(input.closest('form'));
    expect(createTaskList).toHaveBeenCalledWith('Ideas');
    expect(screen.getByRole('button', { name: '+ New journal' })).toBeInTheDocument();
  });

  test('can be cancelled with Escape, and empty names are ignored', () => {
    const { createTaskList } = renderDesk(sixLists);
    fireEvent.click(screen.getByRole('button', { name: '+ New journal' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'New journal name' }), { key: 'Escape' });
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '+ New journal' }));
    fireEvent.submit(screen.getByRole('textbox', { name: 'New journal name' }).closest('form'));
    expect(createTaskList).not.toHaveBeenCalled();
  });

  test('refuses the reserved Default name and keeps the form open', () => {
    const { createTaskList } = renderDesk(sixLists);
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

describe('deleting journals', () => {
  const journals = [
    { id: 'default-id', name: 'Default Task List', createdAt: timestamp(1) },
    { id: 'a', name: 'Work', createdAt: timestamp(2) },
  ];
  const startDelete = (name) => {
    fireEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete…' }));
    return screen.getByRole('alertdialog');
  };
  const queryCover = (name) => within(document.querySelector('.desk')).queryByRole('button', { name: `Open ${name}` });
  const flush = () => act(async () => {}); // lets the dialog's async confirm settle

  test('the journal menu can open the journal, and closes with Escape or a click elsewhere', () => {
    const { onOpenJournal } = renderDesk(journals);
    fireEvent.click(screen.getByRole('button', { name: 'Actions for Work' }));
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Work' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Work' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Actions for Work' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open' }));
    expect(onOpenJournal).toHaveBeenCalledWith('a');
  });

  test('the confirmation names the journal and says its tasks are permanently deleted', () => {
    renderDesk(journals);
    const dialog = startDelete('Work');
    expect(dialog).toHaveAccessibleName('Delete “Work”?');
    expect(dialog).toHaveAccessibleDescription(/permanently deletes the journal and all of its tasks/);
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus();
  });

  test('Cancel, Escape, and the backdrop leave everything unchanged', () => {
    const { deleteTaskList } = renderDesk(journals);

    fireEvent.click(within(startDelete('Work')).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    startDelete('Work');
    fireEvent.keyDown(document.activeElement, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    startDelete('Work');
    fireEvent.click(document.querySelector('.dialog-backdrop'));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    expect(deleteTaskList).not.toHaveBeenCalled();
    expect(queryCover('Work')).toBeInTheDocument();
  });

  test('confirming deletes the journal and removes it from the desk', async () => {
    const { deleteTaskList } = renderDesk(journals);
    fireEvent.click(within(startDelete('Work')).getByRole('button', { name: 'Delete journal' }));
    await flush();

    expect(deleteTaskList).toHaveBeenCalledWith('a');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(queryCover('Work')).not.toBeInTheDocument();
  });

  test('while deleting, the dialog shows progress and cannot be dismissed', async () => {
    const { deleteTaskList } = renderDesk(journals);
    let finish;
    deleteTaskList.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const dialog = startDelete('Work');
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
    const dialog = startDelete('Work');
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
    const dialog = startDelete('Work');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete journal' }));
    await flush();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Still saving, try again.');
  });

  test('the Default Task List has no delete menu', () => {
    renderDesk(journals);
    expect(screen.queryByRole('button', { name: 'Actions for Default Task List' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Actions for Work' })).toBeInTheDocument();
  });

  test('no journal can be deleted until the Default Task List is known', () => {
    renderDesk(journals, { defaultTaskListId: null });
    expect(screen.queryByRole('button', { name: 'Actions for Work' })).not.toBeInTheDocument();
  });
});
