/**
 * Configuration File Template
 * 
 * INSTRUKSI SETUP:
 * 1. Copy file ini dan rename menjadi 'config.js'
 * 2. Isi dengan API keys yang sebenarnya
 * 3. File config.js akan otomatis diabaikan oleh Git (tidak akan ter-upload ke GitHub)
 * 
 * PERINGATAN: JANGAN commit file config.js ke repository!
 */

// Firebase Configuration
// Dapatkan dari Firebase Console > Project Settings > General > Your apps
const firebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY_HERE",
    authDomain: "YOUR_FIREBASE_AUTH_DOMAIN_HERE",
    databaseURL: "YOUR_FIREBASE_DATABASE_URL_HERE",
    projectId: "YOUR_FIREBASE_PROJECT_ID_HERE",
    storageBucket: "YOUR_FIREBASE_STORAGE_BUCKET_HERE",
    messagingSenderId: "YOUR_FIREBASE_MESSAGING_SENDER_ID_HERE",
    appId: "YOUR_FIREBASE_APP_ID_HERE"
};

// Gemini API Configuration
// Dapatkan dari Google AI Studio: https://aistudio.google.com/apikey
const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta";

// Export configuration
if (typeof window !== 'undefined') {
    window.firebaseConfig = firebaseConfig;
    window.GEMINI_API_KEY = GEMINI_API_KEY;
    window.GEMINI_API_URL = GEMINI_API_URL;
}

// For Node.js environments (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        firebaseConfig,
        GEMINI_API_KEY,
        GEMINI_API_URL
    };
}
