// A nudge with no content.
//
// There was no way to say "I'm here, thinking about you" without it becoming a
// photo. This is the smallest possible message: a button on one side, a
// handful of hearts drifting up the other.
//
// Nothing is stored beyond the last one, nothing appears in the collage, and
// there is no history. That's the point — it is meant to be felt and then gone.

import { POKE_FRESH_MS } from '../config.js';
import { roomApi } from '../roomApi.js';
import { state } from '../store.js';
import { burstHearts } from '../ui/burst.js';
import { triggerShutterFeedback } from '../ui/feedback.js';
import { showError, showToast } from '../ui/toast.js';
import { otherRole, ROLES } from '../utils.js';

// The last poke this browser has already reacted to, so re-rendering the room
// — which happens on every heart, caption and photo — can't replay it.
let seenAt = null;

export function resetPokeHistory() {
  seenAt = null;
}

export async function sendPokeFlow() {
  const partnerRole = otherRole(state.role);

  if (!state.room?.participants?.[partnerRole]?.joined) {
    return showError(`${ROLES[partnerRole].name} hasn't joined this booth yet.`);
  }

  const button = document.querySelector('#pokeBtn');
  if (button) button.disabled = true;

  try {
    const { sendPoke } = await roomApi();
    await sendPoke({
      roomId: state.roomId,
      uid: state.user.uid,
      role: state.role,
      room: state.room
    });

    // Sent from the button, so the sender sees something too — otherwise
    // pressing it feels like nothing happened.
    burstHearts(button, { count: 5, size: 14 });
    showToast(`Sent ♡`);
  } catch (error) {
    showError(error.message, 'Could not send that.');
  } finally {
    if (button) button.disabled = false;
  }
}

// Called from the room snapshot. Fires once per poke, and only for pokes that
// arrived while you were here — opening a booth to a burst of hearts someone
// sent yesterday would be a lie about when they were thinking of you.
export function handlePokeChange({ now = Date.now() } = {}) {
  const poke = state.room?.poke;
  const at = poke?.at?.toMillis?.();

  if (!Number.isFinite(at)) return false;

  // First snapshot after entering: adopt whatever is there as already seen,
  // without playing it.
  if (seenAt === null) {
    seenAt = at;
    return false;
  }

  if (at <= seenAt) return false;
  seenAt = at;

  if (poke.from === state.role) return false;
  if (now - at > POKE_FRESH_MS) return false;

  const target =
    document.querySelector('#pokeBtn') || document.querySelector('.status-card') || document.body;

  burstHearts(target, { count: 14, spread: 70, size: 22, tone: 'partner' });
  triggerShutterFeedback();
  showToast(`${ROLES[poke.from]?.name || 'They'} is thinking of you ♡`);

  return true;
}
