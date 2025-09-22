// Admin Management
window.currentUser = null;
window.allUsers = [];
window.currentAdmins = [];

// Alert function using SweetAlert2
window.showAlert = function(type, message) {
    Swal.fire({
        title: type === 'success' ? 'Success!' : 'Error!',
        text: message,
        icon: type,
        confirmButtonText: 'OK',
        confirmButtonColor: type === 'success' ? '#10B981' : '#EF4444',
        background: '#171717',
        color: '#fff'
    });
};

// Make functions globally accessible
window.toggleAdminStatus = async function(userId, makeAdmin) {
    try {
        await updateDoc(doc(db, 'users', userId), {
            isAdmin: makeAdmin
        });
        
        // Update local arrays
        const userIndex = window.allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            window.allUsers[userIndex].isAdmin = makeAdmin;
        }
        
        if (makeAdmin) {
            window.currentAdmins.push(window.allUsers[userIndex]);
        } else {
            const adminIndex = window.currentAdmins.findIndex(a => a.id === userId);
            if (adminIndex !== -1) {
                window.currentAdmins.splice(adminIndex, 1);
            }
        }
        
        // Refresh displays
        displayUsers(window.allUsers);
        displayAdmins();
        showAlert('success', `Successfully ${makeAdmin ? 'added' : 'removed'} admin privileges`);
    } catch (error) {
        console.error('Error updating admin status:', error);
        showAlert('error', 'Failed to update admin status');
    }
};

window.deleteSubject = async function(subjectId) {
    if (!confirm('Are you sure you want to delete this subject? This will also delete all quizzes in this subject.')) {
        return;
    }
    
    try {
        // First delete all quizzes in the subject
        const quizzesSnapshot = await getDocs(collection(db, 'subjects', subjectId, 'quizzes'));
        const batch = writeBatch(db);
        
        quizzesSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Then delete the subject
        batch.delete(doc(db, 'subjects', subjectId));
        await batch.commit();
        
        showAlert('success', 'Subject deleted successfully');
        loadSubjects(); // Refresh the lists
    } catch (error) {
        console.error('Error deleting subject:', error);
        showAlert('error', 'Failed to delete subject');
    }
};

window.deleteQuiz = async function(subjectId, quizId) {
    if (!confirm('Are you sure you want to delete this quiz?')) {
        return;
    }
    
    try {
        await deleteDoc(doc(db, 'subjects', subjectId, 'quizzes', quizId));
        showAlert('success', 'Quiz deleted successfully');
        loadQuizzes(subjectId); // Refresh the quizzes list
    } catch (error) {
        console.error('Error deleting quiz:', error);
        showAlert('error', 'Failed to delete quiz');
    }
};

// DOM Elements
const adminManagementModal = document.getElementById('adminManagementModal');
const closeAdminModal = document.getElementById('closeAdminModal');
const usersList = document.getElementById('usersList');
const adminsList = document.getElementById('adminsList');
const userSearch = document.getElementById('userSearch');
const subjectsList = document.getElementById('subjectsList');
const quizzesList = document.getElementById('quizzesList');
const subjectSelect = document.getElementById('subjectSelect');

// Event Listeners
document.getElementById('manageAdminsBtn').addEventListener('click', () => {
    adminManagementModal.classList.remove('hidden');
    adminManagementModal.classList.add('flex');
    loadUsers();
});

closeAdminModal.addEventListener('click', () => {
    adminManagementModal.classList.add('hidden');
    adminManagementModal.classList.remove('flex');
});

userSearch.addEventListener('input', (e) => {
    const searchTerm = e.target.value.toLowerCase();
    displayUsers(allUsers.filter(user => 
        user.email.toLowerCase().includes(searchTerm) || 
        (user.displayName && user.displayName.toLowerCase().includes(searchTerm))
    ));
});

subjectSelect.addEventListener('change', (e) => {
    if (e.target.value) {
        loadQuizzes(e.target.value);
    } else {
        quizzesList.innerHTML = '';
    }
});

// Load and display users
async function loadUsers() {
    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        allUsers = [];
        currentAdmins = [];
        
        usersSnapshot.forEach(doc => {
            const userData = { id: doc.id, ...doc.data() };
            allUsers.push(userData);
            if (userData.isAdmin) {
                currentAdmins.push(userData);
            }
        });
        
        displayUsers(allUsers);
        displayAdmins();
    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('error', 'Failed to load users');
    }
}

function displayUsers(users) {
    usersList.innerHTML = users.map(user => {
        // Create onclick handler that's properly scoped
        const onClickHandler = `window.toggleAdminStatus('${user.id}', ${!user.isAdmin})`;
        return `
            <div class="flex items-center justify-between p-3 bg-neutral-800 rounded-lg">
                <div>
                    <p class="text-white">${user.email}</p>
                    ${user.displayName ? `<p class="text-gray-400 text-sm">${user.displayName}</p>` : ''}
                </div>
                <button 
                    onclick="${onClickHandler}"
                    class="px-4 py-2 rounded-lg ${user.isAdmin ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white"
                >
                    ${user.isAdmin ? 'Remove Admin' : 'Make Admin'}
                </button>
            </div>
        `;
    }).join('');
}

