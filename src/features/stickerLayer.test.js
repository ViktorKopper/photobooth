// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeStickers, MAX_STICKERS, STICKER_MAX_SCALE } from '../stickers.js';
import {
  addSticker,
  buildStickerSheet,
  clearStickers,
  currentPlacements,
  dragSelected,
  encodeCurrentStickers,
  endDrag,
  removeSelected,
  resetStickerLayer,
  selectedIndex,
  selectStickerAt,
  setSelectedRotation,
  setSelectedScale,
  stickerCount,
  stickerLayerMarkup
} from './stickerLayer.js';

const RECT = { width: 400, height: 400 };
let notified;

const dom = (html) => {
  const host = document.createElement('div');
  host.innerHTML = html;
  return host;
};

beforeEach(() => {
  document.body.innerHTML = '';
  notified = vi.fn();
  resetStickerLayer('', notified);
});

describe('the sheet markup', () => {
  it('offers one button per sticker', () => {
    const sheet = dom(buildStickerSheet());
    expect(sheet.querySelectorAll('[data-sticker]').length).toBeGreaterThanOrEqual(6);
  });

  it('shows each one rather than naming it', () => {
    const first = dom(buildStickerSheet()).querySelector('[data-sticker]');
    expect(first.querySelector('svg path')).not.toBeNull();
    expect(first.getAttribute('aria-label')).toMatch(/^Add /);
  });

  it('starts with its controls hidden — nothing is selected yet', () => {
    const sheet = dom(buildStickerSheet());
    expect(sheet.querySelector('#stickerControls').classList.contains('hidden')).toBe(true);
  });
});

describe('adding', () => {
  it('puts a sticker on the photo and selects it', () => {
    addSticker('heart');
    expect(stickerCount()).toBe(1);
    expect(selectedIndex()).toBe(0);
  });

  it('offsets and tilts repeats, so two of the same do not look like one', () => {
    addSticker('heart');
    addSticker('heart');

    const [first, second] = currentPlacements();
    expect(second.x).not.toBe(first.x);
    expect(second.rotation).not.toBe(first.rotation);
  });

  it('refuses a sticker it does not know', () => {
    addSticker('banana');
    expect(stickerCount()).toBe(0);
  });

  it('stops at a full sheet', () => {
    for (let i = 0; i < MAX_STICKERS + 5; i += 1) addSticker('star');
    expect(stickerCount()).toBe(MAX_STICKERS);
  });

  it('announces the change so the layer repaints', () => {
    addSticker('heart');
    expect(notified).toHaveBeenCalled();
  });
});

describe('picking up and moving', () => {
  beforeEach(() => {
    resetStickerLayer('heart,500,500,200,0', notified);
  });

  it('selects the sticker under the pointer', () => {
    expect(selectStickerAt({ x: 200, y: 200 }, RECT)).toBe(0);
    expect(selectedIndex()).toBe(0);
  });

  it('deselects when the bare photo is pressed', () => {
    expect(selectStickerAt({ x: 10, y: 10 }, RECT)).toBeNull();
    expect(selectedIndex()).toBeNull();
  });

  it('drags without the sticker jumping its own centre under the finger', () => {
    // Picked up off-centre, it should stay off-centre by the same amount.
    selectStickerAt({ x: 190, y: 190 }, RECT);
    dragSelected({ x: 290, y: 290 }, RECT);

    const [placement] = currentPlacements();
    expect(placement.x).toBeCloseTo(0.75, 2);
    expect(placement.y).toBeCloseTo(0.75, 2);
  });

  it('keeps a dragged sticker on the photo', () => {
    selectStickerAt({ x: 200, y: 200 }, RECT);
    dragSelected({ x: 9999, y: -9999 }, RECT);

    const [placement] = currentPlacements();
    expect(placement.x).toBe(1);
    expect(placement.y).toBe(0);
  });

  it('ignores a drag with nothing selected', () => {
    selectStickerAt({ x: 10, y: 10 }, RECT);
    dragSelected({ x: 300, y: 300 }, RECT);
    expect(currentPlacements()[0].x).toBeCloseTo(0.5, 2);
  });

  it('stops dragging when the pointer lifts', () => {
    selectStickerAt({ x: 200, y: 200 }, RECT);
    endDrag();
    dragSelected({ x: 380, y: 380 }, RECT);
    expect(currentPlacements()[0].x).toBeCloseTo(0.5, 2);
  });
});

