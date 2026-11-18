import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs, serverTimestamp } from 'firebase/firestore';
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
}));

// CRA's Jest config resets mocks before each test, so set implementations here
beforeEach(() => {
  collection.mockImplementation((db, path) => ({ path }));
  doc.mockImplementation((db, path, id) => ({ path: `${path}/${id}` }));
  updateDoc.mockResolvedValue();
  deleteDoc.mockResolvedValue();
  serverTimestamp.mockReturnValue('SERVER_TIMESTAMP');
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
