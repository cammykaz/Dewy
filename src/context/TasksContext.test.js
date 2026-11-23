import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, serverTimestamp, writeBatch, setDoc, deleteField } from 'firebase/firestore';
import { TasksProvider, useTasks } from './TasksContext';
import TaskManager from '../components/TaskManager';

jest.mock('../firebaseConfig', () => ({ db: {} }));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  addDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  where: jest.fn(),
  serverTimestamp: jest.fn(),
  writeBatch: jest.fn(),
  setDoc: jest.fn(),
  deleteField: jest.fn(),
}));

// CRA's Jest config resets mocks before each test, so set implementations here
beforeEach(() => {
  collection.mockImplementation((db, path) => ({ path }));
  doc.mockImplementation((db, path, id) => ({ path: `${path}/${id}` }));
  updateDoc.mockResolvedValue();
  deleteDoc.mockResolvedValue();
  serverTimestamp.mockReturnValue('SERVER_TIMESTAMP');
  setDoc.mockResolvedValue();
  deleteField.mockReturnValue('DELETE_FIELD');
  localStorage.clear();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
});

let ctx;
function ContextProbe() {
  ctx = useTasks();
  return null;
}

const app = (userId) => (
  <TasksProvider userId={userId}>
    <ContextProbe />
    <TaskManager />
  </TasksProvider>
);

// Same task shape TaskSubmission creates (jsdom doesn't support its form.taskName lookups)
let tempCounter = 0;
const addGuestTask = (name) => act(() => {
  ctx.addTask({ id: `temp-${tempCounter++}`, name, impact: 'Monumental', time: '10 Minutes', createdAt: new Date() });
});

const rowFor = (name) => screen.getByRole('button', { name: `Edit task name: ${name}` }).closest('.task-row');

test('guests can create, edit, complete, and delete tasks without touching Firestore', () => {
  render(app(undefined));

  addGuestTask('Guest task');
  expect(ctx.tasks).toHaveLength(1);

  // Edit impact (Minimal / 10 Minutes = K)
  fireEvent.change(rowFor('Guest task').querySelector('select[name="impact"]'), { target: { value: 'Minimal' } });
  expect(ctx.tasks[0]).toMatchObject({ impact: 'Minimal', priority: 'K' });

  // Edit name inline
  fireEvent.click(screen.getByRole('button', { name: 'Edit task name: Guest task' }));
  const input = screen.getByRole('textbox', { name: 'Task name' });
  fireEvent.change(input, { target: { value: 'Renamed' } });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(ctx.tasks[0].name).toBe('Renamed');

  // Complete
  fireEvent.click(rowFor('Renamed').querySelector('input[type="checkbox"]'));
  expect(ctx.tasks[0].isDone).toBe(true);
  expect(rowFor('Renamed')).toHaveClass('done');

  // Delete
  fireEvent.click(screen.getByRole('button', { name: 'Delete task' }));
  expect(ctx.tasks).toHaveLength(0);

  expect(addDoc).not.toHaveBeenCalled();
  expect(updateDoc).not.toHaveBeenCalled();
});

test('rapid successive updates in the same tick all apply', () => {
  render(app(undefined));
  addGuestTask('Task');
  const id = ctx.tasks[0].id;

  act(() => {
    ctx.updateTask(id, { impact: 'Minimal' });
    ctx.updateTask(id, { time: '2 Hours' });
    ctx.toggleTaskDone(id, true);
  });

  expect(ctx.tasks[0]).toMatchObject({ impact: 'Minimal', time: '2 Hours', isDone: true, priority: 'P' });
});

