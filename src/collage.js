import { formatDate, clamp } from './utils.js';

const PALETTE = {
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
  connectorHeart: '#c7345a',
  viktorTape: '#3f7fb8',
  jerickaTape: '#c7345a'
};

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

const HANDWRITING_FONT = '"Caveat", cursive';
let handwritingFontPromise = null;

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

// Draws one photo as a small "instant photo" card: white polaroid-style
// frame with a thicker caption margin at the bottom, a slight deterministic
// tilt, and an optional washi-tape accent tinted to the photo's owner.
function drawPhotoCard(ctx, image, x, y, width, height, radius, options = {}) {
  const { rotationDeg = 0, washiColor = null, washiAngle = -6 } = options;

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
  ctx.fillStyle = '#ffffff';
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
  ctx.filter = `brightness(${filter}) saturate(1.06) contrast(1.02)`;
  drawCoverImage(ctx, image, innerX, innerY, innerWidth, innerHeight);
  ctx.filter = 'none';

  // Faint warm tint so a cold, dim photo still reads as part of the same
  // rose-toned memory as a bright one.
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#e85d85';
  ctx.fillRect(innerX, innerY, innerWidth, innerHeight);
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(190, 140, 150, 0.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, innerX + 1, innerY + 1, innerWidth - 2, innerHeight - 2, innerRadius);
  ctx.stroke();
  ctx.restore();

  if (washiColor) {
    drawWashiTape(ctx, x + width / 2, y, width, washiColor, washiAngle);
  }

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

function drawPageBackground(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, PALETTE.bgTop);
  gradient.addColorStop(0.55, PALETTE.bgMid);
  gradient.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawHeartConfetti(ctx, width, height);
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
  handwritingReady
}) {
  ctx.textAlign = 'center';

  // The title is the one element that should dominate the header — bigger
  // and bolder than everything else around it.
  ctx.fillStyle = PALETTE.title;
  ctx.font = `bold ${titleSize}px Georgia, serif`;
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

function drawFooter(ctx, { centerX, y, roomId }) {
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.meta;
  ctx.font = '26px Inter, Arial, sans-serif';

  const stamp = roomId ? `Booth ${roomId}  ·  ${formatDate()}` : formatDate();
  ctx.fillText(stamp, centerX, y);
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

function splitPhotosByOwner(photos) {
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

async function loadImageFromUrl(url) {
  if (!url) {
    throw new Error('Missing photo download URL.');
  }

  let response;

  try {
    response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store'
    });
  } catch (error) {
    throw new Error('Could not fetch one uploaded photo from Firebase Storage. This is most likely a Storage CORS issue.');
  }

  if (!response.ok) {
    throw new Error(`Could not load one uploaded photo. Storage returned HTTP ${response.status}.`);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode one uploaded photo as an image.'));
    };

    image.src = objectUrl;
  });
}

