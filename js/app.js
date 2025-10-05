import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { collection, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// DOM Elements
const userAvatar = document.getElementById('userAvatar');
const userDropdown = document.getElementById('userDropdown');
const signOutBtn = document.getElementById('signOutBtn');
const subjectsAccordion = document.getElementById('subjectsAccordion');
const subjectCardTemplate = document.getElementById('subjectCardTemplate');
const quizItemTemplate = document.getElementById('quizItemTemplate');

// Authentication check function
export function checkAuth() {
    return new Promise((resolve, reject) => {
        // Keep the listener active to handle auth state changes
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            if (user) {
                resolve(user);
            } else {
                // Only redirect if we're not already on the auth page
                if (!window.location.pathname.includes('auth.html')) {
                    window.location.href = 'auth.html';
                }
                reject('User not authenticated');
            }
        });
    });
}

// Get references to loading and main content elements
const initialLoadingScreen = document.getElementById('initialLoadingScreen');
const mainContent = document.getElementById('mainContent');

// Function to show/hide the main content
function toggleMainContent(show) {
    if (initialLoadingScreen && mainContent) {
        initialLoadingScreen.style.display = show ? 'none' : 'flex';
        mainContent.classList.toggle('hidden', !show);
    }
}

// Check authentication state and initialize app
checkAuth().then(user => {
    initializeApp(user);
    toggleMainContent(true); // Show main content after authentication
}).catch(error => {
    console.log('Authentication required:', error);
    // Keep the loading screen visible until redirect completes
});

// UI Helper Functions
function showLoadingState() {
    const loader = document.createElement('div');
    loader.id = 'pageLoader';
    loader.innerHTML = '<div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"><div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-400"></div></div>';
    document.body.appendChild(loader);
}

function hideLoadingState() {
    const loader = document.getElementById('pageLoader');
    if (loader) {
        loader.remove();
    }
}

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

async function initializeApp(user) {
    showLoadingState();
    try {
        // Check if we're on the main page by looking for required elements
        const isMainPage = document.getElementById('subjectsAccordion') !== null;
        
        // Update user info in header if avatar element exists
        if (userAvatar) {
            // Get the user document to access avatar data
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            const userData = userDoc.data();
            const username = user.email.split('@')[0]; // Get username part before @

            if (userData && userData.avatar && userData.avatar.type === 'letter') {
                // Use avatar data from user document
                userAvatar.style.backgroundColor = userData.avatar.backgroundColor;
                userAvatar.textContent = userData.avatar.letter;
            } else {
                // Fallback to first letter of username with default color
                userAvatar.style.backgroundColor = '#4B5563'; // gray-600
                userAvatar.textContent = username[0].toUpperCase();
            }
        }
        
        // Check if user is admin
        const adminPanelLink = document.getElementById('adminPanelLink');
        try {
            const userDocRef = doc(db, 'users', user.uid);
            const userDoc = await getDoc(userDocRef);
            
            if (adminPanelLink && userDoc.exists() && userDoc.data().isAdmin === true) {
                adminPanelLink.classList.remove('hidden');
                adminPanelLink.classList.add('flex');
            } else if (adminPanelLink) {
                adminPanelLink.classList.add('hidden');
                adminPanelLink.classList.remove('flex');
            }
        } catch (error) {
            console.error('Error checking admin status:', error);
            if (adminPanelLink) {
                adminPanelLink.classList.add('hidden');
                adminPanelLink.classList.remove('flex');
            }
        }
        
        // Handle avatar click
        if (userAvatar && userDropdown) {
            userAvatar.addEventListener('click', (e) => {
                e.stopPropagation();
                userDropdown.classList.toggle('hidden');
            });
        }
        
        // Handle sign out
        if (signOutBtn) {
            signOutBtn.addEventListener('click', async () => {
                try {
                    showLoadingState();
                    await signOut(auth);
                    window.location.href = 'auth.html';
                } catch (error) {
                    console.error('Error signing out:', error);
                    showError('Failed to sign out. Please try again.');
                    hideLoadingState();
                }
            });
        }
        
        // Close dropdown when clicking outside
        if (userAvatar && userDropdown) {
            document.addEventListener('click', (e) => {
                if (!userAvatar.contains(e.target)) {
                    userDropdown.classList.add('hidden');
                }
            });
        }
        
        // Only load subjects if we're on the main page
        if (isMainPage) {
            await loadSubjects();
        }
    } catch (error) {
        console.error('Error initializing app:', error);
        showError('Failed to initialize the app. Please refresh the page.');
    } finally {
        hideLoadingState();
    }
}

