// Local times drift while a booth stays open, and the "is shooting right now"
// indicator expires on a clock rather than on a write — so nothing would bring
// the view back on its own. One slow tick keeps both honest.
//
// Lives apart from the room screen so that session teardown can stop it
// without the two modules having to import each other.

import { CLOCK_TICK_MS } from '../config.js';
import { requestRender } from '../store.js';

let clockTimer = null;

export function startClockTicker() {
  stopClockTicker();
  clockTimer = window.setInterval(requestRender, CLOCK_TICK_MS);
}

export function stopClockTicker() {
  if (clockTimer) window.clearInterval(clockTimer);
  clockTimer = null;
}
