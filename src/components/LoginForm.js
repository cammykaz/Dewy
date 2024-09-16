/* LoginForm.js */

import React, { useState, useContext } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext'; 

// LoginForm component for user authentication
const LoginForm = () => {
    // State for form inputs
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Use the custom hook to get the setCurrentUser function from context
    const { setCurrentUser } = useAuth();

    // Function to handle form submission
    const handleSubmit = async (e) => {
        e.preventDefault(); // Prevent default form submission action
        try {
          // Attempt to sign in with email and password
          await signInWithEmailAndPassword(auth, email, password);
          // If successful, onAuthStateChanged in AuthContext will update currentUser
          console.log('Logged in');
        } catch (error) {
          console.error('Login error:', error.message);
        }
      };

      return (
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            required
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            required
          />
          <button type="submit">Login</button>
        </form>
    );
};
    
export default LoginForm;