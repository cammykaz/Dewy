/* TaskRow.js */
import React from 'react';
import './TaskRow.css'; // Import specific styles for the TaskRow

function TaskRow({ id, name, impact, time, priority, onDelete, onUpdate }) {
  const handleChange = (e) => {
    const fieldName = e.target.name; // This will be either 'impact' or 'time'
    const updatedValue = e.target.value;

    // Update the relevant field (either 'impact' or 'time')
    onUpdate(id, { [fieldName]: updatedValue });
  };
  return (
    <div className="task-row">
      {/* Task Name */}
      <div className="task-cell">{name}</div>
      {/* Impact Dropdown */}
      <div className="task-cell">
        <select name="impact" value={impact} onChange={handleChange}>
          <option value="Monumental">Monumental</option>
          <option value="Substantial">Substantial</option>
          <option value="Medium">Medium</option>
          <option value="Minimal">Minimal</option>
        </select>
      </div>
      {/* Time Dropdown */}
      <div className="task-cell">
        <select name="time" value={time} onChange={handleChange}>
          <option value="10 Minutes">10 Minutes</option>
          <option value="30 Minutes">30 Minutes</option>
          <option value="1 Hour">1 Hour</option>
          <option value="2 Hours">2 Hours</option>
        </select>
      </div>
      {/* Task Priority */}
      <div className="task-cell">{priority}</div>
      {/* Delete Task Button */}
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