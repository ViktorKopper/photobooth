import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVER_TIMESTAMP } from './test/firebase-fake.js';

vi.mock('./firebase.js', () => ({ app: {} }));
vi.mock('firebase/firestore', async () => (await import('./test/firebase-fake.js')).firestore);
vi.mock('firebase/storage', async () => (await import('./test/firebase-fake.js')).storage);

const fake = await import('./test/firebase-fake.js');
const {
  createRoom,
  joinRoom,
  updateLocation,
  uploadPhoto,
  swapPhotos,
  updateCaption,
  setReaction,
  requestSyncCountdown,
  markShooting,
  clearSyncCountdown,
  publishCollage,
  deleteRoomSession,
  watchPhotos
} = await import('./room.js');

const ROOM = 'LQLC9HXFDNTL';
const ROOM_PATH = `rooms/${ROOM}`;
const V_UID = 'uid-viktor';
const J_UID = 'uid-jericka';

const BRATISLAVA = {
  name: 'Bratislava',
  country: 'Slovakia',
  latitude: 48.14816,
  longitude: 17.10674,
  timezone: 'Europe/Bratislava'
};

const participant = (uid, extra = {}) => ({
  uid,
  joined: true,
  photoCount: 0,
  completed: false,
  lastActiveAt: null,
  location: null,
  ...extra
});

const blank = () => ({
  uid: null,
  joined: false,
  photoCount: 0,
  completed: false,
  lastActiveAt: null,
  location: null
});

// A room with both people present, ready to be written to.
function seedRoom({ viktor = participant(V_UID), jericka = participant(J_UID), ...rest } = {}) {
  fake.seed(ROOM_PATH, {
    createdAt: SERVER_TIMESTAMP,
    status: 'shooting',
    createdBy: V_UID,
    participants: { viktor, jericka },
    ...rest
  });
  return fake.read(ROOM_PATH);
}

function seedPhoto(role, index, extra = {}) {
  fake.seed(`${ROOM_PATH}/photos/${role}-${index}`, {
    owner: role,
    ownerUid: role === 'viktor' ? V_UID : J_UID,
    index,
    storagePath: `photobooth/${ROOM}/${role}/photo-${index}.jpg`,
    downloadUrl: `https://fake.storage.test/photobooth/${ROOM}/${role}/photo-${index}.jpg`,
    caption: '',
    reactions: { viktor: false, jericka: false },
    ...extra
  });
}

const lastWriteTo = (path) => [...fake.writes].reverse().find((write) => write.path === path);

beforeEach(() => fake.reset());

describe('createRoom', () => {
  it('seats the creator and leaves the other chair empty', async () => {
    const roomId = await createRoom({ uid: V_UID, role: 'viktor', customMessage: 'hi' });
    const room = fake.read(`rooms/${roomId}`);

    expect(room.participants.viktor).toMatchObject({ uid: V_UID, joined: true, photoCount: 0 });
    expect(room.participants.jericka).toEqual(blank());
  });

  it('starts in waiting, since one person alone is not a shoot', async () => {
    const roomId = await createRoom({ uid: V_UID, role: 'viktor', customMessage: '' });
    expect(fake.read(`rooms/${roomId}`).status).toBe('waiting');
  });

  it('generates a distinct 12-character code each time', async () => {
    const ids = await Promise.all(
      Array.from({ length: 25 }, () => createRoom({ uid: V_UID, role: 'viktor', customMessage: '' }))
    );
    expect(new Set(ids).size).toBe(25);
    ids.forEach((id) => expect(id).toMatch(/^[0-9A-Z]{12}$/));
  });

  it('attaches the city to the creator only', async () => {
    const roomId = await createRoom({
      uid: V_UID,
      role: 'jericka',
      customMessage: '',
      location: BRATISLAVA
    });
    const room = fake.read(`rooms/${roomId}`);

    expect(room.participants.jericka.location).toEqual(BRATISLAVA);
    expect(room.participants.viktor.location).toBeNull();
  });

  it('normalises a missing anniversary to null rather than undefined', async () => {
    // Firestore rejects undefined outright, and the rules check for null.
    const roomId = await createRoom({ uid: V_UID, role: 'viktor', customMessage: '' });
    expect(fake.read(`rooms/${roomId}`).anniversaryDate).toBeNull();
  });
});

