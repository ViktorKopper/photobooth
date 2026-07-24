// A local record of every booth this browser has opened, so old rooms can
// be cleaned up automatically.
//
// Why local rather than a Firestore query: firestore.rules deliberately set
// `allow list: if false` on /rooms, meaning nobody — not even a signed-in
// participant — can enumerate rooms. That's what keeps a private booth
// private: room IDs are long random strings, and without list access an
// unknown ID is effectively unreachable. Opening listing up just to find
// expired rooms would trade that away, so instead each device remembers
// the rooms it took part in and prunes those.

const STORAGE_KEY = 'photobooth-rooms';

export const ROOM_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry) => entry && typeof entry.roomId === 'string' && Number.isFinite(entry.at));
  } catch {
    return [];
  }
}

function writeAll(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage can be unavailable (private mode, quota). Cleanup is a
    // nicety — never let it break entering a booth.
  }
}

export function listRooms() {
  return readAll();
}

export function rememberRoom(roomId) {
  if (!roomId) return;
  const entries = readAll().filter((entry) => entry.roomId !== roomId);
  entries.push({ roomId, at: Date.now() });
  writeAll(entries);
}

export function forgetRoom(roomId) {
  writeAll(readAll().filter((entry) => entry.roomId !== roomId));
}

export function forgetAllRooms() {
  writeAll([]);
}

// Rooms older than the cutoff, optionally excluding one the person is
// actively opening right now — deleting the booth they just clicked into
// would be baffling, even if it is technically past its expiry.
export function expiredRoomIds({ maxAgeMs = ROOM_MAX_AGE_MS, exclude = '' } = {}) {
  const cutoff = Date.now() - maxAgeMs;
  return readAll()
    .filter((entry) => entry.at < cutoff && entry.roomId !== exclude)
    .map((entry) => entry.roomId);
}
