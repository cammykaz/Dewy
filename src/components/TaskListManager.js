/* TaskListManager.js */

/**
 * TaskListManager.js
 *
 * This component handles the management of task lists. It allows users to:
 * - View all available task lists.
 * - Switch between task lists by setting the active task list.
 * - Create new task lists.
 *
 * It integrates with the TasksContext to manage task list state and updates.
 */


import React from 'react';
import { useTasks } from '../context/TasksContext';

function TaskListManager() {
    // Destructure relevant state and functions from useTasks()
    const { taskLists = [], createTaskList, setActiveTaskListId, activeTaskListId } = useTasks();

    // Handle dropdown selection
    const handleTaskListChange = (event) => {
        const selectedValue = event.target.value;

        if (selectedValue === "create_new") {
            const name = prompt("Enter the name of the new task list:");
            if (name) createTaskList(name);
        } else {
            setActiveTaskListId(selectedValue);
        }
    };

    return (
        <div style={{ position: 'absolute', top: '10px', right: '10px' }}>
            <select value={activeTaskListId || ''} onChange={handleTaskListChange}>
                {/* Render existing task lists */}
                {taskLists.map((list) => (
                    <option key={list.id} value={list.id}>
                        {list.name}
                    </option>
                ))}
                {/* Option to create a new task list */}
                <option value="create_new">➕ Create New Task List</option>
            </select>
        </div>
    );
}

export default TaskListManager;