// Camera, filters, countdown, capture, confirm.
//
// Everything between pointing the camera at yourself and a photo existing in
// the room. Asks for a redraw through requestRender() rather than calling the
// room screen directly, which is what lets the room screen import this module
// without the two depending on each other.

import { capturePhoto, startCamera } from '../camera.js';
import { COUNTDOWN_TICK_MS } from '../config.js';
import { cssFromOps, findFilter, FILTERS } from '../filters.js';
import { roomApi } from '../roomApi.js';
import { requestRender, state } from '../store.js';
import { playShutterSound, triggerShutterFeedback } from '../ui/feedback.js';
import { escapeAttr, escapeHtml } from '../ui/html.js';
import { showError, showToast } from '../ui/toast.js';
import { sanitizeCaption, sleep } from '../utils.js';

export function activeFilterCss() {
  return cssFromOps(findFilter(state.activeFilter).ops);
}

export function buildFilterRow() {
  return FILTERS.map(
    (filter) => `
      <button
        type="button"
        class="filter-swatch${filter.id === state.activeFilter ? ' active' : ''}"
        data-filter-id="${filter.id}"
        style="filter:${cssFromOps(filter.ops)}"
        title="${escapeAttr(filter.label)}"
      >${escapeHtml(filter.label.slice(0, 2))}</button>
    `
  ).join('');
}

export function selectFilter(filterId) {
  if (!FILTERS.some((filter) => filter.id === filterId)) return;

  state.activeFilter = filterId;

  const video = document.querySelector('#cameraPreview');
  if (video) video.style.filter = activeFilterCss();

  // Toggled in place instead of a full re-render, so the live camera feed
  // never flickers when switching filters.
  document.querySelectorAll('.filter-swatch').forEach((button) => {
    button.classList.toggle('active', button.dataset.filterId === filterId);
  });
}

export async function startCurrentCamera() {
  const video = document.querySelector('#cameraPreview');
  const errorBox = document.querySelector('#cameraError');
  if (!video || !errorBox) return;

  try {
    errorBox.classList.add('hidden');
    state.cameraStarted = false;
    requestRender();

    await startCamera(video, state.facingMode);

    state.cameraStarted = true;
    video.classList.toggle('mirrored', state.facingMode === 'user');
    video.style.filter = activeFilterCss();

    renderOnionSkin();
    requestRender();
  } catch (error) {
    state.cameraStarted = false;
    errorBox.textContent = error.message || 'Camera could not start.';
    errorBox.classList.remove('hidden');
    requestRender();
  }
}

/* ---------------------------------------------------------------- onion skin */

// Which of your own photos to ghost over the live preview. When redoing a slot
// it's that same slot — matching the shot you're replacing is the whole point.
// Otherwise it's your most recent one, to line the next shot up against.
function onionSkinPhoto() {
  const mine = state.photos.filter((photo) => photo.owner === state.role);
  if (!mine.length) return null;

  if (state.replacingIndex) {
    return mine.find((photo) => photo.index === state.replacingIndex) || null;
  }

  return mine.reduce((latest, photo) => (photo.index > latest.index ? photo : latest));
}

export function renderOnionSkin() {
  const image = document.querySelector('#onionSkin');
  const toggle = document.querySelector('#onionToggleBtn');
  if (!image || !toggle) return;

  const photo = onionSkinPhoto();

  // Nothing to trace over until at least one photo exists.
  toggle.classList.toggle('hidden', !photo);
  if (!photo) {
    image.classList.add('hidden');
    return;
  }

  toggle.classList.toggle('active', state.onionSkinOn);
  toggle.setAttribute('aria-pressed', String(state.onionSkinOn));

  if (!state.onionSkinOn) {
    image.classList.add('hidden');
    return;
  }

  if (image.dataset.src !== photo.downloadUrl) {
    image.dataset.src = photo.downloadUrl;
    image.src = photo.downloadUrl;
  }

  // The stored photo is already un-mirrored, but the live preview is mirrored
  // for the front camera — so the ghost has to be flipped to sit the same way
  // round as what you see of yourself.
  image.classList.toggle('mirrored', state.facingMode === 'user');
  image.classList.remove('hidden');
}

export function toggleOnionSkin() {
  state.onionSkinOn = !state.onionSkinOn;
  renderOnionSkin();
}

/* ------------------------------------------------------------------ capture */

