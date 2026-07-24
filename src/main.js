import './styles.css';
import { ensureAnonymousAuth } from './firebase.js';
import { capturePhoto, startCamera, stopCamera } from './camera.js';
import { COLLAGE_THEMES, EXPORT_PRESETS, generateCollage } from './collage.js';
import { cssFromOps, findFilter, FILTERS } from './filters.js';
import { describeLocation, describeSearchResult, fetchWeather, searchCities } from './geo.js';
import {
  expiredRoomIds,
  forgetAllRooms,
  forgetRoom,
  listRooms,
  rememberRoom,
  ROOM_MAX_AGE_MS
} from './roomHistory.js';
import {
  clearSyncCountdown,
  createRoom,
  deleteRoomSession,
  joinRoom,
  requestSyncCountdown,
  setReaction,
  setRoomCompleted,
  updateCaption,
  updateLocation,
  uploadPhoto,
  watchPhotos,
  watchRoom
} from './room.js';
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

// How far in the future a sync-countdown request aims for, from the moment
// Firestore resolves the request's server timestamp. Needs to comfortably
// cover realtime propagation to both devices (usually well under a second)
// plus a "get ready" moment before the visible 3-2-1 begins.
const SYNC_LEAD_MS = 6000;

// The day this became "us". Fixed rather than user-entered — every booth
// counts from the same start, so the day count is a property of the couple,
// not something to re-type per room.
const ANNIVERSARY_DATE = '2026-01-13';

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
  weatherTimer: null
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
  return count ? `💕 Together for ${formatDays(count)}` : '';
}

registerServiceWorker();
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
      await deleteRoomSession(roomId);
    } catch {
      // Already gone, or the other side deleted it first — either way the
      // local record should go too.
    }
    forgetRoom(roomId);
  }
}

function setApp(html) {
  app.innerHTML = html;
}

function renderLoading(message) {
  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge">♡</div>
        <h1>Viktor & Jericka Photobooth</h1>
        <p>${message}</p>
        <div class="loader" aria-label="Loading"></div>
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

function showToast(message) {
  let toast = document.querySelector('#toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.remove('toast-visible');
  // Force reflow so retriggering the class restarts the animation
  // even if a toast is already showing.
  void toast.offsetWidth;
  toast.classList.add('toast-visible');

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove('toast-visible');
  }, 1800);
}

// The physical half of the shutter: a brief white flash over the preview
// and a short haptic tap. Both are pure garnish — wrapped so an
// unsupported or blocked API can never interrupt a capture.
function triggerShutterFeedback() {
  const flash = document.querySelector('#shutterFlash');
  if (flash) {
    flash.classList.remove('flashing');
    // Force reflow so retriggering restarts the animation on rapid shots.
    void flash.offsetWidth;
    flash.classList.add('flashing');
  }

  try {
    navigator.vibrate?.([30, 40, 20]);
  } catch {
    // Haptics are unavailable on desktop and blocked in some contexts.
  }
}

let audioContext = null;

function playShutterSound() {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;

    const click = audioContext.createOscillator();
    const clickGain = audioContext.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(1400, now);
    clickGain.gain.setValueAtTime(0.05, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    click.connect(clickGain);
    clickGain.connect(audioContext.destination);
    click.start(now);
    click.stop(now + 0.07);

    const chime = audioContext.createOscillator();
    const chimeGain = audioContext.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(880, now + 0.05);
    chimeGain.gain.setValueAtTime(0.0001, now + 0.05);
    chimeGain.gain.exponentialRampToValueAtTime(0.06, now + 0.09);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    chime.connect(chimeGain);
    chimeGain.connect(audioContext.destination);
    chime.start(now + 0.05);
    chime.stop(now + 0.34);
  } catch {
    // Audio is a nice-to-have; never block capture on it.
  }
}

function renderLanding() {
  stopSubscriptions();
  stopCamera();

  const boothCount = listRooms().length;

  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge">♡</div>
        <p class="eyebrow">private long-distance couple photobooth</p>
        <h1>Viktor & Jericka Photobooth</h1>
        <p class="hero-text">Even far apart, we can still make memories together.</p>
        <p class="anniversary-line">${escapeHtml(togetherLine())}</p>

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

  document.querySelector('#createBtn').addEventListener('click', () => renderRoleGate('create'));
  document.querySelector('#joinBtn').addEventListener('click', () => renderJoinByCode());
  document.querySelector('#resetAllBtn')?.addEventListener('click', resetAllBoothsFlow);
}

