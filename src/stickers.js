// The sticker sheet.
//
// Stored the same way doodles are — a short string of normalised placements on
// the photo document, one key per person — so the two systems share their
// storage shape, their security rule, and their renderers. A sticker is a
// placement, not an image: nothing is uploaded, and the same handful of bytes
// draws at thumbnail size and at print size.
//
// Everything here is pure geometry and path data. Nothing knows how big
// anything is on screen.

// Drawn on a 100×100 grid so a path can be scaled to any size by dividing.
// Filled rather than stroked, unlike the icon set: these are things stuck onto
// a photo, and an outline would read as a diagram rather than an object.
export const STICKERS = [
  {
    id: 'heart',
    label: 'Heart',
    color: '#e85d85',
    d: 'M50 88C22 68 8 54 8 36A21 21 0 0 1 50 26 21 21 0 0 1 92 36c0 18-14 32-42 52z'
  },
  {
    id: 'bow',
    label: 'Bow',
    color: '#f4a6c0',
    d: 'M50 50c-8-14-22-22-34-18-10 4-10 22 0 28 8 5 22 2 34-10zm0 0c8-14 22-22 34-18 10 4 10 22 0 28-8 5-22 2-34-10zm0 0a8 8 0 1 0 .1 0zM44 58l-8 26 14-14 14 14-8-26z'
  },
  {
    id: 'star',
    label: 'Star',
    color: '#f0b429',
    d: 'M50 8l12 26 28 4-20 20 5 28-25-13-25 13 5-28L10 38l28-4z'
  },
  {
    id: 'sparkle',
    label: 'Sparkle',
    color: '#ffd166',
    d: 'M50 6c4 24 16 36 40 44-24 8-36 20-40 44-4-24-16-36-40-44 24-8 36-20 40-44z'
  },
  {
    id: 'flower',
    label: 'Flower',
    color: '#c98bd6',
    d: 'M50 20a15 15 0 0 1 0 30 15 15 0 0 1 0-30zm26 15a15 15 0 0 1-21 21 15 15 0 0 1 21-21zM50 80a15 15 0 0 1 0-30 15 15 0 0 1 0 30zM24 35a15 15 0 0 1 21 21A15 15 0 0 1 24 35zm26 8a7 7 0 1 0 .1 0z'
  },
  {
    id: 'cloud',
    label: 'Cloud',
    color: '#9dc3e6',
    d: 'M26 72h48a16 16 0 0 0 2-32A23 23 0 0 0 27 36a16 16 0 0 0-1 36z'
  },
  {
    id: 'moon',
    label: 'Moon',
    color: '#b6a6e0',
    d: 'M72 62A34 34 0 0 1 38 16a38 38 0 1 0 34 46z'
  },
  {
    id: 'arrow',
    label: 'Arrow',
    color: '#7aa86f',
    d: 'M12 62c18-30 44-40 68-38l-12-14 8-6 24 22-24 22-8-6 11-13c-20-2-42 7-58 35z'
  }
];

export function stickerById(id) {
  return STICKERS.find((sticker) => sticker.id === id) || null;
}

// Placements are quantised onto the same grid doodles use, for the same reason:
// far finer than anyone can place a sticker, and short to write down.
export const STICKER_PRECISION = 1000;

// Twelve each. Enough to make a mess of a photo on purpose, few enough that the
// encoded string stays well under any limit worth worrying about.
export const MAX_STICKERS = 12;

// A sticker's size as a fraction of the photo's width.
export const STICKER_MIN_SCALE = 0.06;
export const STICKER_MAX_SCALE = 0.5;
export const STICKER_DEFAULT_SCALE = 0.18;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/* --------------------------------------------------------------- encoding */

// "heart,500,500,180,-12|star,200,300,120,0"
//   id, x, y, scale (per-mille of photo width), rotation in whole degrees.
export function encodeStickers(placements) {
  if (!Array.isArray(placements)) return '';

  return placements
    .filter((placement) => stickerById(placement.id))
    .slice(0, MAX_STICKERS)
    .map((placement) => {
      const x = Math.round(clamp(placement.x, 0, 1) * STICKER_PRECISION);
      const y = Math.round(clamp(placement.y, 0, 1) * STICKER_PRECISION);
      const scale = Math.round(
        clamp(placement.scale ?? STICKER_DEFAULT_SCALE, STICKER_MIN_SCALE, STICKER_MAX_SCALE) *
          STICKER_PRECISION
      );
      const rotation = Math.round(clamp(placement.rotation ?? 0, -180, 180));
      return `${placement.id},${x},${y},${scale},${rotation}`;
    })
    .join('|');
}

