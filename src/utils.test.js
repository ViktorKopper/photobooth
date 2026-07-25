import { describe, expect, it } from 'vitest';
import {
  clamp,
  dayDeltaBetween,
  daysTogether,
  distanceBetween,
  formatDistanceKm,
  haversineKm,
  hourOffsetBetween,
  isUsableLocation,
  milestoneFor,
  normalizeRoomCode,
  sanitizeCaption,
  sanitizeCollageMessage,
  sanitizeLocation,
  streakFrom,
  timeInZone
} from './utils.js';

const BRATISLAVA = { name: 'Bratislava', country: 'Slovakia', latitude: 48.14816, longitude: 17.10674, timezone: 'Europe/Bratislava' };
const MANILA = { name: 'Manila', country: 'Philippines', latitude: 14.6042, longitude: 120.9822, timezone: 'Asia/Manila' };
const VIENNA = { latitude: 48.20849, longitude: 16.37208, timezone: 'Europe/Vienna' };
const NEW_YORK = { latitude: 40.71427, longitude: -74.00597, timezone: 'America/New_York' };

describe('haversineKm', () => {
  it('matches known real-world distances', () => {
    // Bratislava to Vienna is the classic "55 km" pair.
    expect(haversineKm(BRATISLAVA.latitude, BRATISLAVA.longitude, VIENNA.latitude, VIENNA.longitude))
      .toBeCloseTo(55, 0);

    const toNewYork = haversineKm(
      BRATISLAVA.latitude,
      BRATISLAVA.longitude,
      NEW_YORK.latitude,
      NEW_YORK.longitude
    );
    expect(toNewYork).toBeGreaterThan(6800);
    expect(toNewYork).toBeLessThan(6900);
  });

  it('is zero for a point against itself', () => {
    expect(haversineKm(48.1, 17.1, 48.1, 17.1)).toBe(0);
  });

  it('is symmetric', () => {
    const there = haversineKm(48.1, 17.1, 14.6, 120.9);
    const back = haversineKm(14.6, 120.9, 48.1, 17.1);
    expect(there).toBeCloseTo(back, 6);
  });

  it('handles antipodal points without NaN', () => {
    // The sqrt argument can drift just past 1 here, which is why the
    // implementation clamps it.
    expect(Number.isNaN(haversineKm(0, 0, 0, 180))).toBe(false);
    expect(haversineKm(0, 0, 0, 180)).toBeCloseTo(20015, 0);
  });
});

describe('distanceBetween', () => {
  it('returns null unless both locations are usable', () => {
    expect(distanceBetween(BRATISLAVA, null)).toBeNull();
    expect(distanceBetween(null, MANILA)).toBeNull();
    expect(distanceBetween(BRATISLAVA, { latitude: 1 })).toBeNull();
  });

  it('measures between two real cities', () => {
    expect(distanceBetween(BRATISLAVA, VIENNA)).toBeCloseTo(55, 0);
  });
});

describe('formatDistanceKm', () => {
  it('groups thousands without a comma', () => {
    expect(formatDistanceKm(9797)).toBe('9 797 km');
    expect(formatDistanceKm(55)).toBe('55 km');
  });

  it('has a friendly case for touching distance', () => {
    expect(formatDistanceKm(0)).toBe('right next to each other');
    expect(formatDistanceKm(0.4)).toBe('right next to each other');
  });

  it('returns empty for nothing to format', () => {
    expect(formatDistanceKm(null)).toBe('');
    expect(formatDistanceKm(undefined)).toBe('');
  });
});

describe('daysTogether', () => {
  const START = '2026-01-13';

  it('counts the first day as day one', () => {
    expect(daysTogether(START, new Date('2026-01-13T12:00:00'))).toBe(1);
  });

  it('counts inclusively', () => {
    expect(daysTogether(START, new Date('2026-01-14T12:00:00'))).toBe(2);
    expect(daysTogether(START, new Date('2026-07-24T12:00:00'))).toBe(193);
  });

  it('ignores the time of day', () => {
    const early = daysTogether(START, new Date('2026-03-01T00:01:00'));
    const late = daysTogether(START, new Date('2026-03-01T23:59:00'));
    expect(early).toBe(late);
  });

  it('does not lose a day across a daylight-saving change', () => {
    // Regression guard. Measuring between two local midnights that straddle
    // a clock change leaves a 23-hour "day", which floored the count one
    // short for the entire summer in any DST timezone — including the one
    // this app is used in.
    expect(daysTogether('2026-03-28', new Date('2026-03-29T12:00:00'))).toBe(2);
    expect(daysTogether('2026-03-01', new Date('2026-04-01T12:00:00'))).toBe(32);
    expect(daysTogether('2026-10-24', new Date('2026-10-26T12:00:00'))).toBe(3);
  });

  it('advances by exactly one per calendar day', () => {
    let previous = daysTogether(START, new Date('2026-01-13T12:00:00'));
    for (let day = 14; day <= 31; day += 1) {
      const current = daysTogether(START, new Date(`2026-01-${day}T12:00:00`));
      expect(current).toBe(previous + 1);
      previous = current;
    }
  });

  it('returns null before the start date or without one', () => {
    expect(daysTogether(START, new Date('2026-01-12T12:00:00'))).toBeNull();
    expect(daysTogether('')).toBeNull();
    expect(daysTogether('not-a-date')).toBeNull();
  });
});

