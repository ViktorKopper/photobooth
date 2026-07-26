// Little hearts that float up and fade.
//
// Used for the two moments where something arrives from the other side while
// you're watching: a reaction landing on your photo, and a poke. Both are
// purely felt — nothing is stored, nothing is recorded — so the animation is
// the entire feature. If it doesn't land, there's nothing else there.
//
// Layered over the page in a fixed container rather than inside the element
// that triggered it, so a heart can drift out of a thumbnail without being
// clipped by its overflow.

import { prefersReducedMotion } from './motion.js';

const HEART =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20C7.5 16.5 4 13.6 4 9.9A4 4 0 0 1 12 8a4 4 0 0 1 8 1.9c0 3.7-3.5 6.6-8 10.1z" fill="currentColor"/></svg>';

let layer = null;

function burstLayer() {
  if (layer?.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'burst-layer';
  // Decorative by definition: a screen reader announcing eight hearts would
  // be noise, and anything worth saying is said in the room message.
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  return layer;
}

// `origin` is an element to launch from, or a {x, y} viewport point.
function originPoint(origin) {
  if (!origin) return null;
  if (typeof origin.x === 'number' && typeof origin.y === 'number') return origin;
  if (typeof origin.getBoundingClientRect !== 'function') return null;

  const box = origin.getBoundingClientRect();
  // An element scrolled off screen, or not laid out yet, has a zero box —
  // launching from the top-left corner of the window would look like a glitch.
  if (!box.width && !box.height) return null;
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
}

export function burstHearts(origin, { count = 8, spread = 46, size = 18, tone = '' } = {}) {
  // Someone who has asked for less motion gets none of this. It carries no
  // information, so there is nothing to replace it with.
  if (prefersReducedMotion()) return 0;

  const point = originPoint(origin);
  if (!point) return 0;

  const layerEl = burstLayer();

  for (let index = 0; index < count; index += 1) {
    const heart = document.createElement('span');
    heart.className = `burst-heart${tone ? ` burst-heart-${tone}` : ''}`;
    heart.innerHTML = HEART;

    // Spread, drift and timing are all jittered per heart. A burst where every
    // heart follows the same arc reads as a loading spinner rather than
    // something spontaneous.
    const drift = (Math.random() - 0.5) * spread * 2;
    const scale = 0.6 + Math.random() * 0.7;

    heart.style.left = `${point.x}px`;
    heart.style.top = `${point.y}px`;
    heart.style.width = `${size}px`;
    heart.style.height = `${size}px`;
    heart.style.setProperty('--drift', `${drift}px`);
    heart.style.setProperty('--rise', `${70 + Math.random() * 60}px`);
    heart.style.setProperty('--spin', `${(Math.random() - 0.5) * 50}deg`);
    heart.style.setProperty('--scale', String(scale));
    heart.style.animationDelay = `${index * 45}ms`;
    heart.style.animationDuration = `${900 + Math.random() * 500}ms`;

    heart.addEventListener('animationend', () => heart.remove(), { once: true });
    layerEl.appendChild(heart);
  }

  return count;
}

// Leaving a booth mid-burst shouldn't leave hearts hanging over the landing
// page, and a detached layer would keep whatever is still animating alive.
export function clearBursts() {
  layer?.remove();
  layer = null;
}
