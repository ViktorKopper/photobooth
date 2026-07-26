// Placing stickers on a photo.
//
// Lives inside the decorate overlay alongside the marker, because the two are
// the same gesture on the same surface and splitting them into separate screens
// would mean choosing your tool before you know what you want.
//
// A sticker is picked up and dragged with one pointer, which covers touch and
// mouse identically. Size and angle are on sliders rather than a pinch: a pinch
// needs two fingers, which a laptop trackpad does not have, and this has to
// work in both places.

import {
  decodeStickers,
  encodeStickers,
  MAX_STICKERS,
  movePlacement,
  placementSvgTransform,
  rotatePlacement,
  scalePlacement,
  stickerAt,
  stickerById,
  STICKER_DEFAULT_SCALE,
  STICKER_MAX_SCALE,
  STICKER_MIN_SCALE,
  STICKERS
} from '../stickers.js';
import { escapeAttr } from '../ui/html.js';

let placements = [];
let selected = null;
let dragOffset = null;
let onChange = () => {};

export function resetStickerLayer(encoded = '', notify = () => {}) {
  placements = decodeStickers(encoded);
  selected = null;
  dragOffset = null;
  onChange = notify;
}

export function stickerCount() {
  return placements.length;
}

export function encodeCurrentStickers() {
  return encodeStickers(placements);
}

/* --------------------------------------------------------------- the sheet */

export function buildStickerSheet() {
  const buttons = STICKERS.map(
    (sticker) => `
      <button type="button" class="sticker-choice" data-sticker="${escapeAttr(sticker.id)}" title="${escapeAttr(sticker.label)}" aria-label="Add ${escapeAttr(sticker.label)}">
        <svg viewBox="0 0 100 100" aria-hidden="true"><path d="${escapeAttr(sticker.d)}" fill="${escapeAttr(sticker.color)}" /></svg>
      </button>
    `
  ).join('');

  return `
    <div class="sticker-sheet">${buttons}</div>
    <div id="stickerControls" class="sticker-controls hidden">
      <label class="sticker-slider">
        <span>Size</span>
        <input type="range" id="stickerScale" min="${STICKER_MIN_SCALE * 100}" max="${STICKER_MAX_SCALE * 100}" step="1" />
      </label>
      <label class="sticker-slider">
        <span>Turn</span>
        <input type="range" id="stickerRotate" min="-180" max="180" step="1" />
      </label>
      <button type="button" class="ghost small" id="stickerDeleteBtn">Remove</button>
    </div>
    <p id="stickerFull" class="doodle-full hidden">That's all twelve — remove one to add another.</p>
  `;
}

// Rendered as SVG rather than positioned elements, so the placements draw
// through exactly the same transform the collage uses.
export function stickerLayerMarkup() {
  return placements
    .map((placement, index) => {
      const sticker = stickerById(placement.id);
      if (!sticker) return '';

      const transform = placementSvgTransform(placement, { x: 0, y: 0, width: 1000, height: 1000 });
      return `<g class="sticker-placed${index === selected ? ' selected' : ''}" data-index="${index}" transform="${escapeAttr(transform)}"><path d="${escapeAttr(sticker.d)}" fill="${escapeAttr(sticker.color)}" /></g>`;
    })
    .join('');
}

function repaint() {
  const layer = document.querySelector('#stickerLayer');
  if (layer) layer.innerHTML = stickerLayerMarkup();

  const controls = document.querySelector('#stickerControls');
  const full = document.querySelector('#stickerFull');
  const current = selected === null ? null : placements[selected];

  controls?.classList.toggle('hidden', !current);
  full?.classList.toggle('hidden', placements.length < MAX_STICKERS);

  if (current) {
    const scale = document.querySelector('#stickerScale');
    const rotate = document.querySelector('#stickerRotate');
    if (scale) scale.value = String(Math.round(current.scale * 100));
    if (rotate) rotate.value = String(Math.round(current.rotation));
  }

  onChange();
}

/* ----------------------------------------------------------------- editing */

export function addSticker(id) {
  if (!stickerById(id) || placements.length >= MAX_STICKERS) return;

  // Dropped slightly off-centre and tilted, so adding two of the same thing
  // doesn't look like one sticker that failed to appear twice.
  const jitter = (placements.length % 5) * 0.06;
  placements = [
    ...placements,
    {
      id,
      x: 0.42 + jitter,
      y: 0.44 + jitter * 0.6,
      scale: STICKER_DEFAULT_SCALE,
      rotation: (placements.length % 2 ? 1 : -1) * (6 + placements.length * 2)
    }
  ];
  selected = placements.length - 1;
  repaint();
}

export function selectStickerAt(point, rect) {
  const index = stickerAt(placements, point, rect);
  selected = index;

  if (index !== null) {
    const placement = placements[index];
    // Remembered so a sticker doesn't jump its own centre under the finger the
    // moment it is picked up.
    dragOffset = { x: placement.x - point.x / rect.width, y: placement.y - point.y / rect.height };
  }

  repaint();
  return index;
}

export function dragSelected(point, rect) {
  if (selected === null || !dragOffset) return;

  placements = placements.map((placement, index) =>
    index === selected
      ? movePlacement(placement, {
          x: point.x / rect.width + dragOffset.x,
          y: point.y / rect.height + dragOffset.y
        })
      : placement
  );
  repaint();
}

export function endDrag() {
  dragOffset = null;
}

export function setSelectedScale(percent) {
  if (selected === null) return;
  placements = placements.map((placement, index) =>
    index === selected ? scalePlacement(placement, Number(percent) / 100) : placement
  );
  repaint();
}

export function setSelectedRotation(degrees) {
  if (selected === null) return;
  placements = placements.map((placement, index) =>
    index === selected ? rotatePlacement(placement, Number(degrees)) : placement
  );
  repaint();
}

export function removeSelected() {
  if (selected === null) return;
  placements = placements.filter((_, index) => index !== selected);
  selected = null;
  repaint();
}

export function clearStickers() {
  placements = [];
  selected = null;
  repaint();
}

// Exposed for the tests, which have no DOM to read the selection back from.
export function selectedIndex() {
  return selected;
}

export function currentPlacements() {
  return placements.map((placement) => ({ ...placement }));
}
