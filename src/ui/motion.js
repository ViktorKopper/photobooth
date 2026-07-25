// Motion helpers shared across screens.

export function prefersReducedMotion() {
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// Ticks a number up to its final value. Deliberately opt-in per call site
// rather than automatic: the panels holding these numbers re-render on a
// timer, and a counter that replayed every 30 seconds would be maddening.
export function countUp(element, to, { duration = 1100, format = (v) => String(v) } = {}) {
  if (!element) return;

  if (prefersReducedMotion() || !Number.isFinite(to)) {
    element.innerHTML = format(to);
    return;
  }

  let start = null;

  const step = (now) => {
    if (start === null) start = now;
    const progress = Math.min(1, (now - start) / duration);
    // Cubic ease-out: fast to begin with, settling onto the final value.
    const eased = 1 - Math.pow(1 - progress, 3);
    // innerHTML rather than textContent because these labels carry an
    // inline icon. Every formatter passed in is defined in app code and
    // only ever interpolates numbers, so nothing user-supplied reaches it.
    element.innerHTML = format(Math.round(eased * to));
    if (progress < 1) window.requestAnimationFrame(step);
  };

  window.requestAnimationFrame(step);
}

// A CSS animation won't replay on an element that was merely un-hidden.
// Nudging it off and on, with a forced reflow in between, restarts it.
export function restartAnimation(element) {
  if (!element) return;
  element.style.animation = 'none';
  void element.offsetWidth;
  element.style.animation = '';
}
