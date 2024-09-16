// LogoutButton.js

import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useTasks } from '../context/TasksContext';

const LogoutButton = () => {
  // Destructures necessary functions from the custom hooks
  const { logout } = useAuth(); // Gets the logout function from the authentication context
  const { clearTasks } = useTasks(); // Gets the clearTasks function from the tasks context

  // Defines what happens when the user clicks the logout button
  const handleLogout = async () => {
    try {
      await logout(); // Defined in AuthContext. Handles user logout by calling Firebase's signOut method.
      clearTasks(); //Defined in TasksContext. Clears tasks from the context upon succesful logout.
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };
  // Renders the logout button and attaches the handleLogout function to its onClick event
  return <button onClick={handleLogout}>Logout</button>;
};

// Makes the LogoutButton component available for use in other parts of the app
export default LogoutButton;
