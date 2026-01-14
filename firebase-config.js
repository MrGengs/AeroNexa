/**
 * Firebase Configuration and Authentication Functions
 * This file contains all Firebase initialization and authentication logic
 */

// Import Firebase modules
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged,
    updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { 
    getDatabase, 
    ref, 
    get, 
    set,
    update,
    onValue, 
    off 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAUA940to-ZxISjlTIkbqfWSVC0dl-jqzY",
    authDomain: "aeronexa-id.firebaseapp.com",
    databaseURL: "https://aeronexa-id-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "aeronexa-id",
    storageBucket: "aeronexa-id.firebasestorage.app",
    messagingSenderId: "12468975398",
    appId: "1:12468975398:web:f69d321fc3345715a8b3e7"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// Set Google provider scopes (optional, for additional permissions)
googleProvider.addScope('profile');
googleProvider.addScope('email');

/**
 * Save user data to Firestore when they first register/login
 * This creates a user document in the 'users' collection
 * @param {Object} user - Firebase Auth user object
 * @param {String} displayName - User's display name (optional)
 * @param {String} provider - Authentication provider ('email' or 'google')
 */
async function saveUserToFirestore(user, displayName = null, provider = 'email') {
    try {
        if (!user || !user.uid) {
            console.error('Invalid user object');
            throw new Error('Invalid user object');
        }

        const userRef = doc(db, 'users', user.uid);
        const userDoc = await getDoc(userRef);

        // Check if user document already exists
        if (!userDoc.exists()) {
            // Create new user document for first-time users
            const userData = {
                uid: user.uid,
                email: user.email || '',
                displayName: displayName || user.displayName || user.email?.split('@')[0] || 'User',
                photoURL: user.photoURL || null,
                provider: provider,
                createdAt: serverTimestamp(),
                lastLoginAt: serverTimestamp(),
                isActive: true,
                // Additional user metadata
                preferences: {
                    notifications: true,
                    darkMode: false,
                    language: 'en'
                }
            };

            await setDoc(userRef, userData);
            return true;
        } else {
            // Update last login time for existing users
            const updateData = {
                lastLoginAt: serverTimestamp(),
                isActive: true
            };
            
            // Update displayName if it changed (for Google users)
            if (user.displayName && user.displayName !== userDoc.data().displayName) {
                updateData.displayName = user.displayName;
            }
            
            // Update photoURL if it changed (for Google users)
            if (user.photoURL && user.photoURL !== userDoc.data().photoURL) {
                updateData.photoURL = user.photoURL;
            }

            await setDoc(userRef, updateData, { merge: true });
            return true;
        }
    } catch (error) {
        console.error('Error saving user to Firestore:', error);
        console.error('Error details:', {
            code: error.code,
            message: error.message
        });
        throw error;
    }
}

/**
 * Create user with email and password
 * Also saves user data to Firestore
 * @param {String} email - User email
 * @param {String} password - User password
 * @param {String} displayName - User display name
 */
async function createUser(email, password, displayName) {
    try {
        // Create user in Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update display name if provided
        if (displayName) {
            await updateProfile(user, {
                displayName: displayName
            });
        }

        // Save user data to Firestore
        await saveUserToFirestore(user, displayName, 'email');

        return userCredential;
    } catch (error) {
        console.error('Error creating user:', error);
        throw error;
    }
}

/**
 * Sign in user with email and password
 * Updates last login time in Firestore
 * @param {String} email - User email
 * @param {String} password - User password
 */
async function signIn(email, password) {
    try {
        // Sign in user
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update last login time in Firestore
        await saveUserToFirestore(user, null, 'email');

        return userCredential;
    } catch (error) {
        console.error('Error signing in:', error);
        throw error;
    }
}

/**
 * Sign in with Google
 * Also saves user data to Firestore
 */
async function signInWithGoogle() {
    try {
        // Sign in with Google popup
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;

        // Save user data to Firestore - CRITICAL: Wait for completion
        try {
            await saveUserToFirestore(user, user.displayName, 'google');
        } catch (firestoreError) {
            console.error('Error saving to Firestore:', firestoreError);
            // Still return result even if Firestore save fails
            // User is authenticated, Firestore can be saved later
        }

        return result;
    } catch (error) {
        console.error('Error signing in with Google:', error);
        console.error('Error code:', error.code);
        console.error('Error message:', error.message);
        throw error;
    }
}

/**
 * Get user data from Firestore
 * Returns user document data from Firestore, or null if not found
 * @param {String} userId - User UID
 */
async function getUserFromFirestore(userId) {
    try {
        if (!userId) {
            return null;
        }

        const userRef = doc(db, 'users', userId);
        const userDoc = await getDoc(userRef);

        if (userDoc.exists()) {
            return userDoc.data();
        } else {
            return null;
        }
    } catch (error) {
        console.error('Error getting user from Firestore:', error);
        return null;
    }
}

// Export Firebase instances and functions to window object for global access
window.firebaseAuth = auth;
window.firebaseDb = db;
window.firebaseApp = app;
window.firebaseCreateUser = createUser;
window.firebaseSignIn = signIn;
window.firebaseSignInWithGoogle = signInWithGoogle;
window.firebaseOnAuthStateChanged = onAuthStateChanged;
window.firebaseSaveUserToFirestore = saveUserToFirestore;
window.firebaseGetUserFromFirestore = getUserFromFirestore;

// Export Firestore functions for floor plans
window.firestoreCollection = collection;
window.firestoreDoc = doc;
window.firestoreSetDoc = setDoc;
window.firestoreGetDoc = getDoc;
window.firestoreGetDocs = getDocs;
window.firestoreAddDoc = addDoc;
window.firestoreUpdateDoc = updateDoc;
window.firestoreDeleteDoc = deleteDoc;
window.firestoreQuery = query;
window.firestoreWhere = where;
window.firestoreOrderBy = orderBy;
window.firestoreServerTimestamp = serverTimestamp;

// Export Realtime Database functions
window.rtdb = rtdb;
window.rtdbRef = ref;
window.rtdbGet = get;
window.rtdbSet = set;
window.rtdbUpdate = update;
window.rtdbOnValue = onValue;
window.rtdbOff = off;

