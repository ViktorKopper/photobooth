// @vitest-environment happy-dom

import { beforeEach, describe, expect, it } from 'vitest';
import { buildInstallSection, detectPlatform, isInstalled, wireInstallSection } from './install.js';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const panelFor = (id) => $(`[data-install-panel="${id}"]`);
const tabFor = (id) => $(`[data-install-tab="${id}"]`);
const visiblePanels = () => $$('[data-install-panel]').filter((panel) => !panel.hidden);

function mount(options) {
  document.body.innerHTML = `<div class="guide-card">${buildInstallSection(options)}</div>`;
  wireInstallSection(document);
}

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/122';
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122';

describe('detectPlatform', () => {
  it('spots an iPhone', () => {
    expect(detectPlatform(IPHONE, { maxTouchPoints: 5 })).toBe('ios');
  });

  it('spots an iPad pretending to be a Mac', () => {
    // iPadOS 13+ reports a desktop user agent; the touch points are the only
    // reliable tell, and without this an iPad gets desktop instructions it
    // cannot follow.
    expect(detectPlatform(IPAD_AS_MAC, { maxTouchPoints: 5 })).toBe('ios');
  });

  it('does not mistake a real Mac for an iPad', () => {
    expect(detectPlatform(MAC, { maxTouchPoints: 0 })).toBe('desktop');
  });

  it('spots Android', () => {
    expect(detectPlatform(ANDROID, { maxTouchPoints: 5 })).toBe('android');
  });

  it('falls back to desktop for anything unrecognised', () => {
    expect(detectPlatform('SomeFutureBrowser/1.0', { maxTouchPoints: 0 })).toBe('desktop');
  });
});

describe('isInstalled', () => {
  const withDisplayMode = (standalone) => ({
    matchMedia: () => ({ matches: standalone })
  });

  it('trusts the old iOS-only flag', () => {
    expect(isInstalled({ matchMedia: () => ({ matches: false }) }, { standalone: true })).toBe(true);
  });

  it('trusts display-mode everywhere else', () => {
    expect(isInstalled(withDisplayMode(true), {})).toBe(true);
  });

  it('reports a normal browser tab as not installed', () => {
    expect(isInstalled(withDisplayMode(false), {})).toBe(false);
  });

  it('copes with a browser that has no matchMedia', () => {
    expect(isInstalled({}, {})).toBe(false);
  });
});

describe('when already installed', () => {
  beforeEach(() => mount({ installed: true }));

  it('says there is nothing to do rather than giving steps anyway', () => {
    expect($('.install-done')).not.toBeNull();
    expect($('.install-tabs')).toBeNull();
    expect($$('[data-install-panel]')).toHaveLength(0);
  });

  it('does not throw when wired with no tabs present', () => {
    expect(() => wireInstallSection(document)).not.toThrow();
  });
});

describe('choosing a device', () => {
  beforeEach(() => mount({ platform: 'ios', installed: false }));

  it('offers all three, so you can read it for someone else\'s phone', () => {
    expect($$('[data-install-tab]').map((tab) => tab.dataset.installTab)).toEqual([
      'ios',
      'android',
      'desktop'
    ]);
  });

  it('opens on the device you are actually holding', () => {
    expect(visiblePanels()).toHaveLength(1);
    expect(visiblePanels()[0].dataset.installPanel).toBe('ios');
    expect(tabFor('ios').classList.contains('active')).toBe(true);
  });

  it('switches when another device is picked', () => {
    tabFor('android').click();
    expect(visiblePanels()[0].dataset.installPanel).toBe('android');
    expect(tabFor('ios').classList.contains('active')).toBe(false);
  });

  it('never shows two sets of steps at once', () => {
    tabFor('android').click();
    tabFor('desktop').click();
    expect(visiblePanels()).toHaveLength(1);
  });

  it('falls back to desktop for a platform it does not recognise', () => {
    mount({ platform: 'toaster', installed: false });
    expect(visiblePanels()[0].dataset.installPanel).toBe('desktop');
  });
});

describe('the instructions themselves', () => {
  beforeEach(() => mount({ platform: 'desktop', installed: false }));

  it('gives every platform numbered steps', () => {
    ['ios', 'android', 'desktop'].forEach((id) => {
      expect(panelFor(id).querySelectorAll('.guide-steps li').length).toBeGreaterThan(1);
    });
  });

  it('illustrates each step', () => {
    ['ios', 'android', 'desktop'].forEach((id) => {
      const figures = panelFor(id).querySelectorAll('.install-figure');
      expect(figures.length).toBeGreaterThan(0);
      // Drawn, not screenshotted — so they follow the dark theme and add
      // nothing to the download.
      figures.forEach((figure) => expect(figure.tagName.toLowerCase()).toBe('svg'));
    });
  });

  it('numbers the pictures to match the steps', () => {
    const numbers = [...panelFor('ios').querySelectorAll('.install-step-number')].map(
      (node) => node.textContent
    );
    expect(numbers).toEqual(['1', '2', '3']);
  });

  it('labels each drawing for screen readers', () => {
    $$('.install-figure').forEach((figure) => {
      expect(figure.getAttribute('role')).toBe('img');
      expect(figure.getAttribute('aria-label')).toMatch(/Step \d/);
    });
  });

  it('warns that only Safari can install on iOS', () => {
    // People routinely try from Chrome on an iPhone and conclude it is broken.
    expect(panelFor('ios').textContent).toMatch(/Safari/);
  });

  it('warns which desktop browsers cannot do it', () => {
    expect(panelFor('desktop').textContent).toMatch(/Firefox/);
  });

  it('says why it is worth doing at all', () => {
    // On iOS this is the difference between notifications working and not.
    expect($('.guide-lead').textContent).toMatch(/notifications/i);
  });

  it('draws its icons rather than printing their source', () => {
    expect($('.guide-card').textContent).not.toContain('<svg');
  });
});
