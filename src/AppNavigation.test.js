import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import App from './App';
import { useAuth } from './context/AuthContext';
import { useTasks } from './context/TasksContext';

jest.mock('./context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('./context/TasksContext', () => ({
  TasksProvider: ({ children }) => children,
  useTasks: jest.fn(),
}));
// Stub the existing task UI; these tests cover navigation between it and the desk
jest.mock('./components/TaskManager', () => () => <div>Task manager</div>);
jest.mock('./components/TaskListManager', () => () => <div>List dropdown</div>);
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
    setActiveTaskListId: jest.fn(),
    createTaskList: jest.fn(),
    markTaskListPickedUp: jest.fn(),
  };
  useTasks.mockImplementation(() => tasksContext);
});

const isOnDesk = () => screen.queryByRole('region', { name: 'Your journals' }) !== null;

test('guests keep immediate task entry and see no desk', () => {
  useAuth.mockReturnValue({ currentUser: null });
  render(<App />);
  expect(screen.getByText('Login form')).toBeInTheDocument();
  expect(screen.getByText('Task manager')).toBeInTheDocument();
  expect(isOnDesk()).toBe(false);
});

test('logged-in users land on the desk with one journal per list', () => {
  useAuth.mockReturnValue({ currentUser: user });
  render(<App />);
  expect(isOnDesk()).toBe(true);
  expect(screen.getByRole('button', { name: 'Open Default Task List' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open Work' })).toBeInTheDocument();
  expect(screen.queryByText('Task manager')).not.toBeInTheDocument();
});

test('opening a journal shows its task list, and the Desk button returns', async () => {
  useAuth.mockReturnValue({ currentUser: user });
  render(<App />);

  fireEvent.click(screen.getByRole('button', { name: 'Open Work' }));
  expect(tasksContext.markTaskListPickedUp).toHaveBeenCalledWith('list2');
  expect(tasksContext.setActiveTaskListId).toHaveBeenCalledWith('list2');
  expect(screen.getByText('Task manager')).toBeInTheDocument();
  expect(window.location.hash).toBe('#list');

  fireEvent.click(screen.getByRole('button', { name: '← Desk' }));
  await waitFor(() => expect(isOnDesk()).toBe(true));
  expect(window.location.hash).toBe('');
});

test('browser Back returns from a list to the desk, and Forward reopens it', async () => {
  useAuth.mockReturnValue({ currentUser: user });
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Work' }));

  act(() => window.history.back());
  await waitFor(() => expect(isOnDesk()).toBe(true));

  act(() => window.history.forward());
  await waitFor(() => expect(screen.getByText('Task manager')).toBeInTheDocument());
});

test('reloading on an opened list stays on the list; Desk still returns', () => {
  window.history.replaceState(null, '', '/#list');
  useAuth.mockReturnValue({ currentUser: user });
  render(<App />);
  expect(screen.getByText('Task manager')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: '← Desk' }));
  expect(isOnDesk()).toBe(true);
});

test('a guest who logs in with tasks sees the task list instead of the desk', () => {
  useAuth.mockReturnValue({ currentUser: null });
  tasksContext.tasks = [{ id: 'temp-0', name: 'Guest task' }];
  const { rerender } = render(<App />);

  useAuth.mockReturnValue({ currentUser: user });
  rerender(<App />);
  expect(screen.getByText('Task manager')).toBeInTheDocument();
  expect(isOnDesk()).toBe(false);
});

test('a guest who logs in without tasks lands on the desk', () => {
  useAuth.mockReturnValue({ currentUser: null });
  const { rerender } = render(<App />);
  useAuth.mockReturnValue({ currentUser: user });
  rerender(<App />);
  expect(isOnDesk()).toBe(true);
});

test('logging out and back in returns to the desk', () => {
  useAuth.mockReturnValue({ currentUser: user });
  const { rerender } = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Open Work' }));

  useAuth.mockReturnValue({ currentUser: null });
  rerender(<App />);
  useAuth.mockReturnValue({ currentUser: user });
  rerender(<App />);
  expect(isOnDesk()).toBe(true);
});
