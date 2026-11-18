// Turning two timestamps and a distance into a speed reading. Pure functions, no DOM.

import { SPEED_GUN_FACTOR, WARN_FAST_KMH, WARN_SLOW_KMH } from '../config.js';

export const msToKmh = ms => ms * 3.6;
export const msToMph = ms => ms * 2.23694;

/**
 * @typedef {{
 *   kmh:number, mph:number, flightS:number, frames:number,
 *   range:{lo:number, hi:number, label:string},
 *   gun:{kmh:number, label:string, approximate:boolean},
 *   method:'manual'|'auto'|'auto-umpire', warnings:string[]
 * }} SpeedReading
 * @typedef {{error:string}} SpeedError
 */

/**
 * @param {{distanceM:number, release:number|null, arrival:number|null, fps:number, slow:number,
 *          track?: {kind:'side'|'umpire', releaseRate?:number, relErr?:number} | null}} input
 *   release/arrival are media times (s) in the clip; slow is how much the clip is slowed down.
 * @returns {SpeedReading | SpeedError | null}  null until both ends are marked
 */
export function measureSpeed({ distanceM, release, arrival, fps, slow, track = null }) {
  if (release == null || arrival == null) return null;
  if (!(distanceM > 0)) return { error: 'Enter a distance above zero.' };
  const mediaDt = Math.abs(arrival - release);
  const flightS = mediaDt / slow;
  if (flightS <= 0) return { error: 'Release and arrival are on the same frame. Mark two different frames.' };

  const ms = distanceM / flightS;
  const kmh = msToKmh(ms);
  const frames = Math.round(mediaDt * fps);
  const sideAuto = track?.kind === 'side';

  let range, gun;
  if (sideAuto) {
    range = { lo: kmh * (1 - track.relErr), hi: kmh * (1 + track.relErr), label: 'Accuracy' };
    gun = { kmh: msToKmh(track.releaseRate * distanceM * slow), label: 'Out of the hand*', approximate: false };
  } else {
    const frameS = 1 / fps / slow;    // ±1 frame at each end
    const hi = flightS - frameS > 0 ? msToKmh(distanceM / (flightS - frameS)) : Infinity;
    range = { lo: msToKmh(distanceM / (flightS + frameS)), hi, label: 'Accuracy (±1 frame)' };
    gun = { kmh: kmh * SPEED_GUN_FACTOR, label: 'Approx. speed-gun reading*', approximate: true };
  }

  const warnings = [];
  if (arrival < release) warnings.push('Arrival is before release. Did you mark them the wrong way round? The speed is still worked out from the gap.');
  if (kmh > WARN_FAST_KMH) warnings.push("That's faster than anyone has ever bowled. Check the distance, the frame rate, and whether the clip is slowed down.");
  else if (kmh < WARN_SLOW_KMH) warnings.push('That\'s very slow. If this is a slow-motion clip that plays slowly, set "Video is slowed down by" to match.');
  if (frames < 8 && !sideAuto) warnings.push(`Only ${frames} frames between marks, so the reading could be well out. Filming in slo-mo (120 or 240 fps) will tighten it up.`);

  return {
    kmh, mph: msToMph(ms), flightS, frames, range, gun, warnings,
    method: track ? (sideAuto ? 'auto' : 'auto-umpire') : 'manual',
  };
}

/** Average speed implied by a track, used to reject impossible detections. */
export const impliedKmh = (distanceM, releaseTime, arrivalTime, slow) =>
  msToKmh(distanceM / (Math.abs(arrivalTime - releaseTime) / slow));
