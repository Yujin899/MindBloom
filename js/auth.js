import { auth, db } from './firebase-config.js';
import { GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Helper: show instructions if Firestore permission errors occur
function showFirestorePermissionHelp() {
        const rules = `rules_version = '2';
service cloud.firestore {
    match /databases/{database}/documents {
        match /users/{userId} {
            allow read, write: if request.auth != null && request.auth.uid == userId;
        }
        match /quizAttempts/{attemptId} {
            allow read: if request.auth != null;
            allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
        }
        match /subjects/{subjectId} {
            allow read: if request.auth != null;
            match /quizzes/{quizId} {
                allow read: if request.auth != null;
            }
        }
    }
}`;

        console.error('Firestore permission denied. Paste the following rules in the Firebase Console -> Firestore -> Rules:');
        console.log(rules);
        const editorUrl = `https://console.firebase.google.com/project/${(document.location.hostname.includes('firebaseapp') ? document.location.hostname.split('.')[0] : 'molarmind-c7de4')}/firestore/rules`;
        alert('Firestore write blocked by security rules. I logged a rules snippet to the console and copied the console output. Open the Firestore Rules tab in the Firebase console and paste the snippet.');
}

// Diagnostic: log project info to ensure we are using the right Firebase project
try {
    const projectId = db && db.app && db.app.options && db.app.options.projectId;
    console.log('Diagnostic: Firebase projectId =', projectId);
    console.log('Diagnostic: Firestore db object:', db);
} catch (diagErr) {
    console.warn('Could not read firebase projectId for diagnostics', diagErr);
}

// By default skip the `_debug` test writes which often trigger permission-denied
// in environments where rules don't include a debug collection. Set this to
// true in the console while debugging if you want to run the debug writes:
// window.__enableFirestoreDebugWrites = true;
window.__enableFirestoreDebugWrites = window.__enableFirestoreDebugWrites || false;

// Create a small status widget in the page to show Firestore write status
function ensureStatusWidget() {
    let el = document.getElementById('authStatusWidget');
    if (el) return el;
    el = document.createElement('div');
    el.id = 'authStatusWidget';
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.background = 'rgba(17,17,17,0.9)';
    el.style.color = '#fff';
    el.style.padding = '12px 16px';
    el.style.borderRadius = '8px';
    el.style.boxShadow = '0 6px 24px rgba(0,0,0,0.4)';
    el.style.zIndex = 99999;
    el.style.fontFamily = 'Inter, system-ui, sans-serif';
    el.style.fontSize = '13px';
    el.innerHTML = '<div id="authStatusMsg">Auth status will appear here</div><div style="margin-top:8px;text-align:right"><button id="authStatusRetry" style="background:#4ade80;border:none;padding:6px 8px;border-radius:6px;color:#071018;font-weight:600;cursor:pointer">Retry</button></div>';
    document.body.appendChild(el);
    el.querySelector('#authStatusRetry').addEventListener('click', () => {
        const lastUser = window.__lastAuthUser;
        if (lastUser) writeUserDoc(lastUser, window.__lastAuthType || 'session');
    });
    return el;
}

function setStatusMessage(msg, ok = true) {
    const el = ensureStatusWidget();
    const msgEl = el.querySelector('#authStatusMsg');
    msgEl.textContent = msg;
    el.style.border = ok ? '1px solid rgba(74,222,128,0.2)' : '1px solid rgba(239,68,68,0.2)';
}

// Consolidated user doc write logic used by both flows
async function writeUserDoc(user, loginType = 'session') {
    window.__lastAuthUser = user;
    window.__lastAuthType = loginType;
    setStatusMessage('Verifying Firestore write permissions...');
    if (window.__enableFirestoreDebugWrites) {
        const debugRef = doc(db, '_debug', `test_${user.uid}`);
        try {
            await setDoc(debugRef, { uid: user.uid, ts: serverTimestamp() });
            console.log('Debug write succeeded:', debugRef.path);
            setStatusMessage('Debug write succeeded. Creating/updating user document...');
        } catch (err) {
            console.error('Debug write failed:', err);
            setStatusMessage('Debug write failed: ' + (err && err.code ? err.code : err.message || 'unknown'), false);
            if (err && (err.code === 'permission-denied' || err.code === 'PERMISSION_DENIED')) showFirestorePermissionHelp();
            throw err;
        }
    } else {
        // Skip debug write in normal runs to avoid triggering rules failures
        setStatusMessage('Skipping debug write (disabled). Creating/updating user document...');
    }

    // Now create/update user doc
    const userDocRef = doc(db, 'users', user.uid);
    try {
        const userDoc = await getDoc(userDocRef);
        const baseData = {
            email: user.email || null,
            name: user.displayName || null,
            photoURL: user.photoURL || null,
            isAdmin: false,
            lastLogin: serverTimestamp(),
            loginType: loginType,
            accountType: 'google'
        };
        if (!userDoc.exists()) {
            const data = { ...baseData, createdAt: serverTimestamp() };
            await setDoc(userDocRef, data);
            console.log('User doc created at:', userDocRef.path);
            setStatusMessage('User document created successfully.');
        } else {
            await setDoc(userDocRef, baseData, { merge: true });
            console.log('User doc updated at:', userDocRef.path);
            setStatusMessage('User document updated successfully.');
        }
        return true;
    } catch (err) {
        console.error('Failed to write user doc:', err);
        setStatusMessage('Failed to write user document: ' + (err && err.code ? err.code : err.message || 'unknown'), false);
        if (err && (err.code === 'permission-denied' || err.code === 'PERMISSION_DENIED')) showFirestorePermissionHelp();
        throw err;
    }
}

// Check if user is already authenticated and ensure Firestore document exists
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            console.log('User authenticated:', user.uid);

            // Only proceed with document creation if this is not a Google sign-in popup
            // (since the popup flow will handle document creation)
            if (!localStorage.getItem('handlingGoogleSignIn')) {
                // Ensure user document exists or is updated in Firestore
                const userDocRef = doc(db, "users", user.uid);
                console.log('Checking Firestore document for user:', user.uid);
                
                try {
                    await writeUserDoc(user, 'session');
                    console.log('All operations successful, redirecting...');
                    window.location.href = './index.html';
                } catch (firestoreError) {
                    console.error('Firestore operation failed:', firestoreError);
                    if (firestoreError && (firestoreError.code === 'permission-denied' || firestoreError.code === 'PERMISSION_DENIED')) {
                        showFirestorePermissionHelp();
                    }
                }
            }
        } catch (error) {
            console.error('Authentication error:', {
                error: error,
                errorCode: error.code,
                errorMessage: error.message
            });
            alert('Authentication error. Please check console for details.');
        }
    } else {
        console.log('No user is currently signed in');
    }
});

