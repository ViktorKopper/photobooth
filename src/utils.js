export const ROLES = {
  viktor: {
    id: 'viktor',
    name: 'Viktor',
    possessive: "Viktor's",
    waitingFor: 'Jericka'
  },
  jericka: {
    id: 'jericka',
    name: 'Jericka',
    possessive: "Jericka's",
    waitingFor: 'Viktor'
  }
};

export function otherRole(role) {
  return role === 'viktor' ? 'jericka' : 'viktor';
}

export function generateRoomId(length = 12) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const values = new Uint32Array(length);
  crypto.getRandomValues(values);
  return [...values].map((value) => alphabet[value % alphabet.length]).join('');
}

export function roomLink(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set('room', roomId);
  return url.toString();
}

export function getRoomIdFromUrl() {
  return new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase() || '';
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatDate(date = new Date()) {
  return new Intl.DateTimeFormat('en', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);
}

export function normalizeRoomCode(value) {
  return value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

export function sanitizeCollageMessage(value) {
  return value.trim().slice(0, 80) || 'Our little photobooth memory';
}

// Unlike sanitizeCollageMessage, a caption has no fallback text — an empty
// caption is a perfectly valid state (not every photo needs a note).
export function sanitizeCaption(value) {
  return String(value ?? '').trim().slice(0, 36);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function dataUrlToBlob(dataUrl) {
  const [meta, base64] = dataUrl.split(',');
  const mime = meta.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    array[i] = binary.charCodeAt(i);
  }

  return new Blob([array], { type: mime });
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