function cityPreviewText() {
  if (!state.myLocation) return '';
  const now = timeInZone(state.myLocation.timezone);
  const clock = now ? ` — ${now.isNight ? '🌙' : '☀️'} ${now.label} local` : '';
  return `📍 ${describeLocation(state.myLocation)}${clock}`;
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
    preview.textContent = cityPreviewText();
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
        <div class="heart-badge">♡</div>
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
        <div class="heart-badge">♡</div>
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
        <div class="heart-badge">📍</div>
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
          <button type="button" class="secondary small" id="notifyToggleBtn">🔔 Enable notifications</button>

          <div class="share-box">
            <label class="field-label">Share link</label>
            <div class="copy-row">
              <input class="text-input" id="shareLink" readonly value="${escapeAttr(roomLink(state.roomId))}" />
              <button class="secondary" id="copyBtn">Copy</button>
            </div>
          </div>

          <div id="progressPanel" class="progress-panel"></div>
          <div id="roomMessage" class="soft-message"></div>
        </aside>

        <section class="card camera-card">
          <div class="camera-wrap">
            <video id="cameraPreview" class="camera-preview" autoplay muted playsinline></video>
            <div id="countdown" class="countdown hidden" aria-live="polite"></div>
            <div id="shutterFlash" class="shutter-flash" aria-hidden="true"></div>
            <div id="cameraError" class="camera-error hidden"></div>
          </div>

          <div id="filterRow" class="filter-row">${buildFilterRow()}</div>

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
            <button class="secondary" id="syncBtn">📸 Shoot together</button>
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
        ? `<button type="button" class="thumb-edit-btn" data-role="${role}" data-index="${index}" title="Edit caption" aria-label="Edit caption for photo ${index}">✎</button>`
        : '';

      const retakeButton = role === state.role
        ? `<button type="button" class="thumb-retake-btn" data-index="${index}" title="Retake this photo" aria-label="Retake photo ${index}">⟳</button>`
        : '';

      // Anyone can react to any photo — reacting is the viewer's own
      // expression, not something the photo owner controls.
      const partnerRole = otherRole(state.role);
      const partnerReacted = Boolean(photo.reactions?.[partnerRole]);
      const myReacted = Boolean(photo.reactions?.[state.role]);

      const partnerBadge = partnerReacted
        ? `<span class="thumb-partner-heart" title="${escapeAttr(ROLES[partnerRole].name)} loves this photo">♥</span>`
        : '';
      const reactionButton = `<button
        type="button"
        class="thumb-reaction-btn${myReacted ? ' reacted' : ''}"
        data-role="${role}"
        data-index="${index}"
        title="${myReacted ? 'Remove reaction' : 'Like this photo'}"
        aria-label="${myReacted ? 'Remove reaction from photo' : 'Like photo'} ${index}"
      >${myReacted ? '♥' : '♡'}</button>`;

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
        <span class="distance-city">📍 ${escapeHtml(describeLocation(known))}</span>
        ${clock ? `<span class="distance-clock">${clock.isNight ? '🌙' : '☀️'} ${escapeHtml(clock.label)}</span>` : ''}
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
      <span class="distance-dot distance-dot-${role}">${clock?.isNight ? '🌙' : '☀️'}</span>
      <strong class="distance-time">${clock ? escapeHtml(clock.label) : '--:--'}</strong>
      ${weatherChip(role)}
      <span class="distance-city">${escapeHtml(describeLocation(role === myRole ? mine : theirs))}</span>
      <span class="distance-who">${escapeHtml(ROLES[role].name)}</span>
    </div>
  `;

  panel.innerHTML = `
    <div class="distance-visual">
      ${dot(myRole, myClock)}
      <div class="distance-arc">
        <svg viewBox="0 0 120 48" aria-hidden="true">
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
}

function weatherChip(role) {
  const weather = state.weather[role];
  if (!weather) return '';
  return `<span class="distance-weather" title="${escapeAttr(weather.label)}">${weather.icon} ${escapeHtml(String(weather.temperature))}°</span>`;
}

