import './styles.css';
import { ensureAnonymousAuth } from './firebase.js';
import { capturePhoto, startCamera, stopCamera } from './camera.js';
import { generateCollage } from './collage.js';
import {
  createRoom,
  deleteRoomSession,
  joinRoom,
  setRoomCompleted,
  uploadPhoto,
  watchPhotos,
  watchRoom
} from './room.js';
import {
  downloadBlob,
  getRoomIdFromUrl,
  normalizeRoomCode,
  otherRole,
  roomLink,
  ROLES,
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
  facingMode: 'user',
  customMessage: localStorage.getItem('photobooth-message') || 'Our little photobooth memory',
  collageBlob: null,
  collagePreviewUrl: null,
  unsubscribeRoom: null,
  unsubscribePhotos: null,
  cameraStarted: false
};

bootstrap();

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
        <div class="heart-badge">!</div>
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

  setApp(`
    <main class="shell center-shell">
      <section class="card hero-card fade-in">
        <div class="heart-badge">♡</div>
        <p class="eyebrow">private long-distance couple photobooth</p>
        <h1>Viktor & Jericka Photobooth</h1>
        <p class="hero-text">Even far apart, we can still make memories together.</p>

        <label class="field-label" for="messageInput">Collage message</label>
        <input id="messageInput" class="text-input" maxlength="80" value="${escapeAttr(state.customMessage)}" />

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
            customMessage: sanitizeCollageMessage(state.customMessage)
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
            <div id="countdown" class="countdown hidden"></div>
            <div id="cameraError" class="camera-error hidden"></div>
          </div>

          <div id="previewPanel" class="preview-panel hidden">
            <img id="photoPreview" alt="Captured preview" />
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

  document.querySelector('#takePhotoBtn').addEventListener('click', takePhotoFlow);
  document.querySelector('#retakeBtn').addEventListener('click', retakePhoto);
  document.querySelector('#confirmBtn').addEventListener('click', confirmPhoto);
}

async function startCurrentCamera() {
  const video = document.querySelector('#cameraPreview');
  const errorBox = document.querySelector('#cameraError');
  if (!video || !errorBox) return;

  try {
    errorBox.classList.add('hidden');
    await startCamera(video, state.facingMode);
    state.cameraStarted = true;
    video.classList.toggle('mirrored', state.facingMode === 'user');
  } catch (error) {
    state.cameraStarted = false;
    errorBox.textContent = error.message || 'Camera could not start.';
    errorBox.classList.remove('hidden');
  }
}

function updateRoomView() {
  if (!state.room) return;

  const viktorCount = state.room.participants?.viktor?.photoCount || 0;
  const jerickaCount = state.room.participants?.jericka?.photoCount || 0;
  const total = viktorCount + jerickaCount;

  const progressPanel = document.querySelector('#progressPanel');
  const roomMessage = document.querySelector('#roomMessage');
  if (progressPanel) {
    progressPanel.innerHTML = `
      <div class="progress-row"><span>Viktor</span><strong>${viktorCount}/3</strong></div>
      <div class="meter"><span style="width:${(viktorCount / 3) * 100}%"></span></div>
      <div class="progress-row"><span>Jericka</span><strong>${jerickaCount}/3</strong></div>
      <div class="meter"><span style="width:${(jerickaCount / 3) * 100}%"></span></div>
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
    await sleep(750);
  }

  countdown.textContent = '♡';
  await sleep(260);
  countdown.classList.add('hidden');

  try {
    state.pendingCapture = await capturePhoto(video, state.facingMode);
    document.querySelector('#photoPreview').src = state.pendingCapture.previewUrl;
    document.querySelector('#previewPanel').classList.remove('hidden');
    document.querySelector('#cameraActions').classList.add('hidden');
  } catch (error) {
    alert(error.message);
  } finally {
    cameraActions.classList.remove('disabled');
  }
}

function retakePhoto() {
  if (state.pendingCapture?.previewUrl) URL.revokeObjectURL(state.pendingCapture.previewUrl);
  state.pendingCapture = null;
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
      blob: state.pendingCapture.blob
    });
    retakePhoto();
  } catch (error) {
    alert(error.message || 'Upload failed.');
  } finally {
    button.disabled = false;
    button.textContent = 'Confirm photo';
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
      <div class="layout-control">
        <label class="field-label" for="layoutSelect">Layout</label>
        <select id="layoutSelect" class="text-input">
          <option value="columns">Viktor left, Jericka right</option>
          <option value="paired">Paired rows</option>
        </select>
      </div>
    </div>
    ${preview}
    <div class="action-row">
      <button class="primary" id="generateCollageBtn">Generate collage</button>
      <button class="secondary" id="downloadCollageBtn" ${state.collageBlob ? '' : 'disabled'}>Download PNG</button>
      <button class="danger" id="deleteSessionBtn">Delete booth</button>
    </div>
  `;

  document.querySelector('#generateCollageBtn').addEventListener('click', generateCollageFlow);
  document.querySelector('#downloadCollageBtn').addEventListener('click', () => {
    if (state.collageBlob) {
      downloadBlob(state.collageBlob, `viktor-jericka-photobooth-${state.roomId}.png`);
      setRoomCompleted(state.roomId).catch(() => undefined);
    }
  });
  document.querySelector('#deleteSessionBtn').addEventListener('click', deleteSessionFlow);
}

async function generateCollageFlow() {
  const button = document.querySelector('#generateCollageBtn');
  const layout = document.querySelector('#layoutSelect')?.value || 'columns';
  button.disabled = true;
  button.textContent = 'Generating...';

  try {
    if (state.collagePreviewUrl) URL.revokeObjectURL(state.collagePreviewUrl);

    const result = await generateCollage({
      photos: state.photos,
      customMessage: state.room?.customMessage || state.customMessage,
      layout
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
