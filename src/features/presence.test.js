// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest';
import { PRESENCE_PING_MS, PRESENCE_WINDOW_MS } from '../config.js';
import { isHereNow } from './presence.js';

const NOW = 1_800_000_000_000;
const stampAt = (millis) => ({ toMillis: () => millis });

describe('isHereNow', () => {
  it('counts a heartbeat from a moment ago', () => {
    expect(isHereNow(stampAt(NOW - 5000), NOW)).toBe(true);
  });

  it('lets someone go quiet once the stamp is stale', () => {
    expect(isHereNow(stampAt(NOW - PRESENCE_WINDOW_MS - 1), NOW)).toBe(false);
  });

  it('survives a browser skipping one ping', () => {
    // The window is deliberately wider than the interval: one dropped write or
    // a phone briefly asleep must not make the light flicker off.
    expect(PRESENCE_WINDOW_MS).toBeGreaterThan(PRESENCE_PING_MS * 2);
    expect(isHereNow(stampAt(NOW - PRESENCE_PING_MS * 2), NOW)).toBe(true);
  });

  it('tolerates a clock running slightly ahead of the server', () => {
    // Otherwise a stamp from the "future" reads as infinitely old and the
    // indicator never comes on at all.
    expect(isHereNow(stampAt(NOW + 4000), NOW)).toBe(true);
  });

  it('rejects a stamp absurdly far in the future', () => {
    expect(isHereNow(stampAt(NOW + PRESENCE_WINDOW_MS * 3), NOW)).toBe(false);
  });

  it('treats a missing or unresolved stamp as gone', () => {
    // Firestore reports serverTimestamp() as null locally until the write is
    // acknowledged, so this case is routine rather than exotic.
    expect(isHereNow(null, NOW)).toBe(false);
    expect(isHereNow(undefined, NOW)).toBe(false);
    expect(isHereNow({}, NOW)).toBe(false);
    expect(isHereNow({ toMillis: () => NaN }, NOW)).toBe(false);
  });
});
