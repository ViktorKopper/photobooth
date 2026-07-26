// Pose cards.
//
// A photobooth strip is a series of dares, not six portraits — the reason the
// real ones are funny is that a machine told you what to do and you only had
// four seconds to commit. Sitting alone in front of a laptop, nobody invents
// that for themselves; you take three careful smiling photos and the strip is
// dull.
//
// Both sides get dealt the same card, which is the whole point: the joke only
// works if you're both doing it.

export const POSE_PROMPTS = [
  { id: 'same-face', text: 'Pull the exact same face. No conferring.' },
  { id: 'hands', text: 'Show your hands. Whatever is in them right now.' },
  { id: 'look-away', text: 'Both look off to the left, like something happened.' },
  { id: 'blue', text: 'Hold up something blue.' },
  { id: 'hide', text: 'Hide half your face.' },
  { id: 'sleepy', text: 'Your most convincing "I just woke up".' },
  { id: 'tiny-wave', text: 'The smallest possible wave.' },
  { id: 'peace', text: 'Peace sign, but make it unconvincing.' },
  { id: 'nearest-object', text: 'Introduce the nearest object to the camera.' },
  { id: 'unimpressed', text: 'Look deeply unimpressed.' },
  { id: 'laugh', text: 'Fake a laugh until it becomes a real one.' },
  { id: 'shoulder', text: 'Look back over your shoulder.' },
  { id: 'thinking', text: 'Your most serious thinking pose.' },
  { id: 'close', text: 'Get far too close to the camera.' },
  { id: 'far', text: 'Get as far from the camera as the room allows.' },
  { id: 'chin', text: 'Chin in both hands. Full daydream.' },
  { id: 'point', text: 'Point at something off screen like it matters.' },
  { id: 'mirror', text: 'Copy whatever they did in the last photo.' },
  { id: 'heart-hands', text: 'Heart hands. Yes, really.' },
  { id: 'surprised', text: 'Act surprised by something behind the camera.' },
  { id: 'window', text: 'Show what is behind you.' },
  { id: 'favourite-mug', text: 'Bring your current drink into shot.' },
  { id: 'eyes-closed', text: 'Eyes closed, best smile.' },
  { id: 'shrug', text: 'A shrug that says absolutely nothing.' },
  { id: 'sing', text: 'Mid-word of whatever you last had stuck in your head.' },
  { id: 'cosy', text: 'Wrap yourself in the nearest soft thing.' }
];

export function promptById(id) {
  return POSE_PROMPTS.find((prompt) => prompt.id === id) || null;
}

// Picks a card, avoiding the one already on the table so a shuffle always
// visibly changes something. With 26 cards the odds of a repeat are low but
// not low enough to feel like a coincidence when it happens.
export function nextPromptId(currentId = null, random = Math.random) {
  const pool = POSE_PROMPTS.filter((prompt) => prompt.id !== currentId);
  const chosen = pool[Math.floor(random() * pool.length)];
  return (chosen || POSE_PROMPTS[0]).id;
}
