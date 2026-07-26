import { describe, expect, it, vi } from 'vitest';
import {
  decodeStickers,
  drawStickers,
  encodeStickers,
  MAX_STICKERS,
  movePlacement,
  placementRect,
  placementSvgTransform,
  rotatePlacement,
  scalePlacement,
  stickerAt,
  stickerById,
  STICKER_MAX_SCALE,
  STICKER_MIN_SCALE,
  STICKERS
} from './stickers.js';

const place = (extra = {}) => ({ id: 'heart', x: 0.5, y: 0.5, scale: 0.2, rotation: 0, ...extra });
const RECT = { x: 0, y: 0, width: 400, height: 300 };

describe('the sheet', () => {
  it('offers a handful of things worth sticking on a photo', () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(6);
  });

  it('gives every sticker a unique id', () => {
    // The id is what travels to the other side.
    const ids = STICKERS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every sticker a path and a colour', () => {
    STICKERS.forEach((sticker) => {
      expect(sticker.d.startsWith('M')).toBe(true);
      expect(sticker.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(sticker.label.length).toBeGreaterThan(0);
    });
  });

  it('finds one by id, and nothing for a stranger', () => {
    expect(stickerById('heart').label).toBe('Heart');
    expect(stickerById('banana')).toBeNull();
    expect(stickerById(undefined)).toBeNull();
  });
});

describe('encoding', () => {
  it('round-trips a placement', () => {
    const back = decodeStickers(encodeStickers([place({ x: 0.25, y: 0.75, rotation: -30 })]));

    expect(back).toHaveLength(1);
    expect(back[0].x).toBeCloseTo(0.25, 3);
    expect(back[0].y).toBeCloseTo(0.75, 3);
    expect(back[0].rotation).toBe(-30);
  });

  it('is compact — a full sheet is a short string', () => {
    const full = Array.from({ length: MAX_STICKERS }, () => place());
    expect(encodeStickers(full).length).toBeLessThan(400);
  });

  it('refuses to store more than the sheet allows', () => {
    const tooMany = Array.from({ length: 40 }, () => place());
    expect(decodeStickers(encodeStickers(tooMany))).toHaveLength(MAX_STICKERS);
  });

  it('drops a sticker this version does not know', () => {
    // A photo decorated by a newer build should degrade, not draw a gap.
    expect(decodeStickers('banana,500,500,180,0|heart,100,100,180,0')).toHaveLength(1);
  });

  it('drops a placement it cannot read the numbers of', () => {
    expect(decodeStickers('heart,abc,500,180,0')).toEqual([]);
  });

  it('survives junk entirely', () => {
    expect(decodeStickers('nonsense')).toEqual([]);
    expect(decodeStickers('')).toEqual([]);
    expect(decodeStickers(null)).toEqual([]);
    expect(encodeStickers(null)).toBe('');
  });

  it('clamps a placement that strayed off the photo', () => {
    const back = decodeStickers(encodeStickers([place({ x: -2, y: 5 })]));
    expect(back[0].x).toBe(0);
    expect(back[0].y).toBe(1);
  });

  it('clamps an absurd size at both ends', () => {
    expect(decodeStickers(encodeStickers([place({ scale: 40 })]))[0].scale).toBeCloseTo(
      STICKER_MAX_SCALE
    );
    expect(decodeStickers(encodeStickers([place({ scale: 0.0001 })]))[0].scale).toBeCloseTo(
      STICKER_MIN_SCALE
    );
  });

  it('defaults a missing size and angle rather than writing NaN', () => {
    const back = decodeStickers(encodeStickers([{ id: 'star', x: 0.5, y: 0.5 }]));
    expect(Number.isFinite(back[0].scale)).toBe(true);
    expect(back[0].rotation).toBe(0);
  });
});

describe('geometry', () => {
  it('places a sticker by its centre', () => {
    const { cx, cy } = placementRect(place({ x: 0.5, y: 0.5 }), RECT);
    expect(cx).toBe(200);
    expect(cy).toBe(150);
  });

  it('sizes a sticker from the width alone', () => {
    // Keying it to the smaller dimension would make the same sticker shrink on
    // a landscape photo and grow on a portrait one.
    const wide = placementRect(place({ scale: 0.25 }), { x: 0, y: 0, width: 400, height: 300 });
    const tall = placementRect(place({ scale: 0.25 }), { x: 0, y: 0, width: 400, height: 900 });
    expect(wide.size).toBe(tall.size);
  });

  it('respects the rectangle it is drawn into', () => {
    const { cx, cy } = placementRect(place({ x: 0, y: 0 }), { x: 50, y: 80, width: 100, height: 100 });
    expect(cx).toBe(50);
    expect(cy).toBe(80);
  });
});

