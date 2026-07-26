// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Firebase is stubbed at the module boundary. These tests are about what
// the screens put on the page, not about Firestore — and importing the real
// SDK would try to open a network connection the moment app.js loads.
vi.mock('./firebase.js', () => ({
  app: {},
  auth: {},
  ensureAnonymousAuth: vi.fn(async () => ({ uid: 'test-uid' }))
}));

// Seeded before the import, deliberately. The saved city is read into state
// once, when the module loads — the same thing that happens on a real page
// load. Writing it to localStorage after the import would change nothing.
localStorage.setItem(
  'photobooth-location',
  JSON.stringify({
    name: 'Bratislava',
    country: 'Slovakia',
    latitude: 48.14816,
    longitude: 17.10674,
    timezone: 'Europe/Bratislava'
  })
);

const { renderLanding, renderJoinByCode, renderRoleGate, renderLocationGate } =
  await import('./app.js');

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
});

describe('renderLanding', () => {
  it('renders into #app without a page having existed at import time', () => {
    // The whole point of splitting app.js from main.js: importing it must
    // not require a DOM, but rendering into one later must still work.
    renderLanding();
    expect($('#app').children.length).toBeGreaterThan(0);
  });

  it('offers both ways in', () => {
    renderLanding();
    expect($('#createBtn')).not.toBeNull();
    expect($('#joinBtn')).not.toBeNull();
  });

  it('asks for a city, since one is required to enter a booth', () => {
    renderLanding();
    expect($('#cityInput')).not.toBeNull();
  });

  it('shows the day count', () => {
    renderLanding();
    expect($('#landingDays').textContent).toMatch(/Together for \d+ days/);
  });

  it('hides the danger zone when there are no booths to delete', () => {
    renderLanding();
    expect($('#resetAllBtn')).toBeNull();
  });

  it('offers to delete booths once some exist', () => {
    localStorage.setItem(
      'photobooth-rooms',
      JSON.stringify([{ roomId: 'AAAAAAAAAAAA', at: Date.now() }])
    );
    renderLanding();
    expect($('#resetAllBtn')).not.toBeNull();
  });

  it('shows saved collages once there are any', () => {
    expect($('.keepsakes')).toBeNull();

    localStorage.setItem(
      'photobooth-keepsakes',
      JSON.stringify([{ roomId: 'AAAAAAAAAAAA', url: 'https://example.test/a.png' }])
    );
    renderLanding();
    expect($$('a.keepsake')).toHaveLength(1);
  });

  it('restores the city saved on a previous visit', () => {
    renderLanding();
    expect($('#cityInput').value).toBe('Bratislava, Slovakia');
  });

  it('shows the local time for that city alongside it', () => {
    renderLanding();
    const preview = $('#cityPreview');
    expect(preview.classList.contains('hidden')).toBe(false);
    expect(preview.textContent).toContain('Bratislava');
  });

  it('can be rendered twice without stacking up duplicates', () => {
    renderLanding();
    renderLanding();
    expect($$('#createBtn')).toHaveLength(1);
  });
});

describe('renderJoinByCode', () => {
  beforeEach(() => renderJoinByCode());

  it('asks for a code and a way to continue', () => {
    expect($('#roomInput')).not.toBeNull();
    expect($('#continueBtn')).not.toBeNull();
  });

  it('rejects an empty code rather than proceeding', () => {
    $('#continueBtn').click();
    // Still on the same screen, with the field flagged.
    expect($('#roomInput')).not.toBeNull();
    expect($('#roomInput').classList.contains('input-error')).toBe(true);
  });

  it('accepts a full share link, not just a bare code', () => {
    $('#roomInput').value = 'https://example.test/?room=LQLC9HXFDNTL';
    $('#continueBtn').click();
    // Moved on to the role picker.
    expect($$('.role-card')).toHaveLength(2);
  });

  it('normalises a messily typed code', () => {
    $('#roomInput').value = ' lqlc9-hxf dntl ';
    $('#continueBtn').click();
    expect($$('.role-card')).toHaveLength(2);
  });
});

describe('renderRoleGate', () => {
  it('offers exactly the two people', () => {
    renderRoleGate('create');
    const roles = $$('.role-card').map((card) => card.dataset.role);
    expect(roles).toEqual(['viktor', 'jericka']);
  });

  it('asks a different question when creating than when joining', () => {
    renderRoleGate('create');
    const creating = $('h1').textContent;

    renderRoleGate('join');
    expect($('h1').textContent).not.toBe(creating);
  });

  it('remembers which person was chosen', () => {
    renderRoleGate('create');
    $('.role-card[data-role="jericka"]').click();
    expect(localStorage.getItem('photobooth-role')).toBe('jericka');
  });
});

describe('renderLocationGate', () => {
  beforeEach(() => renderLocationGate('join'));

  it('asks for a city', () => {
    expect($('#cityInput')).not.toBeNull();
    expect($('#locationContinueBtn')).not.toBeNull();
  });

  it('prefills the saved city and lets someone through', () => {
    // A booth cannot be entered without a city, and someone arriving from a
    // shared link skips the landing page — so this gate is the only place
    // they would ever be asked.
    expect($('#cityInput').value).toBe('Bratislava, Slovakia');
    expect($('#locationContinueBtn').disabled).toBe(false);
  });

  it('can be backed out of', () => {
    expect($('#backBtn')).not.toBeNull();
    $('#backBtn').click();
    expect($$('.role-card')).toHaveLength(2);
  });
});
