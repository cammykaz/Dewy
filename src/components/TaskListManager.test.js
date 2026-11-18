import { render, screen } from '@testing-library/react';
import TaskListManager from './TaskListManager';
import { useTasks } from '../context/TasksContext';

jest.mock('../context/TasksContext', () => ({ useTasks: jest.fn() }));

// Firestore returns Timestamp objects for stored dates
const timestamp = (ms) => ({ toMillis: () => ms });

const renderWithLists = (taskLists) => {
  useTasks.mockReturnValue({
    taskLists,
    createTaskList: jest.fn(),
    setActiveTaskListId: jest.fn(),
    activeTaskListId: taskLists[0]?.id ?? null,
  });
  render(<TaskListManager />);
  return screen.getAllByRole('option').map((option) => option.textContent);
};

test('sorts lists by most recent activity, newest first', () => {
  const names = renderWithLists([
    { id: 'a', name: 'Old activity', createdAt: timestamp(100), lastActivityAt: timestamp(1000) },
    { id: 'b', name: 'Recent activity', createdAt: timestamp(100), lastActivityAt: timestamp(3000) },
    { id: 'c', name: 'Middle activity', createdAt: timestamp(100), lastActivityAt: timestamp(2000) },
  ]);
  expect(names).toEqual(['Recent activity', 'Middle activity', 'Old activity', '➕ Create New Task List']);
});

test('lists without activity fall back to createdAt, so a new list sorts to the top', () => {
  const names = renderWithLists([
    { id: 'a', name: 'Active yesterday', createdAt: timestamp(100), lastActivityAt: timestamp(2000) },
    { id: 'b', name: 'Created just now', createdAt: new Date(5000) }, // local Date, as createTaskList stores it
    { id: 'c', name: 'Older, no activity', createdAt: timestamp(1000) },
  ]);
  expect(names.slice(0, 3)).toEqual(['Created just now', 'Active yesterday', 'Older, no activity']);
});

test('mixes local Dates and Firestore Timestamps correctly', () => {
  const names = renderWithLists([
    { id: 'a', name: 'Server time', lastActivityAt: timestamp(2000) },
    { id: 'b', name: 'Local time', lastActivityAt: new Date(3000) },
  ]);
  expect(names.slice(0, 2)).toEqual(['Local time', 'Server time']);
});

test('lists with no timestamps sort last, then by name', () => {
  const names = renderWithLists([
    { id: 'a', name: 'Zebra' },
    { id: 'b', name: 'Apple' },
    { id: 'c', name: 'Dated', createdAt: timestamp(1) },
  ]);
  expect(names.slice(0, 3)).toEqual(['Dated', 'Apple', 'Zebra']);
});

test('sorting does not change the selected list', () => {
  useTasks.mockReturnValue({
    taskLists: [
      { id: 'old', name: 'Old', lastActivityAt: timestamp(1) },
      { id: 'new', name: 'New', lastActivityAt: timestamp(2) },
    ],
    createTaskList: jest.fn(),
    setActiveTaskListId: jest.fn(),
    activeTaskListId: 'old',
  });
  render(<TaskListManager />);
  expect(screen.getByRole('combobox')).toHaveValue('old');
});