// Initialize Google Auth Provider
const provider = new GoogleAuthProvider();

// Get the sign-in button
const googleSignInBtn = document.getElementById('googleSignInBtn');

// Add click event listener to the sign-in button
googleSignInBtn.addEventListener('click', async () => {
    try {
        // Set flag to prevent duplicate document creation
        localStorage.setItem('handlingGoogleSignIn', 'true');
        
        // Sign in with Google
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        console.log('Google sign-in successful, user:', user.uid);
        
        // Create or update user document in Firestore
        const userDocRef = doc(db, "users", user.uid);
        console.log('Checking Firestore document for Google sign-in user:', user.uid);
        // Debug write to surface permission issues early (only when enabled)
        if (window.__enableFirestoreDebugWrites) {
            const debugRef = doc(db, '_debug', `test_${user.uid}`);
            try {
                await setDoc(debugRef, { uid: user.uid, ts: serverTimestamp() });
                console.log('Debug write succeeded in popup flow: _debug/test_' + user.uid);
            } catch (err) {
                console.error('Debug write failed in popup flow:', err, 'code=', err && err.code, 'message=', err && err.message);
                if (err && (err.code === 'permission-denied' || err.code === 'PERMISSION_DENIED')) {
                    showFirestorePermissionHelp();
                }
                throw err; // Let outer catch handle it
            }
        }

        try {
            await writeUserDoc(user, 'explicit');
        } catch (firestoreError) {
            console.error('Firestore operation failed during Google sign-in:', firestoreError);
            throw firestoreError;
        }

        // Store a timestamp of when the user explicitly signed in
        localStorage.setItem('lastExplicitSignIn', new Date().toISOString());
        
        // Clear the Google sign-in flag
        localStorage.removeItem('handlingGoogleSignIn');

        // Redirect to the main page after successful sign-in
        window.location.href = './index.html';
    } catch (error) {
        console.error("Error during sign in:", error);
        // You can add proper error handling here (e.g., showing an error message to the user)
    }
});
