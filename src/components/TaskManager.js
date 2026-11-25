/* TaskManager.js */

// TaskManager serves as the UI layer that interacts with the tasks context.
// It's responsible for rendering tasks-related UI components such as the
// task submission form, (TaskSubmission) and the task list (TableView).
// Inside an open journal (inJournal), the journal's title already says what this is, so the page
// headings are dropped, and the add-task line and column labels stay pinned while the tasks scroll.

import React from 'react';
import TaskSubmission from './TaskSubmission';
import TableView, { TaskListHeader } from './TableView';
import { useTasks } from '../context/TasksContext';

function TaskManager({ inJournal = false }) {
  // Access tasks and task management functions from the tasks context, via the useTasks hook
  const { tasks, addTask, deleteTask, updateTask, toggleTaskDone } = useTasks();

  const header = tasks.length > 0 && <TaskListHeader />;
  const list = (
    <TableView
      tasks={tasks}
      onDelete={deleteTask}
      onFieldUpdate={updateTask}
      onToggleDone={toggleTaskDone}
    />
  );

  if (inJournal) {
    return (
      <div className="task-manager in-journal">
        <div className="task-manager-pinned">
          <TaskSubmission addTask={addTask} />
          {header}
        </div>
        {list}
      </div>
    );
  }

  return (
    <div className="task-manager">
      {/* Section for adding new tasks */}
      <h2>Add A New Task</h2>
      <TaskSubmission addTask={addTask} />

      {/* Section for displaying the list of tasks */}
      <h2>Task List</h2>
      {header}
      {list}

      {/* Placeholder for future Matrix View section */}
      <h2>Matrix View</h2>
      {/* Matrix View content will go here */}
    </div>
  );
}

export default TaskManager;
