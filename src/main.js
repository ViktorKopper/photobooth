import './styles.css';
import { ensureAnonymousAuth } from './firebase.js';
import { capturePhoto, startCamera, stopCamera } from './camera.js';
import { clearCollageImageCache, COLLAGE_THEMES, EXPORT_PRESETS, generateCollage } from './collage.js';
import { cssFromOps, findFilter, FILTERS } from './filters.js';
import { describeLocation, describeSearchResult, fetchWeather, searchCities } from './geo.js';
import { ICONS, weatherIcon } from './icons.js';
import { celebrateCompletion, playShutterSound, triggerShutterFeedback } from './ui/feedback.js';
import { countUp, prefersReducedMotion, restartAnimation } from './ui/motion.js';
import { mountThemeToggle } from './ui/theme.js';
import { showError, showToast } from './ui/toast.js';
import {
  expiredRoomIds,
  forgetAllRooms,
  forgetRoom,
  listRooms,
  rememberRoom
} from './roomHistory.js';
// room.js is imported on demand rather than up front. It pulls in the
// Firestore and Storage SDKs — about two thirds of the whole bundle — none
// of which is needed to render the landing page, pick a city or scan a QR
// code. Loading it lazily lets the app become interactive first and fetch
// the heavy part while the person is still typing.
let roomModulePromise = null;

function roomApi() {
  if (!roomModulePromise) roomModulePromise = import('./room.js');
  return roomModulePromise;
}
import {
  dayDeltaBetween,
  daysTogether,
  distanceBetween,
  downloadBlob,
  formatDistanceKm,
  getRoomIdFromUrl,
  hourOffsetBetween,
  isUsableLocation,
  normalizeRoomCode,
  otherRole,
  roomLink,
  ROLES,
  sanitizeCaption,
  sanitizeCollageMessage,
  sanitizeLocation,
  sleep,
  timeInZone
} from './utils.js';

const app = document.querySelector('#app');

// Head start before the visible countdown begins, measured from the moment
// Firestore resolves the request's server timestamp. Covers realtime
// propagation to both devices (usually well under a second) plus a "get
// ready" beat. The chosen countdown length is added on top of this.
const SYNC_LEAD_MS = 3000;

// The day this became "us". Fixed rather than user-entered — every booth
// counts from the same start, so the day count is a property of the couple,
// not something to re-type per room.
const ANNIVERSARY_DATE = '2026-01-13';

// Countdown lengths offered before each shot. 3s is the quick "I'm already
// in frame" case; 10s is enough to prop the phone up and walk into shot.
const TIMER_OPTIONS = [3, 10];

// One tick per second, so a timer labelled 10s actually lasts 10 seconds.
// (The old countdown ran at 750ms, which nobody noticed over 3 numbers but
// would quietly cost you 2.5s of running time over 10.)
const COUNTDOWN_TICK_MS = 1000;

const state = {
  user: null,
  roomId: getRoomIdFromUrl(),
  role: localStorage.getItem('photobooth-role') || '',
  room: null,
  photos: [],
  pendingCapture: null,
  editingCaption: null,
  replacingIndex: null,
  facingMode: 'user',
  activeFilter: 'none',
  timerSeconds: 3,
  onionSkinOn: false,
  customMessage: localStorage.getItem('photobooth-message') || 'Our little photobooth memory',
  myLocation: readStoredLocation(),
  citySearchResults: [],
  citySearchToken: 0,
  collageBlob: null,
  collagePreviewUrl: null,
  collageLayout: 'grid',
  collageScale: '1',
  collageTheme: 'rose',
  collageExport: 'original',
  unsubscribeRoom: null,
  unsubscribePhotos: null,
  cameraStarted: false,
  syncScheduledFor: null,
  syncTimers: [],
  clockTimer: null,
  weather: { viktor: null, jericka: null },
  weatherKey: '',
  weatherTimer: null,
  bothCompleteSeen: null,
  // One-shot flags for intro flourishes, so the panels that re-render on a
  // timer don't replay their entrance every tick.
  distanceIntroDone: false,
  dayCountIntroDone: false
};

function readStoredLocation() {
  try {
    return sanitizeLocation(JSON.parse(localStorage.getItem('photobooth-location') || 'null'));
  } catch {
    return null;
  }
}

function storeMyLocation(location) {
  state.myLocation = sanitizeLocation(location);
  if (state.myLocation) {
    localStorage.setItem('photobooth-location', JSON.stringify(state.myLocation));
  } else {
    localStorage.removeItem('photobooth-location');
  }
}

function activeFilterCss() {
  return cssFromOps(findFilter(state.activeFilter).ops);
}

function formatDays(count) {
  return count === 1 ? '1 day' : `${count} days`;
}

function togetherLine(anniversaryDate = ANNIVERSARY_DATE) {
  const count = daysTogether(anniversaryDate);
  return count ? `${ICONS.hearts} Together for ${formatDays(count)}` : '';
}

registerServiceWorker();
mountThemeToggle();
bootstrap();


// Registers the PWA service worker so the booth can be installed to a
// phone's home screen and opened like a native app. Never blocks or
// affects the actual app if it fails — it's a pure enhancement.
function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

async function bootstrap() {
  renderLoading('Preparing your private photobooth...');

  try {
    state.user = await ensureAnonymousAuth();

    // Fire-and-forget: expired booths get swept in the background while the
    // person carries on into their room.
    pruneExpiredRooms();

    if (state.roomId) {
      renderRoleGate('join');
    } else {
      renderLanding();
    }
  } catch (error) {
    renderFatalError(error);
  }
}

async function pruneExpiredRooms() {
  const stale = expiredRoomIds({ exclude: state.roomId });

  for (const roomId of stale) {
    try {
      await (await roomApi()).deleteRoomSession(roomId);
    } catch {
      // Already gone, or the other side deleted it first — either way the
      // local record should go too.
    }
    forgetRoom(roomId);
  }
}


// Swaps the screen, turning the outgoing one away like a page.
//
// The new markup has to land synchronously — every render function queries
// its own elements the moment this returns — so the outgoing screen is
// lifted into an absolutely-positioned ghost that animates away *on top of*
// the new one, rather than delaying the swap.
function setApp(html) {
  const previous = app.firstElementChild;

  if (!previous || prefersReducedMotion()) {
    app.innerHTML = html;
    return;
  }

  const ghost = document.createElement('div');
  ghost.className = 'page-exit';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.appendChild(previous);

  // The ghost still holds a full copy of the old screen, ids and all.
  // Stripping them guarantees a stray querySelector can never reach back
  // into the screen that's on its way out.
  ghost.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));

  app.innerHTML = html;
  app.appendChild(ghost);

  const remove = () => ghost.remove();
  ghost.addEventListener('animationend', remove, { once: true });
  // Safety net: if the animation never fires (backgrounded tab, for one),
  // the ghost must not be left sitting over the live screen.
  window.setTimeout(remove, 900);
}

function renderLoading(message) {
  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge">${ICONS.heart}</div>
        <h1>Viktor & Jericka Photobooth</h1>
        <p>${message}</p>
        <svg class="loader" viewBox="0 0 48 44" role="img" aria-label="Loading">
          <path d="M24 40C13 32 5 25 5 16A10 10 0 0 1 24 11 10 10 0 0 1 43 16c0 9-8 16-19 24z" />
        </svg>
      </section>
    </main>
  `);
}

function renderFatalError(error) {
  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge error-badge">!</div>
        <h1>Something went wrong</h1>
        <p>${escapeHtml(error.message || 'Unknown error')}</p>
        <button class="primary" id="restartBtn">Restart</button>
      </section>
    </main>
  `);
  document.querySelector('#restartBtn').addEventListener('click', () => window.location.href = window.location.pathname);
}