test('guest edits made while the login sync is in flight are saved to Firestore', async () => {
  const firestoreTasks = [];
  getDocs.mockImplementation(async (ref) => {
    if (ref.path === 'users/u1/taskLists') {
      return { docs: [{ id: 'list1', data: () => ({ name: 'Default Task List' }) }] };
    }
    return { docs: firestoreTasks.map((t) => ({ id: t.id, data: () => t })) };
  });
  let resolveAddDoc;
  addDoc.mockImplementation((ref, data) => new Promise((resolve) => {
    resolveAddDoc = () => {
      firestoreTasks.push({ ...data, id: 'doc1' });
      resolve({ id: 'doc1' });
    };
  }));
  updateDoc.mockImplementation(async (ref, changes) => {
    if (ref.path !== 'users/u1/taskLists/list1') Object.assign(firestoreTasks[0], changes); // skip list activity writes
  });

  const { rerender } = render(app(undefined));
  addGuestTask('Guest task');

  // Log in: the pre-login task starts syncing
  rerender(app('u1'));
  await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));

  // Edit the task while addDoc is still pending
  act(() => {
    ctx.updateTask(ctx.tasks[0].id, { name: 'Edited during sync' });
  });

  await act(async () => resolveAddDoc());
  await waitFor(() => expect(ctx.tasks[0].id).toBe('doc1'));

  expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { id: 'doc1', name: 'Edited during sync' });
  // Final state comes from Firestore (fetchTasks), and it includes the edit
  expect(ctx.tasks[0].name).toBe('Edited during sync');

  // Later edits to a synced task write only the changed fields
  updateDoc.mockClear();
  await act(async () => {
    await ctx.updateTask('doc1', { impact: 'Minimal' });
  });
  expect(updateDoc).toHaveBeenCalledWith(
    { path: 'users/u1/taskLists/list1/tasks/doc1' },
    { impact: 'Minimal', priority: 'K' }
  );
});

