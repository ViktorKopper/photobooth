import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expiredRoomIds,
  forgetAllRooms,
  forgetRoom,
  listRooms,
  rememberRoom,
  ROOM_MAX_AGE_MS
} from './roomHistory.js';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  forgetAllRooms();
  vi.useRealTimers();
});

// Rewrites an entry's timestamp so ageing can be tested without waiting.
function ageRoom(roomId, ms) {
  const raw = JSON.parse(localStorage.getItem('photobooth-rooms'));
  raw.forEach((entry) => {
    if (entry.roomId === roomId) entry.at = Date.now() - ms;
  });
  localStorage.setItem('photobooth-rooms', JSON.stringify(raw));
}

describe('roomHistory', () => {
  it('remembers rooms in the order they were entered', () => {
    rememberRoom('AAA');
    rememberRoom('BBB');
    expect(listRooms().map((entry) => entry.roomId)).toEqual(['AAA', 'BBB']);
  });

  it('never stores the same room twice', () => {
    rememberRoom('AAA');
    rememberRoom('AAA');
    expect(listRooms()).toHaveLength(1);
  });

  it('moves a re-entered room to the end with a fresh timestamp', () => {
    rememberRoom('AAA');
    rememberRoom('BBB');
    ageRoom('AAA', 3 * DAY);
    rememberRoom('AAA');
    expect(expiredRoomIds()).toEqual([]);
    expect(listRooms().map((entry) => entry.roomId)).toEqual(['BBB', 'AAA']);
  });

  it('expires only rooms past the two-day cutoff', () => {
    rememberRoom('FRESH');
    rememberRoom('OLD');
    ageRoom('OLD', 3 * DAY);
    expect(expiredRoomIds()).toEqual(['OLD']);
  });

  it('does not expire a room that is exactly at the cutoff', () => {
    rememberRoom('EDGE');
    ageRoom('EDGE', ROOM_MAX_AGE_MS - 1000);
    expect(expiredRoomIds()).toEqual([]);
  });

  it('can exclude the room being opened right now', () => {
    rememberRoom('OLD1');
    rememberRoom('OLD2');
    ageRoom('OLD1', 3 * DAY);
    ageRoom('OLD2', 3 * DAY);
    expect(expiredRoomIds({ exclude: 'OLD1' })).toEqual(['OLD2']);
  });

  it('forgets a single room and all of them', () => {
    rememberRoom('AAA');
    rememberRoom('BBB');
    forgetRoom('AAA');
    expect(listRooms().map((entry) => entry.roomId)).toEqual(['BBB']);
    forgetAllRooms();
    expect(listRooms()).toEqual([]);
  });

  it('ignores a blank room id', () => {
    rememberRoom('');
    rememberRoom(null);
    expect(listRooms()).toEqual([]);
  });

  it('recovers from corrupted storage instead of throwing', () => {
    localStorage.setItem('photobooth-rooms', 'not json{{');
    expect(listRooms()).toEqual([]);
    expect(expiredRoomIds()).toEqual([]);
  });

  it('discards malformed entries', () => {
    localStorage.setItem(
      'photobooth-rooms',
      JSON.stringify([{ roomId: 'OK', at: Date.now() }, { roomId: 123 }, { at: 'nope' }, null])
    );
    expect(listRooms().map((entry) => entry.roomId)).toEqual(['OK']);
  });
});
