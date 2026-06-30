// Real Firebase references — uses @firebase/* to bypass Vite's rxfs.js alias
// CRITICAL: Uses the DEFAULT Firebase app (no name) so Auth state from the main app is shared
import { getApp, initializeApp } from "firebase/app";
import { initializeFirestore, getFirestore, memoryLocalCache } from "@firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "@firebase/functions";
import { getDatabase } from "@firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDaKgWXJiz_NTYo4NBCXhVZ7qIo9SwkooY",
  authDomain: "cashshams.firebaseapp.com",
  projectId: "cashshams",
  storageBucket: "cashshams.firebasestorage.app",
  messagingSenderId: "565173718396",
  appId: "1:565173718396:web:c23d370ab7c629f86c28f9"
};

// Try to get the default app (already initialized by firebase.js), or create it
let app;
try {
  app = getApp();
} catch {
  app = initializeApp(firebaseConfig);
}

// Use getFirestore if already initialized, otherwise initialize
let db;
try {
  db = getFirestore(app);
} catch {
  db = initializeFirestore(app, { localCache: memoryLocalCache() });
}

const auth = getAuth(app);
const functions = getFunctions(app);
const rtdb = getDatabase(app);

export { app, db, auth, functions, rtdb };
