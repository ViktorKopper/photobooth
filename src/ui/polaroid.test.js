// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { developCollage } from './polaroid.js';

let reduced = false;
vi.mock('./motion.js', () => ({ prefersReducedMotion: () => reduced }));

const RESULT = { blob: new Blob(['png']), previewUrl: 'blob:collage' };

// The real animations never fire in happy-dom, so every step is driven by hand.
// The timeout ceiling inside developCollage is what actually carries it here,
// which is worth knowing: it is the same fallback a backgrounded tab relies on.
const flush = (ms) => vi.advanceTimersByTimeAsync(ms);

const overlay = () => document.querySelector('.develop-overlay');
const camera = () => document.querySelector('.pc-camera');

beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  document.body.innerHTML = '';
  document.body.style.overflow = '';
});

describe('the whole beat', () => {
  it('hands back what the render produced', async () => {
    const promise = developCollage(async () => RESULT);
    await flush(6000);
    await expect(promise).resolves.toBe(RESULT);
  });

  it('shows the camera before the render has finished', async () => {
    let release;
    const promise = developCollage(() => new Promise((resolve) => (release = resolve)));

    await Promise.resolve();
    // The point of the whole thing: the wait happens behind something worth
    // watching, rather than after it.
    expect(camera()).not.toBeNull();

    release(RESULT);
    await flush(6000);
    await promise;
  });

  it('holds on the camera while the render runs long', async () => {
    let release;
    const promise = developCollage(() => new Promise((resolve) => (release = resolve)));

    await flush(3000);
    // The print exists but has not started moving — there is nothing on the
    // paper yet to slide out.
    expect(camera()).not.toBeNull();
    expect(document.querySelector('.develop-print').classList.contains('sliding')).toBe(false);

    release(RESULT);
    await flush(8000);
    await promise;
  });

  it('blurs the page behind it rather than sitting in a card', async () => {
    const promise = developCollage(async () => RESULT);
    await Promise.resolve();

    expect(overlay()).not.toBeNull();
    expect(overlay().getAttribute('role')).toBe('dialog');
    // Locked while it is up, so a stray swipe cannot scroll the booth behind.
    expect(document.body.style.overflow).toBe('hidden');

    await flush(8000);
    await promise;
  });

  it('gives the page its scrolling back afterwards', async () => {
    const promise = developCollage(async () => RESULT);
    await flush(8000);
    await promise;

    expect(document.body.style.overflow).toBe('');
  });

  it('can be skipped', async () => {
    const promise = developCollage(async () => RESULT);
    await flush(100);

    document.querySelector('#developSkip').click();
    await flush(500);

    await expect(promise).resolves.toBe(RESULT);
  });

  it('can be dismissed with Escape', async () => {
    const promise = developCollage(async () => RESULT);
    await flush(100);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush(500);

    await expect(promise).resolves.toBe(RESULT);
  });

  it('slides the print out, then develops it', async () => {
    const promise = developCollage(async () => RESULT);

    await Promise.resolve();
    await Promise.resolve();
    await flush(0);

    const print = document.querySelector('.develop-print');
    expect(print.classList.contains('sliding')).toBe(true);

    await flush(2000);
    expect(document.querySelector('.develop-print').classList.contains('developing')).toBe(true);

    await flush(4000);
    await promise;
  });

  it('puts the rendered image on the paper', async () => {
    const promise = developCollage(async () => RESULT, { alt: 'Our collage' });

    // Checked while it is still on screen: the overlay removes itself once the
    // beat is over, so asserting after the promise resolves finds nothing.
    await flush(2000);
    const img = document.querySelector('.develop-print img');
    expect(img.getAttribute('src')).toBe('blob:collage');
    expect(img.getAttribute('alt')).toBe('Our collage');

    await flush(8000);
    await promise;
  });

  it('finishes even where animationend never fires', async () => {
    // A backgrounded tab fires no animation events at all; without the ceiling
    // the print would be left stuck inside the camera forever.
    const promise = developCollage(async () => RESULT);
    await flush(6000);
    await expect(promise).resolves.toBe(RESULT);
  });
});

describe('when the render fails', () => {
  it('rethrows, so the caller can show its own error', async () => {
    const boom = new Error('canvas gave up');
    const promise = developCollage(async () => {
      throw boom;
    });

    // The assertion is attached before the timers are advanced, not after.
    // Awaiting flush() first leaves the rejection unhandled for that window,
    // which Vitest reports as an unhandled error — every test still passes and
    // the run still fails, which is exactly how this got past me locally.
    const rejects = expect(promise).rejects.toBe(boom);
    await flush(100);
    await rejects;
  });

  it('clears the overlay away rather than leaving it there', async () => {
    // An error toast behind a blurred camera about to produce nothing reads as
    // a stall, not a failure.
    const promise = developCollage(async () => {
      throw new Error('nope');
    }).catch(() => undefined);

    await flush(100);
    await promise;

    expect(overlay()).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });
});

describe('reduced motion', () => {
  it('skips the performance entirely', async () => {
    // It is a flourish and nothing else, so there is nothing to substitute.
    reduced = true;
    const render = vi.fn(async () => RESULT);

    await expect(developCollage(render)).resolves.toBe(RESULT);
    expect(render).toHaveBeenCalledTimes(1);
    expect(camera()).toBeNull();
  });
});

describe('cleanup', () => {
  it('takes the overlay off the page when it is done', async () => {
    const promise = developCollage(async () => RESULT);
    await flush(8000);
    await promise;
    await flush(600);

    expect(overlay()).toBeNull();
  });
});
