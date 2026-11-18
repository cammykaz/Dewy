/* TaskRow.js */
import React, { useState, useRef, useEffect } from 'react';
import './TaskRow.css'; // Import specific styles for the TaskRow

function TaskRow({ id, name, impact, time, priority, onDelete, onFieldUpdate, isDone, onToggleDone }) {
  // Inline name editing
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const nameCellRef = useRef(null);
  // Set when editing ends via Enter/Escape, so the input's blur doesn't save again (or save after Escape)
  const closedByKeyRef = useRef(false);

  const startEditingName = () => {
    closedByKeyRef.current = false;
    setDraftName(name);
    setIsEditingName(true);
  };

  const finishEditingName = (save) => {
    const trimmedName = draftName.trim();
    // Empty names aren't allowed: an empty draft reverts to the existing name
    if (save && trimmedName && trimmedName !== name) {
      onFieldUpdate(id, { name: trimmedName });
    }
    setIsEditingName(false);
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      closedByKeyRef.current = true;
      finishEditingName(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closedByKeyRef.current = true;
      finishEditingName(false);
    }
  };

  const handleNameBlur = () => {
    if (!closedByKeyRef.current) finishEditingName(true);
  };

  // After closing with the keyboard, return focus to the name so keyboard users don't lose their place
  useEffect(() => {
    if (!isEditingName && closedByKeyRef.current) {
      closedByKeyRef.current = false;
      nameCellRef.current?.focus();
    }
  }, [isEditingName]);

  const handleFieldChange = (e) => {
    const fieldName = e.target.name; // This will be either 'impact' or 'time'
    const updatedValue = e.target.value;
    // Update the relevant field (either 'impact' or 'time')
    onFieldUpdate(id, { [fieldName]: updatedValue });
  };

  // Ensure isDone is always a boolean, never undefined
  const isTaskDone = isDone === true;

  return (
    <div className={`task-row ${isTaskDone ? 'done' : ''}`}>
      {/* Task Done */}
      <div className="checkbox-cell">
        <input type="checkbox" checked={isTaskDone} onChange={(e) => onToggleDone(id, e.target.checked)} />
      </div>
      {/* Task Name */}
      {isEditingName ? (
        <div className="task-cell name-cell">
          <input
            type="text"
            className="name-input"
            aria-label="Task name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={handleNameKeyDown}
            onBlur={handleNameBlur}
            autoFocus
          />
        </div>
      ) : (
        <div
          ref={nameCellRef}
          className="task-cell name-cell editable"
          role="button"
          tabIndex={0}
          aria-label={`Edit task name: ${name}`}
          onClick={startEditingName}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              startEditingName();
            }
          }}
        >
          {name}
        </div>
      )}
      {/* Impact Dropdown */}
      <div className="task-cell impact-cell">
        <select name="impact" value={impact} onChange={handleFieldChange}>
          <option value="Monumental">Monumental</option>
          <option value="Substantial">Substantial</option>
          <option value="Medium">Medium</option>
          <option value="Minimal">Minimal</option>
        </select>
      </div>
      {/* Time Dropdown */}
      <div className="task-cell time-cell">
        <select name="time" value={time} onChange={handleFieldChange}>
          <option value="10 Minutes">10 Minutes</option>
          <option value="30 Minutes">30 Minutes</option>
          <option value="1 Hour">1 Hour</option>
          <option value="2 Hours">2 Hours</option>
        </select>
      </div>
      {/* Task Priority */}
      <div className="task-cell priority-cell">{priority}</div>
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
