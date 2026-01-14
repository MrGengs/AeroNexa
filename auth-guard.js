/**
 * Authentication Guard System
 * Protects pages from unauthorized access
 * Redirects to auth.html if user is not authenticated
 * Uses Firebase Auth state (no localStorage)
 */

// Import Firebase Auth functions
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

// Import Firebase config to get initialized app
// Note: firebase-config.js must be loaded first
let auth = null;
let authChecked = false;
let authCheckComplete = false;
let currentAuthUser = null;

// Get current page filename
function getCurrentPage() {
    const currentPath = window.location.pathname;
    return currentPath.split('/').pop() || 'index.html';
}

// Check if current page should be protected
function shouldProtectPage() {
    const currentPage = getCurrentPage();
    // Don't protect index.html and auth.html
    return currentPage !== 'auth.html' && currentPage !== 'index.html';
}

// Wait for Firebase to be initialized
function initAuthGuard() {
    // Only protect pages that need protection
    if (!shouldProtectPage()) {
        console.log('Page does not need protection:', getCurrentPage());
        return;
    }

    const checkFirebase = setInterval(() => {
        if (window.firebaseAuth) {
            auth = window.firebaseAuth;
            clearInterval(checkFirebase);
            checkAuthState();
        }
    }, 100);

    // Timeout after 3 seconds - if Firebase not ready, redirect
    setTimeout(() => {
        if (!auth && shouldProtectPage()) {
            window.location.href = 'auth.html';
        }
    }, 3000);
}

/**
 * Check authentication state
 * Redirect to auth.html if not authenticated
 */
function checkAuthState() {
    if (!shouldProtectPage()) {
        return;
    }

    if (!auth) {
        // If auth not initialized, redirect immediately
        if (shouldProtectPage()) {
            window.location.href = 'auth.html';
        }
        return;
    }

    // Use onAuthStateChanged to check authentication
    // This will trigger immediately if user is already logged in
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
        authChecked = true;
        currentAuthUser = user;
        
        if (!user) {
            // User is not authenticated - check UID
            window.currentUserUID = null;
            window.currentUserEmail = null;
            window.currentUserDisplayName = null;
            window.currentUserPhotoURL = null;
            
            // Redirect to auth.html if on protected page
            if (shouldProtectPage()) {
                redirectToAuth();
            }
            authCheckComplete = true;
        } else {
            // User is authenticated - store UID and user info globally
            window.currentUserUID = user.uid;
            window.currentUserEmail = user.email;
            window.currentUserDisplayName = user.displayName;
            window.currentUserPhotoURL = user.photoURL;
            
            // Special check for founder.html page - only founder@aeronexa.com can access
            const currentPage = getCurrentPage();
            if (currentPage === 'founder.html') {
                // Check if user email is founder@aeronexa.com
                if (user.email !== 'founder@aeronexa.com') {
                    console.log('Access denied: Only founder@aeronexa.com can access founder.html');
                    // Redirect non-founder users to dashboard
                    window.location.href = 'dashboard.html';
                    return;
                }
                console.log('Founder access granted');
            }
            
            // Ensure user data is saved to Firestore (fallback if not saved during login)
            if (window.firebaseSaveUserToFirestore) {
                try {
                    // Determine provider from user object
                    const provider = user.providerData && user.providerData.length > 0 
                        ? user.providerData[0].providerId.replace('.com', '')
                        : 'email';
                    
                    await window.firebaseSaveUserToFirestore(user, user.displayName, provider === 'google' ? 'google' : 'email');
                } catch (error) {
                    console.error('Error saving user to Firestore (fallback):', error);
                }
            }
            
            authCheckComplete = true;
            
            // Verify UID is set
            if (!window.currentUserUID || !user.uid) {
                // UID missing - redirect immediately
                window.location.href = 'auth.html';
                return;
            }
            
            // Dispatch event to notify that auth check is complete
            window.dispatchEvent(new CustomEvent('authCheckComplete', { detail: { user: user } }));
        }
    });
    
    // Additional security: Check UID periodically on protected pages
    if (shouldProtectPage()) {
        setInterval(() => {
            verifyUserUID();
        }, 2000); // Check every 2 seconds
    }
    
    // Store unsubscribe function for cleanup if needed
    window.firebaseAuthUnsubscribe = unsubscribe;
}

/**
 * Redirect to auth.html
 * Force redirect for protected pages
 */
function redirectToAuth() {
    const currentPage = getCurrentPage();
    // Always redirect if not on auth.html or index.html
    if (currentPage !== 'auth.html' && currentPage !== 'index.html') {
        window.location.href = 'auth.html';
    }
}

/**
 * Verify user UID exists - additional security check
 */
function verifyUserUID() {
    // Check if we're on a protected page
    if (!shouldProtectPage()) {
        return true; // Don't check on public pages
    }
    
    // If auth check is complete but no UID, redirect
    if (authCheckComplete && !window.currentUserUID) {
        window.location.href = 'auth.html';
        return false;
    }
    
    return true;
}

/**
 * Get current user UID
 * Returns null if not authenticated
 * This function will wait for auth check to complete before returning
 */
function getCurrentUserUID() {
    // If auth check is complete, return UID immediately
    if (authCheckComplete) {
        return window.currentUserUID || null;
    }
    
    // If auth is checked but user is null, return null
    if (authChecked && !currentAuthUser) {
        return null;
    }
    
    // If auth check not complete yet, wait a bit and check again
    // But this should not happen if called after page load
    return window.currentUserUID || null;
}

/**
 * Wait for auth check to complete
 * Returns promise that resolves when auth check is done
 */
function waitForAuthCheck() {
    return new Promise((resolve) => {
        if (authCheckComplete) {
            resolve(currentAuthUser);
            return;
        }
        
        const checkInterval = setInterval(() => {
            if (authCheckComplete) {
                clearInterval(checkInterval);
                resolve(currentAuthUser);
            }
        }, 50);
        
        // Timeout after 5 seconds
        setTimeout(() => {
            clearInterval(checkInterval);
            resolve(null);
        }, 5000);
    });
}

/**
 * Get current user info
 * Returns null if not authenticated
 */
function getCurrentUser() {
    if (!window.currentUserUID) {
        return null;
    }
    
    return {
        uid: window.currentUserUID,
        email: window.currentUserEmail,
        displayName: window.currentUserDisplayName,
        photoURL: window.currentUserPhotoURL
    };
}

/**
 * Logout function
 * Signs out user and redirects to auth.html
 */
async function logout() {
    if (!auth) {
        console.error('Auth not initialized');
        return;
    }

    try {
        const { signOut } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
        await signOut(auth);
        
        // Clear user data
        window.currentUserUID = null;
        window.currentUserEmail = null;
        window.currentUserDisplayName = null;
        window.currentUserPhotoURL = null;
        
        // Redirect to auth.html
        window.location.href = 'auth.html';
    } catch (error) {
        console.error('Error signing out:', error);
    }
}

// Export functions to window object
window.getCurrentUserUID = getCurrentUserUID;
window.getCurrentUser = getCurrentUser;
window.logout = logout;
window.waitForAuthCheck = waitForAuthCheck;
window.authCheckComplete = () => authCheckComplete;
window.verifyUserUID = verifyUserUID;

// Initialize auth guard when script loads
// This will only run on pages that include this script
initAuthGuard();

