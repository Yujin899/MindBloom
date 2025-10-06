import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.4.0/firebase-auth.js";
import { 
    collection, 
    query, 
    where, 
    orderBy, 
    limit, 
    getDocs,
    Timestamp,
    doc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.4.0/firebase-firestore.js";

// Constants
const DAYS_TO_KEEP = 30; // Number of days to keep quiz history
const MAX_QUIZ_HISTORY = 50; // Maximum number of quizzes to show in history

// DOM Elements
const loadingScreen = document.getElementById('loadingScreen');
const mainContent = document.getElementById('mainContent');
const userAvatar = document.getElementById('userAvatar');
const userName = document.getElementById('userName');
const userEmail = document.getElementById('userEmail');
const totalQuizzes = document.getElementById('totalQuizzes');
const averageScore = document.getElementById('averageScore');
const bestScore = document.getElementById('bestScore');
const recentQuizzesList = document.getElementById('recentQuizzesList');

// Initialize profile page
document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            await loadUserProfile(user);
            hideLoading();
        } else {
            window.location.href = './auth.html';
        }
    });
});

// Helper function to handle query snapshot sorting
async function handleQuerySnapshot(queryObj, user) {
    try {
        const querySnapshot = await getDocs(queryObj);
        return querySnapshot;
    } catch (error) {
        if (error.code === 'failed-precondition') {
                console.warn('Using fallback query without sorting. To enable proper sorting, create the required index at:', error.message);
                // Fallback to a simpler query without ordering on the user's subcollection
                const fallbackQuery = query(
                    collection(db, 'users', user.uid, 'quizAttempts'),
                    limit(MAX_QUIZ_HISTORY)
                );
                const fallbackSnapshot = await getDocs(fallbackQuery);
            
            // Sort the results in memory if we have any results
            if (fallbackSnapshot.size > 0) {
                const sortedDocs = Array.from(fallbackSnapshot.docs).sort((a, b) => {
                    const timeA = a.data().timestamp?.seconds || 0;
                    const timeB = b.data().timestamp?.seconds || 0;
                    return timeB - timeA;
                });
                
                return {
                    ...fallbackSnapshot,
                    docs: sortedDocs,
                    forEach: (callback) => sortedDocs.forEach(callback)
                };
            }
            return fallbackSnapshot;
        }
        throw error;
    }
}

// Load user profile data
async function loadUserProfile(user) {
    try {
        console.log('Loading profile data...');
        
        // Get user document for additional info
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userDocRef);
        const userData = userDoc.data();

        // Set basic user info
        if (userData?.avatar) {
            // Use avatar data from user document
            userAvatar.style.backgroundColor = userData.avatar.backgroundColor;
            userAvatar.textContent = userData.avatar.letter;
        } else {
            // Fallback avatar
            const username = user.email.split('@')[0];
            userAvatar.style.backgroundColor = '#4B5563';
            userAvatar.textContent = username[0].toUpperCase();
        }

        // Set username and email
        userName.textContent = userData?.username || user.email.split('@')[0];
        userEmail.textContent = user.email;

        // Get quiz attempts from user's subcollection with ordering
        const attemptsQuery = query(
            collection(db, 'users', user.uid, 'quizAttempts'),
            orderBy('timestamp', 'desc'),
            limit(MAX_QUIZ_HISTORY)
        );
        
        const querySnapshot = await handleQuerySnapshot(attemptsQuery, user);        
        console.log('Found quiz attempts:', querySnapshot.size);
        
        const attempts = [];
        let totalScore = 0;
        let maxScore = 0;

        // Process quiz attempts
        querySnapshot.docs.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            
            // Calculate stats
            totalScore += data.score;
            maxScore = Math.max(maxScore, data.score);

            // Use existing quiz title or set default
            if (!data.quizTitle) {
                data.quizTitle = 'Unknown Quiz';
            }
            
            attempts.push(data);
        });

        // Update statistics
        totalQuizzes.textContent = attempts.length;
        averageScore.textContent = attempts.length > 0 
            ? `${Math.round(totalScore / attempts.length)}%` 
            : '0%';
        bestScore.textContent = `${maxScore}%`;

    // Display recent quizzes and ensure the UI is visible before creating charts
    displayRecentQuizzes(attempts);
    // Make main content visible and render content
    hideLoading();
    renderKpis(attempts);
    createPerformanceChart(attempts);
    createSubjectPerformanceChart(attempts);

    } catch (error) {
        console.error('Error loading profile:', error);
        showError('Failed to load profile data. Please try again later.');
    }
}

