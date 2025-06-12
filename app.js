
// ===============================================
// 1. Firebase Configuration & Initialization
// ===============================================
// !!! IMPORTANT: Replace with your actual Firebase project configuration !!!
const firebaseConfig = {
  apiKey: "AIzaSyBa-pFNITxksJzz4kvDFXvYHfIzQZyjy_w",
  authDomain: "chatsome-a2c06.firebaseapp.com",
  projectId: "chatsome-a2c06",
  storageBucket: "chatsome-a2c06.firebasestorage.app",
  messagingSenderId: "704669977989",
  appId: "1:704669977989:web:ffe60426166c88bc8e08ec",
  measurementId: "G-SZ7P0CF4ZG"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database(); // For online status and typing indicators

// Configure Firestore settings (optional, but good practice for newer features)
db.settings({ timestampsInSnapshots: true });


// ===============================================
// 2. Global State Variables
// ===============================================
let currentUser = null; // Firebase Auth user object
let currentUserData = null; // Firestore user document data (name, email, avatarInitial, status)
let currentChatId = null; // Currently selected chat ID (only relevant on chat.html)
let currentChatOtherUser = null; // Data of the other user in the current chat (only relevant on chat.html)

// Unsubscribe functions for various real-time listeners
let unsubscribeFromMessages = null;
let unsubscribeFromChatList = null;
let unsubscribeFromOtherUserStatus = null;
let unsubscribeFromChatTyping = null;
let unsubscribeFromRTDBConnection = null; // Realtime DB connection status listener

let allUsers = []; // Cache all users for new chat modal (fetched once on login)
let typingTimer = null; // Timer for debouncing typing status for current user
const TYPING_TIMEOUT_MS = 3000; // Time after which typing status clears for sender

// Unread message tracking (simplified)
const unreadCounts = {}; // Stores {chatId: count}
let lastMessageTimestamps = {}; // Stores {chatId: latestMessageTimestamp} for tracking new messages
let isMobileView = window.innerWidth <= 768; // Flag to check if current view is mobile

// ===============================================
// 3. Common DOM Elements (Cached on DOMContentLoaded)
//    These variables are global so functions can access them.
//    Their existence is checked via `if (element)` before use.
// ===============================================
// Login page elements
let authScreen, authTitle, authNameInput, nameLabel, authEmailInput, authPasswordInput, authBtn, authSwitchBtn, authMessage, googleSignInBtn;
// Index page (sidebar) elements
let sidebarUserInfo, currentUserAvatar, currentUserNameSpan, logoutBtn, newChatBtn, chatSearchInput, chatList, sidebar, chatItemTemplate;
// Chat page elements
let welcomeScreen, currentChatDetails, backToSidebarBtn, currentChatAvatar, currentChatHeaderAvatarStatusIndicator, currentChatNameSpan, currentChatHeaderStatusIndicator, currentChatStatusP, chatOptionsBtn, chatOptionsMenu, clearChatBtn, toggleThemeBtn, blockUserBtn, chatMessages, messageInput, sendBtn, typingIndicator, typingText;
// Modals and context menus (present on multiple pages)
let newChatModal, closeNewChatModalBtn, modalSearchUsersInput, modalUserList;
let profileViewModal, closeProfileViewModalBtn, profileAvatar, profileName, profileEmail, profileStatus, profileJoined, profileActions;
let contextMenu;

// Function to cache DOM elements based on the current page's HTML structure
function cacheDOMElements() {
    // Universal/Modal elements (check for existence)
    profileViewModal = document.getElementById('profileViewModal');
    if (profileViewModal) {
        closeProfileViewModalBtn = document.getElementById('closeProfileViewModalBtn');
        profileAvatar = document.getElementById('profileAvatar');
        profileName = document.getElementById('profileName');
        profileEmail = document.getElementById('profileEmail');
        profileStatus = document.getElementById('profileStatus');
        profileJoined = document.getElementById('profileJoined');
        profileActions = profileViewModal.querySelector('.profile-actions');
    }
    contextMenu = document.getElementById('contextMenu');

    // Login page elements
    authScreen = document.getElementById('authScreen');
    if (authScreen) {
        authTitle = document.getElementById('authTitle');
        authNameInput = document.getElementById('authName');
        nameLabel = document.getElementById('nameLabel');
        authEmailInput = document.getElementById('authEmail');
        authPasswordInput = document.getElementById('authPassword');
        authBtn = document.getElementById('authBtn');
        authSwitchBtn = document.getElementById('authSwitch');
        authMessage = document.getElementById('authMessage');
        googleSignInBtn = document.getElementById('googleSignInBtn');
    }

    // Index page (sidebar) elements
    sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebarUserInfo = document.getElementById('sidebarUserInfo');
        currentUserAvatar = document.getElementById('currentUserAvatar');
        currentUserNameSpan = document.getElementById('currentUserName');
        logoutBtn = document.getElementById('logoutBtn');
        newChatBtn = document.getElementById('newChatBtn');
        chatSearchInput = document.getElementById('chatSearchInput');
        chatList = document.getElementById('chatList');
        chatItemTemplate = document.getElementById('chatItemTemplate');
        newChatModal = document.getElementById('newChatModal');
        if (newChatModal) {
            closeNewChatModalBtn = document.getElementById('closeNewChatModalBtn');
            modalSearchUsersInput = document.getElementById('modalSearchUsers');
            modalUserList = document.getElementById('modalUserList');
        }
    }

    // Chat page elements
    currentChatDetails = document.getElementById('currentChatDetails');
    if (currentChatDetails) {
        welcomeScreen = document.getElementById('welcomeScreen');
        backToSidebarBtn = document.getElementById('backToSidebarBtn');
        currentChatAvatar = currentChatDetails.querySelector('.chat-header-avatar');
        currentChatHeaderAvatarStatusIndicator = document.getElementById('currentChatHeaderAvatarStatusIndicator');
        currentChatNameSpan = document.querySelector('#currentChatName span');
        currentChatHeaderStatusIndicator = document.getElementById('currentChatHeaderStatusIndicator');
        currentChatStatusP = document.getElementById('currentChatStatus');
        chatOptionsBtn = document.getElementById('chatOptionsBtn');
        chatOptionsMenu = document.getElementById('chatOptionsMenu');
        if (chatOptionsMenu) {
            clearChatBtn = document.getElementById('clearChatBtn');
            toggleThemeBtn = document.getElementById('toggleThemeBtn');
            blockUserBtn = document.getElementById('blockUserBtn');
        }
        chatMessages = document.getElementById('chatMessages');
        messageInput = document.getElementById('messageInput');
        sendBtn = document.getElementById('sendBtn');
        typingIndicator = document.getElementById('typingIndicator');
        if (typingIndicator) {
            typingText = typingIndicator.querySelector('.typing-text');
        }
    }
    console.log('DOM elements cached.');
}


// ===============================================
// 4. Utility Functions (Globally Accessible)
// ===============================================

/**
 * Generates avatar initials from a name.
 * @param {string} name - The user's name.
 * @returns {string} The first letter(s) of the name in uppercase, or '?' if name is empty.
 */
