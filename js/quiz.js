import { auth, db } from './firebase-config.js';
import { checkAuth } from './app.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

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
        
        updateLoadingStatus('Fetching quiz content...');
        const quizDoc = await getDoc(doc(db, `subjects/${subjectId}/quizzes/${quizId}`));
        if (!quizDoc.exists()) {
            throw new Error('Quiz not found');
        }
        
        quiz = { id: quizDoc.id, ...quizDoc.data() };
        
        updateLoadingStatus('Setting up quiz interface...');
        await setupQuizUI();
        
        updateLoadingStatus('Loading previous scores...');
        const highScore = await getHighScore(quizId);
        console.log('Previous high score loaded:', highScore);
        
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

// Get high score from Firestore
async function getHighScore(quizId) {
    try {
        const scoreDoc = await getDoc(doc(db, 'highScores', quizId));
        if (scoreDoc.exists()) {
            return scoreDoc.data();
        }
        return { score: 0, holder: 'No one yet' };
    } catch (error) {
        console.error('Error getting high score:', error);
        return { score: 0, holder: 'Error loading high score' };
    }
}

// Save high score to Firestore
async function updateHighScore(quizId, newScore, userName) {
    try {
        const scoreRef = doc(db, 'highScores', quizId);
        const currentScore = await getDoc(scoreRef);
        
        if (!currentScore.exists() || newScore > currentScore.data().score) {
            await updateDoc(scoreRef, {
                score: newScore,
                holder: userName,
                date: serverTimestamp()
            }, { merge: true });
            return true;
        }
        return false;
    } catch (error) {
        console.error('Error updating high score:', error);
        return false;
    }
}

// Calculate score with streak bonus
function calculateScoreWithBonus(isCorrect) {
    if (isCorrect) {
        streakCount++;
        const streakBonus = Math.min(streakCount * STREAK_BONUS, MAX_STREAK_BONUS);
        return SCORE_PER_CORRECT + streakBonus;
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
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const completionModal = document.getElementById('completionModal');
const finalScore = document.getElementById('finalScore');
const timeTaken = document.getElementById('timeTaken');
const reviewBtn = document.getElementById('reviewBtn');
const finishBtn = document.getElementById('finishBtn');

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
        
        // Get quiz ID from URL parameters
        const urlParams = new URLSearchParams(window.location.search);
        const quizId = urlParams.get('id');
        const subjectId = urlParams.get('subject');

        console.log('URL Parameters:', window.location.search);
        console.log('Quiz ID:', quizId);
        console.log('Subject ID:', subjectId);

        if (!quizId || !subjectId) {
            throw new Error('Quiz information is missing. Please make sure you accessed this page correctly.');
        }

        // Get the quiz document
        const quizRef = doc(db, 'subjects', subjectId, 'quizzes', quizId);
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
    
    // Add event listeners
    prevBtn.addEventListener('click', showPreviousQuestion);
    nextBtn.addEventListener('click', handleNextButton);
    reviewBtn.addEventListener('click', reviewQuiz);
    finishBtn.addEventListener('click', () => window.location.href = './index.html');
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
    
    // Update the display
    showQuestion(currentQuestionIndex);
}

function showPreviousQuestion() {
    if (currentQuestionIndex > 0) {
        showQuestion(currentQuestionIndex - 1);
    }
}

function handleNextButton() {
    if (currentQuestionIndex < quiz.questions.length - 1) {
        showQuestion(currentQuestionIndex + 1);
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
            return;
        }
        completeQuiz();
    }
}

function updateNavigationButtons() {
    prevBtn.disabled = currentQuestionIndex === 0;
    if (currentQuestionIndex === quiz.questions.length - 1) {
        const unansweredCount = userAnswers.filter(answer => answer === undefined).length;
        if (unansweredCount > 0) {
            nextBtn.textContent = `Answer All Questions (${unansweredCount} left)`;
        } else {
            nextBtn.textContent = 'Complete Quiz';
        }
    } else {
        nextBtn.textContent = 'Next';
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
    
    // Clear saved progress on completion
    if (quiz) {
        clearProgress(quiz.id);
    }
    
    // Get current stats
    const correctAnswers = calculateScore();
    const timeTakenSeconds = 30 * 60 - timeRemaining;
    const minutes = Math.floor(timeTakenSeconds / 60);
    const seconds = timeTakenSeconds % 60;
    
    // Check for high score
    const isHighScore = updateHighScore(quiz.id, currentScore, auth.currentUser.displayName);
    
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
            // Reset to first question for review
            showQuestion(0);
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
    showQuestion(0);
}