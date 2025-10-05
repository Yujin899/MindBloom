import { auth, db } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    setPersistence,
    browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
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
            // Continue with user document creation even if debug write fails
            console.log('Continuing with user document creation despite debug write failure');
        }
    } else {
        // Skip debug write in normal runs to avoid triggering rules failures
        setStatusMessage('Skipping debug write (disabled). Creating/updating user document...');
    }

    // Now create/update user doc
    const userDocRef = doc(db, 'users', user.uid);
    try {
        const userDoc = await getDoc(userDocRef);
        const username = user.email.split('@')[0]; // Extract username from email
        const avatarData = generateAvatarData(username);
        const baseData = {
            email: user.email,
            username: username,
            isAdmin: false,
            lastLogin: serverTimestamp(),
            loginType: loginType,
            accountType: 'email',
            avatar: {
                type: 'letter',
                letter: avatarData.firstLetter,
                backgroundColor: avatarData.backgroundColor
            }
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
        // Only show permission help if the write actually failed
        if (err && (err.code === 'permission-denied' || err.code === 'PERMISSION_DENIED')) {
            console.error('Permission error writing user document');
            throw err;
        }
        throw err;
    }
}

// Check if user is already authenticated and ensure Firestore document exists
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            console.log('User authenticated:', user.uid);
            // Just redirect on sign in, no need to write document
            console.log('Sign in successful, redirecting...');
            window.location.href = './index.html';
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

// Form switching functionality
const signInForm = document.getElementById('signInForm');
const signUpForm = document.getElementById('signUpForm');
const showSignUpBtn = document.getElementById('showSignUpBtn');
const showSignInBtn = document.getElementById('showSignInBtn');

showSignUpBtn.addEventListener('click', () => {
    signInForm.classList.add('hidden');
    signUpForm.classList.remove('hidden');
});

showSignInBtn.addEventListener('click', () => {
    signUpForm.classList.add('hidden');
    signInForm.classList.remove('hidden');
});

// Helper function to create email from username
function createEmail(username) {
    return `${username}@dento.so`;
}

// Generate random color for avatar background
function generateRandomColor() {
    const colors = [
        '#F87171', '#FB923C', '#FBBF24', '#34D399', '#60A5FA',
        '#818CF8', '#A78BFA', '#E879F9', '#FB7185', '#4ADE80'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// Generate avatar data with first letter and background color
function generateAvatarData(email) {
    const firstLetter = email[0].toUpperCase();
    const backgroundColor = generateRandomColor();
    return { firstLetter, backgroundColor };
}

// Show error message using SweetAlert2
function showError(message) {
    Swal.fire({
        icon: 'error',
        title: 'Error',
        text: message,
        confirmButtonColor: '#4ade80',
        background: '#1f2937',
        color: '#f3f4f6'
    });
}

// Sign Up functionality
const signUpBtn = document.getElementById('signUpBtn');
signUpBtn.addEventListener('click', async () => {
    const username = document.getElementById('signUpUsername').value.trim();
    const password = document.getElementById('signUpPassword').value;
    const confirmPassword = document.getElementById('signUpConfirmPassword').value;

    // Validation
    if (!username || !password) {
        showError('Please fill in all fields');
        return;
    }

    if (password !== confirmPassword) {
        showError('Passwords do not match');
        return;
    }

    if (username.includes('@') || username.includes('.')) {
        showError('Username should not contain @ or . characters');
        return;
    }

    try {
        const email = createEmail(username);
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Create the user document
        await writeUserDoc(user, 'signup', username);

        // Redirect to main page
        window.location.href = './index.html';
    } catch (error) {
        console.error('Error during sign up:', error);
        showError(error.message);
    }
});

// Set persistence to LOCAL (survives browser restarts)
await setPersistence(auth, browserLocalPersistence)
    .catch((error) => {
        console.error('Error setting persistence:', error);
    });

// Sign In functionality
const signInBtn = document.getElementById('signInBtn');
signInBtn.addEventListener('click', async () => {
    const username = document.getElementById('signInUsername').value.trim();
    const password = document.getElementById('signInPassword').value;

    if (!username || !password) {
        showError('Please fill in all fields');
        return;
    }

    try {
        const email = createEmail(username);
        await signInWithEmailAndPassword(auth, email, password);
        // We don't need to write any document for sign in
        // Redirect will be handled by onAuthStateChanged
    } catch (error) {
        console.error('Error during sign in:', error);
        if (error.code === 'auth/invalid-credential' || 
            error.code === 'auth/wrong-password' || 
            error.code === 'auth/user-not-found') {
            showError('Invalid username or password');
        } else {
            showError(error.message);
        }
    }
});
