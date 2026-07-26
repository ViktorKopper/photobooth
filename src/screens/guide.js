// The reference panel beside the camera.
//
// Everything in the booth was discoverable only by pressing it and seeing what
// happened — fine for the two of us on the day we built it, useless a month
// later when nobody remembers what "Hero" does or which theme drains the
// colour out of the photos.
//
// Built as an accordion rather than a wall of text: the first section is open,
// so it reads as help rather than decoration, and the rest stay one click away.
// Content is generated from the same COLLAGE_THEMES and FILTERS arrays the
// controls use, so adding a theme can't leave the guide describing four.

import { COLLAGE_THEMES, EXPORT_PRESETS } from '../collage.js';
import { TIMER_OPTIONS } from '../config.js';
import { FILTERS } from '../filters.js';
import { ICONS } from '../icons.js';
import { escapeHtml } from '../ui/html.js';

// Written out here rather than stored on the theme itself: the palette objects
// are drawing instructions, and a sentence about how a theme feels has no
// business living next to a hex code.
const THEME_NOTES = {
  rose: 'Soft pinks and cream. The default, and the one that matches this app.',
  midnight: 'Deep navy with pale ink. Best for evening photos.',
  autumn: 'Warm sand and burnt orange, like an old album page.',
  notebook: 'Ruled paper and a marker-pen title, instead of heart confetti.',
  mono: 'Black and white — and the only theme that drains the colour from the photos too, so the whole thing reads as a choice rather than a mistake.'
};

const LAYOUT_NOTES = [
  {
    id: 'grid',
    icon: ICONS.layoutGrid,
    label: 'Grid',
    note: 'Two columns, three rows. Your photos on one side, hers on the other — the pairs sit level with each other.'
  },
  {
    id: 'strip',
    icon: ICONS.layoutStrip,
    label: 'Strip',
    note: 'Tall and narrow, like a real photobooth strip. Three rounds, each with one of yours above one of hers.'
  },
  {
    id: 'hero',
    icon: ICONS.layoutHero,
    label: 'Hero',
    note: 'One photo large, the other five in a row underneath. Good when a single shot is clearly the best one.'
  }
];

// Listed from the real array for the same reason as the themes. The note is
// the part worth saying out loud: the filter is baked into the uploaded file,
// not layered over the preview, so it cannot be undone later.
const filterNote = () =>
  `${FILTERS.map((filter) => escapeHtml(filter.label)).join(' · ')} — baked into the saved photo, not just the preview, so it can't be changed afterwards.`;

function section(id, icon, title, body, { open = false } = {}) {
  return `
    <section class="guide-section${open ? ' open' : ''}" data-guide-section="${id}">
      <button type="button" class="guide-toggle" aria-expanded="${open}" aria-controls="guide-body-${id}">
        <span class="guide-toggle-icon">${icon}</span>
        <span class="guide-toggle-title">${escapeHtml(title)}</span>
        <span class="guide-chevron">${ICONS.chevron}</span>
      </button>
      <div class="guide-body" id="guide-body-${id}" ${open ? '' : 'hidden'}>${body}</div>
    </section>
  `;
}

// A labelled row. `term` is plain text; `note` may carry an icon, so it is
// escaped by its caller rather than here.
function row(term, note) {
  return `
    <div class="guide-row">
      <dt>${escapeHtml(term)}</dt>
      <dd>${note}</dd>
    </div>
  `;
}

function steps() {
  const items = [
    `Send the QR code or the link to ${escapeHtml('Jericka')}. Only someone with it can open this booth.`,
    'Take three photos each. You both see them appear in real time, however far apart you are.',
    'Once all six are in, the collage panel opens underneath.',
    'Generate it, then download it or save it to the booth so you both keep the same copy.'
  ];

  return `<ol class="guide-steps">${items.map((text) => `<li>${text}</li>`).join('')}</ol>`;
}

function shooting() {
  return `
    <dl class="guide-rows">
      ${row('Take photo', `Counts down, then captures. ${TIMER_OPTIONS.join('s or ')}s — pick before you press.`)}
      ${row(
        'Shoot together',
        'Counts you both down to the same instant, anchored to the server rather than to either phone\'s clock, so the two shutters fire together.'
      )}
      ${row(`${ICONS.wand} Filters`, filterNote())}
      ${row(
        `${ICONS.ghost} Ghost`,
        'Fades your previous photo over the live camera, so you can line the next one up against it.'
      )}
      ${row(
        `${ICONS.refresh} Retake`,
        'On any photo you have already confirmed. Keeps your caption and leaves the count alone.'
      )}
      ${row(`${ICONS.pencil} Caption`, 'Written in marker on the photo itself. Editable afterwards.')}
      ${row(
        `${ICONS.heart} Hearts`,
        'On either of your photos, at any time. Yours shows filled; hers shows as a small heart in the corner.'
      )}
      ${row('Arrows', 'Swap two of your own photos between slots. Nothing is re-uploaded.')}
    </dl>
  `;
}