// Display recent quizzes
function displayRecentQuizzes(attempts) {
    recentQuizzesList.innerHTML = attempts.length > 0 
        ? attempts.map(attempt => `
            <tr class="border-b border-neutral-700 hover:bg-neutral-700/50">
                <td class="py-3 px-4">
                    <div class="flex flex-col">
                        <span class="font-medium text-white">${attempt.quizTitle || 'Unknown Quiz'}</span>
                        <span class="text-sm text-gray-400">Subject: ${attempt.subjectTitle || 'Unknown Subject'}</span>
                    </div>
                </td>
                <td class="py-3 px-4">
                    <span class="font-medium ${getScoreColorClass(attempt.score)}">
                        ${attempt.score}%
                    </span>
                </td>
                <td class="py-3 px-4 text-gray-400">
                    ${formatDate(attempt.timestamp.toDate())}
                </td>
                <td class="py-3 px-4 text-gray-400">
                    ${formatTime(attempt.timeTaken)}
                </td>
                <td class="py-3 px-4">
                    ${attempt.questions ? `
                        <button onclick="reviewQuizAttempt('${attempt.id}')" 
                                class="px-3 py-1 bg-green-600 hover:bg-green-500 rounded text-sm font-medium transition-colors">
                            Review
                        </button>
                    ` : `
                        <span class="text-sm text-gray-500">No review available</span>
                    `}
                </td>
            </tr>
        `).join('')
        : '<tr><td colspan="5" class="py-4 text-center text-gray-400">No recent quizzes</td></tr>';
}

// Display performance stats
function createPerformanceChart(attempts) {
    const container = document.getElementById('performanceChart');
    if (!container) return;

    const total = attempts.length;
    const avg = total ? Math.round(attempts.reduce((s, a) => s + (a.score || 0), 0) / total) : 0;
    const best = total ? Math.max(...attempts.map(a => a.score || 0)) : 0;

    container.innerHTML = `
        <div class="p-6 bg-neutral-800 rounded-lg shadow-lg">
            <h3 class="text-lg font-bold mb-4 text-green-400">Performance Overview</h3>
            <div class="grid grid-cols-3 gap-4">
                <div class="text-center">
                    <div class="text-2xl font-bold text-white">${total}</div>
                    <div class="text-sm text-gray-400">Total Attempts</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold ${avg >= 80 ? 'text-green-400' : avg >= 60 ? 'text-yellow-400' : 'text-red-400'}">${avg}%</div>
                    <div class="text-sm text-gray-400">Average Score</div>
                </div>
                <div class="text-center">
                    <div class="text-2xl font-bold text-green-400">${best}%</div>
                    <div class="text-sm text-gray-400">Best Score</div>
                </div>
            </div>
        </div>
    `;


}

