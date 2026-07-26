// Drawing on a photo.
//
// The surface is an SVG overlay sized to the displayed photo, not a canvas:
// strokes are stored as paths anyway, so rendering them as paths means what you
// draw and what gets saved are the same thing, with no resampling in between.
// It also means the drawing stays crisp while the overlay is being resized by a
// rotating phone.
//
// You can draw on either of your photos or on hers. Each of you owns one key on
// the document, so neither can rub out the other's marker.

import { CAPTION_INK } from '../config.js';
import {
  appendStroke,
  decodeStrokes,
  DOODLE_STROKE_RATIO,
  encodeStrokes,
  simplifyStroke,
  strokesToSvgPath
} from '../doodle.js';
import { roomApi } from '../roomApi.js';
import {
  addSticker,
  clearStickers,
  dragSelected,
  encodeCurrentStickers,
  endDrag,
  removeSelected,
  resetStickerLayer,
  selectStickerAt,
  setSelectedRotation,
  setSelectedScale,
  stickerLayerMarkup
} from './stickerLayer.js';
import { state } from '../store.js';
import { restartAnimation } from '../ui/motion.js';
import { showError, showToast } from '../ui/toast.js';
import { otherRole, ROLES } from '../utils.js';

// What's being drawn right now: the photo, my strokes, and the stroke in
// progress. Nothing here survives closing the editor.
let editing = null;
let strokes = [];
let active = null;
let undoStack = [];
// 'draw' or 'stick'. The marker and the sheet share one surface because they
// are the same gesture on the same photo; making them separate screens would
// mean choosing a tool before knowing what you want.
let mode = 'draw';
// Set when a stroke was actually refused, so the notice appears at the moment
// something was really lost rather than on a guess.
let full = false;

const surface = () => document.querySelector('#doodleSurface');
const myPathEl = () => document.querySelector('#doodleMine');
const theirPathEl = () => document.querySelector('#doodleTheirs');

function inkFor(role) {
  return CAPTION_INK[role] ?? CAPTION_INK.viktor;
}

// Pointer position as a fraction of the drawing surface, which is exactly the
// coordinate space the strokes are stored in.
function pointFrom(event) {
  const box = surface().getBoundingClientRect();
  if (!box.width || !box.height) return null;
  return { x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height };
}

function repaint() {
  const mine = myPathEl();
  if (!mine) return;

  const drawing = active ? [...strokes, active] : strokes;
  mine.setAttribute('d', strokesToSvgPath(drawing));

  const undoBtn = document.querySelector('#doodleUndoBtn');
  const clearBtn = document.querySelector('#doodleClearBtn');
  if (undoBtn) undoBtn.disabled = strokes.length === 0;
  if (clearBtn) clearBtn.disabled = strokes.length === 0;

  const notice = document.querySelector('#doodleFull');
  if (notice) notice.classList.toggle('hidden', !full);
}

/* ------------------------------------------------------------------ opening */

export function openDoodleEditor(ownerRole, index) {
  const photo = state.photos.find((item) => item.owner === ownerRole && item.index === index);
  if (!photo) return;

  const myRole = state.role;
  const theirRole = otherRole(myRole);

  editing = { ownerRole, index };
  strokes = decodeStrokes(photo.doodles?.[myRole] || '');
  undoStack = [];
  active = null;
  mode = 'draw';
  full = false;
  resetStickerLayer(photo.stickers?.[myRole] || '', repaintStickers);

  const overlay = document.querySelector('#doodleOverlay');
  const image = document.querySelector('#doodleImg');

  image.src = photo.downloadUrl;
  document.querySelector('#doodleWho').textContent =
    ownerRole === myRole ? 'Your photo' : `${ROLES[ownerRole].name}'s photo`;

  // Their marker sits under yours and is not editable — it is theirs.
  theirPathEl().setAttribute('d', strokesToSvgPath(decodeStrokes(photo.doodles?.[theirRole] || '')));
  theirPathEl().setAttribute('stroke', inkFor(theirRole));
  myPathEl().setAttribute('stroke', inkFor(myRole));

  // Stroke width is a fraction of the photo, and the viewBox is 0..1000, so
  // this is the same number at every display size.
  const width = DOODLE_STROKE_RATIO * 1000;
  myPathEl().setAttribute('stroke-width', String(width));
  theirPathEl().setAttribute('stroke-width', String(width));

  document.querySelector('#stickerLayer').innerHTML = stickerLayerMarkup();
  setMode('draw');

  overlay.classList.remove('hidden');
  restartAnimation(overlay);
  restartAnimation(overlay.querySelector('.doodle-card'));

  repaint();
}

export function closeDoodleEditor() {
  editing = null;
  strokes = [];
  active = null;
  undoStack = [];
  clearStickers();
  document.querySelector('#doodleOverlay')?.classList.add('hidden');
}

export function isDoodling() {
  return editing !== null;
}

/* ----------------------------------------------------------------- drawing */

// Pixels within the surface, which is what the sticker geometry works in.
function pixelFrom(event) {
  const box = surface().getBoundingClientRect();
  if (!box.width || !box.height) return null;
  return { x: event.clientX - box.left, y: event.clientY - box.top, width: box.width, height: box.height };
}

