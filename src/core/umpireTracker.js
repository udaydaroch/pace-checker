// Umpire-view tracking (camera behind the bowler). Perspective squashes the far end and the bounce
// dips below the batter on screen, so instead of fitting a line we find the longest chain of
// detections that leaves the release point and follows on smoothly to the batter, then time its
// two ends. Pure functions, no DOM.

import { linearFit, segmentCoords, distance, clamp } from './geometry.js';

/** @typedef {{x:number, y:number}} Point */

/**
 * The ball is big near the camera and tiny at the batter: the largest blob size allowed at (x, y).
 * @param {Point} release  @param {Point} arrival  @param {number} cropMaxDim
 */
export function umpireMaxBlobSize(release, arrival, cropMaxDim) {
  const L = distance(release, arrival);
  const near = 0.15 * cropMaxDim, far = Math.max(6, 0.05 * L);
  return (x, y) => near + (far - near) * clamp(segmentCoords({ x, y }, release, arrival).along, 0, 1);
}

/**
 * @typedef {{ok:true, kind:'umpire', releaseTime:number, arrivalTime:number,
 *            points:import('./sideOnTracker.js').TrackPoint[]}} UmpireTrack
 */

/**
 * @param {import('./blobs.js').Detection[]} detections
 * @param {{release:Point, arrival:Point, fps:number}} scene  points in the detections' pixel space
 * @returns {UmpireTrack | import('./sideOnTracker.js').TrackFailure}
 */
export function trackUmpire(detections, { release: R, arrival: S, fps }) {
  const dtF = 1 / fps;
  const L = distance(R, S);
  const maxGapNear = Math.max(3.5 * dtF, 0.04);
  const maxGapFar = Math.max(6.5 * dtF, 0.1);
  const jumpFar = Math.max(4, 0.05 * L);

  // Candidates near the release→batter line, in time order.
  const C = [];
  detections.forEach((d, fi) => {
    for (const b of d.blobs) {
      const { along, across } = segmentCoords(b, R, S);
      if (along < -0.1 || along > 1.35 || Math.abs(across) > 0.35) continue;
      C.push({ fi, t: d.t, x: b.x, y: b.y, p: along, q: across });
    }
  });
  C.sort((a, b) => a.fi - b.fi);

  // Longest-chain dynamic programme: score[i] = best chain ending at candidate i.
  const score = new Float64Array(C.length), prev = new Int32Array(C.length).fill(-1);
  let lo = 0;
  for (let i = 0; i < C.length; i++) {
    const c = C[i];
    score[i] = c.p < 0.35 ? 1 : -Infinity;     // chains must start near the release point
    while (C[lo].t < c.t - maxGapFar) lo++;
    for (let j = lo; j < i; j++) {
      const b = C[j];
      if (b.fi >= c.fi || !isFinite(score[j])) continue;
      const gap = (c.t - b.t) / dtF;
      if (!canFollow(b, c, j, gap)) continue;
      const sc = score[j] + 1 - 0.3 * Math.max(0, gap - 1);
      if (sc > score[i]) { score[i] = sc; prev[i] = j; }
    }
  }

  function canFollow(b, c, j, gap) {
    if (b.p < 0.7) {
      // near half: the ball keeps moving away from the release point
      return c.t - b.t <= maxGapNear && c.p >= b.p - 0.02 && c.p - b.p <= 0.5 * gap
        && Math.abs(c.q - b.q) <= 0.03 + 0.03 * gap;
    }
    // far half: stay close, stay near the batter, and follow on from how the ball was moving
    if (c.p < 0.6 || distance(c, b) > jumpFar * gap || distance(c, S) > 0.4 * L) return false;
    let ai = prev[j];
    while (ai >= 0 && b.t - C[ai].t < 1 / 60 && prev[ai] >= 0) ai = prev[ai];  // velocity over ≥ 1/60 s
    if (ai < 0) return true;
    const a0 = C[ai], dt0 = b.t - a0.t, dt1 = c.t - b.t;
    const vx = (b.x - a0.x) / dt0, vy = (b.y - a0.y) / dt0;
    const ex = c.x - (b.x + vx * dt1);
    // a bounce can flip the vertical motion, so accept either direction
    const err = Math.min(Math.hypot(ex, c.y - (b.y + vy * dt1)), Math.hypot(ex, c.y - (b.y - vy * dt1)));
    return err <= 0.6 * Math.hypot(vx, vy) * dt1 + 1.5 + 0.5 * gap;
  }

  let best = -1;
  for (let i = 0; i < C.length; i++) {
    if (C[i].p < 0.8 || !isFinite(score[i])) continue;
    if (best < 0 || score[i] > score[best] || (score[i] === score[best] && C[i].p > C[best].p)) best = i;
  }
  if (best < 0) return { ok: false, reason: 'nopath' };
  const chain = [];
  for (let i = best; i >= 0; i = prev[i]) chain.unshift(C[i]);
  if (chain.length < 4 || chain[chain.length - 1].p - chain[0].p < 0.5) return { ok: false, reason: 'short' };

  return {
    ok: true,
    kind: 'umpire',
    releaseTime: releaseTime(chain, dtF),
    arrivalTime: arrivalTime(chain, dtF),
    points: chain.map(c => ({ t: c.t, x: c.x, y: c.y })),
  };
}

/** Extrapolate the first few points back to the release point (along = 0). */
function releaseTime(chain, dtF) {
  const first = chain[0];
  const head = linearFit(chain.slice(0, Math.min(4, chain.length)).map(c => ({ t: c.t, v: c.p })));
  if (head && head.b > 0) {
    const t0 = -head.a / head.b;
    if (t0 <= first.t && t0 >= first.t - 3 * dtF) return t0;
  }
  return first.t;
}

/** The last frame the ball is seen heading in; if it was lost early, extrapolate a little. */
function arrivalTime(chain, dtF) {
  const last = chain[chain.length - 1];
  if (last.p >= 0.85) return last.t;
  const tail = linearFit(chain.slice(-Math.min(4, chain.length)).map(c => ({ t: c.t, v: c.p })));
  return tail && tail.b > 0 ? Math.min(last.t + 3 * dtF, last.t + (1 - last.p) / tail.b) : last.t;
}
