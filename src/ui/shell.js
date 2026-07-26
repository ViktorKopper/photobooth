// Mounts a screen into #app, with a page-turn transition between them.

import { prefersReducedMotion } from './motion.js';

let appRoot = null;

// Resolved on demand rather than at import time, so this module can be
// imported before a page exists — which is what makes the screens that use
// it reachable from a test.
export function app() {
  if (!appRoot || !appRoot.isConnected) appRoot = document.querySelector('#app');
  return appRoot;
}

export function setApp(html) {
  const previous = app().firstElementChild;

  if (!previous || prefersReducedMotion()) {
    app().innerHTML = html;
    return;
  }

  const ghost = document.createElement('div');
  ghost.className = 'page-exit';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.appendChild(previous);

  // The ghost still holds a full copy of the old screen, ids and all.
  // Stripping them guarantees a stray querySelector can never reach back
  // into the screen that's on its way out.
  ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));

  app().innerHTML = html;
  app().appendChild(ghost);

  const remove = () => ghost.remove();
  ghost.addEventListener('animationend', remove, { once: true });
  // Safety net: if the animation never fires (backgrounded tab, for one), the
  // ghost must not be left sitting over the live screen.
  window.setTimeout(remove, 900);
}
