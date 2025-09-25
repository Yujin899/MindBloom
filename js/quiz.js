import { auth, db } from './firebase-config.js';
import { checkAuth } from './app.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, addDoc, collection } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Configure SweetAlert2 Dark Theme
const sweetAlertDarkTheme = Swal.mixin({
    background: '#171717',
    color: '#fff',
    confirmButtonColor: '#4ade80',
    denyButtonColor: '#22c55e',
    cancelButtonColor: '#ef4444',
    backdrop: 'rgba(0, 0, 0, 0.7)',
    iconColor: '#4ade80',
    customClass: {
        container: 'dark-mode-swal',
        popup: 'dark-mode-swal-popup',
        header: 'dark-mode-swal-header',
        title: 'text-xl font-bold mb-4',
        htmlContainer: 'text-gray-300',
        input: 'bg-neutral-800 border-neutral-700 text-white',
        inputLabel: 'text-gray-300',
        validationMessage: 'text-red-400',
        actions: 'border-t border-neutral-800',
        confirmButton: 'font-semibold',
        denyButton: 'font-semibold',
        cancelButton: 'font-semibold'
    }
});

// DOM Elements for loading
const quizLoadingScreen = document.getElementById('quizLoadingScreen');
const quizContent = document.getElementById('quizContent');
const loadingStatus = document.getElementById('loadingStatus');

// Loading state management
function updateLoadingStatus(message) {
    if (loadingStatus) {
        loadingStatus.textContent = message;
    }
}

function hideLoading() {
    if (quizLoadingScreen && quizContent) {
        quizLoadingScreen.style.opacity = '0';
        quizContent.style.opacity = '1';
        setTimeout(() => {
            quizLoadingScreen.style.display = 'none';
        }, 300);
    }
}

// Quiz state
let quiz = null;
let currentQuestionIndex = 0;
let userAnswers = [];
let userCorrect = [];
let timeRemaining = null; // Will be set from quiz.timeLimit
let timerInterval;
let currentScore = 0;
let streakCount = 0; // Track consecutive correct answers
let currentSubjectId = null; // Store the current subject ID globally

// Scoring constants
const SCORE_PER_CORRECT = 100;
const STREAK_BONUS = 50; // Bonus points for consecutive correct answers
const MAX_STREAK_BONUS = 500;

// Initialize the quiz
async function initializeQuiz() {
    try {
        updateLoadingStatus('Checking authentication...');
        await checkAuth();
        
        updateLoadingStatus('Loading quiz data...');
        const urlParams = new URLSearchParams(window.location.search);
        const quizId = urlParams.get('id');
        const subjectId = urlParams.get('subject');
        
        if (!quizId || !subjectId) {
            throw new Error('Missing quiz or subject ID');
        }
        
        // Store subject ID globally before using it
        currentSubjectId = subjectId;
        
        updateLoadingStatus('Fetching quiz content...');
        const quizDoc = await getDoc(doc(db, `subjects/${currentSubjectId}/quizzes/${quizId}`));
        if (!quizDoc.exists()) {
            throw new Error('Quiz not found');
        }
        
                    quiz = { id: quizDoc.id, ...quizDoc.data() };
            
            updateLoadingStatus('Setting up quiz interface...');
            await setupQuizUI();
            
            // Store the subject ID globally
            currentSubjectId = subjectId;
            
            updateLoadingStatus('Loading high scores...');
            // Get and display current global high score
            const currentHighScoreData = await getHighScore(quizId, currentSubjectId);
            console.log('Previous high score loaded:', currentHighScoreData);
            
            // Update high score display
            const highScoreDisplay = document.getElementById('highScore');
            if (highScoreDisplay) {
                if (currentHighScoreData.score > 0) {
                    highScoreDisplay.textContent = ` ${currentHighScoreData.score}`;
                } else {
                    highScoreDisplay.textContent = ' No high score yet';
                }
            }
            
            updateLoadingStatus('Ready to begin!');
            setTimeout(hideLoading, 500); // Small delay to ensure smooth transition
        
    } catch (error) {
        console.error('Error initializing quiz:', error);
        sweetAlertDarkTheme.fire({
            icon: 'error',
            title: 'Error',
            text: 'Failed to load the quiz. Please try again.',
            confirmButtonText: 'Return to Home',
        }).then(() => {
            window.location.href = './index.html';
        });
    }
}

