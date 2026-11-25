/* App.js */

// Manages global context providers, and which view is shown:
// - Guests: the task manager directly (immediate task entry, no desk)
// - Logged-in users: the desk of journals, with the active journal possibly open on it
// An open journal is reflected in the URL hash (#list) so browser Back lays it back down.

import './App.css'; // Import App-wide styles
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import LoginForm from './components/LoginForm';
import TaskManager from './components/TaskManager';
import { TasksProvider, useTasks } from './context/TasksContext'
import LogoutButton from './components/LogoutButton';
import Desk from './components/Desk';
import { useUndoShortcuts } from './utils/useUndoShortcuts';

const LIST_HASH = '#list';
const viewFromUrl = () => (window.location.hash === LIST_HASH ? 'list' : 'desk');
const urlWithoutHash = () => window.location.pathname + window.location.search;

function App() {
  // Use the useAuth hook to access current user and logout
  const { currentUser } = useAuth();

  return (
    <TasksProvider userId={currentUser?.uid}>
      <AppContent currentUser={currentUser} />
    </TasksProvider >
  );
}

function AppContent({ currentUser }) {
  const { tasks, activeTaskListId, setActiveTaskListId, markTaskListPickedUp, undo, redo } = useTasks();
  const [view, setView] = useState(viewFromUrl);
  useUndoShortcuts(undo, redo);

  // Browser Back/Forward closes and reopens the journal
  useEffect(() => {
    const handlePopState = () => setView(viewFromUrl());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const showList = useCallback(() => {
    if (window.location.hash !== LIST_HASH) {
      window.history.pushState({ dewyView: 'list' }, '', LIST_HASH);
    }
    setView('list');
  }, []);

  // Opening a journal keeps it on the desk, and opens it over the room
  const openJournal = (taskListId) => {
    markTaskListPickedUp(taskListId);
    setActiveTaskListId(taskListId);
    showList();
  };

  const closeJournal = useCallback(() => {
    if (window.history.state?.dewyView === 'list') {
      window.history.back(); // the popstate handler shows the desk
    } else {
      window.history.replaceState(null, '', urlWithoutHash());
      setView('desk');
    }
  }, []);

  // Login: a guest who already entered tasks sees them right away (TasksContext activates the
  // Default Task List, where they're synced). Everyone else lands on the desk (or stays on a
  // reloaded #list). Logout: reset to the desk for the next login.
  const previousUserRef = useRef(currentUser);
  const hasGuestTasks = tasks.some(task => task.id.startsWith('temp-'));
  useEffect(() => {
    const wasLoggedIn = Boolean(previousUserRef.current);
    previousUserRef.current = currentUser;
    if (!wasLoggedIn && currentUser && hasGuestTasks) {
      showList();
    } else if (wasLoggedIn && !currentUser) {
      window.history.replaceState(null, '', urlWithoutHash());
      setView('desk');
    }
    // Only react to login/logout, not to every task change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  return (
    <div className="app">
      {/* Guests: login form and immediate task entry */}
      {!currentUser && (
        <>
          <LoginForm />
          <TaskManager />
        </>
      )}

      {/* Logged in: the desk, with the active journal open on it when #list */}
      {currentUser && (
        <>
          <div className="app-header">
            <p>Yo! {currentUser.email}</p>
            <LogoutButton />
          </div>
          <Desk
            openJournalId={view === 'list' ? activeTaskListId : null}
            onOpenJournal={openJournal}
            onCloseJournal={closeJournal}
          />
        </>
      )}
    </div>
  );
}

export default App;