function getAvatarInitial(name) {
    if (!name) return '?';
    const words = name.split(' ');
    if (words.length > 1) {
        return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
}

/**
 * Formats a Firestore Timestamp to a human-readable time string.
 * @param {firebase.firestore.Timestamp} timestamp - The Firestore timestamp object.
 * @returns {string} Formatted time string (e.g., "10:30 AM").
 */
function formatTime(timestamp) {
    if (!timestamp || !timestamp.toDate) return '';
    const date = timestamp.toDate();
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

/**
 * Formats a Firestore Timestamp to a date string for message separators.
 * @param {firebase.firestore.Timestamp} timestamp - The Firestore timestamp object.
 * @returns {string} Formatted date string (e.g., "Today", "Yesterday", "MMM DD, YYYY").
 */
function formatDateForSeparator(timestamp) {
    if (!timestamp || !timestamp.toDate) return '';
    const date = timestamp.toDate();
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const isSameDay = (d1, d2) => d1.getFullYear() === d2.getFullYear() &&
                                 d1.getMonth() === d2.getMonth() &&
                                 d1.getDate() === d2.getDate();

    if (isSameDay(date, today)) {
        return 'Today';
    } else if (isSameDay(date, yesterday)) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
}

/**
 * Displays a general-purpose message (error/success) at the top of the viewport.
 * @param {string} message - The message to display.
 * @param {boolean} isSuccess - True for success (green), false for error (red).
 */
function showAppMessage(message, isSuccess = false) {
    let tempDiv = document.createElement('div');
    tempDiv.textContent = message;
    tempDiv.style.cssText = `
        position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
        padding: 10px 20px; border-radius: 8px; z-index: 10000;
        background: ${isSuccess ? 'rgba(46, 204, 113, 0.9)' : 'rgba(231, 76, 60, 0.9)'};
        color: white; font-weight: bold; box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        transition: opacity 0.5s ease;
    `;
    document.body.appendChild(tempDiv);
    setTimeout(() => {
        tempDiv.style.opacity = '0';
        tempDiv.addEventListener('transitionend', () => tempDiv.remove());
    }, 5000);
}

/**
 * Sets the loading state for a button.
 * @param {HTMLElement} button - The button element.
 * @param {boolean} isLoading - True to show loading, false for normal state.
 * @param {string} originalText - The original text of the button.
 */
function setButtonLoading(button, isLoading, originalText) {
    if (button) {
        if (isLoading) {
            button.textContent = 'Loading...';
            button.disabled = true;
        } else {
            button.textContent = originalText;
            button.disabled = false;
        }
    }
}

/**
 * Clears chat-specific UI elements and state variables.
 * Used when navigating away from a chat or when a chat is deleted.
 */
function clearChatPageUI() {
    currentChatId = null;
    currentChatOtherUser = null;
    if (chatMessages) chatMessages.innerHTML = '';
    if (welcomeScreen) welcomeScreen.classList.remove('hidden');
    if (currentChatDetails) currentChatDetails.classList.add('hidden');
    if (typingIndicator) typingIndicator.classList.add('hidden');
    if (messageInput) messageInput.value = '';
    if (sendBtn) sendBtn.disabled = true;
    if (messageInput) updateMessageInputHeight();
    if (chatOptionsMenu) chatOptionsMenu.classList.add('hidden');
    hideContextMenu();
}

/**
 * Manages all Firebase listeners (Firestore and Realtime Database).
 * Call this before logging out or when navigating away from a page that uses many listeners.
 */
function unsubscribeAllListeners() {
    console.log('Unsubscribing all active listeners...');
    if (unsubscribeFromMessages) {
        unsubscribeFromMessages();
        unsubscribeFromMessages = null;
    }
    if (unsubscribeFromChatList) {
        unsubscribeFromChatList();
        unsubscribeFromChatList = null;
    }
    if (unsubscribeFromOtherUserStatus) {
        unsubscribeFromOtherUserStatus();
        unsubscribeFromOtherUserStatus = null;
    }
    if (unsubscribeFromChatTyping) {
        unsubscribeFromChatTyping();
        unsubscribeFromChatTyping = null;
    }
    if (unsubscribeFromRTDBConnection) {
        unsubscribeFromRTDBConnection();
        unsubscribeFromRTDBConnection = null;
    }
    // Clear any pending typing timer
    if (typingTimer) {
        clearTimeout(typingTimer);
        typingTimer = null;
    }
    // Also, clear RTDB onDisconnect for the current user if logged out.
    if (currentUser && currentUser.uid) {
        rtdb.ref(`/status/${currentUser.uid}`).onDisconnect().cancel();
        // Also clear any typing status for the current user in RTDB upon logout
        if (currentChatId) { // currentChatId might be null if on index.html
             rtdb.ref(`typing/${currentChatId}/${currentUser.uid}`).remove();
        }
        console.log(`RTDB onDisconnect canceled and typing status cleared for ${currentUser.uid}.`);
    }
    console.log('All Firebase listeners unsubscribed and cleaned up.');
}

/**
 * Displays a generic context menu.
 * @param {MouseEvent | TouchEvent} event - The event that triggered the context menu.
 * @param {Array<Object>} options - An array of {label, icon, action, isDanger} objects.
 * @param {Object} [data] - Optional data to pass to actions (e.g., messageId, userId).
 */
function showContextMenu(event, options, data = {}) {
    if (!contextMenu) return; // Ensure contextMenu element exists
    event.preventDefault(); // Prevent default browser context menu
    event.stopPropagation(); // Stop propagation to prevent document click from closing immediately

    // Clear existing options
    contextMenu.querySelector('ul').innerHTML = '';

    // Populate options
    options.forEach(option => {
        const li = document.createElement('li');
        li.innerHTML = `<i class="fas fa-${option.icon}"></i> ${option.label}`;
        if (option.isDanger) {
            li.classList.add('danger');
        }
        li.addEventListener('click', (e) => {
            e.stopPropagation(); // Stop propagation to prevent closing menu too early
            option.action(data);
            hideContextMenu();
        });
        contextMenu.querySelector('ul').appendChild(li);
    });

    // Position the menu
    // Adjust position to stay within viewport
    let x = event.clientX;
    let y = event.clientY;

    contextMenu.classList.add('show'); // Temporarily show to get dimensions
    const menuWidth = contextMenu.offsetWidth;
    const menuHeight = contextMenu.offsetHeight;
    contextMenu.classList.remove('show'); // Hide again

    if (x + menuWidth > window.innerWidth) {
        x = window.innerWidth - menuWidth - 10; // 10px margin
    }
    if (y + menuHeight > window.innerHeight) {
        y = window.innerHeight - menuHeight - 10; // 10px margin
    }
    // Ensure it doesn't go off screen to the left/top
    x = Math.max(0, x);
    y = Math.max(0, y);


    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.classList.add('show');
}

/**
 * Hides the generic context menu.
 */
function hideContextMenu() {
    if (contextMenu) {
        contextMenu.classList.remove('show');
    }
}

// Global click listener to hide context menu and chat options menu
document.addEventListener('click', (event) => {
    // Hide context menu
    if (contextMenu && contextMenu.classList.contains('show') && !contextMenu.contains(event.target)) {
        hideContextMenu();
    }
    // Hide chat options menu (if on chat.html)
    if (chatOptionsMenu && chatOptionsMenu.classList.contains('show') && !chatOptionsMenu.contains(event.target) && (!chatOptionsBtn || !chatOptionsBtn.contains(event.target))) {
        chatOptionsMenu.classList.remove('show');
    }
});


// ===============================================
// 5. Authentication Logic (Unified)
// ===============================================

let isRegistering = false; // Tracks if the user is in registration mode

/**
 * Toggles between login and registration forms.
 */
function toggleAuthMode() {
    isRegistering = !isRegistering;
    if (isRegistering) {
        if (authTitle) authTitle.textContent = 'Register for Chat Some';
        if (authBtn) authBtn.textContent = 'Register';
        if (authSwitchBtn) authSwitchBtn.textContent = 'Already have an account? Login';
        if (authNameInput) authNameInput.classList.remove('hidden');
        if (nameLabel) nameLabel.classList.remove('hidden');
    } else {
        if (authTitle) authTitle.textContent = 'Login to Chat Some';
        if (authBtn) authBtn.textContent = 'Login';
        if (authSwitchBtn) authSwitchBtn.textContent = 'Don\'t have an account? Register';
        if (authNameInput) authNameInput.classList.add('hidden');
        if (nameLabel) nameLabel.classList.add('hidden');
    }
    // Clear inputs when switching mode
    if (authEmailInput) authEmailInput.value = '';
    if (authPasswordInput) authPasswordInput.value = '';
    if (authNameInput) authNameInput.value = '';
    if (authMessage) authMessage.textContent = ''; // Clear any previous error messages
    if (authBtn) authBtn.disabled = false;
    if (googleSignInBtn) googleSignInBtn.disabled = false;
}

// Event listener for email/password auth button
// These event listeners will only be active if the elements exist on the current page (login.html)
if (authBtn) authBtn.addEventListener('click', async () => {
    const email = authEmailInput.value.trim();
    const password = authPasswordInput.value.trim();
    const name = authNameInput ? authNameInput.value.trim() : '';

    if (!email || !password || (isRegistering && !name)) {
        if (authMessage) authMessage.textContent = 'Please fill in all required fields.';
        return;
    }

    setButtonLoading(authBtn, true, isRegistering ? 'Register' : 'Login');
    if (authMessage) authMessage.textContent = '';

    try {
        if (isRegistering) {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            await db.collection('users').doc(userCredential.user.uid).set({
                name: name,
                email: email,
                avatarInitial: getAvatarInitial(name),
                status: 'offline', // Will be set to online by onAuthStateChanged
                lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('User registered and profile created:', userCredential.user.uid);
        } else {
            await auth.signInWithEmailAndPassword(email, password);
            console.log('User logged in with email/password.');
        }
    } catch (error) {
        let errorMessage = error.message;
        if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'Email already in use. Try logging in or use a different email.';
        } else if (error.code === 'auth/invalid-email') {
            errorMessage = 'Invalid email address.';
        } else if (error.code === 'auth/weak-password') {
            errorMessage = 'Password should be at least 6 characters.';
        } else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
            errorMessage = 'Invalid email or password.';
        }
        if (authMessage) authMessage.textContent = errorMessage;
        console.error('Auth error:', error);
    } finally {
        setButtonLoading(authBtn, false, isRegistering ? 'Register' : 'Login');
    }
});

// Event listener for auth mode switch
if (authSwitchBtn) authSwitchBtn.addEventListener('click', toggleAuthMode);

// Google Sign-in Provider
const googleProvider = new firebase.auth.GoogleAuthProvider();

// Handles Google Sign-in
if (googleSignInBtn) googleSignInBtn.addEventListener('click', async () => {
    setButtonLoading(googleSignInBtn, true, 'Sign in with Google');
    if (authMessage) authMessage.textContent = '';

    try {
        const result = await auth.signInWithPopup(googleProvider);
        const user = result.user;

        const userDocRef = db.collection('users').doc(user.uid);
        const userDoc = await userDocRef.get();

        if (!userDoc.exists) {
            await userDocRef.set({
                name: user.displayName || user.email.split('@')[0],
                email: user.email,
                avatarInitial: getAvatarInitial(user.displayName || user.email),
                status: 'offline', // Will be set to online by onAuthStateChanged
                lastActive: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('New Google user profile created.');
        } else {
            await userDocRef.update({
                status: 'online', // Ensure status is online after successful login
                lastActive: firebase.firestore.FieldValue.serverTimestamp()
            });
            console.log('Existing Google user logged in.');
        }
    } catch (error) {
        let errorMessage = error.message;
        if (error.code === 'auth/popup-closed-by-user') {
            errorMessage = 'Google Sign-in cancelled.';
        } else if (error.code === 'auth/cancelled-popup-request') {
            errorMessage = 'You have pending Google sign-in request. Please wait.';
        } else if (error.code === 'auth/account-exists-with-different-credential') {
            errorMessage = `An account with this email already exists using ${error.credential.providerId}. Please use that sign-in method.`;
        }
        if (authMessage) authMessage.textContent = errorMessage;
        console.error('Google Sign-in error:', error);
    } finally {
        setButtonLoading(googleSignInBtn, false, 'Sign in with Google');
    }
});

// ===============================================
// 6. User Status / Presence Logic (Shared)
// ===============================================

/**
 * Updates the current user's online/offline status in Firestore and Realtime Database.
 * Also sets up `onDisconnect` for RTDB to handle sudden disconnects.
 * @param {'online' | 'offline' | 'away'} status - The status to set.
 */
async function updateUserStatus(status) {
    if (!currentUser || !currentUser.uid) {
        console.warn('Cannot update user status: currentUser is not set.');
        return;
    }

    const userDocRef = db.collection('users').doc(currentUser.uid);
    const userRtdbRef = rtdb.ref(`/status/${currentUser.uid}`);
    const lastActiveTimestamp = firebase.firestore.FieldValue.serverTimestamp();
    const rtdbLastChanged = firebase.database.ServerValue.TIMESTAMP;

    try {
        // Update Firestore document
        await userDocRef.update({
            status: status,
            lastActive: lastActiveTimestamp
        });
        console.log(`User status updated to ${status} in Firestore for ${currentUser.uid}.`);

        // Update Realtime Database for real-time presence
        if (status === 'online') {
            userRtdbRef.set({
                status: 'online',
                last_changed: rtdbLastChanged
            });
            // Set up onDisconnect: if client disconnects, set status to offline
            userRtdbRef.onDisconnect().set({
                status: 'offline',
                last_changed: rtdbLastChanged
            });
            console.log(`RTDB onDisconnect hook set for ${currentUser.uid}.`);
        } else {
            // If explicitly setting offline (e.g., on logout), remove onDisconnect and set status immediately
            userRtdbRef.onDisconnect().cancel(); // Remove the onDisconnect hook
            userRtdbRef.set({
                status: 'offline',
                last_changed: rtdbLastChanged
            });
            console.log(`RTDB status explicitly set to offline for ${currentUser.uid}.`);
        }
    } catch (error) {
        console.error('Error updating user status:', error);
    }
}

/**
 * Updates the UI for a user's status indicator.
 * @param {HTMLElement} indicatorElement - The status indicator span element.
 * @param {string} status - The status ('online', 'away', 'offline').
 */
function updateStatusIndicatorUI(indicatorElement, status) {
    if (!indicatorElement) return;
    indicatorElement.className = 'status-indicator'; // Reset classes
    switch (status) {
        case 'online':
            indicatorElement.classList.add('status-online');
            break;
        case 'away':
            indicatorElement.classList.add('status-away');
            break;
        case 'offline':
            indicatorElement.classList.add('status-offline');
            break;
        default:
            indicatorElement.classList.add('status-offline'); // Default to offline
    }
}

/**
 * Subscribes to Realtime Database connection status.
 */
function subscribeToRTDBConnectionStatus() {
    if (unsubscribeFromRTDBConnection) unsubscribeFromRTDBConnection(); // Clean up previous
    
    const connectedRef = rtdb.ref('.info/connected');
    unsubscribeFromRTDBConnection = connectedRef.on('value', (snapshot) => {
        if (snapshot.val() === true) {
            console.log('Realtime Database: Connected.');
            // Update status to online if currently logged in
            if (currentUser && currentUser.uid) {
                updateUserStatus('online');
            }
        } else {
            console.log('Realtime Database: Disconnected.');
            // Firebase onDisconnect handles offline status if this disconnect is unexpected.
        }
    });
}


/**
 * Subscribes to another user's status updates from Firestore.
 * This will drive the status display in chat header and chat list.
 * @param {string} userId - The ID of the user to monitor.
 * @param {HTMLElement} statusIndicatorElement - The UI element (e.g., span) to update for the indicator.
 * @param {HTMLElement} statusTextElement - The text element (e.g., p) to update (e.g., "Online", "Offline 5m ago").
 */
function subscribeToOtherUserStatus(userId, statusIndicatorElement, statusTextElement) {
    // Clean up previous subscription if any
    if (unsubscribeFromOtherUserStatus) {
        console.log('Unsubscribing from previous other user status listener.');
        unsubscribeFromOtherUserStatus();
    }

    if (!userId) {
        console.warn('Cannot subscribe to user status: userId is null.');
        if (statusIndicatorElement) updateStatusIndicatorUI(statusIndicatorElement, 'offline');
        if (statusTextElement) statusTextElement.textContent = 'Offline';
        return;
    }

    const userDocRef = db.collection('users').doc(userId);
    unsubscribeFromOtherUserStatus = userDocRef.onSnapshot(doc => {
        if (doc.exists) {
            const userData = doc.data();
            const status = userData.status || 'offline';
            const lastActive = userData.lastActive ? userData.lastActive.toDate() : null;

            if (statusIndicatorElement) updateStatusIndicatorUI(statusIndicatorElement, status);
            
            let statusText = status.charAt(0).toUpperCase() + status.slice(1);
            if (status === 'offline' && lastActive) {
                const now = Date.now();
                const diffMs = now - lastActive.getTime();
                const diffSeconds = Math.round(diffMs / 1000);

                if (diffSeconds < 60) {
                    statusText = `Offline now`;
                } else if (diffSeconds < 3600) { // less than 1 hour
                    statusText = `Offline ${Math.floor(diffSeconds / 60)}m ago`;
                } else if (diffSeconds < 86400) { // less than 24 hours
                    statusText = `Offline ${Math.floor(diffSeconds / 3600)}h ago`;
                } else {
                    statusText = `Offline ${Math.floor(diffSeconds / 86400)}d ago`;
                }
            }
            if (statusTextElement) statusTextElement.textContent = statusText;
        } else {
            console.warn(`User document for ID ${userId} not found or deleted during status listen. Defaulting to offline.`);
            if (statusIndicatorElement) updateStatusIndicatorUI(statusIndicatorElement, 'offline');
            if (statusTextElement) statusTextElement.textContent = 'Offline';
        }
    }, error => {
        console.error('Error subscribing to other user status:', error);
        if (statusIndicatorElement) updateStatusIndicatorUI(statusIndicatorElement, 'offline');
        if (statusTextElement) statusTextElement.textContent = 'Error';
    });
    console.log(`Subscribed to user status for: ${userId}`);
}

// ===============================================
// 7. Authentication State Change & Routing
// ===============================================

// This is the main orchestrator for the entire application.
// It runs on every page load to determine authentication status and direct traffic.
auth.onAuthStateChanged(async (user) => {
    // Ensure DOM elements are cached BEFORE trying to use them in this listener
    // This listener can fire before DOMContentLoaded if scripts are deferred.
    cacheDOMElements(); 

    if (user) {
        // User is logged in
        currentUser = user;
        console.log('User logged in:', currentUser.uid, 'on page:', window.location.pathname);

        // Fetch currentUserData (critical for all subsequent operations)
        const userDocRef = db.collection('users').doc(currentUser.uid);
        try {
            const userDoc = await userDocRef.get();
            if (userDoc.exists) {
                currentUserData = { id: userDoc.id, ...userDoc.data() };
                console.log('Current user data fetched and cached:', currentUserData);
            } else {
                // This scenario means an authenticated user somehow doesn't have a Firestore profile.
                // It's a critical error for this app. Force logout.
                console.error("User document not found for:", currentUser.uid, "This is unexpected. Forcing logout.");
                await auth.signOut();
                return; // Exit to trigger re-evaluation by onAuthStateChanged
            }
        } catch (error) {
            console.error('Error fetching current user data:', error);
            await auth.signOut(); // Logout if data fetching fails
            return;
        }

        // Update status to online and set up RTDB connection listener
        await updateUserStatus('online');
        subscribeToRTDBConnectionStatus();

        // Page-specific initialization based on current URL
        if (window.location.pathname.includes('login.html')) {
            // Logged in on login page, redirect to index
            window.location.href = 'index.html';
        } else if (window.location.pathname.includes('index.html')) {
            // Logged in on index page, initialize index page
            console.log('Initializing index page logic...');
            // Display current user's info in sidebar
            if (sidebarUserInfo) sidebarUserInfo.addEventListener('click', () => openProfileViewModal(currentUser.uid));
            if (currentUserAvatar && currentUserNameSpan) {
                currentUserAvatar.textContent = currentUserData.avatarInitial;
                currentUserNameSpan.textContent = currentUserData.name;
            }
            // Fetch all users (populates `allUsers` cache)
            await fetchAllUsers();
            // Load user chats (depends on `allUsers` and `currentUserData`)
            loadUserChats();

            // Set up event listeners unique to index.html
            if (logoutBtn) logoutBtn.addEventListener('click', window.logout);
            if (newChatBtn) newChatBtn.addEventListener('click', () => {
                if (newChatModal) newChatModal.classList.remove('hidden');
                if (modalSearchUsersInput) modalSearchUsersInput.value = '';
                displayAllUsersInModal(); // Show all users by default
            });
            if (chatSearchInput) chatSearchInput.addEventListener('input', (e) => {
                const searchTerm = e.target.value.toLowerCase();
                Array.from(chatList.children).forEach(chatItem => {
                    if (chatItem.classList.contains('hidden') || !chatItem.dataset.chatId) return; 
                    const chatName = chatItem.querySelector('.chat-name span').textContent.toLowerCase();
                    const chatPreview = chatItem.querySelector('.chat-preview').textContent.toLowerCase();
                    if (chatName.includes(searchTerm) || chatPreview.includes(searchTerm)) {
                        chatItem.style.display = 'flex';
                    } else {
                        chatItem.style.display = 'none';
                    }
                });
            });
            if (closeNewChatModalBtn) closeNewChatModalBtn.addEventListener('click', () => {
                if (newChatModal) newChatModal.classList.add('hidden');
            });
            if (modalSearchUsersInput) modalSearchUsersInput.addEventListener('input', (e) => {
                displayAllUsersInModal(e.target.value);
            });


        } else if (window.location.pathname.includes('chat.html')) {
            // Logged in on chat page, initialize chat page
            console.log('Initializing chat page logic...');
            const urlParams = new URLSearchParams(window.location.search);
            const chatIdFromUrl = urlParams.get('chatId');
            const otherUserIdFromUrl = urlParams.get('otherUserId');

            if (!chatIdFromUrl || !otherUserIdFromUrl) {
                console.error('Missing chatId or otherUserId in URL parameters. Redirecting to index.html.');
                showAppMessage('Chat context not found. Redirecting to chat list.', false);
                setTimeout(() => window.location.href = 'index.html', 3000);
                return;
            }

            // Fetch all users first (important for `allUsers` cache used in `selectChat` and `openProfileViewModal`)
            await fetchAllUsers();

            // Fetch other user data (could be from `allUsers` cache or direct fetch)
            let otherUser = allUsers.find(u => u.id === otherUserIdFromUrl);
            if (!otherUser) {
                try {
                    const otherUserDoc = await db.collection('users').doc(otherUserIdFromUrl).get();
                    if (otherUserDoc.exists) {
                        otherUser = { id: otherUserDoc.id, ...otherUserDoc.data() };
                        allUsers.push(otherUser); // Add to cache
                    } else {
                        console.error('Other user data not found for ID:', otherUserIdFromUrl);
                        showAppMessage('Other user not found. Redirecting to chat list.', false);
                        setTimeout(() => window.location.href = 'index.html', 3000);
                        return;
                    }
                } catch (error) {
                    console.error('Error fetching other user data:', error);
                    showAppMessage('Error loading chat. Redirecting to chat list.', false);
                    setTimeout(() => window.location.href = 'index.html', 3000);
                    return;
                }
            }
            // Select the chat to load messages and set up chat UI
            selectChat(chatIdFromUrl, otherUser);

            // Set up event listeners unique to chat.html
            if (backToSidebarBtn) backToSidebarBtn.addEventListener('click', () => {
                // Navigate back to index.html and clean up chat page state
                window.location.href = 'index.html';
            });
            if (chatOptionsBtn) chatOptionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (chatOptionsMenu) chatOptionsMenu.classList.toggle('show');
            });
            if (clearChatBtn) clearChatBtn.addEventListener('click', async () => {
                if (!currentChatId || !confirm('Are you sure you want to clear all messages in this chat? This cannot be undone.')) {
                    return;
                }
                try {
                    const messagesRef = db.collection('chats').doc(currentChatId).collection('messages');
                    const snapshot = await messagesRef.get();
                    const batch = db.batch();
                    snapshot.docs.forEach(doc => { batch.delete(doc.ref); });
                    await batch.commit();
                    console.log(`All messages in chat ${currentChatId} cleared.`);
                    showAppMessage('Chat history cleared!', true);
                    if (chatMessages) chatMessages.innerHTML = '';
                } catch (error) {
                    console.error('Error clearing chat history:', error);
                    showAppMessage('Failed to clear chat history.');
                } finally {
                    if (chatOptionsMenu) chatOptionsMenu.classList.remove('show');
                }
            });
            if (toggleThemeBtn) toggleThemeBtn.addEventListener('click', () => {
                if (!chatMessages) return;
                const currentTheme = chatMessages.dataset.theme || 'default';
                let nextTheme;
                switch (currentTheme) {
                    case 'default':
                        nextTheme = 'theme-gradient';
                        break;
                    case 'theme-gradient':
                        nextTheme = 'theme-dark';
                        break;
                    case 'theme-dark':
                        nextTheme = 'default';
                        break;
                    default:
                        nextTheme = 'theme-gradient'; // Fallback
                }
                chatMessages.classList.remove('theme-gradient', 'theme-dark');
                if (nextTheme !== 'default') {
                    chatMessages.classList.add(nextTheme);
                }
                chatMessages.dataset.theme = nextTheme;
                console.log('Chat theme toggled to:', nextTheme);
                if (chatOptionsMenu) chatOptionsMenu.classList.remove('show');
                localStorage.setItem('chatTheme', nextTheme); // Store theme in localStorage to persist
            });
            // Apply saved theme on load (for chat.html)
            const savedTheme = localStorage.getItem('chatTheme');
            if (savedTheme && chatMessages) {
                chatMessages.classList.add(savedTheme);
                chatMessages.dataset.theme = savedTheme;
            }
            if (blockUserBtn) blockUserBtn.addEventListener('click', () => {
                if (currentChatOtherUser) {
                    alert(`Functionality "Block ${currentChatOtherUser.name}" is a Work In Progress.`);
                }
                if (chatOptionsMenu) chatOptionsMenu.classList.remove('show');
            });

            // Message input and send button listeners for chat.html
            if (messageInput) {
                messageInput.addEventListener('input', () => {
                    if (sendBtn) sendBtn.disabled = messageInput.value.trim() === '';
                    updateMessageInputHeight();
                    setTypingStatusRTDB(true);
                });
                messageInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (sendBtn) sendBtn.click();
                    }
                });
            }
            if (sendBtn) sendBtn.addEventListener('click', async () => {
                const messageText = messageInput.value.trim();
                if (messageText === '' || !currentUser || !currentChatId) {
                    console.warn('Cannot send message: Input is empty, user not logged in, or no chat selected.');
                    return;
                }
                try {
                    const messagesRef = db.collection('chats').doc(currentChatId).collection('messages');
                    const chatRef = db.collection('chats').doc(currentChatId);
                    await messagesRef.add({
                        senderId: currentUser.uid,
                        text: messageText,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    await chatRef.update({
                        lastMessage: { senderId: currentUser.uid, text: messageText, timestamp: firebase.firestore.FieldValue.serverTimestamp() },
                        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    setTypingStatusRTDB(false); // Clear typing status immediately
                    messageInput.value = '';
                    updateMessageInputHeight();
                    if (sendBtn) sendBtn.disabled = true;
                    clearTimeout(typingTimer); typingTimer = null; // Clear any pending typing timer
                    showAppMessage('Message sent!', true);
                } catch (error) {
                    console.error('Error sending message:', error);
                    showAppMessage("Failed to send message. Please check your internet and security rules.");
                }
            });
        }

        // Add a global listener to update user status to offline on browser/tab close
        window.addEventListener('beforeunload', () => updateUserStatus('offline'));

    } else {
        // User is NOT logged in
        console.log('User is not logged in.');
        // Update status to offline (if currentUser was previously set)
        if (currentUser && currentUser.uid) { // Ensure currentUser was valid before trying to update status
            await updateUserStatus('offline');
        }
        currentUser = null;
        currentUserData = null;

        unsubscribeAllListeners(); // Clean up all listeners
        clearChatPageUI(); // Clear chat/index specific UI (they might be present before redirect)

        if (!window.location.pathname.includes('login.html')) {
            // If not on login page and not logged in, redirect to login
            console.log('Redirecting to login.html');
            window.location.href = 'login.html';
        } else {
            // On login.html and not logged in, ensure auth screen is visible and ready
            if (authScreen) authScreen.classList.remove('hidden');
            // Reset auth UI state if coming from a previous session
            toggleAuthMode(); 
        }
    }
});

// Global logout function (accessible via `window.logout()`)
window.logout = async () => {
    try {
        await auth.signOut();
        console.log('User initiated logout successfully.');
    } catch (error) {
        console.error('Logout error:', error);
        showAppMessage('Failed to logout. Please try again.');
    }
};

// ===============================================
// 8. Chat List Management (Index Page Specific)
// ===============================================

/**
 * Loads and listens for real-time updates to the current user's chat list.
 */
function loadUserChats() {
    if (!currentUser || !currentUser.uid || !chatList || !chatItemTemplate) {
        console.warn('Cannot load user chats: dependencies missing (currentUser, chatList, chatItemTemplate).');
        if (chatList) chatList.innerHTML = '<p style="text-align: center; color: #64748b; padding: 20px;">No chats. Start a new conversation!</p>';
        return;
    }

    // Unsubscribe from previous chat list listener if active
    if (unsubscribeFromChatList) {
        unsubscribeFromChatList();
    }

    console.log('Subscribing to user chats for:', currentUser.uid);
    unsubscribeFromChatList = db.collection('chats')
        .where('participants', 'array-contains', currentUser.uid)
        .orderBy('lastUpdated', 'desc')
        .onSnapshot(async (snapshot) => {
            console.log('Chat list snapshot received. Changes:', snapshot.docChanges().length);
            const processedChatIds = new Set();
            const fragment = document.createDocumentFragment();

            const currentChatItems = new Map(); // Keep track of current DOM chat items for updates
            Array.from(chatList.children).forEach(item => {
                if (item.classList.contains('chat-item') && !item.classList.contains('hidden')) {
                    currentChatItems.set(item.dataset.chatId, item);
                }
            });

            for (const docChange of snapshot.docChanges()) {
                const chat = docChange.doc.data();
                chat.id = docChange.doc.id;

                const otherParticipantId = chat.participants.find(pId => pId !== currentUser.uid);
                if (!otherParticipantId) {
                    console.warn(`Chat ${chat.id} found without other participant for user ${currentUser.uid}. Skipping.`);
                    continue;
                }

                let otherUserData = allUsers.find(u => u.id === otherParticipantId);
                if (!otherUserData) {
                    try {
                        const userDoc = await db.collection('users').doc(otherParticipantId).get();
                        if (userDoc.exists) {
                            otherUserData = { id: userDoc.id, ...userDoc.data() };
                            allUsers.push(otherUserData); // Add to cache for future use
                            console.log(`Fetched and cached user ${otherUserData.name} for chat list.`);
                        } else {
                            otherUserData = { name: 'Unknown User', avatarInitial: '?', status: 'offline' };
                            console.warn(`User data not found for participant ID: ${otherParticipantId}. Using fallback.`);
                        }
                    } catch (fetchError) {
                        console.error(`Error fetching user ${otherParticipantId} for chat list:`, fetchError);
                        otherUserData = { name: 'Error User', avatarInitial: '!', status: 'offline' };
                    }
                }

                const lastMessageText = chat.lastMessage ? chat.lastMessage.text : 'No messages yet';
                const lastMessageTime = chat.lastMessage ? formatTime(chat.lastMessage.timestamp) : '';
                const otherUserStatus = otherUserData.status || 'offline';

                let chatItem = currentChatItems.get(chat.id); // Get existing item or null

                if (docChange.type === 'added' || docChange.type === 'modified') {
                    if (!chatItem) {
                        chatItem = chatItemTemplate.cloneNode(true);
                        chatItem.id = '';
                        chatItem.classList.remove('hidden');
                        chatItem.addEventListener('click', () => {
                            // Redirect to chat.html with query parameters
                            window.location.href = `chat.html?chatId=${chat.id}&otherUserId=${otherUserData.id}`;
                        });
                        chatItem.addEventListener('contextmenu', (e) => {
                            showContextMenu(e, [
                                { label: 'Delete Chat', icon: 'trash-alt', action: () => deleteChat(chat.id), isDanger: true },
                                { label: 'View Profile', icon: 'user', action: () => openProfileViewModal(otherUserData.id) }
                            ]);
                        });
                        chatItem.addEventListener('touchstart', (e) => {
                            e.preventDefault();
                            const touchTimer = setTimeout(() => {
                                showContextMenu(e, [
                                    { label: 'Delete Chat', icon: 'trash-alt', action: () => deleteChat(chat.id), isDanger: true },
                                    { label: 'View Profile', icon: 'user', action: () => openProfileViewModal(otherUserData.id) }
                                ]);
                            }, 500);
                            const touchEndHandler = () => { clearTimeout(touchTimer); chatItem.removeEventListener('touchend', touchEndHandler); chatItem.removeEventListener('touchcancel', touchEndHandler); };
                            chatItem.addEventListener('touchend', touchEndHandler);
                            chatItem.addEventListener('touchcancel', touchEndHandler);
                        });
                    }

                    chatItem.dataset.chatId = chat.id;
                    chatItem.dataset.otherUserId = otherUserData.id;
                    chatItem.dataset.otherUserName = otherUserData.name;

                    chatItem.querySelector('.chat-avatar').textContent = otherUserData.avatarInitial;
                    chatItem.querySelector('.chat-name span').textContent = otherUserData.name;
                    chatItem.querySelector('.chat-preview').textContent = lastMessageText;
                    chatItem.querySelector('.chat-time').textContent = lastMessageTime;

                    const statusIndicator = chatItem.querySelector('.status-indicator');
                    updateStatusIndicatorUI(statusIndicator, otherUserStatus);

                    // Handle unread messages (increment if new message from other user)
                    const latestMsgTimestamp = chat.lastMessage?.timestamp?.toMillis() || 0;
                    // Only mark as unread if the message is from the other participant and it's newer than what we last saw
                    if (latestMsgTimestamp > (lastMessageTimestamps[chat.id] || 0) && chat.lastMessage?.senderId !== currentUser.uid) {
                        unreadCounts[chat.id] = (unreadCounts[chat.id] || 0) + 1;
                        chatItem.querySelector('.unread-badge').textContent = unreadCounts[chat.id];
                        chatItem.querySelector('.unread-badge').classList.remove('hidden');
                    } else { // No unread messages or already read
                        chatItem.querySelector('.unread-badge').classList.add('hidden');
                    }
                    lastMessageTimestamps[chat.id] = latestMsgTimestamp; // Update last seen timestamp for this chat
                    
                    fragment.appendChild(chatItem); // Add to fragment for batch update
                    processedChatIds.add(chat.id); // Mark as processed

                } else if (docChange.type === 'removed') {
                    if (chatItem) {
                        chatItem.remove();
                        currentChatItems.delete(chat.id); // Remove from our map
                        delete unreadCounts[chat.id]; // Clean up unread count
                        delete lastMessageTimestamps[chat.id]; // Clean up timestamp
                    }
                }
            }

            // Remove any chat items that were previously there but are no longer in the snapshot
            Array.from(currentChatItems.keys()).forEach(id => {
                if (!processedChatIds.has(id)) {
                    currentChatItems.get(id).remove();
                    currentChatItems.delete(id);
                }
            });

            // Re-sort the list based on lastUpdated (to ensure newest chats are on top)
            const sortedItems = Array.from(fragment.children).filter(el => el.classList.contains('chat-item'))
                                    .sort((a, b) => {
                                        const chatA = snapshot.docs.find(doc => doc.id === a.dataset.chatId)?.data();
                                        const chatB = snapshot.docs.find(doc => doc.id === b.dataset.chatId)?.data();
                                        const timeA = chatA?.lastUpdated?.toMillis() || 0;
                                        const timeB = chatB?.lastUpdated?.toMillis() || 0;
                                        return timeB - timeA; // Descending order (newest first)
                                    });
            
            chatList.innerHTML = ''; // Clear existing list before appending sorted ones
            sortedItems.forEach(item => chatList.appendChild(item));
            console.log('Chat list updated and sorted.');

            if (chatList.children.length === 0) {
                chatList.innerHTML = '<p style="text-align: center; color: #64748b; padding: 20px;">No chats yet. Click "+" to start a new conversation!</p>';
            }

        }, error => {
            console.error("Error loading chats:", error);
            if (chatList) chatList.innerHTML = '<p style="text-align: center; color: red; padding: 20px;">Error loading chats. Please try again.</p>';
        });
}

/**
 * Deletes a chat and its messages.
 * @param {string} chatId - The ID of the chat to delete.
 */
async function deleteChat(chatId) {
    if (!confirm('Are you sure you want to delete this chat and all its messages? This cannot be undone.')) {
        return;
    }
    try {
        const chatRef = db.collection('chats').doc(chatId);
        const messagesRef = chatRef.collection('messages');

        // Delete all messages in the subcollection (Firestore doesn't auto-delete subcollections)
        const snapshot = await messagesRef.get();
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`All messages for chat ${chatId} deleted.`);

        // Then delete the chat document itself
        await chatRef.delete();
        console.log(`Chat ${chatId} deleted.`);

        showAppMessage('Chat deleted successfully!', true);
    } catch (error) {
        console.error('Error deleting chat:', error);
        showAppMessage('Failed to delete chat. Please check security rules.');
    }
}


// ===============================================
// 9. New Chat Modal Logic (Index Page Specific)
// ===============================================

/**
 * Fetches all registered users (excluding the current user) for the new chat modal.
 * Caches them in `allUsers` array.
 */
async function fetchAllUsers() {
    if (!currentUser || !modalUserList) {
        if (modalUserList) modalUserList.innerHTML = `<p style="text-align: center; color: #64748b; padding: 20px;">Please log in to see users.</p>`;
        return;
    }

    if (modalUserList) modalUserList.innerHTML = `<p style="text-align: center; color: #64748b; padding: 20px;">Loading users...</p>`;

    try {
        console.log('Fetching all users...');
        const snapshot = await db.collection('users').get();
        allUsers = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(user => user.id !== currentUser.uid);

        displayAllUsersInModal();
        console.log('All users fetched and cached:', allUsers.length, 'users.');
    }
    catch (error) {
        console.error('Error fetching all users:', error);
        if (modalUserList) modalUserList.innerHTML = `<p style="text-align: center; color: red; padding: 20px;">Error loading users. Please check console and Firebase rules.</p>`;
    }
}

/**
 * Displays users in the new chat modal, optionally filtering by search text.
 * @param {string} searchText - The text to filter users by (name or email).
 */
function displayAllUsersInModal(searchText = '') {
    if (!modalUserList) return;
    modalUserList.innerHTML = '';

    const filteredUsers = allUsers.filter(user =>
        (user.name && user.name.toLowerCase().includes(searchText.toLowerCase())) ||
        (user.email && user.email.toLowerCase().includes(searchText.toLowerCase()))
    );

    if (filteredUsers.length === 0) {
        modalUserList.innerHTML = `<p style="text-align: center; color: #64748b; padding: 20px;">No users found.</p>`;
        return;
    }

    filteredUsers.forEach(user => {
        const userItem = document.createElement('div');
        userItem.classList.add('user-item');
        userItem.dataset.userId = user.id;

        userItem.innerHTML = `
            <div class="user-avatar">${getAvatarInitial(user.name)}</div>
            <div class="user-details">
                <h4>${user.name || user.email.split('@')[0]}</h4>
                <p>${user.email}</p>
            </div>
        `;
        // Add click listener to select/start chat
        userItem.addEventListener('click', () => startNewChat(user));
        // Add click listener to open profile view modal (for avatar)
        userItem.querySelector('.user-avatar').addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent starting chat if avatar clicked
            openProfileViewModal(user.id);
        });
        // Add context menu for user items (right-click / long-press)
        userItem.addEventListener('contextmenu', (e) => {
            showContextMenu(e, [
                { label: 'View Profile', icon: 'user', action: () => openProfileViewModal(user.id) },
                { label: 'Start Chat', icon: 'comment-dots', action: () => startNewChat(user) }
            ]);
        });
        userItem.addEventListener('touchstart', (e) => {
            const touchTimer = setTimeout(() => {
                showContextMenu(e, [
                    { label: 'View Profile', icon: 'user', action: () => openProfileViewModal(user.id) },
                    { label: 'Start Chat', icon: 'comment-dots', action: () => startNewChat(user) }
                ]);
            }, 500);
            const touchEndHandler = () => { clearTimeout(touchTimer); userItem.removeEventListener('touchend', touchEndHandler); userItem.removeEventListener('touchcancel', touchEndHandler); };
            userItem.addEventListener('touchend', touchEndHandler);
            userItem.addEventListener('touchcancel', touchEndHandler);
        });

        modalUserList.appendChild(userItem);
    });
}

