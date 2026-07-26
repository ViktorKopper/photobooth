// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { burstNewReactions, resetReactionHistory } from './reactionBurst.js';

// The animation itself is tested in burst.test.js; here only the diffing
// matters — which reactions count as newly landed.
vi.mock('../ui/burst.js', () => ({ burstHearts: vi.fn(), clearBursts: vi.fn() }));

const photo = (owner, index, reactions = {}) => ({
  owner,
  index,
  downloadUrl: `https://example.test/${owner}-${index}.jpg`,
  reactions: { viktor: false, jericka: false, ...reactions }
});

// The first snapshot after entering a booth only establishes a baseline, so
// most cases need one before the one under test.
const prime = (photos) => burstNewReactions(photos, 'viktor');

beforeEach(() => resetReactionHistory());

describe('the first snapshot', () => {
  it('bursts nothing, however many hearts are already there', () => {
    // Opening a booth she hearted last night must not replay all six at once.
    const already = [
      photo('viktor', 1, { jericka: true }),
      photo('viktor', 2, { jericka: true }),
      photo('viktor', 3, { jericka: true })
    ];
    expect(burstNewReactions(already, 'viktor')).toBe(0);
  });
});

describe('a heart landing', () => {
  it('bursts when the partner reacts to your photo', () => {
    prime([photo('viktor', 1)]);
    expect(burstNewReactions([photo('viktor', 1, { jericka: true })], 'viktor')).toBe(1);
  });

  it('bursts once, not on every following snapshot', () => {
    prime([photo('viktor', 1)]);
    const reacted = [photo('viktor', 1, { jericka: true })];

    expect(burstNewReactions(reacted, 'viktor')).toBe(1);
    // The room re-renders on every caption edit and heart tap elsewhere.
    expect(burstNewReactions(reacted, 'viktor')).toBe(0);
    expect(burstNewReactions(reacted, 'viktor')).toBe(0);
  });

  it('bursts again if she un-hearts and re-hearts', () => {
    prime([photo('viktor', 1)]);
    burstNewReactions([photo('viktor', 1, { jericka: true })], 'viktor');
    burstNewReactions([photo('viktor', 1)], 'viktor');

    expect(burstNewReactions([photo('viktor', 1, { jericka: true })], 'viktor')).toBe(1);
  });

  it('handles several landing at once', () => {
    prime([photo('viktor', 1), photo('viktor', 2)]);
    const both = [photo('viktor', 1, { jericka: true }), photo('viktor', 2, { jericka: true })];
    expect(burstNewReactions(both, 'viktor')).toBe(2);
  });
});

describe('what does not count', () => {
  it('ignores your own reaction to your own photo', () => {
    // You tapped it. You do not need to be told.
    prime([photo('viktor', 1)]);
    expect(burstNewReactions([photo('viktor', 1, { viktor: true })], 'viktor')).toBe(0);
  });

  it('ignores her reacting to her own photo', () => {
    // Not a message to you, and bursting for it would cheapen the ones that are.
    prime([photo('jericka', 1)]);
    expect(burstNewReactions([photo('jericka', 1, { jericka: true })], 'viktor')).toBe(0);
  });

  it('ignores a heart that was already there', () => {
    prime([photo('viktor', 1, { jericka: true })]);
    expect(burstNewReactions([photo('viktor', 1, { jericka: true })], 'viktor')).toBe(0);
  });

  it('does not burst for a photo appearing already hearted', () => {
    // A slot that had no document at all before has no false to transition
    // from, so there is nothing to celebrate.
    prime([photo('viktor', 1)]);
    const arrived = [photo('viktor', 1), photo('viktor', 2, { jericka: true })];
    expect(burstNewReactions(arrived, 'viktor')).toBe(0);
  });

  it('does nothing before a role is known', () => {
    expect(burstNewReactions([photo('viktor', 1, { jericka: true })], '')).toBe(0);
  });
});

describe('seen from the other side', () => {
  it('bursts for Jericka when Viktor hearts hers', () => {
    burstNewReactions([photo('jericka', 1)], 'jericka');
    expect(burstNewReactions([photo('jericka', 1, { viktor: true })], 'jericka')).toBe(1);
  });
});

describe('leaving a booth', () => {
  it('forgets what it had seen, so the next one starts clean', () => {
    prime([photo('viktor', 1)]);
    resetReactionHistory();

    // Now a first snapshot again — baseline, no burst.
    expect(burstNewReactions([photo('viktor', 1, { jericka: true })], 'viktor')).toBe(0);
  });
});
