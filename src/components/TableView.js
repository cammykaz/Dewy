/* TableView.js */

import React from 'react';
import TaskRow from './TaskRow';
import './TableView.css'; // Assuming you have specific styles for TableView

// Column labels above the task rows, laid out with the same widths as a row so they line up.
// Hidden from screen readers: each row's controls carry their own labels.
export function TaskListHeader() {
  return (
    <div className="task-list-header" aria-hidden="true">
      <span className="header-check" />
      <span className="header-name">Task</span>
      <span className="header-impact">Impact</span>
      <span className="header-time">Time</span>
      <span className="header-priority">Priority</span>
      <span className="header-delete" />
    </div>
  );
}

function TableView({ tasks, onDelete, onFieldUpdate, onToggleDone }) {
  const tasksSortedByPriority = tasks.slice().sort((a, b) => a.priority.localeCompare(b.priority));

  return (
    <div className="task-list">
      {tasksSortedByPriority.map((task) => (
        <TaskRow
          key={task.id}
          {...task}
          onDelete={onDelete}
          onFieldUpdate={onFieldUpdate}
          onToggleDone={onToggleDone}
        />
      ))}
    </div>
  );
}

export default TableView;