describe('joinRoom', () => {
  it('refuses a code that belongs to no room', async () => {
    await expect(joinRoom({ roomId: 'NOPE', uid: J_UID, role: 'jericka' })).rejects.toThrow(
      /does not exist/
    );
  });

  it('refuses a role that is neither of them', async () => {
    seedRoom();
    await expect(joinRoom({ roomId: ROOM, uid: 'someone', role: 'dave' })).rejects.toThrow(
      /Viktor or Jericka/
    );
  });

  it("refuses to take a seat another browser is sitting in", async () => {
    seedRoom({ jericka: participant(J_UID) });
    await expect(joinRoom({ roomId: ROOM, uid: 'a-third-device', role: 'jericka' })).rejects.toThrow(
      /already connected/
    );
  });

  it('lets the same browser rejoin its own seat', async () => {
    seedRoom({ jericka: participant(J_UID) });
    await expect(joinRoom({ roomId: ROOM, uid: J_UID, role: 'jericka' })).resolves.toBeUndefined();
  });

  it('moves to shooting once the second person arrives', async () => {
    seedRoom({ viktor: participant(V_UID), jericka: blank() });
    await joinRoom({ roomId: ROOM, uid: J_UID, role: 'jericka' });
    expect(fake.read(ROOM_PATH).status).toBe('shooting');
  });

  it('stays waiting while nobody else has joined', async () => {
    seedRoom({ viktor: blank(), jericka: blank(), status: 'waiting' });
    await joinRoom({ roomId: ROOM, uid: V_UID, role: 'viktor' });
    expect(fake.read(ROOM_PATH).status).toBe('waiting');
  });

  it('keeps a stored city when rejoining without one', async () => {
    // Someone reopening the link on a device that has forgotten its city
    // must not wipe the city already in the room.
    seedRoom({ jericka: participant(J_UID, { location: BRATISLAVA }) });
    await joinRoom({ roomId: ROOM, uid: J_UID, role: 'jericka', location: null });
    expect(fake.read(ROOM_PATH).participants.jericka.location).toEqual(BRATISLAVA);
  });

  it('overwrites a stored city when a new one is offered', async () => {
    const berlin = { ...BRATISLAVA, name: 'Berlin', country: 'Germany' };
    seedRoom({ jericka: participant(J_UID, { location: BRATISLAVA }) });
    await joinRoom({ roomId: ROOM, uid: J_UID, role: 'jericka', location: berlin });
    expect(fake.read(ROOM_PATH).participants.jericka.location.name).toBe('Berlin');
  });

  it('writes only its own participant subtree, not the whole map', async () => {
    seedRoom({ viktor: participant(V_UID), jericka: blank() });
    await joinRoom({ roomId: ROOM, uid: J_UID, role: 'jericka' });

    const keys = Object.keys(lastWriteTo(ROOM_PATH).data);
    expect(keys.some((key) => key.startsWith('participants.viktor'))).toBe(false);
    expect(keys).toContain('participants.jericka.uid');
  });
});