describe('milestoneFor', () => {
  it('marks a hundred-day landmark on the day itself', () => {
    expect(milestoneFor(200)).toMatchObject({ reached: true, days: 200 });
    expect(milestoneFor(200).label).toBe('200 days together');
  });

  it('prefers the anniversary wording over the raw day number', () => {
    expect(milestoneFor(365).label).toBe('One year together');
    expect(milestoneFor(730).label).toBe('2 years together');
  });

  it('counts down to whichever landmark comes first', () => {
    expect(milestoneFor(192)).toMatchObject({ reached: false, days: 200, remaining: 8 });
    // 365 arrives before 400, so the year wins here.
    expect(milestoneFor(350)).toMatchObject({ reached: false, days: 365, remaining: 15 });
    // ...but past it, the next hundred is nearer again.
    expect(milestoneFor(370)).toMatchObject({ reached: false, days: 400, remaining: 30 });
  });

  it('always leaves at least one day to go', () => {
    for (let day = 1; day < 800; day += 1) {
      const milestone = milestoneFor(day);
      if (!milestone.reached) {
        expect(milestone.remaining).toBeGreaterThan(0);
        expect(milestone.days).toBeGreaterThan(day);
      }
    }
  });

  it('returns null for nonsense', () => {
    expect(milestoneFor(0)).toBeNull();
    expect(milestoneFor(-5)).toBeNull();
    expect(milestoneFor(null)).toBeNull();
  });
});

describe('streakFrom', () => {
  const at = (daysAgo, hour = 12) => {
    const date = new Date(2026, 6, 24 - daysAgo, hour);
    return { roomId: `R${daysAgo}`, at: date.getTime() };
  };
  const TODAY = new Date(2026, 6, 24, 18);

  it('counts consecutive days back from today', () => {
    expect(streakFrom([at(0), at(1), at(2)], TODAY)).toBe(3);
  });

  it('stops at the first gap', () => {
    expect(streakFrom([at(0), at(1), at(3), at(4)], TODAY)).toBe(2);
  });

  it('keeps the streak alive if the last booth was yesterday', () => {
    expect(streakFrom([at(1), at(2)], TODAY)).toBe(2);
  });

  it('breaks once a whole day has been missed', () => {
    expect(streakFrom([at(2), at(3)], TODAY)).toBe(0);
  });

  it('counts several booths in one day only once', () => {
    expect(streakFrom([at(0, 9), at(0, 14), at(0, 22), at(1)], TODAY)).toBe(2);
  });

  it('treats late night and just after midnight as different days', () => {
    const lateLastNight = { roomId: 'A', at: new Date(2026, 6, 23, 23, 50).getTime() };
    const justAfterMidnight = { roomId: 'B', at: new Date(2026, 6, 24, 0, 10).getTime() };
    expect(streakFrom([lateLastNight, justAfterMidnight], TODAY)).toBe(2);
  });

  it('handles nothing at all', () => {
    expect(streakFrom([], TODAY)).toBe(0);
    expect(streakFrom(null, TODAY)).toBe(0);
    expect(streakFrom([{ roomId: 'X' }], TODAY)).toBe(0);
  });
});

describe('timeInZone', () => {
  const AT = new Date('2026-07-24T20:30:00Z');

  it('reads the wall clock in a named zone', () => {
    expect(timeInZone('Europe/Bratislava', AT).label).toBe('22:30');
    expect(timeInZone('Asia/Manila', AT).label).toBe('04:30');
  });

  it('exposes a sortable calendar day for comparing zones', () => {
    expect(timeInZone('Europe/Bratislava', AT).dateKey).toBe('2026-07-24');
    expect(timeInZone('Asia/Manila', AT).dateKey).toBe('2026-07-25');
  });

  it('flags night between 20:00 and 06:00', () => {
    expect(timeInZone('Europe/Bratislava', AT).isNight).toBe(true);
    expect(timeInZone('Asia/Manila', AT).isNight).toBe(true);
    expect(timeInZone('Europe/Bratislava', new Date('2026-07-24T10:00:00Z')).isNight).toBe(false);
  });

  it('returns null for a missing or bogus zone', () => {
    expect(timeInZone('')).toBeNull();
    expect(timeInZone('Not/AZone')).toBeNull();
  });
});

