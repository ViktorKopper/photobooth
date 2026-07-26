import { describe, expect, it, vi } from 'vitest';
import {
  decodeStrokes,
  DOODLE_MAX_CHARS,
  drawStrokes,
  encodeStrokes,
  appendStroke,
  fitWithinLimit,
  isDot,
  simplifyStroke,
  strokesToSvgPath,
  strokeWidthFor
} from './doodle.js';

const point = (x, y) => ({ x, y });
const line = (count, from = 0) =>
  Array.from({ length: count }, (_, i) => point((from + i) / count, 0.5));

describe('encoding', () => {
  it('round-trips a stroke', () => {
    const strokes = [[point(0.1, 0.2), point(0.3, 0.4)]];
    const back = decodeStrokes(encodeStrokes(strokes));

    expect(back).toHaveLength(1);
    expect(back[0][0].x).toBeCloseTo(0.1, 3);
    expect(back[0][1].y).toBeCloseTo(0.4, 3);
  });

  it('keeps several strokes apart', () => {
    const strokes = [[point(0, 0), point(1, 1)], [point(0.5, 0.5)]];
    expect(decodeStrokes(encodeStrokes(strokes))).toHaveLength(2);
  });

  it('is compact — a drawing is bytes on a document, not a second image', () => {
    // 200 points is a substantial scribble.
    const encoded = encodeStrokes([line(200)]);
    expect(encoded.length).toBeLessThan(DOODLE_MAX_CHARS / 2);
  });

  it('clamps a point that strayed outside the photo', () => {
    const back = decodeStrokes(encodeStrokes([[point(-3, 42)]]));
    expect(back[0][0]).toEqual({ x: 0, y: 1 });
  });

  it('drops empty strokes rather than storing them', () => {
    expect(encodeStrokes([[], [point(0.5, 0.5)], []])).toBe('500,500');
  });

  it('returns nothing for nothing', () => {
    expect(encodeStrokes([])).toBe('');
    expect(encodeStrokes(null)).toBe('');
    expect(encodeStrokes(undefined)).toBe('');
  });
});

describe('decoding something malformed', () => {
  it('survives junk instead of a path', () => {
    // Whatever is on the document is not necessarily what this version wrote.
    expect(decodeStrokes('nonsense')).toEqual([]);
    expect(decodeStrokes('')).toEqual([]);
    expect(decodeStrokes(null)).toEqual([]);
    expect(decodeStrokes(42)).toEqual([]);
  });

  it('drops a broken point instead of poisoning the stroke with NaN', () => {
    // One NaN would silently break every renderer downstream.
    const back = decodeStrokes('100,200 bad,300 400,500');
    expect(back[0]).toHaveLength(2);
    back[0].forEach((p) => {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    });
  });

  it('drops a stroke that had no valid points left', () => {
    expect(decodeStrokes('bad,bad|100,200')).toHaveLength(1);
  });
});

describe('simplifying', () => {
  it('thins out points a finger could never have placed apart', () => {
    // Pointer events fire far denser than a drawing needs.
    const dense = Array.from({ length: 300 }, (_, i) => point(i / 3000, 0.5));
    expect(simplifyStroke(dense).length).toBeLessThan(30);
  });

  it('keeps the shape recognisable', () => {
    const dense = Array.from({ length: 200 }, (_, i) => point(i / 200, i / 200));
    const simplified = simplifyStroke(dense);

    expect(simplified[0]).toEqual(dense[0]);
    expect(simplified.at(-1)).toEqual(dense.at(-1));
  });

  it('always keeps the point where the finger lifted', () => {
    // Otherwise a stroke ends early, at the last point that cleared the
    // threshold, and a deliberate flick gets clipped.
    const points = [point(0, 0), point(0.5, 0), point(0.5001, 0)];
    expect(simplifyStroke(points).at(-1)).toEqual(point(0.5001, 0));
  });

  it('leaves a short stroke alone', () => {
    expect(simplifyStroke([point(0, 0)])).toHaveLength(1);
    expect(simplifyStroke([])).toEqual([]);
    expect(simplifyStroke(null)).toEqual([]);
  });
});

