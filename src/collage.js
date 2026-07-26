import { decodeStrokes, drawStrokes, strokeWidthFor } from './doodle.js';
import { clamp, daysTogether, distanceBetween, formatDate, formatDistanceKm, ROLE_KEYS } from './utils.js';

// Colour themes for the finished collage. Every drawing routine reads from
// the active palette rather than hard-coded hexes, so a theme swap restyles
// the whole page — background, tape, hearts, ink — in one go.
//
// A note on the "ink" tones: captions are written onto the white polaroid
// border, so they always need to stay dark and legible regardless of how
// light or dark the surrounding page is. That's why they don't simply
// follow the tape colours.
export const COLLAGE_THEMES = [
  {
    id: 'rose',
    label: 'Rose',
    palette: {
      bgTop: '#fff7f4',
      bgMid: '#ffe7ec',
      bgBottom: '#fffdf8',
      heart: '#d94d72',
      title: '#5a2a35',
      subtitle: '#8b4a5a',
      message: '#9b2948',
      label: '#7b3d4b',
      meta: '#9c6672',
      cardShadow: 'rgba(88, 40, 50, 0.22)',
      cardBg: '#ffffff',
      innerBorder: 'rgba(190, 140, 150, 0.35)',
      photoTint: '#e85d85',
      photoFilter: '',
      stripBg: 'rgba(255, 255, 255, 0.55)',
      connectorHeart: '#c7345a',
      viktorTape: '#3f7fb8',
      jerickaTape: '#c7345a',
      viktorInk: '#2a5a86',
      jerickaInk: '#9b2948'
    }
  },
  {
    id: 'midnight',
    label: 'Midnight',
    palette: {
      bgTop: '#1b2340',
      bgMid: '#2a3358',
      bgBottom: '#151b30',
      heart: '#8fa6e0',
      title: '#f2f5ff',
      subtitle: '#b9c4e8',
      message: '#ffd9e6',
      label: '#cdd6f0',
      meta: '#94a0c4',
      cardShadow: 'rgba(5, 8, 20, 0.5)',
      cardBg: '#ffffff',
      innerBorder: 'rgba(120, 140, 190, 0.35)',
      photoTint: '#4a6bb0',
      photoFilter: '',
      stripBg: 'rgba(255, 255, 255, 0.10)',
      connectorHeart: '#f2a9c4',
      viktorTape: '#6fa8d8',
      jerickaTape: '#e07fa4',
      viktorInk: '#1f4468',
      jerickaInk: '#8c2246'
    }
  },
  {
    id: 'autumn',
    label: 'Autumn',
    palette: {
      bgTop: '#fdf6ea',
      bgMid: '#f7e3c8',
      bgBottom: '#fffaf0',
      heart: '#c2712c',
      title: '#4a2c17',
      subtitle: '#8a5a34',
      message: '#a8501c',
      label: '#6b4526',
      meta: '#9c7a56',
      cardShadow: 'rgba(74, 44, 23, 0.22)',
      cardBg: '#fffdf7',
      innerBorder: 'rgba(180, 150, 110, 0.35)',
      photoTint: '#d98b3a',
      photoFilter: '',
      stripBg: 'rgba(255, 255, 255, 0.5)',
      connectorHeart: '#c2712c',
      viktorTape: '#4f7a4a',
      jerickaTape: '#c2712c',
      viktorInk: '#2f5230',
      jerickaInk: '#8a4413'
    }
  },
  {
    id: 'notebook',
    label: 'Notebook',
    palette: {
      bgTop: '#fdf6f2',
      bgMid: '#fff3f6',
      bgBottom: '#fffaf6',
      heart: '#e85d85',
      title: '#7a2740',
      subtitle: '#9c7080',
      message: '#c7345a',
      label: '#7a2740',
      meta: '#a58490',
      cardShadow: 'rgba(74, 44, 23, 0.18)',
      cardBg: '#ffffff',
      innerBorder: 'rgba(190, 150, 165, 0.35)',
      photoTint: '#e85d85',
      photoFilter: '',
      stripBg: 'rgba(255, 255, 255, 0.6)',
      connectorHeart: '#e85d85',
      viktorTape: '#a8bfa0',
      jerickaTape: '#f4a6c0',
      viktorInk: '#2a5a86',
      jerickaInk: '#9b2948',
      // The three flags that make this theme a notebook page rather than
      // just another colourway: ruled lines instead of heart confetti, and
      // a marker-pen title to match the app the photos were taken in.
      ruled: true,
      confetti: false,
      titleFont: 'marker'
    }
  },
  {
    id: 'mono',
    label: 'Mono',
    palette: {
      bgTop: '#f7f7f5',
      bgMid: '#e8e8e6',
      bgBottom: '#fcfcfb',
      heart: '#7a7a78',
      title: '#1f1f1e',
      subtitle: '#55554f',
      message: '#2c2c2a',
      label: '#444441',
      meta: '#7a7a76',
      cardShadow: 'rgba(20, 20, 20, 0.22)',
      cardBg: '#ffffff',
      innerBorder: 'rgba(120, 120, 118, 0.35)',
      photoTint: '#8a8a88',
      // The only theme that also drains the colour out of the photos
      // themselves — a "black & white" collage with colour photos in it
      // would read as a mistake rather than a choice.
      photoFilter: 'grayscale(1)',
      stripBg: 'rgba(255, 255, 255, 0.55)',
      connectorHeart: '#3d3d3a',
      viktorTape: '#6b6b68',
      jerickaTape: '#2c2c2a',
      viktorInk: '#2c2c2a',
      jerickaInk: '#1f1f1e'
    }
  }
];

