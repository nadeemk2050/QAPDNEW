// QAPD Firebase Configuration — Same project as ACCPRO
import { initializeApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyDaKgWXJiz_NTYo4NBCXhVZ7qIo9SwkooY",
  authDomain: "cashshams.firebaseapp.com",
  projectId: "cashshams",
  storageBucket: "cashshams.firebasestorage.app",
  messagingSenderId: "565173718396",
  appId: "1:565173718396:web:c23d370ab7c629f86c28f9"
};

const app = initializeApp(firebaseConfig);

const isElectronRuntime = typeof window !== 'undefined' && !!window.process?.versions?.electron;

const db = initializeFirestore(app, {
  localCache: isElectronRuntime
    ? memoryLocalCache()
    : persistentLocalCache({ tabManager: persistentMultipleTabManager() })
});
const auth = getAuth(app);
const functions = getFunctions(app);
const rtdb = getDatabase(app);
const storage = getStorage(app);

// Real Firebase refs for operations that need to bypass the local shim
import { app as realApp, db as cloudDb, auth as cloudAuth, functions as cloudFunctions, rtdb as cloudRtdb } from './realFirebase.js';

export { app, db, auth, functions, rtdb, storage, cloudDb, cloudAuth, cloudFunctions, cloudRtdb };
