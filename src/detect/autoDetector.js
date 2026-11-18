// Runs one auto-detection: scan the clip, find ball candidates in each frame, track them.
// Each camera view is a strategy that supplies its own detector and tracker.

import { SIDE_ON, UMPIRE, MAX_PLAUSIBLE_KMH, SCAN } from '../config.js';
import { createFrameDiffDetector, createBackgroundDetector } from '../core/blobs.js';
import { trackSideOn, sideOnBlobFilter } from '../core/sideOnTracker.js';
import { trackUmpire, umpireMaxBlobSize } from '../core/umpireTracker.js';
import { searchRegion } from '../core/searchRegion.js';
import { impliedKmh } from '../core/speed.js';
import { createCropSampler, scanFrames, scanWindow } from '../video/frameScanner.js';

/**
 * @typedef {{release:{x:number,y:number}, arrival:{x:number,y:number}, width:number, height:number,
 *            distanceM:number, fps:number, slow:number}} Scene  points in crop pixels
 */

const STRATEGIES = {
  side: {
    heightWeight: 0,
    createDetector: scene => createFrameDiffDetector({
      width: scene.width, height: scene.height,
      minThreshold: SIDE_ON.diffMinThreshold, shakyShare: SIDE_ON.shakyMaskShare,
      accept: sideOnBlobFilter(sideOnScene(scene)),
    }),
    track: (detections, scene) => trackSideOn(detections, sideOnScene(scene)),
  },
  umpire: {
    heightWeight: UMPIRE.cropAspectAllowance,
    createDetector: scene => createBackgroundDetector({
      width: scene.width, height: scene.height,
      alpha: Math.min(0.2, 1 / (UMPIRE.backgroundTimeConstantS * scene.fps)),
      lag: Math.max(1, Math.round(scene.fps * UMPIRE.historySeconds)),
      minThreshold: UMPIRE.bgMinThreshold, shakyShare: UMPIRE.shakyMaskShare, minArea: UMPIRE.minBlobArea,
      maxDimAt: umpireMaxBlobSize(scene.release, scene.arrival, Math.max(scene.width, scene.height)),
    }),
    track: (detections, scene) => trackUmpire(detections, scene),
  },
};

const sideOnScene = s => ({ releaseX: s.release.x, arrivalX: s.arrival.x, distanceM: s.distanceM, fps: s.fps, slow: s.slow });

/**
 * The DOM-free part of detection for one camera view: a per-frame detector and the tracker that
 * turns its detections into a path. Exported so tests run exactly what the app runs.
 * @param {'side'|'umpire'} view  @param {Scene} scene
 */
export function createPipeline(view, scene) {
  const strategy = STRATEGIES[view];
  return { detector: strategy.createDetector(scene), track: detections => strategy.track(detections, scene) };
}

/**
 * @typedef {{status:'found', track:object, skipped:boolean}
 *         | {status:'lostBall', releaseTime:number, lastSeenTime:number}
 *         | {status:'failed', reason:string, shaky:boolean}
 *         | {status:'cancelled'}} DetectOutcome
 */

/**
 * @param {{video:import('../video/videoController.js').VideoController, view:'side'|'umpire',
 *          taps:{x:number,y:number}[], distanceM:number, fps:number, slow:number,
 *          signal:AbortSignal, onProgress:(fraction:number)=>void}} params
 * @returns {Promise<DetectOutcome>}  track points are in video pixels
 */
export async function detectDelivery({ video, view, taps, distanceM, fps, slow, signal, onProgress }) {
  const box = searchRegion(view, taps, video.width, video.height);
  const sampler = createCropSampler(video.element, box, STRATEGIES[view].heightWeight);
  const scene = {
    release: sampler.toCrop(taps[0]), arrival: sampler.toCrop(taps[1]),
    width: sampler.width, height: sampler.height, distanceM, fps, slow,
  };
  const { detector, track: trackPath } = createPipeline(view, scene);
  const { start, end } = scanWindow(video.duration, video.shownTime, slow);

  const detections = [];
  let frames = 0, shaky = 0;
  await scanFrames(video, { start, end, fps, signal }, t => {
    const d = detector.process(sampler.grab(), t);
    if (d) { detections.push(d); if (d.shaky) shaky++; }
    frames++;
    onProgress(Math.min(1, (t - start) / (end - start)));
  });

  if (signal.aborted) return { status: 'cancelled' };
  if (frames < 4) return { status: 'failed', reason: 'tooShort', shaky: false };
  const wasShaky = shaky > detections.length * 0.2;

  const track = trackPath(detections);
  if (!track.ok) return { status: 'failed', reason: track.reason, shaky: wasShaky };
  track.points = track.points.map(p => ({ t: p.t, ...sampler.toVideo(p) }));

  // An impossible speed means the tracker lost the ball early: keep the release, ask for the arrival.
  if (impliedKmh(distanceM, track.releaseTime, track.arrivalTime, slow) >= MAX_PLAUSIBLE_KMH) {
    return { status: 'lostBall', releaseTime: track.releaseTime, lastSeenTime: track.points[track.points.length - 1].t };
  }
  return { status: 'found', track, skipped: frames < (end - start) * fps * SCAN.skippedFrameRatio };
}
