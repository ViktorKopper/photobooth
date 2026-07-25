// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countUp, prefersReducedMotion, restartAnimation } from './motion.js';

// happy-dom has no matchMedia, and the app must survive that as well as an
// explicit "reduce motion" preference.
function stubMatchMedia(matches) {
  window.matchMedia = vi.fn(() => ({ matches }));
}

beforeEach(() => {
  document.body.innerHTML = '';
  delete window.matchMedia;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('prefersReducedMotion', () => {
  it('reads the media query', () => {
    stubMatchMedia(true);
    expect(prefersReducedMotion()).toBe(true);
    stubMatchMedia(false);
    expect(prefersReducedMotion()).toBe(false);
  });

  it('assumes motion is fine when the browser cannot answer', () => {
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('countUp', () => {
  const el = () => {
    const node = document.createElement('p');
    document.body.appendChild(node);
    return node;
  };

  it('jumps straight to the final value when motion is reduced', () => {
    stubMatchMedia(true);
    const node = el();
    countUp(node, 193, { format: (v) => `${v} days` });
    expect(node.textContent).toBe('193 days');
  });

  it('renders markup, so a label can carry an inline icon', () => {
    stubMatchMedia(true);
    const node = el();
    countUp(node, 5, { format: (v) => `<b>${v}</b> days` });
    expect(node.querySelector('b')).not.toBeNull();
  });

  it('animates up to the final value and stops there', async () => {
    stubMatchMedia(false);
    const node = el();

    countUp(node, 100, { duration: 40, format: (v) => String(v) });
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(node.textContent).toBe('100');
  });

  it('never overshoots the target on the way', async () => {
    stubMatchMedia(false);
    const node = el();
    const seen = [];

    countUp(node, 50, {
      duration: 40,
      format: (v) => {
        seen.push(v);
        return String(v);
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 160));

    expect(Math.max(...seen)).toBe(50);
    expect(Math.min(...seen)).toBeGreaterThanOrEqual(0);
  });

  it('does nothing without an element, and shows a non-number as-is', () => {
    stubMatchMedia(false);
    expect(() => countUp(null, 10)).not.toThrow();

    const node = el();
    countUp(node, NaN, { format: () => 'unknown' });
    expect(node.textContent).toBe('unknown');
  });
});

describe('restartAnimation', () => {
  it('clears and restores the inline animation so a keyframe can replay', () => {
    const node = document.createElement('div');
    document.body.appendChild(node);
    node.style.animation = 'popIn 1s';

    restartAnimation(node);

    // Ends back where it started, having been blanked in between — which is
    // what forces the browser to run the keyframes again.
    expect(node.style.animation).toBe('');
  });

  it('tolerates a missing element', () => {
    expect(() => restartAnimation(null)).not.toThrow();
  });
});
