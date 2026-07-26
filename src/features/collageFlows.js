// Turning six photos into one keepsake, and getting it off the device.

import { generateCollage } from '../collage.js';
import { ANNIVERSARY_DATE } from '../config.js';
import { roomApi } from '../roomApi.js';
import { requestRender, state } from '../store.js';
import { showError, showToast } from '../ui/toast.js';
import { downloadBlob, ROLES } from '../utils.js';

const collageFileName = () => `viktor-jericka-photobooth-${state.roomId}.png`;

// Feature-detects the Web Share API's ability to share *files*, not just
// text — support varies a lot by browser. The Share button is only rendered
// when it will actually work, rather than shown and then failing.
export function canShareFiles() {
  if (typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    const probe = new File(['probe'], 'probe.png', { type: 'image/png' });
    return navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

export async function generateCollageFlow() {
  const button = document.querySelector('#generateCollageBtn');
  button.disabled = true;
  button.textContent = 'Generating...';

  try {
    if (state.collagePreviewUrl) URL.revokeObjectURL(state.collagePreviewUrl);

    const result = await generateCollage({
      photos: state.photos,
      customMessage: state.room?.customMessage || state.customMessage,
      layout: state.collageLayout,
      roomId: state.roomId,
      scale: Number(state.collageScale) || 1,
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
    requestRender();
  } catch (error) {
    showError(error.message, 'Could not generate collage.');
  } finally {
    button.disabled = false;
    button.textContent = 'Generate collage';
  }
}

export async function downloadCollageFlow() {
  if (!state.collageBlob) return;
  downloadBlob(state.collageBlob, collageFileName());
  (await roomApi()).setRoomCompleted(state.roomId).catch(() => undefined);
}

export async function shareCollageFlow() {
  if (!state.collageBlob) return;

  const button = document.querySelector('#shareCollageBtn');
  const file = new File([state.collageBlob], collageFileName(), { type: 'image/png' });

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
    // AbortError just means the person closed the native share sheet without
    // picking anything — not a failure worth surfacing.
    if (error?.name !== 'AbortError') {
      showError(error.message, 'Sharing failed. Try Download PNG.');
    }
  } finally {
    button.disabled = false;
    button.textContent = 'Share';
  }
}

// Publishes the collage to the room so both partners end up with the same
// file, rather than each keeping their own locally-rendered version.
export async function publishCollageFlow() {
  if (!state.collageBlob) return;

  const button = document.querySelector('#publishCollageBtn');
  const existing = state.room?.collage?.downloadUrl;

  if (existing) {
    const savedByName = ROLES[state.room.collage.savedBy]?.name || 'Someone';
    if (!confirm(`${savedByName} already saved a collage to this booth. Replace it with yours?`)) return;
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
      },
      room: state.room
    });
    showToast('Saved to the booth ♡');
  } catch (error) {
    showError(error.message, 'Could not save the collage to the booth.');
  } finally {
    button.disabled = false;
    button.textContent = 'Save to booth';
  }
}
