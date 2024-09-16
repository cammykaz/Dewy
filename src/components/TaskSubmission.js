/* TaskSubmission.js */

import React, { useRef } from 'react';
import { useTasks } from '../context/TasksContext';

// Functional component for task submission, receiving `addTask` function via props
function TaskSubmission() {
  // Access addTask from TasksContext
  const { addTask } = useTasks();
  // useRef to keep a persistent, mutable counter
  const tempTaskCounter = useRef(0);

  // Function to handle the form submission
  const handleSubmit = (e) => {
    e.preventDefault(); // Prevent the default form submit behavior (page reload)
    const form = e.target;
    // Directly gather values from the form inputs
    const taskName = form.taskName.value;
    const taskImpact = form.taskImpact.value;
    const taskTime = form.taskTime.value;
    console.log("Form submission received with values:", { taskName, taskImpact, taskTime });

    const tempId = `temp-${tempTaskCounter.current++}`;
    // Create a new task object with the current form input values and a temporary ID
    const newTask = {
      id: tempId,
      name: taskName,
      impact: taskImpact,
      time: taskTime,
      priority: 'To be calculated', // Placeholder, adjust this according to your priority calculation logic
      // You might consider adding a createdAt field here if you need it for ordering or display
      createdAt: new Date()
    };
    console.log("New task object created:", newTask);
    /*Invoke the addTask function provided by TaskManager. Submits the new task to TaskManager,
    where it's added to the state and synced with Firestore for authenticated users.*/
    addTask(newTask);
    form.reset(); // Reset the form to initial values
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type="text" name="taskName" placeholder="Task Name" required />
      <select name="taskImpact">
        <option value="Monumental">Monumental</option>
        <option value="Substantial">Substantial</option>
        <option value="Medium">Medium</option>
        <option value="Minimal">Minimal</option>
      </select>
      <select name="taskTime">
        <option value="10 Minutes">10 Minutes</option>
        <option value="30 Minutes">30 Minutes</option>
        <option value="1 Hour">1 Hour</option>
        <option value="2 Hours">2 Hours</option>
      </select>
      <button type="submit">Add Task</button>
    </form>
  );
}

// Make the TaskSubmission component available for import in other files
export default TaskSubmission;
