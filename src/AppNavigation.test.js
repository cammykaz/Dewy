import { useState } from 'react';
import { render, screen, fireEvent, act, waitFor, within } from '@testing-library/react';
import App from './App';
import { useAuth } from './context/AuthContext';
import { useTasks } from './context/TasksContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./context/TasksContext', () => ({
  TasksProvider: ({ children }) => children,
  useTasks: jest.fn(),
}));
// Stub the existing task UI; these tests cover opening and closing journals on the desk
jest.mock('./components/TaskManager', () => () => <div>Task manager</div>);
jest.mock('./components/LoginForm', () => () => <div>Login form</div>);
jest.mock('./components/LogoutButton', () => () => <button>Logout</button>);

const user = { uid: 'u1', email: 'me@example.com' };
let tasksContext;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  tasksContext = {
    tasks: [],
    taskLists: [
      { id: 'list1', name: 'Default Task List' },
      { id: 'list2', name: 'Work' },
    ],
    activeTaskListId: 'list1',
    setActiveTaskListId: jest.fn(),
    createTaskList: jest.fn(),
    markTaskListPickedUp: jest.fn(),
    takeDownTaskList: jest.fn(),
    undo: jest.fn(),
    redo: jest.fn(),
  };
  // Like the real context, choosing the active list re-renders
  useTasks.mockImplementation(() => {
    const [activeTaskListId, setActive] = useState(tasksContext.activeTaskListId);
    const setActiveTaskListId = (id) => { tasksContext.setActiveTaskListId(id); setActive(id); };
    return { ...tasksContext, activeTaskListId, setActiveTaskListId };
  });
});

const isOnDesk = () => screen.queryByRole('region', { name: 'Your journals' }) !== null;
const openJournal = () => screen.queryByRole('dialog');

test('guests keep immediate task entry and see no desk', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<App />);
  expect(screen.getByText('Login form')).toBeInTheDocument();
  expect(screen.getByText('Task manager')).toBeInTheDocument();
  expect(isOnDesk()).toBe(false);
});

