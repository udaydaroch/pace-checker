// Side-on tracking: the ball crosses the frame at a near-constant rate, so its x position is close
// to a straight line in time. Find that line among noisy detections (RANSAC), then time when the
// ball crosses each tap point. Pure functions, no DOM.

import { BALL_DIAMETER_M, BOWLING_SPEED_MS, SIDE_ON } from '../config.js';
import { linearFit, seededRandom } from './geometry.js';

/**
 * Everything the side-on tracker needs to know about the scene, in crop pixels.
 * @typedef {{releaseX:number, arrivalX:number, distanceM:number, fps:number, slow:number}} SideOnScene
 */

/** Pixels per metre along the pitch and the ball's expected size and blur. */
function sceneScale({ releaseX, arrivalX, distanceM, fps, slow }) {
  const span = Math.abs(arrivalX - releaseX);
  const pxPerM = span / distanceM;
  const ballRadius = Math.max(1, (BALL_DIAMETER_M / 2) * pxPerM);
  const frameDt = 1 / fps;
  const maxStreak = (BOWLING_SPEED_MS.max * pxPerM / slow) * frameDt;   // longest blur in one frame
  return { span, pxPerM, ballRadius, frameDt, maxStreak, dir: Math.sign(arrivalX - releaseX) };
}

/** Which blobs could plausibly be the ball (size and motion blur). */
export function sideOnBlobFilter(scene) {
  const { ballRadius: r, maxStreak } = sceneScale(scene);
  const maxArea = Math.max(60, (2 * r + maxStreak) * (2 * r + 2) * 2);
  const maxH = Math.max(8, 6 * r), maxW = maxStreak * 1.5 + 6 * r + 6;
  return b => b.area >= 2 && b.area <= maxArea && b.h <= maxH && b.w <= maxW;
}

/**
 * @typedef {{t:number, x:number, y:number}} TrackPoint
 * @typedef {{ok:true, kind:'side', releaseTime:number, arrivalTime:number,
 *            releaseRate:number, relErr:number, points:TrackPoint[]}} SideOnTrack
 *   releaseRate: share of the release→arrival distance covered per media second just after release
 *   relErr: relative uncertainty of the average speed
 * @typedef {{ok:false, reason:string}} TrackFailure
 */

/**
 * @param {import('./blobs.js').Detection[]} detections
 * @param {SideOnScene} scene
 * @returns {SideOnTrack | TrackFailure}
 */
export function trackSideOn(detections, scene) {
  const s = sceneScale(scene);
  const fit = robustLineFit(detections, {
    dir: s.dir,
    rateMin: BOWLING_SPEED_MS.min * s.pxPerM / scene.slow,
    rateMax: BOWLING_SPEED_MS.max * s.pxPerM / scene.slow,
    tolerance: rate => 2 + 3 * s.ballRadius + 0.15 * rate * s.frameDt,
    xLo: Math.min(scene.releaseX, scene.arrivalX) - 0.15 * s.span,
    xHi: Math.max(scene.releaseX, scene.arrivalX) + 0.15 * s.span,
    minInliers: SIDE_ON.minInliers,
    minSpan: SIDE_ON.minSpanOfGates * s.span,
  });
  if (!fit.ok) return fit;

  // The ball slows after pitching, so time each tap point from the nearby part of the path.
  const k = Math.max(3, Math.round(fit.inliers.length * 0.4));
  const usable = seg => seg && Math.sign(seg.b) === Math.sign(fit.line.b) ? seg : fit.line;
  const pts = fit.inliers.map(p => ({ t: p.t, v: p.x }));
  const early = usable(pts.length >= 6 ? linearFit(pts.slice(0, k)) : null);
  const late = usable(pts.length >= 6 ? linearFit(pts.slice(-k)) : null);

  return {
    ok: true,
    kind: 'side',
    releaseTime: (scene.releaseX - early.a) / early.b,
    arrivalTime: (scene.arrivalX - late.a) / late.b,
    releaseRate: Math.abs(early.b) / s.span,
    relErr: Math.max(0.015, 2 * fit.line.se / Math.abs(fit.line.b)),
    points: fit.inliers.map(p => ({ t: p.t, x: p.x, y: p.y })),
  };
}

/**
 * RANSAC for x = a + b·t: try lines through pairs of nearby detections, keep the one most frames
 * agree with, then refine by least squares.
 */
function robustLineFit(detections, o) {
  const frames = detections.filter(d => d.blobs.length);
  if (frames.length < 4) return { ok: false, reason: 'few' };
  const rand = seededRandom();

  const inliersFor = (a, b) => {
    const tol = o.tolerance(Math.abs(b)), out = [];
    for (const f of frames) {
      const px = a + b * f.t;
      if (px < o.xLo || px > o.xHi) continue;
      let best = null, br = Infinity;
      for (const c of f.blobs) { const r = Math.abs(c.x - px); if (r < br) { br = r; best = c; } }
      if (br < tol) out.push({ t: f.t, x: best.x, y: best.y, r: br });
    }
    return out;
  };
  const score = (inl, tol) => inl.reduce((s, p) => s + 1 - 0.5 * p.r / tol, 0);

  let best = null, bestScore = 0;
  const iterations = Math.min(6000, frames.length * 60);
  for (let k = 0; k < iterations; k++) {
    const i = rand(frames.length), j = i + 1 + rand(6);
    if (j >= frames.length) continue;
    const fi = frames[i], fj = frames[j];
    const ci = fi.blobs[rand(fi.blobs.length)], cj = fj.blobs[rand(fj.blobs.length)];
    const dt = fj.t - fi.t;
    if (dt <= 0) continue;
    const b = (cj.x - ci.x) / dt;
    if (Math.sign(b) !== o.dir || Math.abs(b) < o.rateMin || Math.abs(b) > o.rateMax) continue;
    const a = ci.x - b * fi.t;
    const sc = score(inliersFor(a, b), o.tolerance(Math.abs(b)));
    if (sc > bestScore) { bestScore = sc; best = { a, b }; }
  }
  if (!best) return { ok: false, reason: 'nopath' };

  let line = { ...best, se: Infinity };
  let inliers = inliersFor(line.a, line.b);
  for (let it = 0; it < 4 && inliers.length >= 3; it++) {
    const f = linearFit(inliers.map(p => ({ t: p.t, v: p.x })));
    if (!f) break;
    line = f;
    inliers = inliersFor(line.a, line.b);
  }
  if (inliers.length < o.minInliers) return { ok: false, reason: 'few' };
  const xs = inliers.map(p => p.x);
  if (Math.max(...xs) - Math.min(...xs) < o.minSpan) return { ok: false, reason: 'span' };
  if (Math.sign(line.b) !== o.dir) return { ok: false, reason: 'dir' };
  inliers.sort((p, q) => p.t - q.t);
  return { ok: true, line, inliers };
}
