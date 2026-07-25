import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeLocation, describeSearchResult, fetchWeather, searchCities } from './geo.js';

// geo.js is the app's only outward network dependency, so these tests are
// as much about what happens when the API misbehaves as when it works.
const mockFetch = (impl) => {
  globalThis.fetch = vi.fn(impl);
  return globalThis.fetch;
};

const ok = (body) => async () => ({ ok: true, status: 200, json: async () => body });

afterEach(() => {
  vi.restoreAllMocks();
  delete globalThis.fetch;
});

describe('searchCities', () => {
  const RESULT = {
    id: 3060972,
    name: 'Bratislava',
    latitude: 48.14816,
    longitude: 17.10674,
    timezone: 'Europe/Bratislava',
    country: 'Slovakia',
    admin1: 'Bratislava Region',
    population: 423737
  };

  it('keeps only the fields the app needs', async () => {
    mockFetch(ok({ results: [RESULT] }));
    const [city] = await searchCities('Bratislava');

    expect(city).toEqual({
      id: 3060972,
      name: 'Bratislava',
      country: 'Slovakia',
      region: 'Bratislava Region',
      latitude: 48.14816,
      longitude: 17.10674,
      timezone: 'Europe/Bratislava'
    });
  });

  it('does not call the API for a query too short to be meaningful', async () => {
    const fetchSpy = mockFetch(ok({ results: [] }));
    expect(await searchCities('B')).toEqual([]);
    expect(await searchCities('  ')).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('drops results that could not be placed on a map or a clock', async () => {
    mockFetch(
      ok({
        results: [
          RESULT,
          { ...RESULT, id: 2, timezone: undefined },
          { ...RESULT, id: 3, latitude: null },
          { ...RESULT, id: 4, longitude: 'nope' }
        ]
      })
    );

    const cities = await searchCities('Bratislava');
    expect(cities.map((city) => city.id)).toEqual([3060972]);
  });

  it('copes with an empty or shapeless response', async () => {
    mockFetch(ok({}));
    expect(await searchCities('Bratislava')).toEqual([]);
  });

  it('throws with a useful message on an HTTP error', async () => {
    mockFetch(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    await expect(searchCities('Bratislava')).rejects.toThrow(/503/);
  });
});

describe('fetchWeather', () => {
  const LOCATION = { latitude: 48.14816, longitude: 17.10674, timezone: 'Europe/Bratislava' };

  it('rounds the temperature and passes the raw code through', async () => {
    mockFetch(ok({ current: { temperature_2m: 18.4, weather_code: 61 } }));
    expect(await fetchWeather(LOCATION)).toEqual({ temperature: 18, code: 61, label: 'rain' });
  });

  it('asks the API for the right place', async () => {
    const fetchSpy = mockFetch(ok({ current: { temperature_2m: 1, weather_code: 0 } }));
    await fetchWeather(LOCATION);

    const url = new URL(fetchSpy.mock.calls[0][0]);
    expect(url.searchParams.get('latitude')).toBe('48.14816');
    expect(url.searchParams.get('longitude')).toBe('17.10674');
    expect(url.searchParams.get('current')).toContain('temperature_2m');
  });

  it('handles a below-zero temperature', async () => {
    mockFetch(ok({ current: { temperature_2m: -4.6, weather_code: 71 } }));
    expect(await fetchWeather(LOCATION)).toMatchObject({ temperature: -5, code: 71 });
  });

  it('marks an absent weather code as unknown rather than guessing', async () => {
    mockFetch(ok({ current: { temperature_2m: 12 } }));
    expect(await fetchWeather(LOCATION)).toMatchObject({ code: -1, label: '' });
  });

  // Everything below returns null rather than throwing: weather is garnish,
  // and a failure here must never take the distance panel down with it.
  it('returns null without usable coordinates', async () => {
    const fetchSpy = mockFetch(ok({}));
    expect(await fetchWeather(null)).toBeNull();
    expect(await fetchWeather({ latitude: 'x', longitude: 2 })).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null when the network fails', async () => {
    mockFetch(async () => {
      throw new Error('offline');
    });
    expect(await fetchWeather(LOCATION)).toBeNull();
  });

  it('returns null on an HTTP error', async () => {
    mockFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }));
    expect(await fetchWeather(LOCATION)).toBeNull();
  });

  it('returns null when the payload has no temperature', async () => {
    mockFetch(ok({ current: {} }));
    expect(await fetchWeather(LOCATION)).toBeNull();
    mockFetch(ok({ current: { temperature_2m: 'warm' } }));
    expect(await fetchWeather(LOCATION)).toBeNull();
  });

  it('returns null on malformed JSON', async () => {
    mockFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      }
    }));
    expect(await fetchWeather(LOCATION)).toBeNull();
  });
});

describe('label helpers', () => {
  it('joins a city with its country, skipping blanks', () => {
    expect(describeLocation({ name: 'Manila', country: 'Philippines' })).toBe('Manila, Philippines');
    expect(describeLocation({ name: 'Manila', country: '' })).toBe('Manila');
    expect(describeLocation(null)).toBe('');
  });

  it('includes the region when disambiguating search results', () => {
    expect(
      describeSearchResult({ name: 'Bratislava', region: 'Bratislava Region', country: 'Slovakia' })
    ).toBe('Bratislava, Bratislava Region, Slovakia');
    expect(describeSearchResult(null)).toBe('');
  });
});