// Weather is fetched per room entry and then only occasionally — conditions
// move far slower than the clock, and this is a third-party API we don't
// want to lean on. A failed lookup just leaves the chip out.
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
  refreshWeather();
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
    const line = togetherLine(state.room.anniversaryDate || ANNIVERSARY_DATE);
    anniversaryLine.textContent = line;
    anniversaryLine.classList.toggle('hidden', !line);
  }

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

  for (const number of [3, 2, 1]) {
    countdown.textContent = number;
    countdown.classList.remove('pulse');
    void countdown.offsetWidth;
    countdown.classList.add('pulse');
    await sleep(750);
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
    alert(error.message);
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
  if (myCount >= 3) return alert('You already have all 3 photos confirmed.');

  const partnerRole = otherRole(state.role);
  if (!state.room?.participants?.[partnerRole]?.joined) {
    return alert(`${ROLES[partnerRole].name} hasn't joined this room yet.`);
  }

  try {
    await requestSyncCountdown({ roomId: state.roomId, uid: state.user.uid, role: state.role });
  } catch (error) {
    alert(error.message || 'Could not start the synced countdown.');
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

  scheduleSyncCountdown(requestedAtMs + SYNC_LEAD_MS);
}

// Schedules the visible 3-2-1 and the final shutter with independent
// setTimeout calls, each computing its own delay from Date.now() against
// the fixed target instant — rather than a chained/polled countdown, so
// there's no compounding drift regardless of when this function itself
// happens to run.
function scheduleSyncCountdown(targetAtMs) {
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

  const tickStatus = () => {
    const remaining = targetAtMs - 3000 - Date.now();
    if (remaining > 0) {
      showSyncStatus(`Synced countdown in ${Math.ceil((remaining + 3000) / 1000)}s...`);
      state.syncTimers.push(window.setTimeout(tickStatus, 500));
    }
  };
  tickStatus();

  scheduleAt(3000, () => showNumber(3));
  scheduleAt(2000, () => showNumber(2));
  scheduleAt(1000, () => showNumber(1));
  scheduleAt(0, () => finishCaptureAfterCountdown().then(() => {
    hideSyncStatus();
    // Whoever requested the sync clears it once it fires, returning the
    // room to a clean state for the next one. Harmless no-op if the other
    // side (or a stale timer) races to clear it too.
    if (state.room?.syncCountdown?.requestedBy === state.role) {
      clearSyncCountdown(state.roomId);
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
    button.textContent = '🔔 Notifications on';
    button.disabled = true;
  } else if (Notification.permission === 'denied') {
    button.textContent = '🔕 Notifications blocked in browser';
    button.disabled = true;
  } else {
    button.textContent = '🔔 Enable notifications';
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
    alert(error.message || 'Upload failed.');
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
    await updateCaption({ roomId: state.roomId, uid: state.user.uid, role, index, caption });
    closeCaptionEditor();
    showToast('Caption saved ♡');
  } catch (error) {
    alert(error.message || 'Could not save the caption.');
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

// Feature-detects the Web Share API's ability to share files (not just
// text/links) — support varies a lot by browser, so the Share button is
// only rendered when it will actually work, instead of showing a button
// that fails on desktop browsers without file-sharing support.
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

function canShareFiles() {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File(['probe'], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
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
    </div>

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
  document.querySelector('#downloadCollageBtn').addEventListener('click', () => {
    if (state.collageBlob) {
      downloadBlob(state.collageBlob, `viktor-jericka-photobooth-${state.roomId}.png`);
      setRoomCompleted(state.roomId).catch(() => undefined);
    }
  });
  document.querySelector('#shareCollageBtn')?.addEventListener('click', shareCollageFlow);
  document.querySelector('#deleteSessionBtn').addEventListener('click', deleteSessionFlow);
}

async function shareCollageFlow() {
  if (!state.collageBlob) return;

  const button = document.querySelector('#shareCollageBtn');
  const file = new File([state.collageBlob], `viktor-jericka-photobooth-${state.roomId}.png`, { type: 'image/png' });

  if (!navigator.canShare({ files: [file] })) {
    alert('File sharing is not supported in this browser. Try Download PNG.');
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
    setRoomCompleted(state.roomId).catch(() => undefined);
  } catch (error) {
    // AbortError just means the person closed the native share sheet
    // without picking anything — not an actual failure worth surfacing.
    if (error?.name !== 'AbortError') {
      alert(error.message || 'Sharing failed. Try Download PNG.');
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
    alert(error.message || 'Could not generate collage.');
  } finally {
    button.disabled = false;
    button.textContent = 'Generate collage';
  }
}

async function deleteSessionFlow() {
  const confirmed = confirm('Delete this booth room and all uploaded photos? This cannot be undone.');
  if (!confirmed) return;

  try {
    await deleteRoomSession(state.roomId);
    forgetRoom(state.roomId);
    window.history.replaceState({}, '', window.location.pathname);
    state.roomId = '';
    state.photos = [];
    state.room = null;
    stopSubscriptions();
    stopCamera();
    renderLanding();
  } catch (error) {
    alert(error.message || 'Could not delete the booth.');
  }
}

async function resetAllBoothsFlow() {
  const known = listRooms();
  if (!known.length) return alert('There are no booths on this device to delete.');

  const confirmed = confirm(
    `Delete all ${known.length} booth${known.length === 1 ? '' : 's'} from this device, including every uploaded photo? This cannot be undone.`
  );
  if (!confirmed) return;

  const button = document.querySelector('#resetAllBtn');
  if (button) {
    button.disabled = true;
    button.textContent = 'Deleting...';
  }

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
}

// Backfills the room with this browser's stored city if the room doesn't
// have one for us yet — covers rejoining an older room that was created
// before a city was ever picked.
async function syncMyLocationToRoom() {
  const mine = sanitizeLocation(state.myLocation);
  if (!mine) return;
  if (isUsableLocation(state.room?.participants?.[state.role]?.location)) return;

  try {
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