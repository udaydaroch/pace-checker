// Wraps the <video> element: loading clips, knowing exactly which frame is on screen, stepping
// frame by frame and measuring the frame rate.

import { FPS } from '../config.js';
import { estimateFps } from '../core/fps.js';

const once = (el, ev) => new Promise(r => el.addEventListener(ev, r, { once: true }));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param {HTMLVideoElement} el
 */
export function createVideoController(el) {
  // requestVideoFrameCallback tells us the media time of the frame actually painted, which is more
  // precise than currentTime. Where it's missing we fall back to currentTime.
  const hasFrameCallbacks = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
  const listeners = new Set();
  let shownTime = 0;
  let objectUrl = null;

  const emit = () => listeners.forEach(fn => fn(shownTime));
  const syncFromCurrentTime = () => { if (!hasFrameCallbacks) shownTime = el.currentTime; emit(); };

  if (hasFrameCallbacks) {
    const watch = () => el.requestVideoFrameCallback((now, meta) => { shownTime = meta.mediaTime; emit(); watch(); });
    watch();
  }
  el.addEventListener('seeked', syncFromCurrentTime);
  el.addEventListener('timeupdate', syncFromCurrentTime);

  /** Some recorders leave the length out of the file; seeking to the end makes the browser work it out. */
  async function ensureDuration() {
    if (isFinite(el.duration)) return;
    el.currentTime = 1e7; await once(el, 'durationchange');
    el.currentTime = 0; await once(el, 'seeked');
  }

  return {
    element: el,
    hasFrameCallbacks,
    get shownTime() { return shownTime; },
    get duration() { return el.duration; },
    get width() { return el.videoWidth; },
    get height() { return el.videoHeight; },
    get ready() { return el.videoWidth > 0; },

    /** Called with the media time whenever a different frame is shown. Returns an unsubscribe. */
    onFrameShown(fn) { listeners.add(fn); return () => listeners.delete(fn); },

    /** Re-read the time on screen (needed each animation frame when frame callbacks are missing). */
    refresh: syncFromCurrentTime,

    async load(file) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(file);
      shownTime = 0;
      el.src = objectUrl;
      el.load();
      await once(el, 'loadedmetadata');
      await ensureDuration();
    },

    /** Play a short muted burst and measure the gaps between painted frames. */
    async detectFps() {
      if (!hasFrameCallbacks) return null;
      const times = [];
      let done = false;
      const grab = (now, meta) => { times.push(meta.mediaTime); if (!done && times.length < FPS.sampleFrames) el.requestVideoFrameCallback(grab); };
      el.requestVideoFrameCallback(grab);
      el.playbackRate = 1;
      try { await el.play(); } catch { return null; }
      await sleep(FPS.sampleMs);
      done = true;
      el.pause();
      el.currentTime = 0;
      return estimateFps(times);
    },

    async seek(t) {
      el.currentTime = Math.min(Math.max(t, 0), el.duration || 0);
      await once(el, 'seeked');
    },

    /** Move n frames, landing in the middle of the target frame so the browser shows the right one. */
    step(n, fps) {
      if (!el.duration) return;
      el.pause();
      const f = 1 / fps, cur = Math.round(shownTime / f);
      el.currentTime = Math.min(Math.max((cur + n) * f + f * 0.5, 0), el.duration - 0.001);
    },

    /** Jump to a fraction (0–1) of the clip. */
    scrubTo(fraction) { if (el.duration) { el.pause(); el.currentTime = fraction * el.duration; } },

    play(rate = 1) { el.playbackRate = rate; return el.play(); },
    pause() { el.pause(); el.playbackRate = 1; },
    togglePlay() { el.paused ? el.play().catch(() => {}) : el.pause(); },
    get paused() { return el.paused; },
    get currentTime() { return el.currentTime; },
  };
}

/** @typedef {ReturnType<typeof createVideoController>} VideoController */
