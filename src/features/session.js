// The life of a booth: signing in, entering, subscribing, and leaving.
//
// Renders nothing itself. Where a flow has to send the person to a screen it
// goes through navigation.js, which is what keeps the screens free to import
// these flows without the two importing each other.

import { clearCollageImageCache } from '../collage.js';
import { ANNIVERSARY_DATE } from '../config.js';
import { ensureAnonymousAuth } from '../firebase.js';
import { go } from '../navigation.js';
import { roomApi } from '../roomApi.js';
import { expiredRoomIds, forgetAllRooms, forgetRoom, listRooms, rememberRoom } from '../roomHistory.js';
import { requestRender, state } from '../store.js';
import { stopCamera } from '../camera.js';
import { clearBursts } from '../ui/burst.js';
import { renderFatalError, renderLoading } from '../screens/system.js';
import { showError, showToast } from '../ui/toast.js';
import { isUsableLocation, sanitizeCollageMessage, sanitizeLocation } from '../utils.js';
import { startCurrentCamera } from './capture.js';
import { handlePokeChange, resetPokeHistory } from './poke.js';
import { resetPoseCardHistory } from './poseCard.js';
import { startPresenceHeartbeat, stopPresenceExpiry, stopPresenceHeartbeat } from './presence.js';
import { resetReactionHistory } from './reactionBurst.js';
import { clearSyncTimers, handleSyncCountdownChange } from './sync.js';
import { startClockTicker, stopClockTicker } from './tickers.js';
import { weather } from './weather.js';

export async function bootstrap() {
  renderLoading('Preparing your private photobooth...');

  try {
    state.user = await ensureAnonymousAuth();

    // Fire-and-forget: expired booths get swept in the background while the
    // person carries on into their room.
    pruneExpiredRooms();

    if (state.roomId) go.roleGate('join');
    else go.landing();
  } catch (error) {
    renderFatalError(error);
  }
}

async function pruneExpiredRooms() {
  const stale = expiredRoomIds({ exclude: state.roomId });

  for (const roomId of stale) {
    try {
      await (await roomApi()).deleteRoomSession(roomId);
    } catch {
      // Already gone, or the other side deleted it first — either way the
      // local record should go too.
    }
    forgetRoom(roomId);
  }
}

export async function enterBooth(isCreate) {
  renderLoading(isCreate ? 'Creating your booth...' : 'Joining your booth...');

  try {
    const { createRoom, joinRoom } = await roomApi();

    if (isCreate) {
      state.roomId = await createRoom({
        uid: state.user.uid,
        role: state.role,
        customMessage: sanitizeCollageMessage(state.customMessage),
        anniversaryDate: ANNIVERSARY_DATE,
        location: sanitizeLocation(state.myLocation)
      });
    } else {
      await joinRoom({
        roomId: state.roomId,
        uid: state.user.uid,
        role: state.role,
        location: sanitizeLocation(state.myLocation)
      });
    }

    window.history.replaceState({}, '', `?room=${state.roomId}`);
    rememberRoom(state.roomId);
    await enterRoom();
  } catch (error) {
    renderFatalError(error);
  }
}

async function enterRoom() {
  stopSubscriptions();
  go.roomShell();

  const { watchRoom, watchPhotos } = await roomApi();

  state.unsubscribeRoom = watchRoom(
    state.roomId,
    (room) => {
      state.room = room;
      if (!room) {
        renderFatalError(new Error('This booth was deleted or no longer exists.'));
        return;
      }
      handleSyncCountdownChange();
      handlePokeChange();
      requestRender();
    },
    renderFatalError
  );

  state.unsubscribePhotos = watchPhotos(
    state.roomId,
    (photos) => {
      state.photos = photos;
      requestRender();
    },
    renderFatalError
  );

  startClockTicker();
  startPresenceHeartbeat();
  syncMyLocationToRoom();

  await startCurrentCamera();
}

// Backfills the room with this browser's stored city if the room doesn't have
// one for us yet — covers rejoining an older room created before a city was
// ever picked.
async function syncMyLocationToRoom() {
  const mine = sanitizeLocation(state.myLocation);
  if (!mine) return;
  if (isUsableLocation(state.room?.participants?.[state.role]?.location)) return;

  try {
    const { updateLocation } = await roomApi();
    await updateLocation({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      location: mine,
      room: state.room
    });
  } catch (error) {
    console.error('Could not save location', error);
  }
}

export function stopSubscriptions() {
  if (state.unsubscribeRoom) state.unsubscribeRoom();
  if (state.unsubscribePhotos) state.unsubscribePhotos();
  state.unsubscribeRoom = null;
  state.unsubscribePhotos = null;

  clearSyncTimers();
  window.clearTimeout(state.shootingTimer);
  stopClockTicker();
  stopPresenceHeartbeat();
  stopPresenceExpiry();
  clearBursts();

  // These three track "what had I already seen" across snapshots. Carried into
  // the next booth they would replay its history as if it were live.
  resetPokeHistory();
  resetReactionHistory();
  resetPoseCardHistory();
  // Also clears its cache and signature, so re-entering a room fetches fresh
  // conditions rather than matching a stale key and skipping the lookup.
  weather.stop();

  state.syncScheduledFor = null;
  state.bothCompleteSeen = null;
  state.distanceIntroDone = false;
  state.dayCountIntroDone = false;
  // Decoded photos are only useful for the booth they belong to.
  clearCollageImageCache();
}

// Everything that has to happen when a booth stops being the current one,
// however it ended.
function clearCurrentBooth() {
  window.history.replaceState({}, '', window.location.pathname);
  state.roomId = '';
  state.room = null;
  state.photos = [];
  stopSubscriptions();
  stopCamera();
}

export function leaveBooth() {
  clearCurrentBooth();
  go.landing();
}

export async function deleteSessionFlow() {
  if (!confirm('Delete this booth room and all uploaded photos? This cannot be undone.')) return;

  try {
    await (await roomApi()).deleteRoomSession(state.roomId);
    forgetRoom(state.roomId);
    clearCurrentBooth();
    go.landing();
  } catch (error) {
    showError(error.message, 'Could not delete the booth.');
  }
}

export async function resetAllBoothsFlow() {
  const known = listRooms();
  if (!known.length) return showError('There are no booths on this device to delete.');

  const confirmed = confirm(
    `Delete all ${known.length} booth${known.length === 1 ? '' : 's'} from this device, including every uploaded photo? This cannot be undone.`
  );
  if (!confirmed) return;

  const button = document.querySelector('#resetAllBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Deleting...';
  }

  const { deleteRoomSession } = await roomApi();

  let failed = 0;
  for (const entry of known) {
    try {
      await deleteRoomSession(entry.roomId);
    } catch {
      failed += 1;
    }
  }

  forgetAllRooms();
  clearCurrentBooth();
  go.landing();

  showToast(failed ? `Done, ${failed} could not be removed` : 'All booths deleted ♡');
}
