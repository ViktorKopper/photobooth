import './styles.css';
import { ensureAnonymousAuth } from './firebase.js';
import { capturePhoto, startCamera, stopCamera } from './camera.js';
import { generateCollage } from './collage.js';
import { cssFromOps, findFilter, FILTERS } from './filters.js';
import {
  createRoom,
  deleteRoomSession,
  joinRoom,
  setReaction,
  setRoomCompleted,
  updateCaption,
  uploadPhoto,
  watchPhotos,
  watchRoom
} from './room.js';
import {
  daysTogether,
  downloadBlob,
  getRoomIdFromUrl,
  normalizeRoomCode,
  otherRole,
  roomLink,
  ROLES,
  sanitizeAnniversaryDate,
  sanitizeCaption,
  sanitizeCollageMessage,
  sleep
} from './utils.js';

const app = document.querySelector('#app');

const state = {
  user: null,
  roomId: getRoomIdFromUrl(),
  role: localStorage.getItem('photobooth-role') || '',
  room: null,
  photos: [],
  pendingCapture: null,
  editingCaption: null,
  facingMode: 'user',
  activeFilter: 'none',
  customMessage: localStorage.getItem('photobooth-message') || 'Our little photobooth memory',
  anniversaryDate: localStorage.getItem('photobooth-anniversary') || '',
  collageBlob: null,
  collagePreviewUrl: null,
  unsubscribeRoom: null,
  unsubscribePhotos: null,
  cameraStarted: false
};

