// Whether this browser thinks it has a connection.
//
// Worth saying out loud in an app whose whole point is two people on different
// continents. Without it, losing wifi mid-shoot surfaces as whatever Firebase
// happens to throw — usually something about a deadline being exceeded, which
// tells you nothing about the actual problem.
//
// `navigator.onLine` is famously optimistic: it reports the state of the
// network interface, not whether anything is reachable. So this is framed as a
// hint rather than a fact — it is trustworthy when it says "offline" and only
// suggestive when it says otherwise, which is exactly how the copy reads.

import { requestRender } from '../store.js';

let listening = false;
let onChange = () => {};

export function isOffline() {
  // Defaults to online where the property does not exist, rather than showing
  // a permanent offline warning in an environment that simply cannot answer.
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

const handle = () => {
  onChange(isOffline());
  requestRender();
};

export function startConnectionWatch(notify = () => {}) {
  onChange = notify;
  if (listening) return;

  window.addEventListener('online', handle);
  window.addEventListener('offline', handle);
  listening = true;
}

export function stopConnectionWatch() {
  if (!listening) return;

  window.removeEventListener('online', handle);
  window.removeEventListener('offline', handle);
  listening = false;
  onChange = () => {};
}
