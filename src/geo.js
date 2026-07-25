// City lookup via Open-Meteo's geocoding API: free, keyless, CORS-enabled,
// and it returns the IANA timezone alongside the coordinates. That timezone
// is the important part — once a city is picked we store it and can render
// the partner's local time forever after with zero further network calls.
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export async function searchCities(query, { count = 5, signal } = {}) {
  const trimmed = String(query ?? '').trim();
  if (trimmed.length < 2) return [];

  const url = new URL(GEOCODE_URL);
  url.searchParams.set('name', trimmed);
  url.searchParams.set('count', String(count));
  url.searchParams.set('language', 'en');
  url.searchParams.set('format', 'json');

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`City lookup failed (HTTP ${response.status}).`);
  }

  const data = await response.json();

  return (data.results || [])
    .filter((item) => item.timezone && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))
    .map((item) => ({
      id: item.id,
      name: item.name,
      country: item.country || '',
      region: item.admin1 || '',
      latitude: item.latitude,
      longitude: item.longitude,
      timezone: item.timezone
    }));
}

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

// WMO weather interpretation codes, collapsed into the handful of states
// worth showing at a glance. Ranges rather than every individual code —
// "light drizzle" vs "moderate drizzle" is more precision than a status
// line needs.
const WEATHER_CODES = [
  { max: 0, label: 'clear' },
  { max: 2, label: 'partly cloudy' },
  { max: 3, label: 'overcast' },
  { max: 48, label: 'fog' },
  { max: 57, label: 'drizzle' },
  { max: 67, label: 'rain' },
  { max: 77, label: 'snow' },
  { max: 82, label: 'showers' },
  { max: 86, label: 'snow showers' },
  { max: 99, label: 'thunderstorm' }
];

function describeWeatherCode(code) {
  // Guard the low end too: a missing or negative code must not slide into
  // the first bucket and cheerfully report clear skies.
  if (!Number.isFinite(code) || code < 0) return { label: '' };
  const match = WEATHER_CODES.find((entry) => code <= entry.max);
  return match || { label: '' };
}

// Current conditions for a stored location. Written defensively on purpose:
// this is a third-party API the app doesn't control, so anything unexpected
// resolves to null and the caller simply renders no weather rather than
// breaking the panel around it.
export async function fetchWeather(location, { signal } = {}) {
  if (!location || !Number.isFinite(location.latitude) || !Number.isFinite(location.longitude)) {
    return null;
  }

  const url = new URL(FORECAST_URL);
  url.searchParams.set('latitude', String(location.latitude));
  url.searchParams.set('longitude', String(location.longitude));
  url.searchParams.set('current', 'temperature_2m,weather_code');
  url.searchParams.set('timezone', 'auto');

  try {
    const response = await fetch(url, { signal });
    if (!response.ok) return null;

    const data = await response.json();
    const temperature = data?.current?.temperature_2m;
    const code = data?.current?.weather_code;

    if (!Number.isFinite(temperature)) return null;

    const described = describeWeatherCode(code);

    return {
      temperature: Math.round(temperature),
      // The raw WMO code travels with it so the UI can pick a drawn icon
      // rather than this module having to know about presentation.
      code: Number.isFinite(code) ? code : -1,
      label: described.label
    };
  } catch {
    return null;
  }
}

export function describeLocation(location) {
  if (!location) return '';
  return [location.name, location.country].filter(Boolean).join(', ');
}

export function describeSearchResult(result) {
  if (!result) return '';
  return [result.name, result.region, result.country].filter(Boolean).join(', ');
}