describe('assertParticipant, via updateLocation', () => {
  it('costs no read when the caller already holds the room', async () => {
    const room = seedRoom();
    await updateLocation({ roomId: ROOM, uid: V_UID, role: 'viktor', location: BRATISLAVA, room });

    // The whole point of threading the live snapshot through: a heart tap or
    // a caption save should not pay for a round trip first.
    expect(fake.reads.docs).toBe(0);
  });

  it('falls back to a read when handed nothing', async () => {
    seedRoom();
    await updateLocation({ roomId: ROOM, uid: V_UID, role: 'viktor', location: BRATISLAVA });
    expect(fake.reads.docs).toBe(1);
  });

  it('rejects a browser claiming a seat it does not hold', async () => {
    const room = seedRoom();
    await expect(
      updateLocation({ roomId: ROOM, uid: 'impostor', role: 'viktor', location: null, room })
    ).rejects.toThrow(/not connected as this person/);
  });

  it('rejects an impostor even when the check has to read', async () => {
    seedRoom();
    await expect(
      updateLocation({ roomId: ROOM, uid: 'impostor', role: 'viktor', location: null })
    ).rejects.toThrow(/not connected as this person/);
  });

  it('reports a vanished room distinctly from a wrong identity', async () => {
    await expect(
      updateLocation({ roomId: ROOM, uid: V_UID, role: 'viktor', location: null })
    ).rejects.toThrow(/no longer exists/);
  });

  it('reads when the stale snapshot has no record of the role yet', async () => {
    // A snapshot taken before this person joined can't confirm them, so the
    // check must not trust it.
    seedRoom();
    await updateLocation({
      roomId: ROOM,
      uid: V_UID,
      role: 'viktor',
      location: null,
      room: { participants: { jericka: participant(J_UID) } }
    });
    expect(fake.reads.docs).toBe(1);
  });
});

describe('uploadPhoto', () => {
  const upload = (extra = {}) =>
    uploadPhoto({
      roomId: ROOM,
      uid: V_UID,
      role: 'viktor',
      index: 1,
      blob: new Blob(['x']),
      room: fake.read(ROOM_PATH),
      ...extra
    });

  it('stores the file where the Storage rules expect it', async () => {
    seedRoom();
    await upload({ index: 2 });
    expect(fake.uploads[0].path).toBe(`photobooth/${ROOM}/viktor/photo-2.jpg`);
  });

  it('tags the upload so the rules can trace it', async () => {
    seedRoom();
    await upload();
    expect(fake.uploads[0].metadata).toMatchObject({
      contentType: 'image/jpeg',
      customMetadata: { roomId: ROOM, owner: 'viktor', uploadedBy: V_UID }
    });
  });

  it('clamps a nonsense slot into range instead of writing it', async () => {
    seedRoom();
    await upload({ index: 99 });
    expect(fake.uploads[0].path).toContain('photo-3.jpg');
    expect(fake.read(`${ROOM_PATH}/photos/viktor-3`).index).toBe(3);
  });

  it('refuses a fourth photo', async () => {
    seedRoom({ viktor: participant(V_UID, { photoCount: 3, completed: true }) });
    await expect(upload()).rejects.toThrow(/already have 3/);
  });

  it('uploads nothing when it refuses', async () => {
    seedRoom({ viktor: participant(V_UID, { photoCount: 3, completed: true }) });
    await expect(upload()).rejects.toThrow();
    expect(fake.uploads).toHaveLength(0);
  });

  it('allows a retake at 3/3 — that is exactly when you want one', async () => {
    seedRoom({ viktor: participant(V_UID, { photoCount: 3, completed: true }) });
    await expect(upload({ replace: true })).resolves.toBeUndefined();
  });

  it('leaves the counter alone on a retake', async () => {
    // Redoing photo 1 while at 3/3 must not knock the count back to 1.
    seedRoom({ viktor: participant(V_UID, { photoCount: 3, completed: true }) });
    await upload({ replace: true });

    expect(fake.read(ROOM_PATH).participants.viktor.photoCount).toBe(3);
    expect(Object.keys(lastWriteTo(ROOM_PATH).data)).not.toContain(
      'participants.viktor.photoCount'
    );
  });

  it('clears hearts on a retake, since it is a different photo', async () => {
    seedRoom();
    seedPhoto('viktor', 1, { reactions: { viktor: true, jericka: true } });
    await upload({ replace: true });

    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).reactions).toEqual({
      viktor: false,
      jericka: false
    });
  });

  it('marks the shooter complete on the third', async () => {
    seedRoom({ viktor: participant(V_UID, { photoCount: 2 }) });
    await upload({ index: 3 });
    expect(fake.read(ROOM_PATH).participants.viktor.completed).toBe(true);
  });

  it('holds status at shooting while the partner is still going', async () => {
    seedRoom({ viktor: participant(V_UID, { photoCount: 2 }), jericka: participant(J_UID) });
    await upload({ index: 3 });
    expect(fake.read(ROOM_PATH).status).toBe('shooting');
  });

  it('flips to ready only once both are done', async () => {
    seedRoom({
      viktor: participant(V_UID, { photoCount: 2 }),
      jericka: participant(J_UID, { photoCount: 3, completed: true })
    });
    await upload({ index: 3 });
    expect(fake.read(ROOM_PATH).status).toBe('ready');
  });

  it('records the caption typed at capture time', async () => {
    seedRoom();
    await upload({ caption: 'miluju ta' });
    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).caption).toBe('miluju ta');
  });

  it('writes an empty string rather than undefined for no caption', async () => {
    seedRoom();
    await upload();
    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).caption).toBe('');
  });
});