async function loadOwnerImages(viktorPhotos, jerickaPhotos) {
  // Loaded sequentially, not all 6 at once. This is more stable on mobile.
  const viktorImages = [];
  for (const photo of viktorPhotos) {
    viktorImages.push(await loadImageFromUrl(photo.downloadUrl));
  }

  const jerickaImages = [];
  for (const photo of jerickaPhotos) {
    jerickaImages.push(await loadImageFromUrl(photo.downloadUrl));
  }

  return { viktorImages, jerickaImages };
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
  const { viktorImages, jerickaImages, message, roomId, handwritingReady } = payload;

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
    handwritingReady
  });

  for (let row = 0; row < 3; row += 1) {
    const y = top + row * (cardHeight + gap);
    const viktorX = marginX;
    const jerickaX = marginX + cardWidth + gap;

    drawPhotoCard(ctx, viktorImages[row], viktorX, y, cardWidth, cardHeight, 32, {
      rotationDeg: rotationFor(row * 2),
      washiColor: PALETTE.viktorTape,
      washiAngle: row % 2 === 0 ? -7 : 6
    });
    drawPhotoCard(ctx, jerickaImages[row], jerickaX, y, cardWidth, cardHeight, 32, {
      rotationDeg: rotationFor(row * 2 + 1),
      washiColor: PALETTE.jerickaTape,
      washiAngle: row % 2 === 0 ? 7 : -6
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

  drawFooter(ctx, { centerX: width / 2, y: footerY, roomId });
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
  const { viktorImages, jerickaImages, message, roomId, handwritingReady } = payload;

  drawPageBackground(ctx, width, height);

  const stripX = framePadding;
  const stripWidth = width - framePadding * 2;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
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
    handwritingReady
  });

  let y = headerHeight;

  for (let round = 0; round < rounds; round += 1) {
    drawPhotoCard(ctx, viktorImages[round], cardX, y, photoWidth, photoHeight, 24, {
      rotationDeg: rotationFor(round * 2) * 0.45,
      washiColor: PALETTE.viktorTape,
      washiAngle: -6
    });
    labelCorner(ctx, cardX, y, 'V', PALETTE.viktorTape, 18);
    y += photoHeight + gap;

    drawPhotoCard(ctx, jerickaImages[round], cardX, y, photoWidth, photoHeight, 24, {
      rotationDeg: rotationFor(round * 2 + 1) * 0.45,
      washiColor: PALETTE.jerickaTape,
      washiAngle: 6
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

  drawFooter(ctx, { centerX: width / 2, y: footerY + 18, roomId });
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
  const { viktorImages, jerickaImages, message, roomId, handwritingReady } = payload;

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
    handwritingReady
  });

  const heroOwner = pickHeroOwner(roomId);
  const heroImages = heroOwner === 'viktor' ? viktorImages : jerickaImages;
  const otherImages = heroOwner === 'viktor' ? jerickaImages : viktorImages;
  const otherOwner = heroOwner === 'viktor' ? 'jericka' : 'viktor';
  const heroLabel = heroOwner === 'viktor' ? 'V' : 'J';
  const otherLabel = otherOwner === 'viktor' ? 'V' : 'J';
  const heroColor = heroOwner === 'viktor' ? PALETTE.viktorTape : PALETTE.jerickaTape;
  const otherColor = otherOwner === 'viktor' ? PALETTE.viktorTape : PALETTE.jerickaTape;

  drawPhotoCard(ctx, heroImages[2], heroX, heroY, heroSize, heroSize, 40, {
    rotationDeg: 0,
    washiColor: heroColor,
    washiAngle: -6
  });
  labelCorner(ctx, heroX, heroY, heroLabel, heroColor, 30);

  drawHeartAt(ctx, width / 2, heroY + heroSize + 28, 32, PALETTE.connectorHeart);

  const smallItems = [
    { image: otherImages[0], label: otherLabel, color: otherColor },
    { image: otherImages[1], label: otherLabel, color: otherColor },
    { image: otherImages[2], label: otherLabel, color: otherColor },
    { image: heroImages[0], label: heroLabel, color: heroColor },
    { image: heroImages[1], label: heroLabel, color: heroColor }
  ];

  smallItems.forEach((item, index) => {
    const x = marginX + index * (smallWidth + smallGap);
    drawPhotoCard(ctx, item.image, x, smallY, smallWidth, smallHeight, 20, {
      rotationDeg: rotationFor(index) * 0.8,
      washiColor: item.color,
      washiAngle: index % 2 === 0 ? -7 : 7
    });
    labelCorner(ctx, x, smallY, item.label, item.color, 16);
  });

  const labelY = smallY + smallHeight + 45;
  ctx.font = 'bold 30px Inter, Arial, sans-serif';
  ctx.fillStyle = PALETTE.label;
  ctx.textAlign = 'center';
  ctx.fillText('Viktor  ♡  Jericka', width / 2, labelY);

  drawFooter(ctx, { centerX: width / 2, y: labelY + 45, roomId });
}

export async function generateCollage({ photos, customMessage, layout = 'grid', roomId = '', scale = 1 }) {
  const { viktor, jericka } = splitPhotosByOwner(photos);
  const { viktorImages, jerickaImages } = await loadOwnerImages(viktor, jericka);
  const handwritingReady = await ensureHandwritingFont();

  const message = customMessage || 'Our little photobooth memory';
  const payload = { viktorImages, jerickaImages, message, roomId, handwritingReady };

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

  drawFn(ctx, dims, payload);
  applyFilmGrain(ctx, dims.width, dims.height);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
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