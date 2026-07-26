import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeStrokes } from '../doodle.js';
import {
  beginStroke,
  canUndoHandwriting,
  clearHandwriting,
  encodeCurrentHandwriting,
  endStroke,
  extendStroke,
  handwritingPath,
  HANDWRITING_ASPECT,
  HANDWRITING_STROKE_RATIO,
  hasHandwriting,
  isHandwritingFull,
  resetHandwriting,
  undoHandwriting
} from './handwriting.js';

const point = (x, y) => ({ x, y });

// One stroke, as a finger or a mouse would deliver it — same code path for both.
function write(points) {
  beginStroke(points[0]);
  points.slice(1).forEach(extendStroke);
  endStroke();
}

let notified;

beforeEach(() => {
  notified = vi.fn();
  resetHandwriting('', notified);
});

describe('writing', () => {
  it('starts with a blank line', () => {
    expect(hasHandwriting()).toBe(false);
    expect(handwritingPath()).toBe('');
  });

  it('records a stroke', () => {
    write([point(0.1, 0.5), point(0.3, 0.4), point(0.5, 0.6)]);
    expect(hasHandwriting()).toBe(true);
    expect(handwritingPath()).toMatch(/^M/);
  });

  it('shows the stroke while it is still being drawn', () => {
    // The line has to appear under the finger, not only once it lifts.
    beginStroke(point(0.1, 0.5));
    extendStroke(point(0.4, 0.5));
    expect(handwritingPath()).not.toBe('');
  });

  it('keeps several words apart', () => {
    write([point(0.1, 0.5), point(0.2, 0.5)]);
    write([point(0.4, 0.5), point(0.5, 0.5)]);
    expect(decodeStrokes(encodeCurrentHandwriting())).toHaveLength(2);
  });

  it('announces every change, so the pad can repaint', () => {
    write([point(0.1, 0.5), point(0.2, 0.5)]);
    expect(notified).toHaveBeenCalled();
  });

  it('ignores a move that never began', () => {
    expect(extendStroke(point(0.5, 0.5))).toBe(false);
    expect(endStroke()).toBe(false);
  });
});

describe('undo and clear', () => {
  it('has nothing to undo at first', () => {
    expect(canUndoHandwriting()).toBe(false);
  });

  it('takes back the last stroke', () => {
    write([point(0.1, 0.5), point(0.2, 0.5)]);
    write([point(0.4, 0.5), point(0.5, 0.5)]);

    undoHandwriting();
    expect(decodeStrokes(encodeCurrentHandwriting())).toHaveLength(1);
  });

  it('wipes the line', () => {
    write([point(0.1, 0.5), point(0.2, 0.5)]);
    clearHandwriting();
    expect(hasHandwriting()).toBe(false);
  });

  it('lets a clear be undone — it is one keypress from losing a sentence', () => {
    write([point(0.1, 0.5), point(0.2, 0.5)]);
    clearHandwriting();
    undoHandwriting();
    expect(hasHandwriting()).toBe(true);
  });

  it('does nothing when there is nothing to clear', () => {
    clearHandwriting();
    expect(canUndoHandwriting()).toBe(false);
  });
});

describe('loading what was written before', () => {
  it('picks up an existing caption', () => {
    resetHandwriting('100,500 300,500', notified);
    expect(hasHandwriting()).toBe(true);
  });

  it('starts its undo history fresh, so a load cannot be undone away', () => {
    resetHandwriting('100,500 300,500', notified);
    expect(canUndoHandwriting()).toBe(false);
  });

  it('survives a corrupt caption', () => {
    resetHandwriting('junk', notified);
    expect(hasHandwriting()).toBe(false);
  });
});

describe('the size cap', () => {
  const fill = () => {
    for (let i = 0; i < 400; i += 1) {
      write(Array.from({ length: 20 }, (_, n) => point(n / 20, (i % 10) / 10)));
    }
  };

  it('says nothing until a stroke is actually refused', () => {
    write([point(0.1, 0.5), point(0.2, 0.5)]);
    expect(isHandwritingFull()).toBe(false);
  });

  it('reports being full once one is', () => {
    fill();
    expect(isHandwritingFull()).toBe(true);
  });

  it('keeps everything that did fit', () => {
    fill();
    expect(hasHandwriting()).toBe(true);
    expect(encodeCurrentHandwriting().length).toBeLessThanOrEqual(4000);
  });

  it('lets you write again after undoing, and stops saying it is full', () => {
    fill();
    undoHandwriting();
    expect(isHandwritingFull()).toBe(false);
  });

  it('clears the notice when the line is wiped', () => {
    fill();
    clearHandwriting();
    expect(isHandwritingFull()).toBe(false);
  });
});

describe('the shape it is stored against', () => {
  it('is a wide, short box — the shape of a caption band', () => {
    // The pad and the collage's caption band agree on this without either
    // knowing the other's pixel size.
    expect(HANDWRITING_ASPECT).toBeGreaterThan(3);
  });

  it('writes with a thinner line than the marker', () => {
    // A marker-weight pen closes letters into blobs at thumbnail size.
    expect(HANDWRITING_STROKE_RATIO).toBeLessThan(0.006);
  });
});