describe('swapPhotos', () => {
  const swap = (indexA, indexB) =>
    swapPhotos({
      roomId: ROOM,
      uid: V_UID,
      role: 'viktor',
      indexA,
      indexB,
      room: fake.read(ROOM_PATH)
    });

  beforeEach(() => {
    seedRoom();
    seedPhoto('viktor', 1, { caption: 'first', reactions: { viktor: false, jericka: true } });
    seedPhoto('viktor', 2, { caption: 'second' });
  });

  it('does nothing when both indices are the same', async () => {
    await swap(1, 1);
    expect(fake.writes).toHaveLength(0);
  });

  it('refuses when one slot is empty', async () => {
    await expect(swap(1, 3)).rejects.toThrow(/need to exist/);
  });

  it('exchanges the files', async () => {
    await swap(1, 2);
    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).storagePath).toContain('photo-2.jpg');
    expect(fake.read(`${ROOM_PATH}/photos/viktor-2`).storagePath).toContain('photo-1.jpg');
  });

  it('carries captions along with their photos', async () => {
    await swap(1, 2);
    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).caption).toBe('second');
    expect(fake.read(`${ROOM_PATH}/photos/viktor-2`).caption).toBe('first');
  });

  it('carries hearts along too — they belong to the photo, not the slot', async () => {
    await swap(1, 2);
    expect(fake.read(`${ROOM_PATH}/photos/viktor-2`).reactions.jericka).toBe(true);
    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).reactions.jericka).toBe(false);
  });

  it('leaves each document sitting on its own index', async () => {
    // The docs keep their positions; only their contents move.
    await swap(1, 2);
    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).index).toBe(1);
    expect(fake.read(`${ROOM_PATH}/photos/viktor-2`).index).toBe(2);
  });

  it('re-uploads nothing', async () => {
    await swap(1, 2);
    expect(fake.uploads).toHaveLength(0);
  });

  it('cannot be used to rearrange the partner’s row', async () => {
    await expect(
      swapPhotos({
        roomId: ROOM,
        uid: V_UID,
        role: 'jericka',
        indexA: 1,
        indexB: 2,
        room: fake.read(ROOM_PATH)
      })
    ).rejects.toThrow(/not connected as this person/);
  });
});

describe('updateCaption', () => {
  beforeEach(() => {
    seedRoom();
    seedPhoto('viktor', 1, { caption: 'old' });
  });

  const edit = (extra = {}) =>
    updateCaption({
      roomId: ROOM,
      uid: V_UID,
      role: 'viktor',
      index: 1,
      caption: 'new',
      room: fake.read(ROOM_PATH),
      ...extra
    });

  it('touches the caption and nothing else', async () => {
    await edit();
    expect(lastWriteTo(`${ROOM_PATH}/photos/viktor-1`).data).toEqual({ caption: 'new' });
  });

  it('leaves the file reference intact', async () => {
    await edit();
    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).storagePath).toContain('photo-1.jpg');
  });

  it('turns a cleared caption into an empty string', async () => {
    await edit({ caption: null });
    expect(fake.read(`${ROOM_PATH}/photos/viktor-1`).caption).toBe('');
  });
});

