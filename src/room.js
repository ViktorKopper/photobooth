// This module is loaded dynamically by main.js, which is what keeps the
// Firestore and Storage SDKs out of the initial page download. They're
// imported statically here on purpose: everything in this file needs them,
// and the whole file only arrives once a booth is being opened.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes
} from 'firebase/storage';
import { app } from './firebase.js';
import { generateRoomId, ROLES } from './utils.js';

const db = getFirestore(app);
const storage = getStorage(app);

// Confirms the caller really is the participant they claim to be, before a
// write goes out.
//
// The screens already hold a live copy of the room — watchRoom() keeps it
// current over a realtime subscription — so in the normal case this needs
// no network at all. Re-reading the document first, as every one of these
// writes used to, meant a full round trip before each heart tap, caption
// save or reorder, purely to produce a nicer error message.
//
// It is not a security boundary either way: the Firestore rules enforce
// the same ownership independently, and they are the only check that
// actually matters. This exists to fail fast and say something useful.
async function assertParticipant({ roomId, uid, role, room }) {
  const known = room?.participants?.[role];

  if (known) {
    if (known.uid !== uid) {
      throw new Error('This browser is not connected as this person in the room.');
    }
    return room;
  }

  // No snapshot to hand — fall back to reading it.
  const snapshot = await getDoc(doc(db, 'rooms', roomId));

  if (!snapshot.exists()) {
    throw new Error('Room no longer exists.');
  }

  const data = snapshot.data();

  if (data.participants?.[role]?.uid !== uid) {
    throw new Error('This browser is not connected as this person in the room.');
  }

  return data;
}

function blankParticipant() {
  return {
    uid: null,
    joined: false,
    photoCount: 0,
    completed: false,
    lastActiveAt: null,
    location: null
  };
}

function participantFor(uid, location = null) {
  return {
    uid,
    joined: true,
    photoCount: 0,
    completed: false,
    lastActiveAt: serverTimestamp(),
    location: location || null
  };
}

export async function createRoom({ uid, role, customMessage, anniversaryDate = null, location = null }) {
  const roomId = generateRoomId();
  const participants = {
    viktor: blankParticipant(),
    jericka: blankParticipant()
  };

  participants[role] = participantFor(uid, location);

  await setDoc(doc(db, 'rooms', roomId), {
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: 'waiting',
    createdBy: uid,
    title: 'Viktor & Jericka Photobooth',
    customMessage,
    anniversaryDate: anniversaryDate || null,
    participants
  });

  return roomId;
}

export async function joinRoom({ roomId, uid, role, location = null }) {
  const roomRef = doc(db, 'rooms', roomId);
  const snapshot = await getDoc(roomRef);

  if (!snapshot.exists()) {
    throw new Error('This booth room does not exist. Check the code or create a new booth.');
  }

  const room = snapshot.data();
  const participant = room.participants?.[role];

  if (!ROLES[role]) {
    throw new Error('Choose Viktor or Jericka before joining.');
  }

  if (participant?.uid && participant.uid !== uid) {
    throw new Error(`${ROLES[role].name} is already connected in this room. Choose the other profile or create a new booth.`);
  }

  const nextStatus = room.participants?.viktor?.joined || room.participants?.jericka?.joined
    ? 'shooting'
    : 'waiting';

  await updateDoc(roomRef, {
    [`participants.${role}.uid`]: uid,
    [`participants.${role}.joined`]: true,
    [`participants.${role}.lastActiveAt`]: serverTimestamp(),
    // Only overwrite a previously stored city when this browser actually
    // has one to offer, so rejoining without re-picking never wipes it.
    [`participants.${role}.location`]: location || participant?.location || null,
    updatedAt: serverTimestamp(),
    status: nextStatus
  });
}

// Lets someone set (or change) their own city after the room already
// exists — e.g. they joined before picking one, or moved.
export async function updateLocation({ roomId, uid, role, location, room = null }) {
  const roomRef = doc(db, 'rooms', roomId);
  await assertParticipant({ roomId, uid, role, room });

  await updateDoc(roomRef, {
    [`participants.${role}.location`]: location || null,
    updatedAt: serverTimestamp()
  });
}

export function watchRoom(roomId, onChange, onError) {
  return onSnapshot(
    doc(db, 'rooms', roomId),
    (snapshot) => {
      if (!snapshot.exists()) {
        onChange(null);
        return;
      }

      onChange({ id: snapshot.id, ...snapshot.data() });
    },
    onError
  );
}