export async function takePhotoFlow() {
  const countdown = document.querySelector('#countdown');
  const video = document.querySelector('#cameraPreview');
  const cameraActions = document.querySelector('#cameraActions');

  if (!video || !state.cameraStarted) return;

  cameraActions.classList.add('disabled');
  countdown.classList.remove('hidden');

  // Let the other side know, without waiting on it — the countdown must not
  // stall behind a network round trip.
  roomApi()
    .then(({ markShooting }) =>
      markShooting({ roomId: state.roomId, uid: state.user.uid, role: state.role, room: state.room })
    )
    .catch(() => undefined);

  for (let number = state.timerSeconds; number >= 1; number -= 1) {
    countdown.textContent = number;
    countdown.classList.remove('pulse');
    void countdown.offsetWidth;
    countdown.classList.add('pulse');
    await sleep(COUNTDOWN_TICK_MS);
  }

  await finishCaptureAfterCountdown();
}

// Shared tail end of "count down, then capture" — used both by the manual Take
// Photo button above and by the synced countdown, which schedules this same
// function to land exactly at the shared instant.
export async function finishCaptureAfterCountdown() {
  const countdown = document.querySelector('#countdown');
  const cameraActions = document.querySelector('#cameraActions');
  const video = document.querySelector('#cameraPreview');

  if (countdown) {
    countdown.textContent = '♡';
    countdown.classList.remove('pulse');
  }
  playShutterSound();
  triggerShutterFeedback();
  await sleep(260);
  if (countdown) {
    countdown.classList.add('hidden');
    countdown.classList.remove('pulse');
  }

  const myCount = state.room?.participants?.[state.role]?.photoCount || 0;
  const replacingIndex = state.replacingIndex;

  // On a synced countdown, one side may have nothing to do — already at 3/3,
  // camera not ready, or already mid-capture. The shared moment simply doesn't
  // apply to them; only re-enable the controls and stop. Someone mid-retake is
  // exempt from the 3/3 check: that's the whole point.
  if (!video || !state.cameraStarted || state.pendingCapture || (!replacingIndex && myCount >= 3)) {
    cameraActions?.classList.remove('disabled');
    return;
  }

  try {
    state.pendingCapture = await capturePhoto(video, state.facingMode, findFilter(state.activeFilter).ops);

    // Carry the existing caption over when redoing a slot, so a retake doesn't
    // silently throw away words the person still means.
    const existing = replacingIndex
      ? state.photos.find((item) => item.owner === state.role && item.index === replacingIndex)?.caption || ''
      : '';

    state.pendingCapture.caption = existing;
    document.querySelector('#photoPreview').src = state.pendingCapture.previewUrl;
    const captionInput = document.querySelector('#captionInput');
    captionInput.value = existing;
    document.querySelector('#previewPanel').classList.remove('hidden');
    document.querySelector('#cameraActions').classList.add('hidden');
    captionInput.focus();
  } catch (error) {
    showError(error.message, 'Could not take the photo.');
  } finally {
    cameraActions?.classList.remove('disabled');
  }
}

export function retakePhoto() {
  if (state.pendingCapture?.previewUrl) URL.revokeObjectURL(state.pendingCapture.previewUrl);
  state.pendingCapture = null;

  const captionInput = document.querySelector('#captionInput');
  if (captionInput) captionInput.value = '';
  document.querySelector('#previewPanel')?.classList.add('hidden');
  document.querySelector('#cameraActions')?.classList.remove('hidden');
}

export function startReplacingPhoto(index) {
  state.replacingIndex = index;
  retakePhoto();
  requestRender();
  document.querySelector('#cameraPreview')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

export function cancelReplacingPhoto() {
  state.replacingIndex = null;
  retakePhoto();
  requestRender();
}

export async function confirmPhoto() {
  if (!state.pendingCapture) return;

  const button = document.querySelector('#confirmBtn');
  const myCount = state.room?.participants?.[state.role]?.photoCount || 0;
  const replacingIndex = state.replacingIndex;
  button.disabled = true;
  button.textContent = 'Uploading...';

  try {
    const { uploadPhoto } = await roomApi();
    await uploadPhoto({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      index: replacingIndex || myCount + 1,
      blob: state.pendingCapture.blob,
      caption: sanitizeCaption(state.pendingCapture.caption),
      replace: Boolean(replacingIndex),
      room: state.room
    });
    state.replacingIndex = null;
    retakePhoto();
    requestRender();
    showToast(replacingIndex ? `Photo ${replacingIndex} replaced ♡` : 'Saved ♡');
  } catch (error) {
    showError(error.message, 'Upload failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Confirm photo';
  }
}
