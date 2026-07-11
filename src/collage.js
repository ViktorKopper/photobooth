import { formatDate } from './utils.js';

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
    sourceY = (image.height - sourceHeight) / 2;
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

function getOrderedPhotos(photos, layout) {
  const viktor = photos
    .filter((photo) => photo.owner === 'viktor')
    .sort((a, b) => a.index - b.index);

  const jericka = photos
    .filter((photo) => photo.owner === 'jericka')
    .sort((a, b) => a.index - b.index);

  if (viktor.length !== 3 || jericka.length !== 3) {
    throw new Error('Both Viktor and Jericka need exactly 3 photos before generating the collage.');
  }

  if (layout === 'paired') {
    return [viktor[0], jericka[0], viktor[1], jericka[1], viktor[2], jericka[2]];
  }

  return [viktor[0], jericka[0], viktor[1], jericka[1], viktor[2], jericka[2]];
}

async function loadImagesSequentially(orderedPhotos) {
  const images = [];

  for (const photo of orderedPhotos) {
    images.push(await loadImageFromUrl(photo.downloadUrl));
  }

  return images;
}

export async function generateCollage({ photos, customMessage, layout = 'columns' }) {
  const orderedPhotos = getOrderedPhotos(photos, layout);

  // Load sequentially, not all 6 at once. This is more stable on mobile.
  const loadedImages = await loadImagesSequentially(orderedPhotos);

  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 2400;

  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, 1600, 2400);
  gradient.addColorStop(0, '#fff7f4');
  gradient.addColorStop(0.55, '#ffe7ec');
  gradient.addColorStop(1, '#fffdf8');

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = '#d94d72';
  ctx.font = '72px Georgia, serif';

  ['♡', '♥', '♡', '♥', '♡'].forEach((heart, index) => {
    ctx.fillText(heart, 110 + index * 320, 180 + (index % 2) * 60);
    ctx.fillText(heart, 90 + index * 330, 2260 - (index % 2) * 80);
  });

  ctx.restore();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#5a2a35';
  ctx.font = 'bold 84px Georgia, serif';
  ctx.fillText('Viktor & Jericka', 800, 135);

  ctx.font = '38px Inter, Arial, sans-serif';
  ctx.fillStyle = '#8b4a5a';
  ctx.fillText('Made with love, even from far away', 800, 195);

  const message = customMessage || 'Our little photobooth memory';
  ctx.font = '34px Inter, Arial, sans-serif';
  ctx.fillStyle = '#a75d6f';
  ctx.fillText(message, 800, 250);

  const marginX = 120;
  const gap = 50;
  const top = 330;
  const cardWidth = (1600 - marginX * 2 - gap) / 2;
  const cardHeight = 560;
  const radius = 36;

  loadedImages.forEach((image, index) => {
    const row = Math.floor(index / 2);
    const col = index % 2;

    const x = marginX + col * (cardWidth + gap);
    const y = top + row * (cardHeight + gap);

    ctx.save();
    ctx.shadowColor = 'rgba(88, 40, 50, 0.22)';
    ctx.shadowBlur = 28;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x - 18, y - 18, cardWidth + 36, cardHeight + 36, radius + 18);
    ctx.fill();
    ctx.restore();

    ctx.save();
    roundRect(ctx, x, y, cardWidth, cardHeight, radius);
    ctx.clip();
    drawCoverImage(ctx, image, x, y, cardWidth, cardHeight);
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.92)';
    ctx.lineWidth = 12;
    roundRect(ctx, x + 4, y + 4, cardWidth - 8, cardHeight - 8, radius - 6);
    ctx.stroke();
    ctx.restore();
  });

  ctx.fillStyle = '#7b3d4b';
  ctx.font = 'bold 34px Inter, Arial, sans-serif';
  ctx.fillText('Viktor', 120 + cardWidth / 2, 2225);
  ctx.fillText('Jericka', 120 + cardWidth + gap + cardWidth / 2, 2225);

  ctx.font = '30px Inter, Arial, sans-serif';
  ctx.fillStyle = '#9c6672';
  ctx.fillText(formatDate(), 800, 2290);

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