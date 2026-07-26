// The booth itself: the shell that gets mounted once, and the live update that
// redraws its panels every time the room or the photos change.
//
// This module is the one that draws. Everything under features/ asks for a
// redraw through the store's seam instead of calling in here, which is what
// lets this file import all of them freely.

import { COLLAGE_THEMES, EXPORT_PRESETS } from '../collage.js';
import { ANNIVERSARY_DATE, CAPTION_INK, TIMER_OPTIONS } from '../config.js';
import {
  buildFilterRow,
  cancelReplacingPhoto,
  confirmPhoto,
  renderOnionSkin,
  retakePhoto,
  selectFilter,
  startCurrentCamera,
  startReplacingPhoto,
  takePhotoFlow,
  toggleOnionSkin
} from '../features/capture.js';
import {
  canShareFiles,
  downloadCollageFlow,
  generateCollageFlow,
  publishCollageFlow,
  shareCollageFlow
} from '../features/collageFlows.js';
import { renderNotifyToggle, requestNotificationPermissionFlow } from '../features/notifications.js';
import {
  closeCaptionEditor,
  openCaptionEditor,
  saveCaptionEditor,
  wireCaptionEditor,
  swapPhotosFlow,
  toggleReactionFlow
} from '../features/photos.js';
import { openDoodleEditor, wireDoodleEditor } from '../features/doodleEditor.js';
import { buildStickerSheet } from '../features/stickerLayer.js';
import { sendPokeFlow } from '../features/poke.js';
import { renderPoseCard } from '../features/poseCard.js';
import { isHereNow, schedulePresenceExpiry } from '../features/presence.js';
import { burstNewReactions } from '../features/reactionBurst.js';
import { deleteSessionFlow, leaveBooth } from '../features/session.js';
import { isShootingNow, requestSyncFlow } from '../features/sync.js';
import { weather } from '../features/weather.js';
import { describeLocation } from '../geo.js';
import { buildGuidePanel, wireGuidePanel } from './guide.js';
import { ICONS } from '../icons.js';
import { rememberKeepsake } from '../keepsakes.js';
import { state } from '../store.js';
import { celebrateCompletion } from '../ui/feedback.js';
import { escapeAttr, escapeHtml } from '../ui/html.js';
import { countUp } from '../ui/motion.js';
import { setApp } from '../ui/shell.js';
import { showError } from '../ui/toast.js';
import {
  dayDeltaBetween,
  daysTogether,
  distanceBetween,
  formatDistanceKm,
  hourOffsetBetween,
  isUsableLocation,
  otherRole,
  roomLink,
  ROLES,
  sanitizeCaption,
  timeInZone
} from '../utils.js';
import {
  buildSegmented,
  buildSharedCollageBlock,
  buildThumbRow,
  formatDays,
  togetherLine,
  weatherChip
} from './parts.js';