describe('picking one up', () => {
  const sheet = [
    place({ id: 'heart', x: 0.25, y: 0.5 }),
    place({ id: 'star', x: 0.75, y: 0.5 })
  ];

  it('finds the sticker under the finger', () => {
    expect(stickerAt(sheet, { x: 100, y: 150 }, RECT)).toBe(0);
    expect(stickerAt(sheet, { x: 300, y: 150 }, RECT)).toBe(1);
  });

  it('finds nothing on bare photo', () => {
    expect(stickerAt(sheet, { x: 200, y: 20 }, RECT)).toBeNull();
    expect(stickerAt([], { x: 100, y: 150 }, RECT)).toBeNull();
  });

  it('picks the topmost when two overlap', () => {
    // The one you can see is the one you meant.
    const stacked = [place({ id: 'heart' }), place({ id: 'star' })];
    expect(stickerAt(stacked, { x: 200, y: 150 }, RECT)).toBe(1);
  });
});

describe('moving, scaling and turning', () => {
  it('keeps a moved sticker on the photo', () => {
    // A centre off the edge would store a placement that renders as nothing.
    expect(movePlacement(place(), { x: 5, y: -5 })).toMatchObject({ x: 1, y: 0 });
  });

  it('clamps a size at both ends', () => {
    expect(scalePlacement(place(), 99).scale).toBe(STICKER_MAX_SCALE);
    expect(scalePlacement(place(), 0).scale).toBe(STICKER_MIN_SCALE);
  });

  it('wraps rotation instead of jamming at the ends', () => {
    // Rotation is a circle; stopping dead at 180° feels broken.
    expect(rotatePlacement(place(), 190).rotation).toBe(-170);
    expect(rotatePlacement(place(), -190).rotation).toBe(170);
    expect(rotatePlacement(place(), 45).rotation).toBe(45);
  });

  it('leaves everything else about the placement alone', () => {
    const moved = movePlacement(place({ id: 'bow', rotation: 30 }), { x: 0.1, y: 0.1 });
    expect(moved.id).toBe('bow');
    expect(moved.rotation).toBe(30);
  });
});

describe('svg transform', () => {
  it('centres the path on the placement', () => {
    // The path is drawn in a 100×100 box from its corner, so it has to be
    // shifted by half before it lands where it was placed.
    const t = placementSvgTransform(place({ x: 0.5, y: 0.5, scale: 0.25 }), RECT);
    expect(t).toContain('translate(200 150)');
    expect(t).toContain('translate(-50 -50)');
  });

  it('carries the rotation', () => {
    expect(placementSvgTransform(place({ rotation: -12 }), RECT)).toContain('rotate(-12)');
  });

  it('rounds, so the markup does not carry seventeen decimals', () => {
    const t = placementSvgTransform(place({ x: 1 / 3 }), RECT);
    expect(t).not.toMatch(/\d\.\d{5}/);
  });
});

describe('canvas rendering', () => {
  const fakeCtx = () => ({
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    fill: vi.fn()
  });

  class FakePath {
    constructor(d) {
      this.d = d;
    }
  }

  it('draws each placement', () => {
    const ctx = fakeCtx();
    expect(drawStickers(ctx, [place(), place({ id: 'star' })], RECT, { PathCtor: FakePath })).toBe(2);
    expect(ctx.fill).toHaveBeenCalledTimes(2);
  });

  it('restores the context around every sticker', () => {
    // The collage draws a great deal after this; a leaked transform would
    // silently displace everything that followed.
    const ctx = fakeCtx();
    drawStickers(ctx, [place(), place()], RECT, { PathCtor: FakePath });
    expect(ctx.save).toHaveBeenCalledTimes(2);
    expect(ctx.restore).toHaveBeenCalledTimes(2);
  });

  it('skips a sticker it does not recognise', () => {
    const ctx = fakeCtx();
    expect(drawStickers(ctx, [place({ id: 'banana' })], RECT, { PathCtor: FakePath })).toBe(0);
  });

  it('does nothing where Path2D does not exist', () => {
    // Rather than throwing and taking the whole collage down with it.
    const ctx = fakeCtx();
    expect(drawStickers(ctx, [place()], RECT, { PathCtor: null })).toBe(0);
  });

  it('does nothing for an empty sheet', () => {
    const ctx = fakeCtx();
    drawStickers(ctx, [], RECT, { PathCtor: FakePath });
    expect(ctx.save).not.toHaveBeenCalled();
  });
});