// Get global high score for this quiz
async function getHighScore(quizId, subjectId) {
    try {
        const quizRef = doc(db, 'subjects', subjectId, 'quizzes', quizId);
        const quizDoc = await getDoc(quizRef);
        
        if (quizDoc.exists()) {
            const data = quizDoc.data();
            // Check if there's a recorded global high score
            if (data.globalHighScore) {
                return {
                    score: data.globalHighScore,
                    holder: data.globalHighScoreHolder || 'Anonymous'
                };
            }
        }
        return { score: 0, holder: 'No one yet' };
    } catch (error) {
        console.error('Error getting high score:', error);
        return { score: 0, holder: 'Error loading high score' };
    }
}

// Update global high score if new score is higher
async function updateHighScore(quizId, subjectId, newScore, userName) {
    try {
        if (!quizId || !subjectId) {
            console.error('Missing quiz ID or subject ID');
            return false;
        }

        const quizRef = doc(db, 'subjects', subjectId, 'quizzes', quizId);
        const quizDoc = await getDoc(quizRef);
        const currentData = quizDoc.data() || {};
        
        // Get the current global high score
        const currentHighScore = currentData.globalHighScore || 0;
        
        console.log('Current global high score:', currentHighScore);
        console.log('New score:', newScore);

        // Only update if the new score is higher than the global high score
        if (newScore > currentHighScore) {
            const updateData = {
                globalHighScore: newScore,
                globalHighScoreHolder: userName,
                globalHighScoreDate: serverTimestamp(),
                // Also store this attempt in the history
                lastAttempt: {
                    score: newScore,
                    player: userName,
                    date: serverTimestamp()
                }
            };

            try {
                if (quizDoc.exists()) {
                    await updateDoc(quizRef, updateData);
                    console.log('New global high score set!');
                } else {
                    await setDoc(quizRef, { ...currentData, ...updateData }, { merge: true });
                    console.log('Created quiz document with new high score!');
                }
                return true;
            } catch (updateError) {
                console.error('Error updating global high score:', updateError);
                throw updateError;
            }
        } else {
            // Still record this attempt even if it's not a high score
            await updateDoc(quizRef, {
                lastAttempt: {
                    score: newScore,
                    player: userName,
                    date: serverTimestamp()
                }
            });
            console.log('Score recorded, but not a new high score');
            return false;
        }
    } catch (error) {
        console.error('Error in updateHighScore:', error);
        return false;
    }
}
// Calculate score with streak bonus
function calculateScoreWithBonus(isCorrect) {
    if (isCorrect) {
        streakCount++;
        const streakBonus = Math.min(streakCount * STREAK_BONUS, MAX_STREAK_BONUS);
        const totalPoints = SCORE_PER_CORRECT + streakBonus;
        currentScore += totalPoints; // Update current score
        return totalPoints;
    } else {
        streakCount = 0;
        return 0;
    }
}

// Load saved progress from localStorage with expiration check
function loadSavedProgress(quizId) {
    const savedData = localStorage.getItem(`quiz_${quizId}`);
    if (savedData) {
        const data = JSON.parse(savedData);
        const savedTimestamp = data.timestamp;
        const currentTime = new Date().getTime();
        
        // Check if more than 5 minutes have passed
        if (currentTime - savedTimestamp > 5 * 60 * 1000) {
            clearProgress(quizId);
            return false;
        }
        
        userAnswers = data.answers || [];
        userCorrect = data.correct || [];
        timeRemaining = data.timeRemaining || (quiz.timeLimit || 30) * 60;
        return true;
    }
    return false;
}

// Save progress to localStorage
function saveProgress() {
    if (quiz && timeRemaining > 0) {
        const saveData = {
            timeRemaining: timeRemaining,
            timestamp: new Date().getTime()
        };
        localStorage.setItem(`quiz_${quiz.id}`, JSON.stringify(saveData));
        console.log('Saved progress with time:', timeRemaining, 'seconds');
    }
}

// Clear saved progress
function clearProgress(quizId) {
    localStorage.removeItem(`quiz_${quizId}`);
    console.log(`Cleared progress for quiz ${quizId}`);
}

