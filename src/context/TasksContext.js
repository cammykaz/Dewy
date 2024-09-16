/* TasksContext.js */

/* This component handles task logic and state:
    Maintaining a local state of tasks.
    Adding new tasks to this local state.
    Automatically syncing new tasks with Firestore. */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig'; // Adjust the import path as necessary
import { collection, addDoc, deleteDoc, getDocs, doc } from 'firebase/firestore';

// Create a new Context object. This will be used to provide and consume the tasks state throughout your app.
const TasksContext = createContext();

// Custom hook for consuming the context
export const useTasks = () => useContext(TasksContext);

// Provider component that will wrap your app's component tree to provide the tasks state.
export const TasksProvider = ({ children, userId }) => {
    // Declare the 'tasks' state variable, initializing it with an empty array.
    // Unlike a regular array, updating `tasks` with `setTasks` triggers an
    // automatic UI refresh, and, when logged in, syncing with the Firestore database.
    const [tasks, setTasks] = useState([]);
    const [syncing, setSyncing] = useState(false);

    // Utility Functions

    const syncTaskWithFirestore = useCallback(async (task) => {
        console.log("Syncing task with Firestore (syncTaskWithFirestone):", task);
        // Create variable 'tempId' for the initial local id from the new task
        // Create 'taskForFirestore' as version of the task with id omitted
        const { id: tempId, ...taskForFirestore } = task; // Temporary ID is used locally before Firestore sync
        try {
            // Add the task to Firestore without fetching existing tasks
            console.log("Current local tasks:", tasks);
            const tasksRef = collection(db, "users", userId, "tasks");
            console.log("Adding task to Firestore");
            const docRef = await addDoc(tasksRef, taskForFirestore);
            console.log("Task successfully added to Firestore with ID:", docRef.id);
    
            // Update the task in local state with the Firestore-generated ID
            const syncedTask = { ...task, id: docRef.id };
            setTasks(currentTasks =>
                currentTasks.map(task => task.id === tempId ? syncedTask : task) // Replace tempId with Firestore ID
            );
            return syncedTask;
        } catch (error) {
            console.error("Error syncing task with Firestore:", error);
            return null;
        }
    }, [userId, setTasks]);
    

    const syncPreLoginTasks = useCallback(async () => {
        console.log("Starting syncing of pre-login tasks");
        const tasksRef = collection(db, "users", userId, "tasks");
        console.log("Fetching existing tasks from Firestore...");
        const existingTaskSnapshot = await getDocs(tasksRef);
        const existingTasks = existingTaskSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        for (const task of tasks) {
            const taskExists = existingTasks.some(existingTask => existingTask.id === task.id);
            if (!taskExists) {
                console.log("Task does not exist in Firestore, syncing:", task);
                await syncTaskWithFirestore(task);
            } else {
                console.log("Task already exists in Firestore, skipping:", task);
            }
        }
        console.log("Pre-login task sync completed");
    }, [tasks, syncTaskWithFirestore, userId]);

    // Function to clear all tasks from the tasks array. Useful for handling user logout.
    const clearTasks = useCallback(() => {
        console.log("clearTasks called");
        setTasks([]);
    }, []);

    // Fetching tasks from Firestore
    const fetchTasks = useCallback(async () => {
        try {
            const tasksRef = collection(db, "users", userId, "tasks");
            console.log("Fetching tasks from Firestore...");
            const snapshot = await getDocs(tasksRef);
            const fetchedTasks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            console.log("Tasks fetched from Firestore:", fetchedTasks);
            setTasks(fetchedTasks);
        } catch (error) {
            console.error("Error fetching tasks from Firestore:", error);
        }
    }, [userId]);

    const handleTasksOnLogin = useCallback(async () => {
        console.log("handleTasksOnLogin called");
        if (!userId) return;
        // First, sync pre-login tasks
        setSyncing(true);
        console.log("User logged in, syncing pre-login tasks...");
        await syncPreLoginTasks();
        clearTasks();
        // Then, fetch tasks from Firestore
        console.log("Fetching tasks from Firestore after login...");
        await fetchTasks();
        setSyncing(false);
        console.log("Tasks synced and fetched after login");
    }, [userId, syncPreLoginTasks, clearTasks, fetchTasks]); // Triggered when userId changes, i.e., on login


    // Effect Hooks:

    useEffect(() => {
        if (userId) {
            handleTasksOnLogin();
        }
    }, [userId]);

    // Ability to look into tasks state in console for debugging
    useEffect(() => {
        Object.defineProperty(window, 'ts', {
            get: function () {
                console.table(tasks);
                return null; // This prevents it from showing 'undefined' in the console after logging the table.
            },
            configurable: true, // Allows the property to be redefined
        });
    }, [tasks]); // This effect runs whenever `tasks` changes.

    
    // Task Management Functions:
    
    // Function to add a new task to the tasks array. This will be available to any component consuming the TasksContext.
    const addTask = async (newTask) => {
        console.log("Adding task to local state. addTask called with newTask:", newTask);

        // Add task to local state with a temporary ID
        // Update the local state, basically 'current state = current state + new task' 
        setTasks(currentTasks => [...currentTasks, newTask]);
    
        // If the user is logged in, sync the task with Firestore
        if (userId) {
            console.log("User found, syncing new task. Logged in with userId:", userId);
            const syncedTask = await syncTaskWithFirestore(newTask);
            if (syncedTask) {
                console.log("New task synced to Firestore with ID:", syncedTask.id);
            } else {
                console.log("Failed to sync new task to Firestore.");
            }
        }
    };
    

    // Delete Task Function
    const deleteTask = async (taskId) => {
        // Update the local state to remove the task
        setTasks(currentTasks => currentTasks.filter(task => task.id !== taskId));
        console.log("Task deleted from UI");
        // Attempt to delete the task from Firestore if a user is logged in
        if (userId) {
            try {
                // Attempt to delete the task from Firestore
                console.log("User is logged in, deleting task from Firestore...");
                await deleteDoc(doc(db, "users", userId, "tasks", taskId));
                console.log("Task deleted from Firestore:", taskId);
            }
            catch (error) {
                console.error("Error deleting task from Firestore:", error);
            }
        }
    };


    // The value prop of the provider component provides the tasks state and updater functions to any consuming components.
    return (
        <TasksContext.Provider value={{ tasks, addTask, deleteTask, clearTasks }}>
            {children} {/* This represents any child components that will have access to the tasks context. */}
        </TasksContext.Provider>
    );
};