// The collage coming out of a camera.
//
// This sits at the emotional peak of the app — six photos taken apart become
// one thing you both keep — and the old version of that moment was a button
// changing its own label. So: a drawn instant camera slides the print out of
// its slot, and the picture develops on the paper once it is clear.
//
// Two things make this honest rather than a delay dressed up as a feature.
//
// The camera appears the instant you press the button and the print starts
// sliding immediately, so the wait for the real canvas render happens *behind*
// something worth watching. And if the render outlasts the slide, the print
// simply hangs half-out — which is what a real one does, and reads as the
// machine working rather than as a stall.

import { prefersReducedMotion } from './motion.js';

const SLIDE_MS = 1400;
const DEVELOP_MS = 2200;

// Drawn in the same flat, slightly wonky style as the icon set, with the app's
// own tokens rather than literal colours so it belongs to whichever theme is
// on. The slot is a real gap: the print emerges from behind the body.
const CAMERA_SVG = `
  <svg class="polaroid-camera" viewBox="0 0 260 200" aria-hidden="true">
    <rect class="pc-body" x="18" y="14" width="224" height="150" rx="22" />
    <rect class="pc-face" x="34" y="30" width="192" height="80" rx="14" />
    <circle class="pc-lens-outer" cx="130" cy="70" r="34" />
    <circle class="pc-lens-inner" cx="130" cy="70" r="21" />
    <circle class="pc-lens-glint" cx="120" cy="60" r="6" />
    <rect class="pc-flash" x="48" y="40" width="26" height="18" rx="5" />
    <circle class="pc-shutter" cx="205" cy="49" r="9" />
    <rect class="pc-stripe" x="34" y="120" width="192" height="8" rx="4" />
    <rect class="pc-slot" x="44" y="150" width="172" height="12" rx="6" />
  </svg>
`;

// The print itself: white card that the image fades up onto, exactly like the
// polaroid frames used everywhere else in the app.
const printMarkup = (src, alt) => `
  <div class="polaroid-print">
    <div class="polaroid-print-window">
      <img src="${src}" alt="${alt}" />
    </div>
    <span class="polaroid-print-caption"></span>
  </div>
`;

// Resolves once the element's current animation ends, or after a ceiling —
// a backgrounded tab never fires animationend, and the print must not be left
// stuck inside the camera because someone switched away mid-render.
function animationEnd(element, ceiling) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    element.addEventListener('animationend', finish, { once: true });
    window.setTimeout(finish, ceiling);
  });
}

/**
 * Plays the whole beat around a render.
 *
 * `render` is awaited *while* the print is sliding out, which is the point:
 * the animation covers the work rather than being added to it.
 */
export async function developCollage(host, render, { alt = 'Your collage' } = {}) {
  if (!host) return render();

  // Someone who asked for less motion gets the result and nothing else. There
  // is no information here to preserve — it is entirely a flourish.
  if (prefersReducedMotion()) return render();

  const stage = document.createElement('div');
  stage.className = 'polaroid-stage';
  stage.innerHTML = CAMERA_SVG;
  host.replaceChildren(stage);

  // Started before the render is awaited, so the slide and the canvas work
  // overlap instead of queueing.
  const slot = document.createElement('div');
  slot.className = 'polaroid-slot';
  stage.appendChild(slot);

  let result;
  let failed = null;

  try {
    result = await render();
  } catch (error) {
    failed = error;
  }

  if (failed) {
    // Nothing to develop. Clear the stage so the error toast isn't shown over
    // a camera that is about to produce nothing.
    stage.remove();
    throw failed;
  }

  slot.innerHTML = printMarkup(result.previewUrl, alt);
  const print = slot.querySelector('.polaroid-print');

  print.classList.add('sliding');
  await animationEnd(print, SLIDE_MS + 400);

  print.classList.add('developing');
  await animationEnd(print.querySelector('img'), DEVELOP_MS + 400);

  // Handed back so the caller can swap in its own permanent markup; the stage
  // has done its job the moment the picture is visible.
  return result;
}

export const POLAROID_TIMINGS = { SLIDE_MS, DEVELOP_MS };
