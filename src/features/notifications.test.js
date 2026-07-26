// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  notificationPermission,
  notificationsSupported,
  notifySyncRequested,
  renderNotifyToggle,
  requestNotificationPermission
} from './notifications.js';

const original = globalThis.Notification;
let showNotification = null;

// Stands in for the Notification constructor, which is absent in happy-dom.
function withNotification(permission, { requestResult = permission } = {}) {
  const stub = vi.fn();
  stub.permission = permission;
  stub.requestPermission = vi.fn(async () => requestResult);
  globalThis.Notification = stub;
  return stub;
}

function withServiceWorker() {
  showNotification = vi.fn(async () => undefined);
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { ready: Promise.resolve({ showNotification }) }
  });
}

const button = () => document.querySelector('#notifyToggleBtn');

beforeEach(() => {
  document.body.innerHTML = '<button id="notifyToggleBtn"></button>';
});

afterEach(() => {
  if (original) globalThis.Notification = original;
  else delete globalThis.Notification;
  vi.restoreAllMocks();
});

describe('support detection', () => {
  it('reports the browser as unsupported when the API is absent', () => {
    delete globalThis.Notification;
    expect(notificationsSupported()).toBe(false);
    expect(notificationPermission()).toBe('unsupported');
  });

  it('reports the current permission when it is there', () => {
    withNotification('granted');
    expect(notificationsSupported()).toBe(true);
    expect(notificationPermission()).toBe('granted');
  });
});

describe('the toggle', () => {
  it('hides itself entirely where notifications do not exist', () => {
    delete globalThis.Notification;
    renderNotifyToggle(button());
    expect(button().classList.contains('hidden')).toBe(true);
  });

  it('invites a decision when none has been made', () => {
    withNotification('default');
    renderNotifyToggle(button());
    expect(button().textContent).toContain('Enable notifications');
    expect(button().disabled).toBe(false);
  });

  it('goes inert once granted — only the browser can undo that', () => {
    withNotification('granted');
    renderNotifyToggle(button());
    expect(button().textContent).toContain('Notifications on');
    expect(button().disabled).toBe(true);
  });

  it('says so plainly when blocked, rather than inviting a retry', () => {
    withNotification('denied');
    renderNotifyToggle(button());
    expect(button().textContent).toContain('blocked');
    expect(button().disabled).toBe(true);
  });

  it('carries a drawn icon, not an emoji', () => {
    withNotification('default');
    renderNotifyToggle(button());
    expect(button().querySelector('svg')).not.toBeNull();
  });

  it('does nothing when there is no button on screen', () => {
    withNotification('default');
    expect(() => renderNotifyToggle(null)).not.toThrow();
  });

  it('falls back to the invitation on an unrecognised permission value', () => {
    withNotification('weird');
    renderNotifyToggle(button());
    expect(button().textContent).toContain('Enable notifications');
  });
});

describe('requesting permission', () => {
  it('asks the browser', async () => {
    const stub = withNotification('default', { requestResult: 'granted' });
    await expect(requestNotificationPermission()).resolves.toBe('granted');
    expect(stub.requestPermission).toHaveBeenCalled();
  });

  it('reports unsupported instead of throwing', async () => {
    delete globalThis.Notification;
    await expect(requestNotificationPermission()).resolves.toBe('unsupported');
  });
});

describe('notifying the partner', () => {
  it('shows a notification through the service worker', async () => {
    withNotification('granted');
    withServiceWorker();

    await notifySyncRequested('Jericka');

    expect(showNotification).toHaveBeenCalledTimes(1);
    const [title, options] = showNotification.mock.calls[0];
    expect(title).toContain('Synced countdown');
    expect(options.body).toContain('Jericka');
  });

  it('collapses repeats onto one tag rather than stacking a pile', async () => {
    withNotification('granted');
    withServiceWorker();

    await notifySyncRequested('Jericka');
    expect(showNotification.mock.calls[0][1].tag).toBe('photobooth-sync');
  });

  it('stays quiet without permission', async () => {
    withNotification('default');
    withServiceWorker();

    await notifySyncRequested('Jericka');
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('stays quiet when blocked', async () => {
    withNotification('denied');
    withServiceWorker();

    await notifySyncRequested('Jericka');
    expect(showNotification).not.toHaveBeenCalled();
  });

  it('swallows a service worker failure — a countdown must not depend on it', async () => {
    withNotification('granted');
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.reject(new Error('no worker')) }
    });

    await expect(notifySyncRequested('Jericka')).resolves.toBeUndefined();
  });
});
