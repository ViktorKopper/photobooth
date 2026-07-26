// Tunable constants, gathered so they aren't scattered across the modules
// that happen to use them.

// The day this became "us". Fixed rather than user-entered — every booth
// counts from the same start, so the day count is a property of the couple,
// not something to re-type per room.
export const ANNIVERSARY_DATE = '2026-01-13';

// Head start before the visible countdown begins, measured from the moment
// Firestore resolves the request's server timestamp. Covers realtime
// propagation to both devices (usually well under a second) plus a "get
// ready" beat. The chosen countdown length is added on top of this.
export const SYNC_LEAD_MS = 3000;

// Countdown lengths offered before each shot. 3s is the quick "I'm already in
// frame" case; 10s is enough to prop the phone up and walk into shot.
export const TIMER_OPTIONS = [3, 10];

// One tick per second, so a timer labelled 10s actually lasts 10 seconds.
// (The old countdown ran at 750ms, which nobody noticed over 3 numbers but
// would quietly cost you 2.5s of running time over 10.)
export const COUNTDOWN_TICK_MS = 1000;

// A shooting stamp is never cleared — it's simply allowed to go stale, so a
// browser closing mid-countdown can't strand the indicator. The window covers
// the longest countdown plus the moment of capture.
export const SHOOTING_WINDOW_MS = 16000;

// Local times drift while the room stays open, so the status card is nudged
// this often. Cheap: it only rewrites one small block.
export const CLOCK_TICK_MS = 30000;

// How often a browser says "still here". Long enough that a booth left open all
// evening costs a trivial number of writes; short enough that arriving feels
// immediate to the other side.
export const PRESENCE_PING_MS = 40000;

// How stale a heartbeat may get before the other person reads as gone. Wider
// than the ping interval by enough to survive one dropped write or a phone
// briefly asleep, so the light doesn't flicker.
export const PRESENCE_WINDOW_MS = 110000;

// How long a booth lives. Matches the Storage lifecycle rule exactly, so the
// photos and the room document they belong to disappear together rather than
// leaving one orphaned by the other.
export const ROOM_TTL_DAYS = 2;

// A poke older than this is history, not a nudge. Opening a booth to hearts
// someone sent last night would misrepresent when they were thinking of you.
export const POKE_FRESH_MS = 60000;

// Ink colours for each person's handwriting on a photo.
export const CAPTION_INK = {
  viktor: '#2a5a86',
  jericka: '#9b2948'
};
