/* App.js */

// Manages global context providers, and routing

import './App.css'; // Import App-wide styles
import { useAuth } from './context/AuthContext';
import LoginForm from './components/LoginForm';
import TaskManager from './components/TaskManager';
import { TasksProvider } from './context/TasksContext'
import LogoutButton from './components/LogoutButton';
import TaskListManager from './components/TaskListManager';


function App() {
  // Use the useAuth hook to access current user and logout
  const { currentUser } = useAuth();

  return (
    <TasksProvider userId={currentUser?.uid}>
      <div className="app">
        {/* Conditional rendering based on currentUser presence */}
        {/* Render the LoginForm if no user is logged in */}
        {!currentUser && <LoginForm />}
        {/* Render the TaskListManager and LogoutButton if a user IS logged in */}
        {currentUser && (
          <>
            <p>Yo! {currentUser.email}</p>
            <LogoutButton />
            <TaskListManager />
          </>
        )}
        {/* Always render the TaskManager */}
        <TaskManager />
      </div>
    </TasksProvider >
  );
}

export default App;