// Handle page visibility change
let visibilityTimeout;
document.addEventListener('visibilitychange', () => {
    if (document.hidden && quiz) {
        // Set a timeout to clear progress after 5 minutes of inactivity
        visibilityTimeout = setTimeout(() => {
            clearProgress(quiz.id);
        }, 5 * 60 * 1000);
    } else {
        // Clear the timeout if user returns before 5 minutes
        if (visibilityTimeout) {
            clearTimeout(visibilityTimeout);
        }
    }
});

// DOM Elements
const quizTitle = document.getElementById('quizTitle');
const quizDescription = document.getElementById('quizDescription');
const timer = document.getElementById('timer');
const currentQuestionElement = document.getElementById('currentQuestion');
const totalQuestionsElement = document.getElementById('totalQuestions');
const questionNav = document.getElementById('questionNav');
const questionText = document.getElementById('questionText');
const answerOptions = document.getElementById('answerOptions');
let prevBtn = document.getElementById('prevBtn');
let nextBtn = document.getElementById('nextBtn');
const completionModal = document.getElementById('completionModal');
const finalScore = document.getElementById('finalScore');
const timeTaken = document.getElementById('timeTaken');
let reviewBtn = document.getElementById('reviewBtn');
let finishBtn = document.getElementById('finishBtn');

// Drawer Elements
const drawerToggle = document.getElementById('drawerToggle');
const drawerClose = document.getElementById('drawerClose');
const questionDrawer = document.getElementById('questionDrawer');
const drawerBackdrop = document.getElementById('drawerBackdrop');

// Drawer functionality
function openDrawer() {
    questionDrawer.classList.remove('translate-x-[-100%]');
    document.body.classList.add('overflow-hidden');
}

function closeDrawer() {
    questionDrawer.classList.add('translate-x-[-100%]');
    document.body.classList.remove('overflow-hidden');
}

// Add drawer event listeners
drawerToggle.addEventListener('click', openDrawer);
drawerClose.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);

// Close drawer when clicking a question on mobile
questionNav.addEventListener('click', (e) => {
    if (window.innerWidth < 1024) { // lg breakpoint
        closeDrawer();
    }
});

// Check online status
window.addEventListener('online', () => {
    console.log('Connection restored');
    sweetAlertDarkTheme.fire({
        icon: 'success',
        title: 'Connected',
        text: 'Your internet connection has been restored.',
        timer: 3000,
        showConfirmButton: false
    });
});

window.addEventListener('offline', () => {
    console.log('Connection lost');
    sweetAlertDarkTheme.fire({
        icon: 'warning',
        title: 'Offline Mode',
        text: 'You are offline. Your progress will be saved locally.',
        timer: 3000,
        showConfirmButton: false
    });
});

// Check authentication and load quiz
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        console.log('Auth state changed:', user ? 'logged in' : 'logged out');
        if (user) {
            try {
                await loadQuiz();
            } catch (error) {
                console.error('Error in quiz initialization:', error);
                sweetAlertDarkTheme.fire({
                    icon: 'error',
                    title: 'Error',
                    text: 'Failed to initialize the quiz. Please try again.',
                    confirmButtonText: 'Return to Home'
                }).then(() => {
                    window.location.href = './index.html';
                });
            }
        } else {
            await sweetAlertDarkTheme.fire({
                icon: 'warning',
                title: 'Authentication Required',
                text: 'Please sign in to access the quiz.',
                confirmButtonText: 'Sign In',
                confirmButtonColor: '#4ade80',
                allowOutsideClick: false,
                backdrop: 'rgba(0, 0, 0, 0.4)'
            });
            window.location.href = './auth.html';
        }
    });
});

