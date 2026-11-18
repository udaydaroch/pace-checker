// Checking the two tap points and deciding which part of the frame to search. Pure, no DOM.

import { SIDE_ON, UMPIRE } from '../config.js';
import { distance } from './geometry.js';

/** @typedef {'side'|'umpire'} CameraView */
/** @typedef {{x:number, y:number}} Point */
/** @typedef {{x0:number, y0:number, w:number, h:number}} Box */

/**
 * @param {CameraView} view  @param {Point[]} taps  [release, arrival] in video pixels
 * @returns {{ok:true} | {ok:false, message:string}}
 */
export function validateTaps(view, [release, arrival], videoW, videoH) {
  if (view === 'umpire') {
    if (distance(release, arrival) < Math.min(videoW, videoH) * UMPIRE.minTapDistanceOfFrame) {
      return { ok: false, message: 'Those points are almost on top of each other. Zoom in a little before filming, or film side-on instead.' };
    }
    return { ok: true };
  }
  if (Math.abs(arrival.x - release.x) < videoW * SIDE_ON.minGateSpanOfWidth) {
    return { ok: false, message: 'Those points are too close together across the screen. Film from further back, side-on, so the pitch runs across the frame.' };
  }
  return { ok: true };
}

/**
 * The part of the frame the ball can be in, in video pixels (clamped to the frame).
 * @param {CameraView} view  @param {Point[]} taps  @returns {Box}
 */
export function searchRegion(view, [a, b], videoW, videoH) {
  let x0, x1, y0, y1;
  if (view === 'umpire') {
    const L = distance(a, b), padX = Math.max(UMPIRE.regionPadSide * L, UMPIRE.regionMinPadOfWidth * videoW);
    x0 = Math.min(a.x, b.x) - padX; x1 = Math.max(a.x, b.x) + padX;
    y0 = Math.min(a.y, b.y) - UMPIRE.regionPadAbove * L; y1 = Math.max(a.y, b.y) + UMPIRE.regionPadBelow * L;
  } else {
    const span = Math.abs(b.x - a.x);
    x0 = Math.min(a.x, b.x) - SIDE_ON.regionPadX * span; x1 = Math.max(a.x, b.x) + SIDE_ON.regionPadX * span;
    y0 = Math.min(a.y, b.y) - SIDE_ON.regionPadAbove * span; y1 = Math.max(a.y, b.y) + SIDE_ON.regionPadBelow * span;
  }
  x0 = Math.max(0, x0); y0 = Math.max(0, y0);
  x1 = Math.min(videoW, x1); y1 = Math.min(videoH, y1);
  return { x0, y0, w: x1 - x0, h: y1 - y0 };
}