export function findTheme(id) {
  return COLLAGE_THEMES.find((theme) => theme.id === id) || COLLAGE_THEMES[0];
}

// Output shapes. `aspect` is width / height; null means "leave the collage
// at whatever proportions its layout produced".
export const EXPORT_PRESETS = [
  { id: 'original', label: 'Original', aspect: null },
  { id: 'story', label: 'Story 9:16', aspect: 9 / 16 },
  { id: 'square', label: 'Square', aspect: 1 }
];

export function findExportPreset(id) {
  return EXPORT_PRESETS.find((preset) => preset.id === id) || EXPORT_PRESETS[0];
}

// Re-centres a finished collage inside a canvas of a different shape,
// filling the surrounding space with the same themed background so the
// result looks composed for that format rather than letterboxed onto it.
// Resolution is preserved by growing the canvas rather than shrinking the
// artwork: the collage is never scaled up beyond 1:1.
// The geometry, kept separate from the drawing so it can be reasoned about
// — and tested — without a canvas. This is where the actual decisions live:
// which dimension drives the target, and how much breathing room to leave.
export function targetSizeFor(sourceWidth, sourceHeight, aspect, margin = 0.94) {
  if (!aspect) return { width: sourceWidth, height: sourceHeight };

  if (sourceWidth / sourceHeight > aspect) {
    // Source is relatively wider — its width drives the target size.
    const width = Math.round(sourceWidth / margin);
    return { width, height: Math.round(width / aspect) };
  }

  const height = Math.round(sourceHeight / margin);
  return { width: Math.round(height * aspect), height };
}

export function fitOntoAspect(source, aspect) {
  if (!aspect) return source;

  const { width: targetWidth, height: targetHeight } = targetSizeFor(
    source.width,
    source.height,
    aspect
  );

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const ctx = canvas.getContext('2d');
  drawPageBackground(ctx, targetWidth, targetHeight);

  const x = Math.round((targetWidth - source.width) / 2);
  const y = Math.round((targetHeight - source.height) / 2);
  ctx.drawImage(source, x, y);

  return canvas;
}

// The active palette. Swapped once per generateCollage() call, immediately
// before the synchronous drawing pass, so every draw helper below can read
// it without threading a palette argument through a dozen signatures.
let PALETTE = COLLAGE_THEMES[0].palette;

// Photo cards use a portrait-ish 4:5 ratio (not landscape) so mobile
// portrait selfies and landscape webcam shots both crop reasonably instead
// of favoring one source over the other.
const CARD_ASPECT = 4 / 5;

// Portrait selfies get cropped biased toward the top third instead of dead
// center, so faces held above chin-height aren't chopped off.
const CROP_TOP_BIAS = 0.28;

// Photos are normalized toward this average luminance (0-255) so a bright
// daytime webcam shot and a dim nighttime phone selfie feel like they belong
// to the same memory instead of two different apps.
const TARGET_BRIGHTNESS = 150;

// Deterministic "hand-placed" tilt per photo slot, so the collage looks like
// a scrapbook rather than a perfectly aligned corporate grid, but stays
// identical every time the same room's collage is regenerated.
const ROTATION_PATTERN = [-3, 2.4, -2.1, 3.2, -1.6, 1.8];

function rotationFor(index) {
  return ROTATION_PATTERN[index % ROTATION_PATTERN.length];
}

// Captions get their own small, independent tilt (not tied to the photo's
// rotation pattern) so they read as written on afterward, by hand.
function captionRotationFor(index) {
  return index % 2 === 0 ? -1.4 : 1.6;
}

const HANDWRITING_FONT = '"Caveat", cursive';
const MARKER_FONT = '"Permanent Marker", cursive';
let handwritingFontPromise = null;
let markerFontPromise = null;

function ensureHandwritingFont() {
  if (handwritingFontPromise) return handwritingFontPromise;

  handwritingFontPromise = (async () => {
    if (typeof document === 'undefined' || !document.fonts) return false;
    try {
      await document.fonts.load(`700 48px ${HANDWRITING_FONT}`);
      return document.fonts.check(`700 48px ${HANDWRITING_FONT}`);
    } catch {
      return false;
    }
  })();

  return handwritingFontPromise;
}

// Per-photo captions use a separate "marker" font (thick, uneven felt-tip
// strokes) so they read as a different, quicker gesture than the elegant
// signature-style Caveat used for the header message.
function ensureMarkerFont() {
  if (markerFontPromise) return markerFontPromise;

  markerFontPromise = (async () => {
    if (typeof document === 'undefined' || !document.fonts) return false;
    try {
      await document.fonts.load(`400 32px ${MARKER_FONT}`);
      return document.fonts.check(`400 32px ${MARKER_FONT}`);
    } catch {
      return false;
    }
  })();

  return markerFontPromise;
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// Which partner's final photo becomes the "hero" shot in the Hero layout.
// Deterministic per room (so regenerating gives the same result) but
// alternates across rooms instead of always favoring the same person.
function pickHeroOwner(roomId) {
  if (!roomId) return 'viktor';
  return hashString(roomId) % 2 === 0 ? 'viktor' : 'jericka';
}

function roundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function drawCoverImage(ctx, image, x, y, width, height) {
  const imageRatio = image.width / image.height;
  const targetRatio = width / height;

  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = image.width;
  let sourceHeight = image.height;

  if (imageRatio > targetRatio) {
    sourceWidth = image.height * targetRatio;
    sourceX = (image.width - sourceWidth) / 2;
  } else {
    sourceHeight = image.width / targetRatio;
    sourceY = (image.height - sourceHeight) * CROP_TOP_BIAS;
  }

  ctx.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height
  );
}