function displayAdmins() {
    adminsList.innerHTML = currentAdmins.map(admin => `
        <div class="flex items-center justify-between p-3 bg-neutral-800 rounded-lg">
            <div>
                <p class="text-white">${admin.email}</p>
                ${admin.displayName ? `<p class="text-gray-400 text-sm">${admin.displayName}</p>` : ''}
            </div>
        </div>
    `).join('');
}

// Toggle admin status
async function toggleAdminStatus(userId, makeAdmin) {
    try {
        await updateDoc(doc(db, 'users', userId), {
            isAdmin: makeAdmin
        });
        
        // Update local arrays
        const userIndex = allUsers.findIndex(u => u.id === userId);
        if (userIndex !== -1) {
            allUsers[userIndex].isAdmin = makeAdmin;
        }
        
        if (makeAdmin) {
            currentAdmins.push(allUsers[userIndex]);
        } else {
            const adminIndex = currentAdmins.findIndex(a => a.id === userId);
            if (adminIndex !== -1) {
                currentAdmins.splice(adminIndex, 1);
            }
        }
        
        // Refresh displays
        displayUsers(allUsers);
        displayAdmins();
        showAlert('success', `Successfully ${makeAdmin ? 'added' : 'removed'} admin privileges`);
    } catch (error) {
        console.error('Error updating admin status:', error);
        showAlert('error', 'Failed to update admin status');
    }
}

// Content Management Functions
async function loadSubjects() {
    try {
        const subjectsSnapshot = await getDocs(collection(db, 'subjects'));
        const subjects = [];
        
        subjectsSnapshot.forEach(doc => {
            subjects.push({ id: doc.id, ...doc.data() });
        });
        
        // Update subjects list
        subjectsList.innerHTML = subjects.map(subject => `
            <div class="flex items-center justify-between p-3 bg-neutral-800 rounded-lg">
                <p class="text-white">${subject.name}</p>
                <button 
                    onclick="deleteSubject('${subject.id}')"
                    class="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white"
                >
                    Delete
                </button>
            </div>
        `).join('');
        
        // Update subject select
        subjectSelect.innerHTML = `
            <option value="">Select a subject</option>
            ${subjects.map(subject => `
                <option value="${subject.id}">${subject.name}</option>
            `).join('')}
        `;
    } catch (error) {
        console.error('Error loading subjects:', error);
        showAlert('error', 'Failed to load subjects');
    }
}

async function loadQuizzes(subjectId) {
    try {
        const quizzesSnapshot = await getDocs(collection(db, 'subjects', subjectId, 'quizzes'));
        const quizzes = [];
        
        quizzesSnapshot.forEach(doc => {
            quizzes.push({ id: doc.id, ...doc.data() });
        });
        
        quizzesList.innerHTML = quizzes.map(quiz => `
            <div class="flex items-center justify-between p-3 bg-neutral-800 rounded-lg">
                <p class="text-white">${quiz.title}</p>
                <button 
                    onclick="deleteQuiz('${subjectId}', '${quiz.id}')"
                    class="px-4 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white"
                >
                    Delete
                </button>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading quizzes:', error);
        showAlert('error', 'Failed to load quizzes');
    }
}

async function deleteSubject(subjectId) {
    if (!confirm('Are you sure you want to delete this subject? This will also delete all quizzes in this subject.')) {
        return;
    }
    
    try {
        // First delete all quizzes in the subject
        const quizzesSnapshot = await getDocs(collection(db, 'subjects', subjectId, 'quizzes'));
        const batch = writeBatch(db);
        
        quizzesSnapshot.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        // Then delete the subject
        batch.delete(doc(db, 'subjects', subjectId));
        await batch.commit();
        
        showAlert('success', 'Subject deleted successfully');
        loadSubjects(); // Refresh the lists
    } catch (error) {
        console.error('Error deleting subject:', error);
        showAlert('error', 'Failed to delete subject');
    }
}

async function deleteQuiz(subjectId, quizId) {
    if (!confirm('Are you sure you want to delete this quiz?')) {
        return;
    }
    
    try {
        await deleteDoc(doc(db, 'subjects', subjectId, 'quizzes', quizId));
        showAlert('success', 'Quiz deleted successfully');
        loadQuizzes(subjectId); // Refresh the quizzes list
    } catch (error) {
        console.error('Error deleting quiz:', error);
        showAlert('error', 'Failed to delete quiz');
    }
}

// Initial load
document.addEventListener('DOMContentLoaded', () => {
    loadSubjects();
});