export function decodeStickers(encoded) {
  if (typeof encoded !== 'string' || !encoded) return [];

  return encoded
    .split('|')
    .map((chunk) => {
      const [id, x, y, scale, rotation] = chunk.split(',');
      // An id this version doesn't know is dropped rather than drawn as a gap.
      // A room decorated by a newer build should degrade, not break.
      if (!stickerById(id)) return null;

      const numbers = [x, y, scale, rotation].map(Number);
      if (numbers.some((value) => !Number.isFinite(value))) return null;

      return {
        id,
        x: clamp(numbers[0] / STICKER_PRECISION, 0, 1),
        y: clamp(numbers[1] / STICKER_PRECISION, 0, 1),
        scale: clamp(numbers[2] / STICKER_PRECISION, STICKER_MIN_SCALE, STICKER_MAX_SCALE),
        rotation: clamp(numbers[3], -180, 180)
      };
    })
    .filter(Boolean)
    .slice(0, MAX_STICKERS);
}

/* ---------------------------------------------------------------- geometry */

// Where a placement sits inside a rectangle, in that rectangle's own units.
// `x`/`y` are the sticker's centre, and its size is driven by the rectangle's
// WIDTH alone — keying it to the smaller dimension would make the same sticker
// shrink on a landscape photo and grow on a portrait one.
// The origin defaults to zero, because the editor works in surface-local
// pixels where there is no offset to speak of — and an undefined `x` silently
// turns every coordinate into NaN, which reads as "nothing is ever under the
// pointer" rather than as an error.
export function placementRect(placement, { x = 0, y = 0, width, height }) {
  const size = placement.scale * width;
  return {
    cx: x + placement.x * width,
    cy: y + placement.y * height,
    size,
    half: size / 2
  };
}

// Topmost first, since that is the one a tap should pick up.
export function stickerAt(placements, point, rect) {
  for (let index = placements.length - 1; index >= 0; index -= 1) {
    const { cx, cy, half } = placementRect(placements[index], rect);
    if (Math.abs(point.x - cx) <= half && Math.abs(point.y - cy) <= half) return index;
  }
  return null;
}

// Moving a sticker keeps its centre on the photo. Letting it wander off would
// store a placement that renders as nothing.
export function movePlacement(placement, { x, y }) {
  return { ...placement, x: clamp(x, 0, 1), y: clamp(y, 0, 1) };
}

export function scalePlacement(placement, scale) {
  return { ...placement, scale: clamp(scale, STICKER_MIN_SCALE, STICKER_MAX_SCALE) };
}

export function rotatePlacement(placement, rotation) {
  // Wrapped rather than clamped: rotation is a circle, and stopping dead at
  // 180° would feel like the sticker had jammed.
  const wrapped = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return { ...placement, rotation: wrapped };
}

/* --------------------------------------------------------------- rendering */

// The transform that places a sticker's 100×100 path into a rectangle. Shared
// by the canvas renderer and the SVG overlays so the two cannot drift apart.
export function placementTransform(placement, rect) {
  const { cx, cy, size } = placementRect(placement, rect);
  return {
    translateX: cx,
    translateY: cy,
    scale: size / 100,
    rotation: placement.rotation
  };
}

export function placementSvgTransform(placement, rect) {
  const { translateX, translateY, scale, rotation } = placementTransform(placement, rect);
  // Rotate before scaling, then shift the 100×100 path so its centre — not its
  // top-left corner — lands on the placement.
  return `translate(${round(translateX)} ${round(translateY)}) rotate(${round(rotation)}) scale(${round(scale, 4)}) translate(-50 -50)`;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

// Paints onto a canvas. Path2D is not available in the test environment, so it
// is injected rather than reached for directly — which also keeps this function
// honest about being the only place that needs it.
export function drawStickers(ctx, placements, rect, { PathCtor = globalThis.Path2D } = {}) {
  if (!placements.length || !PathCtor) return 0;

  let drawn = 0;

  placements.forEach((placement) => {
    const sticker = stickerById(placement.id);
    if (!sticker) return;

    const { translateX, translateY, scale, rotation } = placementTransform(placement, rect);

    ctx.save();
    ctx.translate(translateX, translateY);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.scale(scale, scale);
    ctx.translate(-50, -50);
    ctx.fillStyle = sticker.color;
    ctx.fill(new PathCtor(sticker.d));
    ctx.restore();
    drawn += 1;
  });

  return drawn;
}
