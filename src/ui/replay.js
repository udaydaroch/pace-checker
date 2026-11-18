// Plays the delivery slowly so the tracked path can be watched building up.

import { REPLAY, SCAN } from '../config.js';

/**
 * @param {import('../video/videoController.js').VideoController} video
 * @param {{points:{t:number}[]}} track
 * @param {{slow:number, onFrame:()=>void}} opts  onFrame is called every animation frame while playing
 * @returns {Promise<void>}  resolves when the replay ends or is interrupted (e.g. the user pauses)
 */
export async function playReplay(video, track, { slow, onFrame }) {
  const pts = track.points;
  const from = Math.max(0, pts[0].t - REPLAY.leadInS * slow);
  const to = Math.min(video.duration, pts[pts.length - 1].t + REPLAY.tailS * slow);
  video.pause();
  await video.seek(from);
  await video.play(Math.max(SCAN.minPlaybackRate, Math.min(1, REPLAY.rate * slow)));
  await new Promise(resolve => {
    const tick = () => {
      video.refresh();
      onFrame();
      if (video.currentTime >= to || video.paused) { video.pause(); resolve(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
