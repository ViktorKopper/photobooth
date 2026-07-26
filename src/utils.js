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

// Both roles in a fixed order, for the many places that have to walk them.
// Ordering matters: it decides which city sits on the left of the distance
// panel, so it must not become an Object.keys() accident.
export const ROLE_KEYS = ['viktor', 'jericka'];

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

  // Both ends are projected onto a UTC midnight before subtracting.
  // Measuring between two *local* midnights looks equivalent but isn't: a
  // clock change between the two dates makes one of them 23 or 25 hours
  // long, the division floors a day early, and the count sits one behind
  // for the whole of summer time.
  const startUtc = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
  const todayUtc = Date.UTC(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );

  if (todayUtc < startUtc) return null;

  return Math.round((todayUtc - startUtc) / 86400000) + 1;
}

// Round numbers worth marking. Hundreds are the everyday rhythm; the
// yearly figures are folded in because "one year" lands harder than "day
// 365" does.
const MILESTONE_STEP = 100;
const YEAR_MILESTONES = [365, 730, 1095, 1460, 1825];

// Describes where the pair sits relative to the next round number: either
// standing on one today, or counting down to it.
export function milestoneFor(dayCount) {
  if (!Number.isFinite(dayCount) || dayCount < 1) return null;

  if (dayCount === 365) return { reached: true, days: dayCount, label: 'One year together' };
  if (YEAR_MILESTONES.includes(dayCount)) {
    return { reached: true, days: dayCount, label: `${dayCount / 365} years together` };
  }
  if (dayCount % MILESTONE_STEP === 0) {
    return { reached: true, days: dayCount, label: `${dayCount} days together` };
  }

  // Whichever comes first: the next hundred, or the next anniversary.
  const nextHundred = (Math.floor(dayCount / MILESTONE_STEP) + 1) * MILESTONE_STEP;
  const nextYear = YEAR_MILESTONES.find((value) => value > dayCount);
  const next = nextYear && nextYear < nextHundred ? nextYear : nextHundred;

  return {
    reached: false,
    days: next,
    remaining: next - dayCount,
    label: next === 365 ? 'one year' : next % 365 === 0 ? `${next / 365} years` : `day ${next}`
  };
}

// How many days in a row the pair has made a booth, counting back from
// today. A gap of a single day ends the run.
//
// Timestamps are bucketed by local calendar day rather than by elapsed
// hours: two booths at 23:50 and 00:10 are on different days even though
// they are twenty minutes apart, and that is how anyone would count it.
export function streakFrom(entries, referenceDate = new Date()) {
  if (!Array.isArray(entries) || !entries.length) return 0;

  const dayNumber = (ms) => {
    const date = new Date(ms);
    return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
  };

  const days = new Set(
    entries.filter((entry) => Number.isFinite(entry?.at)).map((entry) => dayNumber(entry.at))
  );
  if (!days.size) return 0;

  const today = dayNumber(referenceDate.getTime());

  // Yesterday still counts as a live streak — it only breaks once a whole
  // day has passed with nothing in it.
  let cursor = days.has(today) ? today : days.has(today - 1) ? today - 1 : null;
  if (cursor === null) return 0;

  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor -= 1;
  }

  return streak;
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
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour12: false
    }).formatToParts(reference);

    const lookup = (type) => parts.find((part) => part.type === type)?.value ?? '';
    const hour = Number(lookup('hour'));

    return {
      hour,
      label: `${lookup('hour')}:${lookup('minute')}`,
      weekday: lookup('weekday'),
      // Sortable calendar day in this zone, so two zones can be compared
      // directly rather than by guessing from the hour offset.
      dateKey: `${lookup('year')}-${lookup('month')}-${lookup('day')}`,
      // Rough but universally understood split: anything from 20:00 to
      // 05:59 reads as night for the sun/moon indicator.
      isNight: hour >= 20 || hour < 6
    };
  } catch {
    return null;
  }
}

// Whether zone B's calendar day is ahead of, behind, or the same as A's.
// Returns 1, -1 or 0 (null if either clock is unreadable).
export function dayDeltaBetween(clockA, clockB) {
  if (!clockA?.dateKey || !clockB?.dateKey) return null;
  if (clockA.dateKey === clockB.dateKey) return 0;
  return clockB.dateKey > clockA.dateKey ? 1 : -1;
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
