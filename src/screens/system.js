// The two screens that aren't part of the flow: waiting, and having failed.

import { ICONS } from '../icons.js';
import { escapeHtml } from '../ui/html.js';
import { setApp } from '../ui/shell.js';

export function renderLoading(message) {
  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge">${ICONS.heart}</div>
        <h1>Viktor & Jericka Photobooth</h1>
        <p>${escapeHtml(message)}</p>
        <svg class="loader" viewBox="0 0 48 44" role="img" aria-label="Loading">
          <path d="M24 40C13 32 5 25 5 16A10 10 0 0 1 24 11 10 10 0 0 1 43 16c0 9-8 16-19 24z" />
        </svg>
      </section>
    </main>
  `);
}

export function renderFatalError(error) {
  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge error-badge">!</div>
        <h1>Something went wrong</h1>
        <p>${escapeHtml(error?.message || 'Unknown error')}</p>
        <button class="primary" id="restartBtn">Restart</button>
      </section>
    </main>
  `);

  document.querySelector('#restartBtn').addEventListener('click', () => {
    // Back to a clean URL, so restarting after a bad room code doesn't just
    // rejoin the same broken room.
    window.location.href = window.location.pathname;
  });
}

// Turns the field itself into the error message, rather than opening a dialog
// over a form the person is still filling in.
export function showInlineError(inputId, message) {
  const input = document.querySelector(`#${inputId}`);
  if (!input) return;
  input.classList.add('input-error');
  input.value = '';
  input.placeholder = message;
}
