// Hearts that land while you're watching.
//
// The reaction data already flowed in real time — you'd see a filled heart
// appear on a thumbnail if you happened to be looking at that corner of the
// screen. This is the missing payoff on top of it: when she hearts your photo
// and you're both in the booth, it should be impossible to miss.
//
// Entirely derived from the photo snapshots. Nothing is written, no new field,
// no schema change — it just diffs what already arrives.

import { burstHearts } from '../ui/burst.js';
import { otherRole } from '../utils.js';

// photoKey -> whether the partner had reacted, as of the last snapshot.
//
// The three-state nature of this map is load-bearing. A photo seen before and
// un-hearted is `false`; a photo never seen at all is `undefined`. Only an
// explicit false → true transition counts as a heart landing, which is what
// makes the first snapshot after entering a booth silent without needing a
// separate "have we started yet" flag — every key is undefined at that point.
//
// I had such a flag here initially. A mutation test showed removing it changed
// nothing, because this distinction was already doing the work.
let previous = new Map();

export function resetReactionHistory() {
  previous = new Map();
}

const keyOf = (photo) => `${photo.owner}-${photo.index}`;

// Called with every photos snapshot. Returns how many bursts it fired, which
// is mostly there to make the behaviour testable.
export function burstNewReactions(photos, viewerRole) {
  if (!viewerRole) return 0;

  const partnerRole = otherRole(viewerRole);
  const next = new Map();
  const landed = [];

  photos.forEach((photo) => {
    const key = keyOf(photo);
    const reacted = Boolean(photo.reactions?.[partnerRole]);
    next.set(key, reacted);

    // Only your own photos. Her hearting her own photo is not a message to
    // you, and bursting for it would cheapen the ones that are.
    if (photo.owner !== viewerRole) return;
    if (reacted && previous.get(key) === false) landed.push(photo);
  });

  previous = next;

  landed.forEach((photo) => {
    const thumb = document.querySelector(
      `.thumb-row-${photo.owner} .thumb-slot:nth-child(${photo.index})`
    );
    burstHearts(thumb, { count: 10, spread: 40, size: 16, tone: 'partner' });
  });

  return landed.length;
}
