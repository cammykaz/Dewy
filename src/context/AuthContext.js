/* AuthContext.js */

// Import necessary hooks and Firebase auth functions
import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';

// Create a context object to hold the authentication state and any auth-related functions
export const AuthContext = createContext();

// AuthProvider component that wraps around your app's components to provide authentication context
export const AuthProvider = ({ children }) => {
  // State to keep track of the current user. Null when no user is logged in.
  const [currentUser, setCurrentUser] = useState(null);

  // Effect hook to monitor authentication state changes.
  useEffect(() => {
    // This function is called automatically by React whenever there's a change in the user's authentication status.
    // `user` will either be an object with user information (when logged in) or null (when logged out).
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user); // Updates the state with the current user object or null.
    });
    // React calls `unsubscribe()` when the component unmounts, which stops listening to auth state changes.
    return unsubscribe;
  }, []);

    // Logout function   
    const logout = async () => {
      await signOut(auth);
  };

  // Provide auth related functions through context provider
  return (
    <AuthContext.Provider value={{ currentUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the authentication context
/* Use the useAuth hook within your App.js to conditionally render
parts of your UI based on whether a user is logged in */
export function useAuth() {
  return useContext(AuthContext);
}