function renderLanding() {
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
        <p class="anniversary-line" id="landingDays">${togetherLine()}</p>

        <label class="field-label" for="messageInput">Collage message</label>
        <input id="messageInput" class="text-input" maxlength="80" value="${escapeAttr(state.customMessage)}" />

        <label class="field-label" for="cityInput">Your city</label>
        <div class="city-picker">
          <input
            id="cityInput"
            class="text-input"
            placeholder="Start typing a city..."
            autocomplete="off"
            value="${escapeAttr(describeLocation(state.myLocation))}"
          />
          <div id="cityResults" class="city-results hidden"></div>
        </div>
        <p id="cityPreview" class="anniversary-line${state.myLocation ? '' : ' hidden'}">${cityPreviewText()}</p>

        <div class="action-row">
          <button class="primary" id="createBtn">Create new booth</button>
          <button class="secondary" id="joinBtn">Join booth</button>
        </div>

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
    state.customMessage = sanitizeCollageMessage(event.target.value);
    localStorage.setItem('photobooth-message', state.customMessage);
  });

  wireCityPicker();

  countUp(document.querySelector('#landingDays'), daysTogether(ANNIVERSARY_DATE), {
    format: (value) => `${ICONS.hearts} Together for ${formatDays(value)}`
  });

  document.querySelector('#createBtn').addEventListener('click', () => renderRoleGate('create'));
  document.querySelector('#joinBtn').addEventListener('click', () => renderJoinByCode());
  document.querySelector('#resetAllBtn')?.addEventListener('click', resetAllBoothsFlow);
}

// Returns markup, not plain text — it carries drawn icons — so the city
// name (which comes back from a third-party geocoding API) is escaped here
// rather than trusted.
function cityPreviewText() {
  if (!state.myLocation) return '';
  const now = timeInZone(state.myLocation.timezone);
  const clock = now ? ` — ${now.isNight ? ICONS.moon : ICONS.sun} ${escapeHtml(now.label)} local` : '';
  return `${ICONS.pin} ${escapeHtml(describeLocation(state.myLocation))}${clock}`;
}

// Debounced city search with a monotonically increasing token, so a slow
// earlier request can never overwrite the results of a newer keystroke.
function wireCityPicker(onChange = () => {}) {
  const input = document.querySelector('#cityInput');
  const results = document.querySelector('#cityResults');
  const preview = document.querySelector('#cityPreview');
  if (!input || !results) return;

  let debounce = null;

  const closeResults = () => {
    results.classList.add('hidden');
    results.innerHTML = '';
  };

  const refreshPreview = () => {
    // innerHTML: the line carries a drawn pin and sun/moon icon. The city
    // name is escaped inside cityPreviewText() before it gets here.
    preview.innerHTML = cityPreviewText();
    preview.classList.toggle('hidden', !state.myLocation);
    onChange();
  };

  input.addEventListener('input', () => {
    const query = input.value.trim();

    // Typing again after picking invalidates the stored pick until a new
    // suggestion is chosen — otherwise a half-typed city would silently
    // keep the previous coordinates.
    if (state.myLocation && query !== describeLocation(state.myLocation)) {
      storeMyLocation(null);
      refreshPreview();
    }

    window.clearTimeout(debounce);

    if (query.length < 2) {
      closeResults();
      return;
    }

    debounce = window.setTimeout(async () => {
      const token = ++state.citySearchToken;
      results.classList.remove('hidden');
      results.innerHTML = '<div class="city-result-empty">Searching...</div>';

      try {
        const found = await searchCities(query);
        if (token !== state.citySearchToken) return;

        state.citySearchResults = found;

        if (!found.length) {
          results.innerHTML = '<div class="city-result-empty">No cities found.</div>';
          return;
        }

        results.innerHTML = found
          .map(
            (item, index) =>
              `<button type="button" class="city-result" data-index="${index}">${escapeHtml(describeSearchResult(item))}</button>`
          )
          .join('');
      } catch {
        if (token !== state.citySearchToken) return;
        results.innerHTML = '<div class="city-result-empty">City lookup unavailable right now.</div>';
      }
    }, 300);
  });

  results.addEventListener('click', (event) => {
    const button = event.target.closest('.city-result');
    if (!button) return;

    const picked = state.citySearchResults[Number(button.dataset.index)];
    if (!picked) return;

    storeMyLocation(picked);
    input.value = describeLocation(state.myLocation);
    closeResults();
    refreshPreview();
  });

  // renderLanding() can run repeatedly (leaving a room returns here), so the
  // previous document-level handler is detached first — otherwise every
  // visit would stack another listener holding a stale DOM reference.
  if (wireCityPicker.outsideHandler) {
    document.removeEventListener('click', wireCityPicker.outsideHandler);
  }
  wireCityPicker.outsideHandler = (event) => {
    if (!event.target.closest('.city-picker')) closeResults();
  };
  document.addEventListener('click', wireCityPicker.outsideHandler);
}

function renderJoinByCode() {
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
    const parsedFromUrl = (() => {
      try {
        const url = new URL(raw);
        return url.searchParams.get('room') || '';
      } catch {
        return '';
      }
    })();

    state.roomId = normalizeRoomCode(parsedFromUrl || raw);
    if (!state.roomId) return showInlineError('roomInput', 'Enter a valid room code.');
    renderRoleGate('join');
  });
}

function renderRoleGate(mode) {
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
      state.role = button.dataset.role;
      localStorage.setItem('photobooth-role', state.role);

      // A city is required before entering. Someone opening a shared link
      // skips the landing page entirely, so this gate is the only place
      // they'd ever be asked — without it they'd join with no location and
      // the distance panel could never work.
      if (!isUsableLocation(state.myLocation)) {
        renderLocationGate(mode);
        return;
      }

      enterBooth(isCreate);
    });
  });
}

