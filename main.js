// Global array to temporarily store tasks
let tempTasks = [];

// Imports and Initializations
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js'
import { getAnalytics } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js'
import { getFirestore, collection, addDoc, doc, updateDoc, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js'
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
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

// Listener for login state, including when the app starts
onAuthStateChanged(auth, async user => {
    if (user) {
        console.log("User is signed in, proceed to loadUserTasks()");
        await loadUserTasks();
        // Save any tempTasks to Firestore then clear tempTasks
        if (tempTasks.length > 0) {
            console.log("Temp tasks exist -- save and clear");
            await Promise.all(tempTasks.map(task => saveTaskToDatabase(task)));
            tempTasks = []; // Clear tempTasks
        }
        document.getElementById('loginInfo').style.display = 'block';
        document.getElementById('loginForm').style.display = 'none';
        // Show email address in welcome message
        document.getElementById('userName').textContent = user.email;
    } else {
        console.log("User is not signed in or has logged out");
        clearTasks(); // Clear tasks from UI and tempTasks array
        document.getElementById('loginInfo').style.display = 'none';
        document.getElementById('loginForm').style.display = 'block';
    }
});

// Utility Functions
function createTaskObject(name, impact, time) {
    return {
        name: name,
        impact: impact,
        time: time,
        priority: calculatePriority(impact, time),
        createdAt: new Date()
    };
}
function addToTableView(task) {
    const taskGrid = document.getElementById('taskGrid'); // The container for the grid
    // Create a new div element in the DOM to be used as our task row, with CSS class 'task-row'
    const taskRow = document.createElement('div');
    taskRow.classList.add('task-row');
    // Create and append task cells (div elements) for each task attribute
    taskRow.appendChild(createCell(task.name));
    taskRow.appendChild(createCell(task.impact));
    taskRow.appendChild(createCell(task.time));
    taskRow.appendChild(createCell(task.priority));
    // Calculate task Priority
    //Create delete button for task
    const deleteBtn = createDeleteButton(task);
    taskRow.appendChild(deleteBtn);
    // Associate the taskRow DOM element with the task object so we can access and manipulate the task's UI representation elsewhere in the code
    task.tableViewElement = taskRow;
    // Append the new row to the grid
    taskGrid.appendChild(taskRow);
    //Log
    console.log("Task added to table view:", task);
}
function createCell(content) {
    const cell = document.createElement('div');
    cell.classList.add('task-cell');
    cell.textContent = content;
    return cell;
}
function createDeleteButton(task) {
    const deleteBtn = document.createElement('div');
    deleteBtn.classList.add('delete-btn');
    deleteBtn.textContent = 'X';
    deleteBtn.onclick = () => deleteTask(task);
    return deleteBtn;
}
function deleteTask(task) {
    console.log(`Commence deleting of: "${task.name}"`);
    console.log("tempTasks:", tempTasks);
    console.log("task.id:", task.id);
    const tempTaskIndex = tempTasks.findIndex(t => t === task);
    if (tempTaskIndex > -1) {
        // Task is in tempTasks, remove it
        tempTasks.splice(tempTaskIndex, 1);
        console.log("task removed from tempTasks");
        console.log("tempTasks:", tempTasks);
    } else if (auth.currentUser && task.id) {
        // Task is in Firestore, delete it
        const userId = auth.currentUser.uid;
        const taskDocRef = doc(db, `users/${userId}/tasks`, task.id);
        deleteDoc(taskDocRef)
            .then(() => {
                console.log("Task deleted from Firestore");
            })
            .catch(error => console.error("Error deleting task: ", error));
    } else {
        console.error("Task not found or user not logged in");
    }
    removeTaskFromUI(task); // Update this function as needed
}
function removeTaskFromUI(task) {
    // Assuming task.tableViewElement holds a reference to the task's UI element
    if (task.tableViewElement) {
        task.tableViewElement.remove(); // Remove the task's table view element
    }
}
function clearTasks() {
    document.getElementById('taskGrid').innerHTML = '';
    tempTasks = [];
    console.log("Tasks cleared from UI and tempTasks array");
}
function calculatePriority (impact, time) {
    const priorityMapping = {
        'Monumental, 10 Minutes': 'A',
        'Monumental, 30 Minutes': 'B',
        'Substantial, 10 Minutes': 'C',
        'Substantial, 30 Minutes': 'D',
        'Monumental, 1 Hour': 'E',
        'Monumental, 2 Hours': 'F',
        'Substantial, 1 Hour': 'G',
        'Substantial, 2 Hours': 'H',
        'Medium, 10 Minutes': 'I',
        'Medium, 30 Minutes': 'J',
        'Minimal, 10 Minutes': 'K',
        'Minimal, 30 Minutes': 'L',
        'Medium, 1 Hour': 'M',
        'Medium, 2 Hours': 'N',
        'Minimal, 1 Hour': 'O',
        'Minimal, 2 Hours': 'P'
    }
    console.log("priority:", priorityMapping[`${impact}, ${time}`]);
   
    return priorityMapping[`${impact}, ${time}`];   
}


// Firebase Operations
function saveTaskToDatabase(task) {
    console.log("Start saving tasks to database");
    // Check if a user is logged in
    if (auth.currentUser) {
        const userId = auth.currentUser.uid; // Get the logged-in user's ID
        // Reference to 'tasks' sub-collection under the user's document
        const usersTasks = collection(db, `users/${userId}/tasks`);
        // Prepare task data for Firestore (exclude tableViewElement)
        const taskDataForFirestore = { ...task };
        delete taskDataForFirestore.tableViewElement;
        // Add the task to Firestore database
        addDoc(usersTasks, taskDataForFirestore)
            .then((docRef) => {
                console.log("Task saved to Firestore:", taskDataForFirestore);
                console.log("Task added to firestore with ID: ", docRef.id);
                task.id = docRef.id
            })
            .catch((error) => console.error("Error adding task to firestore: ", error));
        console.log("tempTasks:", tempTasks);
    } else {
        console.error("No authenticated user. Task not saved.");
    }
}
async function handleLogin(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        // Update the last login time in the user's document
        const userDoc = doc(db, "users", user.uid);
        await updateDoc(userDoc, { "last login": new Date() });
        console.log("Logged in as:", user.email);
    } catch (error) {
        console.error("Login failed:", error.message);
    }
}
async function loadUserTasks() {
    if (auth.currentUser) {
        const userId = auth.currentUser.uid;
        const userTasksCollection = collection(db, `users/${userId}/tasks`);
        console.log("Loading user tasks from Firestore...");
        try {
            const querySnapshot = await getDocs(userTasksCollection);
            querySnapshot.forEach(doc => {
                const task = doc.data();
                task.id = doc.id; // Include the Firestore document ID in the task object
                addToTableView(task); // Update UI with each task
                console.log("Loaded task from Firestore:", task);
            });
        } catch (error) {
            console.error("Error loading tasks: ", error);
            throw error; // Rethrow the error to be handled in the calling function
        }
    } else {
        console.error("No authenticated user. Cannot load tasks.");
        throw new Error("No authenticated user");
    }
}


//Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOMContentLoaded event");
    // Task Form Submission
    const taskForm = document.getElementById('taskForm');
    taskForm.addEventListener('submit', function (event) {
        event.preventDefault();

        console.log("task submitted");

        const taskName = document.getElementById('taskName').value;
        const taskImpact = document.getElementById('taskImpact').value;
        const taskTime = document.getElementById('taskTime').value;
        // Capture other fields similarly

        // Create task object
        console.log("create task object");
        const task = createTaskObject(taskName, taskImpact, taskTime);
        console.log("Task object created:", task);

        // Add task to table view
        addToTableView(task);

        // Store task
        if (auth.currentUser) {
            console.log("Logged in so proceed to saveTaskToDatabase");
            saveTaskToDatabase(task);
        } else {
            console.log("Not logged in so proceed to push to temp array");
            tempTasks.push(task);
            console.log("tempTasks:", tempTasks);
        }

        // Clear the form fields after submission
        taskForm.reset();
    });
    // Login
    const loginForm = document.getElementById('loginForm');
    loginForm.addEventListener('submit', function (event) {
        event.preventDefault();
        const email = document.getElementById('userEmail').value;
        const password = document.getElementById('userPassword').value;
        console.log("Login detected, proceed to handleLogin");
        handleLogin(email, password);
    });
    // Logout
    const logoutButton = document.getElementById('logoutButton');
    logoutButton.addEventListener('click', async () => {
        try {
            await signOut(auth);
            console.log("User signed out");
        } catch (error) {
            console.error("Error signing out:", error);
        };
    });
});