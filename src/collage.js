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
  connectorHeart: '#c7345a'
};

// Portrait selfies get cropped biased toward the top third instead of dead
// center, so faces held above chin-height aren't chopped off.
const CROP_TOP_BIAS = 0.28;

// Photos are normalized toward this average luminance (0-255) so a bright
// daytime webcam shot and a dim nighttime phone selfie feel like they belong
// to the same memory instead of two different apps.
const TARGET_BRIGHTNESS = 150;

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

function drawPhotoCard(ctx, image, x, y, width, height, radius) {
  ctx.save();
  ctx.shadowColor = PALETTE.cardShadow;
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x - 16, y - 16, width + 32, height + 32, radius + 16);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, x, y, width, height, radius);
  ctx.clip();

  const filter = brightnessFilterFor(image);
  ctx.filter = `brightness(${filter}) saturate(1.06) contrast(1.02)`;
  drawCoverImage(ctx, image, x, y, width, height);
  ctx.filter = 'none';

  // Faint warm tint so a cold, dim photo still reads as part of the same
  // rose-toned memory as a bright one.
  ctx.globalAlpha = 0.08;
  ctx.fillStyle = '#e85d85';
  ctx.fillRect(x, y, width, height);
  ctx.globalAlpha = 1;

  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.92)';
  ctx.lineWidth = 10;
  roundRect(ctx, x + 4, y + 4, width - 8, height - 8, radius - 6);
  ctx.stroke();
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
    const topY = height * 0.075 + (index % 2) * height * 0.02;
    const bottomY = height * 0.955 - (index % 2) * height * 0.02;
    const x = width * (0.09 + index * (0.82 / (hearts.length - 1)));
    ctx.fillText(heart, x, topY);
    ctx.fillText(heart, x, bottomY);
  });

  ctx.restore();
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
  maxMessageWidth
}) {
  ctx.textAlign = 'center';

  ctx.fillStyle = PALETTE.title;
  ctx.font = `bold ${titleSize}px Georgia, serif`;
  ctx.fillText('Viktor & Jericka', centerX, titleY);

  ctx.fillStyle = PALETTE.subtitle;
  ctx.font = `bold ${subtitleSize}px Inter, Arial, sans-serif`;
  fillTextSpaced(ctx, 'MADE WITH LOVE, EVEN FROM FAR AWAY', centerX, subtitleY, subtitleSize * 0.22);

  // The custom message is the most personal line, so it gets its own
  // italic voice and a heart on either side instead of blending into the
  // rest of the header copy.
  let messageText = message;
  ctx.font = `italic 600 ${messageSize}px Georgia, serif`;
  while (ctx.measureText(messageText).width > maxMessageWidth && messageText.length > 6) {
    messageText = `${messageText.slice(0, messageText.length - 5).trim()}…`;
  }

  const textWidth = ctx.measureText(messageText).width;
  ctx.fillStyle = PALETTE.message;
  ctx.fillText(messageText, centerX, messageY);

  const heartOffset = textWidth / 2 + messageSize * 0.85;
  drawHeartAt(ctx, centerX - heartOffset, messageY - messageSize * 0.32, messageSize * 0.5, PALETTE.message);
  drawHeartAt(ctx, centerX + heartOffset, messageY - messageSize * 0.32, messageSize * 0.5, PALETTE.message);
}

