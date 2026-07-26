// Everything before a booth: the landing page, joining by code, choosing who
// you are, and saying where you are.

import { stopCamera } from '../camera.js';
import { ANNIVERSARY_DATE } from '../config.js';
import { enterBooth, resetAllBoothsFlow, stopSubscriptions } from '../features/session.js';
import { ICONS } from '../icons.js';
import { keepsakeFromToday, yearsAgoLabel } from '../features/onThisDay.js';
import { forgetAllKeepsakes, listKeepsakes } from '../keepsakes.js';
import { listRooms } from '../roomHistory.js';
import { state, storeCustomMessage, storeRole } from '../store.js';
import { escapeAttr, escapeHtml } from '../ui/html.js';
import { countUp } from '../ui/motion.js';
import { setApp } from '../ui/shell.js';
import {
  daysTogether,
  getRoomIdFromUrl,
  isUsableLocation,
  normalizeRoomCode,
  sanitizeCollageMessage
} from '../utils.js';
import { cityFieldMarkup, wireCityPicker } from './cityField.js';
import {
  buildKeepsakeGallery,
  buildMilestoneLine,
  buildStreakLine,
  formatDays,
  togetherLine
} from './parts.js';
import { showInlineError } from './system.js';

export function renderLanding() {
  stopSubscriptions();
  stopCamera();

  const boothCount = listRooms().length;

  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge">${ICONS.heart}</div>
        <p class="eyebrow">private long-distance couple photobooth</p>
        <h1>Viktor & Jericka Photobooth</h1>
        <p class="hero-text">Even far apart, we can still make memories together.</p>
        <p class="anniversary-line" id="landingDays">${togetherLine(ANNIVERSARY_DATE)}</p>
        ${buildMilestoneLine(ANNIVERSARY_DATE)}
        ${buildStreakLine(listRooms())}

        <label class="field-label" for="messageInput">Collage message</label>
        <input id="messageInput" class="text-input" maxlength="80" value="${escapeAttr(state.customMessage)}" />

        ${cityFieldMarkup()}

        <div class="action-row">
          <button class="primary" id="createBtn">Create new booth</button>
          <button class="secondary" id="joinBtn">Join booth</button>
        </div>

        ${buildOnThisDay()}

        ${buildKeepsakeGallery(listKeepsakes())}

        ${
          boothCount
            ? `<div class="danger-zone">
                 <p class="danger-zone-label">Danger zone</p>
                 <p class="danger-zone-hint">${boothCount} booth${boothCount === 1 ? '' : 's'} on this device. Booths older than two days are cleaned up on their own.</p>
                 <button class="danger small" id="resetAllBtn">Delete all booths</button>
               </div>`
            : ''
        }
      </section>
    </main>
  `);

  document.querySelector('#messageInput').addEventListener('input', (event) => {
    storeCustomMessage(sanitizeCollageMessage(event.target.value));
  });

  wireCityPicker();

  countUp(document.querySelector('#landingDays'), daysTogether(ANNIVERSARY_DATE), {
    format: (value) => `${ICONS.hearts} Together for ${formatDays(value)}`
  });

  document.querySelector('#createBtn').addEventListener('click', () => renderRoleGate('create'));
  document.querySelector('#joinBtn').addEventListener('click', () => renderJoinByCode());
  document.querySelector('#resetAllBtn')?.addEventListener('click', resetAllBoothsFlow);

  document.querySelector('#clearKeepsakesBtn')?.addEventListener('click', () => {
    // Only clears this device's list. The files themselves stay put, so a link
    // kept elsewhere still works and the other person's list is untouched.
    if (!confirm('Remove these collages from this list? The images themselves are kept.')) return;
    forgetAllKeepsakes();
    renderLanding();
  });
}

export function renderJoinByCode() {
  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <button class="ghost back-btn" id="backBtn">← Back</button>
        <div class="heart-badge">${ICONS.heart}</div>
        <h1>Join a booth</h1>
        <p>Paste the room code or the full link Viktor sent you.</p>
        <input id="roomInput" class="text-input room-input" placeholder="Example: 8KJ2MXQ4P9VA" autofocus />
        <button class="primary wide" id="continueBtn">Continue</button>
      </section>
    </main>
  `);

  document.querySelector('#backBtn').addEventListener('click', renderLanding);

  document.querySelector('#continueBtn').addEventListener('click', () => {
    const raw = document.querySelector('#roomInput').value.trim();

    // Accepts a whole share link as readily as a bare code — pasting the link
    // is what most people will actually do.
    const parsedFromUrl = (() => {
      try {
        return new URL(raw).searchParams.get('room') || '';
      } catch {
        return '';
      }
    })();

    state.roomId = normalizeRoomCode(parsedFromUrl || raw);
    if (!state.roomId) return showInlineError('roomInput', 'Enter a valid room code.');
    renderRoleGate('join');
  });
}