/**
 * Initiates a new chat or selects an existing one with a chosen user.
 * This function redirects to chat.html.
 * @param {Object} otherUser - The user object to start a chat with.
 */
async function startNewChat(otherUser) {
    if (!currentUser || !otherUser) {
        console.warn('Cannot start new chat: currentUser or otherUser is missing.');
        return;
    }

    try {
        console.log(`Attempting to start chat with ${otherUser.name} (${otherUser.id}).`);
        // Check if a chat already exists between these two users
        // Query for chats where current user is a participant
        const existingChatQuery = await db.collection('chats')
            .where('participants', 'array-contains', currentUser.uid)
            .get();

        let existingChat = null;
        existingChatQuery.forEach(doc => {
            const chatData = doc.data();
            if (chatData.participants.includes(otherUser.id)) {
                existingChat = { id: doc.id, ...chatData };
                return;
            }
        });

        if (existingChat) {
            console.log('Existing chat found, redirecting:', existingChat.id);
            window.location.href = `chat.html?chatId=${existingChat.id}&otherUserId=${otherUser.id}`;
        } else {
            console.log('Creating new chat with:', otherUser.name);
            const newChatRef = await db.collection('chats').add({
                participants: [currentUser.uid, otherUser.id],
                lastMessage: null, // No messages yet
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            window.location.href = `chat.html?chatId=${newChatRef.id}&otherUserId=${otherUser.id}`;
        }

        if (newChatModal) newChatModal.classList.add('hidden');
    } catch (error) {
        console.error('Error starting new chat:', error);
        showAppMessage('Failed to start chat. Please try again or check Firebase rules.');
    }
}


// ===============================================
// 10. Chat Page Logic (chat.html specific)
// ===============================================

/**
 * Selects a chat and loads its messages on the chat.html page.
 * @param {string} chatId - The ID of the chat to select.
 * @param {Object} otherUserData - Data of the other participant in the chat.
 */
async function selectChat(chatId, otherUserData) {
    if (!currentUser || chatId === currentChatId) return;

    console.log('Selecting chat:', chatId, 'with user:', otherUserData.name);

    currentChatId = chatId;
    currentChatOtherUser = otherUserData;

    // Update chat header details
    if (welcomeScreen) welcomeScreen.classList.add('hidden');
    if (currentChatDetails) currentChatDetails.classList.remove('hidden');
    if (currentChatAvatar) currentChatAvatar.textContent = otherUserData.avatarInitial;
    if (currentChatNameSpan) currentChatNameSpan.textContent = otherUserData.name;
    
    // Set up profile view for chat partner's avatar click
    if (currentChatAvatar) currentChatAvatar.onclick = () => openProfileViewModal(otherUserData.id);

    // Subscribe to other user's status for header (both avatar and name indicators)
    subscribeToOtherUserStatus(otherUserData.id, currentChatHeaderStatusIndicator, currentChatStatusP);
    if (currentChatHeaderAvatarStatusIndicator) updateStatusIndicatorUI(currentChatHeaderAvatarStatusIndicator, otherUserData.status || 'offline');

    if (chatMessages) chatMessages.innerHTML = '';
    if (typingIndicator) typingIndicator.classList.add('hidden');

    // Unsubscribe from previous chat's listeners
    if (unsubscribeFromMessages) unsubscribeFromMessages();
    if (unsubscribeFromChatTyping) unsubscribeFromChatTyping();
    if (chatOptionsMenu) chatOptionsMenu.classList.add('hidden');

    // Listen for new messages in the selected chat
    let lastDisplayedDate = null; // To track last date for separators
    unsubscribeFromMessages = db.collection('chats').doc(chatId).collection('messages')
        .orderBy('timestamp')
        .onSnapshot((snapshot) => {
            console.log('Messages snapshot received for chat:', chatId, 'Changes:', snapshot.docChanges().length);
            // Process changes to update/add/remove messages
            snapshot.docChanges().forEach(change => {
                const messageData = { id: change.doc.id, ...change.doc.data() };
                if (change.type === 'added') {
                    const formattedDate = formatDateForSeparator(messageData.timestamp);
                    // Add date separator if date changes or if it's the very first message displayed
                    if (lastDisplayedDate !== formattedDate || (chatMessages && chatMessages.children.length === 0)) {
                        displayDateSeparator(formattedDate);
                        lastDisplayedDate = formattedDate;
                    }
                    displayMessage(messageData);
                } else if (change.type === 'modified') {
                    // Find and update the existing message in DOM
                    const existingMessageElement = document.querySelector(`.message[data-message-id="${messageData.id}"]`);
                    if (existingMessageElement) {
                        existingMessageElement.querySelector('.message-bubble').firstChild.textContent = messageData.text;
                    }
                } else if (change.type === 'removed') {
                    const existingMessageElement = document.querySelector(`.message[data-message-id="${messageData.id}"]`);
                    if (existingMessageElement) {
                        existingMessageElement.remove();
                    }
                }
            });
            scrollToBottom();
        }, error => {
            console.error("Error loading messages:", error);
            showAppMessage("Failed to load messages. Please try again.");
        });

    // Listen for typing status in the selected chat (Realtime Database)
    const typingRef = rtdb.ref(`typing/${chatId}`);
    unsubscribeFromChatTyping = typingRef.on('value', (snapshot) => {
        const typingStatus = snapshot.val() || {};
        const isOtherUserTyping = typingStatus[currentChatOtherUser.id];

        if (isOtherUserTyping) {
            if (typingIndicator) typingIndicator.classList.remove('hidden');
            if (typingText) typingText.textContent = `${currentChatOtherUser.name} is typing...`;
            scrollToBottom(); // Scroll to show typing indicator if it appears
        } else {
            if (typingIndicator) typingIndicator.classList.add('hidden');
        }
    }, (error) => {
        console.error("Error monitoring typing status:", error);
    });
    console.log(`Subscribed to typing status for chat: ${chatId}`);

    // Adjust visibility of elements based on mobile/desktop view
    if (isMobileView) {
        // On mobile, the sidebar is not present on chat.html, back button is shown
        if (backToSidebarBtn) backToSidebarBtn.style.display = 'block';
    } else {
        // On desktop, the sidebar is always present, back button is hidden
        if (backToSidebarBtn) backToSidebarBtn.style.display = 'none';
    }
}

/**
 * Displays a single message in the chat messages area.
 * @param {Object} message - The message object from Firestore (must contain 'id').
 */
function displayMessage(message) {
    if (!chatMessages) return;

    // Check if message already exists (to avoid duplicates on initial load or re-renders)
    if (document.querySelector(`.message[data-message-id="${message.id}"]`)) {
        return;
    }

    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.dataset.messageId = message.id; // Store message ID for context menu ops

    if (message.senderId === currentUser.uid) {
        messageElement.classList.add('sent');
    } else {
        messageElement.classList.add('received');
    }

    messageElement.innerHTML = `
        <div class="message-bubble">
            ${message.text}
            <div class="message-time">${formatTime(message.timestamp)}</div>
        </div>
    `;

    // Add context menu listener for messages (right-click / long-press)
    messageElement.addEventListener('contextmenu', (e) => {
        const options = [];
        if (message.senderId === currentUser.uid) {
            options.push(
                { label: 'Edit Message', icon: 'edit', action: (data) => editMessage(data.messageId, data.currentText) },
                { label: 'Delete Message', icon: 'trash-alt', action: (data) => deleteMessage(data.messageId), isDanger: true }
            );
        } else {
            options.push(
                { label: 'Reply', icon: 'reply', action: (data) => console.log('Reply to:', data.messageId, data.currentText) },
                { label: 'Delete For Me', icon: 'trash-alt', action: (data) => deleteMessageLocally(data.messageId), isDanger: true }
            );
        }
        showContextMenu(e, options, { messageId: message.id, currentText: message.text });
    });
    messageElement.addEventListener('touchstart', (e) => {
        const touchTimer = setTimeout(() => {
            const options = [];
            if (message.senderId === currentUser.uid) {
                options.push(
                    { label: 'Edit Message', icon: 'edit', action: (data) => editMessage(data.messageId, data.currentText) },
                    { label: 'Delete Message', icon: 'trash-alt', action: (data) => deleteMessage(data.messageId), isDanger: true }
                );
            } else {
                options.push(
                    { label: 'Reply', icon: 'reply', action: (data) => console.log('Reply to:', data.messageId, data.currentText) },
                    { label: 'Delete For Me', icon: 'trash-alt', action: (data) => deleteMessageLocally(data.messageId), isDanger: true }
                );
            }
            showContextMenu(e, options, { messageId: message.id, currentText: message.text });
        }, 500);
        const touchEndHandler = () => { clearTimeout(touchTimer); messageElement.removeEventListener('touchend', touchEndHandler); messageElement.removeEventListener('touchcancel', touchEndHandler); };
        messageElement.addEventListener('touchend', touchEndHandler);
        messageElement.addEventListener('touchcancel', touchEndHandler);
    });

    chatMessages.appendChild(messageElement);
}

/**
 * Displays a date separator in the chat messages area.
 * @param {string} dateText - The text to display for the date (e.g., "Today", "Yesterday").
 */
function displayDateSeparator(dateText) {
    if (!chatMessages) return;
    const separator = document.createElement('div');
    separator.classList.add('date-separator');
    separator.innerHTML = `<span>${dateText}</span>`;
    chatMessages.appendChild(separator);
}

/**
 * Edits a message in Firestore and updates UI.
 * @param {string} messageId - The ID of the message to edit.
 * @param {string} currentText - The current text of the message.
 */
async function editMessage(messageId, currentText) {
    if (!currentChatId) return;

    const newText = prompt('Edit your message:', currentText);
    if (newText && newText.trim() !== '' && newText.trim() !== currentText) {
        try {
            await db.collection('chats').doc(currentChatId).collection('messages').doc(messageId).update({
                text: newText.trim(),
                editedAt: firebase.firestore.FieldValue.serverTimestamp() // Add edited timestamp
            });
            console.log(`Message ${messageId} edited.`);
            showAppMessage('Message edited successfully!', true);
        } catch (error) {
            console.error('Error editing message:', error);
            showAppMessage('Failed to edit message. Check security rules.');
        }
    }
}

/**
 * Deletes a message from Firestore and updates UI (for sent messages).
 * @param {string} messageId - The ID of the message to delete.
 */
async function deleteMessage(messageId) {
    if (!currentChatId) return;

    if (!confirm('Are you sure you want to delete this message for everyone?')) {
        return;
    }

    try {
        await db.collection('chats').doc(currentChatId).collection('messages').doc(messageId).delete();
        console.log(`Message ${messageId} deleted from Firestore.`);
        showAppMessage('Message deleted successfully!', true);
    } catch (error) {
        console.error('Error deleting message:', error);
        showAppMessage('Failed to delete message. Check security rules.');
    }
}

/**
 * Deletes a message from the current user's view only (for received messages).
 * This doesn't actually delete from Firestore.
 * @param {string} messageId - The ID of the message to remove from UI.
 */
function deleteMessageLocally(messageId) {
    const messageElement = document.querySelector(`.message[data-message-id="${messageId}"]`);
    if (messageElement) {
        messageElement.remove();
        console.log(`Message ${messageId} removed from UI (local delete).`);
        showAppMessage('Message removed from your view.', true);
    }
}


// ===============================================
// 11. Typing Indicator Logic (Realtime Database)
// ===============================================

/**
 * Updates the current user's typing status in Realtime Database for the current chat.
 * Uses debouncing to prevent excessive updates.
 * @param {boolean} isTyping - True if the user is typing, false otherwise.
 */
function setTypingStatusRTDB(isTyping) {
    if (!currentUser || !currentChatId) return;

    const typingRef = rtdb.ref(`typing/${currentChatId}/${currentUser.uid}`);

    if (isTyping) {
        typingRef.set(true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            typingRef.remove()
                .then(() => console.log('Typing status cleared after timeout.'))
                .catch(e => console.error('Error clearing typing status after timeout:', e));
            typingTimer = null;
        }, TYPING_TIMEOUT_MS);
    } else {
        clearTimeout(typingTimer);
        typingTimer = null;
        typingRef.remove()
            .then(() => console.log('Typing status cleared manually.'))
            .catch(e => console.error('Error clearing typing status manually:', e));
    }
}

// ===============================================
// 12. Chat Options Menu (Chat Page Specific)
// ===============================================
// Event listeners for chat options menu are set in `selectChat` for chat.html
// and `initIndexPage` for index.html if these elements exist.
// This is done to ensure they are attached only once to elements that are present.


// ===============================================
// 13. Profile View Modal (Shared Across Pages)
// ===============================================

// Close profile view modal
if (closeProfileViewModalBtn) closeProfileViewModalBtn.addEventListener('click', () => {
    if (profileViewModal) profileViewModal.classList.add('hidden');
});

/**
 * Opens the full-screen profile view modal for a given user.
 * @param {string} userId - The ID of the user whose profile to display.
 */
async function openProfileViewModal(userId) {
    if (!profileViewModal || !profileName || !profileEmail || !profileAvatar || !profileStatus || !profileJoined || !profileActions) {
        console.error("Profile modal DOM elements not found. Cannot open profile.");
        return;
    }

    profileViewModal.classList.remove('hidden');
    profileName.textContent = 'Loading...';
    profileEmail.textContent = '';
    profileAvatar.textContent = '';
    profileStatus.textContent = '';
    profileJoined.textContent = '';
    profileActions.innerHTML = ''; // Clear previous actions

    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const userData = userDoc.data();
            profileAvatar.textContent = getAvatarInitial(userData.name);
            profileName.textContent = userData.name;
            profileEmail.textContent = userData.email;
            profileStatus.textContent = userData.status || 'Offline';
            profileJoined.textContent = userData.createdAt ? userData.createdAt.toDate().toLocaleDateString() : 'N/A';

            let statusIndicatorInProfileAvatar = profileAvatar.querySelector('.status-indicator');
            if (!statusIndicatorInProfileAvatar) {
                statusIndicatorInProfileAvatar = document.createElement('span');
                statusIndicatorInProfileAvatar.classList.add('status-indicator');
                profileAvatar.appendChild(statusIndicatorInProfileAvatar);
            }
            updateStatusIndicatorUI(statusIndicatorInProfileAvatar, userData.status);

            // Add dynamic actions based on whose profile it is
            if (userId === currentUser.uid) {
                const logoutAction = document.createElement('button');
                logoutAction.classList.add('danger');
                logoutAction.textContent = 'Logout';
                logoutAction.addEventListener('click', async () => {
                    if (profileViewModal) profileViewModal.classList.add('hidden');
                    window.logout(); // Use global logout
                });
                profileActions.appendChild(logoutAction);

            } else {
                const startChatAction = document.createElement('button');
                startChatAction.classList.add('primary');
                startChatAction.textContent = 'Message';
                startChatAction.addEventListener('click', async () => {
                    if (profileViewModal) profileViewModal.classList.add('hidden');
                    // This logic redirects to chat.html with context
                    const existingChat = (await db.collection('chats')
                                                .where('participants', 'array-contains', currentUser.uid)
                                                .get())
                                                .docs.find(doc => doc.data().participants.includes(userId));
                    if (existingChat) {
                        window.location.href = `chat.html?chatId=${existingChat.id}&otherUserId=${userId}`;
                    } else {
                        const newChatRef = await db.collection('chats').add({
                            participants: [currentUser.uid, userId],
                            lastMessage: null,
                            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                            createdAt: firebase.firestore.FieldValue.serverTimestamp()
                        });
                        window.location.href = `chat.html?chatId=${newChatRef.id}&otherUserId=${userId}`;
                    }
                });
                profileActions.appendChild(startChatAction);

                const viewSharedMediaAction = document.createElement('button');
                viewSharedMediaAction.classList.add('secondary');
                viewSharedMediaAction.textContent = 'View Shared Media (WIP)';
                viewSharedMediaAction.addEventListener('click', () => alert('Shared media view is a Work In Progress.'));
                profileActions.appendChild(viewSharedMediaAction);
            }

        } else {
            profileName.textContent = 'User Not Found';
            profileEmail.textContent = 'N/A';
            profileAvatar.textContent = '?';
            profileStatus.textContent = 'Unknown';
            profileJoined.textContent = 'N/A';
            const statusIndicatorInProfileAvatar = profileAvatar.querySelector('.status-indicator');
            if (statusIndicatorInProfileAvatar) statusIndicatorInProfileAvatar.remove(); // Remove indicator if user not found
        }
    } catch (error) {
        console.error('Error loading profile:', error);
        profileName.textContent = 'Error Loading Profile';
        profileEmail.textContent = '';
        profileAvatar.textContent = '!';
        profileStatus.textContent = 'Error';
        profileJoined.textContent = '';
        const statusIndicatorInProfileAvatar = profileAvatar.querySelector('.status-indicator');
        if (statusIndicatorInProfileAvatar) statusIndicatorInProfileAvatar.remove(); // Remove indicator on error
    }
}