async function loadQuiz() {
    try {
        // Reset all quiz state
        currentQuestionIndex = 0;
        userAnswers = [];
        userCorrect = [];
        currentScore = 0;
        streakCount = 0;
        
        // Get quiz ID and subject ID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const quizId = urlParams.get('id');
        const subjectId = urlParams.get('subject');

        console.log('URL Parameters:', window.location.search);
        console.log('Quiz ID:', quizId);
        console.log('Subject ID:', subjectId);

        if (!quizId || !subjectId) {
            throw new Error('Quiz information is missing. Please make sure you accessed this page correctly.');
        }

        // Store subject ID globally before using it
        currentSubjectId = subjectId;

        // Get the quiz document
        const quizRef = doc(db, 'subjects', currentSubjectId, 'quizzes', quizId);
        const quizDoc = await getDoc(quizRef);
        
        if (!quizDoc.exists()) {
            throw new Error('The requested quiz could not be found. Please try again or select a different quiz.');
        }

        const quizData = quizDoc.data();
        console.log('Quiz data retrieved:', quizData);
        
        // Set the time limit, but check for saved time first
        const savedProgress = localStorage.getItem(`quiz_${quizId}`);
        if (savedProgress) {
            const data = JSON.parse(savedProgress);
            const savedTime = parseInt(data.timeRemaining);
            if (savedTime && savedTime > 0) {
                timeRemaining = savedTime;
                console.log('Restored saved time:', timeRemaining, 'seconds');
            } else {
                timeRemaining = (quizData.timeLimit || 30) * 60; // Convert minutes to seconds
                console.log('Invalid saved time, setting new time limit:', quizData.timeLimit, 'minutes');
            }
        } else {
            timeRemaining = (quizData.timeLimit || 30) * 60; // Convert minutes to seconds
            console.log('No saved progress, setting new time limit:', quizData.timeLimit, 'minutes');
        }
        
        if (!quizData) {
            throw new Error('Quiz data is empty.');
        }

        // Create normalized quiz structure
        quiz = {
            id: quizId,
            title: quizData.title || 'Untitled Quiz',
            description: quizData.description || '',
            isReviewMode: false, // Initialize review mode flag
            questions: Array.isArray(quizData.questions) ? quizData.questions :
                      typeof quizData.questionCount === 'number' ? 
                      Array.from({ length: quizData.questionCount }, (_, i) => ({
                          question: `Question ${i + 1}`,
                          options: ['Option A', 'Option B', 'Option C', 'Option D'],
                          correctAnswer: 0
                      })) : []
        };

        if (!quiz.questions.length) {
            throw new Error('No valid questions found in quiz data.');
        }

        // Initialize arrays with correct length
        userAnswers = new Array(quiz.questions.length).fill(undefined);
        userCorrect = new Array(quiz.questions.length).fill(false);

        // Check for continue flag
        const shouldContinue = urlParams.get('continue') === 'true';
        
        // Always reset answers on refresh
        userAnswers = new Array(quiz.questions.length).fill(undefined);
        userCorrect = new Array(quiz.questions.length).fill(false);

        // Initialize quiz UI
        await initializeQuiz();
        console.log('Quiz loaded successfully:', quiz);

    } catch (error) {
        console.error('Error loading quiz:', error);
        if (error.message !== 'Quiz cancelled') {
            // Check if error is related to being offline
            const isOfflineError = error.message.includes('offline') || 
                                 error.code === 'unavailable' || 
                                 error.code === 'failed-precondition';

            if (isOfflineError) {
                // Try to load from cache first
                const savedData = localStorage.getItem(`quiz_${quizId}`);
                if (savedData) {
                    const data = JSON.parse(savedData);
                    await sweetAlertDarkTheme.fire({
                        icon: 'warning',
                        title: 'Offline Mode',
                        text: 'You are currently offline. Loading your last saved progress.',
                        confirmButtonText: 'Continue',
                        confirmButtonColor: '#4ade80'
                    });
                    // Continue with saved data
                    userAnswers = data.answers;
                    userCorrect = data.correct;
                    timeRemaining = data.timeRemaining;
                    return;
                }
            }

            await sweetAlertDarkTheme.fire({
                icon: 'error',
                title: isOfflineError ? 'No Internet Connection' : 'Error',
                text: isOfflineError ? 
                    'Please check your internet connection and try again.' : 
                    error.message || 'Failed to load quiz. Please try again.',
                confirmButtonText: 'Return to Home',
                confirmButtonColor: '#4ade80',
                allowOutsideClick: false,
                backdrop: 'rgba(0, 0, 0, 0.4)'
            });
            window.location.href = 'index.html';
        }
    }
}

