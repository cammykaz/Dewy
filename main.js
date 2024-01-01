// Imports and Initializations
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js'
import { getFirestore, collection, addDoc, doc, updateDoc, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { getAuth, signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
const firebaseConfig = {
    apiKey: "AIzaSyDO7P-rfyfPgPgo5nBFRwEVfalfat_Z3Tw",
    authDomain: "tasklist-dcef5.firebaseapp.com",
    projectId: "tasklist-dcef5",
    storageBucket: "tasklist-dcef5.appspot.com",
    messagingSenderId: "616434766010",
    appId: "1:616434766010:web:3419cdf514ff1f0f867283",
    measurementId: "G-4J9S5620ML"
    };
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

// Utility Functions
function createTaskObject(name, impact, time) {
    return {
        name: name,
        impact: impact,
        time: time,
        createdAt: new Date()
    };
}   
function addTaskToList(task) {
    const taskGrid = document.getElementById('taskGrid'); // The container for the grid
    // Create a new row (div element) for the task
    const taskRow = document.createElement('div');
    taskRow.classList.add('task-row');
    // Create and append cells (div elements) for each task attribute
    taskRow.appendChild(createCell(task.name));
    taskRow.appendChild(createCell(task.impact));
    taskRow.appendChild(createCell(task.time));
    // Append the new row to the grid
    taskGrid.appendChild(taskRow);
}
function createCell(content) {
    const cell = document.createElement('div');
    cell.classList.add('task-cell');
    cell.textContent = content;
    return cell;
}

// Firebase Operations
function saveTaskToDatabase(task) {
   // Check if a user is logged in
   if (auth.currentUser) {
    const userId = auth.currentUser.uid; // Get the logged-in user's ID
    // Reference to 'tasks' sub-collection under the user's document
    const usersTasks = collection(db, `users/${userId}/tasks`);
    // Add the task to Firestore database
    addDoc(usersTasks, task)
        .then((docRef) => console.log("Task added with ID: ", docRef.id))
        .catch((error) => console.error("Error adding task: ", error));
    } else {
    console.error("No authenticated user. Task not saved.");
    }
}   
function handleLogin(email, password) {
    signInWithEmailAndPassword(auth,  email, password)
        .then(userCredential => {
            const user = userCredential.user;
            // Update the last login time in the user's document
            const userDoc = doc(db, "users", user.uid);
            updateDoc(userDoc, {
                "last login": new Date() // Records the current time as the last login
            });
            console.log("Logged in as:", user.email);
            // Call loadUserTasks after successful login
            loadUserTasks();
            // Additional login success handling
        })
        .catch(error => {
            console.error("Login failed:", error.message);
            // Additional error handling
        });
}
function loadUserTasks() {
    if (auth.currentUser) {
        const userId = auth.currentUser.uid;
        const userTasksCollection = collection(db, `users/${userId}/tasks`);

        getDocs(userTasksCollection)
            .then(querySnapshot => {
                querySnapshot.forEach(doc => {
                    const task = doc.data();
                    addTaskToList(task); // Update UI with each task
                });
            })
            .catch(error => console.error("Error loading tasks: ", error));
    } else {
        console.error("No authenticated user. Cannot load tasks.");
    }
}

//Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Task Form Submission
    const taskForm = document.getElementById('taskForm');
    taskForm.addEventListener('submit', function(event) {
        event.preventDefault();

        const taskName = document.getElementById('taskName').value;
        const taskImpact = document.getElementById('taskImpact').value;
        const taskTime = document.getElementById('taskTime').value;
        // Capture other fields similarly

        // Log values to the console
        // console.log("Task Added:", taskName, taskImpact, taskTime);

        // Create a task object
        const task = createTaskObject(taskName, taskImpact, taskTime);

        // Save task to database
        saveTaskToDatabase(task);

        // Add task to list view
        addTaskToList(task);

        // Clear the form fields after submission
        taskForm.reset();
    });
    // Login Form
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', function(event) {
        event.preventDefault();
        const email = document.getElementById('userEmail').value;
        const password = document.getElementById('userPassword').value;
        handleLogin(email, password);
    });
});