// ===============================================
// 14. Mobile Responsiveness & Main Entry Point
// ===============================================

// Adjust isMobileView on resize
window.addEventListener('resize', () => {
    isMobileView = window.innerWidth <= 768;
    // Hide context menu and chat options menu when resizing
    hideContextMenu();
    if (chatOptionsMenu) chatOptionsMenu.classList.remove('show');
});

// Mobile back button for chat.html
if (backToSidebarBtn) { // This element only exists on chat.html
    backToSidebarBtn.addEventListener('click', () => {
        // This button is only active on mobile when on chat.html
        if (isMobileView) {
            // Before navigating, clean up chat-specific listeners and state
            if (unsubscribeFromMessages) unsubscribeFromMessages();
            if (unsubscribeFromChatTyping) unsubscribeFromChatTyping();
            
            // Clear any typing status for the current user in RTDB before leaving
            if (currentUser && currentUser.uid && currentChatId) {
                rtdb.ref(`typing/${currentChatId}/${currentUser.uid}`).remove().catch(e => console.error("Error clearing typing status on back:", e));
            }
            // Navigate back to the index page (chat list)
            window.location.href = 'index.html';
        }
    });
}

// Global DOMContentLoaded listener: Main entry point for all pages.
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Cache all relevant DOM elements for the current page
    cacheDOMElements();

    // 2. Perform the initial authentication check and route accordingly.
    // This function will call the appropriate page-specific initialization logic.
    console.log('DOMContentLoaded: Starting auth check and routing...');
    // The `onAuthStateChanged` listener itself handles calling the page-specific
    // initialization logic once auth state and currentUserData are resolved.
});