describe('task list activity (lastActivityAt)', () => {
  const LIST_PATH = 'users/u1/taskLists/list1';
  const listActivityWrites = (path = LIST_PATH) =>
    updateDoc.mock.calls.filter(([ref]) => ref.path === path);
  const list = (id) => ctx.taskLists.find((l) => l.id === id);

  // Logged-in user with two lists; list1 (Default) is active and holds one task
  const renderLoggedIn = async () => {
    getDocs.mockImplementation(async (ref) => {
      if (ref.path === 'users/u1/taskLists') {
        return {
          docs: [
            { id: 'list1', data: () => ({ name: 'Default Task List' }) },
            { id: 'list2', data: () => ({ name: 'Work' }) },
          ],
        };
      }
      if (ref.path === `${LIST_PATH}/tasks`) {
        const task = { id: 't1', name: 'Existing', impact: 'Medium', time: '10 Minutes', priority: 'I' };
        return { docs: [{ id: 't1', data: () => task }] };
      }
      return { docs: [] };
    });
    addDoc.mockResolvedValue({ id: 'new1' });
    render(app('u1'));
    await waitFor(() => expect(ctx.tasks).toHaveLength(1));
    expect(ctx.activeTaskListId).toBe('list1');
    updateDoc.mockClear();
  };

  test('adding a task marks its list active immediately, before the task is saved', async () => {
    await renderLoggedIn();
    let resolveAddDoc;
    addDoc.mockImplementation(() => new Promise((resolve) => { resolveAddDoc = resolve; }));

    act(() => {
      ctx.addTask({ id: 'temp-x', name: 'New', impact: 'Minimal', time: '10 Minutes', createdAt: new Date() });
    });

    expect(list('list1').lastActivityAt).toBeInstanceOf(Date);
    expect(list('list2').lastActivityAt).toBeUndefined();
    expect(listActivityWrites()).toEqual([[{ path: LIST_PATH }, { lastActivityAt: 'SERVER_TIMESTAMP' }]]);

    await act(async () => resolveAddDoc({ id: 'new1' }));
  });

  test.each([
    ['impact', { impact: 'Minimal' }],
    ['time', { time: '2 Hours' }],
  ])('changing a task\'s %s marks the list active', async (_, change) => {
    await renderLoggedIn();
    await act(async () => { await ctx.updateTask('t1', change); });
    expect(list('list1').lastActivityAt).toBeInstanceOf(Date);
    expect(listActivityWrites()).toHaveLength(1);
  });

  test.each([
    ['renaming a task', () => ctx.updateTask('t1', { name: 'Renamed' })],
    ['completing a task', () => ctx.toggleTaskDone('t1', true)],
    ['uncompleting a task', () => ctx.toggleTaskDone('t1', false)],
    ['re-saving an unchanged impact', () => ctx.updateTask('t1', { impact: 'Medium' })],
    ['re-saving an unchanged time', () => ctx.updateTask('t1', { time: '10 Minutes' })],
    ['deleting a task', () => ctx.deleteTask('t1')],
    ['switching lists', () => ctx.setActiveTaskListId('list2')],
  ])('%s does not mark any list active', async (_, action) => {
    await renderLoggedIn();
    await act(async () => { await action(); });
    await waitFor(() => {}); // let any list-switch fetch settle
    expect(ctx.taskLists.every((l) => l.lastActivityAt === undefined)).toBe(true);
    expect(listActivityWrites()).toHaveLength(0);
    expect(listActivityWrites('users/u1/taskLists/list2')).toHaveLength(0);
  });

  test('opening a journal records lastPickedUpAt only, without recording planning activity', async () => {
    await renderLoggedIn();
    act(() => { ctx.markTaskListPickedUp('list2'); });
    expect(list('list2').lastPickedUpAt).toBeInstanceOf(Date);
    expect(list('list2').lastActivityAt).toBeUndefined();
    expect(updateDoc).toHaveBeenCalledTimes(1);
    expect(updateDoc).toHaveBeenCalledWith(
      { path: 'users/u1/taskLists/list2' },
      { lastPickedUpAt: expect.anything() }
    );
    expect(Object.keys(updateDoc.mock.calls[0][1])).toEqual(['lastPickedUpAt']);
    expect(ctx.tasks).toHaveLength(1); // the active list's tasks are untouched
  });

  test('guests do not write activity to Firestore', () => {
    render(app(undefined));
    addGuestTask('Guest task');
    act(() => { ctx.updateTask(ctx.tasks[0].id, { impact: 'Minimal' }); });
    expect(updateDoc).not.toHaveBeenCalled();
  });

  test('syncing guest tasks at login marks the default list once', async () => {
    const firestoreTasks = [];
    getDocs.mockImplementation(async (ref) => {
      if (ref.path === 'users/u1/taskLists') {
        return { docs: [{ id: 'list1', data: () => ({ name: 'Default Task List' }) }] };
      }
      return { docs: firestoreTasks.map((t) => ({ id: t.id, data: () => t })) };
    });
    let nextId = 0;
    addDoc.mockImplementation(async (ref, data) => {
      const id = `doc${nextId++}`;
      firestoreTasks.push({ ...data, id });
      return { id };
    });

    const { rerender } = render(app(undefined));
    addGuestTask('Guest task 1');
    addGuestTask('Guest task 2');
    rerender(app('u1'));

    await waitFor(() => expect(ctx.tasks.map((t) => t.id).sort()).toEqual(['doc0', 'doc1']));
    expect(listActivityWrites()).toHaveLength(1);
    expect(list('list1').lastActivityAt).toBeInstanceOf(Date);
    expect(ctx.activeTaskListId).toBe('list1');
  });
});