// Display KPI stats
function renderKpis(attempts) {
    const avgContainer = document.getElementById('avgGauge');
    const sparkContainer = document.getElementById('trendSpark');
    if (!avgContainer || !sparkContainer) return;

    const avg = attempts.length > 0 ? Math.round(attempts.reduce((s, a) => s + (a.score || 0), 0) / attempts.length) : 0;
    const recentScores = attempts.slice(0, 5).map(a => ({ score: a.score, date: formatDate(a.timestamp.toDate()) }));

    // Average score display
    avgContainer.innerHTML = `
        <div class="p-4 bg-neutral-900 rounded-lg">
            <div class="text-center">
                <div class="text-3xl font-bold ${avg >= 80 ? 'text-green-400' : avg >= 60 ? 'text-yellow-400' : 'text-red-400'}">${avg}%</div>
                <div class="text-sm text-gray-400 mt-1">Average Score</div>
            </div>
        </div>
    `;

    // Recent scores display
    sparkContainer.innerHTML = `
        <div class="p-4 bg-neutral-900 rounded-lg">
            <div class="text-sm text-gray-400 mb-2">Recent Scores</div>
            ${recentScores.length ? recentScores.map(s => `
                <div class="flex justify-between items-center mb-1 last:mb-0">
                    <span class="text-sm text-gray-400">${s.date}</span>
                    <span class="font-medium ${s.score >= 80 ? 'text-green-400' : s.score >= 60 ? 'text-yellow-400' : 'text-red-400'}"> ${s.score}%</span>
                </div>
            `).join('') : '<div class="text-center text-gray-400">No recent scores</div>'}
        </div>
    `;
}

