// End-to-end tests of detection + tracking on made-up footage, using the app's own pipeline.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPipeline } from '../src/detect/autoDetector.js';
import { sideOnClip, umpireClip } from './helpers/synthetic.js';

function run(view, clip, scene) {
  const { detector, track } = createPipeline(view, scene);
  const detections = [];
  for (const f of clip.frames) { const d = detector.process(f.img, f.t); if (d) detections.push(d); }
  return track(detections);
}

const within = (actual, expected, pct, what) =>
  assert.ok(Math.abs(actual / expected - 1) <= pct / 100, `${what}: ${actual.toFixed(1)} vs ${expected.toFixed(1)} (allowed ±${pct}%)`);

const sideCases = [
  { fps: 30, kmh: 110 }, { fps: 60, kmh: 145 }, { fps: 240, kmh: 60 }, { fps: 30, kmh: 120, dir: -1 },
];
for (const c of sideCases) {
  test(`side-on ${c.fps} fps ${c.kmh} km/h${c.dir < 0 ? ' right-to-left' : ''}`, () => {
    const clip = sideOnClip(c);
    const t = run('side', clip, {
      release: { x: clip.releaseX, y: 50 }, arrival: { x: clip.arrivalX, y: 145 },
      width: clip.W, height: clip.H, distanceM: clip.distanceM, fps: c.fps, slow: 1,
    });
    assert.equal(t.ok, true, `tracking failed: ${t.reason}`);
    const avg = clip.distanceM / (t.arrivalTime - t.releaseTime) * 3.6;
    const release = t.releaseRate * clip.distanceM * 3.6;
    within(release, clip.trueReleaseKmh, 1.5, 'out-of-hand speed');
    within(avg, clip.trueAverageKmh, 4, 'average speed');
  });
}

const umpireCases = [
  { fps: 60, kmh: 120, pct: 3 }, { fps: 60, kmh: 145, pct: 3 }, { fps: 240, kmh: 145, pct: 2 },
  { fps: 30, kmh: 120, pct: 6 },   // ±1 frame at each end is ~5% at 30 fps
];
for (const c of umpireCases) {
  test(`umpire view ${c.fps} fps ${c.kmh} km/h`, () => {
    const clip = umpireClip(c);
    const t = run('umpire', clip, {
      release: clip.release, arrival: clip.arrival,
      width: clip.W, height: clip.H, distanceM: clip.distanceM, fps: c.fps, slow: 1,
    });
    assert.equal(t.ok, true, `tracking failed: ${t.reason}`);
    assert.ok(Math.abs(t.releaseTime - clip.trueReleaseTime) < 1.5 / c.fps, 'release within 1.5 frames');
    within(clip.distanceM / (t.arrivalTime - t.releaseTime) * 3.6, clip.trueKmh, c.pct, 'speed');
  });
}

test('side-on reports failure on footage with no ball', () => {
  const clip = sideOnClip({ fps: 30, kmh: 110 });
  const empty = clip.frames.map(f => ({ t: f.t, img: clip.frames[0].img }));
  const t = run('side', { frames: empty }, {
    release: { x: clip.releaseX, y: 50 }, arrival: { x: clip.arrivalX, y: 145 },
    width: clip.W, height: clip.H, distanceM: clip.distanceM, fps: 30, slow: 1,
  });
  assert.equal(t.ok, false);
});