describe('setReaction', () => {
  beforeEach(() => {
    seedRoom();
    seedPhoto('jericka', 2);
  });

  const react = (extra = {}) =>
    setReaction({
      roomId: ROOM,
      uid: V_UID,
      myRole: 'viktor',
      ownerRole: 'jericka',
      index: 2,
      value: true,
      room: fake.read(ROOM_PATH),
      ...extra
    });

  it("writes to the partner's photo, not the reactor's", async () => {
    await react();
    expect(lastWriteTo(`${ROOM_PATH}/photos/jericka-2`)).toBeDefined();
  });

  it('touches only the reactor’s own key', async () => {
    // The rules permit exactly this one field; anything wider is denied.
    await react();
    expect(lastWriteTo(`${ROOM_PATH}/photos/jericka-2`).data).toEqual({ 'reactions.viktor': true });
  });

  it('leaves the partner’s own reaction untouched', async () => {
    fake.seed(`${ROOM_PATH}/photos/jericka-2`, {
      ...fake.read(`${ROOM_PATH}/photos/jericka-2`),
      reactions: { viktor: false, jericka: true }
    });
    await react();
    expect(fake.read(`${ROOM_PATH}/photos/jericka-2`).reactions).toEqual({
      viktor: true,
      jericka: true
    });
  });

  it('coerces a truthy value to a real boolean', async () => {
    await react({ value: 'yes' });
    expect(fake.read(`${ROOM_PATH}/photos/jericka-2`).reactions.viktor).toBe(true);
  });

  it('un-reacts', async () => {
    await react({ value: false });
    expect(fake.read(`${ROOM_PATH}/photos/jericka-2`).reactions.viktor).toBe(false);
  });
});

describe('requestSyncCountdown', () => {
  const request = (extra = {}) =>
    requestSyncCountdown({ roomId: ROOM, uid: V_UID, role: 'viktor', room: fake.read(ROOM_PATH), ...extra });

  beforeEach(() => seedRoom());

  it('sends the length along so both devices run the same countdown', async () => {
    await request({ seconds: 10 });
    expect(fake.read(ROOM_PATH).syncCountdown).toMatchObject({ requestedBy: 'viktor', seconds: 10 });
  });

  it('anchors the countdown to a server timestamp, not a phone clock', async () => {
    await request();
    expect(fake.read(ROOM_PATH).syncCountdown.requestedAt).toBe(SERVER_TIMESTAMP);
  });

  it('clamps an absurd length into range', async () => {
    await request({ seconds: 9999 });
    expect(fake.read(ROOM_PATH).syncCountdown.seconds).toBe(30);

    await request({ seconds: 0 });
    expect(fake.read(ROOM_PATH).syncCountdown.seconds).toBe(1);
  });

  it('rounds a fractional length', async () => {
    await request({ seconds: 3.6 });
    expect(fake.read(ROOM_PATH).syncCountdown.seconds).toBe(4);
  });

  it('is cleared by handing back null', async () => {
    await request();
    await clearSyncCountdown(ROOM);
    expect(fake.read(ROOM_PATH).syncCountdown).toBeNull();
  });

  it('swallows a failed clear rather than surfacing it mid-shoot', async () => {
    await expect(clearSyncCountdown('GONE')).resolves.toBeUndefined();
  });
});

describe('markShooting', () => {
  it('stamps presence on the caller', async () => {
    const room = seedRoom();
    await markShooting({ roomId: ROOM, uid: V_UID, role: 'viktor', room });
    expect(fake.read(ROOM_PATH).participants.viktor.shootingAt).toBe(SERVER_TIMESTAMP);
  });

  it('stays silent when the identity check fails', async () => {
    // A presence stamp is decoration. It must never throw into a countdown.
    const room = seedRoom();
    await expect(
      markShooting({ roomId: ROOM, uid: 'impostor', role: 'viktor', room })
    ).resolves.toBeUndefined();
    expect(lastWriteTo(ROOM_PATH)).toBeUndefined();
  });
});

