// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWeatherWatcher } from './weather.js';

const BRATISLAVA = {
  name: 'Bratislava',
  country: 'Slovakia',
  latitude: 48.14816,
  longitude: 17.10674,
  timezone: 'Europe/Bratislava'
};

const MANILA = {
  name: 'Manila',
  country: 'Philippines',
  latitude: 14.5958,
  longitude: 120.9772,
  timezone: 'Asia/Manila'
};

const reading = (city) => ({ temperature: 20, code: 0, label: `clear in ${city.name}` });

const roomWith = (viktorCity, jerickaCity) => ({
  participants: {
    viktor: { location: viktorCity },
    jericka: { location: jerickaCity }
  }
});

let watcher = null;
let fetchWeather = null;
let onUpdate = null;

function build({ fetchImpl } = {}) {
  fetchWeather = vi.fn(fetchImpl ?? (async (location) => reading(location)));
  onUpdate = vi.fn();
  watcher = createWeatherWatcher({ fetch: fetchWeather, onUpdate, intervalMs: 20 });
  return watcher;
}

// Lets the in-flight fetches resolve.
const settle = () => new Promise((resolve) => setTimeout(resolve, 1));

beforeEach(() => build());
afterEach(() => watcher?.stop());

describe('the first snapshot', () => {
  it('starts with nothing to show', () => {
    expect(watcher.get('viktor')).toBeNull();
    expect(watcher.get('jericka')).toBeNull();
  });

  it('fetches once both cities are known', async () => {
    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();

    expect(fetchWeather).toHaveBeenCalledTimes(2);
    expect(watcher.get('viktor').label).toContain('Bratislava');
    expect(watcher.get('jericka').label).toContain('Manila');
  });

  it('asks for a redraw once readings land', async () => {
    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();
    expect(onUpdate).toHaveBeenCalled();
  });

  it('does not fetch for a partner who has no city yet', async () => {
    watcher.sync(roomWith(BRATISLAVA, null));
    await settle();

    expect(fetchWeather).toHaveBeenCalledTimes(1);
    expect(watcher.get('jericka')).toBeNull();
  });

  it('survives a room with no cities at all', async () => {
    // The original bug: the ticker started before the first snapshot, fetched
    // with nothing to fetch for, and then refused to retry for 15 minutes.
    watcher.sync(roomWith(null, null));
    await settle();
    expect(fetchWeather).not.toHaveBeenCalled();
  });

  it('ignores a location missing its coordinates', async () => {
    watcher.sync(roomWith({ name: 'Nowhere', country: 'X' }, null));
    await settle();
    expect(fetchWeather).not.toHaveBeenCalled();
  });
});

describe('repeat snapshots', () => {
  it('does not refetch when the cities are unchanged', async () => {
    const room = roomWith(BRATISLAVA, MANILA);

    watcher.sync(room);
    await settle();
    fetchWeather.mockClear();

    // A room snapshot arrives on every heart tap and caption edit; the
    // watcher has to be cheap to call.
    watcher.sync(room);
    watcher.sync(room);
    expect(fetchWeather).not.toHaveBeenCalled();
  });

  it('refetches when someone changes city', async () => {
    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();
    fetchWeather.mockClear();

    watcher.sync(roomWith(BRATISLAVA, BRATISLAVA));
    await settle();
    expect(fetchWeather).toHaveBeenCalledTimes(2);
  });

  it('picks up a city that arrives late', async () => {
    // Someone joins without a city and sets one afterwards.
    watcher.sync(roomWith(BRATISLAVA, null));
    await settle();
    expect(watcher.get('jericka')).toBeNull();

    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();
    expect(watcher.get('jericka').label).toContain('Manila');
  });
});

describe('failures', () => {
  it('drops one chip rather than the whole panel', async () => {
    build({
      fetchImpl: async (location) => {
        if (location.name === 'Manila') throw new Error('lookup failed');
        return reading(location);
      }
    });

    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();

    expect(watcher.get('viktor')).not.toBeNull();
    expect(watcher.get('jericka')).toBeNull();
  });

  it('still redraws after a failure', async () => {
    build({ fetchImpl: async () => { throw new Error('offline'); } });
    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();
    expect(onUpdate).toHaveBeenCalled();
  });
});

describe('a slow response', () => {
  it('is discarded if the cities changed while it was in flight', async () => {
    build({
      fetchImpl: (location) =>
        new Promise((resolve) => setTimeout(() => resolve(reading(location)), 30))
    });

    watcher.sync(roomWith(BRATISLAVA, MANILA));
    watcher.sync(roomWith(MANILA, MANILA));
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Both readings must describe the cities currently in the room.
    expect(watcher.get('viktor').label).toContain('Manila');
  });
});

describe('the refresh timer', () => {
  it('tops readings up on its own', async () => {
    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();
    fetchWeather.mockClear();

    await new Promise((resolve) => setTimeout(resolve, 55));
    expect(fetchWeather.mock.calls.length).toBeGreaterThan(0);
  });

  it('is not started more than once', async () => {
    const room = roomWith(BRATISLAVA, MANILA);
    const spy = vi.spyOn(window, 'setInterval');

    watcher.sync(room);
    watcher.sync(roomWith(BRATISLAVA, BRATISLAVA));
    watcher.sync(room);
    await settle();

    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

describe('stop', () => {
  it('halts the timer', async () => {
    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();
    watcher.stop();
    fetchWeather.mockClear();

    await new Promise((resolve) => setTimeout(resolve, 55));
    expect(fetchWeather).not.toHaveBeenCalled();
  });

  it('clears the readings', async () => {
    watcher.sync(roomWith(BRATISLAVA, MANILA));
    await settle();
    watcher.stop();
    expect(watcher.get('viktor')).toBeNull();
  });

  it('leaves the watcher reusable, so re-entering a booth refetches', async () => {
    const room = roomWith(BRATISLAVA, MANILA);

    watcher.sync(room);
    await settle();
    watcher.stop();
    fetchWeather.mockClear();

    // The same cities as before: without the signature being cleared too,
    // this would match the stale key and skip the lookup.
    watcher.sync(room);
    await settle();
    expect(fetchWeather).toHaveBeenCalledTimes(2);
  });
});
