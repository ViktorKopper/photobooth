// Current conditions in each partner's city.
//
// Owns its own cache, its refresh timer and the signature gate — all three
// used to be loose fields on the global state object, which is how the
// original bug got in: the ticker started before the first room snapshot
// arrived, fetched with no cities to fetch for, and then refused to try again
// for fifteen minutes.
//
// The gate is now driven by the data rather than by startup order. `sync()` is
// safe to call on every snapshot: it compares a signature of both cities and
// does nothing unless they actually changed.

import { fetchWeather } from '../geo.js';
import { isUsableLocation, ROLE_KEYS } from '../utils.js';

const REFRESH_MS = 15 * 60 * 1000;

export function createWeatherWatcher({
  fetch = fetchWeather,
  onUpdate = () => {},
  intervalMs = REFRESH_MS
} = {}) {
  let readings = { viktor: null, jericka: null };
  let signature = '';
  let timer = null;
  let lastRoom = null;

  function signatureOf(room) {
    return ROLE_KEYS.map((role) => {
      const location = room?.participants?.[role]?.location;
      return isUsableLocation(location) ? `${location.latitude},${location.longitude}` : '-';
    }).join('|');
  }

  async function refresh() {
    const room = lastRoom;

    const fetched = await Promise.all(
      ROLE_KEYS.map(async (role) => {
        const location = room?.participants?.[role]?.location;
        if (!isUsableLocation(location)) return [role, null];
        try {
          return [role, await fetch(location)];
        } catch {
          // A failed lookup drops the chip rather than the whole panel.
          return [role, null];
        }
      })
    );

    // Dropped if the cities changed while this was in flight, so a slow
    // response can't overwrite fresher readings.
    if (signatureOf(room) !== signature) return;

    readings = Object.fromEntries(fetched);
    onUpdate();
  }

  return {
    // Safe to call on every room snapshot.
    sync(room) {
      lastRoom = room;
      const next = signatureOf(room);
      if (next === signature) return;

      signature = next;
      readings = { viktor: null, jericka: null };
      refresh();

      if (!timer) timer = window.setInterval(refresh, intervalMs);
    },

    get(role) {
      return readings[role] ?? null;
    },

    stop() {
      if (timer) window.clearInterval(timer);
      timer = null;
      readings = { viktor: null, jericka: null };
      signature = '';
      lastRoom = null;
    }
  };
}
