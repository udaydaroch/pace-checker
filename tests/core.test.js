// Unit tests for the small pure modules.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureSpeed, impliedKmh } from '../src/core/speed.js';
import { estimateFps } from '../src/core/fps.js';
import { validateTaps, searchRegion } from '../src/core/searchRegion.js';
import { linearFit, segmentCoords } from '../src/core/geometry.js';
import { findComponents } from '../src/core/blobs.js';
import { createStore, initialState, selectFps, selectReading } from '../src/state/store.js';

test('measureSpeed: nothing until both ends are marked', () => {
  assert.equal(measureSpeed({ distanceM: 18.9, release: 1, arrival: null, fps: 30, slow: 1 }), null);
});

test('measureSpeed: 18.9 m in 0.5 s is 136.08 km/h', () => {
  const r = measureSpeed({ distanceM: 18.9, release: 1, arrival: 1.5, fps: 240, slow: 1 });
  assert.equal(r.kmh.toFixed(2), '136.08');
  assert.equal(r.frames, 120);
  assert.equal(r.method, 'manual');
  assert.ok(r.range.lo < r.kmh && r.kmh < r.range.hi);
  assert.equal(r.gun.approximate, true);
});

test('measureSpeed: slowed-down clips divide the media time', () => {
  const r = measureSpeed({ distanceM: 18.9, release: 0, arrival: 2, fps: 30, slow: 4 });
  assert.equal(r.kmh.toFixed(2), '136.08');
});

test('measureSpeed: side-on track gives a measured out-of-hand speed', () => {
  const r = measureSpeed({ distanceM: 18.9, release: 1, arrival: 1.5, fps: 240, slow: 1,
    track: { kind: 'side', releaseRate: 2.2, relErr: 0.02 } });
  assert.equal(r.method, 'auto');
  assert.equal(r.gun.approximate, false);
  assert.equal(r.gun.kmh.toFixed(1), (2.2 * 18.9 * 3.6).toFixed(1));
});

test('measureSpeed: errors and warnings', () => {
  assert.ok(measureSpeed({ distanceM: 0, release: 1, arrival: 2, fps: 30, slow: 1 }).error);
  assert.ok(measureSpeed({ distanceM: 18.9, release: 1, arrival: 1, fps: 30, slow: 1 }).error);
  const fast = measureSpeed({ distanceM: 18.9, release: 1, arrival: 1.2, fps: 30, slow: 1 });   // 6 frames, 340 km/h
  assert.ok(fast.warnings.some(w => w.includes('faster than anyone')));
  assert.ok(fast.warnings.some(w => w.includes('frames between marks')));
});

test('impliedKmh', () => assert.equal(impliedKmh(18.9, 1, 1.5, 1).toFixed(2), '136.08'));

test('estimateFps: snaps to common rates and ignores dropped frames', () => {
  const times = [];
  for (let i = 0; i < 40; i++) if (i % 7 !== 3) times.push(i / 59.94);
  assert.equal(estimateFps(times), 60);
  assert.equal(estimateFps([0, 0.1]), null);
});

test('validateTaps: side-on needs the points well apart across the frame', () => {
  assert.equal(validateTaps('side', [{ x: 100, y: 100 }, { x: 200, y: 100 }], 1920, 1080).ok, false);
  assert.equal(validateTaps('side', [{ x: 100, y: 100 }, { x: 1500, y: 120 }], 1920, 1080).ok, true);
  assert.equal(validateTaps('umpire', [{ x: 900, y: 300 }, { x: 905, y: 310 }], 1920, 1080).ok, false);
  assert.equal(validateTaps('umpire', [{ x: 900, y: 300 }, { x: 960, y: 420 }], 1920, 1080).ok, true);
});

test('searchRegion stays inside the frame and contains both points', () => {
  for (const view of ['side', 'umpire']) {
    const taps = [{ x: 30, y: 40 }, { x: 1800, y: 1000 }];
    const b = searchRegion(view, taps, 1920, 1080);
    assert.ok(b.x0 >= 0 && b.y0 >= 0 && b.x0 + b.w <= 1920 && b.y0 + b.h <= 1080);
    for (const p of taps) assert.ok(p.x >= b.x0 && p.x <= b.x0 + b.w && p.y >= b.y0 && p.y <= b.y0 + b.h);
  }
});

test('linearFit recovers a line', () => {
  const f = linearFit([0, 1, 2, 3].map(t => ({ t, v: 5 + 2 * t })));
  assert.ok(Math.abs(f.a - 5) < 1e-9 && Math.abs(f.b - 2) < 1e-9);
  assert.equal(linearFit([{ t: 0, v: 0 }]), null);
});

test('segmentCoords', () => {
  const c = segmentCoords({ x: 5, y: 1 }, { x: 0, y: 0 }, { x: 10, y: 0 });
  assert.equal(c.along, 0.5);
  assert.ok(Math.abs(c.across + 0.1) < 1e-9);
});

test('findComponents separates blobs and measures them', () => {
  const W = 10, H = 5, m = new Uint8Array(W * H);
  m[1 * W + 1] = m[1 * W + 2] = m[2 * W + 2] = 1;   // L-shape
  m[3 * W + 8] = 1;                                // single pixel
  const blobs = findComponents(m, W, H).sort((a, b) => b.area - a.area);
  assert.equal(blobs.length, 2);
  assert.deepEqual([blobs[0].area, blobs[0].w, blobs[0].h], [3, 2, 2]);
});

test('store notifies subscribers and selectors derive values', () => {
  const store = createStore(initialState());
  let calls = 0;
  store.subscribe(() => calls++);
  store.set({ release: 1, arrival: 1.5, detectedFps: 120 });
  assert.equal(calls, 1);
  assert.equal(selectFps(store.get()), 120);
  store.set({ fpsChoice: 240 });
  assert.equal(selectFps(store.get()), 240);
  assert.equal(selectReading(store.get()).kmh.toFixed(2), '136.08');
});
