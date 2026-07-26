// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../roomApi.js', () => ({
  roomApi: async () => ({
    dealPosePrompt: vi.fn(async () => undefined),
    clearPosePrompt: vi.fn(async () => undefined)
  })
}));

const { state } = await import('../store.js');
const { buildPoseCard, currentPrompt, renderPoseCard, resetPoseCardHistory } = await import(
  './poseCard.js'
);

const host = () => document.querySelector('#poseCard');
const card = () => document.querySelector('.pose-card');

function dealt(id, dealtBy = 'jericka') {
  state.room = { posePrompt: { id, dealtBy, dealtAt: { toMillis: () => 1 } } };
}

beforeEach(() => {
  document.body.innerHTML = '<div id="poseCard"></div>';
  state.role = 'viktor';
  state.room = {};
  resetPoseCardHistory();
});

describe('with no card dealt', () => {
  it('still draws the invitation to deal one', () => {
    // The bug this replaced: "nothing drawn yet" and "no card dealt" were both
    // null, so the change check said nothing had changed and the panel stayed
    // empty forever. Nothing errored — it simply never appeared.
    renderPoseCard();

    expect(card()).not.toBeNull();
    expect(host().textContent).toMatch(/Deal a pose/);
    expect(document.querySelector('#dealPromptBtn')).not.toBeNull();
  });

  it('says the card will be shared', () => {
    // The whole point is that you both get the same one.
    renderPoseCard();
    expect(host().textContent).toMatch(/you'll both get the same one/i);
  });

  it('offers nothing to clear when there is nothing on the table', () => {
    renderPoseCard();
    expect(document.querySelector('#clearPromptBtn')).toBeNull();
  });
});

describe('with a card dealt', () => {
  beforeEach(() => {
    dealt('same-face');
    renderPoseCard();
  });

  it('shows the text of that card', () => {
    expect(host().textContent).toMatch(/same face/i);
  });

  it('says who dealt it', () => {
    expect(host().textContent).toMatch(/Jericka dealt this/);
  });

  it('addresses you differently when you dealt it yourself', () => {
    dealt('hands', 'viktor');
    renderPoseCard();
    expect(host().textContent).toMatch(/You dealt this/);
  });

  it('offers a reshuffle and a way to clear it', () => {
    expect(document.querySelector('#dealPromptBtn')).not.toBeNull();
    expect(document.querySelector('#clearPromptBtn')).not.toBeNull();
  });
});

describe('redrawing', () => {
  it('leaves the card alone when the room changes for other reasons', () => {
    // updateRoomView runs on every heart tap and caption edit. Re-rendering
    // would replay the deal animation each time.
    dealt('same-face');
    renderPoseCard();
    const first = card();

    renderPoseCard();
    renderPoseCard();
    expect(card()).toBe(first);
  });

  it('redraws when a new card is dealt', () => {
    dealt('same-face');
    renderPoseCard();
    const first = card();

    dealt('hands');
    renderPoseCard();
    expect(card()).not.toBe(first);
    expect(host().textContent).toMatch(/hands/i);
  });

  it('returns to the invitation when the card is cleared', () => {
    dealt('same-face');
    renderPoseCard();

    state.room = { posePrompt: null };
    renderPoseCard();
    expect(host().textContent).toMatch(/Deal a pose/);
  });
});

describe('a card this version does not know', () => {
  it('falls back to the invitation rather than rendering a blank', () => {
    // A room dealt by a newer build, or a hand-edited document.
    dealt('from-the-future');
    renderPoseCard();

    expect(currentPrompt()).toBeNull();
    expect(host().textContent).toMatch(/Deal a pose/);
  });
});

describe('leaving a booth', () => {
  it('forgets what was drawn, so the next booth renders from scratch', () => {
    dealt('same-face');
    renderPoseCard();

    resetPoseCardHistory();
    document.body.innerHTML = '<div id="poseCard"></div>';
    state.room = {};
    renderPoseCard();

    expect(card()).not.toBeNull();
    expect(host().textContent).toMatch(/Deal a pose/);
  });
});

describe('buildPoseCard', () => {
  it('escapes the card text rather than trusting it', () => {
    dealt('same-face');
    expect(buildPoseCard()).not.toContain('<script');
  });

  it('marks which card is on the table, for the tests and the DOM alike', () => {
    dealt('same-face');
    expect(buildPoseCard()).toContain('data-prompt-id="same-face"');
  });
});
