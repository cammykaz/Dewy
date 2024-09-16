/* TaskRow.js */
import React from 'react';
import './TaskRow.css'; // Import specific styles for the TaskRow

function TaskRow({ id, name, impact, time, priority, onDelete }) {
  return (
    <div className="task-row">
      <div className="task-cell">{name}</div>
      <div className="task-cell">{impact}</div>
      <div className="task-cell">{time}</div>
      <div className="task-cell">{priority}</div>
      {/* Delete functionality will be added later */}
      <button onClick={() => onDelete(id)} className="delete-btn" aria-label="Delete task">
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}

export default TaskRow;
