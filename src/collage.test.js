// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import {
  COLLAGE_THEMES,
  EXPORT_PRESETS,
  findExportPreset,
  findTheme,
  fitOntoAspect,
  targetSizeFor,
  photoCacheKey,
  splitPhotosByOwner
} from './collage.js';

const photo = (owner, index, extra = {}) => ({
  owner,
  index,
  downloadUrl: `https://example.test/${owner}-${index}.jpg`,
  caption: '',
  ...extra
});

const fullSet = () => [
  photo('viktor', 2),
  photo('jericka', 3),
  photo('viktor', 1),
  photo('jericka', 1),
  photo('viktor', 3),
  photo('jericka', 2)
];

describe('themes', () => {
  it('every theme carries the full palette the drawing code reads', () => {
    // A theme missing one key wouldn't throw — it would silently paint
    // `undefined`, which canvas renders as transparent black.
    const required = Object.keys(COLLAGE_THEMES[0].palette).filter(
      (key) => !['ruled', 'confetti', 'titleFont'].includes(key)
    );

    COLLAGE_THEMES.forEach((theme) => {
      required.forEach((key) => {
        expect(theme.palette[key], `${theme.id}.${key}`).toBeDefined();
      });
    });
  });

  it('has unique ids and falls back safely', () => {
    const ids = COLLAGE_THEMES.map((theme) => theme.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(findTheme('nope').id).toBe('rose');
    expect(findTheme(undefined).id).toBe('rose');
  });

  it('only the notebook theme rules the page, and it drops the confetti', () => {
    const notebook = findTheme('notebook').palette;
    expect(notebook.ruled).toBe(true);
    expect(notebook.confetti).toBe(false);

    COLLAGE_THEMES.filter((theme) => theme.id !== 'notebook').forEach((theme) => {
      expect(theme.palette.ruled).toBeUndefined();
    });
  });

  it('only the mono theme drains colour from the photos', () => {
    COLLAGE_THEMES.forEach((theme) => {
      expect(Boolean(theme.palette.photoFilter)).toBe(theme.id === 'mono');
    });
  });
});

describe('export presets', () => {
  it('falls back to the original shape', () => {
    expect(findExportPreset('nope').id).toBe('original');
    expect(findExportPreset(undefined).aspect).toBeNull();
  });

  it('exposes a label and a usable aspect for each', () => {
    EXPORT_PRESETS.forEach((preset) => {
      expect(preset.label).toBeTruthy();
      if (preset.aspect !== null) expect(preset.aspect).toBeGreaterThan(0);
    });
  });
});

describe('targetSizeFor', () => {
  it('leaves the source alone when no shape is requested', () => {
    expect(targetSizeFor(1600, 2445, null)).toEqual({ width: 1600, height: 2445 });
  });

  // The real layout sizes, so the assertions mean something.
  const layouts = [
    ['grid', 1600, 2445],
    ['strip', 900, 3164],
    ['hero', 1600, 2050]
  ];

  it.each(layouts)('gives %s the exact requested ratio', (_name, width, height) => {
    EXPORT_PRESETS.filter((preset) => preset.aspect).forEach((preset) => {
      const out = targetSizeFor(width, height, preset.aspect);
      expect(out.width / out.height).toBeCloseTo(preset.aspect, 3);
    });
  });

  it.each(layouts)('never crops %s — the target always contains it', (_name, width, height) => {
    EXPORT_PRESETS.filter((preset) => preset.aspect).forEach((preset) => {
      const out = targetSizeFor(width, height, preset.aspect);
      expect(out.width).toBeGreaterThanOrEqual(width);
      expect(out.height).toBeGreaterThanOrEqual(height);
    });
  });

  it('grows the canvas rather than scaling the artwork down', () => {
    const out = targetSizeFor(1600, 2445, 1);
    expect(out.width).toBe(out.height);
    expect(out.height).toBeGreaterThanOrEqual(2445);
  });

  it('handles a landscape source too, where width drives the size', () => {
    const out = targetSizeFor(2000, 1000, 1);
    expect(out.width).toBe(out.height);
    expect(out.width).toBeGreaterThanOrEqual(2000);
  });

  it('always leaves a margin around the artwork', () => {
    const out = targetSizeFor(1600, 2445, 9 / 16);
    expect(out.height).toBeGreaterThan(2445);
  });
});

describe('fitOntoAspect', () => {
  it('returns the source untouched when no shape is requested', () => {
    const source = Object.assign(document.createElement('canvas'), { width: 1600, height: 2445 });
    expect(fitOntoAspect(source, null)).toBe(source);
  });
});

describe('splitPhotosByOwner', () => {
  it('sorts each side by slot regardless of arrival order', () => {
    const { viktor, jericka } = splitPhotosByOwner(fullSet());
    expect(viktor.map((p) => p.index)).toEqual([1, 2, 3]);
    expect(jericka.map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it('refuses to build a collage from an incomplete set', () => {
    const short = fullSet().filter((p) => !(p.owner === 'viktor' && p.index === 3));
    expect(() => splitPhotosByOwner(short)).toThrow(/exactly 3 photos/);
    expect(() => splitPhotosByOwner([])).toThrow();
  });
});

describe('photoCacheKey', () => {
  it('changes when a slot is retaken, even at the same URL', () => {
    // A retake overwrites the same storage path, so the URL alone would
    // happily serve the previous image back from cache.
    const before = photoCacheKey(photo('viktor', 1, { createdAt: { toMillis: () => 1000 } }));
    const after = photoCacheKey(photo('viktor', 1, { createdAt: { toMillis: () => 2000 } }));
    expect(before).not.toBe(after);
  });

  it('is stable for the same photo', () => {
    const stamp = { toMillis: () => 1000 };
    expect(photoCacheKey(photo('viktor', 1, { createdAt: stamp }))).toBe(
      photoCacheKey(photo('viktor', 1, { createdAt: stamp }))
    );
  });

  it('copes with a timestamp that has not resolved yet', () => {
    expect(() => photoCacheKey(photo('viktor', 1))).not.toThrow();
    expect(photoCacheKey(photo('viktor', 1))).toContain('viktor-1.jpg');
  });
});
