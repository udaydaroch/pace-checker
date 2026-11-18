// Reading frames out of the clip for analysis: which frames, and which part of each frame.

import { SCAN } from '../config.js';

const once = (el, ev) => new Promise(r => el.addEventListener(ev, r, { once: true }));
const nextPaint = () => new Promise(r => requestAnimationFrame(() => r()));

/**
 * Grabs one rectangle of the current video frame, scaled down, as RGBA pixels. Also converts points
 * between video pixels and crop pixels.
 * @param {HTMLVideoElement} videoEl
 * @param {import('../core/searchRegion.js').Box} box  in video pixels
 * @param {number} [heightWeight]  count the crop's height this much towards the size limit (0 = width only)
 */
export function createCropSampler(videoEl, box, heightWeight = 0) {
  const scale = Math.min(1, SCAN.maxCropWidth / Math.max(box.w, box.h * heightWeight));
  const width = Math.max(8, Math.round(box.w * scale));
  const height = Math.max(8, Math.round(box.h * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  return {
    width, height,
    grab() {
      ctx.drawImage(videoEl, box.x0, box.y0, box.w, box.h, 0, 0, width, height);
      return ctx.getImageData(0, 0, width, height).data;
    },
    toCrop: p => ({ x: (p.x - box.x0) * scale, y: (p.y - box.y0) * scale }),
    toVideo: p => ({ x: p.x / scale + box.x0, y: p.y / scale + box.y0 }),
  };
}

/**
 * Which part of the clip to scan: the whole clip if it's short, otherwise a few real seconds from
 * the frame on screen.
 */
export function scanWindow(duration, from, slow) {
  if (duration <= SCAN.wholeClipUnderSeconds * slow) return { start: 0, end: duration };
  const start = Math.max(0, from - 0.05);
  return { start, end: Math.min(duration, start + SCAN.windowSeconds * slow) };
}

/**
 * Calls onFrame(mediaTime) for each decoded frame between start and end, with that frame on the
 * video element so it can be sampled. Plays slowly where frame callbacks exist (fast, exact
 * timestamps); otherwise seeks frame by frame.
 *
 * @param {import('./videoController.js').VideoController} video
 * @param {{start:number, end:number, fps:number, signal:AbortSignal}} range
 * @param {(t:number) => void} onFrame
 */
export async function scanFrames(video, { start, end, fps, signal }, onFrame) {
  const el = video.element;
  video.pause();
  if (!video.hasFrameCallbacks) {
    for (let t = start; t <= end && !signal.aborted; t += 1 / fps) {
      el.currentTime = t + 0.5 / fps;
      await once(el, 'seeked');
      await nextPaint();
      onFrame(t);
    }
    return;
  }
  await video.seek(start);
  await new Promise((resolve, reject) => {
    let done = false;
    const finish = () => { if (done) return; done = true; video.pause(); resolve(); };
    const cb = (now, meta) => {
      if (done) return;
      if (signal.aborted || meta.mediaTime > end) return finish();
      onFrame(meta.mediaTime);
      el.requestVideoFrameCallback(cb);
    };
    el.requestVideoFrameCallback(cb);
    el.addEventListener('ended', finish, { once: true });
    video.play(Math.max(SCAN.minPlaybackRate, Math.min(1, SCAN.renderFps / fps))).catch(reject);
  });
}