function activeFilterCss() {
  return cssFromOps(findFilter(state.activeFilter).ops);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Slovak plural rules for "day": 1 = deň, 2-4 = dni, 5+ (and 0) = dní.
function formatDaysSk(count) {
  if (count === 1) return `${count} deň`;
  if (count >= 2 && count <= 4) return `${count} dni`;
  return `${count} dní`;
}

function anniversaryPreviewText() {
  const count = daysTogether(state.anniversaryDate);
  return count ? `💕 Spolu už ${formatDaysSk(count)}` : '';
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

    if (state.roomId) {
      renderRoleGate('join');
    } else {
      renderLanding();
    }
  } catch (error) {
    renderFatalError(error);
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

  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge">♡</div>
        <p class="eyebrow">private long-distance couple photobooth</p>
        <h1>Viktor & Jericka Photobooth</h1>
        <p class="hero-text">Even far apart, we can still make memories together.</p>

        <label class="field-label" for="messageInput">Collage message</label>
        <input id="messageInput" class="text-input" maxlength="80" value="${escapeAttr(state.customMessage)}" />

        <label class="field-label" for="anniversaryInput">Spolu od (nepovinné)</label>
        <input
          id="anniversaryInput"
          type="date"
          class="text-input"
          value="${escapeAttr(state.anniversaryDate)}"
          max="${todayIso()}"
        />
        <p id="anniversaryPreview" class="anniversary-line${state.anniversaryDate ? '' : ' hidden'}">${anniversaryPreviewText()}</p>

        <div class="action-row">
          <button class="primary" id="createBtn">Create new booth</button>
          <button class="secondary" id="joinBtn">Join booth</button>
        </div>
      </section>
    </main>
  `);

  document.querySelector('#messageInput').addEventListener('input', (event) => {
    state.customMessage = sanitizeCollageMessage(event.target.value);
    localStorage.setItem('photobooth-message', state.customMessage);
  });

  document.querySelector('#anniversaryInput').addEventListener('input', (event) => {
    state.anniversaryDate = sanitizeAnniversaryDate(event.target.value);
    localStorage.setItem('photobooth-anniversary', state.anniversaryDate);

    const preview = document.querySelector('#anniversaryPreview');
    preview.textContent = anniversaryPreviewText();
    preview.classList.toggle('hidden', !state.anniversaryDate);
  });

  document.querySelector('#createBtn').addEventListener('click', () => renderRoleGate('create'));
  document.querySelector('#joinBtn').addEventListener('click', () => renderJoinByCode());
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
    button.addEventListener('click', async () => {
      state.role = button.dataset.role;
      localStorage.setItem('photobooth-role', state.role);
      renderLoading(isCreate ? 'Creating your booth...' : 'Joining your booth...');

      try {
        if (isCreate) {
          state.roomId = await createRoom({
            uid: state.user.uid,
            role: state.role,
            customMessage: sanitizeCollageMessage(state.customMessage),
            anniversaryDate: sanitizeAnniversaryDate(state.anniversaryDate)
          });
          window.history.replaceState({}, '', `?room=${state.roomId}`);
        } else {
          await joinRoom({ roomId: state.roomId, uid: state.user.uid, role: state.role });
          window.history.replaceState({}, '', `?room=${state.roomId}`);
        }

        await enterRoom();
      } catch (error) {
        renderFatalError(error);
      }
    });
  });
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
            <div id="cameraError" class="camera-error hidden"></div>
          </div>

          <div id="filterRow" class="filter-row">${buildFilterRow()}</div>

          <div id="previewPanel" class="preview-panel hidden">
            <div class="polaroid-preview">
              <img id="photoPreview" alt="Captured preview" />
              <label class="visually-hidden" for="captionInput">Popisok k fotke (nepovinné)</label>
              <input
                id="captionInput"
                class="caption-input"
                style="color:${state.role === 'viktor' ? '#2a5a86' : '#9b2948'}"
                maxlength="36"
                placeholder="napíš odkaz k tejto chvíli..."
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
            <button class="secondary" id="switchCameraBtn">Switch camera</button>
          </div>
        </section>
      </section>

      <section id="collageSection" class="card collage-card hidden"></section>

      <div id="captionEditorOverlay" class="caption-editor-overlay hidden">
        <div class="caption-editor-card">
          <img id="captionEditorImg" alt="Photo" />
          <label class="visually-hidden" for="captionEditorInput">Uprav popisok k fotke</label>
          <input
            id="captionEditorInput"
            class="caption-input"
            maxlength="36"
            placeholder="napíš odkaz k tejto chvíli..."
            autocomplete="off"
          />
          <div class="action-row">
            <button class="secondary" id="captionEditorCancelBtn">Zrušiť</button>
            <button class="primary" id="captionEditorSaveBtn">Uložiť</button>
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
        ? `<button type="button" class="thumb-edit-btn" data-role="${role}" data-index="${index}" title="Upraviť popisok" aria-label="Upraviť popisok fotky ${index}">✎</button>`
        : '';

      // Anyone can react to any photo — reacting is the viewer's own
      // expression, not something the photo owner controls.
      const partnerRole = otherRole(state.role);
      const partnerReacted = Boolean(photo.reactions?.[partnerRole]);
      const myReacted = Boolean(photo.reactions?.[state.role]);

      const partnerBadge = partnerReacted
        ? `<span class="thumb-partner-heart" title="${escapeAttr(ROLES[partnerRole].name)} sa páči táto fotka">♥</span>`
        : '';
      const reactionButton = `<button
        type="button"
        class="thumb-reaction-btn${myReacted ? ' reacted' : ''}"
        data-role="${role}"
        data-index="${index}"
        title="${myReacted ? 'Zrušiť reakciu' : 'Páči sa mi táto fotka'}"
        aria-label="${myReacted ? 'Zrušiť reakciu na fotku' : 'Označiť fotku srdiečkom'} ${index}"
      >${myReacted ? '♥' : '♡'}</button>`;

      return `<div class="thumb-slot filled"><img src="${escapeAttr(photo.downloadUrl)}" alt="${escapeAttr(ROLES[role].name)} photo ${index}" loading="lazy" />${editButton}${partnerBadge}${reactionButton}</div>`;
    }
    return `<div class="thumb-slot empty">${index}</div>`;
  });

  return `<div class="thumb-row thumb-row-${role}">${slots.join('')}</div>`;
}

function updateRoomView() {
  if (!state.room) return;

  const anniversaryLine = document.querySelector('#anniversaryLine');
  if (anniversaryLine) {
    const count = daysTogether(state.room.anniversaryDate);
    anniversaryLine.textContent = count ? `💕 Spolu už ${formatDaysSk(count)}` : '';
    anniversaryLine.classList.toggle('hidden', !count);
  }

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
    if (bothComplete) {
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
    takeButton.disabled = myCount >= 3 || Boolean(state.pendingCapture) || !state.cameraStarted;
    takeButton.textContent = myCount >= 3 ? 'Your 3 photos are done' : `Take photo ${myCount + 1}/3`;
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

  countdown.textContent = '♡';
  playShutterSound();
  await sleep(260);
  countdown.classList.add('hidden');
  countdown.classList.remove('pulse');

  try {
    state.pendingCapture = await capturePhoto(video, state.facingMode, findFilter(state.activeFilter).ops);
    state.pendingCapture.caption = '';
    document.querySelector('#photoPreview').src = state.pendingCapture.previewUrl;
    const captionInput = document.querySelector('#captionInput');
    captionInput.value = '';
    document.querySelector('#previewPanel').classList.remove('hidden');
    document.querySelector('#cameraActions').classList.add('hidden');
    captionInput.focus();
  } catch (error) {
    alert(error.message);
  } finally {
    cameraActions.classList.remove('disabled');
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
  button.disabled = true;
  button.textContent = 'Uploading...';

  try {
    await uploadPhoto({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      index: myCount + 1,
      blob: state.pendingCapture.blob,
      caption: sanitizeCaption(state.pendingCapture.caption)
    });
    retakePhoto();
    showToast('Saved ♡');
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
  saveBtn.textContent = 'Ukladám...';

  try {
    await updateCaption({ roomId: state.roomId, uid: state.user.uid, role, index, caption });
    closeCaptionEditor();
    showToast('Popisok uložený ♡');
  } catch (error) {
    alert(error.message || 'Nepodarilo sa uložiť popisok.');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Uložiť';
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
        <div class="layout-control">
          <label class="field-label" for="layoutSelect">Layout</label>
          <select id="layoutSelect" class="text-input visually-hidden">
            <option value="grid">Grid — Viktor left, Jericka right</option>
            <option value="strip">Classic photobooth strip</option>
            <option value="hero">Hero — one big photo + rest</option>
          </select>
          <div class="segmented" data-controls="layoutSelect">
            <button type="button" class="segmented-option active" data-value="grid">Grid</button>
            <button type="button" class="segmented-option" data-value="strip">Strip</button>
            <button type="button" class="segmented-option" data-value="hero">Hero</button>
          </div>
        </div>
        <div class="layout-control">
          <label class="field-label" for="resolutionSelect">Quality</label>
          <select id="resolutionSelect" class="text-input visually-hidden">
            <option value="1">Standard</option>
            <option value="2">Print quality (2×)</option>
          </select>
          <div class="segmented" data-controls="resolutionSelect">
            <button type="button" class="segmented-option active" data-value="1">Standard</button>
            <button type="button" class="segmented-option" data-value="2">Print (2×)</button>
          </div>
        </div>
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
    const select = document.querySelector(`#${group.dataset.controls}`);
    group.querySelectorAll('.segmented-option').forEach((button) => {
      button.addEventListener('click', () => {
        select.value = button.dataset.value;
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
    alert('Zdieľanie súborov nie je v tomto prehliadači podporované. Skús Download PNG.');
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
      alert(error.message || 'Zdieľanie zlyhalo. Skús Download PNG.');
    }
  } finally {
    button.disabled = false;
    button.textContent = 'Share';
  }
}

async function generateCollageFlow() {
  const button = document.querySelector('#generateCollageBtn');
  const layout = document.querySelector('#layoutSelect')?.value || 'grid';
  const scale = Number(document.querySelector('#resolutionSelect')?.value) || 1;
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
      anniversaryDate: state.room?.anniversaryDate || ''
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

function stopSubscriptions() {
  if (state.unsubscribeRoom) state.unsubscribeRoom();
  if (state.unsubscribePhotos) state.unsubscribePhotos();
  state.unsubscribeRoom = null;
  state.unsubscribePhotos = null;
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