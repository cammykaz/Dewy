import { render, screen } from '@testing-library/react';
import TaskManager from './TaskManager';
import { useTasks } from '../context/TasksContext';

jest.mock('../context/TasksContext', () => ({ useTasks: jest.fn() }));

beforeEach(() => {
  useTasks.mockReturnValue({
    tasks: [{ id: 't1', name: 'Water plants', impact: 'Medium', time: '10 Minutes', priority: 'C', isDone: true }],
    addTask: jest.fn(),
    deleteTask: jest.fn(),
    updateTask: jest.fn(),
    toggleTaskDone: jest.fn(),
  });
});

test('inside a journal: no page headings, just the add-task line and the tasks', () => {
  render(<TaskManager inJournal />);
  expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'New task name' })).toHaveAttribute('placeholder', 'Add a task…');
  expect(screen.getByRole('combobox', { name: 'Impact' })).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Time' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Edit task name: Water plants' }).closest('.task-row')).toHaveClass('done');
});

test('inside a journal, column labels are pinned with the add-task line, and each dropdown has its own label', () => {
  render(<TaskManager inJournal />);
  const pinned = document.querySelector('.task-manager-pinned');
  expect(pinned).toContainElement(document.querySelector('.task-add-form'));
  expect(pinned.querySelector('.task-list-header')).toHaveTextContent(/Task\s*Impact\s*Time\s*Priority/);
  expect(screen.getByRole('combobox', { name: 'Impact: Water plants' })).toHaveValue('Medium');
  expect(screen.getByRole('combobox', { name: 'Time: Water plants' })).toHaveValue('10 Minutes');
});

test('no column labels over an empty list', () => {
  useTasks.mockReturnValue({ ...useTasks(), tasks: [] });
  render(<TaskManager inJournal />);
  expect(document.querySelector('.task-list-header')).not.toBeInTheDocument();
});

test('the guest page keeps its headings', () => {
  render(<TaskManager />);
  expect(screen.getByRole('heading', { name: 'Add A New Task' })).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Task List' })).toBeInTheDocument();
});
