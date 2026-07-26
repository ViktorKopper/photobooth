// Pure markup builders.
//
// These were previously methods on main.js that reached into its module
// level `state`, which made them impossible to exercise without booting the
// whole app — main.js registers a service worker, mounts the theme toggle
// and starts authentication the moment it is imported.
//
// Everything here takes what it needs as an argument and returns a string.
// No state, no DOM, no side effects: given the same input they produce the
// same output, which is exactly what makes them testable.

import { decodeStrokes, DOODLE_STROKE_RATIO, strokesToSvgPath } from '../doodle.js';
import { ICONS, weatherIcon } from '../icons.js';
import { escapeAttr, escapeHtml } from '../ui/html.js';
import { CAPTION_INK } from '../config.js';
import { daysTogether, milestoneFor, otherRole, streakFrom } from '../utils.js';
import { ROLES } from '../utils.js';

export function formatDays(count) {
  return count === 1 ? '1 day' : `${count} days`;
}

// The reference date is injectable throughout this file. Reading the clock
// inside a builder makes its output depend on the day it happens to run,
// which is untestable and — as the day-counter bug proved — a good place
// for a mistake to hide.
export function togetherLine(anniversaryDate, referenceDate = new Date()) {
  const count = daysTogether(anniversaryDate, referenceDate);
  return count ? `${ICONS.hearts} Together for ${formatDays(count)}` : '';
}

// Either "you're standing on a round number today" or a nudge towards the
// next one. Shown only when it's close enough to mean something — a
// countdown from 80 days out is just noise.
export function buildMilestoneLine(
  anniversaryDate,
  { nudgeWithin = 30, referenceDate = new Date() } = {}
) {
  const milestone = milestoneFor(daysTogether(anniversaryDate, referenceDate));
  if (!milestone) return '';

  if (milestone.reached) {
    return `<p class="milestone-line milestone-reached">${ICONS.heartFilled} ${escapeHtml(milestone.label)}</p>`;
  }

  if (milestone.remaining > nudgeWithin) return '';

  const days = milestone.remaining === 1 ? '1 day' : `${milestone.remaining} days`;
  return `<p class="milestone-line">${escapeHtml(days)} to ${escapeHtml(milestone.label)}</p>`;
}

export function buildStreakLine(rooms, referenceDate = new Date()) {
  const streak = streakFrom(rooms, referenceDate);
  if (streak < 2) return '';
  return `<p class="milestone-line">${ICONS.camera} ${streak} days in a row</p>`;
}

// Collages saved from past booths. The rooms behind these are long gone —
// the files live outside the prefix that gets swept — so this is the only
// trail back to them.
export function buildKeepsakeGallery(keepsakes, { limit = 12 } = {}) {
  if (!keepsakes?.length) return '';

  const tiles = keepsakes
    .slice(0, limit)
    .map(
      (keepsake) => `
        <a class="keepsake" href="${escapeAttr(keepsake.url)}" target="_blank" rel="noopener"
           title="Booth ${escapeAttr(keepsake.roomId)}">
          <img src="${escapeAttr(keepsake.url)}" alt="Collage from booth ${escapeAttr(keepsake.roomId)}" loading="lazy" />
        </a>
      `
    )
    .join('');

  return `
    <div class="keepsakes">
      <p class="field-label">Your collages</p>
      <div class="keepsake-grid">${tiles}</div>
      <button type="button" class="ghost small" id="clearKeepsakesBtn">Clear this list</button>
    </div>
  `;
}

export function buildSegmented(label, stateKey, options, selected) {
  return `
    <div class="layout-control">
      <span class="field-label">${escapeHtml(label)}</span>
      <div class="segmented" data-state-key="${stateKey}" role="group" aria-label="${escapeAttr(label)}">
        ${options
          .map(
            (option) =>
              `<button type="button" class="segmented-option${selected === option.value ? ' active' : ''}" data-value="${escapeAttr(option.value)}">${escapeHtml(option.label)}</button>`
          )
          .join('')}
      </div>
    </div>
  `;
}

export function weatherChip(weather) {
  if (!weather) return '';
  return `<span class="distance-weather" title="${escapeAttr(weather.label)}">${weatherIcon(weather.code)} ${escapeHtml(String(weather.temperature))}°</span>`;
}

// The collage published to the room, if any — the one artifact both of you
// share, as opposed to whatever each browser happens to have rendered.
export function buildSharedCollageBlock(collage, myRole) {
  if (!collage?.downloadUrl) return '';

  const savedByMe = collage.savedBy === myRole;
  const savedByName = ROLES[collage.savedBy]?.name || 'Someone';
  const details = [collage.layout, collage.theme, collage.format]
    .filter((value) => value && value !== 'original')
    .join(' · ');

  return `
    <div class="shared-collage">
      <p class="eyebrow">saved to this booth</p>
      <img class="collage-preview" src="${escapeAttr(collage.downloadUrl)}" alt="Collage saved to this booth" />
      <p class="shared-collage-meta">${escapeHtml(
        savedByMe ? 'You saved this for both of you.' : `${savedByName} saved this for both of you.`
      )}${details ? ` (${escapeHtml(details)})` : ''}</p>
      <a class="secondary shared-collage-download" href="${escapeAttr(collage.downloadUrl)}" target="_blank" rel="noopener">Download the shared one</a>
    </div>
  `;
}

