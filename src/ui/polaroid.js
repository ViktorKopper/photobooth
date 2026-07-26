// The collage coming out of a camera.
//
// This sits at the emotional peak of the app — six photos taken apart become
// one thing you both keep — so it takes over the screen rather than happening
// in a corner of a card.
//
// It lives in a fixed overlay, outside #collageSection, for two reasons that
// are not just presentational. The section rewrites its own innerHTML on every
// room snapshot, so anything animating inside it gets wiped by an unrelated
// heart tap. And the overlay owns its own stacking context, which is what the
// first version got wrong: the print used `z-index: -1` to sit behind the
// camera, and promptly disappeared behind the card's background instead.
//
// Here the print is simply a lower sibling of the camera body — no negative
// index, nothing to fall behind.
//
// Two things keep it honest rather than being a delay dressed as a feature.
// The camera appears the instant you press the button and the print starts
// moving immediately, so the wait for the canvas happens *behind* something
// worth watching. And it can be dismissed at any point.

import { prefersReducedMotion } from './motion.js';

const SLIDE_MS = 1500;
const DEVELOP_MS = 2400;
const REST_MS = 900;

const CAMERA_SVG = `
  <svg class="pc-camera" viewBox="0 0 260 200" aria-hidden="true">
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

function overlayMarkup() {
  return `
    <div class="develop-scene">
      <div class="develop-print" id="developPrint">
        <div class="develop-print-window">
          <img id="developImg" alt="" />
        </div>
        <span class="develop-print-lip"></span>
      </div>
      ${CAMERA_SVG}
    </div>
    <p class="develop-status" id="developStatus" aria-live="polite">Developing...</p>
    <button type="button" class="ghost small develop-skip" id="developSkip">Skip</button>
  `;
}

// Resolves on the element's animation end, on a dismiss, or after a ceiling.
// A backgrounded tab fires no animation events at all, so without the ceiling
// the print would be left half out of the camera forever.
function settle(element, ceiling, signal) {
  // Checked first, not just listened for. An abort that has *already* happened
  // fires no event, so a listener alone would let every step after a dismiss
  // sit and wait out its own ceiling — pressing Skip would stop one stage and
  // then hang on the next.
  if (signal?.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    element?.addEventListener('animationend', finish, { once: true });
    signal?.addEventListener('abort', finish, { once: true });
    window.setTimeout(finish, ceiling);
  });
}

function wait(ms, signal) {
  if (signal?.aborted) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });
}

/**
 * Plays the whole beat around a render.
 *
 * `render` is awaited *while* the print is sliding out, which is the point: the
 * animation covers the work rather than being added to it.
 */
export async function developCollage(render, { alt = 'Your collage' } = {}) {
  // Someone who asked for less motion gets the result and nothing else. There
  // is no information here to preserve — it is entirely a flourish.
  if (prefersReducedMotion()) return render();

  const overlay = document.createElement('div');
  overlay.className = 'develop-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', 'Developing your collage');
  overlay.innerHTML = overlayMarkup();
  document.body.appendChild(overlay);

  // Locked while the overlay is up, so the page behind cannot be scrolled by a
  // stray swipe on a phone.
  const previousOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';

  const dismiss = new AbortController();
  const close = () => dismiss.abort();

  overlay.querySelector('#developSkip').addEventListener('click', close);
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  const onKey = (event) => {
    if (event.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  const teardown = () => {
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = previousOverflow;
    overlay.classList.add('leaving');
    window.setTimeout(() => overlay.remove(), 320);
  };

  let result;

  try {
    // Started before the render is awaited: the slide and the canvas work
    // overlap instead of queueing.
    result = await render();
  } catch (error) {
    // Nothing to develop. Clear the stage immediately so the error toast is not
    // shown over a camera about to produce nothing.
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = previousOverflow;
    overlay.remove();
    throw error;
  }

  const print = overlay.querySelector('#developPrint');
  const image = overlay.querySelector('#developImg');
  const status = overlay.querySelector('#developStatus');

  image.src = result.previewUrl;
  image.alt = alt;

  print.classList.add('sliding');
  await settle(print, SLIDE_MS + 400, dismiss.signal);

  status.textContent = 'Almost there...';
  print.classList.add('developing');
  await settle(image, DEVELOP_MS + 400, dismiss.signal);

  status.textContent = 'Yours ♡';
  await wait(REST_MS, dismiss.signal);

  teardown();
  return result;
}

export const POLAROID_TIMINGS = { SLIDE_MS, DEVELOP_MS, REST_MS };