function drawFooter(ctx, { centerX, y, roomId }) {
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.meta;
  ctx.font = '26px Inter, Arial, sans-serif';

  const stamp = roomId ? `Booth ${roomId}  ·  ${formatDate()}` : formatDate();
  ctx.fillText(stamp, centerX, y);
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

function drawGridLayout(ctx, canvas, { viktorImages, jerickaImages, message, roomId }) {
  canvas.width = 1600;
  canvas.height = 2400;

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, PALETTE.bgTop);
  gradient.addColorStop(0.55, PALETTE.bgMid);
  gradient.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawHeartConfetti(ctx, canvas.width, canvas.height);

  drawHeaderBlock(ctx, {
    centerX: 800,
    titleY: 135,
    subtitleY: 188,
    messageY: 246,
    message,
    titleSize: 84,
    subtitleSize: 30,
    messageSize: 40,
    maxMessageWidth: 1100
  });

  const marginX = 120;
  const gap = 50;
  const top = 330;
  const cardWidth = (canvas.width - marginX * 2 - gap) / 2;
  const cardHeight = 560;
  const radius = 36;

  for (let row = 0; row < 3; row += 1) {
    const y = top + row * (cardHeight + gap);

    const viktorX = marginX;
    const jerickaX = marginX + cardWidth + gap;

    drawPhotoCard(ctx, viktorImages[row], viktorX, y, cardWidth, cardHeight, radius);
    drawPhotoCard(ctx, jerickaImages[row], jerickaX, y, cardWidth, cardHeight, radius);

    // A small heart bridging each round's pair, reinforcing that these two
    // photos happened "together" even though the cameras were apart.
    drawHeartAt(ctx, marginX + cardWidth + gap / 2, y + cardHeight / 2, 30, PALETTE.connectorHeart);
  }

  const bottomLabelY = top + 3 * cardHeight + 2 * gap + 35;
  ctx.font = 'bold 34px Inter, Arial, sans-serif';
  ctx.fillStyle = PALETTE.label;
  ctx.textAlign = 'center';
  ctx.fillText('Viktor', marginX + cardWidth / 2, bottomLabelY);
  ctx.fillText('Jericka', marginX + cardWidth + gap + cardWidth / 2, bottomLabelY);

  drawFooter(ctx, { centerX: 800, y: bottomLabelY + 55, roomId });
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

function labelCorner(ctx, x, y, letter, color) {
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = color;
  ctx.arc(x + 30, y + 30, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px Inter, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, x + 30, y + 31);
  ctx.restore();
}

function drawStripLayout(ctx, canvas, { viktorImages, jerickaImages, message, roomId }) {
  const width = 900;
  const headerHeight = 300;
  const footerHeight = 170;
  const framePadding = 60;
  const photoWidth = width - framePadding * 2 - 40;
  const photoHeight = 300;
  const gap = 22;
  const roundGap = 34;
  const rounds = 3;

  const height = headerHeight
    + rounds * (photoHeight * 2 + gap + roundGap)
    - roundGap
    + footerHeight;

  canvas.width = width;
  canvas.height = height;

  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, PALETTE.bgTop);
  gradient.addColorStop(0.55, PALETTE.bgMid);
  gradient.addColorStop(1, PALETTE.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  drawHeartConfetti(ctx, width, height);

  // The strip card itself: a lighter panel inset from the page, edged with
  // scalloped notches like a classic photobooth strip.
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
    messageY: 198,
    message,
    titleSize: 52,
    subtitleSize: 18,
    messageSize: 26,
    maxMessageWidth: width - 160
  });

  const cardX = (width - photoWidth) / 2;
  const radius = 26;
  let y = headerHeight;

  for (let round = 0; round < rounds; round += 1) {
    drawPhotoCard(ctx, viktorImages[round], cardX, y, photoWidth, photoHeight, radius);
    labelCorner(ctx, cardX, y, 'V', PALETTE.connectorHeart);
    y += photoHeight + gap;

    drawPhotoCard(ctx, jerickaImages[round], cardX, y, photoWidth, photoHeight, radius);
    labelCorner(ctx, cardX, y, 'J', PALETTE.connectorHeart);

    // Heart divider connecting this round's Viktor/Jericka pair.
    drawHeartAt(ctx, width / 2, y - gap / 2, 22, PALETTE.connectorHeart);

    y += photoHeight + roundGap;
  }

  const footerY = height - footerHeight / 2;
  ctx.font = 'bold 28px Inter, Arial, sans-serif';
  ctx.fillStyle = PALETTE.label;
  ctx.textAlign = 'center';
  ctx.fillText('Viktor  ♡  Jericka', width / 2, footerY - 22);

  drawFooter(ctx, { centerX: width / 2, y: footerY + 20, roomId });
}

export async function generateCollage({ photos, customMessage, layout = 'grid', roomId = '' }) {
  const { viktor, jericka } = splitPhotosByOwner(photos);
  const { viktorImages, jerickaImages } = await loadOwnerImages(viktor, jericka);

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const message = customMessage || 'Our little photobooth memory';

  const payload = { viktorImages, jerickaImages, message, roomId };

  if (layout === 'strip') {
    drawStripLayout(ctx, canvas, payload);
  } else {
    drawGridLayout(ctx, canvas, payload);
  }

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