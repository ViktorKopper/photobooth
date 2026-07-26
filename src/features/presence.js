// "She's here."
//
// Before this, the only sign of the other person was a photo appearing, or the
// two seconds they spent mid-countdown. The rest of the time a booth with
// someone sitting in it looked exactly like an empty one — which is a strange
// thing for an app whose whole purpose is being together while apart.
//
// Built on `lastActiveAt`, which joining already stamped and the rules already
// validate, rather than a new field. Nothing is ever cleared: the stamp is
// simply allowed to go stale, so a closed laptop can't strand the indicator on.

import { PRESENCE_PING_MS, PRESENCE_WINDOW_MS } from '../config.js';
import { roomApi } from '../roomApi.js';
import { requestRender, state } from '../store.js';

export function isHereNow(stamp, now = Date.now()) {
  const millis = stamp?.toMillis?.();
  if (!Number.isFinite(millis)) return false;

  const age = now - millis;
  // A clock running slightly ahead of the server reads as a stamp from the
  // future, which would otherwise never expire — the same guard isShootingNow
  // needs, for the same reason.
  return age >= -PRESENCE_WINDOW_MS && age < PRESENCE_WINDOW_MS;
}

let timer = null;
let onVisibility = null;

async function ping() {
  if (!state.roomId || !state.user || !state.role) return;

  const { touchPresence } = await roomApi();
  await touchPresence({
    roomId: state.roomId,
    uid: state.user.uid,
    role: state.role,
    room: state.room
  });
}

export function startPresenceHeartbeat() {
  stopPresenceHeartbeat();

  ping();
  timer = window.setInterval(ping, PRESENCE_PING_MS);

  // A backgrounded tab has its timers throttled hard, so coming back to the
  // booth would otherwise leave you invisible for up to a full interval. This
  // also means the stamp is refreshed at exactly the moment someone starts
  // paying attention again.
  onVisibility = () => {
    if (document.visibilityState === 'visible') ping();
  };
  document.addEventListener('visibilitychange', onVisibility);
}

export function stopPresenceHeartbeat() {
  if (timer) window.clearInterval(timer);
  timer = null;

  if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
  onVisibility = null;
}

// The indicator ages on a clock rather than on a write, so nothing would bring
// the view back once the stamp goes stale. One scheduled re-check does it.
let expiryTimer = null;

export function schedulePresenceExpiry(here) {
  window.clearTimeout(expiryTimer);
  if (here) expiryTimer = window.setTimeout(requestRender, PRESENCE_WINDOW_MS / 3);
}

export function stopPresenceExpiry() {
  window.clearTimeout(expiryTimer);
  expiryTimer = null;
}
