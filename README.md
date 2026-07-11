# Viktor & Jericka Photobooth

Private long-distance couple photobooth app.

Viktor takes 3 webcam photos. Jericka takes 3 webcam photos. The app stores both sets in one Firebase room and generates a romantic PNG photobooth collage.

## Architecture

GitHub Pages alone is not enough for the full app because it only hosts static frontend files. The shared room, realtime progress, image upload, and cross-device state need a backend layer.

This project uses:

- GitHub Pages for frontend hosting
- Firebase Authentication for anonymous sign-in
- Cloud Firestore for realtime room state
- Firebase Storage for photo files
- HTML Canvas for generating the final collage
- Vite + vanilla JavaScript for a simple frontend build

No custom Node/PHP backend is required for v1.

## Project structure

```text
/index.html
/package.json
/vite.config.js
/firebase.json
/firestore.rules
/storage.rules
/.github/workflows/deploy.yml
/src/firebase.js
/src/main.js
/src/room.js
/src/camera.js
/src/collage.js
/src/utils.js
/src/styles.css
```

## Firebase setup

### 1. Create Firebase project

Go to Firebase Console and create a new project.

Suggested name:

```text
viktor-jericka-photobooth
```

Google Analytics is optional for this app.

### 2. Add a web app

In Firebase Console:

1. Project Overview
2. Add app
3. Web app
4. Register app
5. Copy the Firebase config object

Open:

```text
src/firebase.js
```

Replace this placeholder:

```js
const firebaseConfig = {
  apiKey: 'PASTE_YOUR_API_KEY_HERE',
  authDomain: 'PASTE_YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_YOUR_PROJECT_ID',
  storageBucket: 'PASTE_YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'PASTE_YOUR_MESSAGING_SENDER_ID',
  appId: 'PASTE_YOUR_APP_ID'
};
```

Firebase config is not a password. It will be visible in the browser. Security must be handled through Firestore and Storage rules.

### 3. Enable Anonymous Authentication

Firebase Console:

1. Authentication
2. Sign-in method
3. Anonymous
4. Enable
5. Save

### 4. Create Firestore database

Firebase Console:

1. Firestore Database
2. Create database
3. Start in production mode
4. Choose a nearby region
5. Create

Then paste the contents of `firestore.rules` into Firestore Rules and publish them.

### 5. Create Firebase Storage bucket

Firebase Console:

1. Storage
2. Get started
3. Start in production mode
4. Choose location
5. Create

Then paste the contents of `storage.rules` into Storage Rules and publish them.

Important: test the rules in Firebase's rules simulator before using this for anything sensitive.

## Local development

Install dependencies:

```bash
npm install
```

Run locally with HTTPS:

```bash
npm run dev
```

Open the Vite URL shown in terminal.

Camera APIs require HTTPS or localhost. This project uses Vite's basic SSL plugin for easier camera testing.

## Test the app

1. Open the app locally.
2. Click `Create new booth`.
3. Choose `Viktor`.
4. Copy the share link.
5. Open the link in another browser, phone, or private window.
6. Choose `Jericka`.
7. Take 3 photos on each side.
8. Generate and download the collage.

## Deploy to GitHub Pages

### 1. Create a GitHub repository

Example repo name:

```text
viktor-jericka-photobooth
```

Push this project to the repository.

### 2. Enable GitHub Pages

In GitHub:

1. Repository Settings
2. Pages
3. Build and deployment
4. Source: GitHub Actions

### 3. Push to main

The included workflow runs automatically on push to `main`:

```text
.github/workflows/deploy.yml
```

It will:

1. Install dependencies
2. Build the Vite app
3. Upload `dist`
4. Deploy to GitHub Pages

## Firebase rules deploy through CLI

Optional, if you prefer Firebase CLI instead of copy-pasting rules.

Install Firebase CLI:

```bash
npm install -g firebase-tools
```

Login:

```bash
firebase login
```

Connect the project:

```bash
firebase use --add
```

Deploy only rules:

```bash
npm run deploy:rules
```

## Privacy and security notes

This is private-by-obscurity plus Firebase rules, not enterprise-grade access control.

What is protected:

- users must be anonymously authenticated
- room IDs are random and hard to guess
- Firestore listing of all rooms is blocked
- photos are stored under a room-specific path
- each participant can upload only under their own role path
- only room participants can read room photos

Important limitation:

Anyone with the room link may attempt to join an unclaimed role. For a private couple app this is usually fine. For stronger security, add a per-room PIN or invite token generated through Cloud Functions.

## Recommended v2 improvements

- add a room PIN
- add Cloud Function cleanup for old rooms
- add Firestore TTL policy for expired rooms
- upload compressed images with dimensions metadata
- add a gallery of previous collages
- add passwordless email auth instead of anonymous auth
- add App Check for abuse reduction

## Known practical notes

- iPhone camera requires HTTPS.
- In-app browsers can be inconsistent with camera permissions. Safari or Chrome is safer.
- Browser permissions can block camera access until the user manually enables it.
- If canvas export fails because of image CORS, keep using the existing Storage SDK blob loading approach in `src/collage.js`; do not replace it with direct remote image URLs.