test('logged-in users land on the desk with one journal per list, none open', () => {
  useAuth.mockReturnValue({ currentUser: user });
  render(<App />);
  expect(isOnDesk()).toBe(true);
  expect(screen.getByRole('button', { name: 'Open Default Task List' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open Work' })).toBeInTheDocument();
  expect(openJournal()).not.toBeInTheDocument();
  expect(screen.queryByText('Task manager')).not.toBeInTheDocument();
});

test('opening a journal opens it on the desk, and Close lays it down', async () => {
  useAuth.mockReturnValue({ currentUser: user });
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Open Work' }));
  expect(tasksContext.markTaskListPickedUp).toHaveBeenCalledWith('list2');
  expect(tasksContext.setActiveTaskListId).toHaveBeenCalledWith('list2');
  expect(openJournal()).toHaveAccessibleName('Work');
  expect(within(openJournal()).getByText('Task manager')).toBeInTheDocument();
  expect(isOnDesk()).toBe(true);
  expect(window.location.hash).toBe('#list');

  fireEvent.click(screen.getByRole('button', { name: 'Close Work' }));
  await waitFor(() => expect(openJournal()).not.toBeInTheDocument());
  expect(window.location.hash).toBe('');
});

test('browser Back closes the journal, and Forward reopens it', async () => {
  useAuth.mockReturnValue({ currentUser: user });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Work' }));

  act(() => window.history.back());
  await waitFor(() => expect(openJournal()).not.toBeInTheDocument());

  act(() => window.history.forward());
  await waitFor(() => expect(openJournal()).toHaveAccessibleName('Work'));
});

test('reloading with a journal open keeps it open; Close still lays it down', () => {
  window.history.replaceState(null, '', '/#list');
  tasksContext.activeTaskListId = 'list2';
  useAuth.mockReturnValue({ currentUser: user });
  render(<App />);
  expect(openJournal()).toHaveAccessibleName('Work');

  fireEvent.click(screen.getByRole('button', { name: 'Close Work' }));
  expect(openJournal()).not.toBeInTheDocument();
  expect(window.location.hash).toBe('');
});

test('a guest who logs in with tasks sees them in the open Default journal', () => {
  useAuth.mockReturnValue({ currentUser: null });
  tasksContext.tasks = [{ id: 'temp-0', name: 'Guest task' }];
  const { rerender } = render(<App />);

  useAuth.mockReturnValue({ currentUser: user });
  rerender(<App />);
  expect(openJournal()).toHaveAccessibleName('Default Task List');
  expect(screen.getByText('Task manager')).toBeInTheDocument();
});

test('a guest who logs in without tasks lands on the desk with nothing open', () => {
  useAuth.mockReturnValue({ currentUser: null });
  const { rerender } = render(<App />);
  useAuth.mockReturnValue({ currentUser: user });
  rerender(<App />);
  expect(isOnDesk()).toBe(true);
  expect(openJournal()).not.toBeInTheDocument();
});

test('logging out and back in returns to the desk with nothing open', () => {
  useAuth.mockReturnValue({ currentUser: user });
  const { rerender } = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Work' }));

  useAuth.mockReturnValue({ currentUser: null });
  rerender(<App />);
  useAuth.mockReturnValue({ currentUser: user });
  rerender(<App />);
  expect(isOnDesk()).toBe(true);
  expect(openJournal()).not.toBeInTheDocument();
});

describe('undo/redo shortcuts', () => {
  const press = (target, init) => fireEvent.keyDown(target, init);

  test('Ctrl+Z undoes; Ctrl+Shift+Z and Ctrl+Y redo; ⌘ works on Mac', () => {
    useAuth.mockReturnValue({ currentUser: user });
    render(<App />);
    press(document.body, { key: 'z', ctrlKey: true });
    press(document.body, { key: 'z', metaKey: true });
    expect(tasksContext.undo).toHaveBeenCalledTimes(2);
    press(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    press(document.body, { key: 'y', ctrlKey: true });
    press(document.body, { key: 'z', metaKey: true, shiftKey: true });
    expect(tasksContext.redo).toHaveBeenCalledTimes(3);
  });

  test('plain Z, Alt combinations, and other shortcuts do nothing', () => {
    useAuth.mockReturnValue({ currentUser: user });
    render(<App />);
    press(document.body, { key: 'z' });
    press(document.body, { key: 'z', ctrlKey: true, altKey: true });
    press(document.body, { key: 's', ctrlKey: true });
    expect(tasksContext.undo).not.toHaveBeenCalled();
    expect(tasksContext.redo).not.toHaveBeenCalled();
  });

  test('typing in a text field keeps the browser’s own text undo', () => {
    useAuth.mockReturnValue({ currentUser: user });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: '+ New journal' }));
    const input = screen.getByRole('textbox', { name: 'New journal name' });
    const notPrevented = press(input, { key: 'z', ctrlKey: true });
    expect(notPrevented).toBe(true);
    expect(tasksContext.undo).not.toHaveBeenCalled();
  });

  test('checkboxes and dropdowns do not block undo', () => {
    useAuth.mockReturnValue({ currentUser: user });
    render(<App />);
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    const select = document.createElement('select');
    document.body.append(checkbox, select);
    press(checkbox, { key: 'z', ctrlKey: true });
    press(select, { key: 'z', ctrlKey: true });
    expect(tasksContext.undo).toHaveBeenCalledTimes(2);
    checkbox.remove();
    select.remove();
  });

  test('nothing happens while a confirmation dialog is open', () => {
    useAuth.mockReturnValue({ currentUser: user });
    render(<App />);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'alertdialog');
    document.body.append(dialog);
    press(document.body, { key: 'z', ctrlKey: true });
    expect(tasksContext.undo).not.toHaveBeenCalled();
    dialog.remove();
  });

  test('guests can undo too', () => {
    useAuth.mockReturnValue({ currentUser: null });
    render(<App />);
    press(document.body, { key: 'z', ctrlKey: true });
    expect(tasksContext.undo).toHaveBeenCalledTimes(1);
  });
});
