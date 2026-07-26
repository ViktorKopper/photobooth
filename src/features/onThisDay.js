// "A year ago today."
//
// The keepsake list already carries a `savedAt` for every collage either of you
// has ever opened, and it sits in localStorage doing nothing but ordering a
// grid. This is the one thing that data is actually good for: walking into the
// app on an ordinary Tuesday and being handed a specific evening back.
//
// Deliberately narrow. It only speaks on the anniversary of a collage, give or
// take a day for the timezone the photo was saved in — a "roughly last spring"
// feature would fire constantly and mean nothing.

import { anniversaryYearsBetween, dayOfYearDistance } from '../utils.js';

// A day either side, so a collage saved late at night in Manila still counts as
// the same date for someone reading it in Bratislava.
const DAY_WINDOW = 1;

/**
 * The oldest keepsake whose anniversary is today, or null.
 *
 * Oldest rather than newest on purpose: if two land on the same date, "three
 * years ago" is a better thing to be handed than "one year ago".
 */
export function keepsakeFromToday(keepsakes, now = Date.now()) {
  if (!Array.isArray(keepsakes)) return null;

  const matches = keepsakes
    .map((keepsake) => {
      const savedAt = Number(keepsake?.savedAt);
      if (!Number.isFinite(savedAt) || savedAt <= 0) return null;

      const years = anniversaryYearsBetween(savedAt, now);
      if (years < 1) return null;
      if (dayOfYearDistance(savedAt, now) > DAY_WINDOW) return null;

      return { ...keepsake, years };
    })
    .filter(Boolean);

  if (!matches.length) return null;

  return matches.reduce((oldest, entry) => (entry.years > oldest.years ? entry : oldest));
}

export function yearsAgoLabel(years) {
  return years === 1 ? 'A year ago today' : `${years} years ago today`;
}
