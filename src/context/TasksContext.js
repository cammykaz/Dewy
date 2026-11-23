/* TasksContext.js */

/* This component handles task logic and state:
    Maintaining a local state of tasks.
    Adding new tasks to this local state.
    Automatically syncing new tasks with Firestore. */

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { db } from '../firebaseConfig'; // Adjust the import path as necessary
import { collection, addDoc, updateDoc, deleteDoc, getDocs, doc, query, where, serverTimestamp, writeBatch, setDoc, deleteField } from 'firebase/firestore';
import { byMostRecentActivity } from '../utils/taskListSort';
import { isReservedJournalName } from '../utils/journals';

// Firestore allows at most 500 operations per write batch
const FIRESTORE_BATCH_LIMIT = 500;

// How many actions undo can step back through
const UNDO_LIMIT = 100;

// Firestore rejects undefined; restoring a field that didn't exist before means removing it
const forFirestore = (fields) =>
    Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value === undefined ? deleteField() : value]));

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
    // Edits made to a task while its first Firestore save is in flight (it still has a "temp-" ID).
    // Keyed by temp ID; applied once the task gets its Firestore ID. See syncTaskWithFirestore.
    const pendingEditsRef = useRef({});

    // Undo/redo history for this session (see the "Undo and redo" section below).
    // Entries run later, so they read the current tasks and active list through these refs.
    const historyRef = useRef({ past: [], future: [] });
    const historyQueueRef = useRef(Promise.resolve()); // undo/redo steps run one at a time, in order
    const syncedIdsRef = useRef({}); // temp ID -> Firestore ID, for tasks saved this session
    const currentTasksRef = useRef(tasks);
    currentTasksRef.current = tasks;
    const activeTaskListIdRef = useRef(activeTaskListId);
    activeTaskListIdRef.current = activeTaskListId;

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

    // Record meaningful planning activity on a task list (a task was added, or a task's impact/time changed).
    // Task lists are sorted by this in the dropdown. Local state updates immediately; the Firestore write
    // uses the server's clock so ordering is consistent across devices.
    // Returns the local time it recorded, so undo/redo can restore it.
    const markTaskListActive = useCallback((taskListId) => {
        if (!taskListId) return undefined;
        const now = new Date();
        setTaskLists(currentLists =>
            currentLists.map(list => list.id === taskListId ? { ...list, lastActivityAt: now } : list)
        );
        if (!userId) return now;
        updateDoc(doc(db, `users/${userId}/taskLists`, taskListId), { lastActivityAt: serverTimestamp() })
            .catch(error => console.error("Error updating task list activity:", error));
        return now;
    }, [userId]);

    // Record that a journal was picked up: taken down from the shelf, or opened. The desk shows the journals used most
    // recently (picked up or planned in), so this is what brings a shelved journal down onto the desk.
    // It isn't planning activity, so lastActivityAt (and the dropdown's order) is left alone.
    // Returns the local time it recorded, so undo/redo can restore it.
    const markTaskListPickedUp = useCallback((taskListId) => {
        if (!taskListId) return undefined;
        const now = new Date();
        setTaskLists(currentLists =>
            currentLists.map(list => list.id === taskListId ? { ...list, lastPickedUpAt: now } : list)
        );
        if (!userId) return now;
        updateDoc(doc(db, `users/${userId}/taskLists`, taskListId), { lastPickedUpAt: serverTimestamp() })
            .catch(error => console.error("Error recording that a task list was picked up:", error));
        return now;
    }, [userId]);

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
            syncedIdsRef.current[tempId] = docRef.id; // undo/redo entries recorded with the temp ID find it by this
            // Swap tempId for the Firestore ID in local state, keeping any edits made while addDoc was in flight
            setTasks(currentTasks =>
                currentTasks.map(t => t.id === tempId ? { ...t, id: docRef.id } : t)
            );
            // Store the Firestore-generated ID as a field, along with any edits made while addDoc was in flight
            const pendingEdits = pendingEditsRef.current[tempId] || {};
            delete pendingEditsRef.current[tempId];
            await updateDoc(docRef, { id: docRef.id, ...pendingEdits });
            const syncedTask = { ...task, ...pendingEdits, id: docRef.id };
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
        pendingEditsRef.current = {};
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
                const newDefaultTaskList = {
                    name: "Default Task List",
                    description: "A space for tasks not tied to a specific task list.",
                    createdAt: new Date(),
                };
                const newDefaultTaskListRef = await addDoc(taskListsRef, newDefaultTaskList);
                defaultTaskList = { id: newDefaultTaskListRef.id, ...newDefaultTaskList };
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
            } else if (lastActiveTaskList && taskLists.some(taskList => taskList.id === lastActiveTaskList)) {
                // Only restore the remembered list if it still exists (it may have been deleted on another device)
                taskListToUse = lastActiveTaskList;
            } else {
                taskListToUse = defaultTaskList.id;
            }
            setActiveTaskListId(taskListToUse);


            // Step 4: Handle pre-login tasks
            if (thereArePreLoginTasks) {
                console.log("🔄 Processing pre-login tasks...");
                markTaskListActive(defaultTaskList.id); // Guest tasks arriving in a list count as activity (once per sync)
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
    }, [userId, tasks, activeTaskListId, handlePreLoginTasks, fetchTasks, markTaskListActive, setTaskLists, setDefaultTaskListId, setActiveTaskListId,]);


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
    * Undo and redo
    * -------------
    * Each undoable action records an entry { taskListId, undo, redo } when it happens. Undo steps back
    * through the session's history and redo steps forward again; a new action clears the redo steps.
    * History is per session (cleared on login/logout) and only kept in memory.
    *
    * Entries use the low-level helpers below rather than the public actions, so replaying a step
    * doesn't record a new one, and doesn't count as fresh planning activity: activity and pick-up
    * times are put back to what they were. A task in a list that isn't open is changed in Firestore
    * only; it shows up when that list is opened.
    */

    const resolveTaskId = (taskId) => syncedIdsRef.current[taskId] || taskId;
    const isListShowing = (taskListId) => !userId || taskListId === activeTaskListIdRef.current;
    const taskDocRef = (taskListId, taskId) => doc(db, `users/${userId}/taskLists/${taskListId}/tasks`, taskId);

    const writeTaskFields = async (taskListId, taskId, fields) => {
        const id = resolveTaskId(taskId);
        if (isListShowing(taskListId)) {
            setTasks(currentTasks => currentTasks.map(task => task.id === id ? { ...task, ...fields } : task));
        }
        if (!userId) return;
        if (id.startsWith("temp-")) { // still being saved for the first time; applied once it has an ID
            pendingEditsRef.current[id] = { ...pendingEditsRef.current[id], ...fields };
            return;
        }
        await updateDoc(taskDocRef(taskListId, id), forFirestore(fields));
    };

    const removeTask = async (taskListId, taskId) => {
        const id = resolveTaskId(taskId);
        if (isListShowing(taskListId)) setTasks(currentTasks => currentTasks.filter(task => task.id !== id));
        if (userId) await deleteDoc(taskDocRef(taskListId, id));
    };

    // Puts a task back with its original ID and fields, at its original place in the list
    const restoreTask = async (taskListId, task, index) => {
        const restored = { ...task, id: resolveTaskId(task.id) };
        if (isListShowing(taskListId)) {
            setTasks(currentTasks => currentTasks.some(t => t.id === restored.id) ? currentTasks : [
                ...currentTasks.slice(0, index), restored, ...currentTasks.slice(index),
            ]);
        }
        if (userId) await setDoc(taskDocRef(taskListId, restored.id), forFirestore(restored));
    };

    // Sets lastActivityAt or lastPickedUpAt back to a recorded value (undefined removes it)
    const setTaskListTime = async (taskListId, field, value) => {
        setTaskLists(currentLists =>
            currentLists.map(list => list.id === taskListId ? { ...list, [field]: value } : list)
        );
        if (userId) await updateDoc(doc(db, `users/${userId}/taskLists`, taskListId), forFirestore({ [field]: value }));
    };

    const recordUndo = (entry) => {
        const history = historyRef.current;
        history.past.push(entry);
        if (history.past.length > UNDO_LIMIT) history.past.shift();
        history.future = [];
    };

    const fetchTasksRef = useRef(fetchTasks);
    fetchTasksRef.current = fetchTasks;

    // Moves one entry between the stacks. An entry returns false when it can't run yet (a new task
    // still saving), leaving history unchanged. If a step fails, it's dropped and the open list is
    // reloaded, since the local state may no longer match Firestore.
    const stepHistory = useCallback((from, to, method) => {
        historyQueueRef.current = historyQueueRef.current.then(async () => {
            const history = historyRef.current;
            const entry = history[from].pop();
            if (!entry) return;
            try {
                const result = await entry[method]();
                if (result === false) {
                    history[from].push(entry);
                    return;
                }
                history[to].push(entry);
            } catch (error) {
                console.error(`Error during ${method}:`, error);
                fetchTasksRef.current();
            }
        });
        return historyQueueRef.current;
    }, []);

    const undo = useCallback(() => stepHistory('past', 'future', 'undo'), [stepHistory]);
    const redo = useCallback(() => stepHistory('future', 'past', 'redo'), [stepHistory]);

    const clearHistory = useCallback(() => {
        historyRef.current = { past: [], future: [] };
        syncedIdsRef.current = {};
    }, []);

    // A new session (login or logout) starts with no history
    useEffect(() => { clearHistory(); }, [userId, clearHistory]);

    // Take a journal down from the shelf onto the desk (undoable)
    const takeDownTaskList = (taskListId) => {
        const before = taskLists.find(list => list.id === taskListId)?.lastPickedUpAt;
        const after = markTaskListPickedUp(taskListId);
        if (!after) return;
        recordUndo({
            taskListId,
            undo: () => setTaskListTime(taskListId, 'lastPickedUpAt', before),
            redo: () => setTaskListTime(taskListId, 'lastPickedUpAt', after),
        });
    };


    /**
    * Task List Management Functions
    * ------------------------------
    * These functions handle creating, fetching, and deleting task lists.
    */



    // Create a new task list
    const createTaskList = async (name, description = "") => {
        if (!userId || !name) return;
        if (isReservedJournalName(name)) {
            console.warn(`"${name.trim()}" is reserved for the system Default Task List.`);
            return;
        }
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

    // Permanently delete a task list and every task in it.
    // Firestore doesn't delete subcollections with their parent, so the tasks are listed and deleted
    // explicitly, in batches of up to 500 writes, with the list document in the final batch. Lists under
    // 500 tasks are deleted in one atomic batch. If a larger deletion fails partway, the list document
    // (deleted last) survives with its remaining tasks, so it stays visible and can be deleted again.
    // Local state changes only after Firestore confirms. Throws on failure so the caller can report it.
    const deleteTaskList = async (taskListId) => {
        const refuse = (userMessage) => {
            const error = new Error(userMessage);
            error.userMessage = userMessage;
            throw error;
        };
        if (!userId) refuse("You need to be logged in to delete a journal.");
        if (!defaultTaskListId || taskListId === defaultTaskListId) refuse("The Default Task List can't be deleted.");
        // A new task still being saved could otherwise land in the list after it's deleted
        if (taskListId === activeTaskListId && tasks.some(task => task.id.startsWith("temp-"))) {
            refuse("This journal is still saving a new task. Please try again in a moment.");
        }

        const tasksPath = `users/${userId}/taskLists/${taskListId}/tasks`;
        try {
            const tasksSnapshot = await getDocs(collection(db, tasksPath));
            const refsToDelete = [
                ...tasksSnapshot.docs.map(taskDoc => doc(db, tasksPath, taskDoc.id)),
                doc(db, `users/${userId}/taskLists`, taskListId), // list document last
            ];
            for (let start = 0; start < refsToDelete.length; start += FIRESTORE_BATCH_LIMIT) {
                const batch = writeBatch(db);
                refsToDelete.slice(start, start + FIRESTORE_BATCH_LIMIT).forEach(ref => batch.delete(ref));
                await batch.commit();
            }
            console.log(`✅ Deleted task list ${taskListId} and ${tasksSnapshot.docs.length} tasks`);
        } catch (error) {
            console.error("❌ Error deleting task list:", error);
            // Some tasks may have been deleted before the failure; show what's actually left
            if (taskListId === activeTaskListId) fetchTasks();
            throw error;
        }

        setTaskLists(currentLists => currentLists.filter(list => list.id !== taskListId));
        // Undoing an earlier step in this list would recreate its tasks inside a deleted list
        const history = historyRef.current;
        history.past = history.past.filter(entry => entry.taskListId !== taskListId);
        history.future = history.future.filter(entry => entry.taskListId !== taskListId);
        if (taskListId === activeTaskListId) {
            const [nextList] = taskLists.filter(list => list.id !== taskListId).sort(byMostRecentActivity);
            setActiveTaskListId(nextList?.id || defaultTaskListId);
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

        // Same list syncTaskWithFirestore saves to (guests have no list)
        const taskListId = userId ? (taskWithDetails.taskListId || defaultTaskListId) : null;
        const activityBefore = taskLists.find(list => list.id === taskListId)?.lastActivityAt;
        const activityAfter = userId ? markTaskListActive(taskListId) : undefined;
        let removedTask = taskWithDetails; // its latest state, captured when the add is undone
        recordUndo({
            taskListId,
            undo: async () => {
                if (userId && resolveTaskId(taskWithDetails.id).startsWith("temp-")) return false; // still saving
                const id = resolveTaskId(taskWithDetails.id);
                removedTask = currentTasksRef.current.find(task => task.id === id) || removedTask;
                await removeTask(taskListId, id);
                if (activityAfter) await setTaskListTime(taskListId, 'lastActivityAt', activityBefore);
            },
            redo: async () => {
                await restoreTask(taskListId, removedTask, currentTasksRef.current.length);
                if (activityAfter) await setTaskListTime(taskListId, 'lastActivityAt', activityAfter);
            },
        });

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

    // Update Task Function. Works for guests (local state only) and logged-in users (local state + Firestore).
    const updateTask = async (taskId, updatedFields) => {
        // Merge the changes into a task, recalculating priority from the resulting impact and time
        const applyUpdate = (task) => ({
            ...task,
            ...updatedFields,
            priority: calculatePriority(updatedFields.impact || task.impact, updatedFields.time || task.time),
        });

        // Functional update so rapid successive edits each build on the latest state
        setTasks(currentTasks => currentTasks.map(task => task.id === taskId ? applyUpdate(task) : task));

        // Actually changing impact or time is planning activity; renames, completion, and unchanged values aren't
        const currentTask = tasks.find(task => task.id === taskId);
        const isPlanningChange = currentTask && (
            ('impact' in updatedFields && updatedFields.impact !== currentTask.impact) ||
            ('time' in updatedFields && updatedFields.time !== currentTask.time)
        );
        const taskListId = userId ? activeTaskListId : null;
        const activityBefore = taskLists.find(list => list.id === taskListId)?.lastActivityAt;
        const activityAfter = isPlanningChange ? markTaskListActive(activeTaskListId) : undefined;

        // Only write the fields that changed, so overlapping writes can't overwrite each other's fields
        const changes = { ...updatedFields };
        if (currentTask && ('impact' in updatedFields || 'time' in updatedFields)) {
            changes.priority = applyUpdate(currentTask).priority;
        }

        // Undo puts back the previous value of each written field (re-saving an unchanged value isn't a step)
        if (currentTask && Object.keys(changes).some(key => changes[key] !== currentTask[key])) {
            const previous = Object.fromEntries(Object.keys(changes).map(key => [key, currentTask[key]]));
            recordUndo({
                taskListId,
                undo: async () => {
                    await writeTaskFields(taskListId, taskId, previous);
                    if (activityAfter) await setTaskListTime(taskListId, 'lastActivityAt', activityBefore);
                },
                redo: async () => {
                    await writeTaskFields(taskListId, taskId, changes);
                    if (activityAfter) await setTaskListTime(taskListId, 'lastActivityAt', activityAfter);
                },
            });
        }

        // Guests: local state only. Their tasks are synced to Firestore on login (handlePreLoginTasks).
        if (!userId) return;

        // Task is still being saved to Firestore for the first time: hold the edit until it has a real ID
        if (taskId.startsWith("temp-")) {
            pendingEditsRef.current[taskId] = { ...pendingEditsRef.current[taskId], ...changes };
            return;
        }

        if (!activeTaskListId) {
            console.error("No active task list selected. Firestore update skipped.");
            return;
        }

        try {
            const taskRef = doc(db, `users/${userId}/taskLists/${activeTaskListId}/tasks`, taskId);
            await updateDoc(taskRef, changes);
            console.log("Task synced with Firestore:", taskId, changes);
        } catch (error) {
            console.error("Error updating task in Firestore:", error);
        }
    };

    // Task Done Function
    const toggleTaskDone = (taskId, isDone) => updateTask(taskId, { isDone });


    // Delete Task Function
    const deleteTask = async (taskId) => {
        // Undo recreates the task with the same ID and fields. A logged-in task that's still being saved
        // for the first time has no Firestore ID to recreate yet, so that deletion isn't undoable.
        const index = tasks.findIndex(task => task.id === taskId);
        if (index !== -1 && !(userId && taskId.startsWith("temp-"))) {
            const deletedTask = tasks[index];
            const taskListId = userId ? activeTaskListId : null;
            recordUndo({
                taskListId,
                undo: () => restoreTask(taskListId, deletedTask, index),
                redo: () => removeTask(taskListId, deletedTask.id),
            });
        }
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
            createTaskList,
            deleteTaskList,
            defaultTaskListId,
            markTaskListPickedUp,
            takeDownTaskList,
            undo,
            redo
        }}>
            {children} {/* This represents any child components that will have access to the tasks context. */}
        </TasksContext.Provider>
    );
};