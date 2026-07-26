// An in-memory stand-in for the Firestore and Storage SDKs.
//
// room.js is the module where a mistake is most expensive: every function in
// it writes to a document whose shape the security rules validate, so a
// wrong field name or a stray key doesn't fail loudly in development — it
// fails as a permission denial on someone's phone, mid-shoot.
//
// Mocking at the SDK boundary rather than wrapping room.js in an abstraction
// means the tests exercise the real code path, including the dotted field
// paths ('participants.viktor.photoCount') that make an updateDoc a merge
// rather than a replace. Getting that distinction wrong is precisely the bug
// class worth catching, so the fake models it properly instead of treating
// the payload as an opaque blob.

export const SERVER_TIMESTAMP = Symbol('serverTimestamp');

const store = new Map();
const listeners = [];

// Every write, in order, exactly as room.js handed it over. Assertions read
// this to check payload shape — what actually reaches the rules — rather
// than only the merged end state.
export const writes = [];
export const uploads = [];
export const deletedObjects = [];
export const reads = { docs: 0, collections: 0 };

export function reset() {
  store.clear();
  listeners.length = 0;
  writes.length = 0;
  uploads.length = 0;
  deletedObjects.length = 0;
  reads.docs = 0;
  reads.collections = 0;
}

export function seed(path, data) {
  store.set(path, clone(data));
}

export function read(path) {
  return store.get(path) ?? null;
}

export function paths() {
  return [...store.keys()].sort();
}

// Structured clone would be the obvious choice but it rejects symbols, and
// SERVER_TIMESTAMP is one.
function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
  }
  return value;
}

function pathOf(reference) {
  if (typeof reference?.__path !== 'string') {
    throw new Error(`Not a document reference: ${JSON.stringify(reference)}`);
  }
  return reference.__path;
}

// 'participants.viktor.photoCount' addresses one leaf, creating the
// intermediate objects if they are missing, and leaves its siblings alone.
function setFieldPath(target, fieldPath, value) {
  const parts = fieldPath.split('.');
  let node = target;

  for (const part of parts.slice(0, -1)) {
    if (typeof node[part] !== 'object' || node[part] === null) node[part] = {};
    node = node[part];
  }

  node[parts.at(-1)] = value;
}

function snapshotFor(path) {
  const data = store.get(path);
  return {
    id: path.split('/').at(-1),
    ref: { __path: path },
    exists: () => data !== undefined,
    data: () => clone(data)
  };
}

function notify(path) {
  listeners
    .filter((listener) => listener.path === path || path.startsWith(`${listener.path}/`))
    .forEach((listener) => listener.fire());
}

/* ---------------------------------------------------------------- firestore */

export const firestore = {
  getFirestore: () => ({ __db: true }),

  doc: (_db, ...segments) => ({ __path: segments.join('/') }),

  collection: (_db, ...segments) => ({ __path: segments.join('/'), __collection: true }),

  serverTimestamp: () => SERVER_TIMESTAMP,

  getDoc: async (reference) => {
    reads.docs += 1;
    return snapshotFor(pathOf(reference));
  },

  getDocs: async (reference) => {
    reads.collections += 1;
    const prefix = `${pathOf(reference)}/`;
    const docs = [...store.keys()]
      .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
      .sort()
      .map(snapshotFor);
    return { docs, size: docs.length, empty: docs.length === 0 };
  },

  setDoc: async (reference, data) => {
    const path = pathOf(reference);
    writes.push({ op: 'set', path, data });
    store.set(path, clone(data));
    notify(path);
  },

  updateDoc: async (reference, data) => {
    const path = pathOf(reference);
    writes.push({ op: 'update', path, data });

    if (!store.has(path)) {
      // Matches the real SDK, which refuses to update a document that is
      // not there rather than creating it.
      throw new Error(`No document to update: ${path}`);
    }

    const next = clone(store.get(path));
    for (const [fieldPath, value] of Object.entries(data)) {
      setFieldPath(next, fieldPath, value);
    }
    store.set(path, next);
    notify(path);
  },

  deleteDoc: async (reference) => {
    const path = pathOf(reference);
    writes.push({ op: 'delete', path });
    store.delete(path);
    notify(path);
  },

  onSnapshot: (reference, onNext, onError) => {
    const path = pathOf(reference);
    const isCollection = Boolean(reference.__collection);

    const fire = () => {
      try {
        onNext(isCollection ? collectionSnapshot(path) : snapshotFor(path));
      } catch (error) {
        onError?.(error);
      }
    };

    const listener = { path, fire };
    listeners.push(listener);
    fire();

    return () => {
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    };
  }
};

function collectionSnapshot(path) {
  const prefix = `${path}/`;
  const docs = [...store.keys()]
    .filter((key) => key.startsWith(prefix) && !key.slice(prefix.length).includes('/'))
    .sort()
    .map(snapshotFor);
  return { docs, size: docs.length, empty: docs.length === 0 };
}

/* ------------------------------------------------------------------ storage */

export const storage = {
  getStorage: () => ({ __storage: true }),

  ref: (_storage, path) => ({ __path: path }),

  uploadBytes: async (reference, blob, metadata) => {
    uploads.push({ path: pathOf(reference), blob, metadata });
    return { ref: reference };
  },

  getDownloadURL: async (reference) => `https://fake.storage.test/${pathOf(reference)}`,

  deleteObject: async (reference) => {
    deletedObjects.push(pathOf(reference));
  }
};