describe('dayDeltaBetween', () => {
  it('detects when the partner is already on the next day', () => {
    const at = new Date('2026-07-24T20:30:00Z');
    const here = timeInZone('Europe/Bratislava', at);
    const there = timeInZone('Asia/Manila', at);
    expect(dayDeltaBetween(here, there)).toBe(1);
  });

  it('detects when the partner is still on the previous day', () => {
    const at = new Date('2026-07-24T02:00:00Z');
    const here = timeInZone('Europe/Bratislava', at);
    const there = timeInZone('America/New_York', at);
    expect(dayDeltaBetween(here, there)).toBe(-1);
  });

  it('is zero on the same day', () => {
    const at = new Date('2026-07-24T08:00:00Z');
    expect(dayDeltaBetween(timeInZone('Europe/Bratislava', at), timeInZone('Asia/Manila', at))).toBe(0);
  });

  it('returns null when either clock is unreadable', () => {
    expect(dayDeltaBetween(null, timeInZone('Asia/Manila'))).toBeNull();
  });
});

describe('hourOffsetBetween', () => {
  const AT = new Date('2026-07-24T12:00:00Z');

  it('is signed from the first zone towards the second', () => {
    expect(hourOffsetBetween('Europe/Bratislava', 'Asia/Manila', AT)).toBe(6);
    expect(hourOffsetBetween('Europe/Bratislava', 'America/New_York', AT)).toBe(-6);
  });

  it('is zero within one zone', () => {
    expect(hourOffsetBetween('Europe/Bratislava', 'Europe/Bratislava', AT)).toBe(0);
  });

  it('returns null without both zones', () => {
    expect(hourOffsetBetween('', 'Asia/Manila', AT)).toBeNull();
  });
});

describe('sanitizeLocation', () => {
  it('keeps only the fields worth storing', () => {
    expect(sanitizeLocation({ ...MANILA, population: 1780148, junk: 'x' })).toEqual({
      name: 'Manila',
      country: 'Philippines',
      latitude: 14.6042,
      longitude: 120.9822,
      timezone: 'Asia/Manila'
    });
  });

  it('rejects anything without usable coordinates', () => {
    expect(sanitizeLocation({ name: 'Nowhere' })).toBeNull();
    expect(sanitizeLocation(null)).toBeNull();
    expect(sanitizeLocation({ latitude: '48', longitude: 17, timezone: 'Europe/Bratislava' })).toBeNull();
  });

  it('caps long strings so they stay within the Firestore rules', () => {
    const long = sanitizeLocation({ ...MANILA, name: 'x'.repeat(200) });
    expect(long.name).toHaveLength(60);
  });
});

describe('isUsableLocation', () => {
  it('needs coordinates and a timezone', () => {
    expect(isUsableLocation(BRATISLAVA)).toBe(true);
    expect(isUsableLocation({ latitude: 1, longitude: 2 })).toBe(false);
    expect(isUsableLocation({ latitude: 1, longitude: 2, timezone: '' })).toBe(false);
    expect(isUsableLocation(null)).toBe(false);
  });
});

describe('caption and message sanitising', () => {
  it('allows an empty caption but caps its length', () => {
    expect(sanitizeCaption('')).toBe('');
    expect(sanitizeCaption('  hello  ')).toBe('hello');
    expect(sanitizeCaption('x'.repeat(100))).toHaveLength(36);
  });

  it('falls back to a default collage message but never for captions', () => {
    expect(sanitizeCollageMessage('   ')).toBe('Our little photobooth memory');
    expect(sanitizeCaption('   ')).toBe('');
  });

  it('survives null and undefined', () => {
    expect(sanitizeCaption(null)).toBe('');
    expect(sanitizeCaption(undefined)).toBe('');
  });
});

describe('normalizeRoomCode', () => {
  it('strips punctuation and upper-cases', () => {
    expect(normalizeRoomCode('lqlc9-hxf dntl')).toBe('LQLC9HXFDNTL');
  });
});

describe('clamp', () => {
  it('bounds a value both ways', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-5, 1, 3)).toBe(1);
    expect(clamp(2, 1, 3)).toBe(2);
  });
});
