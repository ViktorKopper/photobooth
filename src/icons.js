// Hand-drawn icon set.
//
// These replace the emoji the app used to lean on. Emoji are rendered by the
// operating system, so the same glyph is a flat pictogram on one device and a
// glossy 3D blob on another — impossible to art-direct, and visibly foreign
// against a hand-drawn interface. These are plain SVG: they inherit the text
// colour, scale with font-size, and look identical everywhere.
//
// Everything is stroked rather than filled, on a 24×24 grid with round caps,
// so they read as pen drawings alongside the marker lettering.

const svg = (paths, { fill = 'none', extra = '' } = {}) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="${fill}"${extra}>${paths}</svg>`;

export const ICONS = {
  heart: svg('<path d="M12 20C7.5 16.5 4 13.6 4 9.9A4 4 0 0 1 12 8a4 4 0 0 1 8 1.9c0 3.7-3.5 6.6-8 10.1z"/>'),

  heartFilled: svg(
    '<path d="M12 20C7.5 16.5 4 13.6 4 9.9A4 4 0 0 1 12 8a4 4 0 0 1 8 1.9c0 3.7-3.5 6.6-8 10.1z" fill="currentColor" stroke="none"/>'
  ),

  // Two hearts, for the "together for N days" line.
  hearts: svg(
    '<path d="M9.5 18.5C6 15.8 3.5 13.6 3.5 10.8A3.1 3.1 0 0 1 9.5 9.4a3.1 3.1 0 0 1 6 1.4c0 2.8-2.5 5-6 7.7z"/>' +
      '<path d="M17 13.2c2.2-1.9 3.5-3.4 3.5-5.1a2.4 2.4 0 0 0-4.5-1.1" stroke-linecap="round"/>'
  ),

  pin: svg(
    '<path d="M12 21s6.5-6 6.5-10.5a6.5 6.5 0 0 0-13 0C5.5 15 12 21 12 21z"/><circle cx="12" cy="10.5" r="2.4"/>'
  ),

  sun: svg(
    '<circle cx="12" cy="12" r="4"/>' +
      '<path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4" stroke-linecap="round"/>'
  ),

  moon: svg('<path d="M20 14.5A8 8 0 0 1 9.5 4 8.2 8.2 0 1 0 20 14.5z"/>'),

  cloud: svg('<path d="M7 18h10a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.6 11 3.5 3.5 0 0 0 7 18z"/>'),

  cloudSun: svg(
    '<circle cx="8" cy="7.5" r="2.6"/>' +
      '<path d="M8 2.6v1.3M3.1 7.5h1.3M4.5 4l.9.9M11.5 4l-.9.9" stroke-linecap="round"/>' +
      '<path d="M9 19h8a3 3 0 0 0 .3-6A4.3 4.3 0 0 0 9.5 12 3.5 3.5 0 0 0 9 19z"/>'
  ),

  rain: svg(
    '<path d="M7 15h10a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.6 8 3.5 3.5 0 0 0 7 15z"/>' +
      '<path d="M9 18l-1 3M13 18l-1 3M17 18l-1 3" stroke-linecap="round"/>'
  ),

  snow: svg(
    '<path d="M7 14h10a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.6 7 3.5 3.5 0 0 0 7 14z"/>' +
      '<path d="M9 18h.01M13 20h.01M17 18h.01" stroke-linecap="round" stroke-width="2.4"/>'
  ),

  storm: svg(
    '<path d="M7 14h10a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.6 7 3.5 3.5 0 0 0 7 14z"/>' +
      '<path d="M13 16l-3 4h3l-1 3" stroke-linecap="round" stroke-linejoin="round"/>'
  ),

  fog: svg(
    '<path d="M7 13h10a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 7.6 6 3.5 3.5 0 0 0 7 13z"/>' +
      '<path d="M5 17h14M7 20h10" stroke-linecap="round"/>'
  ),

  thermometer: svg(
    '<path d="M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0z"/><path d="M12 9v6" stroke-linecap="round"/>'
  ),

  bell: svg(
    '<path d="M18 15V10a6 6 0 0 0-12 0v5l-1.5 2.5h15L18 15z"/><path d="M10 20a2 2 0 0 0 4 0" stroke-linecap="round"/>'
  ),

  bellOff: svg(
    '<path d="M18 15V10a6 6 0 0 0-9.2-5.1M6 9v6l-1.5 2.5h12"/>' +
      '<path d="M10 20a2 2 0 0 0 4 0M3.5 3.5l17 17" stroke-linecap="round"/>'
  ),

  camera: svg(
    '<path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v11H3z"/><circle cx="12" cy="13.5" r="3.5"/>'
  ),

  ghost: svg(
    '<path d="M5 20V10a7 7 0 0 1 14 0v10l-2.3-1.8L14.4 20l-2.4-1.8L9.6 20l-2.3-1.8z"/>' +
      '<path d="M9.5 10h.01M14.5 10h.01" stroke-linecap="round" stroke-width="2.4"/>'
  ),

  refresh: svg(
    '<path d="M20 12a8 8 0 1 1-2.6-5.9" stroke-linecap="round"/><path d="M20 4v4.5h-4.5" stroke-linecap="round" stroke-linejoin="round"/>'
  ),

  arrowLeft: svg('<path d="M15 5l-7 7 7 7" stroke-linecap="round" stroke-linejoin="round"/>'),

  arrowRight: svg('<path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/>'),

  pencil: svg(
    '<path d="M4 20l1-4 11-11 3 3L8 19z" stroke-linejoin="round"/><path d="M14.5 6.5l3 3" stroke-linecap="round"/>'
  ),

  /* ------------------------------------------------- the guide panel's icons */

  // The three collage shapes, drawn as miniatures of themselves so the choice
  // is legible before you generate anything.
  layoutGrid: svg('<rect x="3.5" y="4" width="7" height="5.5" rx="1"/><rect x="13.5" y="4" width="7" height="5.5" rx="1"/><rect x="3.5" y="14.5" width="7" height="5.5" rx="1"/><rect x="13.5" y="14.5" width="7" height="5.5" rx="1"/>'),

  layoutStrip: svg('<rect x="8" y="3" width="8" height="5" rx="1"/><rect x="8" y="9.5" width="8" height="5" rx="1"/><rect x="8" y="16" width="8" height="5" rx="1"/>'),

  layoutHero: svg('<rect x="4" y="3.5" width="16" height="10" rx="1.5"/><rect x="4" y="16" width="4.5" height="4.5" rx="1"/><rect x="9.8" y="16" width="4.5" height="4.5" rx="1"/><rect x="15.5" y="16" width="4.5" height="4.5" rx="1"/>'),

  palette: svg(
    '<path d="M12 21a9 9 0 1 1 9-9c0 2.2-1.8 3-3.4 3H16a2 2 0 0 0-1.4 3.4A2 2 0 0 1 12 21z"/>' +
      '<path d="M7.5 11h.01M10.5 7.5h.01M15 8h.01" stroke-linecap="round" stroke-width="2.2"/>'
  ),

  download: svg(
    '<path d="M12 4v10.5" stroke-linecap="round"/><path d="M8 11l4 4 4-4" stroke-linecap="round" stroke-linejoin="round"/><path d="M4.5 19.5h15" stroke-linecap="round"/>'
  ),

  share: svg(
    '<circle cx="18" cy="6" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18" r="2.5"/>' +
      '<path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" stroke-linecap="round"/>'
  ),

  // Two people, for the "you and them" sections.
  couple: svg(
    '<circle cx="8.5" cy="8" r="3"/><circle cx="16" cy="9" r="2.5"/>' +
      '<path d="M3.5 19.5c0-2.8 2.2-5 5-5s5 2.2 5 5" stroke-linecap="round"/>' +
      '<path d="M15 15.5c2.6 0 4.5 1.8 4.5 4" stroke-linecap="round"/>'
  ),

  timer: svg(
    '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.5 2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M9.5 3h5" stroke-linecap="round"/>'
  ),

  wand: svg(
    '<path d="M5 19.5L16 8.5" stroke-linecap="round"/><path d="M14.5 7l2.5 2.5" stroke-linecap="round"/>' +
      '<path d="M18.5 3.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" stroke-linejoin="round"/>'
  ),

  shield: svg(
    '<path d="M12 21s7-3.2 7-8.5V5.5L12 3 5 5.5V12.5C5 17.8 12 21 12 21z"/>' +
      '<path d="M9 12l2.2 2.2L15.5 10" stroke-linecap="round" stroke-linejoin="round"/>'
  ),

  book: svg(
    '<path d="M4 5.5A2 2 0 0 1 6 4h5v16H6a2 2 0 0 0-2 1.5z"/><path d="M20 5.5A2 2 0 0 0 18 4h-5v16h5a2 2 0 0 1 2 1.5z"/>'
  ),

  chevron: svg('<path d="M7 10l5 5 5-5" stroke-linecap="round" stroke-linejoin="round"/>'),

  // A marker rather than the pencil already used for captions, so the two
  // actions on a thumbnail don't read as the same one twice.
  pencilTip: svg(
    '<path d="M15.5 4.5l4 4L9 19l-5 1 1-5z" stroke-linejoin="round"/>' +
      '<path d="M13 7l4 4" stroke-linecap="round"/><path d="M4.5 15.5l4 4" stroke-linecap="round"/>'
  )
};

// Maps a WMO weather code onto one of the drawn icons above.
export function weatherIcon(code) {
  // Guarded at both ends. WMO codes stop at 99, so anything outside that
  // range is nonsense and must not fall through to whichever bucket
  // happens to sit at the edge — the same mistake that once had unknown
  // weather reporting clear skies.
  if (!Number.isFinite(code) || code < 0 || code > 99) return ICONS.thermometer;
  if (code === 0) return ICONS.sun;
  if (code <= 2) return ICONS.cloudSun;
  if (code === 3) return ICONS.cloud;
  if (code <= 48) return ICONS.fog;
  if (code <= 67) return ICONS.rain;
  if (code <= 77) return ICONS.snow;
  if (code <= 82) return ICONS.rain;
  if (code <= 86) return ICONS.snow;
  return ICONS.storm;
}
