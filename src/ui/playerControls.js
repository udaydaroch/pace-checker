// Step 3 controls: scrubbing, frame stepping, playback speed, frame rate and slow-motion settings.

import { FPS } from '../config.js';
import { selectFps } from '../state/store.js';
import { $, formatSeconds } from './dom.js';

/**
 * @param {import('../state/store.js').Store} store
 * @param {import('../video/videoController.js').VideoController} video
 */
export function mountPlayerControls(store, video) {
  const scrub = $('scrub');
  let scrubbing = false;

  // time readout and scrub bar follow the frame on screen
  video.onFrameShown(t => {
    $('tNow').textContent = formatSeconds(t);
    if (video.duration && !scrubbing) scrub.value = Math.round((t / video.duration) * 1000);
  });
  video.element.addEventListener('loadedmetadata', () => { $('tDur').textContent = formatSeconds(video.duration); });

  scrub.addEventListener('pointerdown', () => { scrubbing = true; });
  scrub.addEventListener('pointerup', () => { scrubbing = false; });
  scrub.addEventListener('input', () => video.scrubTo(scrub.value / 1000));

  const stepButtons = { back10: -10, back1: -1, fwd1: 1, fwd10: 10 };
  for (const [id, n] of Object.entries(stepButtons)) $(id).onclick = () => video.step(n, selectFps(store.get()));
  $('playSlow').onclick = () => video.play(0.25).catch(() => {});
  $('playNorm').onclick = () => video.play(1).catch(() => {});
  video.element.addEventListener('click', () => video.togglePlay());

  // frame rate and slow-motion settings
  const fpsSelect = $('fps');
  fpsSelect.innerHTML = '';
  fpsSelect.add(new Option('Auto-detect', 'auto'));
  for (const f of FPS.choices) fpsSelect.add(new Option(`${f} fps`, String(f)));
  fpsSelect.addEventListener('change', () => store.set({ fpsChoice: fpsSelect.value === 'auto' ? 'auto' : +fpsSelect.value }));
  $('slow').addEventListener('change', e => store.set({ slow: +e.target.value }));

  store.subscribe(s => {
    fpsSelect.value = String(s.fpsChoice);
    $('fpsInfo').textContent = fpsLabel(s);
  });
}

function fpsLabel(s) {
  if (s.fpsChoice !== 'auto') return `fps: ${s.fpsChoice}`;
  switch (s.fpsStatus) {
    case 'detecting': return 'fps: detecting…';
    case 'detected': return `fps: ${s.detectedFps} (auto)`;
    case 'unknown': return 'fps: pick below';
    default: return 'fps: —';
  }
}
