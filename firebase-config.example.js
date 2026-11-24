// Copy this file to firebase-config.js and fill in the values from the
// Firebase console (Project settings > General > Your apps > SDK setup).
// firebase-config.js is gitignored — never commit it.

export const firebaseConfig = {
  apiKey: "PASTE_API_KEY_HERE",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID",
};

// Cloud model used as the fallback when the on-device model is not ready.
// Current default per Firebase AI Logic docs; override if it changes.
export const cloudModelId = "gemini-3.5-flash-lite";
