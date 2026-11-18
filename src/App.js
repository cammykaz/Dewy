/* App.js */

// Manages global context providers, and which view is shown:
// - Guests: the task manager directly (immediate task entry, no desk)
// - Logged-in users: the home desk of journals, or an opened journal's task list
// The opened-list view is reflected in the URL hash (#list) so browser Back returns to the desk.

import './App.css'; // Import App-wide styles
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './context/AuthContext';
import LoginForm from './components/LoginForm';
import TaskManager from './components/TaskManager';
import { TasksProvider, useTasks } from './context/TasksContext'
import LogoutButton from './components/LogoutButton';
import TaskListManager from './components/TaskListManager';
import Desk from './components/Desk';

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
  const { tasks, setActiveTaskListId } = useTasks();
  const [view, setView] = useState(viewFromUrl);

  // Browser Back/Forward between the desk and an opened list
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

  const openJournal = (taskListId) => {
    setActiveTaskListId(taskListId);
    showList();
  };

  const returnToDesk = () => {
    if (window.history.state?.dewyView === 'list') {
      window.history.back(); // the popstate handler shows the desk
    } else {
      window.history.replaceState(null, '', urlWithoutHash());
      setView('desk');
    }
  };

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

      {/* Logged in: the desk of journals */}
      {currentUser && view === 'desk' && (
        <>
          <div className="app-header">
            <p>Yo! {currentUser.email}</p>
            <LogoutButton />
          </div>
          <Desk onOpenJournal={openJournal} />
        </>
      )}

      {/* Logged in: an opened journal (existing task-list view) */}
      {currentUser && view === 'list' && (
        <>
          <button type="button" className="back-to-desk" onClick={returnToDesk}>
            ← Desk
          </button>
          <p>Yo! {currentUser.email}</p>
          <LogoutButton />
          <TaskListManager />
          <TaskManager />
        </>
      )}
    </div>
  );
}

export default App;