function estimateBrightness(image) {
  const sample = 24;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sample;
  sampleCanvas.height = sample;

  const sampleCtx = sampleCanvas.getContext('2d');
  sampleCtx.drawImage(image, 0, 0, sample, sample);

  let data;
  try {
    data = sampleCtx.getImageData(0, 0, sample, sample).data;
  } catch {
    // If the canvas is ever tainted for any reason, skip correction
    // rather than throwing away the whole collage.
    return TARGET_BRIGHTNESS;
  }

  let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
  }

  return total / (data.length / 4);
}

function brightnessFilterFor(image) {
  const brightness = estimateBrightness(image);
  const factor = TARGET_BRIGHTNESS / Math.max(brightness, 30);
  return clamp(factor, 0.85, 1.65);
}

function drawWashiTape(ctx, centerX, cardTopY, cardWidth, color, angleDeg) {
  const tapeWidth = cardWidth * 0.3;
  const tapeHeight = cardWidth * 0.09;

  ctx.save();
  ctx.translate(centerX, cardTopY);
  ctx.rotate((angleDeg * Math.PI) / 180);
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = color;
  ctx.fillRect(-tapeWidth / 2, -tapeHeight / 2, tapeWidth, tapeHeight);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillRect(-tapeWidth / 2, -tapeHeight * 0.15, tapeWidth, tapeHeight * 0.14);
  ctx.restore();
}

// Draws a short handwritten caption inside a card's bottom margin. Sized
// down to fit before truncating, and given a small rotation independent of
// the card's own tilt, as if it were jotted on afterward rather than
// perfectly aligned with the photo.
function drawCardCaption(ctx, text, x, y, width, height, innerY, innerHeight, color, extraRotationDeg, markerReady) {
  if (!text) return;

  const areaTop = innerY + innerHeight;
  const areaBottom = y + height;
  const centerX = x + width / 2;
  const centerY = areaTop + (areaBottom - areaTop) / 2;
  const maxWidth = width * 0.86;

  const fontFamily = markerReady ? MARKER_FONT : 'Georgia, serif';
  const fontWeight = markerReady ? '400' : 'italic 600';
  let fontSize = clamp(width * 0.09, 22, 44);
  const minFontSize = fontSize * 0.6;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate((extraRotationDeg * Math.PI) / 180);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;

  ctx.font = `${fontWeight} ${Math.round(fontSize)}px ${fontFamily}`;
  while (ctx.measureText(text).width > maxWidth && fontSize > minFontSize) {
    fontSize -= 2;
    ctx.font = `${fontWeight} ${Math.round(fontSize)}px ${fontFamily}`;
  }

  let displayText = text;
  while (ctx.measureText(displayText).width > maxWidth && displayText.length > 4) {
    displayText = `${displayText.slice(0, displayText.length - 2).trim()}…`;
  }

  ctx.fillText(displayText, 0, 0);
  ctx.restore();
}

// Draws one photo as a small "instant photo" card: white polaroid-style
// frame with a thicker caption margin at the bottom, a slight deterministic
// tilt, and an optional washi-tape accent tinted to the photo's owner.
// Both people's marker, in their own ink, over the photo it was drawn on.
//
// The theme decides the ink: on Mono, where the photos themselves are drained
// of colour, two coloured scribbles would be the only saturated thing on the
// page and would read as a mistake rather than a choice.
function drawDoodleLayers(ctx, doodles, rect) {
  if (!doodles) return;

  ROLE_KEYS.forEach((role) => {
    const strokes = decodeStrokes(doodles[role] || '');
    if (!strokes.length) return;

    drawStrokes(ctx, strokes, {
      ...rect,
      color: PALETTE.photoFilter?.includes('grayscale')
        ? PALETTE.title
        : PALETTE[role === 'viktor' ? 'viktorInk' : 'jerickaInk'],
      lineWidth: strokeWidthFor(rect.width)
    });
  });
}