export function renderRoleGate(mode) {
  const isCreate = mode === 'create';

  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <button class="ghost back-btn" id="backBtn">← Back</button>
        <div class="heart-badge">${ICONS.heart}</div>
        <h1>${isCreate ? 'Who is creating the booth?' : 'Who are you?'}</h1>
        <p>${isCreate ? 'Pick your side first. The other person can join from the link.' : `Room code: <strong>${escapeHtml(state.roomId)}</strong>`}</p>
        <div class="role-grid">
          <button class="role-card" data-role="viktor">
            <span>V</span>
            <strong>Viktor</strong>
          </button>
          <button class="role-card" data-role="jericka">
            <span>J</span>
            <strong>Jericka</strong>
          </button>
        </div>
      </section>
    </main>
  `);

  document.querySelector('#backBtn').addEventListener('click', () => {
    state.roomId = getRoomIdFromUrl();
    renderLanding();
  });

  document.querySelectorAll('.role-card').forEach((button) => {
    button.addEventListener('click', () => {
      storeRole(button.dataset.role);

      // A city is required before entering. Someone opening a shared link
      // skips the landing page entirely, so this gate is the only place they
      // would ever be asked — without it they'd join with no location and the
      // distance panel could never work.
      if (!isUsableLocation(state.myLocation)) {
        renderLocationGate(mode);
        return;
      }

      enterBooth(isCreate);
    });
  });
}

export function renderLocationGate(mode) {
  const isCreate = mode === 'create';

  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <button class="ghost back-btn" id="backBtn">← Back</button>
        <div class="heart-badge">${ICONS.pin}</div>
        <h1>Where are you right now?</h1>
        <p>We use this to show each other's local time and how far apart you are.</p>

        ${cityFieldMarkup({ autofocus: true })}

        <button class="primary wide" id="locationContinueBtn" ${state.myLocation ? '' : 'disabled'}>Continue</button>
      </section>
    </main>
  `);

  const continueBtn = document.querySelector('#locationContinueBtn');

  wireCityPicker(() => {
    continueBtn.disabled = !isUsableLocation(state.myLocation);
  });

  document.querySelector('#backBtn').addEventListener('click', () => renderRoleGate(mode));

  continueBtn.addEventListener('click', () => {
    if (!isUsableLocation(state.myLocation)) return;
    enterBooth(isCreate);
  });
}

// An evening from a year ago, handed back on its anniversary. Silent on every
// other day of the year, which is what makes it worth anything.
function buildOnThisDay() {
  const keepsake = keepsakeFromToday(listKeepsakes());
  if (!keepsake) return '';

  return `
    <a class="on-this-day" href="${escapeAttr(keepsake.url)}" target="_blank" rel="noopener">
      <img src="${escapeAttr(keepsake.url)}" alt="Collage from ${escapeAttr(yearsAgoLabel(keepsake.years))}" loading="lazy" />
      <span class="on-this-day-text">
        <strong>${escapeHtml(yearsAgoLabel(keepsake.years))}</strong>
        <span>${ICONS.hearts} you made this one</span>
      </span>
    </a>
  `;
}
