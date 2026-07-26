// The application's mutable state, and the seam that lets it be split up.
//
// app.js grew to 1900 lines around a single `state` object referenced 261
// times, with every feature calling `updateRoomView()` directly. That made
// the file a mutually recursive graph rather than a layered one: pulling any
// feature out produced an import cycle, because the feature needed the
// renderer and the renderer needed the feature.
//
// `requestRender()` breaks that. A feature module asks for a redraw without
// knowing who draws; app.js registers the renderer once at startup. The
// dependency now points one way — feature -> store -> nobody — so features
// can move out one at a time.

import { sanitizeLocation } from './utils.js';

export const state = {
  user: null,
  roomId: '',
  role: localStorage.getItem('photobooth-role') || '',
  room: null,
  photos: [],
  pendingCapture: null,
  editingCaption: null,
  replacingIndex: null,
  facingMode: 'user',
  activeFilter: 'none',
  timerSeconds: 3,
  onionSkinOn: false,
  customMessage: localStorage.getItem('photobooth-message') || 'Our little photobooth memory',
  myLocation: readStoredLocation(),
  // The live city picker, so a re-render can tear the previous one down.
  cityPicker: null,
  collageBlob: null,
  collagePreviewUrl: null,
  collageLayout: 'grid',
  collageScale: '1',
  collageTheme: 'rose',
  collageExport: 'original',
  unsubscribeRoom: null,
  unsubscribePhotos: null,
  cameraStarted: false,
  syncScheduledFor: null,
  syncTimers: [],
  clockTimer: null,
  shootingTimer: null,
  bothCompleteSeen: null,
  // One-shot flags for intro flourishes, so the panels that re-render on a
  // timer don't replay their entrance every tick.
  distanceIntroDone: false,
  dayCountIntroDone: false
};

/* -------------------------------------------------------- the render seam */

let renderer = null;

// Called once, by whoever owns the room screen.
export function setRenderer(fn) {
  renderer = fn;
}

// A no-op before a room screen is up, which is deliberate: a late timer or a
// resolved fetch firing after the user has left should quietly do nothing
// rather than throw into a screen that is no longer there.
export function requestRender() {
  renderer?.();
}

/* ------------------------------------------------------------- persistence */

export function readStoredLocation() {
  try {
    return sanitizeLocation(JSON.parse(localStorage.getItem('photobooth-location') || 'null'));
  } catch {
    return null;
  }
}

export function storeMyLocation(location) {
  state.myLocation = sanitizeLocation(location);
  if (state.myLocation) {
    localStorage.setItem('photobooth-location', JSON.stringify(state.myLocation));
  } else {
    localStorage.removeItem('photobooth-location');
  }
}

export function storeRole(role) {
  state.role = role;
  localStorage.setItem('photobooth-role', role);
}

export function storeCustomMessage(message) {
  state.customMessage = message;
  localStorage.setItem('photobooth-message', message);
}
