// A local index of collages that have been saved to a booth.
//
// The files themselves live in Storage under `keepsakes/` and outlive the
// room, but Firestore can't be queried for them: /rooms is deliberately
// not listable, and the room document is gone within two days anyway. So
// each device keeps its own note of what it has seen.
//
// Crucially this is recorded by *both* partners — whoever saves the
// collage and whoever merely opens the room afterwards — so neither of you
// ends up as the only one holding the memory.

const STORAGE_KEY = 'photobooth-keepsakes';
const MAX_KEEPSAKES = 60;

function readAll() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry) => entry && typeof entry.roomId === 'string' && typeof entry.url === 'string'
    );
  } catch {
    return [];
  }
}

function writeAll(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-MAX_KEEPSAKES)));
  } catch {
    // Storage can be unavailable or full. The gallery is a convenience —
    // never let it break the booth around it.
  }
}

// Newest first, which is the order anyone actually wants to browse them in.
export function listKeepsakes() {
  return readAll().slice().reverse();
}

export function rememberKeepsake({ roomId, url, savedAt = Date.now(), theme = '', layout = '' }) {
  if (!roomId || !url) return;

  const entries = readAll().filter((entry) => entry.roomId !== roomId);
  entries.push({ roomId, url, savedAt, theme, layout });
  writeAll(entries);
}

export function forgetKeepsake(roomId) {
  writeAll(readAll().filter((entry) => entry.roomId !== roomId));
}

export function forgetAllKeepsakes() {
  writeAll([]);
}
