import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import { collection, doc, addDoc, updateDoc, deleteDoc, getDocs } from 'firebase/firestore';
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
}));

// CRA's Jest config resets mocks before each test, so set implementations here
beforeEach(() => {
  collection.mockImplementation((db, path) => ({ path }));
  doc.mockImplementation((db, path, id) => ({ path: `${path}/${id}` }));
  updateDoc.mockResolvedValue();
  deleteDoc.mockResolvedValue();
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
    Object.assign(firestoreTasks[0], changes);
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