describe('deleting task lists', () => {
  const LISTS = 'users/u1/taskLists';
  let batches;

  // Logged in with the Default list, "Work" (older activity) and "Ideas" (newer activity)
  const renderWithLists = async ({ lists, activeId, tasks = {} } = {}) => {
    const taskLists = lists || [
      { id: 'list1', name: 'Default Task List' },
      { id: 'list2', name: 'Work', lastActivityAt: { toMillis: () => 100 } },
      { id: 'list3', name: 'Ideas', lastActivityAt: { toMillis: () => 200 } },
    ];
    getDocs.mockImplementation(async (ref) => {
      if (ref.path === LISTS) return { docs: taskLists.map((l) => ({ id: l.id, data: () => l })) };
      const listTasks = tasks[ref.path.split('/')[3]] || [];
      return { docs: listTasks.map((t) => ({ id: t.id, data: () => t })) };
    });
    if (activeId) localStorage.setItem('lastActiveTaskList', activeId);
    render(app('u1'));
    await waitFor(() => expect(ctx.taskLists).toHaveLength(taskLists.length));
    await waitFor(() => expect(ctx.activeTaskListId).toBe(activeId || 'list1'));
    updateDoc.mockClear();
  };

  const makeTasks = (count) =>
    Array.from({ length: count }, (_, i) => ({ id: `t${i}`, name: `Task ${i}`, impact: 'Medium', time: '1 Hour', priority: 'M' }));

  // Records each batch's deletes; commit() runs the given behavior (resolves by default)
  const mockBatches = (commitBehavior = async () => {}) => {
    writeBatch.mockImplementation(() => {
      const batch = { deleted: [] };
      batch.delete = jest.fn((ref) => batch.deleted.push(ref.path));
      batch.commit = jest.fn(() => commitBehavior(batches.indexOf(batch)));
      batches.push(batch);
      return batch;
    });
  };

  beforeEach(() => {
    batches = [];
    mockBatches();
  });

  const deleteList = (id) => act(async () => { await ctx.deleteTaskList(id); });
  const deleteListExpectingError = async (id) => {
    let error;
    await act(async () => {
      try { await ctx.deleteTaskList(id); } catch (e) { error = e; }
    });
    return error;
  };
  const taskReads = (listId) => getDocs.mock.calls.filter(([ref]) => ref.path === `${LISTS}/${listId}/tasks`).length;

  test('deletes every task and then the list document in one batch', async () => {
    await renderWithLists({ activeId: 'list2', tasks: { list2: makeTasks(2) } });
    await deleteList('list2');

    expect(batches).toHaveLength(1);
    expect(batches[0].deleted).toEqual([
      `${LISTS}/list2/tasks/t0`,
      `${LISTS}/list2/tasks/t1`,
      `${LISTS}/list2`, // list document last
    ]);
    expect(batches[0].commit).toHaveBeenCalledTimes(1);
    expect(ctx.taskLists.map((l) => l.id)).toEqual(['list1', 'list3']);
  });

  test('deleting the active list selects the most recently active remaining list', async () => {
    await renderWithLists({ activeId: 'list2', tasks: { list2: makeTasks(1) } });
    await deleteList('list2');
    expect(ctx.activeTaskListId).toBe('list3');
    expect(localStorage.getItem('lastActiveTaskList')).toBe('list3');
  });

  test('falls back to the Default Task List when it is the only list left', async () => {
    await renderWithLists({
      lists: [{ id: 'list1', name: 'Default Task List' }, { id: 'list2', name: 'Work' }],
      activeId: 'list2',
    });
    await deleteList('list2');
    expect(ctx.activeTaskListId).toBe('list1');
  });

  test('deleting an inactive, empty list leaves the active list alone', async () => {
    await renderWithLists({ activeId: 'list2', tasks: { list2: makeTasks(3) } });
    await deleteList('list3');
    expect(batches).toHaveLength(1);
    expect(batches[0].deleted).toEqual([`${LISTS}/list3`]);
    expect(ctx.activeTaskListId).toBe('list2');
    expect(ctx.tasks).toHaveLength(3);
  });

  test('splits large lists into batches of at most 500, with the list document in the last', async () => {
    await renderWithLists({ tasks: { list2: makeTasks(600) } });
    await deleteList('list2');
    expect(batches.map((b) => b.deleted.length)).toEqual([500, 101]);
    expect(batches[0].deleted).not.toContain(`${LISTS}/list2`);
    expect(batches[1].deleted[100]).toBe(`${LISTS}/list2`);
  });

  test('never touches lastActivityAt or the other lists', async () => {
    await renderWithLists({ activeId: 'list2', tasks: { list2: makeTasks(1) } });
    const otherLists = ctx.taskLists.filter((l) => l.id !== 'list2');
    await deleteList('list2');
    expect(updateDoc).not.toHaveBeenCalled();
    expect(ctx.taskLists).toEqual(otherLists);
  });

  test('refuses to delete the Default Task List', async () => {
    await renderWithLists();
    const error = await deleteListExpectingError('list1');
    expect(error.userMessage).toMatch(/Default Task List can't be deleted/);
    expect(writeBatch).not.toHaveBeenCalled();
    expect(ctx.taskLists).toHaveLength(3);
  });

  test('refuses while a new task in the active list is still being saved', async () => {
    await renderWithLists({ activeId: 'list2' });
    addDoc.mockImplementation(() => new Promise(() => {})); // never finishes
    act(() => {
      ctx.addTask({ id: 'temp-9', name: 'Saving', impact: 'Medium', time: '1 Hour', createdAt: new Date() });
    });
    const error = await deleteListExpectingError('list2');
    expect(error.userMessage).toMatch(/still saving a new task/);
    expect(writeBatch).not.toHaveBeenCalled();
  });

  test('a failed commit keeps the list, keeps it active, and refreshes its tasks', async () => {
    await renderWithLists({ activeId: 'list2', tasks: { list2: makeTasks(2) } });
    mockBatches(async () => { throw new Error('permission-denied'); });
    const readsBefore = taskReads('list2');
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const error = await deleteListExpectingError('list2');

    expect(error.message).toBe('permission-denied');
    expect(ctx.taskLists.map((l) => l.id)).toEqual(['list1', 'list2', 'list3']);
    expect(ctx.activeTaskListId).toBe('list2');
    // The deletion's own read, then at least one refresh of what's left
    await waitFor(() => expect(taskReads('list2')).toBeGreaterThanOrEqual(readsBefore + 2));
    console.error.mockRestore();
  });

  test('a failed read deletes nothing and keeps the list', async () => {
    await renderWithLists({ activeId: 'list2' });
    getDocs.mockRejectedValueOnce(new Error('offline'));
    jest.spyOn(console, 'error').mockImplementation(() => {});

    const error = await deleteListExpectingError('list3');

    expect(error.message).toBe('offline');
    expect(writeBatch).not.toHaveBeenCalled();
    expect(ctx.taskLists.map((l) => l.id)).toContain('list3');
    console.error.mockRestore();
  });

  test('a failure partway through a large deletion keeps the list document for a retry', async () => {
    await renderWithLists({ tasks: { list2: makeTasks(600) } });
    mockBatches(async (index) => { if (index === 1) throw new Error('network'); });
    jest.spyOn(console, 'error').mockImplementation(() => {});

    await deleteListExpectingError('list2');

    expect(batches[0].commit).toHaveBeenCalled();
    expect(batches[0].deleted).not.toContain(`${LISTS}/list2`); // only tasks were committed
    expect(ctx.taskLists.map((l) => l.id)).toContain('list2');
    console.error.mockRestore();
  });

  test('login ignores a remembered list that no longer exists', async () => {
    localStorage.setItem('lastActiveTaskList', 'deleted-elsewhere');
    await renderWithLists();
    expect(ctx.activeTaskListId).toBe('list1');
  });

  test('creating a journal with the reserved Default name is refused', async () => {
    await renderWithLists();
    await act(async () => { await ctx.createTaskList('  dEfAuLt TaSk LiSt  '); });
    expect(addDoc).not.toHaveBeenCalled();
    expect(ctx.taskLists).toHaveLength(3);
  });
});

describe('undo and redo', () => {
  const LISTS = 'users/u1/taskLists';
  const TASK = `${LISTS}/list1/tasks/t1`;
  const existingTask = { id: 't1', name: 'Existing', impact: 'Medium', time: '10 Minutes', priority: 'I' };
  const undo = () => act(async () => { await ctx.undo(); });
  const redo = () => act(async () => { await ctx.redo(); });
  const list = (id) => ctx.taskLists.find((l) => l.id === id);
  const writesTo = (path) => updateDoc.mock.calls.filter(([ref]) => ref.path === path).map(([, fields]) => fields);

  // Logged in; list1 (Default) holds t1, list2 ("Work") holds w1. activeId picks the open list.
  const renderLoggedIn = async ({ activeId = 'list1', addDocImpl } = {}) => {
    getDocs.mockImplementation(async (ref) => {
      if (ref.path === LISTS) {
        return {
          docs: [
            { id: 'list1', data: () => ({ name: 'Default Task List' }) },
            { id: 'list2', data: () => ({ name: 'Work' }) },
          ],
        };
      }
      if (ref.path === `${LISTS}/list1/tasks`) return { docs: [{ id: 't1', data: () => existingTask }] };
      if (ref.path === `${LISTS}/list2/tasks`) {
        return { docs: [{ id: 'w1', data: () => ({ id: 'w1', name: 'Work task', impact: 'Medium', time: '1 Hour', priority: 'M' }) }] };
      }
      return { docs: [] };
    });
    if (addDocImpl) addDoc.mockImplementation(addDocImpl);
    else addDoc.mockResolvedValue({ id: 'new1' });
    localStorage.setItem('lastActiveTaskList', activeId);
    render(app('u1'));
    await waitFor(() => expect(ctx.tasks).toHaveLength(1));
    // Login can read the open list's tasks twice; let the second read land before the test acts
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(ctx.activeTaskListId).toBe(activeId);
    updateDoc.mockClear();
  };

  describe('guests (local only)', () => {
    test('adding, renaming, completing, and deleting can each be undone and redone', async () => {
      render(app(undefined));
      addGuestTask('First');
      const id = ctx.tasks[0].id;
      act(() => { ctx.updateTask(id, { name: 'Renamed' }); });
      act(() => { ctx.toggleTaskDone(id, true); });
      addGuestTask('Second');
      act(() => { ctx.deleteTask(id); });
      expect(ctx.tasks.map((t) => t.name)).toEqual(['Second']);

      await undo(); // delete: back at its original place
      expect(ctx.tasks.map((t) => t.name)).toEqual(['Renamed', 'Second']);
      await undo(); // add Second
      expect(ctx.tasks.map((t) => t.name)).toEqual(['Renamed']);
      await undo(); // complete
      expect(ctx.tasks[0].isDone).toBeUndefined();
      await undo(); // rename
      expect(ctx.tasks[0].name).toBe('First');
      await undo(); // add First
      expect(ctx.tasks).toHaveLength(0);
      await undo(); // nothing left: no-op
      expect(ctx.tasks).toHaveLength(0);

      for (let i = 0; i < 5; i++) await redo();
      expect(ctx.tasks.map((t) => [t.name, t.isDone])).toEqual([['Second', undefined]]);
      await redo(); // nothing left to redo
      expect(ctx.tasks).toHaveLength(1);

      expect(addDoc).not.toHaveBeenCalled();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(setDoc).not.toHaveBeenCalled();
      expect(deleteDoc).not.toHaveBeenCalled();
    });

    test('a new action clears the redo steps', async () => {
      render(app(undefined));
      addGuestTask('Task');
      const id = ctx.tasks[0].id;
      act(() => { ctx.updateTask(id, { name: 'One' }); });
      await undo();
      act(() => { ctx.updateTask(id, { name: 'Two' }); });
      await redo();
      expect(ctx.tasks[0].name).toBe('Two');
    });

    test('re-saving an unchanged value is not a step', async () => {
      render(app(undefined));
      addGuestTask('Task');
      act(() => { ctx.updateTask(ctx.tasks[0].id, { impact: 'Monumental' }); }); // already Monumental
      await undo(); // undoes the add
      expect(ctx.tasks).toHaveLength(0);
    });

    test('history is cleared when logging in', async () => {
      const { rerender } = render(app(undefined));
      addGuestTask('Guest task');
      getDocs.mockResolvedValue({ docs: [{ id: 'list1', data: () => ({ name: 'Default Task List' }) }] });
      addDoc.mockResolvedValue({ id: 'doc1' });
      rerender(app('u1'));
      await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(1));
      deleteDoc.mockClear();
      await undo();
      expect(deleteDoc).not.toHaveBeenCalled();
    });
  });

  describe('logged in', () => {
    test('undoing a rename writes the old name back; redo writes the new one', async () => {
      await renderLoggedIn();
      await act(async () => { await ctx.updateTask('t1', { name: 'Renamed' }); });
      updateDoc.mockClear();

      await undo();
      expect(ctx.tasks[0].name).toBe('Existing');
      expect(writesTo(TASK)).toEqual([{ name: 'Existing' }]);

      await redo();
      expect(ctx.tasks[0].name).toBe('Renamed');
      expect(writesTo(TASK)).toEqual([{ name: 'Existing' }, { name: 'Renamed' }]);
    });

    test('undoing an impact change restores the priority and the previous activity time', async () => {
      await renderLoggedIn();
      await act(async () => { await ctx.updateTask('t1', { impact: 'Minimal' }); });
      const activityAfter = list('list1').lastActivityAt;
      expect(activityAfter).toBeInstanceOf(Date);
      updateDoc.mockClear();

      await undo();
      expect(ctx.tasks[0]).toMatchObject({ impact: 'Medium', priority: 'I' });
      expect(writesTo(TASK)).toEqual([{ impact: 'Medium', priority: 'I' }]);
      expect(list('list1').lastActivityAt).toBeUndefined(); // there was none before
      expect(writesTo(`${LISTS}/list1`)).toEqual([{ lastActivityAt: 'DELETE_FIELD' }]);

      await redo();
      expect(ctx.tasks[0]).toMatchObject({ impact: 'Minimal', priority: 'K' });
      expect(list('list1').lastActivityAt).toBe(activityAfter);
      expect(writesTo(`${LISTS}/list1`)).toEqual([{ lastActivityAt: 'DELETE_FIELD' }, { lastActivityAt: activityAfter }]);
    });

    test('undoing a completion removes the done flag it added', async () => {
      await renderLoggedIn();
      await act(async () => { await ctx.toggleTaskDone('t1', true); });
      updateDoc.mockClear();
      await undo();
      expect(ctx.tasks[0].isDone).toBeUndefined();
      expect(writesTo(TASK)).toEqual([{ isDone: 'DELETE_FIELD' }]);
    });

    test('undoing a delete recreates the task with the same ID and fields', async () => {
      await renderLoggedIn();
      await act(async () => { await ctx.deleteTask('t1'); });
      expect(ctx.tasks).toHaveLength(0);

      await undo();
      expect(ctx.tasks).toEqual([existingTask]);
      expect(setDoc).toHaveBeenCalledWith({ path: TASK }, existingTask);

      deleteDoc.mockClear();
      await redo();
      expect(ctx.tasks).toHaveLength(0);
      expect(deleteDoc).toHaveBeenCalledWith({ path: TASK });
    });

    test('undoing an add deletes the saved task and restores activity; redo recreates it', async () => {
      await renderLoggedIn();
      await act(async () => {
        await ctx.addTask({ id: 'temp-a', name: 'New', impact: 'Minimal', time: '10 Minutes', createdAt: new Date() });
      });
      expect(ctx.tasks.map((t) => t.id)).toEqual(['t1', 'new1']);
      updateDoc.mockClear();

      await undo();
      expect(ctx.tasks.map((t) => t.id)).toEqual(['t1']);
      expect(deleteDoc).toHaveBeenCalledWith({ path: `${LISTS}/list1/tasks/new1` });
      expect(list('list1').lastActivityAt).toBeUndefined();

      await redo();
      expect(ctx.tasks.map((t) => t.id)).toEqual(['t1', 'new1']);
      expect(setDoc).toHaveBeenCalledWith(
        { path: `${LISTS}/list1/tasks/new1` },
        expect.objectContaining({ id: 'new1', name: 'New', taskListId: 'list1' })
      );
    });

    test('an add cannot be undone until the task has finished saving', async () => {
      let finishSave;
      await renderLoggedIn({
        addDocImpl: () => new Promise((resolve) => { finishSave = () => resolve({ id: 'new1' }); }),
      });
      act(() => {
        ctx.addTask({ id: 'temp-a', name: 'New', impact: 'Minimal', time: '10 Minutes', createdAt: new Date() });
      });

      await undo(); // still saving: nothing happens, and the step stays in history
      expect(ctx.tasks.map((t) => t.name)).toEqual(['Existing', 'New']);
      expect(deleteDoc).not.toHaveBeenCalled();

      await act(async () => finishSave());
      await undo();
      expect(ctx.tasks.map((t) => t.name)).toEqual(['Existing']);
      expect(deleteDoc).toHaveBeenCalledWith({ path: `${LISTS}/list1/tasks/new1` });
    });

    test('a change in a list that is not open is undone in Firestore only', async () => {
      await renderLoggedIn();
      await act(async () => { await ctx.updateTask('t1', { name: 'Renamed' }); });
      act(() => { ctx.setActiveTaskListId('list2'); });
      await waitFor(() => expect(ctx.tasks.map((t) => t.id)).toEqual(['w1']));
      updateDoc.mockClear();

      await undo();
      expect(writesTo(TASK)).toEqual([{ name: 'Existing' }]);
      expect(ctx.tasks.map((t) => t.name)).toEqual(['Work task']); // the open list is untouched
    });

    test('deleting a journal drops its steps, so undo never recreates tasks inside it', async () => {
      await renderLoggedIn({ activeId: 'list2' });
      await act(async () => { await ctx.deleteTask('w1'); });
      act(() => { ctx.setActiveTaskListId('list1'); });
      await waitFor(() => expect(ctx.tasks.map((t) => t.id)).toEqual(['t1']));
      await act(async () => { await ctx.updateTask('t1', { name: 'Renamed' }); });

      writeBatch.mockImplementation(() => ({ delete: jest.fn(), commit: jest.fn(async () => {}) }));
      await act(async () => { await ctx.deleteTaskList('list2'); });

      await undo(); // the rename in list1
      expect(ctx.tasks[0].name).toBe('Existing');
      await undo(); // the delete in list2 was dropped
      expect(setDoc).not.toHaveBeenCalled();
    });

    test('taking a journal down can be undone and redone', async () => {
      await renderLoggedIn();
      act(() => { ctx.takeDownTaskList('list2'); });
      const pickedUpAt = list('list2').lastPickedUpAt;
      expect(pickedUpAt).toBeInstanceOf(Date);
      updateDoc.mockClear();

      await undo();
      expect(list('list2').lastPickedUpAt).toBeUndefined();
      expect(writesTo(`${LISTS}/list2`)).toEqual([{ lastPickedUpAt: 'DELETE_FIELD' }]);

      await redo();
      expect(list('list2').lastPickedUpAt).toBe(pickedUpAt);
      expect(writesTo(`${LISTS}/list2`)).toEqual([{ lastPickedUpAt: 'DELETE_FIELD' }, { lastPickedUpAt: pickedUpAt }]);
    });

    test('opening a journal is not an undo step', async () => {
      await renderLoggedIn();
      act(() => { ctx.markTaskListPickedUp('list2'); });
      updateDoc.mockClear();
      await undo();
      expect(updateDoc).not.toHaveBeenCalled();
      expect(list('list2').lastPickedUpAt).toBeInstanceOf(Date);
    });

    test('a failed step is dropped and the open list is reloaded', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      await renderLoggedIn();
      await act(async () => { await ctx.updateTask('t1', { name: 'Renamed' }); });
      updateDoc.mockRejectedValueOnce(new Error('offline'));
      const readsBefore = getDocs.mock.calls.length;

      await undo();
      await waitFor(() => expect(getDocs.mock.calls.length).toBeGreaterThan(readsBefore));
      await waitFor(() => expect(ctx.tasks[0].name).toBe('Existing')); // reloaded from Firestore
      await redo(); // the failed step isn't redoable
      expect(ctx.tasks[0].name).toBe('Existing');
      console.error.mockRestore();
    });
  });
});