async function setupQuizUI() {
    try {
        // Check authentication before proceeding
        await checkAuth();
        console.log('Initializing quiz UI...');
        
        // Initialize quiz UI
        if (!quiz || !quiz.title || !quiz.questions) {
            throw new Error('Quiz data is incomplete or invalid.');
        }

        quizTitle.textContent = quiz.title;
        quizDescription.textContent = quiz.description || '';
        totalQuestionsElement.textContent = quiz.questions.length;
        
        // Initialize user answers array if not already initialized
        if (!userAnswers.length) {
            userAnswers = new Array(quiz.questions.length).fill(undefined);
        }
        
        // Initialize time remaining if not already set
        if (timeRemaining === null || timeRemaining <= 0) {
            timeRemaining = (quiz.timeLimit || 30) * 60; // Convert minutes to seconds
        }
        
        // Create question navigation buttons
        createQuestionNav();
        
        // Show first question
        showQuestion(0);
        
        // Start timer
        startTimer();
        
        console.log('Quiz initialized successfully');

    } catch (error) {
        console.error('Error initializing quiz:', error);
        await Swal.fire({
            icon: 'error',
            title: 'Initialization Error',
            text: error.message || 'There was an error setting up the quiz. Please try again.',
            confirmButtonText: 'Go Back',
            confirmButtonColor: '#4ade80', // green-400
            allowOutsideClick: false,
            backdrop: 'rgba(0, 0, 0, 0.4)'
        }).then((result) => {
            if (result.isConfirmed) {
                window.location.href = 'index.html';
            }
        });
        throw error;
    }
    
    // Remove any existing event listeners
    prevBtn.replaceWith(prevBtn.cloneNode(true));
    nextBtn.replaceWith(nextBtn.cloneNode(true));
    reviewBtn.replaceWith(reviewBtn.cloneNode(true));
    finishBtn.replaceWith(finishBtn.cloneNode(true));
    
    // Re-get the elements after replacing
    const newPrevBtn = document.getElementById('prevBtn');
    const newNextBtn = document.getElementById('nextBtn');
    const newReviewBtn = document.getElementById('reviewBtn');
    const newFinishBtn = document.getElementById('finishBtn');
    
    // Add new event listeners
    newPrevBtn.addEventListener('click', showPreviousQuestion);
    newNextBtn.addEventListener('click', handleNextButton);
    newReviewBtn.addEventListener('click', reviewQuiz);
    newFinishBtn.addEventListener('click', () => window.location.href = './index.html');
    
    // Update the references
    prevBtn = newPrevBtn;
    nextBtn = newNextBtn;
    reviewBtn = newReviewBtn;
    finishBtn = newFinishBtn;
}

function createQuestionNav() {
    questionNav.innerHTML = '';
    
    for (let i = 0; i < quiz.questions.length; i++) {
        const button = document.createElement('button');
        button.className = 'w-full aspect-square rounded-lg font-semibold transition-colors';
        updateQuestionNavButton(button, i);
        
        button.addEventListener('click', () => showQuestion(i));
        questionNav.appendChild(button);
    }
}

function updateQuestionNavButton(button, index) {
    const isCurrentQuestion = currentQuestionIndex === index;
    const hasAnswer = userAnswers[index] !== undefined && userCorrect[index] !== undefined;
    const question = quiz.questions[index];
    
    button.textContent = index + 1;
    
    let buttonClass = 'w-full aspect-square rounded-lg font-semibold ';
    
    if (isCurrentQuestion) {
        if (hasAnswer && userAnswers[index] !== undefined) {
            // Current question with answer
            buttonClass += userAnswers[index] === question.correctAnswer ? 
                'bg-green-400 text-black' : 
                'bg-red-400 text-black';
        } else {
            // Current unanswered question
            buttonClass += 'bg-blue-400 text-black';
        }
    } else if (hasAnswer && userAnswers[index] !== undefined) {
        // Non-current answered questions
        if (userAnswers[index] === question.correctAnswer) {
            buttonClass += 'bg-green-600 hover:bg-green-500 text-white'; // Correct
        } else {
            buttonClass += 'bg-red-600 hover:bg-red-500 text-white';    // Wrong
        }
    } else {
        // Unanswered questions
        buttonClass += 'bg-neutral-900 hover:bg-neutral-800 text-white';
    }
    
    button.className = buttonClass;
}

