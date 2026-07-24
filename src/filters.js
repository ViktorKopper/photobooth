// Filter presets applied to captured photos. Each preset is described as an
// ordered list of primitive operations instead of a raw CSS `filter` string,
// so the exact same definition can drive both the live camera preview (fast,
// via CSS `filter` on the <video> element — universally supported for live
// rendering) and the actual pixel baking at capture time (manual per-pixel
// math below). Baking is deliberately NOT done via the canvas 2D `filter`
// property: support and behavior for that property is inconsistent enough
// across mobile Safari/WebViews — and especially unreliable when the
// drawImage() source is a live <video> element — that a photo can visibly
// match the live preview on screen while the saved/uploaded file quietly
// isn't filtered at all. Plain ImageData math has no such gaps.
export const FILTERS = [
  { id: 'none', label: 'Original', ops: [] },
  {
    id: 'warm',
    label: 'Teplý',
    ops: [
      { type: 'sepia', amount: 0.25 },
      { type: 'saturate', amount: 1.3 },
      { type: 'brightness', amount: 1.05 }
    ]
  },
  {
    id: 'bw',
    label: 'Čiernobiely',
    ops: [
      { type: 'grayscale', amount: 1 },
      { type: 'contrast', amount: 1.1 }
    ]
  },
  {
    id: 'vintage',
    label: 'Vintage',
    ops: [
      { type: 'sepia', amount: 0.35 },
      { type: 'contrast', amount: 0.9 },
      { type: 'brightness', amount: 1.05 },
      { type: 'saturate', amount: 0.85 }
    ]
  },
  {
    id: 'cool',
    label: 'Studený',
    ops: [
      { type: 'hueRotate', amount: -8 },
      { type: 'saturate', amount: 1.15 },
      { type: 'brightness', amount: 1.02 }
    ]
  }
];

export function findFilter(id) {
  return FILTERS.find((filter) => filter.id === id) || FILTERS[0];
}

// Renders an ops list back into a CSS `filter` shorthand string, for the
// live <video> preview.
export function cssFromOps(ops) {
  if (!ops || !ops.length) return 'none';

  const parts = ops
    .map((op) => {
      switch (op.type) {
        case 'sepia':
          return `sepia(${op.amount})`;
        case 'grayscale':
          return `grayscale(${op.amount})`;
        case 'saturate':
          return `saturate(${op.amount})`;
        case 'brightness':
          return `brightness(${op.amount})`;
        case 'contrast':
          return `contrast(${op.amount})`;
        case 'hueRotate':
          return `hue-rotate(${op.amount}deg)`;
        default:
          return '';
      }
    })
    .filter(Boolean);

  return parts.length ? parts.join(' ') : 'none';
}

function clamp255(value) {
  if (value < 0) return 0;
  if (value > 255) return 255;
  return value;
}

function applyBrightness(data, amount) {
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] * amount);
    data[i + 1] = clamp255(data[i + 1] * amount);
    data[i + 2] = clamp255(data[i + 2] * amount);
  }
}

function applyContrast(data, amount) {
  const intercept = 128 * (1 - amount);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp255(data[i] * amount + intercept);
    data[i + 1] = clamp255(data[i + 1] * amount + intercept);
    data[i + 2] = clamp255(data[i + 2] * amount + intercept);
  }
}

function applyMatrix(data, m) {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = clamp255(m[0] * r + m[1] * g + m[2] * b);
    data[i + 1] = clamp255(m[3] * r + m[4] * g + m[5] * b);
    data[i + 2] = clamp255(m[6] * r + m[7] * g + m[8] * b);
  }
}

// Saturate/grayscale/sepia/hue-rotate matrices below match the exact
// coefficients defined by the CSS Filter Effects Module Level 1 spec, so
// baked photos line up visually with what the CSS-filtered live preview
// showed.
function applySaturate(data, amount) {
  const s = amount;
  applyMatrix(data, [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s
  ]);
}

function applyGrayscale(data, amount) {
  applySaturate(data, 1 - amount);
}

function applySepia(data, amount) {
  const a = 1 - amount;
  applyMatrix(data, [
    0.393 + 0.607 * a, 0.769 - 0.769 * a, 0.189 - 0.189 * a,
    0.349 - 0.349 * a, 0.686 + 0.314 * a, 0.168 - 0.168 * a,
    0.272 - 0.272 * a, 0.534 - 0.534 * a, 0.131 + 0.869 * a
  ]);
}

function applyHueRotate(data, deg) {
  const angle = (deg * Math.PI) / 180;
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  applyMatrix(data, [
    0.213 + cosA * 0.787 - sinA * 0.213, 0.715 - cosA * 0.715 - sinA * 0.715, 0.072 - cosA * 0.072 + sinA * 0.928,
    0.213 - cosA * 0.213 + sinA * 0.143, 0.715 + cosA * 0.285 + sinA * 0.140, 0.072 - cosA * 0.072 - sinA * 0.283,
    0.213 - cosA * 0.213 - sinA * 0.787, 0.715 - cosA * 0.715 + sinA * 0.715, 0.072 + cosA * 0.928 + sinA * 0.072
  ]);
}

// Bakes the given ops into raw pixel data in place, in the same left-to-right
// order they'd appear in an equivalent CSS `filter` shorthand.
export function bakeOpsIntoImageData(imageData, ops) {
  if (!ops || !ops.length) return;
  const data = imageData.data;

  ops.forEach((op) => {
    switch (op.type) {
      case 'brightness':
        applyBrightness(data, op.amount);
        break;
      case 'contrast':
        applyContrast(data, op.amount);
        break;
      case 'saturate':
        applySaturate(data, op.amount);
        break;
      case 'grayscale':
        applyGrayscale(data, op.amount);
        break;
      case 'sepia':
        applySepia(data, op.amount);
        break;
      case 'hueRotate':
        applyHueRotate(data, op.amount);
        break;
      default:
        break;
    }
  });
}
