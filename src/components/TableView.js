/* TableView.js */

import React from 'react';
import TaskRow from './TaskRow';
import './TableView.css'; // Assuming you have specific styles for TableView

function TableView({ tasks, onDelete, onUpdate }) {
  const tasksSortedByPriority = tasks.slice().sort((a, b) => a.priority.localeCompare(b.priority));
  
  return (
    <div className="taskGrid">
      {tasksSortedByPriority.map((task) => (
        <TaskRow key={task.id} {...task} onDelete={onDelete} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

export default TableView;

