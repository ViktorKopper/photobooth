// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { COLLAGE_THEMES, EXPORT_PRESETS } from '../collage.js';
import { FILTERS } from '../filters.js';
import { POSE_PROMPTS } from '../prompts.js';
import { ROOM_TTL_DAYS } from '../config.js';
import { MAX_STICKERS, STICKERS } from '../stickers.js';
import { buildGuidePanel, wireGuidePanel } from './guide.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const sections = () => $$('.guide-section');
const openSections = () => $$('.guide-section.open');
const toggleFor = (id) => $(`[data-guide-section="${id}"] .guide-toggle`);
const bodyFor = (id) => $(`[data-guide-section="${id}"] .guide-body`);

beforeEach(() => {
  document.body.innerHTML = buildGuidePanel();
  wireGuidePanel();
});

describe('structure', () => {
  it('renders every section', () => {
    expect(sections().map((node) => node.dataset.guideSection)).toEqual([
      'start',
      'shoot',
      'decorate',
      'together',
      'collage',
      'keep',
      'privacy',
      'install'
    ]);
  });

  it('leaves the install guide until last', () => {
    // It's the one thing you do once, so it shouldn't sit above the parts you
    // come back to.
    expect(sections().at(-1).dataset.guideSection).toBe('install');
  });

  it('starts with exactly one section open', () => {
    // Open enough to read as help rather than decoration, closed enough not to
    // become a wall of text beside the camera.
    expect(openSections()).toHaveLength(1);
    expect(openSections()[0].dataset.guideSection).toBe('start');
  });

  it('keeps the collapsed bodies out of the page, not just off screen', () => {
    // `hidden` rather than a class alone, so collapsed text stays out of the
    // accessibility tree and out of ctrl-F.
    expect(bodyFor('collage').hidden).toBe(true);
    expect(bodyFor('start').hidden).toBe(false);
  });

  it('labels the panel for assistive tech', () => {
    expect($('.guide-card').getAttribute('aria-label')).toBe('How the booth works');
  });

  it('ties each heading to the body it controls', () => {
    sections().forEach((section) => {
      const toggle = section.querySelector('.guide-toggle');
      const body = section.querySelector('.guide-body');
      expect(toggle.getAttribute('aria-controls')).toBe(body.id);
    });
  });

  it('uses drawn icons rather than emoji', () => {
    // The whole point of the icon set: an emoji is rendered by the OS and
    // looks foreign against hand-drawn lettering.
    expect($$('.guide-card svg').length).toBeGreaterThan(5);
    expect($('.guide-card').textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });

  it('draws its icons instead of printing their source', () => {
    // The bug this replaced: row() escaped the whole term, so an icon glued
    // onto the front of it came out as literal SVG source on the page. Counting
    // <svg> elements did not catch it — the section headers had real ones — so
    // this asserts on the rendered text instead.
    expect($('.guide-card').textContent).not.toContain('<svg');
    expect($('.guide-card').textContent).not.toContain('viewBox');
  });

  it('draws an icon inside the rows themselves, not only the headings', () => {
    // The rows are where the escaping bug lived, so the assertion has to reach
    // inside one. The collage section is excluded on purpose: its rows are
    // theme and format names, which read better as a plain list.
    ['shoot', 'decorate', 'together', 'keep', 'privacy'].forEach((id) => {
      const terms = [...bodyFor(id).querySelectorAll('.guide-row dt')];
      expect(terms.length).toBeGreaterThan(0);
      expect(terms.every((dt) => dt.querySelector('svg'))).toBe(true);
    });
  });

  it('still escapes the text around those icons', () => {
    // The icon is trusted markup from our own set; everything beside it is
    // text and must stay text.
    const escaped = buildGuidePanel();
    expect(escaped).not.toMatch(/<dt><svg[^>]*>[\s\S]*?<\/svg><[a-z]/);
  });
});

describe('opening and closing', () => {
  it('opens a closed section on click', () => {
    toggleFor('collage').click();
    expect(bodyFor('collage').hidden).toBe(false);
    expect(toggleFor('collage').getAttribute('aria-expanded')).toBe('true');
  });

  it('closes an open one again', () => {
    toggleFor('start').click();
    expect(bodyFor('start').hidden).toBe(true);
    expect(toggleFor('start').getAttribute('aria-expanded')).toBe('false');
  });

  it('lets several be open at once', () => {
    // Reference material, not a wizard — comparing two sections is a normal
    // thing to want.
    toggleFor('collage').click();
    toggleFor('keep').click();
    expect(openSections()).toHaveLength(3);
  });

  it('opens the newer sections too', () => {
    toggleFor('decorate').click();
    toggleFor('together').click();
    expect(bodyFor('decorate').hidden).toBe(false);
    expect(bodyFor('together').hidden).toBe(false);
  });

  it('responds to a click on the icon inside the heading', () => {
    $('[data-guide-section="collage"] .guide-toggle-icon').click();
    expect(bodyFor('collage').hidden).toBe(false);
  });

  it('ignores a click on the body text', () => {
    const body = bodyFor('start');
    body.click();
    expect(body.hidden).toBe(false);
  });

  it('survives being mounted twice without doubling its handlers', () => {
    document.body.innerHTML = buildGuidePanel();
    wireGuidePanel();
    wireGuidePanel();

    toggleFor('collage').click();
    // A second listener would toggle it straight back to closed.
    expect(bodyFor('collage').hidden).toBe(false);
  });
});

describe('staying in sync with the app', () => {
  it('describes every collage theme that the picker offers', () => {
    // Generated from COLLAGE_THEMES rather than written out, so adding a theme
    // cannot leave the guide describing the old five.
    const text = bodyFor('collage').textContent;
    COLLAGE_THEMES.forEach((theme) => expect(text).toContain(theme.label));
  });

  it('gives each theme an actual description, not just a name', () => {
    const rows = $$('[data-guide-section="collage"] .guide-row');
    const themeRows = rows.filter((r) =>
      COLLAGE_THEMES.some((t) => r.querySelector('dt').textContent.trim() === t.label)
    );

    expect(themeRows).toHaveLength(COLLAGE_THEMES.length);
    themeRows.forEach((row) => {
      expect(row.querySelector('dd').textContent.trim().length).toBeGreaterThan(20);
    });
  });

  it('lists every export format', () => {
    const text = bodyFor('collage').textContent;
    EXPORT_PRESETS.forEach((preset) => expect(text).toContain(preset.label));
  });

  it('names all three layouts', () => {
    const labels = $$('.guide-layout strong').map((node) => node.textContent);
    expect(labels).toEqual(['Grid', 'Strip', 'Hero']);
  });

  it('states the countdown lengths that are actually offered', () => {
    expect(bodyFor('shoot').textContent).toContain('3s or 10s');
  });

  it('lists every camera filter', () => {
    const text = bodyFor('shoot').textContent;
    FILTERS.forEach((filter) => expect(text).toContain(filter.label));
  });

  it('lists every sticker on the sheet', () => {
    // Generated from STICKERS, so adding one cannot leave the guide describing
    // the old eight.
    const text = bodyFor('decorate').textContent;
    STICKERS.forEach((sticker) => expect(text).toContain(sticker.label));
  });

  it('states how many stickers fit on a photo', () => {
    expect(bodyFor('decorate').textContent).toContain(String(MAX_STICKERS));
  });

  it('states how big the pose deck actually is', () => {
    expect(bodyFor('shoot').textContent).toContain(String(POSE_PROMPTS.length));
  });

  it('warns that a filter is permanent', () => {
    // It is written into the uploaded file, so someone should know before
    // confirming rather than after.
    expect(bodyFor('shoot').textContent).toMatch(/can't be changed afterwards/);
  });
});

describe('content', () => {
  it('explains the numbered path through the app', () => {
    // Scoped to its own section: the install guide has numbered steps too.
    expect(bodyFor('start').querySelectorAll('.guide-steps li')).toHaveLength(4);
  });

  it('explains how to install it to a home screen', () => {
    const text = bodyFor('install').textContent;
    expect(text).toMatch(/Safari/);
    expect(text).toMatch(/Install app/);
  });

  it('covers the thing least likely to be discovered on its own', () => {
    // Save to booth is the difference between one shared keepsake and two
    // divergent ones, and nothing on the button says so.
    expect(bodyFor('keep').textContent).toContain('Save to booth');
    expect(bodyFor('keep').textContent).toMatch(/identical file/);
  });

  it('is honest about the two-day cleanup', () => {
    // This claimed rooms expired long before they actually did — the Storage
    // rule swept the photos and the room document stayed forever. Pinned to the
    // real constant now, so the two cannot drift apart again.
    const text = bodyFor('privacy').textContent;
    expect(text).toMatch(new RegExp(`${ROOM_TTL_DAYS} days`));
    expect(text).toMatch(/collages are kept/i);
  });

  it('says what actually does the deleting', () => {
    // Two separate mechanisms, and neither is obvious from the outside.
    const text = bodyFor('privacy').textContent;
    expect(text).toMatch(/storage rule/i);
    expect(text).toMatch(/Firestore/);
  });

  it('explains the three ways to decorate a photo', () => {
    // None of the three is discoverable from the buttons alone.
    const text = bodyFor('decorate').textContent;
    expect(text).toMatch(/Marker/);
    expect(text).toMatch(/Stickers/);
    expect(text).toMatch(/Write it/);
  });

  it('says decoration reaches the collage, not just the screen', () => {
    // The whole reason it is worth doing.
    expect(bodyFor('decorate').textContent).toMatch(/ends up in the collage/i);
  });

  it('covers what the other person can see of you', () => {
    const text = bodyFor('together').textContent;
    expect(text).toMatch(/She is here/);
    expect(text).toMatch(/Thinking of you/);
  });

  it('is honest that a poke leaves nothing behind', () => {
    expect(bodyFor('together').textContent).toMatch(/felt and then gone/);
  });

  it('says the develop animation can be skipped', () => {
    // Otherwise it reads as four seconds you are forced to sit through.
    expect(bodyFor('collage').textContent).toMatch(/skip/i);
  });

  it('does not promise notifications it cannot deliver', () => {
    // No FCM, so a closed app genuinely cannot be woken.
    expect(bodyFor('privacy').textContent).toMatch(/cannot wake itself/);
  });
});

describe('a missing panel', () => {
  it('does not throw when there is nothing to wire', () => {
    document.body.innerHTML = '';
    expect(() => wireGuidePanel()).not.toThrow();
  });
});
