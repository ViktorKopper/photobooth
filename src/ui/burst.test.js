// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { burstHearts, clearBursts } from './burst.js';

let reduced = false;
vi.mock('./motion.js', () => ({ prefersReducedMotion: () => reduced }));

const hearts = () => document.querySelectorAll('.burst-heart');
const layer = () => document.querySelector('.burst-layer');

// happy-dom gives every element a zero-sized box, so an origin has to be faked
// for the cases that care about position.
function elementAt(x, y, width = 40, height = 40) {
  const node = document.createElement('div');
  node.getBoundingClientRect = () => ({ left: x, top: y, width, height });
  document.body.appendChild(node);
  return node;
}

beforeEach(() => {
  reduced = false;
  document.body.innerHTML = '';
  clearBursts();
});

afterEach(() => clearBursts());

describe('bursting', () => {
  it('adds hearts to a layer over the page', () => {
    expect(burstHearts(elementAt(100, 100))).toBe(8);
    expect(hearts()).toHaveLength(8);
  });

  it('honours a requested count', () => {
    burstHearts(elementAt(100, 100), { count: 3 });
    expect(hearts()).toHaveLength(3);
  });

  it('launches from the centre of the element', () => {
    burstHearts(elementAt(100, 200, 40, 60), { count: 1 });
    expect(hearts()[0].style.left).toBe('120px');
    expect(hearts()[0].style.top).toBe('230px');
  });

  it('accepts a bare point as well as an element', () => {
    burstHearts({ x: 42, y: 24 }, { count: 1 });
    expect(hearts()[0].style.left).toBe('42px');
  });

  it('gives each heart its own drift, rise and timing', () => {
    // A burst where every heart follows the same arc reads as a spinner
    // rather than something spontaneous.
    burstHearts(elementAt(100, 100), { count: 6 });
    const drifts = new Set([...hearts()].map((h) => h.style.getPropertyValue('--drift')));
    const delays = new Set([...hearts()].map((h) => h.style.animationDelay));
    expect(drifts.size).toBeGreaterThan(1);
    expect(delays.size).toBeGreaterThan(1);
  });

  it('tints a partner burst differently from your own', () => {
    burstHearts(elementAt(100, 100), { count: 1, tone: 'partner' });
    expect(hearts()[0].classList.contains('burst-heart-partner')).toBe(true);
  });

  it('reuses one layer across bursts', () => {
    burstHearts(elementAt(100, 100), { count: 2 });
    burstHearts(elementAt(100, 100), { count: 2 });
    expect(document.querySelectorAll('.burst-layer')).toHaveLength(1);
    expect(hearts()).toHaveLength(4);
  });

  it('hides the layer from assistive tech', () => {
    // Eight hearts announced one by one would be noise; anything worth saying
    // is said in the room message.
    burstHearts(elementAt(100, 100), { count: 1 });
    expect(layer().getAttribute('aria-hidden')).toBe('true');
  });
});

describe('what it refuses to do', () => {
  it('stays still for someone who asked for less motion', () => {
    // It carries no information, so there is nothing to replace it with.
    reduced = true;
    expect(burstHearts(elementAt(100, 100))).toBe(0);
    expect(layer()).toBeNull();
  });

  it('does nothing without an origin', () => {
    expect(burstHearts(null)).toBe(0);
    expect(burstHearts(undefined)).toBe(0);
  });

  it('does not launch from the corner of the window when the element is not laid out', () => {
    // A zero box means scrolled away or not yet rendered — bursting from 0,0
    // would look like a glitch.
    const invisible = document.createElement('div');
    invisible.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
    expect(burstHearts(invisible)).toBe(0);
  });
});

describe('cleanup', () => {
  it('removes each heart once it has finished', () => {
    burstHearts(elementAt(100, 100), { count: 2 });
    hearts().forEach((heart) => heart.dispatchEvent(new Event('animationend')));
    expect(hearts()).toHaveLength(0);
  });

  it('clears everything when a booth is left mid-burst', () => {
    // Otherwise hearts hang over the landing page.
    burstHearts(elementAt(100, 100), { count: 8 });
    clearBursts();
    expect(layer()).toBeNull();
    expect(hearts()).toHaveLength(0);
  });

  it('can burst again after being cleared', () => {
    burstHearts(elementAt(100, 100), { count: 2 });
    clearBursts();
    burstHearts(elementAt(100, 100), { count: 2 });
    expect(hearts()).toHaveLength(2);
  });
});
