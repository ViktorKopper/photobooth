// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showError, showToast } from './toast.js';

const toast = () => document.querySelector('#toast');

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('showToast', () => {
  it('creates the element once and reuses it', () => {
    showToast('one');
    showToast('two');
    expect(document.querySelectorAll('#toast')).toHaveLength(1);
    expect(toast().textContent).toBe('two');
  });

  it('shows and then hides itself', () => {
    showToast('saved');
    expect(toast().classList.contains('toast-visible')).toBe(true);

    vi.advanceTimersByTime(1799);
    expect(toast().classList.contains('toast-visible')).toBe(true);

    vi.advanceTimersByTime(2);
    expect(toast().classList.contains('toast-visible')).toBe(false);
  });

  it('keeps an error on screen far longer than a confirmation', () => {
    showError('upload failed');
    vi.advanceTimersByTime(2000);
    // A confirmation would already be gone by now.
    expect(toast().classList.contains('toast-visible')).toBe(true);

    vi.advanceTimersByTime(2300);
    expect(toast().classList.contains('toast-visible')).toBe(false);
  });

  it('announces errors assertively and confirmations politely', () => {
    showToast('saved');
    expect(toast().getAttribute('aria-live')).toBe('polite');
    expect(toast().getAttribute('role')).toBe('status');

    showError('failed');
    expect(toast().getAttribute('aria-live')).toBe('assertive');
    expect(toast().getAttribute('role')).toBe('alert');
  });

  it('drops the error styling when a confirmation follows', () => {
    showError('failed');
    expect(toast().className).toContain('toast-error');

    showToast('saved');
    expect(toast().className).not.toContain('toast-error');
  });

  it('a second toast resets the timer rather than inheriting the first', () => {
    showToast('one');
    vi.advanceTimersByTime(1700);
    showToast('two');

    vi.advanceTimersByTime(200);
    // The first toast's deadline has passed, but the second must survive.
    expect(toast().classList.contains('toast-visible')).toBe(true);
  });

  it('escapes nothing into markup — the message is set as text', () => {
    showToast('<img src=x onerror=alert(1)>');
    expect(toast().querySelector('img')).toBeNull();
    expect(toast().textContent).toContain('<img');
  });

  it('falls back when an error carries no message', () => {
    showError(undefined, 'Something went wrong.');
    expect(toast().textContent).toBe('Something went wrong.');
  });
});
