// Local notifications for the synced countdown.
//
// Deliberately not push. Real push needs FCM and a server to send from, and
// a shared secret sitting in a public repo; these fire from the service
// worker on the device that already has the room open. That covers the case
// this app actually has — a backgrounded tab, or a phone with the screen off
// while the other person taps "shoot together" — and nothing more.
//
// Everything here is best-effort. A notification never blocks a countdown.

import { ICONS } from '../icons.js';
import { showError } from '../ui/toast.js';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission() {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

// Reflects the current browser permission onto the toggle. There is no
// "turn it back off" state to render: once granted or denied, only the
// browser's own settings can change it, so the button becomes a label.
export function renderNotifyToggle(button) {
  if (!button) return;

  if (!notificationsSupported()) {
    button.classList.add('hidden');
    return;
  }

  const labels = {
    granted: [`${ICONS.bell} Notifications on`, true],
    denied: [`${ICONS.bellOff} Notifications blocked`, true],
    default: [`${ICONS.bell} Enable notifications`, false]
  };

  const [html, disabled] = labels[Notification.permission] ?? labels.default;
  button.innerHTML = html;
  button.disabled = disabled;
}

// Asking must happen from a real user gesture, which is why this hangs off the
// button rather than running at startup.
export async function requestNotificationPermissionFlow() {
  await requestNotificationPermission();
  renderNotifyToggle(document.querySelector('#notifyToggleBtn'));

  if (notificationPermission() === 'denied') {
    showError('Notifications are blocked for this site in your browser settings.');
  }
}

export async function notifySyncRequested(partnerName) {
  if (notificationPermission() !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Synced countdown started! 💕', {
      body: `${partnerName} wants to shoot together — get ready!`,
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icon-192.png`,
      // A single tag, so a second request replaces the first rather than
      // stacking a pile of them in the tray.
      tag: 'photobooth-sync',
      vibrate: [80, 40, 80]
    });
  } catch {
    // Notifications are a nice-to-have; never block the countdown on this.
  }
}
