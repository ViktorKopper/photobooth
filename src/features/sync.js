// The synced "shoot together" countdown.
//
// Both devices anchor to one server-issued timestamp rather than trusting
// either phone's clock, then schedule against that fixed instant — so the two
// shutters fire together even a continent apart.

import { SHOOTING_WINDOW_MS, SYNC_LEAD_MS } from '../config.js';
import { roomApi } from '../roomApi.js';
import { state } from '../store.js';
import { showError } from '../ui/toast.js';
import { otherRole, ROLES } from '../utils.js';
import { finishCaptureAfterCountdown } from './capture.js';
import { notifySyncRequested } from './notifications.js';

// A shooting stamp is never cleared — it's simply allowed to go stale, so a
// browser closing mid-countdown can't strand the indicator.
export function isShootingNow(stamp) {
  const millis = stamp?.toMillis?.();
  if (!Number.isFinite(millis)) return false;
  const age = Date.now() - millis;
  // A clock skewed slightly ahead of the server would otherwise read as a
  // stamp from the future and never expire.
  return age >= -5000 && age < SHOOTING_WINDOW_MS;
}

export async function requestSyncFlow() {
  const myCount = state.room?.participants?.[state.role]?.photoCount || 0;
  if (myCount >= 3) return showError('You already have all 3 photos confirmed.');

  const partnerRole = otherRole(state.role);
  if (!state.room?.participants?.[partnerRole]?.joined) {
    return showError(`${ROLES[partnerRole].name} hasn't joined this room yet.`);
  }

  try {
    const { requestSyncCountdown } = await roomApi();
    await requestSyncCountdown({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      seconds: state.timerSeconds,
      room: state.room
    });
  } catch (error) {
    showError(error.message, 'Could not start the synced countdown.');
  }
}

// Fires whenever the room doc changes. Firestore's serverTimestamp() reads as
// null locally until the write is acknowledged by the server — this naturally
// skips those interim snapshots and only acts once a real, server-resolved
// timestamp exists, so both devices schedule against the same instant.
export function handleSyncCountdownChange() {
  const sync = state.room?.syncCountdown;
  if (!sync?.requestedAt?.toMillis) return;

  const requestedAtMs = sync.requestedAt.toMillis();
  if (state.syncScheduledFor === requestedAtMs) return;
  state.syncScheduledFor = requestedAtMs;

  if (sync.requestedBy !== state.role) {
    // Requesting permission needs a real user gesture, but showing a
    // notification once permission is already granted does not — which is
    // just as well, since this runs straight from a snapshot listener.
    notifySyncRequested(ROLES[otherRole(state.role)].name);
  }

  // Older rooms have no `seconds` on the request; fall back to the classic
  // 3-2-1 rather than counting down from undefined.
  const seconds = Number.isFinite(sync.seconds) ? sync.seconds : 3;

  // The visible countdown has to fit inside the lead time, plus a margin for
  // the snapshot to reach both devices before the numbers start.
  scheduleSyncCountdown(requestedAtMs + seconds * 1000 + SYNC_LEAD_MS, seconds);
}

// Each step gets its own setTimeout computing its own delay from Date.now()
// against the fixed target — rather than a chained countdown, so there is no
// compounding drift regardless of when this function itself happens to run.
export function scheduleSyncCountdown(targetAtMs, seconds = 3) {
  clearSyncTimers();

  const countdown = document.querySelector('#countdown');
  const cameraActions = document.querySelector('#cameraActions');

  const showNumber = (label) => {
    if (!countdown) return;
    countdown.classList.remove('hidden');
    cameraActions?.classList.add('disabled');
    countdown.textContent = String(label);
    countdown.classList.remove('pulse');
    void countdown.offsetWidth;
    countdown.classList.add('pulse');
    hideSyncStatus();
  };

  const scheduleAt = (msBeforeTarget, fn) => {
    const delay = targetAtMs - msBeforeTarget - Date.now();
    state.syncTimers.push(window.setTimeout(fn, Math.max(0, delay)));
  };

  const countdownStartsAt = targetAtMs - seconds * 1000;

  const tickStatus = () => {
    const remaining = countdownStartsAt - Date.now();
    if (remaining > 0) {
      showSyncStatus(`Get ready — countdown starts in ${Math.ceil(remaining / 1000)}s...`);
      state.syncTimers.push(window.setTimeout(tickStatus, 500));
    }
  };
  tickStatus();

  for (let number = seconds; number >= 1; number -= 1) {
    scheduleAt(number * 1000, () => showNumber(number));
  }

  scheduleAt(0, () =>
    finishCaptureAfterCountdown().then(async () => {
      hideSyncStatus();
      // Whoever requested the sync clears it once it fires, returning the room
      // to a clean state for the next one. Harmless no-op if the other side
      // (or a stale timer) races to clear it too.
      if (state.room?.syncCountdown?.requestedBy === state.role) {
        (await roomApi()).clearSyncCountdown(state.roomId);
      }
    })
  );
}

export function clearSyncTimers() {
  state.syncTimers.forEach((handle) => window.clearTimeout(handle));
  state.syncTimers = [];
}

function showSyncStatus(text) {
  const element = document.querySelector('#syncStatus');
  if (!element) return;
  element.textContent = text;
  element.classList.remove('hidden');
}

function hideSyncStatus() {
  document.querySelector('#syncStatus')?.classList.add('hidden');
}