async function loadSubjects() {
    // If subjectsAccordion doesn't exist, we're probably on a different page
    if (!subjectsAccordion) {
        return;
    }

    try {
        // Show loading skeleton while fetching subjects
        subjectsAccordion.innerHTML = Array(3).fill(0).map(() => `
            <div class="animate-pulse bg-neutral-800/50 rounded-xl shadow-lg p-6 space-y-4">
                <div class="h-6 bg-neutral-700/50 rounded w-1/3"></div>
                <div class="h-4 bg-neutral-700/50 rounded w-2/3"></div>
                <div class="space-y-3">
                    <div class="h-4 bg-neutral-700/50 rounded"></div>
                    <div class="h-4 bg-neutral-700/50 rounded w-5/6"></div>
                </div>
            </div>
        `).join('');

        const subjectsSnapshot = await getDocs(collection(db, "subjects"));
        
        // Clear loading skeletons
        subjectsAccordion.innerHTML = '';
        
        // Create and append each subject card
        for (const doc of subjectsSnapshot.docs) {
            const subject = { id: doc.id, ...doc.data() };
            const card = await createSubjectCard(subject);
            subjectsAccordion.appendChild(card);
        }
    } catch (error) {
        console.error("Error loading subjects:", error);
    }
}

async function loadQuizzes(subjectId) {
    const quizzesContainer = document.querySelector(`[data-subject="${subjectId}"] .quizzes-container .divide-y`);
    if (!quizzesContainer) return [];

    try {
        // Show loading skeletons
        quizzesContainer.innerHTML = Array(3).fill(0).map(() => `
            <div class="animate-pulse p-4 space-y-3">
                <div class="h-5 bg-neutral-700/50 rounded w-1/4"></div>
                <div class="h-4 bg-neutral-700/50 rounded w-2/3"></div>
            </div>
        `).join('');

        // Fetch data
        const quizzesSnapshot = await getDocs(collection(db, `subjects/${subjectId}/quizzes`));
        const quizzes = quizzesSnapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Clear loading skeletons
        quizzesContainer.innerHTML = '';

        if (quizzes.length === 0) {
            quizzesContainer.innerHTML = `
                <div class="p-4 text-center text-gray-400">
                    <p>No quizzes available yet</p>
                </div>
            `;
        } else {
            // Add each quiz item
            quizzes.forEach(quiz => {
                const quizItem = createQuizItem(quiz, subjectId);
                quizzesContainer.appendChild(quizItem);
            });
        }

        return quizzes;
    } catch (error) {
        console.error("Error loading quizzes:", error);
        showError('Failed to load quizzes. Please try again.');
        return [];
    }
}

async function createSubjectCard(subject) {
    // Clone the template
    const card = subjectCardTemplate.content.cloneNode(true);
    const cardElement = card.querySelector('.bg-neutral-800');
    // Add subject ID for quiz loading
    cardElement.dataset.subject = subject.id;
    
    // Fill in the subject data
    card.querySelector('.subject-name').textContent = subject.name;
    card.querySelector('.subject-description').textContent = subject.description;
    
    // Get references to interactive elements
    const header = card.querySelector('.subject-header');
    const quizzesContainer = card.querySelector('.quizzes-container');
    const chevron = card.querySelector('.subject-header svg');
    
    // Add click event for accordion
    header.addEventListener('click', async () => {
        const isExpanded = !quizzesContainer.classList.contains('hidden');
        
        // Toggle chevron rotation with animation
        chevron.style.transition = 'transform 0.3s ease';
        chevron.style.transform = isExpanded ? 'rotate(0deg)' : 'rotate(180deg)';
        
        // If collapsing, hide immediately
        if (isExpanded) {
            quizzesContainer.classList.add('hidden');
            return;
        }

        // If expanding
        quizzesContainer.style.transition = 'opacity 0.3s ease';
        quizzesContainer.style.opacity = '0';
        quizzesContainer.classList.remove('hidden');
        
        // Small delay for transition
        await new Promise(resolve => setTimeout(resolve, 50));
        
        // Load quizzes if not already loaded
        if (!quizzesContainer.dataset.loaded) {
            // Load the quizzes
            await loadQuizzes(subject.id);
            quizzesContainer.dataset.loaded = 'true';
        }
        
        // Fade in the container
        quizzesContainer.style.opacity = '1';
    });
    
    return cardElement;
}

function createQuizItem(quiz, subjectId) {
    // Clone the template
    const quizItem = quizItemTemplate.content.cloneNode(true);
    
    // Fill in the quiz data
    quizItem.querySelector('.quiz-name').textContent = quiz.name || quiz.title;
    quizItem.querySelector('.quiz-description').textContent = quiz.description || '';
    
    // Add click event for quiz
    const itemElement = quizItem.querySelector('.quiz-item');
    itemElement.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent accordion toggle
        console.log('Navigating to quiz:', quiz.id, 'in subject:', subjectId);
        // Navigate to quiz page with both quiz ID and subject ID
        const quizUrl = `./quiz.html?id=${quiz.id}&subject=${subjectId}`;
        console.log('Quiz URL:', quizUrl);
        window.location.href = quizUrl;
    });
    
    return quizItem;
}