function repaintStickers() {
  const layer = document.querySelector('#stickerLayer');
  if (layer) layer.innerHTML = stickerLayerMarkup();
}

function setMode(next) {
  mode = next;

  document.querySelectorAll('[data-doodle-mode]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.doodleMode === next);
  });
  document.querySelector('#doodleDrawTools')?.classList.toggle('hidden', next !== 'draw');
  document.querySelector('#doodleStickTools')?.classList.toggle('hidden', next !== 'stick');
  // The marker must not paint while you are dragging a sticker around, and a
  // sticker must not be picked up while you are drawing over it.
  surface()?.classList.toggle('placing', next === 'stick');
}

function onPointerDown(event) {
  if (!editing) return;

  if (mode === 'stick') {
    const pixel = pixelFrom(event);
    if (!pixel) return;
    surface().setPointerCapture?.(event.pointerId);
    event.preventDefault();
    selectStickerAt(pixel, { width: pixel.width, height: pixel.height });
    return;
  }

  const point = pointFrom(event);
  if (!point) return;

  // Captured so a stroke that leaves the photo still ends properly when the
  // finger lifts outside it, rather than being left open forever.
  surface().setPointerCapture?.(event.pointerId);
  event.preventDefault();

  active = [point];
  repaint();
}

function onPointerMove(event) {
  if (mode === 'stick') {
    const pixel = pixelFrom(event);
    if (pixel) dragSelected(pixel, { width: pixel.width, height: pixel.height });
    return;
  }

  if (!active) return;
  const point = pointFrom(event);
  if (!point) return;

  active.push(point);
  repaint();
}

function onPointerUp() {
  if (mode === 'stick') {
    endDrag();
    return;
  }

  if (!active) return;

  // Simplified once at the end rather than while drawing, so the line you see
  // under your finger is the raw one and only what gets stored is thinned.
  const finished = simplifyStroke(active);
  active = null;

  const result = appendStroke(strokes, finished);
  full = !result.accepted;

  if (result.accepted) {
    undoStack.push([...strokes]);
    strokes = result.strokes;
  }

  repaint();
}

function undo() {
  if (!undoStack.length) return;
  strokes = undoStack.pop();
  // Undoing makes room again.
  full = false;
  repaint();
}

function clearAll() {
  if (!strokes.length) return;
  undoStack.push([...strokes]);
  strokes = [];
  full = false;
  repaint();
}

/* ------------------------------------------------------------------ saving */

async function save() {
  if (!editing) return;

  const button = document.querySelector('#doodleSaveBtn');
  const { ownerRole, index } = editing;

  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    const { updateDoodle, updateStickers } = await roomApi();

    // Two writes rather than one, because they are two fields on two different
    // rules — and either is worth keeping if the other fails.
    await updateDoodle({
      roomId: state.roomId,
      uid: state.user.uid,
      myRole: state.role,
      ownerRole,
      index,
      encoded: encodeStrokes(strokes),
      room: state.room
    });
    await updateStickers({
      roomId: state.roomId,
      uid: state.user.uid,
      myRole: state.role,
      ownerRole,
      index,
      encoded: encodeCurrentStickers(),
      room: state.room
    });

    closeDoodleEditor();
    showToast('Decorated ♡');
  } catch (error) {
    showError(error.message, 'Could not save the drawing.');
  } finally {
    button.disabled = false;
    button.textContent = 'Save';
  }
}

// Bound once, on the overlay, which lives for as long as the booth screen does.
export function wireDoodleEditor() {
  const overlay = document.querySelector('#doodleOverlay');
  if (!overlay || overlay.dataset.doodleWired === 'true') return;
  overlay.dataset.doodleWired = 'true';

  const pad = surface();
  pad.addEventListener('pointerdown', onPointerDown);
  pad.addEventListener('pointermove', onPointerMove);
  pad.addEventListener('pointerup', onPointerUp);
  pad.addEventListener('pointercancel', onPointerUp);
  // A stroke left open by the pointer leaving the window would otherwise keep
  // extending itself the next time the mouse came back.
  pad.addEventListener('pointerleave', onPointerUp);

  document.querySelectorAll('[data-doodle-mode]').forEach((tab) => {
    tab.addEventListener('click', () => setMode(tab.dataset.doodleMode));
  });

  document.querySelector('.sticker-sheet').addEventListener('click', (event) => {
    const choice = event.target.closest('[data-sticker]');
    if (choice) addSticker(choice.dataset.sticker);
  });

  document.querySelector('#stickerScale').addEventListener('input', (event) => {
    setSelectedScale(event.target.value);
  });
  document.querySelector('#stickerRotate').addEventListener('input', (event) => {
    setSelectedRotation(event.target.value);
  });
  document.querySelector('#stickerDeleteBtn').addEventListener('click', removeSelected);

  document.querySelector('#doodleUndoBtn').addEventListener('click', undo);
  document.querySelector('#doodleClearBtn').addEventListener('click', clearAll);
  document.querySelector('#doodleSaveBtn').addEventListener('click', save);
  document.querySelector('#doodleCancelBtn').addEventListener('click', closeDoodleEditor);

  overlay.addEventListener('click', (event) => {
    if (event.target.id === 'doodleOverlay') closeDoodleEditor();
  });
}
