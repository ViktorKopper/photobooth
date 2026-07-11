import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// 1) Create a Firebase web app in Firebase Console.
// 2) Replace this object with your own Firebase config.
// This config is not a secret. Security must come from Firestore and Storage rules.
const firebaseConfig = {
  apiKey: "AIzaSyDLYOzWrXNywiRhxaWTEpZGF2S-d1WSPIk",
  authDomain: "photobooth-ccd36.firebaseapp.com",
  projectId: "photobooth-ccd36",
  storageBucket: "photobooth-ccd36.firebasestorage.app",
  messagingSenderId: "212860708411",
  appId: "1:212860708411:web:a5d0fb93103dddf36d5e1e",
  measurementId: "G-D8MQCQZKYY"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export async function ensureAnonymousAuth() {
  await setPersistence(auth, browserLocalPersistence);

  if (auth.currentUser) {
    return auth.currentUser;
  }

  return new Promise((resolve, reject) => {
    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        try {
          if (user) {
            unsubscribe();
            resolve(user);
            return;
          }

          const credential = await signInAnonymously(auth);
          unsubscribe();
          resolve(credential.user);
        } catch (error) {
          unsubscribe();
          reject(error);
        }
      },
      reject
    );
  });
}