describe('the size cap', () => {
  const many = () => Array.from({ length: 400 }, () => line(20));

  it('drops whole strokes rather than trimming one in half', () => {
    // Half a line looks like a bug; a missing line just looks like you stopped.
    const fitted = fitWithinLimit(many());
    expect(encodeStrokes(fitted).length).toBeLessThanOrEqual(DOODLE_MAX_CHARS);
    fitted.forEach((stroke) => expect(stroke).toHaveLength(20));
  });

  it('keeps as much as it can, earliest first', () => {
    const fitted = fitWithinLimit(many());
    expect(fitted.length).toBeGreaterThan(0);
    expect(fitted.length).toBeLessThan(400);
  });

  it('leaves a drawing under the cap untouched', () => {
    const small = [line(10)];
    expect(fitWithinLimit(small)).toBe(small);
  });

  it('accepts a stroke that fits, and says so', () => {
    const result = appendStroke([line(10)], line(10));
    expect(result.accepted).toBe(true);
    expect(result.strokes).toHaveLength(2);
  });

  it('refuses one that does not, and leaves the drawing untouched', () => {
    // Asking "is it full?" beforehand cannot be answered honestly — a stroke is
    // anywhere from eight characters to several hundred. Reporting after the
    // fact is accurate, and puts the notice at the moment something was really
    // refused rather than on a guess.
    const packed = fitWithinLimit(many());
    const result = appendStroke(packed, line(200));

    expect(result.accepted).toBe(false);
    expect(result.strokes).toBe(packed);
  });

  it('treats an empty stroke as harmlessly accepted', () => {
    const strokes = [line(10)];
    expect(appendStroke(strokes, []).strokes).toBe(strokes);
    expect(appendStroke(strokes, null).accepted).toBe(true);
  });
});

describe('dots', () => {
  it('recognises a tap as a mark of its own', () => {
    expect(isDot([point(0.5, 0.5)])).toBe(true);
    expect(isDot([point(0, 0), point(1, 1)])).toBe(false);
    expect(isDot([])).toBe(false);
  });

  it('survives a round trip', () => {
    expect(isDot(decodeStrokes(encodeStrokes([[point(0.5, 0.5)]]))[0])).toBe(true);
  });
});

describe('svg output', () => {
  it('moves then lines', () => {
    const d = strokesToSvgPath([[point(0, 0), point(1, 1)]]);
    expect(d).toBe('M0 0L1000 1000');
  });

  it('gives a dot a zero-length line so a round cap paints it', () => {
    // Without this a tap renders as nothing at all.
    expect(strokesToSvgPath([[point(0.5, 0.5)]])).toBe('M500 500l0 0');
  });

  it('concatenates strokes into one path', () => {
    const d = strokesToSvgPath([[point(0, 0), point(0.5, 0.5)], [point(1, 1)]]);
    expect(d).toContain('M0 0L500 500');
    expect(d).toContain('M1000 1000');
  });

  it('is empty for an empty drawing', () => {
    expect(strokesToSvgPath([])).toBe('');
  });
});

describe('canvas output', () => {
  const fakeCtx = () => ({
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn()
  });

  const rect = { x: 100, y: 200, width: 400, height: 300, color: '#f00', lineWidth: 4 };

  it('places a stroke inside the given rectangle', () => {
    const ctx = fakeCtx();
    drawStrokes(ctx, [[point(0, 0), point(1, 1)]], rect);

    expect(ctx.moveTo).toHaveBeenCalledWith(100, 200);
    expect(ctx.lineTo).toHaveBeenCalledWith(500, 500);
  });

  it('paints a dot as a filled circle, not a line', () => {
    const ctx = fakeCtx();
    drawStrokes(ctx, [[point(0.5, 0.5)]], rect);

    expect(ctx.arc).toHaveBeenCalledWith(300, 350, 2, 0, Math.PI * 2);
    expect(ctx.fill).toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it('restores the context it was handed', () => {
    // The collage draws a great deal after this; leaking a strokeStyle would
    // silently recolour whatever came next.
    const ctx = fakeCtx();
    drawStrokes(ctx, [[point(0, 0), point(1, 1)]], rect);
    expect(ctx.save).toHaveBeenCalled();
    expect(ctx.restore).toHaveBeenCalled();
  });

  it('touches nothing for an empty drawing', () => {
    const ctx = fakeCtx();
    drawStrokes(ctx, [], rect);
    expect(ctx.save).not.toHaveBeenCalled();
  });
});

describe('stroke width', () => {
  it('scales with the photo, so it reads as the same pen at any size', () => {
    expect(strokeWidthFor(1000)).toBeCloseTo(11);
    expect(strokeWidthFor(100)).toBeCloseTo(1.1);
  });

  it('never disappears entirely on a tiny thumbnail', () => {
    expect(strokeWidthFor(10)).toBeGreaterThanOrEqual(1);
    expect(strokeWidthFor(0)).toBeGreaterThanOrEqual(1);
  });
});