export function watchPhotos(roomId, onChange, onError) {
  return onSnapshot(
    collection(db, 'rooms', roomId, 'photos'),
    (snapshot) => {
      const photos = snapshot.docs
        .map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => {
          if (a.owner === b.owner) return a.index - b.index;
          return a.owner.localeCompare(b.owner);
        });

      onChange(photos);
    },
    onError
  );
}

export async function uploadPhoto({ roomId, uid, role, index, blob, caption = '', replace = false, room = null }) {
  const roomRef = doc(db, 'rooms', roomId);
  const current = await assertParticipant({ roomId, uid, role, room });
  const participant = current.participants?.[role];

  // A replacement targets an existing slot, so the "you're full" guard
  // doesn't apply — being at 3/3 is exactly when you'd want to redo one.
  if (!replace && participant?.photoCount >= 3) {
    throw new Error('You already have 3 confirmed photos.');
  }

  const safeIndex = Math.max(1, Math.min(index, 3));
  const storagePath = `photobooth/${roomId}/${role}/photo-${safeIndex}.jpg`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, blob, {
    contentType: 'image/jpeg',
    customMetadata: {
      roomId,
      owner: role,
      uploadedBy: uid
    }
  });

  const downloadUrl = await getDownloadURL(storageRef);

  await setDoc(doc(db, 'rooms', roomId, 'photos', `${role}-${safeIndex}`), {
    owner: role,
    ownerUid: uid,
    index: safeIndex,
    storagePath,
    downloadUrl,
    createdAt: serverTimestamp(),
    width: null,
    height: null,
    caption: caption || '',
    // A replaced photo is a different photo — any hearts the old one
    // collected shouldn't silently carry over to it.
    reactions: { viktor: false, jericka: false }
  });

  // Replacing must not touch photoCount: redoing photo 1 while sitting at
  // 3/3 would otherwise knock the counter back down to 1.
  if (replace) {
    await updateDoc(roomRef, {
      [`participants.${role}.lastActiveAt`]: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return;
  }

  await updateDoc(roomRef, {
    [`participants.${role}.photoCount`]: safeIndex,
    [`participants.${role}.completed`]: safeIndex >= 3,
    [`participants.${role}.lastActiveAt`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
    status: bothCompletedAfterUpload(current, role, safeIndex) ? 'ready' : 'shooting'
  });
}

// Swaps two of your own photos between slots.
//
// Nothing is re-uploaded: the two documents exchange their file references
// and captions while keeping their own `index`. The Storage rules only
// require a path to match `photo-[1-3].jpg` for the right room and owner —
// they don't tie a file to the slot it started in — so a photo shot into
// slot 3 is perfectly valid sitting in slot 1.
export async function swapPhotos({ roomId, uid, role, indexA, indexB, room = null }) {
  if (indexA === indexB) return;

  const roomRef = doc(db, 'rooms', roomId);
  await assertParticipant({ roomId, uid, role, room });

  const refA = doc(db, 'rooms', roomId, 'photos', `${role}-${indexA}`);
  const refB = doc(db, 'rooms', roomId, 'photos', `${role}-${indexB}`);

  const [snapA, snapB] = await Promise.all([getDoc(refA), getDoc(refB)]);

  if (!snapA.exists() || !snapB.exists()) {
    throw new Error('Both photos need to exist before they can be swapped.');
  }

  const a = snapA.data();
  const b = snapB.data();

  const moved = (from) => ({
    storagePath: from.storagePath,
    downloadUrl: from.downloadUrl,
    caption: from.caption || '',
    // Reactions belong to the photo, not the position it sits in.
    reactions: from.reactions || { viktor: false, jericka: false }
  });

  await Promise.all([updateDoc(refA, moved(b)), updateDoc(refB, moved(a))]);

  await updateDoc(roomRef, {
    [`participants.${role}.lastActiveAt`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateCaption({ roomId, uid, role, index, caption, room = null }) {
  await assertParticipant({ roomId, uid, role, room });

  const safeIndex = Math.max(1, Math.min(index, 3));

  // A caption-only update — everything else on the photo doc (owner,
  // storagePath, downloadUrl...) stays untouched. Firestore rules already
  // validate the resulting document shape, so no separate write path is
  // needed for the size/ownership checks.
  await updateDoc(doc(db, 'rooms', roomId, 'photos', `${role}-${safeIndex}`), {
    caption: caption || ''
  });
}

// Lets a participant react (or un-react) to ANY photo in the room — theirs
// or their partner's — the moment it's uploaded, without waiting for the
// final collage. `myRole` is whoever is reacting; `ownerRole`/`index`
// identify which photo. Firestore rules restrict this to only ever
// touching the caller's own key inside the `reactions` map.
export async function setReaction({ roomId, uid, myRole, ownerRole, index, value, room = null }) {
  await assertParticipant({ roomId, uid, role: myRole, room });

  const safeIndex = Math.max(1, Math.min(index, 3));

  await updateDoc(doc(db, 'rooms', roomId, 'photos', `${ownerRole}-${safeIndex}`), {
    [`reactions.${myRole}`]: Boolean(value)
  });
}

// Draws on a photo — yours or your partner's.
//
// Deliberately shaped exactly like setReaction: each person owns one key inside
// a map, and the rules restrict a write to the caller's own key. That means the
// two of you can draw on the same photo without either being able to rub out
// the other's marker, and it needed no new permission model to say so.
export async function updateDoodle({ roomId, uid, myRole, ownerRole, index, encoded, room = null }) {
  await assertParticipant({ roomId, uid, role: myRole, room });

  const safeIndex = Math.max(1, Math.min(index, 3));

  await updateDoc(doc(db, 'rooms', roomId, 'photos', `${ownerRole}-${safeIndex}`), {
    [`doodles.${myRole}`]: String(encoded || '')
  });
}

// Stickers, stored exactly like doodles: one key each, so you can both
// decorate the same photo without either being able to peel the other's off.
export async function updateStickers({ roomId, uid, myRole, ownerRole, index, encoded, room = null }) {
  await assertParticipant({ roomId, uid, role: myRole, room });

  const safeIndex = Math.max(1, Math.min(index, 3));

  await updateDoc(doc(db, 'rooms', roomId, 'photos', `${ownerRole}-${safeIndex}`), {
    [`stickers.${myRole}`]: String(encoded || '')
  });
}

// A caption written by hand rather than typed.
//
// Unlike doodles and stickers this is owner-only, because it is a caption: it
// belongs to whoever's photo it is, in the same way the typed one does. It sits
// alongside `caption` rather than replacing it, so switching back to typing
// never destroys what you wrote.
export async function updateHandwriting({ roomId, uid, role, index, encoded, room = null }) {
  await assertParticipant({ roomId, uid, role, room });

  const safeIndex = Math.max(1, Math.min(index, 3));

  await updateDoc(doc(db, 'rooms', roomId, 'photos', `${role}-${safeIndex}`), {
    handwriting: String(encoded || '')
  });
}

// Requests a synchronized "shoot together" moment. Both partners' clients
// watch the room doc and, once they observe the server-resolved
// `requestedAt` timestamp, count down to the SAME future instant
// (requestedAt + a fixed lead time) — anchoring both devices to one
// server-issued timestamp instead of trusting each phone's local clock to
// agree on "now".
export async function requestSyncCountdown({ roomId, uid, role, seconds = 3, room = null }) {
  const roomRef = doc(db, 'rooms', roomId);
  await assertParticipant({ roomId, uid, role, room });

  await updateDoc(roomRef, {
    // The length travels with the request so both devices run the exact
    // same countdown — otherwise whoever picked 10s would still be waiting
    // when the other side's shutter had already fired.
    syncCountdown: {
      requestedBy: role,
      requestedAt: serverTimestamp(),
      seconds: Math.max(1, Math.min(Math.round(seconds), 30))
    },
    updatedAt: serverTimestamp()
  });
}

// Stamps "I'm shooting right now" onto your own participant record so the
// other side can see it live. Deliberately fire-and-forget with no clearing
// step: the reader treats anything older than a few seconds as finished,
// which means a browser that closes mid-countdown can't leave the other
// person staring at a stuck indicator.
export async function markShooting({ roomId, uid, role, room = null }) {
  const roomRef = doc(db, 'rooms', roomId);

  // Fire-and-forget: a failed presence stamp must never surface as an
  // error mid-countdown, so this stays silent rather than throwing.
  try {
    await assertParticipant({ roomId, uid, role, room });
  } catch {
    return;
  }

  await updateDoc(roomRef, {
    [`participants.${role}.shootingAt`]: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

// "I still have this open."
//
// Deliberately the same field joining already stamps, rather than a new one:
// the rules validate it, older rooms carry it, and the reader treats anything
// stale as gone — so a browser closed mid-session can't leave the other person
// looking at a light that never goes out.
//
// Fire-and-forget, like markShooting. A failed heartbeat is not worth a word.
export async function touchPresence({ roomId, uid, role, room = null }) {
  try {
    await assertParticipant({ roomId, uid, role, room });
    await updateDoc(doc(db, 'rooms', roomId), {
      [`participants.${role}.lastActiveAt`]: serverTimestamp()
      // Deliberately does NOT bump `updatedAt`: a heartbeat every 40 seconds
      // is not activity in the booth, and letting it count as such would make
      // the two-day cleanup think an abandoned tab is a live room.
    });
  } catch {
    // Offline, or not a participant. Either way the indicator going quiet is
    // the correct outcome.
  }
}

// A nudge with no content. Overwritten on each send; the receiving side
// dedupes on the timestamp, so nothing has to be cleared afterwards.
export async function sendPoke({ roomId, uid, role, room = null }) {
  await assertParticipant({ roomId, uid, role, room });

  await updateDoc(doc(db, 'rooms', roomId), {
    poke: { from: role, at: serverTimestamp() },
    updatedAt: serverTimestamp()
  });
}

// Deals a pose card to the room, so both of you are looking at the same one.
// Only the id travels — the text lives in the client, which keeps the write
// tiny and means the wording can be improved later without rewriting history.
export async function dealPosePrompt({ roomId, uid, role, promptId, room = null }) {
  await assertParticipant({ roomId, uid, role, room });

  await updateDoc(doc(db, 'rooms', roomId), {
    posePrompt: { id: String(promptId), dealtBy: role, dealtAt: serverTimestamp() },
    updatedAt: serverTimestamp()
  });
}

export async function clearPosePrompt(roomId) {
  await updateDoc(doc(db, 'rooms', roomId), {
    posePrompt: null,
    updatedAt: serverTimestamp()
  }).catch(() => undefined);
}

export async function clearSyncCountdown(roomId) {
  await updateDoc(doc(db, 'rooms', roomId), {
    syncCountdown: null,
    updatedAt: serverTimestamp()
  }).catch(() => undefined);
}

function bothCompletedAfterUpload(room, role, index) {
  const viktorCompleted = role === 'viktor'
    ? index >= 3
    : Boolean(room.participants?.viktor?.completed);
  const jerickaCompleted = role === 'jericka'
    ? index >= 3
    : Boolean(room.participants?.jericka?.completed);

  return viktorCompleted && jerickaCompleted;
}

// Publishes a generated collage to the room so both partners end up with
// the same file. Without this each side renders their own copy locally,
// with their own theme and layout picks — two different keepsakes of one
// shared evening.
export async function publishCollage({ roomId, uid, role, blob, meta = {}, room = null }) {
  const roomRef = doc(db, 'rooms', roomId);
  await assertParticipant({ roomId, uid, role, room });

  // Deliberately outside the `photobooth/` prefix. Everything under that
  // prefix is swept by the Storage lifecycle rule after two days along with
  // the booth it belongs to — but a finished collage is the keepsake the
  // whole app exists to produce, and it should outlive the room.
  const storagePath = `keepsakes/${roomId}.png`;
  const storageRef = ref(storage, storagePath);

  await uploadBytes(storageRef, blob, {
    contentType: 'image/png',
    customMetadata: { roomId, uploadedBy: uid }
  });

  const downloadUrl = await getDownloadURL(storageRef);

  await updateDoc(roomRef, {
    collage: {
      storagePath,
      downloadUrl,
      savedBy: role,
      savedAt: serverTimestamp(),
      layout: String(meta.layout || ''),
      theme: String(meta.theme || ''),
      format: String(meta.format || '')
    },
    status: 'completed',
    updatedAt: serverTimestamp()
  });

  return downloadUrl;
}

export async function setRoomCompleted(roomId) {
  await updateDoc(doc(db, 'rooms', roomId), {
    status: 'completed',
    updatedAt: serverTimestamp()
  });
}

export async function deleteRoomSession(roomId) {
  const photosSnapshot = await getDocs(collection(db, 'rooms', roomId, 'photos'));

  await Promise.all(
    photosSnapshot.docs.map(async (photoDoc) => {
      const photo = photoDoc.data();
      if (photo.storagePath) {
        await deleteObject(ref(storage, photo.storagePath)).catch(() => undefined);
      }
      await deleteDoc(photoDoc.ref).catch(() => undefined);
    })
  );

  // The saved collage is deliberately left behind. It lives under
  // `keepsakes/` precisely so that clearing out a finished booth — whether
  // by hand or by the two-day sweep — doesn't destroy the one thing worth
  // keeping from it.
  await deleteDoc(doc(db, 'rooms', roomId));
}
