import { db } from './firebase-config.js';
import { doc, setDoc, collection, getDocs } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// DOM Elements
const subjectForm = document.getElementById('subjectForm');
const quizForm = document.getElementById('quizForm');
const quizSubject = document.getElementById('quizSubject');
const questionsForm = document.getElementById('questionsForm');

// Loading states for buttons
const loadingStates = {
    addSubject: false,
    addQuiz: false,
    uploadQuestions: false
};

// Initialize the admin panel
initializeAdminPanel();

async function initializeAdminPanel() {
    showLoadingState('page');
    try {
        // Load subjects into the quiz form dropdown
        await loadSubjects();
        
        // Add event listeners
        setupEventListeners();
    } catch (error) {
        console.error("Error initializing admin panel:", error);
        showError("Failed to initialize the admin panel. Please refresh the page.");
    } finally {
        hideLoadingState('page');
    }
}

async function loadSubjects() {
    try {
        const subjectsSnapshot = await getDocs(collection(db, "subjects"));
        
        // Clear existing options
        quizSubject.innerHTML = '<option value="">Select Subject</option>';
        
        // Add each subject as an option
        subjectsSnapshot.docs.forEach(doc => {
            const subject = doc.data();
            const option = document.createElement('option');
            option.value = doc.id;
            option.textContent = subject.name;
            quizSubject.appendChild(option);
        });
    } catch (error) {
        console.error("Error loading subjects:", error);
        alert("Error loading subjects. Please try again.");
    }
}

function setupEventListeners() {
    // Handle subject form submission
    subjectForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (loadingStates.addSubject) return;
        
        const subjectId = document.getElementById('subjectId').value.trim();
        const subjectName = document.getElementById('subjectName').value.trim();
        const subjectDescription = document.getElementById('subjectDescription').value.trim();
        
        try {
            showLoadingState('addSubject');
            await setDoc(doc(db, 'subjects', subjectId), {
                name: subjectName,
                description: subjectDescription
            });
            
            showSuccess('Subject added successfully!');
            subjectForm.reset();
            await loadSubjects(); // Reload subjects dropdown
        } catch (error) {
            console.error("Error adding subject:", error);
            showError('Failed to add subject. Please try again.');
        } finally {
            hideLoadingState('addSubject');
        }
    });
    
    // Handle quiz form submission
    quizForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (loadingStates.addQuiz) return;
        
        const subjectId = quizSubject.value;
        const quizId = document.getElementById('quizId').value.trim();
        const quizTitle = document.getElementById('quizTitle').value.trim();
        const quizDescription = document.getElementById('quizDescription').value.trim();
        const timeLimit = parseInt(document.getElementById('quizTimeLimit').value) || 30;
        
        try {
            showLoadingState('addQuiz');
            await setDoc(doc(db, `subjects/${subjectId}/quizzes`, quizId), {
                title: quizTitle,
                description: quizDescription,
                timeLimit: timeLimit
            });
            
            showSuccess('Quiz added successfully!');
            quizForm.reset();
        } catch (error) {
            console.error("Error adding quiz:", error);
            showError('Failed to add quiz. Please try again.');
        } finally {
            hideLoadingState('addQuiz');
        }
    });

    // Handle questions form submission
    questionsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (loadingStates.uploadQuestions) return;

        const file = document.getElementById('questionsFile').files[0];
        const quizPath = document.getElementById('questionsQuiz').value;

        if (!file || !quizPath) {
            showError('Please select both a quiz and a JSON file.');
            return;
        }

        try {
            showLoadingState('uploadQuestions');
            const fileReader = new FileReader();
            
            fileReader.onload = async (event) => {
                try {
                    const questions = JSON.parse(event.target.result);
                    // Split the path into subject and quiz IDs
                    const [subjectId, quizId] = quizPath.split('/');
                    
                    // Update the quiz document with questions
                    const quizRef = doc(db, 'subjects', subjectId, 'quizzes', quizId);
                    await setDoc(quizRef, { questions: questions.questions }, { merge: true });
                    
                    showSuccess('Questions uploaded successfully!');
                    questionsForm.reset();
                } catch (error) {
                    console.error("Error parsing/uploading questions:", error);
                    showError('Failed to upload questions. Please check the JSON format and try again.');
                } finally {
                    hideLoadingState('uploadQuestions');
                }
            };

            fileReader.readAsText(file);
        } catch (error) {
            console.error("Error reading file:", error);
            showError('Failed to read the JSON file. Please try again.');
            hideLoadingState('uploadQuestions');
        }
    });
    
    // Handle back to home
    document.getElementById('signOutBtn').addEventListener('click', () => {
        window.location.href = './index.html';
    });
}

// UI Helper Functions
function showLoadingState(action) {
    const elements = {
        page: {
            element: document.body,
            html: '<div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50"><div class="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-green-400"></div></div>'
        },
        addSubject: {
            element: document.querySelector('#subjectForm button[type="submit"]'),
            originalText: 'Add Subject',
            loadingText: '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Adding...'
        },
        addQuiz: {
            element: document.querySelector('#quizForm button[type="submit"]'),
            originalText: 'Add Quiz',
            loadingText: '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Adding...'
        },
        uploadQuestions: {
            element: document.querySelector('#questionsForm button[type="submit"]'),
            originalText: 'Upload Questions',
            loadingText: '<svg class="animate-spin -ml-1 mr-3 h-5 w-5 inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Uploading...'
        }
    };

    if (action === 'page') {
        const loader = document.createElement('div');
        loader.id = 'pageLoader';
        loader.innerHTML = elements.page.html;
        document.body.appendChild(loader);
    } else {
        const config = elements[action];
        if (config && config.element) {
            config.element.innerHTML = config.loadingText;
            config.element.disabled = true;
            loadingStates[action] = true;
        }
    }
}

function hideLoadingState(action) {
    if (action === 'page') {
        const loader = document.getElementById('pageLoader');
        if (loader) {
            loader.remove();
        }
    } else {
        const elements = {
            addSubject: {
                element: document.querySelector('#subjectForm button[type="submit"]'),
                text: 'Add Subject'
            },
            addQuiz: {
                element: document.querySelector('#quizForm button[type="submit"]'),
                text: 'Add Quiz'
            },
            uploadQuestions: {
                element: document.querySelector('#questionsForm button[type="submit"]'),
                text: 'Upload Questions'
            }
        };

        const config = elements[action];
        if (config && config.element) {
            config.element.innerHTML = config.text;
            config.element.disabled = false;
            loadingStates[action] = false;
        }
    }
}

function showSuccess(message) {
    Swal.fire({
        icon: 'success',
        title: 'Success',
        text: message,
        confirmButtonColor: '#4ade80',
        background: '#1f2937',
        color: '#f3f4f6'
    });
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