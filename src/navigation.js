// Where the screens live, without the screens and the flows importing each
// other.
//
// The entry screens need to start a booth, and the session flows need to send
// you back to a screen when one ends. Imported directly that is a cycle. This
// registry gives the cycle one direction: flows call `go.landing()`, app.js —
// the composition root, and the only module that knows every part — fills in
// what those names mean at startup.
//
// Same shape as `setRenderer` in store.js, deliberately: one mechanism for
// "something else decides how this is drawn", not two.

const routes = {};

export function defineRoutes(map) {
  Object.assign(routes, map);
}

function route(name) {
  return (...args) => {
    const fn = routes[name];
    if (!fn) throw new Error(`No route registered for "${name}"`);
    return fn(...args);
  };
}

export const go = {
  landing: route('landing'),
  roleGate: route('roleGate'),
  joinByCode: route('joinByCode'),
  locationGate: route('locationGate'),
  roomShell: route('roomShell')
};
