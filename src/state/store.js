// The app's single source of truth, plus the values derived from it.

import { DEFAULT_DISTANCE_M, FPS } from '../config.js';
import { measureSpeed } from '../core/speed.js';

/**
 * @typedef {{
 *   distanceM: number,
 *   fpsChoice: 'auto' | number, detectedFps: number|null, fpsStatus: 'idle'|'detecting'|'detected'|'unknown',
 *   slow: number,
 *   release: number|null, arrival: number|null,      // media times marked (by hand or auto)
 *   track: object|null,                              // the auto-detected path, while it matches the marks
 *   view: 'side'|'umpire', taps: {x:number,y:number}[], tapping: boolean,
 *   scanning: boolean, replaying: boolean,
 * }} AppState
 */

/** @returns {AppState} */
export const initialState = () => ({
  distanceM: DEFAULT_DISTANCE_M,
  fpsChoice: 'auto', detectedFps: null, fpsStatus: 'idle',
  slow: 1,
  release: null, arrival: null, track: null,
  view: 'side', taps: [], tapping: false,
  scanning: false, replaying: false,
});

/** A tiny observable store: set() merges a patch and notifies subscribers. */
export function createStore(initial) {
  let state = initial;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) { state = { ...state, ...patch }; subs.forEach(fn => fn(state)); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}

/** @typedef {ReturnType<typeof createStore>} Store */

// ---- selectors ----

export const selectFps = s => (s.fpsChoice === 'auto' ? s.detectedFps || FPS.fallback : s.fpsChoice);

export const selectReading = s => measureSpeed({
  distanceM: s.distanceM, release: s.release, arrival: s.arrival,
  fps: selectFps(s), slow: s.slow, track: s.track,
});

/** State patch that forgets everything about the current clip's timing and detection. */
export const clearTiming = () => ({ release: null, arrival: null, track: null, taps: [], tapping: false, replaying: false });
