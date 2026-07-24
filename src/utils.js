export const ROLES = {
  viktor: {
    id: 'viktor',
    name: 'Viktor',
    possessive: "Viktor's",
    waitingFor: 'Jericka'
  },
  jericka: {
    id: 'jericka',
    name: 'Jericka',
    possessive: "Jericka's",
    waitingFor: 'Viktor'
  }
};

export function otherRole(role) {
  return role === 'viktor' ? 'jericka' : 'viktor';
}

export function generateRoomId(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return [...values].map((value) => alphabet[value % alphabet.length]).join('');
}

export function roomLink(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  return url.toString();
}

export function getRoomIdFromUrl() {
  return new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function normalizeRoomCode(value) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function sanitizeCollageMessage(value) {
  return value.trim().slice(0, 80) || 'Our little photobooth memory';
}

// Unlike sanitizeCollageMessage, a caption has no fallback text — an empty
// caption is a perfectly valid state (not every photo needs a note).
export function sanitizeCaption(value) {
  return String(value ?? '').trim().slice(0, 36);
}

// Counts days together inclusively — the anniversary date itself is day 1,
// matching how people naturally count "we've been together for X days".
// Returns null when there's no valid date to count from.
export function daysTogether(anniversaryDate, referenceDate = new Date()) {
  if (!anniversaryDate) return null;

  const start = new Date(`${anniversaryDate}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;

  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const today = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const diffMs = today.getTime() - startDay.getTime();

  if (diffMs < 0) return null;

  return Math.floor(diffMs / 86400000) + 1;
}

// Great-circle distance between two points, in kilometres. Uses the mean
// Earth radius — good to a few tenths of a percent, far beyond what "we're
// 1 847 km apart" needs to convey.
export function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function distanceBetween(locationA, locationB) {
  if (!isUsableLocation(locationA) || !isUsableLocation(locationB)) return null;
  return haversineKm(locationA.latitude, locationA.longitude, locationB.latitude, locationB.longitude);
}

export function formatDistanceKm(km) {
  if (km == null) return '';
  if (km < 1) return 'right next to each other';
  // Thin spaces as thousands separators read better than commas here.
  return `${Math.round(km).toLocaleString('en-US').replace(/,/g, ' ')} km`;
}

export function isUsableLocation(location) {
  return Boolean(
    location &&
    typeof location.latitude === 'number' &&
    typeof location.longitude === 'number' &&
    typeof location.timezone === 'string' &&
    location.timezone
  );
}

// Keeps only the fields worth storing, so a whole geocoding API response
// never ends up in Firestore (and the rules stay easy to validate).
export function sanitizeLocation(location) {
  if (!isUsableLocation(location)) return null;

  return {
    name: String(location.name ?? '').slice(0, 60),
    country: String(location.country ?? '').slice(0, 60),
    latitude: Number(location.latitude),
    longitude: Number(location.longitude),
    timezone: String(location.timezone).slice(0, 60)
  };
}

// Reads the wall-clock time in an IANA timezone. Everything is derived from
// the stored timezone string, so this keeps working forever without any
// further network calls after the city was first picked.
export function timeInZone(timezone, reference = new Date()) {
  if (!timezone) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      weekday: 'short',
      hour12: false
    }).formatToParts(reference);

    const lookup = (type) => parts.find((part) => part.type === type)?.value ?? '';
    const hour = Number(lookup('hour'));

    return {
      hour,
      label: `${lookup('hour')}:${lookup('minute')}`,
      weekday: lookup('weekday'),
      // Rough but universally understood split: anything from 20:00 to
      // 05:59 reads as night for the sun/moon indicator.
      isNight: hour >= 20 || hour < 6
    };
  } catch {
    return null;
  }
}

// Difference in whole hours between two timezones, right now. Signed from
// A's perspective: +7 means B is seven hours ahead of A.
export function hourOffsetBetween(timezoneA, timezoneB, reference = new Date()) {
  if (!timezoneA || !timezoneB) return null;

  const offsetOf = (timezone) => {
    try {
      const asUtc = new Date(reference.toLocaleString('en-US', { timeZone: 'UTC' }));
      const asZone = new Date(reference.toLocaleString('en-US', { timeZone: timezone }));
      return (asZone.getTime() - asUtc.getTime()) / 3600000;
    } catch {
      return null;
    }
  };

  const a = offsetOf(timezoneA);
  const b = offsetOf(timezoneB);
  if (a == null || b == null) return null;

  return Math.round(b - a);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mime });
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
