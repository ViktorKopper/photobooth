// The pose card, dealt to both of you at once.
//
// Shuffling writes only the card's id to the room, so the other side is looking
// at the same dare rather than a different one. That shared-ness is the whole
// feature: "pull the same face" is a joke you can only be in on together.

import { nextPromptId, promptById } from '../prompts.js';
import { roomApi } from '../roomApi.js';
import { state } from '../store.js';
import { ICONS } from '../icons.js';
import { escapeHtml } from '../ui/html.js';
import { restartAnimation } from '../ui/motion.js';
import { showError } from '../ui/toast.js';
import { ROLES } from '../utils.js';

export function currentPrompt() {
  return promptById(state.room?.posePrompt?.id);
}

export function buildPoseCard() {
  const prompt = currentPrompt();

  if (!prompt) {
    return `
      <div class="pose-card pose-card-empty">
        <p class="pose-card-hint">Stuck for ideas? Deal a card — you'll both get the same one.</p>
        <div class="pose-card-actions">
          <button type="button" class="secondary small" id="dealPromptBtn">${ICONS.wand} Deal a pose</button>
        </div>
      </div>
    `;
  }

  const dealtBy = state.room.posePrompt.dealtBy;
  const byLine =
    dealtBy === state.role ? 'You dealt this' : `${ROLES[dealtBy]?.name || 'They'} dealt this`;

  return `
    <div class="pose-card" data-prompt-id="${escapeHtml(prompt.id)}">
      <p class="pose-card-label">${ICONS.wand} Both of you</p>
      <p class="pose-card-text">${escapeHtml(prompt.text)}</p>
      <div class="pose-card-actions">
        <span class="pose-card-by">${escapeHtml(byLine)}</span>
        <button type="button" class="ghost small" id="dealPromptBtn" title="Deal another">${ICONS.refresh}</button>
        <button type="button" class="ghost small" id="clearPromptBtn" title="Clear the card">✕</button>
      </div>
    </div>
  `;
}

// Re-rendered on every room update, so the card animates in only when the card
// itself actually changed — not on every heart tap and caption edit.
//
// Three states, and the distinction matters: `undefined` means nothing has been
// drawn here yet, `null` means no card is dealt. Starting this at `null` — as it
// first did — makes the empty "deal a pose" prompt indistinguishable from an
// already-drawn empty state, so it never rendered at all.
let lastRenderedId;

export function renderPoseCard() {
  const host = document.querySelector('#poseCard');
  if (!host) return;

  const id = state.room?.posePrompt?.id ?? null;
  const changed = id !== lastRenderedId;
  lastRenderedId = id;

  if (!changed) return;

  host.innerHTML = buildPoseCard();
  wirePoseCard();

  const card = host.querySelector('.pose-card');
  if (card && id) restartAnimation(card);
}

export function resetPoseCardHistory() {
  // Back to "nothing drawn yet", not "no card dealt" — so the next booth draws
  // its empty state instead of assuming one is already on screen.
  lastRenderedId = undefined;
}

function wirePoseCard() {
  document.querySelector('#dealPromptBtn')?.addEventListener('click', dealPromptFlow);
  document.querySelector('#clearPromptBtn')?.addEventListener('click', clearPromptFlow);
}

export async function dealPromptFlow() {
  const button = document.querySelector('#dealPromptBtn');
  if (button) button.disabled = true;

  try {
    const { dealPosePrompt } = await roomApi();
    await dealPosePrompt({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      // Never deals the card already on the table, so a shuffle always
      // visibly changes something.
      promptId: nextPromptId(state.room?.posePrompt?.id ?? null),
      room: state.room
    });
  } catch (error) {
    showError(error.message, 'Could not deal a card.');
  } finally {
    if (button) button.disabled = false;
  }
}

async function clearPromptFlow() {
  try {
    const { clearPosePrompt } = await roomApi();
    await clearPosePrompt(state.roomId);
  } catch {
    // Clearing is housekeeping; a failure resolves itself on the next deal.
  }
}
