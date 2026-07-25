import { describe, expect, it } from 'vitest';
import { ICONS, weatherIcon } from './icons.js';

describe('icon set', () => {
  it('every icon is a self-contained svg', () => {
    Object.entries(ICONS).forEach(([name, markup]) => {
      expect(markup, name).toMatch(/^<svg /);
      expect(markup, name).toContain('viewBox="0 0 24 24"');
      expect(markup, name).toContain('</svg>');
    });
  });

  it('icons are decorative and inherit their colour', () => {
    Object.entries(ICONS).forEach(([name, markup]) => {
      // Screen readers should skip them; the surrounding label carries the
      // meaning.
      expect(markup, name).toContain('aria-hidden="true"');
      // No baked-in hex values — they must follow the text colour so the
      // day and night themes both work.
      expect(markup, name).not.toMatch(/#[0-9a-f]{3,6}/i);
    });
  });
});

describe('weatherIcon', () => {
  // The WMO codes Open-Meteo actually emits, mapped to the drawing that
  // should represent them.
  const cases = [
    [0, 'sun'],
    [1, 'cloudSun'],
    [2, 'cloudSun'],
    [3, 'cloud'],
    [45, 'fog'],
    [48, 'fog'],
    [51, 'rain'],
    [61, 'rain'],
    [65, 'rain'],
    [71, 'snow'],
    [77, 'snow'],
    [80, 'rain'],
    [82, 'rain'],
    [85, 'snow'],
    [95, 'storm'],
    [99, 'storm']
  ];

  it.each(cases)('code %i maps to %s', (code, name) => {
    expect(weatherIcon(code)).toBe(ICONS[name]);
  });

  it('falls back to a thermometer for unknown codes rather than claiming sunshine', () => {
    // This is the regression guard for a real bug: a negative sentinel used
    // to slip into the first bucket and cheerfully report clear skies.
    expect(weatherIcon(-1)).toBe(ICONS.thermometer);
    expect(weatherIcon(undefined)).toBe(ICONS.thermometer);
    expect(weatherIcon(null)).toBe(ICONS.thermometer);
    expect(weatherIcon(NaN)).toBe(ICONS.thermometer);
    expect(weatherIcon(500)).toBe(ICONS.thermometer);
  });
});
