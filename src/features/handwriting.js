// Writing a caption by hand instead of typing it.
//
// Reuses the doodle stroke format wholesale — same encoding, same simplifier,
// same renderers — because a handwritten caption is a drawing that happens to
// be words. The only difference is the box it lives in.
//
// Pointer events throughout, which is what makes this work with a finger and a
// mouse without two code paths. The pad is deliberately wide and short: it is
// the shape of the caption band on the collage, so what you write is what
// appears, rather than something squashed to fit afterwards.

import {
  appendStroke,
  decodeStrokes,
  DOODLE_STROKE_RATIO,
  encodeStrokes,
  simplifyStroke,
  strokesToSvgPath
} from '../doodle.js';

// Width to height. Everything drawn is stored relative to a box of this shape,
// so the pad and the collage's caption band agree without either knowing the
// other's pixel size.
export const HANDWRITING_ASPECT = 5;

// Handwriting is thinner than a doodle — it is a pen, not a marker. Anything
// heavier and letters close up into blobs at thumbnail size.
export const HANDWRITING_STROKE_RATIO = DOODLE_STROKE_RATIO * 0.42;

let strokes = [];
let active = null;
let undoStack = [];
let onChange = () => {};

export function resetHandwriting(encoded = '', notify = () => {}) {
  strokes = decodeStrokes(encoded);
  active = null;
  undoStack = [];
  full = false;
  onChange = notify;
}

export function handwritingPath() {
  return strokesToSvgPath(active ? [...strokes, active] : strokes);
}

export function encodeCurrentHandwriting() {
  return encodeStrokes(strokes);
}

export function hasHandwriting() {
  return strokes.length > 0;
}

export function canUndoHandwriting() {
  return undoStack.length > 0;
}

// Set when a stroke was actually refused, rather than guessed at in advance.
let full = false;

export function isHandwritingFull() {
  return full;
}

/* ----------------------------------------------------------------- drawing */

// `point` is already normalised 0..1 within the pad by the caller, which is the
// only part that needs to know about pixels.
export function beginStroke(point) {
  active = [point];
  onChange();
  return true;
}

export function extendStroke(point) {
  if (!active) return false;
  active.push(point);
  onChange();
  return true;
}

export function endStroke() {
  if (!active) return false;

  // Simplified only once the pen lifts, so the line under your finger is the
  // raw one and only what gets stored is thinned.
  const finished = simplifyStroke(active);
  active = null;

  const result = appendStroke(strokes, finished);
  full = !result.accepted;

  if (result.accepted) {
    undoStack.push([...strokes]);
    strokes = result.strokes;
  }

  onChange();
  return result.accepted;
}

export function undoHandwriting() {
  if (!undoStack.length) return;
  strokes = undoStack.pop();
  // Undoing makes room again, so the notice must not stay up.
  full = false;
  onChange();
}

export function clearHandwriting() {
  if (!strokes.length) return;
  undoStack.push([...strokes]);
  strokes = [];
  full = false;
  onChange();
}
