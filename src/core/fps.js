// Working out a clip's frame rate from the timestamps of frames the browser showed. Pure, no DOM.

import { FPS } from '../config.js';

/**
 * @param {number[]} frameTimes  media times (s) of consecutively presented frames
 * @returns {number | null}  frames per second, snapped to a common rate when close; null if unsure
 */
export function estimateFps(frameTimes) {
  const gaps = [];
  for (let i = 1; i < frameTimes.length; i++) {
    const g = frameTimes[i] - frameTimes[i - 1];
    if (g > 0.0005) gaps.push(g);
  }
  if (gaps.length < 4) return null;
  gaps.sort((a, b) => a - b);
  // Dropped frames only make gaps longer, so a small-but-common gap is the real frame interval.
  let fps = 1 / gaps[Math.floor(gaps.length * 0.1)];
  const near = FPS.common.reduce((a, b) => (Math.abs(b - fps) < Math.abs(a - fps) ? b : a));
  if (Math.abs(near - fps) / fps < FPS.snapTolerance) fps = near;
  return Math.round(fps);
}
