/* App.js */

// Manages global context providers, and routing

import './App.css'; // Import App-wide styles
import { useAuth } from './context/AuthContext';
import LoginForm from './components/LoginForm';
import TaskManager from './components/TaskManager';
import { TasksProvider } from './context/TasksContext'
import LogoutButton from './components/LogoutButton';


function App() {
  // Use the useAuth hook to access current user and logout
  const { currentUser } = useAuth();

  return (
    <TasksProvider userId={currentUser?.uid}>
      <div className="app">
        {/* Conditional rendering based on currentUser presence */}
        {/* If there is NOT a current user then render... */}
        {!currentUser ? (
          <LoginForm />
          // If there IS a current user then render
        ) : (
          <>
            <p>Yo! {currentUser.email}</p>
            <LogoutButton />
          </>
        )}
        <TaskManager />
      </div>
    </TasksProvider >
  );
}

export default App;