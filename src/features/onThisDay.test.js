import { describe, expect, it } from 'vitest';
import { anniversaryYearsBetween, dayOfYearDistance } from '../utils.js';
import { keepsakeFromToday, yearsAgoLabel } from './onThisDay.js';

const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const keepsake = (savedAt, roomId = 'AAA') => ({
  roomId,
  url: `https://example.test/${roomId}.png`,
  savedAt
});

describe('anniversaryYearsBetween', () => {
  it('counts a full year', () => {
    expect(anniversaryYearsBetween(at(2025, 7, 26), at(2026, 7, 26))).toBe(1);
  });

  it('counts the day either side of an anniversary as that anniversary', () => {
    // The caller allows a day's slack for timezones, so this has to as well —
    // flooring would report the day before a first anniversary as zero years
    // and swallow the whole thing.
    expect(anniversaryYearsBetween(at(2025, 7, 27), at(2026, 7, 26))).toBe(1);
    expect(anniversaryYearsBetween(at(2025, 7, 25), at(2026, 7, 26))).toBe(1);
  });

  it('counts several', () => {
    expect(anniversaryYearsBetween(at(2020, 3, 1), at(2026, 3, 1))).toBe(6);
  });

  it('survives a leap year', () => {
    expect(anniversaryYearsBetween(at(2024, 2, 29), at(2025, 3, 1))).toBe(1);
  });

  it('does not turn one day into one year at the turn of the year', () => {
    // A calendar-year difference would say 2026 minus 2025 is one.
    expect(anniversaryYearsBetween(at(2025, 12, 31), at(2026, 1, 1))).toBe(0);
  });

  it('is zero for something from this month', () => {
    expect(anniversaryYearsBetween(at(2026, 7, 1), at(2026, 7, 26))).toBe(0);
  });

  it('never goes negative for a date in the future', () => {
    expect(anniversaryYearsBetween(at(2030, 1, 1), at(2026, 1, 1))).toBe(0);
  });
});

describe('dayOfYearDistance', () => {
  it('is zero on the same date in different years', () => {
    expect(dayOfYearDistance(at(2025, 7, 26), at(2026, 7, 26))).toBe(0);
  });

  it('is one for the neighbouring day', () => {
    expect(dayOfYearDistance(at(2025, 7, 26), at(2026, 7, 27))).toBe(1);
  });

  it('treats the year as a circle', () => {
    // 31 December and 1 January are one day apart, not 364.
    expect(dayOfYearDistance(at(2025, 12, 31), at(2026, 1, 1))).toBe(1);
  });

  it('reports genuinely distant dates as distant', () => {
    expect(dayOfYearDistance(at(2025, 1, 1), at(2026, 7, 1))).toBeGreaterThan(150);
  });
});

describe('keepsakeFromToday', () => {
  const TODAY = at(2026, 7, 26);

  it('finds a collage from exactly a year ago', () => {
    const found = keepsakeFromToday([keepsake(at(2025, 7, 26))], TODAY);
    expect(found).not.toBeNull();
    expect(found.years).toBe(1);
  });

  it('allows a day either side for the timezone it was saved in', () => {
    // A collage saved late at night in Manila is the same date for someone
    // reading it in Bratislava.
    expect(keepsakeFromToday([keepsake(at(2025, 7, 25))], TODAY)).not.toBeNull();
    expect(keepsakeFromToday([keepsake(at(2025, 7, 27))], TODAY)).not.toBeNull();
  });

  it('says nothing on an ordinary day', () => {
    // The whole value of this is that it is silent 363 days of the year.
    expect(keepsakeFromToday([keepsake(at(2025, 3, 12))], TODAY)).toBeNull();
  });

  it('says nothing about something from this year', () => {
    expect(keepsakeFromToday([keepsake(at(2026, 7, 26))], TODAY)).toBeNull();
    expect(keepsakeFromToday([keepsake(at(2026, 1, 2))], TODAY)).toBeNull();
  });

  it('prefers the oldest when two land on the same date', () => {
    // "Three years ago" is a better thing to be handed than "one year ago".
    const found = keepsakeFromToday(
      [keepsake(at(2025, 7, 26), 'RECENT'), keepsake(at(2023, 7, 26), 'OLD')],
      TODAY
    );
    expect(found.roomId).toBe('OLD');
    expect(found.years).toBe(3);
  });

  it('carries the collage through, not just the count', () => {
    const found = keepsakeFromToday([keepsake(at(2025, 7, 26))], TODAY);
    expect(found.url).toContain('AAA');
  });

  it('ignores entries with no usable date', () => {
    // Keepsakes recorded before savedAt existed.
    expect(keepsakeFromToday([{ roomId: 'A', url: 'u' }], TODAY)).toBeNull();
    expect(keepsakeFromToday([keepsake(0)], TODAY)).toBeNull();
    expect(keepsakeFromToday([keepsake('yesterday')], TODAY)).toBeNull();
  });

  it('copes with nothing at all', () => {
    expect(keepsakeFromToday([], TODAY)).toBeNull();
    expect(keepsakeFromToday(null, TODAY)).toBeNull();
  });
});

describe('yearsAgoLabel', () => {
  it('says year, not years, for one', () => {
    expect(yearsAgoLabel(1)).toBe('A year ago today');
    expect(yearsAgoLabel(4)).toBe('4 years ago today');
  });
});