describe('publishCollage', () => {
  const publish = (extra = {}) =>
    publishCollage({
      roomId: ROOM,
      uid: V_UID,
      role: 'viktor',
      blob: new Blob(['png']),
      meta: { layout: 'grid', theme: 'notebook', format: 'square' },
      room: fake.read(ROOM_PATH),
      ...extra
    });

  beforeEach(() => seedRoom());

  it('saves outside the prefix that gets swept after two days', async () => {
    // The collage is the keepsake the app exists to produce. Storing it
    // under photobooth/ would hand it to the lifecycle rule.
    await publish();
    expect(fake.uploads[0].path).toBe(`keepsakes/${ROOM}.png`);
    expect(fake.uploads[0].path.startsWith('photobooth/')).toBe(false);
  });

  it('returns the url so the caller can keep it locally', async () => {
    await expect(publish()).resolves.toBe(`https://fake.storage.test/keepsakes/${ROOM}.png`);
  });

  it('records who saved it and how it was rendered', async () => {
    await publish();
    expect(fake.read(ROOM_PATH).collage).toMatchObject({
      savedBy: 'viktor',
      layout: 'grid',
      theme: 'notebook',
      format: 'square'
    });
  });

  it('coerces missing metadata to strings the rules will accept', async () => {
    await publish({ meta: {} });
    expect(fake.read(ROOM_PATH).collage).toMatchObject({ layout: '', theme: '', format: '' });
  });

  it('closes the booth', async () => {
    await publish();
    expect(fake.read(ROOM_PATH).status).toBe('completed');
  });
});

describe('deleteRoomSession', () => {
  beforeEach(() => {
    seedRoom({ collage: { storagePath: `keepsakes/${ROOM}.png` } });
    seedPhoto('viktor', 1);
    seedPhoto('jericka', 1);
  });

  it('removes the room and every photo in it', async () => {
    await deleteRoomSession(ROOM);
    expect(fake.paths()).toEqual([]);
  });

  it('deletes the underlying files, not just the records', async () => {
    await deleteRoomSession(ROOM);
    expect(fake.deletedObjects).toHaveLength(2);
    expect(fake.deletedObjects.every((path) => path.startsWith(`photobooth/${ROOM}/`))).toBe(true);
  });

  it('spares the saved collage', async () => {
    // Clearing a finished booth should not destroy the one thing worth
    // keeping from it.
    await deleteRoomSession(ROOM);
    expect(fake.deletedObjects).not.toContain(`keepsakes/${ROOM}.png`);
  });

  it('copes with a photo that has no file behind it', async () => {
    fake.seed(`${ROOM_PATH}/photos/viktor-2`, { owner: 'viktor', index: 2 });
    await expect(deleteRoomSession(ROOM)).resolves.toBeUndefined();
  });
});

describe('watchPhotos', () => {
  it('orders by person, then by slot', async () => {
    seedRoom();
    seedPhoto('viktor', 3);
    seedPhoto('jericka', 1);
    seedPhoto('viktor', 1);

    const seen = [];
    const stop = watchPhotos(ROOM, (photos) => seen.push(photos));

    expect(seen.at(-1).map((photo) => `${photo.owner}-${photo.index}`)).toEqual([
      'jericka-1',
      'viktor-1',
      'viktor-3'
    ]);
    stop();
  });

  it('pushes an update when a photo lands', async () => {
    seedRoom();
    const seen = [];
    const stop = watchPhotos(ROOM, (photos) => seen.push(photos));

    await uploadPhoto({
      roomId: ROOM,
      uid: V_UID,
      role: 'viktor',
      index: 1,
      blob: new Blob(['x']),
      room: fake.read(ROOM_PATH)
    });

    expect(seen.at(-1)).toHaveLength(1);
    stop();
  });

  it('stops pushing once unsubscribed', async () => {
    seedRoom();
    const seen = [];
    watchPhotos(ROOM, (photos) => seen.push(photos))();
    const countAtUnsubscribe = seen.length;

    seedPhoto('viktor', 1);
    fake.firestore.setDoc({ __path: `${ROOM_PATH}/photos/viktor-2` }, { owner: 'viktor', index: 2 });

    expect(seen).toHaveLength(countAtUnsubscribe);
  });
});