export function renderRoomShell() {
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
          <div class="status-head">
            <h2>Booth status</h2>
            <span id="presenceChip" class="presence-chip hidden"></span>
          </div>
          <p>You are connected as <strong>${escapeHtml(roleName)}</strong>.</p>
          <p id="anniversaryLine" class="anniversary-line hidden"></p>
          <div id="distancePanel" class="distance-panel hidden"></div>
          <div class="status-actions">
            <button type="button" class="secondary small" id="pokeBtn" title="Send a little heart">${ICONS.heart} Thinking of you</button>
            <button type="button" class="secondary small" id="notifyToggleBtn">${ICONS.bell} Enable notifications</button>
          </div>
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
                style="color:${CAPTION_INK[state.role] ?? CAPTION_INK.viktor}"
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
          <div id="poseCard"></div>
        </section>

        ${buildGuidePanel()}
      </section>

      <section id="collageSection" class="card collage-card hidden"></section>

      <div id="doodleOverlay" class="caption-editor-overlay doodle-overlay hidden">
        <div class="caption-editor-card doodle-card">
          <p class="doodle-title">Draw on it <span id="doodleWho" class="doodle-who"></span></p>
          <div class="segmented doodle-modes" role="group" aria-label="Tool">
            <button type="button" class="segmented-option active" data-doodle-mode="draw">${ICONS.pencilTip} Marker</button>
            <button type="button" class="segmented-option" data-doodle-mode="stick">${ICONS.heartFilled} Stickers</button>
          </div>

          <div class="doodle-stage">
            <img id="doodleImg" alt="" />
            <svg id="doodleSurface" class="doodle-surface" viewBox="0 0 1000 1000" preserveAspectRatio="none">
              <path id="doodleTheirs" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              <path id="doodleMine" fill="none" stroke-linecap="round" stroke-linejoin="round" />
              <g id="stickerLayer"></g>
            </svg>
          </div>

          <div id="doodleDrawTools">
            <p id="doodleFull" class="doodle-full hidden">That's as much marker as fits on one photo.</p>
          </div>
          <div id="doodleStickTools" class="hidden">${buildStickerSheet()}</div>

          <div class="action-row doodle-actions">
            <button class="ghost small" id="doodleUndoBtn">Undo</button>
            <button class="ghost small" id="doodleClearBtn">Clear mine</button>
            <button class="secondary" id="doodleCancelBtn">Cancel</button>
            <button class="primary" id="doodleSaveBtn">Save</button>
          </div>
        </div>
      </div>

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

          <div class="segmented caption-modes" role="group" aria-label="Caption style">
            <button type="button" class="segmented-option active" data-caption-mode="type">Type</button>
            <button type="button" class="segmented-option" data-caption-mode="write">${ICONS.pencilTip} Write it</button>
          </div>

          <div id="captionWritePanel" class="hidden">
            <svg id="handwritingPad" class="handwriting-pad" viewBox="0 0 1000 200" preserveAspectRatio="none" role="img" aria-label="Write your caption here">
              <line class="handwriting-rule" x1="20" y1="150" x2="980" y2="150" />
              <path id="handwritingInk" fill="none" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div class="handwriting-actions">
              <button type="button" class="ghost small" id="handwritingUndoBtn">Undo</button>
              <button type="button" class="ghost small" id="handwritingClearBtn">Clear</button>
              <span class="handwriting-hint">Use a finger, or drag with the mouse.</span>
            </div>
          </div>

          <div class="action-row">
            <button class="secondary" id="captionEditorCancelBtn">Cancel</button>
            <button class="primary" id="captionEditorSaveBtn">Save</button>
          </div>
        </div>
      </div>
    </main>
  `);

  wireRoomShell();
  wireGuidePanel();
}

function wireRoomShell() {
  document.querySelector('#leaveBtn').addEventListener('click', leaveBooth);

  renderJoinQr();

  document.querySelector('#copyBtn').addEventListener('click', async () => {
    const button = document.querySelector('#copyBtn');
    try {
      await navigator.clipboard.writeText(roomLink(state.roomId));
      button.textContent = 'Copied';
      setTimeout(() => (button.textContent = 'Copy link instead'), 1200);
    } catch {
      showError('Could not copy the link. The room code is shown above.');
    }
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

  document.querySelector('#onionToggleBtn').addEventListener('click', toggleOnionSkin);
  document.querySelector('#takePhotoBtn').addEventListener('click', takePhotoFlow);
  document.querySelector('#retakeBtn').addEventListener('click', retakePhoto);
  document.querySelector('#confirmBtn').addEventListener('click', confirmPhoto);
  document.querySelector('#syncBtn').addEventListener('click', requestSyncFlow);
  document.querySelector('#cancelReplaceBtn').addEventListener('click', cancelReplacingPhoto);

  document.querySelector('#pokeBtn').addEventListener('click', sendPokeFlow);
  document.querySelector('#notifyToggleBtn').addEventListener('click', requestNotificationPermissionFlow);
  renderNotifyToggle(document.querySelector('#notifyToggleBtn'));

  document.querySelector('#captionInput').addEventListener('input', (event) => {
    if (!state.pendingCapture) return;
    state.pendingCapture.caption = sanitizeCaption(event.target.value);
  });

  // Delegated: #progressPanel's innerHTML is rebuilt on every room update
  // (realtime thumbnails), so a listener bound directly to the buttons would be
  // lost each time. Binding once on the stable parent survives those redraws.
  document.querySelector('#progressPanel').addEventListener('click', (event) => {
    const edit = event.target.closest('.thumb-edit-btn');
    if (edit) return openCaptionEditor(edit.dataset.role, Number(edit.dataset.index));

    const doodle = event.target.closest('.thumb-doodle-btn');
    if (doodle) return openDoodleEditor(doodle.dataset.role, Number(doodle.dataset.index));

    const retake = event.target.closest('.thumb-retake-btn');
    if (retake) return startReplacingPhoto(Number(retake.dataset.index));

    const move = event.target.closest('.thumb-move-btn');
    if (move) return swapPhotosFlow(Number(move.dataset.from), Number(move.dataset.to));

    const reaction = event.target.closest('.thumb-reaction-btn');
    if (reaction) toggleReactionFlow(reaction.dataset.role, Number(reaction.dataset.index));
  });

  wireDoodleEditor();
  wireCaptionEditor();

  document.querySelector('#captionEditorCancelBtn').addEventListener('click', closeCaptionEditor);
  document.querySelector('#captionEditorSaveBtn').addEventListener('click', saveCaptionEditor);
  document.querySelector('#captionEditorOverlay').addEventListener('click', (event) => {
    if (event.target.id === 'captionEditorOverlay') closeCaptionEditor();
  });
}

// Rendered locally rather than through any QR web service on purpose: the room
// link is the only thing standing between a stranger and your photos, so it
// must never be handed to a third-party image API to draw.
async function renderJoinQr() {
  const image = document.querySelector('#joinQr');
  if (!image) return;

  try {
    // Loaded on demand: the QR encoder is only ever needed inside a booth, so
    // it shouldn't sit in the initial download either.
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

/* ------------------------------------------------------------ live updates */

// Registered as the app's renderer in app.js, so anything anywhere can ask for
// this by calling requestRender().
export function updateRoomView() {
  if (!state.room) return;

  renderAnniversaryLine();
  rememberSharedCollage();

  weather.sync(state.room);
  renderDistancePanel();

  const viktorCount = state.room.participants?.viktor?.photoCount || 0;
  const jerickaCount = state.room.participants?.jericka?.photoCount || 0;
  const bothComplete = viktorCount >= 3 && jerickaCount >= 3;

  renderProgressPanel(viktorCount, jerickaCount);
  // After the thumbnails exist, so a burst has something to launch from.
  burstNewReactions(state.photos, state.role);
  renderPresenceChip();
  renderPoseCard();
  celebrateIfJustCompleted(bothComplete);
  renderRoomMessage(bothComplete);
  renderCameraControls();
  renderOnionSkin();
  renderCollageSection(bothComplete);
}

// Her light, on the whole time she has the booth open — not just for the two
// seconds of a countdown.
function renderPresenceChip() {
  const chip = document.querySelector('#presenceChip');
  if (!chip) return;

  const theirRole = otherRole(state.role);
  const here = isHereNow(state.room.participants?.[theirRole]?.lastActiveAt);

  chip.classList.toggle('hidden', !here);
  if (here) chip.innerHTML = `<span class="presence-dot"></span>${escapeHtml(ROLES[theirRole].name)} is here`;

  // The stamp ages on a clock rather than on a write, so nothing else would
  // ever turn this off.
  schedulePresenceExpiry(here);
}

function renderAnniversaryLine() {
  const line = document.querySelector('#anniversaryLine');
  if (!line) return;

  // Falls back to the constant so rooms created before the date was fixed
  // still show the count.
  const date = state.room.anniversaryDate || ANNIVERSARY_DATE;
  const days = daysTogether(date);
  line.classList.toggle('hidden', !days);

  if (days && !state.dayCountIntroDone) {
    state.dayCountIntroDone = true;
    countUp(line, days, {
      format: (value) => `${ICONS.hearts} Together for ${formatDays(value)}`
    });
  } else {
    line.innerHTML = togetherLine(date);
  }
}

// Recorded by whoever is looking, not just by whoever pressed save — so both
// of you end up holding the memory rather than only one.
function rememberSharedCollage() {
  if (!state.room.collage?.downloadUrl) return;
  rememberKeepsake({
    roomId: state.roomId,
    url: state.room.collage.downloadUrl,
    theme: state.room.collage.theme || '',
    layout: state.room.collage.layout || ''
  });
}

function renderProgressPanel(viktorCount, jerickaCount) {
  const panel = document.querySelector('#progressPanel');
  if (!panel) return;

  const row = (role, count) => `
    <div class="progress-row"><span>${ROLES[role].name}</span><strong>${count}/3</strong></div>
    <div class="meter meter-${role}"><span style="width:${(count / 3) * 100}%"></span></div>
    ${buildThumbRow({
      role,
      viewerRole: state.role,
      photos: state.photos,
      replacingIndex: state.replacingIndex
    })}
  `;

  panel.innerHTML = `
    ${row('viktor', viktorCount)}
    ${row('jericka', jerickaCount)}
    <div class="total-progress">Total memory progress: <strong>${viktorCount + jerickaCount}/6</strong></div>
  `;
}

// Only celebrate the actual moment it happens. Starting at null means
// re-opening an already-finished booth stays quiet — the party is for crossing
// the line, not for walking back past it.
function celebrateIfJustCompleted(bothComplete) {
  const wasComplete = state.bothCompleteSeen;
  state.bothCompleteSeen = bothComplete;
  if (bothComplete && wasComplete === false) celebrateCompletion();
}

function renderRoomMessage(bothComplete) {
  const roomMessage = document.querySelector('#roomMessage');
  const theirRole = otherRole(state.role);
  const myCount = state.room.participants?.[state.role]?.photoCount || 0;
  const theirCount = state.room.participants?.[theirRole]?.photoCount || 0;
  const partnerShooting = isShootingNow(state.room.participants?.[theirRole]?.shootingAt);

  roomMessage?.classList.toggle('is-live', partnerShooting);

  // The stamp expires on a clock, not on a write, so nothing would bring the
  // view back once it goes stale. One scheduled re-check clears it.
  window.clearTimeout(state.shootingTimer);
  if (partnerShooting) state.shootingTimer = window.setTimeout(updateRoomView, 2000);

  if (!roomMessage) return;

  if (partnerShooting) {
    roomMessage.textContent = `${ROLES[theirRole].name} is taking a photo right now...`;
  } else if (state.replacingIndex) {
    roomMessage.textContent = `Retaking photo ${state.replacingIndex}. Take a new one, or cancel below.`;
  } else if (bothComplete) {
    roomMessage.textContent = 'Both of you are done. You can generate your collage now.';
  } else if (myCount >= 3) {
    roomMessage.textContent = `That's your three. ${ROLES[state.role].waitingFor} will fill hers in when she's there.`;
  } else if (theirCount >= 3) {
    roomMessage.textContent = `${ROLES[state.role].waitingFor} has left you three. Your turn.`;
  } else {
    roomMessage.textContent = 'Three photos each. They appear on her screen as you take them.';
  }
}

function renderCameraControls() {
  const myCount = state.room.participants?.[state.role]?.photoCount || 0;
  const replacing = Boolean(state.replacingIndex);
  const busy = Boolean(state.pendingCapture) || !state.cameraStarted;

  const takeButton = document.querySelector('#takePhotoBtn');
  if (takeButton) {
    takeButton.disabled = (!replacing && myCount >= 3) || busy;
    takeButton.textContent = replacing
      ? `Retake photo ${state.replacingIndex}`
      : myCount >= 3
        ? 'Your 3 photos are done'
        : `Take photo ${myCount + 1}/3`;
  }

  document.querySelector('#cancelReplaceBtn')?.classList.toggle('hidden', !replacing);

  const syncButton = document.querySelector('#syncBtn');
  if (syncButton) {
    const partnerJoined = Boolean(state.room.participants?.[otherRole(state.role)]?.joined);
    syncButton.disabled = myCount >= 3 || busy || !partnerJoined;
  }
}

/* ----------------------------------------------------------- distance panel */

// Draws the two cities as endpoints of a curved arc — the visual shorthand for
// a long-haul flight path — with each side's live local time and a sun/moon
// marker, and the distance riding on the curve itself.
export function renderDistancePanel() {
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

  // Only one side has picked a city so far — show what we have plus a gentle
  // nudge, rather than an empty or broken-looking arc.
  if (!isUsableLocation(mine) || !isUsableLocation(theirs)) {
    panel.innerHTML = singleCityMarkup({ mine, theirs, myRole, theirRole });
    return;
  }

  const km = distanceBetween(mine, theirs);
  const myClock = timeInZone(mine.timezone);
  const theirClock = timeInZone(theirs.timezone);
  const offset = hourOffsetBetween(mine.timezone, theirs.timezone);
  const dayDelta = dayDeltaBetween(myClock, theirClock);

  const offsetLabel =
    offset === 0 ? 'in the same time zone' : `${Math.abs(offset)}h ${offset > 0 ? 'ahead' : 'behind'}`;

  // The detail that makes long distance feel real: not just a different hour,
  // but a different day altogether.
  const dayNote =
    dayDelta === 1
      ? ` — already ${theirClock.weekday} there`
      : dayDelta === -1
        ? ` — still ${theirClock.weekday} there`
        : '';

  const side = (role, clock) => `
    <div class="distance-side">
      <span class="distance-dot distance-dot-${role}">${clock?.isNight ? ICONS.moon : ICONS.sun}</span>
      <strong class="distance-time">${clock ? escapeHtml(clock.label) : '--:--'}</strong>
      ${weatherChip(weather.get(role))}
      <span class="distance-city">${escapeHtml(describeLocation(role === myRole ? mine : theirs))}</span>
      <span class="distance-who">${escapeHtml(ROLES[role].name)}</span>
    </div>
  `;

  // The flight path draws itself in, and the distance counts up — but only the
  // first time the pair of cities appears. This panel is rewritten on a timer.
  const isIntro = !state.distanceIntroDone;
  state.distanceIntroDone = true;

  panel.innerHTML = `
    <div class="distance-visual">
      ${side(myRole, myClock)}
      <div class="distance-arc">
        <svg viewBox="0 0 120 48" aria-hidden="true" class="${isIntro ? 'arc-draw' : ''}">
          <path d="M6 40 Q60 -6 114 40" fill="none" stroke="rgba(199,52,90,0.45)" stroke-width="2" stroke-dasharray="5 4" />
          <circle cx="6" cy="40" r="4" fill="var(--viktor)" />
          <circle cx="114" cy="40" r="4" fill="var(--jericka)" />
          <text x="60" y="20" text-anchor="middle" font-size="13" fill="#c7345a">♥</text>
        </svg>
        <span class="distance-km">${escapeHtml(formatDistanceKm(km))}</span>
      </div>
      ${side(theirRole, theirClock)}
    </div>
    <p class="distance-hint">${escapeHtml(`${ROLES[theirRole].name} is ${offsetLabel}${dayNote}`)}</p>
  `;

  if (isIntro && km != null) {
    countUp(panel.querySelector('.distance-km'), Math.round(km), {
      format: (value) => formatDistanceKm(value)
    });
  }
}

function singleCityMarkup({ mine, theirs, myRole, theirRole }) {
  const iHaveOne = isUsableLocation(mine);
  const known = iHaveOne ? mine : theirs;
  const knownRole = iHaveOne ? myRole : theirRole;
  const clock = timeInZone(known.timezone);

  return `
    <div class="distance-single">
      <span class="distance-city">${ICONS.pin} ${escapeHtml(describeLocation(known))}</span>
      ${clock ? `<span class="distance-clock">${clock.isNight ? ICONS.moon : ICONS.sun} ${escapeHtml(clock.label)}</span>` : ''}
      ${weatherChip(weather.get(knownRole))}
    </div>
    <p class="distance-hint">${escapeHtml(
      iHaveOne
        ? `Waiting for ${ROLES[theirRole].name} to add their city.`
        : 'Add your own city to see the distance between you.'
    )}</p>
  `;
}

/* ----------------------------------------------------------- collage section */

function renderCollageSection(canGenerate) {
  const section = document.querySelector('#collageSection');
  if (!section) return;

  if (!canGenerate) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');

  const preview = state.collagePreviewUrl
    ? `<img class="collage-preview" src="${escapeAttr(state.collagePreviewUrl)}" alt="Generated collage preview" />`
    : '';
  const needsBlob = state.collageBlob ? '' : 'disabled';

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
        ], state.collageLayout)}
        ${buildSegmented('Quality', 'collageScale', [
          { value: '1', label: 'Standard' },
          { value: '2', label: 'Print (2×)' }
        ], state.collageScale)}
        ${buildSegmented('Theme', 'collageTheme', COLLAGE_THEMES.map((theme) => ({ value: theme.id, label: theme.label })), state.collageTheme)}
        ${buildSegmented('Format', 'collageExport', EXPORT_PRESETS.map((preset) => ({ value: preset.id, label: preset.label })), state.collageExport)}
      </div>
    </div>
    ${preview}
    <div class="action-row">
      <button class="primary" id="generateCollageBtn">Generate collage</button>
      <button class="secondary" id="downloadCollageBtn" ${needsBlob}>Download PNG</button>
      <button class="secondary" id="shareCollageBtn" ${needsBlob} ${canShareFiles() ? '' : 'hidden'}>Share</button>
      <button class="secondary" id="publishCollageBtn" ${needsBlob}>Save to booth</button>
    </div>

    ${buildSharedCollageBlock(state.room?.collage, state.role)}

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
        // Kept in state, not just in the DOM: this section is fully re-rendered
        // after every generation, so a DOM-only selection would silently snap
        // back to the default each time.
        state[stateKey] = button.dataset.value;
        group.querySelectorAll('.segmented-option').forEach((option) => {
          option.classList.toggle('active', option === button);
        });
      });
    });
  });

  document.querySelector('#generateCollageBtn').addEventListener('click', generateCollageFlow);
  document.querySelector('#downloadCollageBtn').addEventListener('click', downloadCollageFlow);
  document.querySelector('#shareCollageBtn')?.addEventListener('click', shareCollageFlow);
  document.querySelector('#publishCollageBtn')?.addEventListener('click', publishCollageFlow);
  document.querySelector('#deleteSessionBtn').addEventListener('click', deleteSessionFlow);
}
