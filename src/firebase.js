// Only the App and Auth SDKs are imported here, and deliberately so.
// Firestore alone is ~450 kB of the bundle and isn't needed until someone
// actually enters a booth — it lives in room.js instead, which main.js
// imports dynamically. Adding a `firebase/firestore` import back into this
// file would pull all of it into the initial download again.
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';

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

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

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
