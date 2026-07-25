// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { mountThemeToggle } from './theme.js';

const toggle = () => document.querySelector('#themeToggle');
const themeNow = () => document.documentElement.getAttribute('data-theme');

function setup(initial = 'light') {
  document.body.innerHTML = '';
  document.head.innerHTML =
    '<meta name="theme-color" content="#f8b6c8" media="(prefers-color-scheme: light)" />' +
    '<meta name="theme-color" content="#211a1d" media="(prefers-color-scheme: dark)" />';
  document.documentElement.setAttribute('data-theme', initial);
  localStorage.clear();
}

beforeEach(() => setup());

describe('mountThemeToggle', () => {
  it('mounts once, however many times it is called', () => {
    mountThemeToggle();
    mountThemeToggle();
    expect(document.querySelectorAll('#themeToggle')).toHaveLength(1);
  });

  it('does not decide the theme itself — that happens before first paint', () => {
    setup('dark');
    mountThemeToggle();
    // Mounting must leave the pre-paint choice alone, or the page would
    // flash the wrong theme on every load.
    expect(themeNow()).toBe('dark');
  });

  it('flips the theme and remembers the choice', () => {
    mountThemeToggle();

    toggle().click();
    expect(themeNow()).toBe('dark');
    expect(localStorage.getItem('photobooth-theme')).toBe('dark');

    toggle().click();
    expect(themeNow()).toBe('light');
    expect(localStorage.getItem('photobooth-theme')).toBe('light');
  });

  it('keeps the browser chrome colour in step', () => {
    mountThemeToggle();
    toggle().click();

    const colours = [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
      meta.getAttribute('content')
    );
    expect(new Set(colours)).toEqual(new Set(['#211a1d']));

    toggle().click();
    const afterLight = [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
      meta.getAttribute('content')
    );
    expect(new Set(afterLight)).toEqual(new Set(['#f8b6c8']));
  });

  it('describes its own state to assistive tech', () => {
    mountThemeToggle();

    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(toggle().getAttribute('aria-label')).toMatch(/night/i);

    toggle().click();
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().getAttribute('aria-label')).toMatch(/day/i);
  });

  it('still switches when storage refuses to save', () => {
    const original = localStorage.setItem;
    localStorage.setItem = () => {
      throw new Error('quota exceeded');
    };

    mountThemeToggle();
    expect(() => toggle().click()).not.toThrow();
    expect(themeNow()).toBe('dark');

    localStorage.setItem = original;
  });
});
