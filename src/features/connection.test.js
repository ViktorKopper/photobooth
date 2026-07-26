// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../store.js', () => ({ requestRender: vi.fn() }));

const { requestRender } = await import('../store.js');
const { isOffline, startConnectionWatch, stopConnectionWatch } = await import('./connection.js');

function setOnLine(value) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

const fire = (type) => window.dispatchEvent(new Event(type));

beforeEach(() => {
  setOnLine(true);
  vi.clearAllMocks();
});

afterEach(() => stopConnectionWatch());

describe('isOffline', () => {
  it('is false with a connection', () => {
    expect(isOffline()).toBe(false);
  });

  it('is true without one', () => {
    setOnLine(false);
    expect(isOffline()).toBe(true);
  });

  it('assumes online where the browser cannot answer', () => {
    // A permanent offline warning in an environment that has no opinion would
    // be worse than saying nothing.
    setOnLine(undefined);
    expect(isOffline()).toBe(false);
  });
});

describe('watching', () => {
  it('redraws when the connection drops', () => {
    startConnectionWatch();
    setOnLine(false);
    fire('offline');

    expect(requestRender).toHaveBeenCalled();
  });

  it('redraws when it comes back', () => {
    startConnectionWatch();
    setOnLine(false);
    fire('offline');
    vi.clearAllMocks();

    setOnLine(true);
    fire('online');
    expect(requestRender).toHaveBeenCalled();
  });

  it('tells the caller which way it went', () => {
    const notify = vi.fn();
    startConnectionWatch(notify);

    setOnLine(false);
    fire('offline');
    expect(notify).toHaveBeenCalledWith(true);

    setOnLine(true);
    fire('online');
    expect(notify).toHaveBeenCalledWith(false);
  });

  it('does not stack listeners when started twice', () => {
    // enterRoom runs on every booth; a second listener would double every
    // redraw for the rest of the session.
    startConnectionWatch();
    startConnectionWatch();

    setOnLine(false);
    fire('offline');
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('goes quiet once stopped', () => {
    startConnectionWatch();
    stopConnectionWatch();

    setOnLine(false);
    fire('offline');
    expect(requestRender).not.toHaveBeenCalled();
  });

  it('can be restarted after stopping', () => {
    startConnectionWatch();
    stopConnectionWatch();
    startConnectionWatch();

    fire('offline');
    expect(requestRender).toHaveBeenCalledTimes(1);
  });

  it('survives being stopped without ever starting', () => {
    expect(() => stopConnectionWatch()).not.toThrow();
  });
});
