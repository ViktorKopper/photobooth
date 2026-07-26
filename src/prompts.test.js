import { describe, expect, it } from 'vitest';
import { nextPromptId, POSE_PROMPTS, promptById } from './prompts.js';

describe('the deck', () => {
  it('has enough cards that repeats are rare', () => {
    expect(POSE_PROMPTS.length).toBeGreaterThanOrEqual(20);
  });

  it('gives every card a unique id', () => {
    // The id is what travels to the other side; a duplicate would deal one
    // card and render another.
    const ids = POSE_PROMPTS.map((prompt) => prompt.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps ids within what the rules accept', () => {
    POSE_PROMPTS.forEach((prompt) => {
      expect(prompt.id.length).toBeGreaterThan(0);
      expect(prompt.id.length).toBeLessThanOrEqual(40);
    });
  });

  it('gives every card actual text', () => {
    POSE_PROMPTS.forEach((prompt) => {
      expect(prompt.text.trim().length).toBeGreaterThan(8);
    });
  });

  it('asks for something doable in a countdown', () => {
    // A card you cannot finish in ten seconds is a card you skip.
    POSE_PROMPTS.forEach((prompt) => {
      expect(prompt.text.length).toBeLessThan(70);
    });
  });
});

describe('promptById', () => {
  it('finds a card', () => {
    expect(promptById('same-face').text).toMatch(/same face/i);
  });

  it('returns null for an id it does not know', () => {
    // A room dealt by a newer version of the app, or a hand-edited document.
    expect(promptById('from-the-future')).toBeNull();
    expect(promptById(undefined)).toBeNull();
  });
});

describe('nextPromptId', () => {
  it('returns a real card', () => {
    expect(promptById(nextPromptId())).not.toBeNull();
  });

  it('never deals the card already on the table', () => {
    // Otherwise pressing shuffle sometimes appears to do nothing at all.
    POSE_PROMPTS.forEach((prompt) => {
      // Both ends of the random range, since the exclusion shifts indices.
      expect(nextPromptId(prompt.id, () => 0)).not.toBe(prompt.id);
      expect(nextPromptId(prompt.id, () => 0.999999)).not.toBe(prompt.id);
    });
  });

  it('can reach every card in the deck', () => {
    // Midpoints, not i/length: the exact boundaries round-trip badly through
    // floating point (23/26*26 is 22.999…), which would collide two draws and
    // look like a bug in the shuffle rather than in the test.
    const seen = new Set();
    for (let i = 0; i < POSE_PROMPTS.length; i += 1) {
      seen.add(nextPromptId(null, () => (i + 0.5) / POSE_PROMPTS.length));
    }
    expect(seen.size).toBe(POSE_PROMPTS.length);
  });

  it('copes with an unknown current card', () => {
    expect(promptById(nextPromptId('not-a-real-card'))).not.toBeNull();
  });
});