describe('size and angle', () => {
  beforeEach(() => {
    resetStickerLayer('heart,500,500,200,0', notified);
    selectStickerAt({ x: 200, y: 200 }, RECT);
  });

  it('resizes the selected sticker', () => {
    setSelectedScale(30);
    expect(currentPlacements()[0].scale).toBeCloseTo(0.3, 2);
  });

  it('clamps an absurd size', () => {
    setSelectedScale(500);
    expect(currentPlacements()[0].scale).toBeCloseTo(STICKER_MAX_SCALE);
  });

  it('turns the selected sticker', () => {
    setSelectedRotation(-45);
    expect(currentPlacements()[0].rotation).toBe(-45);
  });

  it('does nothing with nothing selected', () => {
    selectStickerAt({ x: 5, y: 5 }, RECT);
    setSelectedScale(40);
    expect(currentPlacements()[0].scale).toBeCloseTo(0.2, 2);
  });
});

describe('removing', () => {
  it('takes the selected one off', () => {
    addSticker('heart');
    addSticker('star');
    removeSelected();

    expect(stickerCount()).toBe(1);
    expect(currentPlacements()[0].id).toBe('heart');
  });

  it('leaves nothing selected afterwards', () => {
    addSticker('heart');
    removeSelected();
    expect(selectedIndex()).toBeNull();
  });

  it('clears the lot', () => {
    addSticker('heart');
    addSticker('star');
    clearStickers();
    expect(stickerCount()).toBe(0);
  });
});

describe('saving and loading', () => {
  it('round-trips through the encoded form', () => {
    addSticker('heart');
    addSticker('bow');

    const encoded = encodeCurrentStickers();
    resetStickerLayer(encoded, notified);

    expect(currentPlacements().map((p) => p.id)).toEqual(['heart', 'bow']);
  });

  it('loads with nothing selected', () => {
    resetStickerLayer('heart,500,500,200,0', notified);
    expect(selectedIndex()).toBeNull();
  });

  it('survives a corrupt placement string', () => {
    resetStickerLayer('junk', notified);
    expect(stickerCount()).toBe(0);
  });
});

describe('the drawn layer', () => {
  it('renders one group per sticker', () => {
    addSticker('heart');
    addSticker('star');
    expect(dom(`<svg>${stickerLayerMarkup()}</svg>`).querySelectorAll('g')).toHaveLength(2);
  });

  it('marks the selected one', () => {
    addSticker('heart');
    const layer = dom(`<svg>${stickerLayerMarkup()}</svg>`);
    expect(layer.querySelectorAll('.sticker-placed.selected')).toHaveLength(1);
  });

  it('carries a transform rather than absolute positions', () => {
    // The same transform the collage renders through, so the two cannot drift.
    addSticker('heart');
    const group = dom(`<svg>${stickerLayerMarkup()}</svg>`).querySelector('g');
    expect(group.getAttribute('transform')).toMatch(/translate\(.*\) rotate\(.*\) scale\(/);
  });

  it('is empty when nothing has been placed', () => {
    expect(stickerLayerMarkup()).toBe('');
  });

  it('stays within what the rules will accept', () => {
    for (let i = 0; i < MAX_STICKERS; i += 1) addSticker('sparkle');
    expect(encodeCurrentStickers().length).toBeLessThanOrEqual(600);
    expect(decodeStickers(encodeCurrentStickers())).toHaveLength(MAX_STICKERS);
  });
});
