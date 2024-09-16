/* TableView.js */

import React from 'react';
import TaskRow from './TaskRow';
import './TableView.css'; // Assuming you have specific styles for TableView

function TableView({ tasks, onDelete }) {
  return (
    <div className="taskGrid">
      {tasks.map((task) => (
        <TaskRow key={task.id} {...task} onDelete={onDelete} />
      ))}
    </div>
  );
}

export default TableView;