// One partner's row of three slots: filled prints with their controls, or
// numbered placeholders. Only the owner gets edit, retake and reorder;
// anyone can react, because a reaction is the viewer's own expression
// rather than something the photo's owner controls.
export function buildThumbRow({ role, viewerRole, photos, replacingIndex = null }) {
  const ownerPhotos = photos
    .filter((photo) => photo.owner === role)
    .reduce((map, photo) => map.set(photo.index, photo), new Map());

  const isOwner = role === viewerRole;
  const partnerRole = otherRole(viewerRole);

  const slots = [1, 2, 3].map((index) => {
    const photo = ownerPhotos.get(index);
    if (!photo?.downloadUrl) {
      return `<div class="thumb-slot empty">${index}</div>`;
    }

    const doodleButton = `<button type="button" class="thumb-doodle-btn" data-role="${role}" data-index="${index}" title="Draw on this photo" aria-label="Draw on ${escapeAttr(ROLES[role].name)}'s photo ${index}">${ICONS.pencilTip}</button>`;

    const editButton = isOwner
      ? `<button type="button" class="thumb-edit-btn" data-role="${role}" data-index="${index}" title="Edit caption" aria-label="Edit caption for photo ${index}">${ICONS.pencil}</button>`
      : '';

    const retakeButton = isOwner
      ? `<button type="button" class="thumb-retake-btn" data-index="${index}" title="Retake this photo" aria-label="Retake photo ${index}">${ICONS.refresh}</button>`
      : '';

    // An arrow appears only where there's a filled neighbour to trade
    // places with.
    const moveButtons = isOwner
      ? [
          ownerPhotos.get(index - 1)
            ? `<button type="button" class="thumb-move-btn thumb-move-left" data-from="${index}" data-to="${index - 1}" title="Move earlier" aria-label="Move photo ${index} earlier">${ICONS.arrowLeft}</button>`
            : '',
          ownerPhotos.get(index + 1)
            ? `<button type="button" class="thumb-move-btn thumb-move-right" data-from="${index}" data-to="${index + 1}" title="Move later" aria-label="Move photo ${index} later">${ICONS.arrowRight}</button>`
            : ''
        ].join('')
      : '';

    const partnerReacted = Boolean(photo.reactions?.[partnerRole]);
    const myReacted = Boolean(photo.reactions?.[viewerRole]);

    const partnerBadge = partnerReacted
      ? `<span class="thumb-partner-heart" title="${escapeAttr(ROLES[partnerRole].name)} loves this photo">${ICONS.heartFilled}</span>`
      : '';

    const reactionButton = `<button
        type="button"
        class="thumb-reaction-btn${myReacted ? ' reacted' : ''}"
        data-role="${role}"
        data-index="${index}"
        title="${myReacted ? 'Remove reaction' : 'Like this photo'}"
        aria-label="${myReacted ? 'Remove reaction from photo' : 'Like photo'} ${index}"
      >${myReacted ? ICONS.heartFilled : ICONS.heart}</button>`;

    const replacing = isOwner && replacingIndex === index;

    return `<div class="thumb-slot filled${replacing ? ' replacing' : ''}"><img src="${escapeAttr(photo.downloadUrl)}" alt="${escapeAttr(ROLES[role].name)} photo ${index}" loading="lazy" />${doodleOverlay(photo)}${editButton}${retakeButton}${doodleButton}${partnerBadge}${reactionButton}${moveButtons}</div>`;
  });

  return `<div class="thumb-row thumb-row-${role}">${slots.join('')}</div>`;
}

// Both people's marker, drawn over the thumbnail so a drawing is visible
// without opening anything. Stretched with the photo rather than letterboxed:
// the strokes were recorded in the photo's own coordinate space.
export function doodleOverlay(photo) {
  const layers = ['viktor', 'jericka']
    .map((role) => ({ role, strokes: decodeStrokes(photo.doodles?.[role] || '') }))
    .filter((layer) => layer.strokes.length);

  if (!layers.length) return '';

  const paths = layers
    .map(
      (layer) =>
        `<path d="${escapeAttr(strokesToSvgPath(layer.strokes))}" fill="none" stroke="${escapeAttr(CAPTION_INK[layer.role])}" stroke-width="${DOODLE_STROKE_RATIO * 1000}" stroke-linecap="round" stroke-linejoin="round" />`
    )
    .join('');

  return `<svg class="thumb-doodle" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">${paths}</svg>`;
}
