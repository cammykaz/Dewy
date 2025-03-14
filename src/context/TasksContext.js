/* TasksContext.js */

/* This component handles task logic and state:
    Maintaining a local state of tasks.
    Adding new tasks to this local state.
    Automatically syncing new tasks with Firestore. */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../firebaseConfig'; // Adjust the import path as necessary
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, query, where } from 'firebase/firestore';

// Create a new Context object. This will be used to provide and consume the tasks state throughout your app.
const TasksContext = createContext();

// Custom hook for consuming the context
export const useTasks = () => useContext(TasksContext);

// Provider component that will wrap your app's component tree to provide the tasks state.
export const TasksProvider = ({ children, userId }) => {
    // Declare the 'tasks' state variable, initializing it with an empty array.
    // Unlike a regular array, updating `tasks` with `setTasks` triggers an
    // automatic UI refresh, and, when logged in, syncing with the Firestore database.
    const [tasks, setTasks] = useState([]); // Tasks for the currently active task list
    const [syncing, setSyncing] = useState(false); // Syncing state for pre-login tasks or Firestore
    const [taskLists, setTaskLists] = useState([]); // Array of all task lists (IDs and metadata)
    const [defaultTaskListId, setDefaultTaskListId] = useState(null); // ID of the default task list
    const [activeTaskListId, setActiveTaskListId] = useState(null); // ID of the currently active task list
    const loginProcessCompleteRef = useRef(false);

    /**
    * Utility Functions
    * ------------------
    * These functions help handle task syncing, fetching, and state management.
    */

    // Priority Calculation Function
    const calculatePriority = (impact, time) => {
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
        };
        const priority = priorityMapping[`${impact}, ${time}`] || 'N/A'; // Default if no match

        console.log(`Calculating priority for impact: ${impact}, time: ${time}, result: ${priority}`);
        return priority;
    };

    const syncTaskWithFirestore = useCallback(async (task) => {
        console.log("🔄 Syncing task:", task);

        // Use the tasklist associated with the task if one exists, otherwise use the default tasklist.
        const taskListToUse = task.taskListId || defaultTaskListId;

        // Create 'taskForFirestore' as version of the task with tempId omitted. This is "destructuring".
        const { id: tempId, ...taskForFirestore } = task;

        try {
            // Add the task to Firestore
            const tasksRef = collection(db, `users/${userId}/taskLists/${taskListToUse}/tasks`);
            const docRef = await addDoc(tasksRef, taskForFirestore); // Add task to Firestore
            // Immediately update the task to include the Firestore-generated ID as a field
            await updateDoc(docRef, { id: docRef.id });
            // Update the task in local state with the Firestore-generated ID
            const syncedTask = { ...task, id: docRef.id };
            setTasks(currentTasks =>
                currentTasks.map(task => task.id === tempId ? syncedTask : task) // Replace tempId with Firestore ID
            );
            console.log(`✅ Task saved with Firestore ID: ${docRef.id}`);
            return syncedTask;
        } catch (error) {
            console.error("❌ Error syncing task with Firestore:", error);
            return null;
        }
    }, [userId, defaultTaskListId, setTasks]);



    const handlePreLoginTasks = useCallback(async (defaultTaskListId) => {
        try {
            // Filter pre-login tasks
            const preLoginTasks = tasks.filter(task => task.id.startsWith("temp-"));
            if (preLoginTasks.length === 0) {
                console.log("No pre-login tasks found.");
                return;
            }
            console.log(`🔄 Syncing ${preLoginTasks.length} pre-login tasks to default tasklist`);
            // Add tasklistId for each pre-login task
            const tasksWithListId = preLoginTasks.map(task => ({
                ...task,
                taskListId: defaultTaskListId
            }));
            // Sync each pre-login task to Firestore in background
            for (const task of tasksWithListId) {
                await syncTaskWithFirestore(task);
            }
            console.log("✅ Pre-login tasks successfully synced.");
        } catch (error) {
            console.error("❌ Error syncing pre-login tasks:", error);
        }
    }, [tasks, userId, syncTaskWithFirestore]);


    // Function to clear all tasks from the tasks array. Useful for handling user logout.
    const clearTasks = useCallback(() => {
        console.log("clearTasks called");
        setTasks([]);
        loginProcessCompleteRef.current = false;  // Reset the ref on logout
        console.log("loginProcessCompleteRef reset to false on logout");
    }, []);

    // Fetch tasks. Either from a tasklist explicitly given to it or using the currently active task list from state.
    const fetchTasks = useCallback(async (overrideTaskListId = null) => {
        // Use the override if provided (e.g. fetchTasks(taskListToUse)), otherwise use the state (e.g. when fetchTasks() is called for switching between tasklists)
        const taskListIdToUse = overrideTaskListId || activeTaskListId;
        // If either userId or activeTaskListId is missing the function exits early
        if (!userId || !taskListIdToUse) {
            console.log("❌ Cannot fetch tasks - missing user ID or tasklist ID");
            return;
        }
        try {
            console.log(`📥 Fetching tasks for list: ${taskListIdToUse}`);
            const tasksRef = collection(db, `users/${userId}/taskLists/${taskListIdToUse}/tasks`);
            const snapshot = await getDocs(tasksRef);
            const fetchedTasks = snapshot.docs.map(doc => ({
                id: doc.id, // Add the document ID as `id`
                ...doc.data(), // Spread the document's data fields
            }));
            setTasks(fetchedTasks);
            console.log(`✅ Fetched ${fetchedTasks.length} tasks`);
        } catch (error) {
            console.error(`❌ Error fetching tasks:`, error);
        }
    }, [userId, activeTaskListId, setTasks]); // Re-fetch tasks whenever the user or active task list changes


    const handleTasksOnLogin = useCallback(async () => {
        console.log("Starting login handling (handleTasksOnLogin)...");
        // Ensure a user is logged in
        if (!userId) {
            console.log("❌ No user ID found. Exiting login handler.");
            return;
        }
        setSyncing(true); // Start syncing indicator
        loginProcessCompleteRef.current = false;

        try {
            // Step 1: Fetch all task lists
            console.log("📥 Fetching tasklists...");
            const taskListsRef = collection(db, `users/${userId}/taskLists`);
            const taskListsSnapshot = await getDocs(taskListsRef);
            const taskLists = taskListsSnapshot.docs.map(doc => ({ // converts the Firestore documents into usable JavaScript objects
                id: doc.id,
                ...doc.data(),
            }));
            setTaskLists(taskLists); //updates app's state with the task lists so they can appear in the UI
            console.log(`✅ Found ${taskLists.length} tasklists`);

            // Step 2: Check for the Default Task List
            let defaultTaskList = taskLists.find(taskList => taskList.name === "Default Task List");
            if (!defaultTaskList) {
                console.log("🔄 Default Task List not found - creating it now");
                const newDefaultTaskListRef = await addDoc(taskListsRef, {
                    name: "Default Task List",
                    description: "A space for tasks not tied to a specific task list.",
                    createdAt: new Date(),
                });
                defaultTaskList = { id: newDefaultTaskListRef.id, name: "Default Task List", description: "A space for tasks not tied to a specific task list." };
                setTaskLists(prev => [...prev, defaultTaskList]);
                console.log("✅ Default Task List created");
            }
            setDefaultTaskListId(defaultTaskList.id);
            console.log(`ℹ️ Default Tasklist ID: ${defaultTaskList.id}`);


            // Step 3: Determining correct tasklist to activate
            console.log("🔄 Determining tasklist to activate...");
            const thereArePreLoginTasks = tasks.some(task => task.id.startsWith("temp-"));
            const lastActiveTaskList = localStorage.getItem("lastActiveTaskList")
            let taskListToUse;
            if (thereArePreLoginTasks) {
                taskListToUse = defaultTaskList.id;
            } else if (lastActiveTaskList) {
                taskListToUse = lastActiveTaskList;
            } else {
                taskListToUse = defaultTaskList.id;
            }
            setActiveTaskListId(taskListToUse);


            // Step 4: Handle pre-login tasks
            if (thereArePreLoginTasks) {
                console.log("🔄 Processing pre-login tasks...");
                await handlePreLoginTasks(defaultTaskList.id);
            } else {
                console.log("ℹ️ No pre-login tasks to process");
            }

            // Step 5: Fetch tasks
            await fetchTasks(taskListToUse);

            console.log("✅ Login process complete");
        } catch (error) {
            console.error("❌ Error during login handling:", error);
        } finally {
            setSyncing(false); // End syncing process
            loginProcessCompleteRef.current = true;
        }
    }, [userId, tasks, activeTaskListId, handlePreLoginTasks, fetchTasks, setTaskLists, setDefaultTaskListId, setActiveTaskListId,]);


    /**
    * React Effect Hooks
    * ------------------
    * These run when certain variables change (like userId) or when tasks state updates.
    */

    // Fetch tasks when a tasklist is switched to
    useEffect(() => {
        if (activeTaskListId && loginProcessCompleteRef.current) {
            fetchTasks();
        }
    }, [activeTaskListId, fetchTasks]);


    // When a user logs in run handleTasksOnLogin
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

    // Every time the active tasklist changes, save it to localStorage under "lastActiveTasklist"
    useEffect(() => {
        if (activeTaskListId) {
            localStorage.setItem("lastActiveTaskList", activeTaskListId);
        }
    }, [activeTaskListId]);


    /**
    * Task List Management Functions
    * ------------------------------
    * These functions handle creating, fetching, and deleting task lists.
    */



    // Create a new task list
    const createTaskList = async (name, description = "") => {
        if (!userId || !name) return;
        try {
            const taskListsRef = collection(db, `users/${userId}/taskLists`);
            const newTaskList = {
                name,
                description,
                createdAt: new Date(),
            };
            const docRef = await addDoc(taskListsRef, newTaskList);
            setTaskLists((prev) => [...prev, { id: docRef.id, ...newTaskList }]);
            setActiveTaskListId(docRef.id);
        } catch (error) {
            console.error("Error creating task list:", error);
        }
    };


    /**
    * Task Management Functions
    * -------------------------
    * These functions are exposed to other components to handle task addition and deletion.
    */

    // Function to add a new task to the tasks array. This will be available to any component consuming the TasksContext.
    const addTask = async (newTask) => {
        console.log("Adding task to local state. addTask called with newTask:", newTask);

        // Ensure an active task list is set
        if (!activeTaskListId) {
            console.log("No active task list set.");
        }

        // Calculate the priority
        const priority = calculatePriority(newTask.impact, newTask.time);

        // Add priority and tasklistId as properties of the task object
        const taskWithDetails = {
            ...newTask,
            priority,
            taskListId: userId ? activeTaskListId : null,  // 👈 Only assign taskListId if logged in
        };

        // Add task to local state
        setTasks((currentTasks) => [...currentTasks, taskWithDetails]);

        // Sync with Firestore if logged in
        if (userId) {
            console.log("User found, syncing new task. Logged in with userId:", userId);
            console.log("Current activeTaskListId before syncing:", activeTaskListId);
            const syncedTask = await syncTaskWithFirestore(taskWithDetails); // Use the existing sync function
            if (syncedTask) {
                console.log("New task synced to Firestore with ID:", syncedTask.id);
            } else {
                console.error("Failed to sync new task to Firestore.");
            }
        } else {
            console.log("User not logged in. Task added only to local state.");
        }
    };

    // Update Task Function
    const updateTask = async (taskId, updatedFields) => {
        if (!activeTaskListId) {
            console.error("No active task list selected.");
            return;
        }

        // Find the task that needs to be updated
        const updatedTasks = tasks.map(task => {
            if (task.id === taskId) {
                // Recalculate priority if impact or time is updated
                const updatedImpact = updatedFields.impact || task.impact;
                const updatedTime = updatedFields.time || task.time;
                const updatedPriority = calculatePriority(updatedImpact, updatedTime);

                // Return updated task with recalculated priority
                return { ...task, ...updatedFields, priority: updatedPriority };
            }
            return task; // No change for other tasks
        });

        // Update the local state with the new list of tasks
        setTasks(updatedTasks);

        // Sync the updated task with Firestore if logged in
        if (userId) {
            try {
                const taskRef = doc(db, `users/${userId}/taskLists/${activeTaskListId}/tasks`, taskId);
                const updatedTask = updatedTasks.find(task => task.id === taskId); // Find the updated task
                await updateDoc(taskRef, updatedTask);  // Sync all updated fields
                console.log("Task synced with Firestore:", updatedTask);
            } catch (error) {
                console.error("Error updating task in Firestore:", error);
            }
        }
    };

    // Task Done Function
    const toggleTaskDone = async (taskId, isDone) => {
        if (!activeTaskListId) {
            console.error("No active task list selected.");
            return;
        }

        // Find and update the 'isDone' field for the task with taskId
        const updatedTasks = tasks.map(task => {
            if (task.id === taskId) {
                return { ...task, isDone };
            }
            return task;
        });

        // Update the local state with the new list of tasks
        setTasks(updatedTasks);

        // Sync the updated task with Firestore if logged in
        if (userId) {
            try {
                const taskRef = doc(db, `users/${userId}/taskLists/${activeTaskListId}/tasks`, taskId);
                const updatedTask = updatedTasks.find(task => task.id === taskId); // Find the updated task
                await updateDoc(taskRef, updatedTask);  // Sync all updated fields
                console.log("Task marked as done and synced with Firestore:", updatedTask);
            } catch (error) {
                console.error("Error updating task done status to Firestore:", error);
            }
        }
    };


    // Delete Task Function
    const deleteTask = async (taskId) => {
        try {
            // Step 1: Update the local state to remove the task
            setTasks(currentTasks => currentTasks.filter(task => task.id !== taskId));
            console.log("Task deleted from local state (and therefore from UI):", taskId);

            // Step 2: If the user is logged in, delete the task from Firestore
            if (userId && activeTaskListId) {
                console.log(`Deleting task from Firestore, from task list ID: ${activeTaskListId}`);
                const taskRef = doc(db, `users/${userId}/taskLists/${activeTaskListId}/tasks`, taskId);
                await deleteDoc(taskRef);
                console.log("Task successfully deleted from Firestore:", taskId);
            } else {
                console.warn("User not logged in or no active task list set. Firestore deletion skipped.");
            }
        } catch (error) {
            console.error("Error deleting task:", error);
        }
    };


    // The value prop of the provider component provides the tasks state and updater functions to any consuming components.
    return (
        <TasksContext.Provider value={{
            tasks,
            setTasks,
            addTask,
            deleteTask,
            clearTasks,
            updateTask,
            toggleTaskDone,
            taskLists,
            setTaskLists,
            activeTaskListId,
            setActiveTaskListId,
            createTaskList
        }}>
            {children} {/* This represents any child components that will have access to the tasks context. */}
        </TasksContext.Provider>
    );
};