function showQuestion(index) {
    try {
        currentQuestionIndex = index;
        const question = quiz.questions[index];

        if (!question) {
            throw new Error(`Question ${index} not found`);
        }
        
        // Update question text and navigation
        questionText.textContent = question.question || `Question ${index + 1}`;
        currentQuestionElement.textContent = index + 1;
        
        // Create answer options
        answerOptions.innerHTML = '';
        
        // Ensure we have an array of options
        const options = Array.isArray(question.options) ? question.options :
                       Array.isArray(question.answers) ? question.answers :
                       Array.isArray(question.choices) ? question.choices : [];

        if (options.length === 0) {
            console.error('No answer options found for question:', question);
            options.push('Option A', 'Option B', 'Option C', 'Option D');
        }
        
        options.forEach((answer, i) => {
            const isSelected = userAnswers[currentQuestionIndex] === i;
            const correctAnswer = question.correctAnswer;
            const hasAnswered = userAnswers[currentQuestionIndex] !== undefined;
            
            const button = document.createElement('button');
            
            // Determine button color based on answer state
            let buttonClass = 'w-full p-4 rounded-xl text-left transition-colors ';
            
            if (hasAnswered && userAnswers[currentQuestionIndex] !== undefined) {
                if (isSelected) {
                    // Selected answer
                    buttonClass += i === correctAnswer ? 
                        'bg-green-400 text-black' : // Correct
                        'bg-red-400 text-black';    // Wrong
                } else if (i === correctAnswer && userAnswers[currentQuestionIndex] !== undefined) {
                    // Show correct answer only if question was answered
                    buttonClass += 'bg-green-400 text-black opacity-50';
                } else {
                    // Unselected and incorrect
                    buttonClass += 'bg-neutral-700';
                }
            } else {
                // Not answered yet
                buttonClass += 'bg-neutral-700 hover:bg-neutral-600';
            }
            
            button.className = buttonClass;
            button.textContent = answer;
            
            // Only allow selection if not already answered
            if (!hasAnswered) {
                button.addEventListener('click', () => selectAnswer(i));
            }
            
            answerOptions.appendChild(button);
        });
        
        // Update navigation buttons
        updateNavigationButtons();
        
        // Update question navigation
        const navButtons = questionNav.children;
        for (let i = 0; i < navButtons.length; i++) {
            updateQuestionNavButton(navButtons[i], i);
        }
    } catch (error) {
        console.error('Error showing question:', error);
        sweetAlertDarkTheme.fire({
            icon: 'error',
            title: 'Question Error',
            text: 'There was an error displaying this question. Please try another question or contact support.',
            confirmButtonColor: '#4ade80'
        });
    }
}

function selectAnswer(answerIndex) {
    const question = quiz.questions[currentQuestionIndex];
    const isCorrect = answerIndex === question.correctAnswer;
    
    // Record the answer and whether it was correct
    userAnswers[currentQuestionIndex] = answerIndex;
    userCorrect[currentQuestionIndex] = isCorrect;
    
    // Calculate and update score
    const pointsEarned = calculateScoreWithBonus(isCorrect);
    currentScore += pointsEarned;
    
    // Update score display
    const currentScoreElement = document.getElementById('currentScore');
    const streakBonusElement = document.getElementById('streakBonus');
    currentScoreElement.textContent = currentScore;
    
    // Show streak bonus notification if applicable
    if (streakCount > 1) {
        streakBonusElement.textContent = `+${Math.min(streakCount * STREAK_BONUS, MAX_STREAK_BONUS)} Streak Bonus!`;
        streakBonusElement.classList.remove('hidden');
        setTimeout(() => streakBonusElement.classList.add('hidden'), 2000);
    }
    
    // Save progress
    saveProgress();
    
    // Update the display and navigation
    showQuestion(currentQuestionIndex);
    updateNavigationButtons();
}

function showPreviousQuestion() {
    if (currentQuestionIndex > 0) {
        showQuestion(currentQuestionIndex - 1);
    }
}

