import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from 'firebase/storage';
import { db, storage } from './firebase.js';
import { generateRoomId, ROLES } from './utils.js';

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
export async function updateLocation({ roomId, uid, role, location }) {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (!roomSnapshot.exists()) {
    throw new Error('Room no longer exists.');
  }

  if (roomSnapshot.data().participants?.[role]?.uid !== uid) {
    throw new Error('This browser is not connected as this person in the room.');
  }

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

export async function uploadPhoto({ roomId, uid, role, index, blob, caption = '', replace = false }) {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (!roomSnapshot.exists()) {
    throw new Error('Room no longer exists.');
  }

  const room = roomSnapshot.data();
  const participant = room.participants?.[role];

  if (participant?.uid !== uid) {
    throw new Error('This browser is not connected as this person in the room.');
  }

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
    status: bothCompletedAfterUpload(room, role, safeIndex) ? 'ready' : 'shooting'
  });
}

export async function updateCaption({ roomId, uid, role, index, caption }) {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (!roomSnapshot.exists()) {
    throw new Error('Room no longer exists.');
  }

  const participant = roomSnapshot.data().participants?.[role];

  if (participant?.uid !== uid) {
    throw new Error('This browser is not connected as this person in the room.');
  }

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
export async function setReaction({ roomId, uid, myRole, ownerRole, index, value }) {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (!roomSnapshot.exists()) {
    throw new Error('Room no longer exists.');
  }

  const participant = roomSnapshot.data().participants?.[myRole];

  if (participant?.uid !== uid) {
    throw new Error('This browser is not connected as this person in the room.');
  }

  const safeIndex = Math.max(1, Math.min(index, 3));

  await updateDoc(doc(db, 'rooms', roomId, 'photos', `${ownerRole}-${safeIndex}`), {
    [`reactions.${myRole}`]: Boolean(value)
  });
}

// Requests a synchronized "shoot together" moment. Both partners' clients
// watch the room doc and, once they observe the server-resolved
// `requestedAt` timestamp, count down to the SAME future instant
// (requestedAt + a fixed lead time) — anchoring both devices to one
// server-issued timestamp instead of trusting each phone's local clock to
// agree on "now".
export async function requestSyncCountdown({ roomId, uid, role, seconds = 3 }) {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (!roomSnapshot.exists()) {
    throw new Error('Room no longer exists.');
  }

  const participant = roomSnapshot.data().participants?.[role];

  if (participant?.uid !== uid) {
    throw new Error('This browser is not connected as this person in the room.');
  }

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
export async function publishCollage({ roomId, uid, role, blob, meta = {} }) {
  const roomRef = doc(db, 'rooms', roomId);
  const roomSnapshot = await getDoc(roomRef);

  if (!roomSnapshot.exists()) {
    throw new Error('Room no longer exists.');
  }

  if (roomSnapshot.data().participants?.[role]?.uid !== uid) {
    throw new Error('This browser is not connected as this person in the room.');
  }

  const storagePath = `photobooth/${roomId}/collage.png`;
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

  // The published collage lives outside the photos subcollection, so it
  // needs removing explicitly or it would outlive the booth in Storage.
  await deleteObject(ref(storage, `photobooth/${roomId}/collage.png`)).catch(() => undefined);

  await deleteDoc(doc(db, 'rooms', roomId));
}
