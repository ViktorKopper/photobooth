import { describe, expect, it } from 'vitest';
import { bakeOpsIntoImageData, cssFromOps, FILTERS, findFilter } from './filters.js';

// A filter is only correct if the baked pixels match what the live preview
// promised — this is the pairing that silently broke once before, when the
// preview was filtered and the saved photo wasn't.
const bake = (rgb, ops) => {
  const data = new Uint8ClampedArray([...rgb, 255]);
  bakeOpsIntoImageData({ data }, ops);
  return [data[0], data[1], data[2]];
};

describe('filter presets', () => {
  it('exposes a preview string and bakeable ops for each', () => {
    FILTERS.forEach((filter) => {
      expect(filter.id).toBeTruthy();
      expect(filter.label).toBeTruthy();
      expect(Array.isArray(filter.ops)).toBe(true);
      expect(typeof cssFromOps(filter.ops)).toBe('string');
    });
  });

  it('falls back to Original for an unknown id', () => {
    expect(findFilter('nope').id).toBe('none');
    expect(findFilter(undefined).id).toBe('none');
  });
});

describe('cssFromOps', () => {
  it('renders the shorthand the live preview uses', () => {
    expect(cssFromOps(findFilter('bw').ops)).toBe('grayscale(1) contrast(1.1)');
    expect(cssFromOps(findFilter('cool').ops)).toBe('hue-rotate(-8deg) saturate(1.15) brightness(1.02)');
  });

  it('is "none" when there is nothing to apply', () => {
    expect(cssFromOps([])).toBe('none');
    expect(cssFromOps(null)).toBe('none');
  });
});

describe('bakeOpsIntoImageData', () => {
  it('leaves pixels untouched for Original', () => {
    expect(bake([200, 50, 50], findFilter('none').ops)).toEqual([200, 50, 50]);
  });

  it('drains colour for Mono', () => {
    const [r, g, b] = bake([200, 50, 50], findFilter('bw').ops);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('warms an image towards red for Warm', () => {
    const [r, , b] = bake([120, 120, 120], findFilter('warm').ops);
    expect(r).toBeGreaterThan(b);
  });

  it('leaves Warm visibly warmer than Cool on the same pixel', () => {
    // Compared as a pair rather than in absolute terms, and on a coloured
    // pixel rather than a grey one: hue rotation has nothing to act on in
    // a neutral tone, so a grey sample would prove nothing either way.
    const skin = [190, 150, 130];
    const [warmR, , warmB] = bake(skin, findFilter('warm').ops);
    const [coolR, , coolB] = bake(skin, findFilter('cool').ops);

    expect(warmR - warmB).toBeGreaterThan(coolR - coolB);
  });

  it('actually shifts hue for Cool rather than passing the pixel through', () => {
    const skin = [190, 150, 130];
    expect(bake(skin, findFilter('cool').ops)).not.toEqual(skin);
  });

  it('never leaves a channel outside 0-255', () => {
    [[255, 255, 255], [0, 0, 0], [255, 0, 0]].forEach((rgb) => {
      FILTERS.forEach((filter) => {
        bake(rgb, filter.ops).forEach((channel) => {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        });
      });
    });
  });

  it('preserves neutral grey under grayscale', () => {
    expect(bake([128, 128, 128], [{ type: 'grayscale', amount: 1 }])).toEqual([128, 128, 128]);
  });

  it('is a no-op for an empty op list', () => {
    expect(bake([10, 20, 30], [])).toEqual([10, 20, 30]);
    expect(bake([10, 20, 30], null)).toEqual([10, 20, 30]);
  });

  it('leaves the alpha channel alone', () => {
    const data = new Uint8ClampedArray([200, 50, 50, 128]);
    bakeOpsIntoImageData({ data }, findFilter('vintage').ops);
    expect(data[3]).toBe(128);
  });
});
