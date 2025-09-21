// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    // Replace with your Firebase configuration
     apiKey: "AIzaSyD2unswHpAyZnqCcfpPvmN23yP0LKEO6KU",
  authDomain: "molarmind-c7de4.firebaseapp.com",
  projectId: "molarmind-c7de4",
  storageBucket: "molarmind-c7de4.firebasestorage.app",
  messagingSenderId: "224128758387",
  appId: "1:224128758387:web:80110d5c24c15beabb7006",
  measurementId: "G-YZM4LLHS7L"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Set persistence to LOCAL
setPersistence(auth, browserLocalPersistence)
    .then(() => {
        console.log('Firebase persistence set to LOCAL');
    })
    .catch((error) => {
        console.error('Error setting persistence:', error);
    });
