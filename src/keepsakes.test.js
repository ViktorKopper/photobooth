import { beforeEach, describe, expect, it } from 'vitest';
import { forgetAllKeepsakes, forgetKeepsake, listKeepsakes, rememberKeepsake } from './keepsakes.js';

const entry = (roomId, savedAt) => ({
  roomId,
  url: `https://example.test/${roomId}.png`,
  savedAt
});

beforeEach(() => {
  forgetAllKeepsakes();
});

describe('keepsakes', () => {
  it('lists newest first', () => {
    rememberKeepsake(entry('AAA', 1));
    rememberKeepsake(entry('BBB', 2));
    expect(listKeepsakes().map((k) => k.roomId)).toEqual(['BBB', 'AAA']);
  });

  it('keeps one entry per booth, replacing an earlier save', () => {
    rememberKeepsake({ ...entry('AAA', 1), theme: 'rose' });
    rememberKeepsake({ ...entry('AAA', 2), theme: 'notebook' });

    const all = listKeepsakes();
    expect(all).toHaveLength(1);
    expect(all[0].theme).toBe('notebook');
  });

  it('ignores entries with nothing to point at', () => {
    rememberKeepsake({ roomId: 'AAA' });
    rememberKeepsake({ url: 'https://example.test/x.png' });
    rememberKeepsake({});
    expect(listKeepsakes()).toEqual([]);
  });

  it('forgets one and all', () => {
    rememberKeepsake(entry('AAA', 1));
    rememberKeepsake(entry('BBB', 2));
    forgetKeepsake('AAA');
    expect(listKeepsakes().map((k) => k.roomId)).toEqual(['BBB']);
    forgetAllKeepsakes();
    expect(listKeepsakes()).toEqual([]);
  });

  it('caps how many it holds so storage cannot grow forever', () => {
    for (let i = 0; i < 80; i += 1) rememberKeepsake(entry(`R${i}`, i));
    const all = listKeepsakes();
    expect(all).toHaveLength(60);
    // The oldest are the ones dropped.
    expect(all[0].roomId).toBe('R79');
    expect(all.at(-1).roomId).toBe('R20');
  });

  it('recovers from corrupted storage', () => {
    localStorage.setItem('photobooth-keepsakes', 'not json{{');
    expect(listKeepsakes()).toEqual([]);
  });

  it('discards malformed entries', () => {
    localStorage.setItem(
      'photobooth-keepsakes',
      JSON.stringify([entry('OK', 1), { roomId: 5 }, null, { url: 7 }])
    );
    expect(listKeepsakes().map((k) => k.roomId)).toEqual(['OK']);
  });
});
