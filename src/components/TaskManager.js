/* TaskManager.js */

// TaskManager serves as the UI layer that interacts with the tasks context.
// It's responsible for rendering tasks-related UI components such as the
// task submission form, (TaskSubmission) and the task list (TableView).

// Import React and necessary components
import React from 'react';
import TaskSubmission from './TaskSubmission';
import TableView from './TableView';

// Use the custom hook from TasksContext for task management
import { useTasks } from '../context/TasksContext'; // Adjust the import path as necessary

//React component function 'TaskManager'
function TaskManager({ currentUser }) {
  // // Access tasks and task management functions from the tasks context, via the useTasks hook
  const { tasks, addTask, deleteTask, updateTask } = useTasks();

  return (
    <div>
      {/* Section for adding new tasks */}
      <h2>Add A New Task</h2>
      <TaskSubmission addTask={addTask} />

      {/* Section for displaying the list of tasks */}
      <h2>Task List</h2>
      <TableView
        tasks={tasks}
        onDelete={deleteTask}
        onUpdate={updateTask}
      />

      {/* Placeholder for future Matrix View section */}
      <h2>Matrix View</h2>
      {/* Matrix View content will go here */}
    </div>
  );
}

export default TaskManager;
