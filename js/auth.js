import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Check if user is already authenticated
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is already signed in, redirect to main page
        window.location.href = './index.html';
    }
});

// Initialize Google Auth Provider
const provider = new GoogleAuthProvider();

// Get the sign-in button
const googleSignInBtn = document.getElementById('googleSignInBtn');

// Add click event listener to the sign-in button
googleSignInBtn.addEventListener('click', async () => {
    try {
        // Sign in with Google
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        // Check if user document exists
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);
        
        if (!userDoc.exists()) {
            // Create new user document in Firestore
            await setDoc(userDocRef, {
                uid: user.uid,
                displayName: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString()
            });
        } else {
            // Update last login time
            await setDoc(userDocRef, {
                lastLogin: new Date().toISOString(),
                lastLoginType: 'explicit'
            }, { merge: true });
        }

        // Store a timestamp of when the user explicitly signed in
        localStorage.setItem('lastExplicitSignIn', new Date().toISOString());

        // Redirect to the main page after successful sign-in
        window.location.href = './index.html';
    } catch (error) {
        console.error("Error during sign in:", error);
        // You can add proper error handling here (e.g., showing an error message to the user)
    }
});
