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
        
        // Set basic user info
        userAvatar.src = user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User');
        userName.textContent = user.displayName || 'User';
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

        // Display recent quizzes and charts
        displayRecentQuizzes(attempts);
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
                <td class="py-3 px-4">${attempt.quizTitle || 'Unknown Quiz'}</td>
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
            </tr>
        `).join('')
        : '<tr><td colspan="4" class="py-4 text-center text-gray-400">No recent quizzes</td></tr>';
}

// Store chart instances
let performanceChart = null;
let subjectChart = null;

// Create performance over time chart
function createPerformanceChart(attempts) {
    const canvas = document.getElementById('performanceChart');
    const ctx = canvas?.getContext('2d');
    if (!ctx || attempts.length === 0) return;
    
    // Destroy existing chart if it exists
    if (performanceChart) {
        performanceChart.destroy();
    }

    // Sort attempts chronologically
    const sortedAttempts = [...attempts].sort((a, b) => 
        a.timestamp.seconds - b.timestamp.seconds
    );

    performanceChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: sortedAttempts.map(a => formatDate(a.timestamp.toDate())),
            datasets: [{
                label: 'Quiz Scores',
                data: sortedAttempts.map(a => a.score),
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#4ade80',
                pointRadius: 6,
                pointHoverRadius: 8,
                borderWidth: 3,
                pointBorderColor: '#171717',
                pointBorderWidth: 2,
                pointStyle: 'circle',
                cubicInterpolationMode: 'monotone'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            size: 12,
                            family: 'Inter, system-ui, sans-serif'
                        },
                        padding: 10,
                        callback: value => value + '%'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            size: 12,
                            family: 'Inter, system-ui, sans-serif'
                        },
                        maxRotation: 45,
                        minRotation: 45,
                        padding: 10
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    bodyFont: {
                        size: 14,
                        family: 'Inter, system-ui, sans-serif'
                    },
                    titleFont: {
                        size: 16,
                        family: 'Inter, system-ui, sans-serif',
                        weight: 'bold'
                    },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: (tooltipItems) => {
                            return formatDate(sortedAttempts[tooltipItems[0].dataIndex].timestamp.toDate());
                        },
                        label: (context) => `Score: ${context.raw}%`
                    }
                }
            }
        }
    });
}

// Create subject performance chart
function createSubjectPerformanceChart(attempts) {
    const canvas = document.getElementById('subjectChart');
    const ctx = canvas?.getContext('2d');
    if (!ctx || attempts.length === 0) return;

    // Destroy existing chart if it exists
    if (subjectChart) {
        subjectChart.destroy();
    }

    // Group attempts by subject with improved subject tracking
    const subjectStats = {};
    let subjectTitles = {};

    attempts.forEach(attempt => {
        const subject = attempt.subjectId;
        const subjectTitle = attempt.subjectTitle || `Subject ${subject}`;
        
        if (!subjectStats[subject]) {
            subjectStats[subject] = {
                total: 0,
                count: 0,
                scores: [],
                recentScore: null,
                title: subjectTitle
            };
        }
        
        subjectStats[subject].total += attempt.score;
        subjectStats[subject].count++;
        subjectStats[subject].scores.push(attempt.score);
        subjectStats[subject].recentScore = attempt.score; // Track most recent score
        subjectTitles[subject] = subjectTitle;
    });

    const subjects = Object.keys(subjectStats);
    const averages = subjects.map(subject => 
        Math.round(subjectStats[subject].total / subjectStats[subject].count)
    );
    const labels = subjects.map(subject => subjectTitles[subject]);

    subjectChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Average Score',
                data: averages,
                backgroundColor: 'rgba(74, 222, 128, 0.8)',
                borderRadius: 8,
                borderWidth: 0,
                hoverBackgroundColor: 'rgba(34, 197, 94, 0.9)',
                maxBarThickness: 40
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                intersect: false,
                mode: 'index'
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100,
                    grid: {
                        color: 'rgba(255, 255, 255, 0.05)',
                        drawBorder: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            size: 12,
                            family: 'Inter, system-ui, sans-serif'
                        },
                        padding: 10,
                        callback: value => value + '%'
                    }
                },
                x: {
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#9ca3af',
                        font: {
                            size: 12,
                            family: 'Inter, system-ui, sans-serif'
                        },
                        maxRotation: 45,
                        minRotation: 45,
                        padding: 10
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: 'rgba(17, 24, 39, 0.95)',
                    titleColor: '#ffffff',
                    bodyColor: '#ffffff',
                    bodyFont: {
                        size: 14,
                        family: 'Inter, system-ui, sans-serif'
                    },
                    titleFont: {
                        size: 16,
                        family: 'Inter, system-ui, sans-serif',
                        weight: 'bold'
                    },
                    padding: 12,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        title: (tooltipItems) => labels[tooltipItems[0].dataIndex],
                        label: (context) => {
                            const subjectId = subjects[context.dataIndex];
                            const stats = subjectStats[subjectId];
                            return [
                                `Average: ${context.raw}%`,
                                `Recent: ${stats.recentScore}%`,
                                `Total: ${stats.count} quiz${stats.count !== 1 ? 'zes' : ''}`
                            ];
                        }
                    }
                }
            }
        }
    });
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

function showError(message) {
    // You can implement a proper error display here
    alert(message);
}