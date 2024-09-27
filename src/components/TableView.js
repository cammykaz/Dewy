/* TableView.js */

import React from 'react';
import TaskRow from './TaskRow';
import './TableView.css'; // Assuming you have specific styles for TableView

function TableView({ tasks, onDelete, onUpdate }) {
  return (
    <div className="taskGrid">
      {tasks.map((task) => (
        <TaskRow key={task.id} {...task} onDelete={onDelete} onUpdate={onUpdate} />
      ))}
    </div>
  );
}

export default TableView;

