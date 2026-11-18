import { render, screen, fireEvent } from '@testing-library/react';
import TaskRow from './TaskRow';

const renderRow = () => {
  const onFieldUpdate = jest.fn();
  render(
    <TaskRow
      id="task-1"
      name="Buy milk"
      impact="Medium"
      time="10 Minutes"
      priority="I"
      isDone={false}
      onDelete={jest.fn()}
      onToggleDone={jest.fn()}
      onFieldUpdate={onFieldUpdate}
    />
  );
  return { onFieldUpdate };
};

const nameButton = () => screen.getByRole('button', { name: /edit task name/i });
const nameInput = () => screen.getByRole('textbox', { name: 'Task name' });
const startEditing = () => fireEvent.click(nameButton());
const typeName = (value) => fireEvent.change(nameInput(), { target: { value } });
const press = (key) => fireEvent.keyDown(nameInput(), { key });

test('clicking the name opens a focused text field with the current name', () => {
  renderRow();
  startEditing();
  expect(nameInput()).toHaveValue('Buy milk');
  expect(nameInput()).toHaveFocus();
});

test('Enter saves the trimmed name and returns focus to the name', () => {
  const { onFieldUpdate } = renderRow();
  startEditing();
  typeName('  Buy oat milk  ');
  press('Enter');
  expect(onFieldUpdate).toHaveBeenCalledTimes(1);
  expect(onFieldUpdate).toHaveBeenCalledWith('task-1', { name: 'Buy oat milk' });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  expect(nameButton()).toHaveFocus();
});

test('clicking outside (blur) saves the name', () => {
  const { onFieldUpdate } = renderRow();
  startEditing();
  typeName('Buy milk today');
  fireEvent.blur(nameInput());
  expect(onFieldUpdate).toHaveBeenCalledTimes(1);
  expect(onFieldUpdate).toHaveBeenCalledWith('task-1', { name: 'Buy milk today' });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

test('Escape cancels without saving, even if a blur follows', () => {
  const { onFieldUpdate } = renderRow();
  startEditing();
  typeName('changed');
  const input = nameInput();
  press('Escape');
  fireEvent.blur(input); // some browsers fire blur when the focused input is removed
  expect(onFieldUpdate).not.toHaveBeenCalled();
  expect(nameButton()).toHaveTextContent('Buy milk');
  expect(nameButton()).toHaveFocus();
});

test('Enter followed by blur saves only once', () => {
  const { onFieldUpdate } = renderRow();
  startEditing();
  typeName('New name');
  const input = nameInput();
  press('Enter');
  fireEvent.blur(input);
  expect(onFieldUpdate).toHaveBeenCalledTimes(1);
});

test('an empty name is not saved', () => {
  const { onFieldUpdate } = renderRow();
  startEditing();
  typeName('   ');
  press('Enter');
  expect(onFieldUpdate).not.toHaveBeenCalled();
  expect(nameButton()).toHaveTextContent('Buy milk');
});

test('an unchanged name is not saved', () => {
  const { onFieldUpdate } = renderRow();
  startEditing();
  press('Enter');
  expect(onFieldUpdate).not.toHaveBeenCalled();
});

test('editing can be started from the keyboard', () => {
  renderRow();
  fireEvent.keyDown(nameButton(), { key: 'Enter' });
  expect(nameInput()).toHaveFocus();
});

test('a later blur still saves after a previous edit was closed with Escape', () => {
  const { onFieldUpdate } = renderRow();
  startEditing();
  press('Escape');
  startEditing();
  typeName('Buy milk!');
  fireEvent.blur(nameInput());
  expect(onFieldUpdate).toHaveBeenCalledWith('task-1', { name: 'Buy milk!' });
});