// Create subject performance chart
function createSubjectPerformanceChart(attempts) {
    const container = document.getElementById('subjectChart');
    if (!container) return;

    // Group attempts by subject with improved subject tracking
    const subjectStats = {};
    let subjectTitles = {};
    let subjectQuizDetails = {}; // Store quiz details for each subject

    (attempts || []).forEach(attempt => {
        const subject = attempt.subjectId || 'unknown';
        const subjectTitle = attempt.subjectTitle || `Subject ${subject}`;
        const quizTitle = attempt.quizTitle || 'Unknown Quiz';

        if (!subjectStats[subject]) {
            subjectStats[subject] = { total: 0, count: 0, recentScore: null };
            subjectQuizDetails[subject] = [];
        }

        subjectStats[subject].total += attempt.score || 0;
        subjectStats[subject].count++;
        subjectStats[subject].recentScore = attempt.score || 0;
        subjectTitles[subject] = subjectTitle;
        
        // Store quiz details for this subject
        subjectQuizDetails[subject].push({
            quizTitle: quizTitle,
            score: attempt.score || 0,
            date: attempt.timestamp?.toDate() || new Date()
        });
    });

    const subjects = Object.keys(subjectStats);
    
    if (subjects.length === 0) {
        container.innerHTML = `
            <div class="p-6 bg-neutral-800 rounded-lg shadow-lg text-center">
                <div class="text-gray-400">No subject data available</div>
            </div>
        `;
        return;
    }

    const subjectRows = subjects.map(subject => {
        const stats = subjectStats[subject];
        const avg = Math.round(stats.total / stats.count);
        const recent = stats.recentScore;
        const quizzes = subjectQuizDetails[subject];
        
        // Get unique quizzes for this subject
        const uniqueQuizzes = [...new Set(quizzes.map(q => q.quizTitle))];
        
        return `
            <div class="p-4 border-b border-neutral-700 last:border-0">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex-1">
                        <div class="font-medium text-white">${subjectTitles[subject]}</div>
                        <div class="text-sm text-gray-400 mt-1">
                            Quizzes: ${uniqueQuizzes.map(quiz => `<span class="inline-block bg-neutral-700 px-2 py-1 rounded text-xs mr-1 mb-1">${quiz}</span>`).join('')}
                        </div>
                    </div>
                    <div class="flex items-center gap-6">
                        <div class="text-sm">
                            <span class="text-gray-400">Avg:</span>
                            <span class="ml-1 font-medium ${avg >= 80 ? 'text-green-400' : avg >= 60 ? 'text-yellow-400' : 'text-red-400'}"> ${avg}%</span>
                        </div>
                        <div class="text-sm">
                            <span class="text-gray-400">Recent:</span>
                            <span class="ml-1 font-medium text-blue-400">${recent}%</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = `
        <div class="bg-neutral-800 rounded-lg shadow-lg overflow-hidden">
            <div class="p-4 border-b border-neutral-700">
                <h3 class="text-lg font-bold text-green-400">Subject Performance</h3>
            </div>
            <div class="divide-y divide-neutral-700">
                ${subjectRows}
            </div>
        </div>
    `;
}




// Helper functions
function formatDate(date) {
    return date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: 'numeric'
    });
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function getScoreColorClass(score) {
    if (score >= 80) return 'text-green-400';
    if (score >= 60) return 'text-yellow-400';
    return 'text-red-400';
}

function hideLoading() {
    loadingScreen.classList.add('hidden');
    mainContent.classList.remove('hidden');
}

// Show error using SweetAlert2
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

// Make reviewQuizAttempt available globally
window.reviewQuizAttempt = async function(attemptId) {
    try {
        const user = auth.currentUser;
        if (!user) {
            showError('Please sign in to review quiz attempts');
            return;
        }

        // Get the attempt document
        const attemptDoc = await getDoc(doc(db, 'users', user.uid, 'quizAttempts', attemptId));
        if (!attemptDoc.exists()) {
            showError('Quiz attempt not found');
            return;
        }

        const attempt = attemptDoc.data();
        if (!attempt.questions) {
            showError('This quiz attempt does not have review data available');
            return;
        }

        // Create review content
        const reviewContent = attempt.questions.map((q, index) => `
            <div class="mb-6 p-4 bg-neutral-800 rounded-lg">
                <div class="mb-3">
                    <span class="text-gray-400">Question ${index + 1}:</span>
                    <div class="text-white mt-1">${q.questionText}</div>
                </div>
                <div class="space-y-2 mt-3">
                    ${q.options.map((option, optIndex) => `
                        <div class="flex items-center p-2 rounded ${
                            optIndex === q.correctAnswer && optIndex === q.userAnswer ? 'bg-green-600/20 border border-green-500' :
                            optIndex === q.correctAnswer ? 'bg-green-600/20 border border-green-500' :
                            optIndex === q.userAnswer ? 'bg-red-600/20 border border-red-500' :
                            'bg-neutral-700/20'
                        }">
                            <div class="flex-1">${option}</div>
                            ${optIndex === q.correctAnswer ? 
                                '<span class="text-green-400">✓</span>' : 
                                (optIndex === q.userAnswer ? '<span class="text-red-400">✗</span>' : '')}
                        </div>
                    `).join('')}
                </div>
            </div>
        `).join('');

        // Show the review modal
        await Swal.fire({
            title: attempt.quizTitle,
            html: `
                <div class="text-left mb-4">
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-gray-400">Score:</span>
                        <span class="font-bold ${getScoreColorClass(attempt.score)}">${attempt.score}%</span>
                    </div>
                    <div class="flex justify-between items-center mb-4">
                        <span class="text-gray-400">Date:</span>
                        <span>${formatDate(attempt.timestamp.toDate())}</span>
                    </div>
                    <div class="flex justify-between items-center mb-6">
                        <span class="text-gray-400">Time Taken:</span>
                        <span>${formatTime(attempt.timeTaken)}</span>
                    </div>
                </div>
                <div class="max-h-[60vh] overflow-y-auto px-4 -mx-4">
                    ${reviewContent}
                </div>
            `,
            width: '800px',
            background: '#171717',
            color: '#fff',
            confirmButtonColor: '#4ade80',
            confirmButtonText: 'Close',
            showCloseButton: true,
            customClass: {
                container: 'quiz-review-modal',
                popup: 'rounded-lg shadow-xl',
                content: 'text-left'
            }
        });
    } catch (error) {
        console.error('Error reviewing quiz:', error);
        showError('Failed to load quiz review');
    }
}
