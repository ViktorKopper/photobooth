// Escaping for the app's string-built markup.
//
// Screens are assembled as HTML strings rather than through a framework, so
// anything that originated outside the app — a city name from a geocoding
// API, a caption someone typed — has to be escaped explicitly on the way in.

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Additionally neutralises the backtick, which can terminate an attribute
// value in some older parsers even though it isn't quoted syntax.
export function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}
