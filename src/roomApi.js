// Lazy handle on room.js.
//
// room.js imports the Firestore and Storage SDKs statically, which together
// are the bulk of the download. Reaching it only through this dynamic import
// keeps both out of the initial page load — nobody on the landing screen has
// yet asked to talk to a database.
//
// The promise is cached, so the chunk is fetched once no matter how many
// call sites await it.

let modulePromise = null;

export function roomApi() {
  if (!modulePromise) modulePromise = import('./room.js');
  return modulePromise;
}