function collage() {
  const layouts = LAYOUT_NOTES.map(
    (layout) => `
      <div class="guide-layout">
        <span class="guide-layout-icon">${layout.icon}</span>
        <div>
          <strong>${escapeHtml(layout.label)}</strong>
          <p>${escapeHtml(layout.note)}</p>
        </div>
      </div>
    `
  ).join('');

  // Driven off the real arrays, so a theme added to the picker cannot go
  // undocumented here.
  const themes = COLLAGE_THEMES.map(
    (theme) =>
      `<div class="guide-row"><dt>${escapeHtml(theme.label)}</dt><dd>${escapeHtml(THEME_NOTES[theme.id] || '')}</dd></div>`
  ).join('');

  const formats = EXPORT_PRESETS.map((preset) => escapeHtml(preset.label)).join(' · ');

  return `
    <p class="guide-lead">Six photos, one image. Every control below can be changed and re-generated as often as you like.</p>

    <p class="guide-subhead">Layout</p>
    <div class="guide-layouts">${layouts}</div>

    <p class="guide-subhead">Theme</p>
    <dl class="guide-rows">${themes}</dl>

    <p class="guide-subhead">Quality and format</p>
    <dl class="guide-rows">
      ${row('Standard / Print', 'Print renders at double the pixels. Slower, and worth it only if you are actually printing it.')}
      ${row('Format', `${formats} — crops the finished image for where it is going.`)}
    </dl>
  `;
}

function keeping() {
  return `
    <dl class="guide-rows">
      ${row(`${ICONS.download} Download PNG`, 'Saves the collage to this device only.')}
      ${row(
        `${ICONS.couple} Save to booth`,
        'Uploads it so you both get the identical file. Without this you each keep your own version, with your own theme — two different keepsakes of one evening.'
      )}
      ${row(`${ICONS.share} Share`, 'Hands the image to your phone\'s share sheet. Hidden where the browser cannot do it.')}
      ${row(
        'Your collages',
        'Saved collages are listed on the front page and outlive the booth they came from — they are stored apart from the photos, so a cleanup never takes them.'
      )}
    </dl>
  `;
}

function privacy() {
  return `
    <dl class="guide-rows">
      ${row('Who can get in', 'Only someone holding this room code. There is no list of rooms to browse and no way to guess one.')}
      ${row('Two-day cleanup', 'Photos and rooms are deleted automatically after two days. Saved collages are kept.')}
      ${row('Delete booth', 'In the collage panel. Removes the room and every photo for both of you, immediately.')}
      ${row(
        `${ICONS.bell} Notifications`,
        'Only for a synced countdown, and only while the booth is open on screen — a closed app cannot wake itself.'
      )}
      ${row('The QR code', 'Drawn on your device. The room link is never sent to an outside service to render.')}
    </dl>
  `;
}

export function buildGuidePanel() {
  return `
    <aside class="card guide-card" aria-label="How the booth works">
      <div class="guide-head">
        <span class="guide-head-icon">${ICONS.book}</span>
        <h2>How it works</h2>
      </div>

      ${section('start', ICONS.hearts, 'Getting started', steps(), { open: true })}
      ${section('shoot', ICONS.camera, 'Taking photos', shooting())}
      ${section('collage', ICONS.palette, 'Your collage', collage())}
      ${section('keep', ICONS.download, 'Saving and sharing', keeping())}
      ${section('privacy', ICONS.shield, 'Privacy and cleanup', privacy())}
    </aside>
  `;
}

// One delegated listener on the panel, rather than one per heading.
export function wireGuidePanel() {
  const panel = document.querySelector('.guide-card');
  if (!panel) return;

  // Marked on the element itself rather than tracked in a module variable,
  // because the panel is replaced wholesale on every render — a flag outside
  // the DOM would go stale and leave the new panel unwired. Wiring the same
  // panel twice would attach two listeners, and a click toggling twice reads
  // as the section refusing to open at all.
  if (panel.dataset.guideWired === 'true') return;
  panel.dataset.guideWired = 'true';

  panel.addEventListener('click', (event) => {
    const toggle = event.target.closest('.guide-toggle');
    if (!toggle) return;

    const item = toggle.closest('.guide-section');
    const body = item.querySelector('.guide-body');
    const open = item.classList.toggle('open');

    toggle.setAttribute('aria-expanded', String(open));
    // `hidden` as well as the class: it keeps the collapsed text out of the
    // accessibility tree and out of ctrl-F, rather than merely off screen.
    body.hidden = !open;
  });
}