function drawPhotoCard(ctx, image, x, y, width, height, radius, options = {}) {
  const {
    rotationDeg = 0,
    washiColor = null,
    washiAngle = -6,
    caption = '',
    captionColor = PALETTE.label,
    captionRotationDeg = 0,
    markerReady = false,
    doodles = null
  } = options;

  const cx = x + width / 2;
  const cy = y + height / 2;

  ctx.save();
  if (rotationDeg) {
    ctx.translate(cx, cy);
    ctx.rotate((rotationDeg * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  ctx.save();
  ctx.shadowColor = PALETTE.cardShadow;
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = PALETTE.cardBg;
  roundRect(ctx, x, y, width, height, radius);
  ctx.fill();
  ctx.restore();

  // The photo sits inside the frame with a thicker margin at the bottom,
  // like a real instant photo with room to write a caption underneath.
  const sidePad = width * 0.055;
  const topPad = height * 0.055;
  const bottomPad = height * 0.2;
  const innerX = x + sidePad;
  const innerY = y + topPad;
  const innerWidth = width - sidePad * 2;
  const innerHeight = height - topPad - bottomPad;
  const innerRadius = Math.max(radius - 14, 6);

  ctx.save();
  roundRect(ctx, innerX, innerY, innerWidth, innerHeight, innerRadius);
  ctx.clip();

  const filter = brightnessFilterFor(image);
  const themeFilter = PALETTE.photoFilter ? ` ${PALETTE.photoFilter}` : '';
  ctx.filter = `brightness(${filter}) saturate(1.06) contrast(1.02)${themeFilter}`;
  drawCoverImage(ctx, image, innerX, innerY, innerWidth, innerHeight);
  ctx.filter = 'none';

  // Faint tint so a cold, dim photo still reads as part of the same
  // memory as a bright one, in whatever colour the theme is built around.
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = PALETTE.photoTint;
  ctx.fillRect(innerX, innerY, innerWidth, innerHeight);
  ctx.globalAlpha = 1;

  // Inside the same clip as the photo, so a line that ran off the edge while
  // drawing is cropped by the frame rather than scrawling across the mount.
  // Drawn after the tint so the marker keeps its own colour.
  drawDoodleLayers(ctx, doodles, {
    x: innerX,
    y: innerY,
    width: innerWidth,
    height: innerHeight
  });
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = PALETTE.innerBorder;
  ctx.lineWidth = 2;
  roundRect(ctx, innerX + 1, innerY + 1, innerWidth - 2, innerHeight - 2, innerRadius);
  ctx.stroke();
  ctx.restore();

  if (washiColor) {
    drawWashiTape(ctx, x + width / 2, y, width, washiColor, washiAngle);
  }

  drawCardCaption(ctx, caption, x, y, width, height, innerY, innerHeight, captionColor, captionRotationDeg, markerReady);

  ctx.restore();
}

function fillTextSpaced(ctx, text, centerX, y, spacing) {
  const letters = text.split('');
  const widths = letters.map((letter) => ctx.measureText(letter).width);
  const total = widths.reduce((sum, w) => sum + w, 0) + spacing * (letters.length - 1);

  const originalAlign = ctx.textAlign;
  ctx.textAlign = 'left';

  let cursor = centerX - total / 2;
  letters.forEach((letter, index) => {
    ctx.fillText(letter, cursor, y);
    cursor += widths[index] + spacing;
  });

  ctx.textAlign = originalAlign;
}

function drawHeartAt(ctx, x, y, size, color) {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  ctx.arc(x, y, size * 0.62, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.font = `${Math.round(size)}px Georgia, serif`;
  ctx.fillText('♡', x, y + size * 0.06);
  ctx.restore();
}

function drawHeartConfetti(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = PALETTE.heart;
  ctx.textAlign = 'center';
  const hearts = ['♡', '♥', '♡', '♥', '♡'];
  const fontSize = Math.round(width * 0.045);
  ctx.font = `${fontSize}px Georgia, serif`;

  hearts.forEach((heart, index) => {
    const topY = height * 0.06 + (index % 2) * height * 0.015;
    const bottomY = height * 0.965 - (index % 2) * height * 0.015;
    const x = width * (0.09 + index * (0.82 / (hearts.length - 1)));
    ctx.fillText(heart, x, topY);
    ctx.fillText(heart, x, bottomY);
  });

  ctx.restore();
}

// Ruled lines with a margin down the left, matching the notebook the
// photos were taken in. Spacing scales with the page so the rules stay
// proportionally the same across the three layout sizes.
function drawRuledPage(ctx, width, height) {
  const spacing = Math.max(28, Math.round(width * 0.026));
  const marginX = Math.round(width * 0.075);

  ctx.save();
  ctx.strokeStyle = 'rgba(157, 195, 230, 0.38)';
  ctx.lineWidth = 1.5;

  for (let y = spacing; y < height; y += spacing) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(232, 93, 133, 0.4)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(marginX, 0);
  ctx.lineTo(marginX, height);
  ctx.stroke();
  ctx.restore();
}

function drawPageBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, PALETTE.bgTop);
  gradient.addColorStop(0.55, PALETTE.bgMid);
  gradient.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (PALETTE.ruled) drawRuledPage(ctx, width, height);
  // Hearts and rules together would be busy; a theme picks one.
  if (PALETTE.confetti !== false) drawHeartConfetti(ctx, width, height);
}

function drawHeaderBlock(ctx, {
  centerX,
  titleY,
  subtitleY,
  messageY,
  message,
  titleSize,
  subtitleSize,
  messageSize,
  maxMessageWidth,
  handwritingReady,
  markerReady
}) {
  ctx.textAlign = 'center';

  // The title is the one element that should dominate the header — bigger
  // and bolder than everything else around it. Themes that want a
  // handwritten page ask for the marker instead of the serif, falling back
  // to the serif if the font never loaded.
  const useMarker = PALETTE.titleFont === 'marker' && markerReady;
  ctx.fillStyle = PALETTE.title;
  ctx.font = useMarker
    ? `400 ${Math.round(titleSize * 0.82)}px ${MARKER_FONT}`
    : `bold ${titleSize}px Georgia, serif`;
  ctx.fillText('Viktor & Jericka', centerX, titleY);

  ctx.fillStyle = PALETTE.subtitle;
  ctx.font = `bold ${subtitleSize}px Inter, Arial, sans-serif`;
  fillTextSpaced(ctx, 'MADE WITH LOVE, EVEN FROM FAR AWAY', centerX, subtitleY, subtitleSize * 0.22);

  // The custom message is the most personal line, so it gets its own
  // handwritten voice (with an italic-serif fallback) and a heart on either
  // side instead of blending into the rest of the header copy.
  let messageText = message;
  const messageFont = handwritingReady
    ? `700 ${messageSize}px ${HANDWRITING_FONT}`
    : `italic 600 ${Math.round(messageSize * 0.8)}px Georgia, serif`;

  ctx.font = messageFont;
  while (ctx.measureText(messageText).width > maxMessageWidth && messageText.length > 6) {
    messageText = `${messageText.slice(0, messageText.length - 5).trim()}…`;
  }

  const textWidth = ctx.measureText(messageText).width;
  ctx.fillStyle = PALETTE.message;
  ctx.fillText(messageText, centerX, messageY);

  const heartSize = messageSize * 0.4;
  const heartOffset = textWidth / 2 + heartSize * 1.7;
  drawHeartAt(ctx, centerX - heartOffset, messageY - heartSize * 0.5, heartSize, PALETTE.message);
  drawHeartAt(ctx, centerX + heartOffset, messageY - heartSize * 0.5, heartSize, PALETTE.message);
}

function drawFooter(ctx, { centerX, y, roomId, dayCount, distanceLabel }) {
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.meta;
  ctx.font = '26px Inter, Arial, sans-serif';

  const parts = [];
  if (roomId) parts.push(`Booth ${roomId}`);
  if (dayCount) parts.push(`Day ${dayCount} together`);
  if (distanceLabel) parts.push(`${distanceLabel} apart`);
  parts.push(formatDate());

  ctx.fillText(parts.join('  ·  '), centerX, y);
}

function labelCorner(ctx, x, y, letter, color, size = 22) {
  ctx.save();
  const cx = x + size + 8;
  const cy = y + size + 8;
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(cx, cy, size, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size)}px Inter, Arial, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, cx, cy + 1);
  ctx.restore();
}

