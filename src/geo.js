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

export function describeLocation(location) {
  if (!location) return '';
  return [location.name, location.country].filter(Boolean).join(', ');
}

export function describeSearchResult(result) {
  if (!result) return '';
  return [result.name, result.region, result.country].filter(Boolean).join(', ');
}
