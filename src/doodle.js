// Marker scribbles on a photo.
//
// Stored as normalised path data rather than pixels, which is what makes this
// affordable: a drawing is a few hundred bytes on the photo document instead of
// a second image in Storage, it scales to any size the collage renders at, and
// it stays legible whether it's on a 90px thumbnail or a 1600px print.
//
// Everything here is pure. Coordinates are 0..1 relative to the photo, so
// nothing in this file knows or cares how big anything is on screen.

// Coordinates are quantised to this grid before storage. A thousandth of a
// photo is roughly a pixel and a half on a 1600px collage — far finer than a
// finger or a mouse can place a line, and it keeps each point to at most seven
// characters instead of seventeen.
export const DOODLE_PRECISION = 1000;

// A hard ceiling on one person's drawing, enforced here and again in the
// security rules. Firestore's document limit is a megabyte and this is nowhere
// near it; the real reason is that an accidental scribble shouldn't be able to
// grow without bound while somebody rests a finger on the screen.
export const DOODLE_MAX_CHARS = 4000;

// Points closer together than this are dropped. Pointer events fire far denser
// than a drawing needs — at 120Hz a slow line produces hundreds of points a
// second, almost all of them indistinguishable.
const MIN_POINT_DISTANCE = 0.006;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

const quantise = (value) => Math.round(clamp01(value) * DOODLE_PRECISION);

/* --------------------------------------------------------------- encoding */

// "120,340 128,352|500,500 512,498" — strokes split by |, points by space,
// x and y by comma.
export function encodeStrokes(strokes) {
  if (!Array.isArray(strokes)) return '';

  return strokes
    .filter((stroke) => Array.isArray(stroke) && stroke.length > 0)
    .map((stroke) => stroke.map((point) => `${quantise(point.x)},${quantise(point.y)}`).join(' '))
    .join('|');
}

export function decodeStrokes(encoded) {
  if (typeof encoded !== 'string' || !encoded) return [];

  return encoded
    .split('|')
    .map((stroke) =>
      stroke
        .split(' ')
        .map((pair) => {
          const [x, y] = pair.split(',').map(Number);
          // A malformed point is dropped rather than poisoning the stroke with
          // a NaN that would silently break every renderer downstream.
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return { x: clamp01(x / DOODLE_PRECISION), y: clamp01(y / DOODLE_PRECISION) };
        })
        .filter(Boolean)
    )
    .filter((stroke) => stroke.length > 0);
}

/* ------------------------------------------------------------- simplifying */

export function simplifyStroke(points, minDistance = MIN_POINT_DISTANCE) {
  if (!Array.isArray(points) || points.length < 2) return points || [];

  const kept = [points[0]];

  points.slice(1).forEach((point) => {
    const last = kept[kept.length - 1];
    const dx = point.x - last.x;
    const dy = point.y - last.y;
    if (Math.hypot(dx, dy) >= minDistance) kept.push(point);
  });

  // The final point is always kept, so a stroke ends where the finger lifted
  // rather than at the last point that happened to clear the threshold.
  const last = points[points.length - 1];
  if (kept[kept.length - 1] !== last) kept.push(last);

  return kept;
}

// A single dot — tapping without dragging — is a legitimate mark, so it is
// stored as a one-point stroke rather than discarded.
export function isDot(stroke) {
  return Array.isArray(stroke) && stroke.length === 1;
}

/* ---------------------------------------------------------------- limiting */

// Returns the longest prefix of `strokes` that still encodes within the cap.
// Whole strokes are dropped rather than trimmed, because half a line looks like
// a bug where a missing line just looks like you stopped drawing.
export function fitWithinLimit(strokes, maxChars = DOODLE_MAX_CHARS) {
  if (encodeStrokes(strokes).length <= maxChars) return strokes;

  const kept = [];
  for (const stroke of strokes) {
    const candidate = [...kept, stroke];
    if (encodeStrokes(candidate).length > maxChars) break;
    kept.push(stroke);
  }
  return kept;
}

// Adds a stroke if it fits, and says whether it did.
//
// Asking "is it full?" before drawing cannot be answered honestly: a stroke is
// anywhere from eight characters to several hundred, so there is no threshold
// that means "the next one will fit". The first version guessed, and guessed
// wrong in the worst direction — fitWithinLimit only ever returns something
// strictly under the cap, so the check could never fire, and a stroke drawn
// past the limit vanished with nothing said about why.
//
// Reporting after the fact is both accurate and better behaved: the notice
// appears at the exact moment something was actually refused.
export function appendStroke(strokes, stroke, maxChars = DOODLE_MAX_CHARS) {
  if (!stroke?.length) return { strokes, accepted: true };

  const candidate = [...strokes, stroke];
  if (encodeStrokes(candidate).length > maxChars) return { strokes, accepted: false };

  return { strokes: candidate, accepted: true };
}

/* --------------------------------------------------------------- rendering */

// An SVG `d` attribute in a 0..1000 viewBox, for the thumbnail overlays. The
// overlay stretches with `preserveAspectRatio="none"`, so the drawing follows
// the photo whatever shape it is displayed at.
export function strokesToSvgPath(strokes) {
  return strokes
    .map((stroke) => {
      const [first, ...rest] = stroke;
      const move = `M${quantise(first.x)} ${quantise(first.y)}`;

      // A dot has nowhere to line to. Zero-length lines with a round cap paint
      // a filled circle, which is exactly what a tap should leave behind.
      if (!rest.length) return `${move}l0 0`;

      return move + rest.map((point) => `L${quantise(point.x)} ${quantise(point.y)}`).join('');
    })
    .join('');
}

// Paints onto a canvas within the given rectangle. Used by the collage renderer
// and by the editor's own preview, so a drawing looks identical in both.
export function drawStrokes(ctx, strokes, { x, y, width, height, color, lineWidth }) {
  if (!strokes.length) return;

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  strokes.forEach((stroke) => {
    if (isDot(stroke)) {
      ctx.beginPath();
      ctx.arc(x + stroke[0].x * width, y + stroke[0].y * height, lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    ctx.beginPath();
    stroke.forEach((point, index) => {
      const px = x + point.x * width;
      const py = y + point.y * height;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  ctx.restore();
}

// Marker width as a fraction of the photo's width, so a line looks like the
// same pen at every size the photo is drawn at.
export const DOODLE_STROKE_RATIO = 0.011;

export function strokeWidthFor(width) {
  return Math.max(1, width * DOODLE_STROKE_RATIO);
}
