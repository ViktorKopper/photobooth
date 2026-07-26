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

// This config is not a credential, and is not meant to be hidden.
//
// A Firebase web API key identifies the project; it grants nothing on its own.
// Every Firebase web app ships it in the bundle, where anyone can read it, and
// Google documents it as public. What actually protects the photos is
// firestore.rules and storage.rules — they are the security boundary, and they
// are the thing worth reviewing.
//
// GitHub's secret scanner flags it anyway, because it cannot tell a Firebase
// key from a billable Google Cloud one. Moving it to an environment variable
// would silence the scanner and change nothing: Vite inlines env values into
// the bundle at build time, so it would still be sitting in the shipped
// JavaScript. That is theatre, not security.
//
// The one real risk is unrelated to this app: an *unrestricted* Google API key
// can be pointed at other Google Cloud APIs and run up a bill. The fix for that
// lives in the Google Cloud console, not in this file —
// APIs & Services -> Credentials -> this key -> Application restrictions ->
// HTTP referrers, limited to the GitHub Pages domain.
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
