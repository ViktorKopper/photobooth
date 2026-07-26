// "Put this on your home screen" — the last section of the guide.
//
// Worth spelling out because the install flow is genuinely undiscoverable and
// differs per platform, and because on iOS it is not merely cosmetic: notifications
// are refused entirely until the app has been installed, so a synced countdown
// silently never notifies anyone who skipped this.
//
// The pictures are drawn inline rather than screenshotted. Screenshots of a
// browser UI age badly, need one set per platform per OS version, and would be
// the only binary assets in the whole project. These are the same stroked style
// as the icon set, cost nothing to download, and adapt to the dark theme.

import { ICONS } from '../icons.js';
import { escapeHtml } from '../ui/html.js';

/* --------------------------------------------------------------- platform */

export function detectPlatform(ua = navigator.userAgent, nav = navigator) {
  // iPadOS 13+ reports itself as a Mac, and the touch point count is the only
  // reliable way to tell an iPad from a laptop.
  const iPadPretendingToBeAMac = /Macintosh/.test(ua) && nav.maxTouchPoints > 1;

  if (/iPhone|iPad|iPod/.test(ua) || iPadPretendingToBeAMac) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

export function isInstalled(win = window, nav = navigator) {
  // `standalone` is the old iOS-only flag; display-mode covers everyone else.
  return Boolean(nav.standalone) || Boolean(win.matchMedia?.('(display-mode: standalone)')?.matches);
}

/* ----------------------------------------------------------- illustrations */

// A phone outline that the little scenes below are drawn inside.
const phone = (inner, label) => `
  <svg class="install-figure" viewBox="0 0 104 150" role="img" aria-label="${escapeHtml(label)}">
    <rect x="6" y="4" width="92" height="142" rx="12" class="install-body" />
    <rect x="38" y="9" width="28" height="4" rx="2" class="install-notch" />
    ${inner}
  </svg>
`;

// Step 1, iOS: the share button in Safari's bottom bar.
const iosShare = phone(
  `
    <rect x="14" y="22" width="76" height="92" rx="5" class="install-screen" />
    <path d="M34 52h36M34 62h28M34 72h32" class="install-line" />
    <rect x="14" y="120" width="76" height="20" rx="5" class="install-bar" />
    <circle cx="52" cy="130" r="10" class="install-mark" />
    <path d="M52 126v8M48.5 129l3.5-3.5 3.5 3.5" class="install-glyph" />
    <rect x="47" y="132" width="10" height="4" rx="1" class="install-glyph" />
  `,
  'Step 1: the share button in the browser toolbar'
);

// Step 2: the "Add to Home Screen" row inside the sheet.
const addRow = phone(
  `
    <rect x="14" y="46" width="76" height="94" rx="6" class="install-sheet" />
    <rect x="22" y="54" width="60" height="7" rx="3" class="install-line-fill" />
    <rect x="22" y="68" width="60" height="7" rx="3" class="install-line-fill" />
    <rect x="18" y="82" width="68" height="18" rx="4" class="install-mark" />
    <path d="M28 91h10M33 86v10" class="install-glyph" />
    <rect x="44" y="88" width="34" height="6" rx="3" class="install-glyph-fill" />
    <rect x="22" y="108" width="60" height="7" rx="3" class="install-line-fill" />
  `,
  'Step 2: choosing Add to Home Screen'
);

// Step 3: the finished icon sitting on the home screen.
const homeIcon = phone(
  `
    <rect x="14" y="22" width="76" height="118" rx="5" class="install-screen" />
    <rect x="22" y="34" width="22" height="22" rx="6" class="install-tile" />
    <rect x="52" y="34" width="22" height="22" rx="6" class="install-tile" />
    <rect x="22" y="66" width="22" height="22" rx="6" class="install-mark" />
    <path d="M33 82c-3.4-2.6-6-4.8-6-7.4a3 3 0 0 1 6-1.4 3 3 0 0 1 6 1.4c0 2.6-2.6 4.8-6 7.4z" class="install-glyph" />
    <rect x="52" y="66" width="22" height="22" rx="6" class="install-tile" />
  `,
  'Step 3: the booth on your home screen'
);

// Android and desktop both start from a menu rather than a share sheet.
const menuButton = phone(
  `
    <rect x="14" y="34" width="76" height="106" rx="5" class="install-screen" />
    <rect x="14" y="18" width="76" height="14" rx="4" class="install-bar" />
    <rect x="20" y="23" width="46" height="4" rx="2" class="install-line-fill" />
    <circle cx="80" cy="21" r="1.8" class="install-glyph-fill" />
    <circle cx="80" cy="25" r="1.8" class="install-glyph-fill" />
    <circle cx="80" cy="29" r="1.8" class="install-glyph-fill" />
    <circle cx="80" cy="25" r="9" class="install-mark-ring" />
  `,
  'Step 1: the browser menu button'
);

const installRow = phone(
  `
    <rect x="34" y="22" width="56" height="86" rx="5" class="install-sheet" />
    <rect x="40" y="30" width="44" height="6" rx="3" class="install-line-fill" />
    <rect x="40" y="42" width="44" height="6" rx="3" class="install-line-fill" />
    <rect x="37" y="54" width="50" height="16" rx="4" class="install-mark" />
    <path d="M45 59v6M42.5 62.5l2.5 2.5 2.5-2.5" class="install-glyph" />
    <rect x="53" y="59" width="28" height="6" rx="3" class="install-glyph-fill" />
    <rect x="40" y="78" width="44" height="6" rx="3" class="install-line-fill" />
    <rect x="40" y="90" width="44" height="6" rx="3" class="install-line-fill" />
  `,
  'Step 2: choosing Install app'
);

const desktopWindow = `
  <svg class="install-figure" viewBox="0 0 104 150" role="img" aria-label="Step 1: the install button in the address bar">
    <rect x="4" y="26" width="96" height="98" rx="8" class="install-body" />
    <rect x="10" y="32" width="84" height="14" rx="4" class="install-bar" />
    <rect x="16" y="37" width="46" height="4" rx="2" class="install-line-fill" />
    <circle cx="80" cy="39" r="8" class="install-mark" />
    <path d="M80 35v6M77.5 38.5l2.5 2.5 2.5-2.5" class="install-glyph" />
    <rect x="10" y="52" width="84" height="66" rx="4" class="install-screen" />
    <path d="M22 70h60M22 80h44M22 90h52" class="install-line" />
  </svg>
`;

/* ------------------------------------------------------------------ steps */

const PLATFORMS = {
  ios: {
    label: 'iPhone / iPad',
    // Worth stating plainly: on iOS only Safari can install, and people
    // routinely try it from Chrome and conclude the app is broken.
    caveat: 'It has to be Safari — no other browser on iOS is allowed to install a web app.',
    figures: [iosShare, addRow, homeIcon],
    steps: [
      'Open the booth in Safari and tap the share button in the bottom bar.',
      'Scroll down the sheet and tap "Add to Home Screen".',
      'Tap "Add". The booth now sits with your other apps.'
    ]
  },
  android: {
    label: 'Android',
    caveat: '',
    figures: [menuButton, installRow, homeIcon],
    steps: [
      'Open the booth in Chrome and tap the ⋮ menu, top right.',
      'Tap "Install app", or "Add to Home screen" on older versions.',
      'Confirm. The booth now sits with your other apps.'
    ]
  },
  desktop: {
    label: 'Computer',
    caveat: 'Chrome or Edge. Firefox and Safari on a Mac cannot install web apps.',
    figures: [desktopWindow, installRow],
    steps: [
      'Look for the small install icon at the right-hand end of the address bar and click it.',
      'No icon? Open the ⋮ menu and look for "Install" — some versions bury it under "Cast, save and share".'
    ]
  }
};

function panelFor(id) {
  const platform = PLATFORMS[id];

  const figures = platform.figures
    .map((figure, index) => `<div class="install-step-figure"><span class="install-step-number">${index + 1}</span>${figure}</div>`)
    .join('');

  const steps = platform.steps.map((text) => `<li>${escapeHtml(text)}</li>`).join('');

  return `
    <div class="install-panel" data-install-panel="${id}" hidden>
      <div class="install-figures">${figures}</div>
      <ol class="guide-steps">${steps}</ol>
      ${platform.caveat ? `<p class="install-caveat">${ICONS.pin} ${escapeHtml(platform.caveat)}</p>` : ''}
    </div>
  `;
}

export function buildInstallSection({ platform = detectPlatform(), installed = isInstalled() } = {}) {
  if (installed) {
    return `
      <p class="install-done">${ICONS.heartFilled} You're running the installed app — nothing to do here.</p>
      <p>Notifications, full screen and a proper icon are all already active.</p>
    `;
  }

  const chosen = PLATFORMS[platform] ? platform : 'desktop';

  const tabs = Object.entries(PLATFORMS)
    .map(
      ([id, { label }]) =>
        `<button type="button" class="segmented-option${id === chosen ? ' active' : ''}" data-install-tab="${id}">${escapeHtml(label)}</button>`
    )
    .join('');

  return `
    <p class="guide-lead">Installed, the booth opens full screen with its own icon and no address bar — and on iPhone it is the only way notifications work at all.</p>

    <div class="segmented install-tabs" role="group" aria-label="Your device">${tabs}</div>

    ${Object.keys(PLATFORMS).map(panelFor).join('')}
  `;
}

// Shows the panel for the chosen device. Called once on mount and again on each
// tab press, so the initial selection and a later one take the same path.
function showPanel(root, id) {
  root.querySelectorAll('[data-install-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.installPanel !== id;
  });
  root.querySelectorAll('[data-install-tab]').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.installTab === id);
  });
}

export function wireInstallSection(root = document) {
  const tabs = root.querySelector('.install-tabs');
  if (!tabs) return;

  showPanel(root, tabs.querySelector('.active')?.dataset.installTab || 'desktop');

  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-install-tab]');
    if (tab) showPanel(root, tab.dataset.installTab);
  });
}
