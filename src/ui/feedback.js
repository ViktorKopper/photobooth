// Everything the app does at the moment of capture, and at the moment the
// booth is finished: the shutter's flash, click and haptic tap, and the
// celebration when the sixth photo lands.
//
// The confetti is hand-rolled rather than pulled from a library — it is one
// animation, used once per booth, and a dependency for that would outweigh
// the code it saved.

import { showToast } from './toast.js';
import { prefersReducedMotion } from './motion.js';

// Created lazily and shared: browsers cap how many AudioContexts a page may
// hold, and one is plenty for a few short tones.
let audioContext = null;

export function triggerShutterFeedback() {
  const flash = document.querySelector('#shutterFlash');
  if (flash) {
    flash.classList.remove('flashing');
    // Force reflow so retriggering restarts the animation on rapid shots.
    void flash.offsetWidth;
    flash.classList.add('flashing');
  }

  try {
    navigator.vibrate?.([30, 40, 20]);
  } catch {
    // Haptics are unavailable on desktop and blocked in some contexts.
  }
}

export function playShutterSound() {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;

    const click = audioContext.createOscillator();
    const clickGain = audioContext.createGain();
    click.type = 'square';
    click.frequency.setValueAtTime(1400, now);
    clickGain.gain.setValueAtTime(0.05, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
    click.connect(clickGain);
    clickGain.connect(audioContext.destination);
    click.start(now);
    click.stop(now + 0.07);

    const chime = audioContext.createOscillator();
    const chimeGain = audioContext.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(880, now + 0.05);
    chimeGain.gain.setValueAtTime(0.0001, now + 0.05);
    chimeGain.gain.exponentialRampToValueAtTime(0.06, now + 0.09);
    chimeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
    chime.connect(chimeGain);
    chimeGain.connect(audioContext.destination);
    chime.start(now + 0.05);
    chime.stop(now + 0.34);
  } catch {
    // Audio is a nice-to-have; never block capture on it.
  }
}

export function celebrateCompletion() {
  showToast('All six photos — your collage is ready ♡');
  playCelebrationSound();

  // Someone who has asked their system to reduce motion should not get a
  // screenful of flying particles.
  if (prefersReducedMotion()) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  document.body.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const colours = ['#e85d85', '#c7345a', '#f28aaa', '#3f7fb8', '#ffd9e6', '#b82449'];
  const pieces = Array.from({ length: 90 }, () => ({
    x: Math.random() * width,
    y: -20 - Math.random() * height * 0.4,
    size: 6 + Math.random() * 7,
    vx: -1.2 + Math.random() * 2.4,
    vy: 2.2 + Math.random() * 2.8,
    spin: -0.2 + Math.random() * 0.4,
    angle: Math.random() * Math.PI * 2,
    colour: colours[Math.floor(Math.random() * colours.length)],
    heart: Math.random() < 0.25
  }));

  const startedAt = performance.now();
  const DURATION = 2800;

  const frame = (now) => {
    const elapsed = now - startedAt;
    ctx.clearRect(0, 0, width, height);

    // Fade the whole thing out over the final third rather than cutting.
    ctx.globalAlpha = elapsed > DURATION * 0.66
      ? Math.max(0, 1 - (elapsed - DURATION * 0.66) / (DURATION * 0.34))
      : 1;

    pieces.forEach((piece) => {
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.angle += piece.spin;

      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.angle);
      ctx.fillStyle = piece.colour;

      if (piece.heart) {
        ctx.font = `${piece.size * 1.6}px Georgia, serif`;
        ctx.textAlign = 'center';
        ctx.fillText('♥', 0, 0);
      } else {
        ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      }

      ctx.restore();
    });

    if (elapsed < DURATION) {
      window.requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  };

  window.requestAnimationFrame(frame);
}

export function playCelebrationSound() {
  try {
    audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;

    // A small rising arpeggio — reads as "done!" rather than as another
    // shutter click.
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      const at = now + index * 0.11;
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.08, at + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
      osc.connect(gain);
      gain.connect(audioContext.destination);
      osc.start(at);
      osc.stop(at + 0.45);
    });
  } catch {
    // Audio is a nice-to-have; never let it break the moment.
  }
}
