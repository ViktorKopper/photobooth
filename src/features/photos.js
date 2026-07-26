// What you can do to a photo once it exists: react to it, caption it, or move
// it to a different slot.

import { CAPTION_INK } from '../config.js';
import { HANDWRITING_STROKE_RATIO } from './handwriting.js';
import {
  beginStroke,
  canUndoHandwriting,
  clearHandwriting,
  encodeCurrentHandwriting,
  endStroke,
  extendStroke,
  handwritingPath,
  hasHandwriting,
  isHandwritingFull,
  resetHandwriting,
  undoHandwriting
} from './handwriting.js';
import { roomApi } from '../roomApi.js';
import { state } from '../store.js';
import { createModal } from '../ui/modal.js';
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

// 'type' or 'write'. Both are kept on the document, so switching back and
// forth never destroys the other one.
let captionMode = 'type';

const pad = () => document.querySelector('#handwritingPad');

function repaintHandwriting() {
  const ink = document.querySelector('#handwritingInk');
  if (!ink) return;

  ink.setAttribute('d', handwritingPath());
  document.querySelector('#handwritingUndoBtn').disabled = !canUndoHandwriting();
  document.querySelector('#handwritingClearBtn').disabled = !hasHandwriting();
}

function setCaptionMode(next) {
  captionMode = next;

  document.querySelectorAll('[data-caption-mode]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.captionMode === next);
  });
  document.querySelector('#captionWritePanel')?.classList.toggle('hidden', next !== 'write');
  document.querySelector('#captionEditorInput')?.classList.toggle('hidden', next === 'write');
}

// Normalised 0..1 inside the pad, which is the coordinate space the strokes are
// stored in — the same arrangement the doodle surface uses, so a finger and a
// mouse are handled by one code path rather than two.
function padPoint(event) {
  const box = pad().getBoundingClientRect();
  if (!box.width || !box.height) return null;
  return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
}

function onPadDown(event) {
  const point = padPoint(event);
  if (!point || isHandwritingFull()) return;

  pad().setPointerCapture?.(event.pointerId);
  event.preventDefault();
  beginStroke(point);
}

function onPadMove(event) {
  const point = padPoint(event);
  if (point) extendStroke(point);
}

// Built once with the room shell, opened many times.
let captionModal = null;

export function wireCaptionEditor() {
  const panel = document.querySelector('#captionWritePanel');
  if (!panel || panel.dataset.wired === 'true') return;
  panel.dataset.wired = 'true';

  captionModal = createModal(document.querySelector('#captionEditorOverlay'), {
    label: 'Edit photo caption',
    onClose: () => {
      state.editingCaption = null;
    }
  });

  document.querySelectorAll('[data-caption-mode]').forEach((tab) => {
    tab.addEventListener('click', () => setCaptionMode(tab.dataset.captionMode));
  });

  const surface = pad();
  surface.addEventListener('pointerdown', onPadDown);
  surface.addEventListener('pointermove', onPadMove);
  surface.addEventListener('pointerup', endStroke);
  surface.addEventListener('pointercancel', endStroke);
  surface.addEventListener('pointerleave', endStroke);

  document.querySelector('#handwritingUndoBtn').addEventListener('click', undoHandwriting);
  document.querySelector('#handwritingClearBtn').addEventListener('click', clearHandwriting);
}

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

  resetHandwriting(photo.handwriting || '', repaintHandwriting);
  const ink = document.querySelector('#handwritingInk');
  ink.setAttribute('stroke', CAPTION_INK[role] ?? CAPTION_INK.viktor);
  ink.setAttribute('stroke-width', String(HANDWRITING_STROKE_RATIO * 1000));

  // Opens on whichever the photo already has, so editing something written by
  // hand doesn't silently present an empty text box instead.
  setCaptionMode(photo.handwriting ? 'write' : 'type');
  repaintHandwriting();

  // Focused on the field rather than the first control, which is the mode
  // toggle — you came here to write something.
  captionModal?.open({ focus: input });

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

  if (captionModal) captionModal.close();
  else document.querySelector('#captionEditorOverlay')?.classList.add('hidden');
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
    const { updateCaption, updateHandwriting } = await roomApi();

    await updateCaption({
      roomId: state.roomId,
      uid: state.user.uid,
      role,
      index,
      caption,
      room: state.room
    });

    // Written separately, and only by the owner. Saving from the typing tab
    // clears the handwriting: two captions on one photo would both be drawn.
    await updateHandwriting({
      roomId: state.roomId,
      uid: state.user.uid,
      role,
      index,
      encoded: captionMode === 'write' ? encodeCurrentHandwriting() : '',
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
