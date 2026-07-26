// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createModal } from './modal.js';

let overlay;
let opener;

const press = (key, options = {}) => {
  const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true, ...options });
  document.dispatchEvent(event);
  return event;
};

beforeEach(() => {
  document.body.innerHTML = `
    <button id="opener">Open</button>
    <div id="dlg" class="hidden">
      <div class="card">
        <input id="first" />
        <button id="middle">Middle</button>
        <button id="last">Last</button>
      </div>
    </div>
  `;
  overlay = document.querySelector('#dlg');
  opener = document.querySelector('#opener');
});

describe('dialog semantics', () => {
  it('announces itself as a modal dialog', () => {
    createModal(overlay, { label: 'Edit photo caption' });

    expect(overlay.getAttribute('role')).toBe('dialog');
    // Without this a screen reader happily reads the booth behind it.
    expect(overlay.getAttribute('aria-modal')).toBe('true');
    expect(overlay.getAttribute('aria-label')).toBe('Edit photo caption');
  });

  it('works without a label', () => {
    createModal(overlay);
    expect(overlay.getAttribute('role')).toBe('dialog');
  });
});

describe('opening', () => {
  it('shows the overlay', () => {
    const modal = createModal(overlay);
    modal.open();
    expect(overlay.classList.contains('hidden')).toBe(false);
  });

  it('moves focus inside', () => {
    const modal = createModal(overlay);
    opener.focus();
    modal.open();
    expect(document.activeElement.id).toBe('first');
  });

  it('honours a specific element to focus', () => {
    // The caption editor wants the field, not the mode toggle — you came here
    // to write something.
    const modal = createModal(overlay);
    modal.open({ focus: document.querySelector('#last') });
    expect(document.activeElement.id).toBe('last');
  });
});

describe('closing', () => {
  it('hides the overlay', () => {
    const modal = createModal(overlay);
    modal.open();
    modal.close();
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('closes on Escape', () => {
    // The whole reason this exists: on a phone the Cancel button was the only
    // way out of these two overlays.
    const modal = createModal(overlay);
    modal.open();
    press('Escape');
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('closes on a click on the backdrop, but not inside the card', () => {
    const modal = createModal(overlay);

    modal.open();
    document.querySelector('.card').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.classList.contains('hidden')).toBe(false);

    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.classList.contains('hidden')).toBe(true);
  });

  it('puts focus back where it came from', () => {
    // Otherwise the focus ring is dumped at the top of the document and the
    // keyboard user loses their place entirely.
    const modal = createModal(overlay);
    opener.focus();
    modal.open();
    modal.close();
    expect(document.activeElement.id).toBe('opener');
  });

  it('tells the caller, so it can clear its own state', () => {
    const onClose = vi.fn();
    const modal = createModal(overlay, { onClose });
    modal.open();
    modal.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does nothing when closed twice', () => {
    const onClose = vi.fn();
    const modal = createModal(overlay, { onClose });
    modal.open();
    modal.close();
    modal.close();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while shut', () => {
    // Otherwise every Escape anywhere in the booth fires a close.
    const onClose = vi.fn();
    createModal(overlay, { onClose });
    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('keeping the keyboard inside', () => {
  it('wraps forward from the last control to the first', () => {
    // Without this Tab walks out into the booth, which is still visible
    // through the overlay.
    const modal = createModal(overlay);
    modal.open();
    document.querySelector('#last').focus();

    const event = press('Tab');
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('first');
  });

  it('wraps backward from the first to the last', () => {
    const modal = createModal(overlay);
    modal.open();
    document.querySelector('#first').focus();

    const event = press('Tab', { shiftKey: true });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement.id).toBe('last');
  });

  it('leaves Tab alone in the middle', () => {
    // The browser's own order is correct everywhere except the two edges.
    const modal = createModal(overlay);
    modal.open();
    document.querySelector('#middle').focus();

    expect(press('Tab').defaultPrevented).toBe(false);
  });

  it('does not trap anything while shut', () => {
    createModal(overlay);
    document.querySelector('#opener').focus();
    expect(press('Tab').defaultPrevented).toBe(false);
  });

  it('skips disabled controls', () => {
    document.querySelector('#last').disabled = true;
    const modal = createModal(overlay);
    modal.open();
    document.querySelector('#middle').focus();

    press('Tab');
    expect(document.activeElement.id).toBe('first');
  });
});

describe('a missing overlay', () => {
  it('returns something harmless rather than throwing', () => {
    const modal = createModal(null);
    expect(() => {
      modal.open();
      modal.close();
    }).not.toThrow();
  });
});
