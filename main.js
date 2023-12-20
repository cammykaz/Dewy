document.addEventListener('DOMContentLoaded', () => {
    const taskForm = document.getElementById('taskForm');

    taskForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const taskName = document.getElementById('taskName').value;
        const taskImpact = document.getElementById('taskImpact').value;
        const taskTime = document.getElementById('taskTime').value;
        // Capture other fields similarly

        // Log values to the console
        // console.log("Task Added:", taskName, taskImpact, taskTime);

        // Add the task to the list
        addTaskToList(taskName, taskImpact, taskTime);
        
        // Next steps: Create a task object and display it in the list

        // Clear the form fields after submission
        taskForm.reset();
    });
});

function addTaskToList(name, impact, time) {
    const taskGrid = document.getElementById('taskGrid'); // The container for the grid

    // Create a new row (div element) for the task
    const taskRow = document.createElement('div');
    taskRow.classList.add('task-row');

    // Create and append cells (div elements) for each task attribute
    taskRow.appendChild(createCell(name));
    taskRow.appendChild(createCell(impact));
    taskRow.appendChild(createCell(time));
   
    // Append the new row to the grid
    taskGrid.appendChild(taskRow);
}

function createCell(content) {
    const cell = document.createElement('div');
    cell.classList.add('task-cell');
    cell.textContent = content;
    return cell;
}