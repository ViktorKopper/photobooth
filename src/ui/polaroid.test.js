// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { developCollage } from './polaroid.js';

let reduced = false;
vi.mock('./motion.js', () => ({ prefersReducedMotion: () => reduced }));

const RESULT = { blob: new Blob(['png']), previewUrl: 'blob:collage' };

let host;

// The real animations never fire in happy-dom, so every step is driven by hand.
// The timeout ceiling inside developCollage is what actually carries it here,
// which is worth knowing: it is the same fallback a backgrounded tab relies on.
const flush = (ms) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  reduced = false;
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="stage"></div>';
  host = document.querySelector('#stage');
});

describe('the whole beat', () => {
  it('hands back what the render produced', async () => {
    const promise = developCollage(host, async () => RESULT);
    await flush(6000);
    await expect(promise).resolves.toBe(RESULT);
  });

  it('shows the camera before the render has finished', async () => {
    let release;
    const promise = developCollage(host, () => new Promise((resolve) => (release = resolve)));

    await Promise.resolve();
    // The point of the whole thing: the wait happens behind something worth
    // watching, rather than after it.
    expect(host.querySelector('.polaroid-camera')).not.toBeNull();

    release(RESULT);
    await flush(6000);
    await promise;
  });

  it('leaves the print hanging half out while the render runs long', async () => {
    let release;
    const promise = developCollage(host, () => new Promise((resolve) => (release = resolve)));

    await flush(3000);
    // No print yet — there is nothing to put on the paper.
    expect(host.querySelector('.polaroid-print')).toBeNull();
    expect(host.querySelector('.polaroid-camera')).not.toBeNull();

    release(RESULT);
    await flush(6000);
    await promise;
  });

  it('slides the print out, then develops it', async () => {
    const promise = developCollage(host, async () => RESULT);

    await Promise.resolve();
    await Promise.resolve();
    await flush(0);

    const print = host.querySelector('.polaroid-print');
    expect(print.classList.contains('sliding')).toBe(true);

    await flush(2000);
    expect(host.querySelector('.polaroid-print').classList.contains('developing')).toBe(true);

    await flush(4000);
    await promise;
  });

  it('puts the rendered image on the paper', async () => {
    const promise = developCollage(host, async () => RESULT, { alt: 'Our collage' });
    await flush(6000);
    await promise;

    const img = host.querySelector('.polaroid-print img');
    expect(img.getAttribute('src')).toBe('blob:collage');
    expect(img.getAttribute('alt')).toBe('Our collage');
  });

  it('finishes even where animationend never fires', async () => {
    // A backgrounded tab fires no animation events at all; without the ceiling
    // the print would be left stuck inside the camera forever.
    const promise = developCollage(host, async () => RESULT);
    await flush(6000);
    await expect(promise).resolves.toBe(RESULT);
  });
});

describe('when the render fails', () => {
  it('rethrows, so the caller can show its own error', async () => {
    const boom = new Error('canvas gave up');
    const promise = developCollage(host, async () => {
      throw boom;
    });

    await flush(100);
    await expect(promise).rejects.toBe(boom);
  });

  it('clears the camera away rather than leaving it there', async () => {
    // An error toast over a camera about to produce nothing reads as a stall.
    const promise = developCollage(host, async () => {
      throw new Error('nope');
    }).catch(() => undefined);

    await flush(100);
    await promise;
    expect(host.querySelector('.polaroid-camera')).toBeNull();
  });
});

describe('reduced motion', () => {
  it('skips the performance entirely', async () => {
    // It is a flourish and nothing else, so there is nothing to substitute.
    reduced = true;
    const render = vi.fn(async () => RESULT);

    await expect(developCollage(host, render)).resolves.toBe(RESULT);
    expect(render).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.polaroid-camera')).toBeNull();
  });
});

describe('without a stage', () => {
  it('still renders', async () => {
    // The collage matters; the animation does not.
    const render = vi.fn(async () => RESULT);
    await expect(developCollage(null, render)).resolves.toBe(RESULT);
    expect(render).toHaveBeenCalled();
  });
});
