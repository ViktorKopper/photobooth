// The day/night switch.
//
// The initial theme is set by an inline script in index.html, before first
// paint, from either a saved preference or the system setting. This module
// only takes over once someone flips it by hand.

import { ICONS } from '../icons.js';

export function mountThemeToggle() {
  if (document.querySelector('#themeToggle')) return;

  const button = document.createElement('button');
  button.type = 'button';
  button.id = 'themeToggle';
  button.className = 'theme-toggle';
  button.innerHTML = `
    <span class="theme-toggle-icon theme-toggle-sun">${ICONS.sun}</span>
    <span class="theme-toggle-icon theme-toggle-moon">${ICONS.moon}</span>
    <span class="theme-toggle-knob"></span>
  `;

  const sync = () => {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    button.setAttribute('aria-pressed', String(dark));
    button.setAttribute('aria-label', dark ? 'Switch to day theme' : 'Switch to night theme');
    button.title = dark ? 'Day' : 'Night';

    // Keep the browser chrome and PWA status bar in step with the choice.
    document
      .querySelectorAll('meta[name="theme-color"]')
      .forEach((meta) => meta.setAttribute('content', dark ? '#211a1d' : '#f8b6c8'));
  };

  button.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('photobooth-theme', next);
    } catch {
      // A saved preference is a nicety; the toggle still works without it.
    }
    sync();
  });

  document.body.appendChild(button);
  sync();
}