function renderLocationGate(mode) {
  const isCreate = mode === 'create';

  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <button class="ghost back-btn" id="backBtn">← Back</button>
        <div class="heart-badge">${ICONS.pin}</div>
        <h1>Where are you right now?</h1>
        <p>We use this to show each other's local time and how far apart you are.</p>

        <label class="field-label" for="cityInput">Your city</label>
        <div class="city-picker">
          <input
            id="cityInput"
            class="text-input"
            placeholder="Start typing a city..."
            autocomplete="off"
            autofocus
            value="${escapeAttr(describeLocation(state.myLocation))}"
          />
          <div id="cityResults" class="city-results hidden"></div>
        </div>
        <p id="cityPreview" class="anniversary-line${state.myLocation ? '' : ' hidden'}">${cityPreviewText()}</p>

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

async function enterBooth(isCreate) {
  renderLoading(isCreate ? 'Creating your booth...' : 'Joining your booth...');

  try {
    const { createRoom, joinRoom } = await roomApi();

    if (isCreate) {
      state.roomId = await createRoom({
        uid: state.user.uid,
        role: state.role,
        customMessage: sanitizeCollageMessage(state.customMessage),
        anniversaryDate: ANNIVERSARY_DATE,
        location: sanitizeLocation(state.myLocation)
      });
    } else {
      await joinRoom({
        roomId: state.roomId,
        uid: state.user.uid,
        role: state.role,
        location: sanitizeLocation(state.myLocation)
      });
    }

    window.history.replaceState({}, '', `?room=${state.roomId}`);
    rememberRoom(state.roomId);
    await enterRoom();
  } catch (error) {
    renderFatalError(error);
  }
}

async function enterRoom() {
  stopSubscriptions();
  renderRoomShell();

  const { watchRoom, watchPhotos } = await roomApi();

  state.unsubscribeRoom = watchRoom(
    state.roomId,
    (room) => {
      state.room = room;
      if (!room) {
        renderFatalError(new Error('This booth was deleted or no longer exists.'));
        return;
      }
      handleSyncCountdownChange();
      updateRoomView();
    },
    renderFatalError
  );

  state.unsubscribePhotos = watchPhotos(
    state.roomId,
    (photos) => {
      state.photos = photos;
      updateRoomView();
    },
    renderFatalError
  );

  startClockTicker();
  startWeatherTicker();
  syncMyLocationToRoom();

  await startCurrentCamera();
}

function renderRoomShell() {
  const roleName = ROLES[state.role]?.name || 'Guest';

  setApp(`
    <main class="shell booth-shell fade-in">
      <header class="topbar">
        <div>
          <p class="eyebrow">room ${escapeHtml(state.roomId)}</p>
          <h1>Viktor & Jericka Photobooth</h1>
        </div>
        <button class="secondary small" id="leaveBtn">Leave</button>
      </header>

      <section class="grid-layout">
        <aside class="card status-card">
          <h2>Booth status</h2>
          <p>You are connected as <strong>${roleName}</strong>.</p>
          <p id="anniversaryLine" class="anniversary-line hidden"></p>
          <div id="distancePanel" class="distance-panel hidden"></div>
          <button type="button" class="secondary small" id="notifyToggleBtn">${ICONS.bell} Enable notifications</button>
          <p class="notify-hint">Only arrive while the booth is open on screen — a closed app can't wake itself up.</p>

          <div class="share-box">
            <label class="field-label">Invite ${escapeHtml(ROLES[otherRole(state.role)]?.name || 'your partner')}</label>
            <div class="qr-box">
              <img id="joinQr" class="qr-image" alt="QR code linking to this booth" width="150" height="150" />
              <p class="qr-code-text">${escapeHtml(state.roomId)}</p>
            </div>
            <button class="secondary wide small" id="copyBtn">Copy link instead</button>
          </div>

          <div id="progressPanel" class="progress-panel"></div>
          <div id="roomMessage" class="soft-message"></div>
        </aside>

        <section class="card camera-card">
          <div class="camera-wrap">
            <video id="cameraPreview" class="camera-preview" autoplay muted playsinline></video>
            <img id="onionSkin" class="onion-skin hidden" alt="" aria-hidden="true" />
            <div id="countdown" class="countdown hidden" aria-live="polite"></div>
            <div id="shutterFlash" class="shutter-flash" aria-hidden="true"></div>
            <div id="cameraError" class="camera-error hidden"></div>
          </div>

          <div class="camera-controls">
            <div id="filterRow" class="filter-row">${buildFilterRow()}</div>
            <div class="timer-picker" role="group" aria-label="Countdown length">
              ${TIMER_OPTIONS.map(
                (seconds) =>
                  `<button type="button" class="timer-option${seconds === state.timerSeconds ? ' active' : ''}" data-seconds="${seconds}">${seconds}s</button>`
              ).join('')}
            </div>
            <button type="button" class="timer-option ghost-toggle hidden" id="onionToggleBtn" title="Show your previous photo faintly over the camera" aria-pressed="false">${ICONS.ghost}</button>
          </div>

          <div id="previewPanel" class="preview-panel hidden">
            <div class="polaroid-preview">
              <img id="photoPreview" alt="Captured preview" />
              <label class="visually-hidden" for="captionInput">Photo caption (optional)</label>
              <input
                id="captionInput"
                class="caption-input"
                style="color:${state.role === 'viktor' ? '#2a5a86' : '#9b2948'}"
                maxlength="36"
                placeholder="write a note for this moment..."
                autocomplete="off"
              />
            </div>
            <div class="action-row">
              <button class="secondary" id="retakeBtn">Retake</button>
              <button class="primary" id="confirmBtn">Confirm photo</button>
            </div>
          </div>

          <div id="cameraActions" class="action-row camera-actions">
            <button class="primary" id="takePhotoBtn">Take photo</button>
            <button class="secondary" id="syncBtn">${ICONS.camera} Shoot together</button>
            <button class="secondary" id="switchCameraBtn">Switch camera</button>
            <button class="ghost hidden" id="cancelReplaceBtn">Cancel retake</button>
          </div>
          <p id="syncStatus" class="sync-status hidden"></p>
        </section>
      </section>

      <section id="collageSection" class="card collage-card hidden"></section>

      <div id="captionEditorOverlay" class="caption-editor-overlay hidden">
        <div class="caption-editor-card">
          <img id="captionEditorImg" alt="Photo" />
          <label class="visually-hidden" for="captionEditorInput">Edit photo caption</label>
          <input
            id="captionEditorInput"
            class="caption-input"
            maxlength="36"
            placeholder="write a note for this moment..."
            autocomplete="off"
          />
          <div class="action-row">
            <button class="secondary" id="captionEditorCancelBtn">Cancel</button>
            <button class="primary" id="captionEditorSaveBtn">Save</button>
          </div>
        </div>
      </div>
    </main>
  `);

  document.querySelector('#leaveBtn').addEventListener('click', () => {
    window.history.replaceState({}, '', window.location.pathname);
    state.roomId = '';
    state.room = null;
    state.photos = [];
    stopSubscriptions();
    stopCamera();
    renderLanding();
  });

  renderJoinQr();

  document.querySelector('#copyBtn').addEventListener('click', async () => {
    await navigator.clipboard.writeText(roomLink(state.roomId));
    document.querySelector('#copyBtn').textContent = 'Copied';
    setTimeout(() => document.querySelector('#copyBtn').textContent = 'Copy', 1200);
  });

  document.querySelector('#switchCameraBtn').addEventListener('click', async () => {
    state.facingMode = state.facingMode === 'user' ? 'environment' : 'user';
    await startCurrentCamera();
  });

  document.querySelectorAll('.filter-swatch').forEach((button) => {
    button.addEventListener('click', () => selectFilter(button.dataset.filterId));
  });

  document.querySelectorAll('.timer-picker .timer-option').forEach((button) => {
    button.addEventListener('click', () => {
      state.timerSeconds = Number(button.dataset.seconds);
      document.querySelectorAll('.timer-picker .timer-option').forEach((option) => {
        option.classList.toggle('active', option === button);
      });
    });
  });

  document.querySelector('#onionToggleBtn').addEventListener('click', () => {
    state.onionSkinOn = !state.onionSkinOn;
    renderOnionSkin();
  });

  document.querySelector('#takePhotoBtn').addEventListener('click', takePhotoFlow);
  document.querySelector('#retakeBtn').addEventListener('click', retakePhoto);
  document.querySelector('#confirmBtn').addEventListener('click', confirmPhoto);
  document.querySelector('#syncBtn').addEventListener('click', requestSyncFlow);
  document.querySelector('#cancelReplaceBtn').addEventListener('click', cancelReplacingPhoto);
  document.querySelector('#notifyToggleBtn').addEventListener('click', requestNotificationPermissionFlow);
  updateNotifyToggleButton();

  document.querySelector('#captionInput').addEventListener('input', (event) => {
    if (!state.pendingCapture) return;
    state.pendingCapture.caption = sanitizeCaption(event.target.value);
  });

  // Delegated: #progressPanel's innerHTML is rebuilt on every room update
  // (real-time thumbnails), so a listener bound directly to the edit
  // buttons would be lost each time. Binding it once on the stable parent
  // instead survives those re-renders.
  document.querySelector('#progressPanel').addEventListener('click', (event) => {
    const editButton = event.target.closest('.thumb-edit-btn');
    if (editButton) {
      openCaptionEditor(editButton.dataset.role, Number(editButton.dataset.index));
      return;
    }

    const retakeButton = event.target.closest('.thumb-retake-btn');
    if (retakeButton) {
      startReplacingPhoto(Number(retakeButton.dataset.index));
      return;
    }

    const reactionButton = event.target.closest('.thumb-reaction-btn');
    if (reactionButton) {
      toggleReactionFlow(reactionButton.dataset.role, Number(reactionButton.dataset.index));
    }
  });

  document.querySelector('#captionEditorCancelBtn').addEventListener('click', closeCaptionEditor);
  document.querySelector('#captionEditorSaveBtn').addEventListener('click', saveCaptionEditor);
  document.querySelector('#captionEditorOverlay').addEventListener('click', (event) => {
    if (event.target.id === 'captionEditorOverlay') closeCaptionEditor();
  });
}

// Which of your own photos to ghost over the live preview. When redoing a
// slot it's that same slot — matching the shot you're replacing is the
// whole point. Otherwise it's your most recent one, to line the next shot
// up against it.
function onionSkinPhoto() {
  const mine = state.photos.filter((photo) => photo.owner === state.role);
  if (!mine.length) return null;

  if (state.replacingIndex) {
    return mine.find((photo) => photo.index === state.replacingIndex) || null;
  }

  return mine.reduce((latest, photo) => (photo.index > latest.index ? photo : latest));
}

function renderOnionSkin() {
  const image = document.querySelector('#onionSkin');
  const toggle = document.querySelector('#onionToggleBtn');
  if (!image || !toggle) return;

  const photo = onionSkinPhoto();

  // Nothing to trace over until at least one photo exists.
  toggle.classList.toggle('hidden', !photo);
  if (!photo) {
    image.classList.add('hidden');
    return;
  }

  toggle.classList.toggle('active', state.onionSkinOn);
  toggle.setAttribute('aria-pressed', String(state.onionSkinOn));

  if (!state.onionSkinOn) {
    image.classList.add('hidden');
    return;
  }

  if (image.dataset.src !== photo.downloadUrl) {
    image.dataset.src = photo.downloadUrl;
    image.src = photo.downloadUrl;
  }

  // The stored photo is already un-mirrored, but the live preview is
  // mirrored for the front camera — so the ghost has to be flipped to
  // sit the same way round as what you see of yourself.
  image.classList.toggle('mirrored', state.facingMode === 'user');
  image.classList.remove('hidden');
}

// Rendered locally rather than through any QR web service on purpose: the
// room link is the only thing standing between a stranger and your photos,
// so it must never be handed to a third-party image API to draw.
async function renderJoinQr() {
  const image = document.querySelector('#joinQr');
  if (!image) return;

  try {
    // Loaded on demand: the QR encoder is only ever needed inside a booth,
    // so it shouldn't sit in the initial download either.
    const { default: QRCode } = await import('qrcode');

    image.src = await QRCode.toDataURL(roomLink(state.roomId), {
      width: 300,
      margin: 1,
      color: { dark: '#5a2a35', light: '#ffffff' }
    });
  } catch {
    // No QR is survivable — the Copy link button below it still works.
    image.remove();
  }
}

function selectFilter(filterId) {
  if (!FILTERS.some((filter) => filter.id === filterId)) return;

  state.activeFilter = filterId;

  const video = document.querySelector('#cameraPreview');
  if (video) video.style.filter = activeFilterCss();

  // Toggle the active swatch in place instead of a full re-render, so the
  // live camera feed never flickers when switching filters.
  document.querySelectorAll('.filter-swatch').forEach((button) => {
    button.classList.toggle('active', button.dataset.filterId === filterId);
  });
}

async function startCurrentCamera() {
  const video = document.querySelector('#cameraPreview');
  const errorBox = document.querySelector('#cameraError');
  if (!video || !errorBox) return;

  try {
    errorBox.classList.add('hidden');
    state.cameraStarted = false;
    updateRoomView();

    await startCamera(video, state.facingMode);

    state.cameraStarted = true;
    video.classList.toggle('mirrored', state.facingMode === 'user');
    video.style.filter = activeFilterCss();

    renderOnionSkin();
    updateRoomView();
  } catch (error) {
    state.cameraStarted = false;
    errorBox.textContent = error.message || 'Camera could not start.';
    errorBox.classList.remove('hidden');

    updateRoomView();
  }
}

function buildFilterRow() {
  return FILTERS.map(
    (filter) => `
      <button
        type="button"
        class="filter-swatch${filter.id === state.activeFilter ? ' active' : ''}"
        data-filter-id="${filter.id}"
        style="filter:${cssFromOps(filter.ops)}"
        title="${escapeAttr(filter.label)}"
      >${escapeHtml(filter.label.slice(0, 2))}</button>
    `
  ).join('');
}

function buildThumbRow(role) {
  const ownerPhotos = state.photos
    .filter((photo) => photo.owner === role)
    .reduce((map, photo) => map.set(photo.index, photo), new Map());

  const slots = [1, 2, 3].map((index) => {
    const photo = ownerPhotos.get(index);
    if (photo?.downloadUrl) {
      // Only the owner of a photo can edit its caption — matches the
      // Firestore rules, which only allow the owning role's uid to write
      // to that photo doc.
      const editButton = role === state.role
        ? `<button type="button" class="thumb-edit-btn" data-role="${role}" data-index="${index}" title="Edit caption" aria-label="Edit caption for photo ${index}">${ICONS.pencil}</button>`
        : '';

      const retakeButton = role === state.role
        ? `<button type="button" class="thumb-retake-btn" data-index="${index}" title="Retake this photo" aria-label="Retake photo ${index}">${ICONS.refresh}</button>`
        : '';

      // Anyone can react to any photo — reacting is the viewer's own
      // expression, not something the photo owner controls.
      const partnerRole = otherRole(state.role);
      const partnerReacted = Boolean(photo.reactions?.[partnerRole]);
      const myReacted = Boolean(photo.reactions?.[state.role]);

      const partnerBadge = partnerReacted
        ? `<span class="thumb-partner-heart" title="${escapeAttr(ROLES[partnerRole].name)} loves this photo">${ICONS.heartFilled}</span>`
        : '';
      const reactionButton = `<button
        type="button"
        class="thumb-reaction-btn${myReacted ? ' reacted' : ''}"
        data-role="${role}"
        data-index="${index}"
        title="${myReacted ? 'Remove reaction' : 'Like this photo'}"
        aria-label="${myReacted ? 'Remove reaction from photo' : 'Like photo'} ${index}"
      >${myReacted ? ICONS.heartFilled : ICONS.heart}</button>`;

      const replacing = role === state.role && state.replacingIndex === index;

      return `<div class="thumb-slot filled${replacing ? ' replacing' : ''}"><img src="${escapeAttr(photo.downloadUrl)}" alt="${escapeAttr(ROLES[role].name)} photo ${index}" loading="lazy" />${editButton}${retakeButton}${partnerBadge}${reactionButton}</div>`;
    }
    return `<div class="thumb-slot empty">${index}</div>`;
  });

  return `<div class="thumb-row thumb-row-${role}">${slots.join('')}</div>`;
}

// Draws the two cities as endpoints of a curved arc — the visual shorthand
// for a long-haul flight path — with each side's live local time and a
// sun/moon marker, and the distance riding on the curve itself.
function renderDistancePanel() {
  const panel = document.querySelector('#distancePanel');
  if (!panel || !state.room) return;

  const myRole = state.role;
  const theirRole = otherRole(myRole);
  const mine = state.room.participants?.[myRole]?.location;
  const theirs = state.room.participants?.[theirRole]?.location;

  if (!isUsableLocation(mine) && !isUsableLocation(theirs)) {
    panel.classList.add('hidden');
    panel.innerHTML = '';
    return;
  }

  panel.classList.remove('hidden');

  // Only one side has picked a city so far — show what we have plus a
  // gentle nudge, rather than an empty or broken-looking arc.
  if (!isUsableLocation(mine) || !isUsableLocation(theirs)) {
    const known = isUsableLocation(mine) ? mine : theirs;
    const knownRole = isUsableLocation(mine) ? myRole : theirRole;
    const clock = timeInZone(known.timezone);

    panel.innerHTML = `
      <div class="distance-single">
        <span class="distance-city">${ICONS.pin} ${escapeHtml(describeLocation(known))}</span>
        ${clock ? `<span class="distance-clock">${clock.isNight ? ICONS.moon : ICONS.sun} ${escapeHtml(clock.label)}</span>` : ''}
        ${weatherChip(knownRole)}
      </div>
      <p class="distance-hint">${escapeHtml(
        knownRole === myRole
          ? `Waiting for ${ROLES[theirRole].name} to add their city.`
          : 'Add your own city to see the distance between you.'
      )}</p>
    `;
    return;
  }

  const km = distanceBetween(mine, theirs);
  const myClock = timeInZone(mine.timezone);
  const theirClock = timeInZone(theirs.timezone);
  const offset = hourOffsetBetween(mine.timezone, theirs.timezone);
  const dayDelta = dayDeltaBetween(myClock, theirClock);

  const offsetLabel = offset === 0
    ? 'in the same time zone'
    : `${Math.abs(offset)}h ${offset > 0 ? 'ahead' : 'behind'}`;

  // The detail that makes long distance feel real: not just a different
  // hour, but a different day altogether.
  const dayNote = dayDelta === 1
    ? ` — already ${theirClock.weekday} there`
    : dayDelta === -1
      ? ` — still ${theirClock.weekday} there`
      : '';

  const dot = (role, clock) => `
    <div class="distance-side">
      <span class="distance-dot distance-dot-${role}">${clock?.isNight ? ICONS.moon : ICONS.sun}</span>
      <strong class="distance-time">${clock ? escapeHtml(clock.label) : '--:--'}</strong>
      ${weatherChip(role)}
      <span class="distance-city">${escapeHtml(describeLocation(role === myRole ? mine : theirs))}</span>
      <span class="distance-who">${escapeHtml(ROLES[role].name)}</span>
    </div>
  `;

  // The flight path draws itself in, and the distance counts up — but only
  // the first time the pair of cities appears. This panel is rewritten
  // every 30 seconds by the clock ticker.
  const isIntro = !state.distanceIntroDone;
  state.distanceIntroDone = true;

  panel.innerHTML = `
    <div class="distance-visual">
      ${dot(myRole, myClock)}
      <div class="distance-arc">
        <svg viewBox="0 0 120 48" aria-hidden="true" class="${isIntro ? 'arc-draw' : ''}">
          <path d="M6 40 Q60 -6 114 40" fill="none" stroke="rgba(199,52,90,0.45)" stroke-width="2" stroke-dasharray="5 4" />
          <circle cx="6" cy="40" r="4" fill="var(--viktor)" />
          <circle cx="114" cy="40" r="4" fill="var(--jericka)" />
          <text x="60" y="20" text-anchor="middle" font-size="13" fill="#c7345a">♥</text>
        </svg>
        <span class="distance-km">${escapeHtml(formatDistanceKm(km))}</span>
      </div>
      ${dot(theirRole, theirClock)}
    </div>
    <p class="distance-hint">${escapeHtml(`${ROLES[theirRole].name} is ${offsetLabel}${dayNote}`)}</p>
  `;

  if (isIntro && km != null) {
    countUp(panel.querySelector('.distance-km'), Math.round(km), {
      format: (value) => formatDistanceKm(value)
    });
  }
}

function weatherChip(role) {
  const weather = state.weather[role];
  if (!weather) return '';
  return `<span class="distance-weather" title="${escapeAttr(weather.label)}">${weatherIcon(weather.code)} ${escapeHtml(String(weather.temperature))}°</span>`;
}

// Signature of both stored cities. Weather only needs re-fetching when this
// changes — which is also how the first fetch gets triggered, since the
// room (and therefore any location at all) arrives asynchronously from
// Firestore some time after the room screen is first rendered.
function weatherKey() {
  return ['viktor', 'jericka']
    .map((role) => {
      const location = state.room?.participants?.[role]?.location;
      return isUsableLocation(location) ? `${location.latitude},${location.longitude}` : '-';
    })
    .join('|');
}

function maybeRefreshWeather() {
  const key = weatherKey();
  if (key === state.weatherKey) return;
  state.weatherKey = key;
  refreshWeather();
}

// Conditions move far slower than the clock, and this is a third-party API
// we don't want to lean on. A failed lookup just leaves the chip out.
async function refreshWeather() {
  const roles = ['viktor', 'jericka'];

  await Promise.all(
    roles.map(async (role) => {
      const location = state.room?.participants?.[role]?.location;
      if (!isUsableLocation(location)) {
        state.weather[role] = null;
        return;
      }
      state.weather[role] = await fetchWeather(location);
    })
  );

  renderDistancePanel();
}

function startWeatherTicker() {
  stopWeatherTicker();
  // Periodic top-up only. The initial fetch is driven by maybeRefreshWeather()
  // once the room snapshot actually delivers the cities.
  state.weatherTimer = window.setInterval(refreshWeather, 15 * 60 * 1000);
}

function stopWeatherTicker() {
  if (state.weatherTimer) window.clearInterval(state.weatherTimer);
  state.weatherTimer = null;
}

// Local times drift while the room stays open, so nudge the panel every
// half minute. Cheap: it only rewrites the small status-card block.
function startClockTicker() {
  stopClockTicker();
  state.clockTimer = window.setInterval(renderDistancePanel, 30000);
}

function stopClockTicker() {
  if (state.clockTimer) window.clearInterval(state.clockTimer);
  state.clockTimer = null;
}

function updateRoomView() {
  if (!state.room) return;

  const anniversaryLine = document.querySelector('#anniversaryLine');
  if (anniversaryLine) {
    // Falls back to the constant so rooms created before the date was
    // fixed still show the count.
    const days = daysTogether(state.room.anniversaryDate || ANNIVERSARY_DATE);
    anniversaryLine.classList.toggle('hidden', !days);

    if (days && !state.dayCountIntroDone) {
      state.dayCountIntroDone = true;
      countUp(anniversaryLine, days, { format: (value) => `${ICONS.hearts} Together for ${formatDays(value)}` });
    } else {
      anniversaryLine.innerHTML = togetherLine(state.room.anniversaryDate || ANNIVERSARY_DATE);
    }
  }

  maybeRefreshWeather();
  renderDistancePanel();

  const viktorCount = state.room.participants?.viktor?.photoCount || 0;
  const jerickaCount = state.room.participants?.jericka?.photoCount || 0;
  const total = viktorCount + jerickaCount;

  const progressPanel = document.querySelector('#progressPanel');
  const roomMessage = document.querySelector('#roomMessage');
  if (progressPanel) {
    progressPanel.innerHTML = `
      <div class="progress-row"><span>Viktor</span><strong>${viktorCount}/3</strong></div>
      <div class="meter meter-viktor"><span style="width:${(viktorCount / 3) * 100}%"></span></div>
      ${buildThumbRow('viktor')}
      <div class="progress-row"><span>Jericka</span><strong>${jerickaCount}/3</strong></div>
      <div class="meter meter-jericka"><span style="width:${(jerickaCount / 3) * 100}%"></span></div>
      ${buildThumbRow('jericka')}
      <div class="total-progress">Total memory progress: <strong>${total}/6</strong></div>
    `;
  }

  const myCount = state.room.participants?.[state.role]?.photoCount || 0;
  const theirRole = otherRole(state.role);
  const theirCount = state.room.participants?.[theirRole]?.photoCount || 0;
  const bothComplete = viktorCount >= 3 && jerickaCount >= 3;

  // Only celebrate the actual moment it happens. Starting at null means
  // re-opening an already-finished booth stays quiet — the party is for
  // crossing the line, not for walking back past it.
  const wasComplete = state.bothCompleteSeen;
  state.bothCompleteSeen = bothComplete;
  if (bothComplete && wasComplete === false) {
    celebrateCompletion();
  }

  if (roomMessage) {
    if (state.replacingIndex) {
      roomMessage.textContent = `Retaking photo ${state.replacingIndex}. Take a new one, or cancel below.`;
    } else if (bothComplete) {
      roomMessage.textContent = 'Both of you are done. You can generate your collage now.';
    } else if (myCount >= 3) {
      roomMessage.textContent = `Your photos are done. Waiting for ${ROLES[state.role].waitingFor} to finish.`;
    } else if (theirCount >= 3) {
      roomMessage.textContent = `${ROLES[state.role].waitingFor} is done. Your turn to finish the memory.`;
    } else {
      roomMessage.textContent = 'Take 3 sweet photos. The room updates in real time.';
    }
  }

  const takeButton = document.querySelector('#takePhotoBtn');
  if (takeButton) {
    const replacing = Boolean(state.replacingIndex);
    takeButton.disabled = (!replacing && myCount >= 3) || Boolean(state.pendingCapture) || !state.cameraStarted;
    takeButton.textContent = replacing
      ? `Retake photo ${state.replacingIndex}`
      : myCount >= 3
        ? 'Your 3 photos are done'
        : `Take photo ${myCount + 1}/3`;
  }

  const cancelReplaceBtn = document.querySelector('#cancelReplaceBtn');
  if (cancelReplaceBtn) {
    cancelReplaceBtn.classList.toggle('hidden', !state.replacingIndex);
  }

  renderOnionSkin();

  const syncButton = document.querySelector('#syncBtn');
  if (syncButton) {
    const partnerJoined = Boolean(state.room.participants?.[otherRole(state.role)]?.joined);
    syncButton.disabled = myCount >= 3 || Boolean(state.pendingCapture) || !state.cameraStarted || !partnerJoined;
  }

  renderCollageSection(bothComplete);
}

async function takePhotoFlow() {
  const countdown = document.querySelector('#countdown');
  const video = document.querySelector('#cameraPreview');
  const cameraActions = document.querySelector('#cameraActions');

  if (!video || !state.cameraStarted) return;

  cameraActions.classList.add('disabled');
  countdown.classList.remove('hidden');

  for (let number = state.timerSeconds; number >= 1; number -= 1) {
    countdown.textContent = number;
    countdown.classList.remove('pulse');
    void countdown.offsetWidth;
    countdown.classList.add('pulse');
    await sleep(COUNTDOWN_TICK_MS);
  }

  await finishCaptureAfterCountdown();
}

// Shared tail end of "count down, then capture" — used both by the manual
// Take Photo button (classic fixed 3-2-1 above) and by the synced countdown
// (which schedules this same function to land exactly at the shared
// instant, see scheduleSyncCountdown below).
async function finishCaptureAfterCountdown() {
  const countdown = document.querySelector('#countdown');
  const cameraActions = document.querySelector('#cameraActions');
  const video = document.querySelector('#cameraPreview');

  if (countdown) {
    countdown.textContent = '♡';
    countdown.classList.remove('pulse');
  }
  playShutterSound();
  triggerShutterFeedback();
  await sleep(260);
  if (countdown) {
    countdown.classList.add('hidden');
    countdown.classList.remove('pulse');
  }

  const myCount = state.room?.participants?.[state.role]?.photoCount || 0;
  const replacingIndex = state.replacingIndex;

  // On a synced countdown, one side may have nothing to do — already at
  // 3/3, camera not ready, or already mid-capture. The shared moment simply
  // doesn't apply to them; only re-enable the controls and stop. Someone
  // mid-retake is exempt from the 3/3 check: that's the whole point.
  if (!video || !state.cameraStarted || state.pendingCapture || (!replacingIndex && myCount >= 3)) {
    cameraActions?.classList.remove('disabled');
    return;
  }

  try {
    state.pendingCapture = await capturePhoto(video, state.facingMode, findFilter(state.activeFilter).ops);

    // Carry the existing caption over when redoing a slot, so a retake
    // doesn't silently throw away words the person still means.
    const existing = replacingIndex
      ? state.photos.find((item) => item.owner === state.role && item.index === replacingIndex)?.caption || ''
      : '';

    state.pendingCapture.caption = existing;
    document.querySelector('#photoPreview').src = state.pendingCapture.previewUrl;
    const captionInput = document.querySelector('#captionInput');
    captionInput.value = existing;
    document.querySelector('#previewPanel').classList.remove('hidden');
    document.querySelector('#cameraActions').classList.add('hidden');
    captionInput.focus();
  } catch (error) {
    showError(error.message, 'Could not take the photo.');
  } finally {
    cameraActions?.classList.remove('disabled');
  }
}

function startReplacingPhoto(index) {
  state.replacingIndex = index;
  retakePhoto();
  updateRoomView();
  document.querySelector('#cameraPreview')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function cancelReplacingPhoto() {
  state.replacingIndex = null;
  retakePhoto();
  updateRoomView();
}

async function requestSyncFlow() {
  const myCount = state.room?.participants?.[state.role]?.photoCount || 0;
  if (myCount >= 3) return showError('You already have all 3 photos confirmed.');

  const partnerRole = otherRole(state.role);
  if (!state.room?.participants?.[partnerRole]?.joined) {
    return showError(`${ROLES[partnerRole].name} hasn't joined this room yet.`);
  }

  try {
    const { requestSyncCountdown } = await roomApi();
    await requestSyncCountdown({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      seconds: state.timerSeconds
    });
  } catch (error) {
    showError(error.message, 'Could not start the synced countdown.');
  }
}

// Fires whenever the room doc changes and looks at state.room.syncCountdown.
// Firestore's serverTimestamp() shows as null locally until the write is
// acknowledged by the server — this naturally skips those interim snapshots
// and only acts once a real, server-resolved timestamp is available, so
// both partners' devices schedule against the exact same instant.
function handleSyncCountdownChange() {
  const sync = state.room?.syncCountdown;

  if (!sync?.requestedAt?.toMillis) {
    return;
  }

  const requestedAtMs = sync.requestedAt.toMillis();
  if (state.syncScheduledFor === requestedAtMs) return;
  state.syncScheduledFor = requestedAtMs;

  if (sync.requestedBy !== state.role) {
    notifyPartnerSyncRequest();
  }

  // Older rooms have no `seconds` on the request; fall back to the classic
  // 3-2-1 rather than counting down from undefined.
  const seconds = Number.isFinite(sync.seconds) ? sync.seconds : 3;

  // The visible countdown has to fit inside the lead time, plus a margin
  // for the snapshot to reach both devices before the numbers start.
  scheduleSyncCountdown(requestedAtMs + seconds * 1000 + SYNC_LEAD_MS, seconds);
}

// Schedules the visible 3-2-1 and the final shutter with independent
// setTimeout calls, each computing its own delay from Date.now() against
// the fixed target instant — rather than a chained/polled countdown, so
// there's no compounding drift regardless of when this function itself
// happens to run.
function scheduleSyncCountdown(targetAtMs, seconds = 3) {
  clearSyncTimers();

  const countdown = document.querySelector('#countdown');
  const cameraActions = document.querySelector('#cameraActions');

  const showNumber = (label) => {
    if (!countdown) return;
    countdown.classList.remove('hidden');
    cameraActions?.classList.add('disabled');
    countdown.textContent = String(label);
    countdown.classList.remove('pulse');
    void countdown.offsetWidth;
    countdown.classList.add('pulse');
    hideSyncStatus();
  };

  const scheduleAt = (msBeforeTarget, fn) => {
    const delay = targetAtMs - msBeforeTarget - Date.now();
    state.syncTimers.push(window.setTimeout(fn, Math.max(0, delay)));
  };

  const countdownStartsAt = targetAtMs - seconds * 1000;

  const tickStatus = () => {
    const remaining = countdownStartsAt - Date.now();
    if (remaining > 0) {
      showSyncStatus(`Get ready — countdown starts in ${Math.ceil(remaining / 1000)}s...`);
      state.syncTimers.push(window.setTimeout(tickStatus, 500));
    }
  };
  tickStatus();

  for (let number = seconds; number >= 1; number -= 1) {
    scheduleAt(number * 1000, () => showNumber(number));
  }

  scheduleAt(0, () => finishCaptureAfterCountdown().then(async () => {
    hideSyncStatus();
    // Whoever requested the sync clears it once it fires, returning the
    // room to a clean state for the next one. Harmless no-op if the other
    // side (or a stale timer) races to clear it too.
    if (state.room?.syncCountdown?.requestedBy === state.role) {
      (await roomApi()).clearSyncCountdown(state.roomId);
    }
  }));
}

function clearSyncTimers() {
  state.syncTimers.forEach((handle) => window.clearTimeout(handle));
  state.syncTimers = [];
}

function showSyncStatus(text) {
  const el = document.querySelector('#syncStatus');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
}

function hideSyncStatus() {
  const el = document.querySelector('#syncStatus');
  if (!el) return;
  el.classList.add('hidden');
}

function updateNotifyToggleButton() {
  const button = document.querySelector('#notifyToggleBtn');
  if (!button || !('Notification' in window)) {
    button?.classList.add('hidden');
    return;
  }

  if (Notification.permission === 'granted') {
    button.innerHTML = `${ICONS.bell} Notifications on`;
    button.disabled = true;
  } else if (Notification.permission === 'denied') {
    button.innerHTML = `${ICONS.bellOff} Notifications blocked`;
    button.disabled = true;
  } else {
    button.innerHTML = `${ICONS.bell} Enable notifications`;
    button.disabled = false;
  }
}

async function requestNotificationPermissionFlow() {
  if (!('Notification' in window)) return;
  await Notification.requestPermission();
  updateNotifyToggleButton();
}

// Requesting permission needs a real user gesture (the button above), but
// SHOWING a notification once permission is already granted does not — this
// runs straight from the Firestore snapshot listener with no user gesture
// available, which is fine as long as permission was granted ahead of time.
async function notifyPartnerSyncRequest() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;

  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('Synced countdown started! 💕', {
      body: `${ROLES[otherRole(state.role)].name} wants to shoot together — get ready!`,
      icon: `${import.meta.env.BASE_URL}icon-192.png`,
      badge: `${import.meta.env.BASE_URL}icon-192.png`,
      tag: 'photobooth-sync',
      vibrate: [80, 40, 80]
    });
  } catch {
    // Notifications are a nice-to-have; never block the countdown on this.
  }
}