function handleNextButton(e) {
    // Prevent any default behavior
    if (e) e.preventDefault();
    
    // Prevent multiple rapid clicks
    if (this.disabled) return;
    this.disabled = true;
    
    // Function to enable the button after a short delay
    const enableButton = () => {
        this.disabled = false;
    };
    
    // If in review mode and at last question, this should never be called
    // as the button should have a direct onclick handler to return home
    if (quiz.isReviewMode && currentQuestionIndex === quiz.questions.length - 1) {
        window.location.href = './index.html';
        return;
    };

    if (currentQuestionIndex < quiz.questions.length - 1) {
        showQuestion(currentQuestionIndex + 1);
        setTimeout(enableButton, 500); // Re-enable after animation
    } else {
        // Check if all questions are answered
        const unansweredQuestions = userAnswers.reduce((count, answer, index) => {
            if (answer === undefined) return [...count, index + 1];
            return count;
        }, []);

        if (unansweredQuestions.length > 0) {
            sweetAlertDarkTheme.fire({
                icon: 'warning',
                title: 'Incomplete Quiz',
                html: `Please answer all questions before completing the quiz.<br><br>Unanswered questions: ${unansweredQuestions.join(', ')}`,
                confirmButtonText: 'OK',
                confirmButtonColor: '#4ade80'
            });
            enableButton();
            return;
        }
        completeQuiz();
        enableButton();
    }
}

function updateNavigationButtons() {
    if (!quiz) return;
    
    prevBtn.disabled = currentQuestionIndex === 0;
    
    // Check if we're in review mode (after quiz completion)
    const isReviewMode = quiz.isReviewMode === true;
    
    if (currentQuestionIndex === quiz.questions.length - 1) {
        if (isReviewMode) {
            // In review mode, show Return Home
            nextBtn.textContent = 'Return Home';
            nextBtn.onclick = () => window.location.href = './index.html';
        } else {
            const unansweredCount = userAnswers.filter(answer => answer === undefined).length;

            if (unansweredCount > 0) {
                // Still have questions to answer
                nextBtn.textContent = `Answer All Questions (${unansweredCount} left)`;
                nextBtn.onclick = handleNextButton;
            } else {
                // All questions answered, show Complete Quiz
                nextBtn.textContent = 'Complete Quiz';
                nextBtn.onclick = handleNextButton;
            }
        }
    } else {
        nextBtn.textContent = 'Next';
        nextBtn.onclick = handleNextButton;
    }
}

function startTimer() {
    // Clear any existing interval
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    updateTimerDisplay();
    saveProgress(); // Save initial state

    timerInterval = setInterval(() => {
        timeRemaining--;
        updateTimerDisplay();
        
        // Save progress every 5 seconds
        if (timeRemaining % 5 === 0) {
            saveProgress();
        }
        
        if (timeRemaining <= 0) {
            clearInterval(timerInterval);
            completeQuiz();
        }
    }, 1000);
}