function drawScallopedEdges(ctx, stripX, stripY, stripWidth, stripHeight, pageColor) {
  const radius = 15;
  const spacing = 46;
  const count = Math.floor(stripHeight / spacing);

  ctx.save();
  ctx.fillStyle = pageColor;

  for (let i = 0; i <= count; i += 1) {
    const y = stripY + i * spacing;
    ctx.beginPath();
    ctx.arc(stripX, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(stripX + stripWidth, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// A very subtle overlay of soft, blown-up noise blended with "overlay" mode,
// so the finished collage reads as one warm, slightly grainy keepsake print
// instead of a flat digital composite of mismatched source photos.
function applyFilmGrain(ctx, width, height, opacity = 0.05) {
  const scale = 3;
  const grainWidth = Math.max(1, Math.ceil(width / scale));
  const grainHeight = Math.max(1, Math.ceil(height / scale));

  const grainCanvas = document.createElement('canvas');
  grainCanvas.width = grainWidth;
  grainCanvas.height = grainHeight;

  const grainCtx = grainCanvas.getContext('2d');
  const imageData = grainCtx.createImageData(grainWidth, grainHeight);
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const value = 128 + (Math.random() - 0.5) * 255;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = 255;
  }

  grainCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(grainCanvas, 0, 0, grainWidth, grainHeight, 0, 0, width, height);
  ctx.restore();
}

export function splitPhotosByOwner(photos) {
  const viktor = photos
    .filter((photo) => photo.owner === 'viktor')
    .sort((a, b) => a.index - b.index);

  const jericka = photos
    .filter((photo) => photo.owner === 'jericka')
    .sort((a, b) => a.index - b.index);

  if (viktor.length !== 3 || jericka.length !== 3) {
    throw new Error('Both Viktor and Jericka need exactly 3 photos before generating the collage.');
  }

  return { viktor, jericka };
}

// Decoded photos, keyed by download URL.
//
// Generating a collage is no longer a one-off: between three layouts, two
// qualities, five themes and three export formats there are ninety
// combinations, and trying a few of them used to mean re-downloading all
// six photos every single time. The images are immutable once uploaded, so
// they're kept after the first decode and reused.
// Holds { image, objectUrl } so the blob URL's lifetime is tied to the
// cache entry rather than being revoked the instant the image decodes.
// Revoking early would risk a permanently broken image if the browser ever
// dropped the decoded bitmap and tried to re-fetch the source.
const imageCache = new Map();

// Called when leaving a booth, so photos from one room don't sit in memory
// while you're in another.
export function clearCollageImageCache() {
  imageCache.forEach((entry) => URL.revokeObjectURL(entry.objectUrl));
  imageCache.clear();
}

async function loadImageFromUrl(url, cacheKey = url) {
  if (!url) {
    throw new Error('Missing photo download URL.');
  }

  const cached = imageCache.get(cacheKey);
  if (cached) return cached.image;

  let response;

  try {
    response = await fetch(url, { method: 'GET', mode: 'cors' });
  } catch (error) {
    throw new Error('Could not fetch one uploaded photo from Firebase Storage. This is most likely a Storage CORS issue.');
  }

  if (!response.ok) {
    throw new Error(`Could not load one uploaded photo. Storage returned HTTP ${response.status}.`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  let image;

  try {
    image = await new Promise((resolve, reject) => {
      const element = new Image();

      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Could not decode one uploaded photo as an image.'));

      element.src = objectUrl;
    });
  } catch (error) {
    // Nothing will ever reference this URL now, so release it here rather
    // than leaving it dangling — the failure path used to be the *only*
    // place this happened.
    URL.revokeObjectURL(objectUrl);
    throw error;
  }

  imageCache.set(cacheKey, { image, objectUrl });
  return image;
}

// A retaken photo overwrites the same storage path, so its download URL is
// not a safe cache key on its own — a stale image could be served for a
// slot that was just replaced. Pairing the URL with the document's write
// time guarantees a replacement always misses the cache.
export function photoCacheKey(photo) {
  const stamp = photo.createdAt?.toMillis?.() ?? photo.createdAt?.seconds ?? '';
  return `${photo.downloadUrl}|${stamp}`;
}

async function loadOwnerItems(photos) {
  // Loaded sequentially, not all at once. This is more stable on mobile.
  const items = [];
  for (const photo of photos) {
    const image = await loadImageFromUrl(photo.downloadUrl, photoCacheKey(photo));
    items.push({ image, caption: photo.caption || '', doodles: photo.doodles || null });
  }
  return items;
}

async function loadOwnerImages(viktorPhotos, jerickaPhotos) {
  const viktorItems = await loadOwnerItems(viktorPhotos);
  const jerickaItems = await loadOwnerItems(jerickaPhotos);

  return { viktorItems, jerickaItems };
}

function computeGridDimensions() {
  const width = 1600;
  const marginX = 120;
  const gap = 50;
  const top = 350;
  const cardWidth = (width - marginX * 2 - gap) / 2;
  const cardHeight = cardWidth / CARD_ASPECT;
  const rows = 3;
  const stackHeight = rows * cardHeight + (rows - 1) * gap;
  const bottomLabelY = top + stackHeight + 40;
  const footerY = bottomLabelY + 55;
  const height = footerY + 50;

  return { width, height, marginX, gap, top, cardWidth, cardHeight, bottomLabelY, footerY };
}

function drawGridLayout(ctx, dims, payload) {
  const { width, marginX, gap, top, cardWidth, cardHeight, bottomLabelY, footerY } = dims;
  const { viktorItems, jerickaItems, message, roomId, handwritingReady, markerReady, dayCount, distanceLabel } = payload;

  drawPageBackground(ctx, dims.width, dims.height);

  drawHeaderBlock(ctx, {
    centerX: width / 2,
    titleY: 140,
    subtitleY: 195,
    messageY: 260,
    message,
    titleSize: 92,
    subtitleSize: 26,
    messageSize: 48,
    maxMessageWidth: width - 400,
    handwritingReady,
    markerReady
  });

  for (let row = 0; row < 3; row += 1) {
    const y = top + row * (cardHeight + gap);
    const viktorX = marginX;
    const jerickaX = marginX + cardWidth + gap;

    drawPhotoCard(ctx, viktorItems[row].image, viktorX, y, cardWidth, cardHeight, 32, {
      rotationDeg: rotationFor(row * 2),
      washiColor: PALETTE.viktorTape,
      washiAngle: row % 2 === 0 ? -7 : 6,
      caption: viktorItems[row].caption,
      doodles: viktorItems[row].doodles,
      captionColor: PALETTE.viktorInk,
      captionRotationDeg: captionRotationFor(row * 2),
      markerReady
    });
    drawPhotoCard(ctx, jerickaItems[row].image, jerickaX, y, cardWidth, cardHeight, 32, {
      rotationDeg: rotationFor(row * 2 + 1),
      washiColor: PALETTE.jerickaTape,
      washiAngle: row % 2 === 0 ? 7 : -6,
      caption: jerickaItems[row].caption,
      doodles: jerickaItems[row].doodles,
      captionColor: PALETTE.jerickaInk,
      captionRotationDeg: captionRotationFor(row * 2 + 1),
      markerReady
    });

    // A small heart bridging each round's pair, reinforcing that these two
    // photos happened "together" even though the cameras were apart.
    drawHeartAt(ctx, marginX + cardWidth + gap / 2, y + cardHeight / 2, 30, PALETTE.connectorHeart);
  }

  ctx.font = 'bold 34px Inter, Arial, sans-serif';
  ctx.fillStyle = PALETTE.label;
  ctx.textAlign = 'center';
  ctx.fillText('Viktor', marginX + cardWidth / 2, bottomLabelY);
  ctx.fillText('Jericka', marginX + cardWidth + gap + cardWidth / 2, bottomLabelY);

  drawFooter(ctx, { centerX: width / 2, y: footerY, roomId, dayCount, distanceLabel });
}

function computeStripDimensions() {
  const width = 900;
  const headerHeight = 320;
  const footerHeight = 170;
  const framePadding = 60;
  const sideInset = 40;
  const photoWidth = width - framePadding * 2 - sideInset;
  const photoHeight = photoWidth / CARD_ASPECT;
  const gap = 26;
  const roundGap = 40;
  const rounds = 3;

  const stackHeight = rounds * (photoHeight * 2 + gap) + (rounds - 1) * roundGap;
  const height = headerHeight + stackHeight + footerHeight;

  return {
    width,
    height,
    headerHeight,
    footerHeight,
    framePadding,
    photoWidth,
    photoHeight,
    gap,
    roundGap,
    rounds,
    cardX: (width - photoWidth) / 2
  };
}

function drawStripLayout(ctx, dims, payload) {
  const { width, height, headerHeight, framePadding, photoWidth, photoHeight, gap, roundGap, rounds, cardX, footerHeight } = dims;
  const { viktorItems, jerickaItems, message, roomId, handwritingReady, markerReady, dayCount, distanceLabel } = payload;

  drawPageBackground(ctx, width, height);

  const stripX = framePadding;
  const stripWidth = width - framePadding * 2;
  ctx.save();
  ctx.fillStyle = PALETTE.stripBg;
  roundRect(ctx, stripX, 30, stripWidth, height - 60, 34);
  ctx.fill();
  ctx.restore();

  drawScallopedEdges(ctx, stripX, 30, stripWidth, height - 60, PALETTE.bgMid);

  drawHeaderBlock(ctx, {
    centerX: width / 2,
    titleY: 108,
    subtitleY: 150,
    messageY: 205,
    message,
    titleSize: 54,
    subtitleSize: 16,
    messageSize: 32,
    maxMessageWidth: width - 160,
    handwritingReady,
    markerReady
  });

  let y = headerHeight;

  for (let round = 0; round < rounds; round += 1) {
    drawPhotoCard(ctx, viktorItems[round].image, cardX, y, photoWidth, photoHeight, 24, {
      rotationDeg: rotationFor(round * 2) * 0.45,
      washiColor: PALETTE.viktorTape,
      washiAngle: -6,
      caption: viktorItems[round].caption,
      doodles: viktorItems[round].doodles,
      captionColor: PALETTE.viktorInk,
      captionRotationDeg: captionRotationFor(round * 2),
      markerReady
    });
    labelCorner(ctx, cardX, y, 'V', PALETTE.viktorTape, 18);
    y += photoHeight + gap;

    drawPhotoCard(ctx, jerickaItems[round].image, cardX, y, photoWidth, photoHeight, 24, {
      rotationDeg: rotationFor(round * 2 + 1) * 0.45,
      washiColor: PALETTE.jerickaTape,
      washiAngle: 6,
      caption: jerickaItems[round].caption,
      doodles: jerickaItems[round].doodles,
      captionColor: PALETTE.jerickaInk,
      captionRotationDeg: captionRotationFor(round * 2 + 1),
      markerReady
    });
    labelCorner(ctx, cardX, y, 'J', PALETTE.jerickaTape, 18);

    // Heart divider connecting this round's Viktor/Jericka pair.
    drawHeartAt(ctx, width / 2, y - gap / 2, 20, PALETTE.connectorHeart);

    y += photoHeight + roundGap;
  }

  const footerY = height - footerHeight / 2;
  ctx.font = 'bold 26px Inter, Arial, sans-serif';
  ctx.fillStyle = PALETTE.label;
  ctx.textAlign = 'center';
  ctx.fillText('Viktor  ♡  Jericka', width / 2, footerY - 20);

  drawFooter(ctx, { centerX: width / 2, y: footerY + 18, roomId, dayCount, distanceLabel });
}

function computeHeroDimensions() {
  const width = 1600;
  const headerHeight = 350;
  const heroSize = 900;
  const smallGap = 30;
  const smallCount = 5;
  const marginX = 120;
  const smallWidth = (width - marginX * 2 - smallGap * (smallCount - 1)) / smallCount;
  const smallHeight = smallWidth / CARD_ASPECT;
  const rowGap = 60;
  const footerHeight = 140;

  const heroX = (width - heroSize) / 2;
  const heroY = headerHeight;
  const smallY = heroY + heroSize + rowGap;
  const height = smallY + smallHeight + footerHeight;

  return {
    width,
    height,
    headerHeight,
    heroSize,
    heroX,
    heroY,
    smallWidth,
    smallHeight,
    smallGap,
    marginX,
    smallY,
    footerHeight
  };
}

function drawHeroLayout(ctx, dims, payload) {
  const { width, height, heroSize, heroX, heroY, smallWidth, smallHeight, smallGap, marginX, smallY } = dims;
  const { viktorItems, jerickaItems, message, roomId, handwritingReady, markerReady, dayCount, distanceLabel } = payload;

  drawPageBackground(ctx, width, height);

  drawHeaderBlock(ctx, {
    centerX: width / 2,
    titleY: 140,
    subtitleY: 195,
    messageY: 258,
    message,
    titleSize: 90,
    subtitleSize: 26,
    messageSize: 50,
    maxMessageWidth: width - 300,
    handwritingReady,
    markerReady
  });

  const heroOwner = pickHeroOwner(roomId);
  const heroItems = heroOwner === 'viktor' ? viktorItems : jerickaItems;
  const otherItems = heroOwner === 'viktor' ? jerickaItems : viktorItems;
  const otherOwner = heroOwner === 'viktor' ? 'jericka' : 'viktor';
  const heroLabel = heroOwner === 'viktor' ? 'V' : 'J';
  const otherLabel = otherOwner === 'viktor' ? 'V' : 'J';
  const heroColor = heroOwner === 'viktor' ? PALETTE.viktorTape : PALETTE.jerickaTape;
  const otherColor = otherOwner === 'viktor' ? PALETTE.viktorTape : PALETTE.jerickaTape;
  const heroInk = heroOwner === 'viktor' ? PALETTE.viktorInk : PALETTE.jerickaInk;
  const otherInk = otherOwner === 'viktor' ? PALETTE.viktorInk : PALETTE.jerickaInk;

  drawPhotoCard(ctx, heroItems[2].image, heroX, heroY, heroSize, heroSize, 40, {
    rotationDeg: 0,
    washiColor: heroColor,
    washiAngle: -6,
    caption: heroItems[2].caption,
    doodles: heroItems[2].doodles,
    captionColor: heroInk,
    captionRotationDeg: captionRotationFor(2),
    markerReady
  });
  labelCorner(ctx, heroX, heroY, heroLabel, heroColor, 30);

  drawHeartAt(ctx, width / 2, heroY + heroSize + 28, 32, PALETTE.connectorHeart);

  const smallItems = [
    { image: otherItems[0].image, caption: otherItems[0].caption, doodles: otherItems[0].doodles, label: otherLabel, color: otherColor, ink: otherInk },
    { image: otherItems[1].image, caption: otherItems[1].caption, doodles: otherItems[1].doodles, label: otherLabel, color: otherColor, ink: otherInk },
    { image: otherItems[2].image, caption: otherItems[2].caption, doodles: otherItems[2].doodles, label: otherLabel, color: otherColor, ink: otherInk },
    { image: heroItems[0].image, caption: heroItems[0].caption, doodles: heroItems[0].doodles, label: heroLabel, color: heroColor, ink: heroInk },
    { image: heroItems[1].image, caption: heroItems[1].caption, doodles: heroItems[1].doodles, label: heroLabel, color: heroColor, ink: heroInk }
  ];

  smallItems.forEach((item, index) => {
    const x = marginX + index * (smallWidth + smallGap);
    drawPhotoCard(ctx, item.image, x, smallY, smallWidth, smallHeight, 20, {
      rotationDeg: rotationFor(index) * 0.8,
      washiColor: item.color,
      washiAngle: index % 2 === 0 ? -7 : 7,
      caption: item.caption,
      doodles: item.doodles,
      captionColor: item.ink,
      captionRotationDeg: captionRotationFor(index),
      markerReady
    });
    labelCorner(ctx, x, smallY, item.label, item.color, 16);
  });

  const labelY = smallY + smallHeight + 45;
  ctx.font = 'bold 30px Inter, Arial, sans-serif';
  ctx.fillStyle = PALETTE.label;
  ctx.textAlign = 'center';
  ctx.fillText('Viktor  ♡  Jericka', width / 2, labelY);

  drawFooter(ctx, { centerX: width / 2, y: labelY + 45, roomId, dayCount, distanceLabel });
}

export async function generateCollage({
  photos,
  customMessage,
  layout = 'grid',
  roomId = '',
  scale = 1,
  anniversaryDate = '',
  locations = null,
  theme = 'rose',
  exportPreset = 'original'
}) {
  const { viktor, jericka } = splitPhotosByOwner(photos);
  const { viktorItems, jerickaItems } = await loadOwnerImages(viktor, jericka);
  const handwritingReady = await ensureHandwritingFont();
  const markerReady = await ensureMarkerFont();

  const message = customMessage || 'Our little photobooth memory';
  const dayCount = daysTogether(anniversaryDate);
  const km = locations ? distanceBetween(locations.viktor, locations.jericka) : null;
  const distanceLabel = km != null ? formatDistanceKm(km) : '';
  const payload = { viktorItems, jerickaItems, message, roomId, handwritingReady, markerReady, dayCount, distanceLabel };

  let dims;
  let drawFn;

  if (layout === 'strip') {
    dims = computeStripDimensions();
    drawFn = drawStripLayout;
  } else if (layout === 'hero') {
    dims = computeHeroDimensions();
    drawFn = drawHeroLayout;
  } else {
    dims = computeGridDimensions();
    drawFn = drawGridLayout;
  }

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const safeScale = clamp(scale, 1, 3);

  canvas.width = Math.round(dims.width * safeScale);
  canvas.height = Math.round(dims.height * safeScale);
  ctx.scale(safeScale, safeScale);

  // Set immediately before the (synchronous) drawing pass, so all the
  // awaits above can't interleave another generation's palette into ours.
  PALETTE = findTheme(theme).palette;

  drawFn(ctx, dims, payload);
  applyFilmGrain(ctx, dims.width, dims.height);

  const exported = fitOntoAspect(canvas, findExportPreset(exportPreset).aspect);

  const blob = await new Promise((resolve, reject) => {
    exported.toBlob(
      (result) => {
        if (result) {
          resolve(result);
        } else {
          reject(new Error('Could not export collage.'));
        }
      },
      'image/png',
      1
    );
  });

  return {
    blob,
    previewUrl: URL.createObjectURL(blob)
  };
}