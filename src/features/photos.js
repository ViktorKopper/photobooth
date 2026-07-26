// What you can do to a photo once it exists: react to it, caption it, or move
// it to a different slot.

import { CAPTION_INK } from '../config.js';
import { roomApi } from '../roomApi.js';
import { state } from '../store.js';
import { restartAnimation } from '../ui/motion.js';
import { showError, showToast } from '../ui/toast.js';
import { sanitizeCaption } from '../utils.js';

export async function swapPhotosFlow(from, to) {
  try {
    const { swapPhotos } = await roomApi();
    await swapPhotos({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      indexA: from,
      indexB: to,
      room: state.room
    });
  } catch (error) {
    showError(error.message, 'Could not reorder the photos.');
  }
}

// Reacting is quick and low-stakes on purpose — no loading state, no disabling
// the button, just an optimistic-feeling toggle. The realtime subscription
// re-renders the actual state moments later anyway; if the write fails it
// quietly reverts on the next snapshot rather than interrupting anyone with an
// alert over a heart tap.
export async function toggleReactionFlow(ownerRole, index) {
  const photo = state.photos.find((item) => item.owner === ownerRole && item.index === index);
  if (!photo) return;

  const nextValue = !photo.reactions?.[state.role];

  try {
    const { setReaction } = await roomApi();
    await setReaction({
      roomId: state.roomId,
      uid: state.user.uid,
      myRole: state.role,
      ownerRole,
      index,
      value: nextValue,
      room: state.room
    });
  } catch (error) {
    console.error('Reaction failed', error);
  }
}

/* ----------------------------------------------------------- caption editor */

export function openCaptionEditor(role, index) {
  const photo = state.photos.find((item) => item.owner === role && item.index === index);
  if (!photo) return;

  state.editingCaption = { role, index };

  const overlay = document.querySelector('#captionEditorOverlay');
  const img = document.querySelector('#captionEditorImg');
  const input = document.querySelector('#captionEditorInput');

  img.src = photo.downloadUrl;
  input.value = photo.caption || '';
  input.style.color = CAPTION_INK[role] ?? CAPTION_INK.viktor;
  overlay.classList.remove('hidden');

  // The overlay is toggled with display:none, and a CSS animation won't replay
  // on an element that was merely un-hidden. Nudging it off and on (with a
  // forced reflow between) restarts the entry animation each time the editor
  // opens, instead of only on first render.
  restartAnimation(overlay);
  restartAnimation(overlay.querySelector('.caption-editor-card'));

  input.focus();
}

export function closeCaptionEditor() {
  state.editingCaption = null;
  document.querySelector('#captionEditorOverlay')?.classList.add('hidden');
}

export async function saveCaptionEditor() {
  if (!state.editingCaption) return;

  const { role, index } = state.editingCaption;
  const input = document.querySelector('#captionEditorInput');
  const saveBtn = document.querySelector('#captionEditorSaveBtn');
  const caption = sanitizeCaption(input.value);

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const { updateCaption } = await roomApi();
    await updateCaption({
      roomId: state.roomId,
      uid: state.user.uid,
      role,
      index,
      caption,
      room: state.room
    });
    closeCaptionEditor();
    showToast('Caption saved ♡');
  } catch (error) {
    showError(error.message, 'Could not save the caption.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}
