// Composition root.
//
// The only module that knows every part, and the only one allowed to: it fills
// in the two indirections the rest of the app is built on — which function
// draws the room (store.js) and what the screen names mean (navigation.js) —
// and then starts everything.
//
// Nothing runs on import. src/main.js calls startApp(), which keeps every
// screen reachable from a test without a service worker being registered or an
// anonymous sign-in being started.

import { bootstrap } from './features/session.js';
import { defineRoutes } from './navigation.js';
import { renderLanding, renderJoinByCode, renderLocationGate, renderRoleGate } from './screens/entry.js';
import { renderRoomShell, updateRoomView } from './screens/booth.js';
import { setRenderer, state } from './store.js';
import { mountThemeToggle } from './ui/theme.js';
import { getRoomIdFromUrl } from './utils.js';

export function startApp() {
  // Feature modules ask for a redraw through requestRender() rather than
  // importing the room screen, and reach a screen through go.landing() rather
  // than importing it. Both are wired here, once — which is what keeps the
  // dependency graph acyclic.
  setRenderer(updateRoomView);
  defineRoutes({
    landing: renderLanding,
    roleGate: renderRoleGate,
    joinByCode: renderJoinByCode,
    locationGate: renderLocationGate,
    roomShell: renderRoomShell
  });

  // Read at boot rather than at module load: importing this file must not
  // depend on a URL being there.
  state.roomId = getRoomIdFromUrl();

  registerServiceWorker();
  mountThemeToggle();
  bootstrap();
}

// Registers the PWA service worker so the booth can be installed to a phone's
// home screen and opened like a native app. Never blocks or affects the actual
// app if it fails — it's a pure enhancement.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

// Re-exported so the screens stay reachable under their original names.
export { renderLanding, renderJoinByCode, renderLocationGate, renderRoleGate } from './screens/entry.js';
export { renderRoomShell } from './screens/booth.js';
