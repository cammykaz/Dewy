// Import Firebase modules
import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDO7P-rfyfPgPgo5nBFRwEVfalfat_Z3Tw",
  authDomain: "tasklist-dcef5.firebaseapp.com",
  projectId: "tasklist-dcef5",
  storageBucket: "tasklist-dcef5.appspot.com",
  messagingSenderId: "616434766010",
  appId: "1:616434766010:web:3419cdf514ff1f0f867283",
  measurementId: "G-4J9S5620ML"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const db = getFirestore(app);
const auth = getAuth(app);
const analytics = getAnalytics(app);

// Export Firebase services for use in other parts of your app
export { db, auth, analytics };