function updateTimerDisplay() {
    const minutes = Math.floor(timeRemaining / 60);
    const seconds = timeRemaining % 60;
    timer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function completeQuiz() {
    // Check if quiz is already completed to prevent duplicate submissions
    if (quiz.isCompleted) {
        console.log('Quiz already completed, preventing duplicate submission');
        return;
    }

    // Check if all questions are answered
    const unansweredQuestions = userAnswers.reduce((count, answer, index) => {
        if (answer === undefined) return [...count, index + 1];
        return count;
    }, []);

    if (unansweredQuestions.length > 0) {
        sweetAlertDarkTheme.fire({
            icon: 'warning',
            title: 'Incomplete Quiz',
            html: `Please answer all questions before completing the quiz.<br><br>Unanswered questions: ${unansweredQuestions.join(', ')}`,
            confirmButtonText: 'OK',
            confirmButtonColor: '#4ade80'
        });
        return;
    }

    clearInterval(timerInterval);
    
    try {
        // Mark quiz as completed to prevent duplicate submissions
        quiz.isCompleted = true;

        // Save quiz attempt to Firestore
        const timeTakenSeconds = (quiz.timeLimit || 30) * 60 - timeRemaining;
        const correctAnswers = userCorrect.filter(correct => correct).length;
        
        const attemptData = {
            userId: auth.currentUser.uid,
            quizId: quiz.id,
            subjectId: currentSubjectId,
            score: currentScore, // Use the currentScore that includes streak bonuses
            timeTaken: timeTakenSeconds,
            timestamp: serverTimestamp(),
            totalQuestions: quiz.questions.length,
            correctAnswers: correctAnswers,
            quizTitle: quiz.title,
            subjectTitle: document.querySelector('#quizTitle')?.textContent || 'Unknown Subject',
            streakBonus: Math.min(streakCount * STREAK_BONUS, MAX_STREAK_BONUS),
            score: Math.round((correctAnswers / quiz.questions.length) * 100) // Store score as percentage
        };

        const docRef = await addDoc(collection(db, 'quizAttempts'), attemptData);
        console.log('Quiz attempt saved with ID:', docRef.id);
        console.debug('Quiz attempt details:', { ...attemptData, timestamp: 'serverTimestamp' });
    } catch (error) {
        console.error('Error saving quiz attempt:', error);
    }
    
    // Clear saved progress on completion
    if (quiz) {
        clearProgress(quiz.id);
    }
    
    // Get current stats
    const correctAnswers = userCorrect.filter(correct => correct).length;
    const timeTakenSeconds = 30 * 60 - timeRemaining;
    const minutes = Math.floor(timeTakenSeconds / 60);
    const seconds = timeTakenSeconds % 60;
    
    // Check for high score (use currentScore which includes streak bonuses)
    console.log('Attempting to update high score with:', {
        quizId: quiz.id,
        subjectId: currentSubjectId,
        currentScore,
        userName: auth.currentUser.displayName
    });
    const isHighScore = await updateHighScore(quiz.id, currentSubjectId, currentScore, auth.currentUser.displayName);
    console.log('High score check result:', isHighScore ? 'New high score!' : 'Not a high score');
    
    // Get the current high score for comparison
    const existingHighScore = await getHighScore(quiz.id, currentSubjectId);
    
    // Show completion modal with different messages based on performance
    const accuracy = (correctAnswers / quiz.questions.length) * 100;
    let message = '';
    let icon = 'success';
    
    if (accuracy === 100) {
        message = 'Perfect score! Outstanding performance! 🏆';
    } else if (accuracy >= 80) {
        message = 'Excellent work! Keep it up! 🌟';
    } else if (accuracy >= 60) {
        message = 'Good effort! Room for improvement! 👍';
    } else {
        message = 'Keep practicing! You can do better! 💪';
        icon = 'info';
    }
    
    // Add high score context to the message
    if (currentScore > existingHighScore.score) {
        message += '\n🎉 NEW HIGH SCORE! 🎉';
    } else if (existingHighScore.score > 0) {
        message += `\nCurrent high score: ${existingHighScore.score}`;
    }

    await sweetAlertDarkTheme.fire({
        icon: icon,
        title: 'Quiz Completed!',
        html: `
            <div class="space-y-4">
                <div class="text-2xl font-bold text-green-400">
                    Score: ${currentScore} points
                </div>
                <div class="text-lg">
                    ${correctAnswers} out of ${quiz.questions.length} correct (${Math.round(accuracy)}%)
                </div>
                <div class="text-gray-400">
                    Time taken: ${minutes}:${seconds.toString().padStart(2, '0')}
                </div>
                ${isHighScore ? '<div class="text-yellow-400 font-bold mt-4">🎉 New High Score! 🎉</div>' : ''}
                <div class="mt-4 text-lg">
                    ${message}
                </div>
            </div>
        `,
        confirmButtonText: 'Review Answers',
        confirmButtonColor: '#4ade80',
        showDenyButton: true,
        denyButtonText: 'Return Home',
        denyButtonColor: '#ef4444',
        allowOutsideClick: false
    }).then((result) => {
        if (result.isConfirmed) {
            // Start review mode
            reviewQuiz();
        } else if (result.isDenied) {
            // Return to subject list
            window.location.href = 'index.html';
        }
    });
}

function calculateScore() {
    return quiz.questions.reduce((score, question, index) => {
        return score + (userAnswers[index] === question.correctAnswer ? 1 : 0);
    }, 0);
}

function reviewQuiz() {
    completionModal.classList.add('hidden');
    quiz.isReviewMode = true; // Set review mode flag
    currentQuestionIndex = 0; // Reset to first question
    showQuestion(0);
    updateNavigationButtons(); // Ensure buttons are updated for review mode
}