function retakePhoto() {
  if (state.pendingCapture?.previewUrl) URL.revokeObjectURL(state.pendingCapture.previewUrl);
  state.pendingCapture = null;
  document.querySelector('#captionInput').value = '';
  document.querySelector('#previewPanel').classList.add('hidden');
  document.querySelector('#cameraActions').classList.remove('hidden');
}

async function confirmPhoto() {
  if (!state.pendingCapture) return;

  const button = document.querySelector('#confirmBtn');
  const myCount = state.room?.participants?.[state.role]?.photoCount || 0;
  const replacingIndex = state.replacingIndex;
  button.disabled = true;
  button.textContent = 'Uploading...';

  try {
    const { uploadPhoto } = await roomApi();
    await uploadPhoto({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      index: replacingIndex || myCount + 1,
      blob: state.pendingCapture.blob,
      caption: sanitizeCaption(state.pendingCapture.caption),
      replace: Boolean(replacingIndex)
    });
    state.replacingIndex = null;
    retakePhoto();
    updateRoomView();
    showToast(replacingIndex ? `Photo ${replacingIndex} replaced ♡` : 'Saved ♡');
  } catch (error) {
    showError(error.message, 'Upload failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Confirm photo';
  }
}



function openCaptionEditor(role, index) {
  const photo = state.photos.find((item) => item.owner === role && item.index === index);
  if (!photo) return;

  state.editingCaption = { role, index };

  const overlay = document.querySelector('#captionEditorOverlay');
  const img = document.querySelector('#captionEditorImg');
  const input = document.querySelector('#captionEditorInput');

  img.src = photo.downloadUrl;
  input.value = photo.caption || '';
  input.style.color = role === 'viktor' ? '#2a5a86' : '#9b2948';
  overlay.classList.remove('hidden');

  // The overlay is toggled with display:none, and a CSS animation won't
  // replay on an element that was merely un-hidden. Nudging it off and on
  // (with a forced reflow between) restarts the entry animation each time
  // the editor opens, instead of only on first render.
  restartAnimation(overlay);
  restartAnimation(overlay.querySelector('.caption-editor-card'));

  input.focus();
}

function closeCaptionEditor() {
  state.editingCaption = null;
  document.querySelector('#captionEditorOverlay').classList.add('hidden');
}

async function saveCaptionEditor() {
  if (!state.editingCaption) return;

  const { role, index } = state.editingCaption;
  const input = document.querySelector('#captionEditorInput');
  const saveBtn = document.querySelector('#captionEditorSaveBtn');
  const caption = sanitizeCaption(input.value);

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const { updateCaption } = await roomApi();
    await updateCaption({ roomId: state.roomId, uid: state.user.uid, role, index, caption });
    closeCaptionEditor();
    showToast('Caption saved ♡');
  } catch (error) {
    showError(error.message, 'Could not save the caption.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save';
  }
}

// Reacting is quick and low-stakes on purpose — no loading state, no
// disabling the button, just an optimistic-feeling toggle. The Firestore
// realtime subscription re-renders the actual state moments later anyway;
// if the write ever fails, it silently reverts on the next snapshot rather
// than interrupting anyone with an alert over a heart tap.
async function toggleReactionFlow(ownerRole, index) {
  const photo = state.photos.find((item) => item.owner === ownerRole && item.index === index);
  if (!photo) return;

  const nextValue = !photo.reactions?.[state.role];

  try {
    const { setReaction } = await roomApi();
    await setReaction({
      roomId: state.roomId,
      uid: state.user.uid,
      myRole: state.role,
      ownerRole,
      index,
      value: nextValue
    });
  } catch (error) {
    console.error('Reaction failed', error);
  }
}

function buildSegmented(label, stateKey, options) {
  return `
    <div class="layout-control">
      <span class="field-label">${escapeHtml(label)}</span>
      <div class="segmented" data-state-key="${stateKey}" role="group" aria-label="${escapeAttr(label)}">
        ${options
          .map(
            (option) =>
              `<button type="button" class="segmented-option${state[stateKey] === option.value ? ' active' : ''}" data-value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</button>`
          )
          .join('')}
      </div>
    </div>
  `;
}

// Feature-detects the Web Share API's ability to share files (not just
// text/links) — support varies a lot by browser, so the Share button is
// only rendered when it will actually work, instead of showing a button
// that fails on desktop browsers without file-sharing support.
function canShareFiles() {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File(['probe'], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

// The collage published to the room, if any — the one artifact both of you
// share, as opposed to whatever each browser happens to have rendered.
function buildSharedCollageBlock() {
  const collage = state.room?.collage;
  if (!collage?.downloadUrl) return '';

  const savedByMe = collage.savedBy === state.role;
  const savedByName = ROLES[collage.savedBy]?.name || 'Someone';
  const details = [collage.layout, collage.theme, collage.format]
    .filter((value) => value && value !== 'original')
    .join(' · ');

  return `
    <div class="shared-collage">
      <p class="eyebrow">saved to this booth</p>
      <img class="collage-preview" src="${escapeAttr(collage.downloadUrl)}" alt="Collage saved to this booth" />
      <p class="shared-collage-meta">${escapeHtml(
        savedByMe ? 'You saved this for both of you.' : `${savedByName} saved this for both of you.`
      )}${details ? ` (${escapeHtml(details)})` : ''}</p>
      <a class="secondary shared-collage-download" href="${escapeAttr(collage.downloadUrl)}" target="_blank" rel="noopener">Download the shared one</a>
    </div>
  `;
}

function renderCollageSection(canGenerate) {
  const section = document.querySelector('#collageSection');
  if (!section) return;

  if (!canGenerate) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  const preview = state.collagePreviewUrl
    ? `<img class="collage-preview" src="${state.collagePreviewUrl}" alt="Generated collage preview" />`
    : '';

  section.innerHTML = `
    <div class="collage-header">
      <div>
        <p class="eyebrow">final memory</p>
        <h2>Your photobooth collage is ready</h2>
        <p>Generate a high resolution PNG from all 6 photos.</p>
      </div>
      <div class="layout-controls">
        ${buildSegmented('Layout', 'collageLayout', [
          { value: 'grid', label: 'Grid' },
          { value: 'strip', label: 'Strip' },
          { value: 'hero', label: 'Hero' }
        ])}
        ${buildSegmented('Quality', 'collageScale', [
          { value: '1', label: 'Standard' },
          { value: '2', label: 'Print (2×)' }
        ])}
        ${buildSegmented('Theme', 'collageTheme', COLLAGE_THEMES.map((theme) => ({ value: theme.id, label: theme.label })))}
        ${buildSegmented('Format', 'collageExport', EXPORT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })))}
      </div>
    </div>
    ${preview}
    <div class="action-row">
      <button class="primary" id="generateCollageBtn">Generate collage</button>
      <button class="secondary" id="downloadCollageBtn" ${state.collageBlob ? '' : 'disabled'}>Download PNG</button>
      <button class="secondary" id="shareCollageBtn" ${state.collageBlob ? '' : 'disabled'} ${canShareFiles() ? '' : 'hidden'}>Share</button>
      <button class="secondary" id="publishCollageBtn" ${state.collageBlob ? '' : 'disabled'}>Save to booth</button>
    </div>

    ${buildSharedCollageBlock()}

    <div class="danger-zone">
      <p class="danger-zone-label">Danger zone</p>
      <p class="danger-zone-hint">Permanently deletes this room and every uploaded photo for both of you.</p>
      <button class="danger small" id="deleteSessionBtn">Delete booth</button>
    </div>
  `;

  document.querySelectorAll('.segmented').forEach((group) => {
    const stateKey = group.dataset.stateKey;
    group.querySelectorAll('.segmented-option').forEach((button) => {
      button.addEventListener('click', () => {
        // Kept in state, not just in the DOM: this section is fully
        // re-rendered after every generation, so a DOM-only selection
        // would silently snap back to the default each time.
        state[stateKey] = button.dataset.value;
        group.querySelectorAll('.segmented-option').forEach((option) => {
          option.classList.toggle('active', option === button);
        });
      });
    });
  });

  document.querySelector('#generateCollageBtn').addEventListener('click', generateCollageFlow);
  document.querySelector('#downloadCollageBtn').addEventListener('click', async () => {
    if (state.collageBlob) {
      downloadBlob(state.collageBlob, `viktor-jericka-photobooth-${state.roomId}.png`);
      (await roomApi()).setRoomCompleted(state.roomId).catch(() => undefined);
    }
  });
  document.querySelector('#shareCollageBtn')?.addEventListener('click', shareCollageFlow);
  document.querySelector('#publishCollageBtn')?.addEventListener('click', publishCollageFlow);
  document.querySelector('#deleteSessionBtn').addEventListener('click', deleteSessionFlow);
}

async function publishCollageFlow() {
  if (!state.collageBlob) return;

  const button = document.querySelector('#publishCollageBtn');
  const existing = state.room?.collage?.downloadUrl;

  if (existing) {
    const savedByName = ROLES[state.room.collage.savedBy]?.name || 'Someone';
    const confirmed = confirm(`${savedByName} already saved a collage to this booth. Replace it with yours?`);
    if (!confirmed) return;
  }

  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    const { publishCollage } = await roomApi();
    await publishCollage({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      blob: state.collageBlob,
      meta: {
        layout: state.collageLayout,
        theme: state.collageTheme,
        format: state.collageExport
      }
    });
    showToast('Saved to the booth ♡');
  } catch (error) {
    showError(error.message, 'Could not save the collage to the booth.');
  } finally {
    button.disabled = false;
    button.textContent = 'Save to booth';
  }
}

async function shareCollageFlow() {
  if (!state.collageBlob) return;

  const button = document.querySelector('#shareCollageBtn');
  const file = new File([state.collageBlob], `viktor-jericka-photobooth-${state.roomId}.png`, { type: 'image/png' });

  if (!navigator.canShare({ files: [file] })) {
    showError('File sharing is not supported here. Try Download PNG.');
    return;
  }

  button.disabled = true;
  button.textContent = 'Sharing...';

  try {
    await navigator.share({
      files: [file],
      title: 'Viktor & Jericka Photobooth',
      text: state.room?.customMessage || state.customMessage
    });
    (await roomApi()).setRoomCompleted(state.roomId).catch(() => undefined);
  } catch (error) {
    // AbortError just means the person closed the native share sheet
    // without picking anything — not an actual failure worth surfacing.
    if (error?.name !== 'AbortError') {
      showError(error.message, 'Sharing failed. Try Download PNG.');
    }
  } finally {
    button.disabled = false;
    button.textContent = 'Share';
  }
}

async function generateCollageFlow() {
  const button = document.querySelector('#generateCollageBtn');
  const layout = state.collageLayout;
  const scale = Number(state.collageScale) || 1;
  button.disabled = true;
  button.textContent = 'Generating...';

  try {
    if (state.collagePreviewUrl) URL.revokeObjectURL(state.collagePreviewUrl);

    const result = await generateCollage({
      photos: state.photos,
      customMessage: state.room?.customMessage || state.customMessage,
      layout,
      roomId: state.roomId,
      scale,
      anniversaryDate: state.room?.anniversaryDate || ANNIVERSARY_DATE,
      locations: {
        viktor: state.room?.participants?.viktor?.location || null,
        jericka: state.room?.participants?.jericka?.location || null
      },
      theme: state.collageTheme,
      exportPreset: state.collageExport
    });

    state.collageBlob = result.blob;
    state.collagePreviewUrl = result.previewUrl;
    renderCollageSection(true);
  } catch (error) {
    showError(error.message, 'Could not generate collage.');
  } finally {
    button.disabled = false;
    button.textContent = 'Generate collage';
  }
}

async function deleteSessionFlow() {
  const confirmed = confirm('Delete this booth room and all uploaded photos? This cannot be undone.');
  if (!confirmed) return;

  try {
    await (await roomApi()).deleteRoomSession(state.roomId);
    forgetRoom(state.roomId);
    window.history.replaceState({}, '', window.location.pathname);
    state.roomId = '';
    state.photos = [];
    state.room = null;
    stopSubscriptions();
    stopCamera();
    renderLanding();
  } catch (error) {
    showError(error.message, 'Could not delete the booth.');
  }
}

async function resetAllBoothsFlow() {
  const known = listRooms();
  if (!known.length) return showError('There are no booths on this device to delete.');

  const confirmed = confirm(
    `Delete all ${known.length} booth${known.length === 1 ? '' : 's'} from this device, including every uploaded photo? This cannot be undone.`
  );
  if (!confirmed) return;

  const button = document.querySelector('#resetAllBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Deleting...';
  }

  const { deleteRoomSession } = await roomApi();

  let failed = 0;
  for (const entry of known) {
    try {
      await deleteRoomSession(entry.roomId);
    } catch {
      failed += 1;
    }
  }

  forgetAllRooms();
  state.roomId = '';
  state.room = null;
  state.photos = [];
  window.history.replaceState({}, '', window.location.pathname);
  renderLanding();

  showToast(failed ? `Done, ${failed} could not be removed` : 'All booths deleted ♡');
}

function stopSubscriptions() {
  if (state.unsubscribeRoom) state.unsubscribeRoom();
  if (state.unsubscribePhotos) state.unsubscribePhotos();
  state.unsubscribeRoom = null;
  state.unsubscribePhotos = null;
  clearSyncTimers();
  stopClockTicker();
  stopWeatherTicker();
  state.syncScheduledFor = null;
  // Cleared so re-entering a room fetches fresh conditions rather than
  // matching the stale key and skipping the lookup.
  state.weatherKey = '';
  state.weather = { viktor: null, jericka: null };
  state.bothCompleteSeen = null;
  state.distanceIntroDone = false;
  state.dayCountIntroDone = false;
  // Decoded photos are only useful for the booth they belong to.
  clearCollageImageCache();
}

// Backfills the room with this browser's stored city if the room doesn't
// have one for us yet — covers rejoining an older room that was created
// before a city was ever picked.
async function syncMyLocationToRoom() {
  const mine = sanitizeLocation(state.myLocation);
  if (!mine) return;
  if (isUsableLocation(state.room?.participants?.[state.role]?.location)) return;

  try {
    const { updateLocation } = await roomApi();
    await updateLocation({ roomId: state.roomId, uid: state.user.uid, role: state.role, location: mine });
  } catch (error) {
    console.error('Could not save location', error);
  }
}

function showInlineError(inputId, message) {
  const input = document.querySelector(`#${inputId}`);
  input.classList.add('input-error');
  input.value = '';
  input.placeholder = message;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}