// Small maths helpers shared by the trackers. Pure functions, no DOM.

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Least-squares straight line through points.
 * @param {{t:number, v:number}[]} pts
 * @returns {{a:number, b:number, se:number, rms:number} | null}  v ≈ a + b·t; se is the slope's standard error
 */
export function linearFit(pts) {
  const n = pts.length;
  if (n < 3) return null;
  let mt = 0, mv = 0;
  for (const p of pts) { mt += p.t; mv += p.v; }
  mt /= n; mv /= n;
  let stt = 0, stv = 0;
  for (const p of pts) { stt += (p.t - mt) ** 2; stv += (p.t - mt) * (p.v - mv); }
  if (stt <= 0) return null;
  const b = stv / stt, a = mv - b * mt;
  let ss = 0;
  for (const p of pts) ss += (p.v - a - b * p.t) ** 2;
  return { a, b, se: Math.sqrt(ss / Math.max(1, n - 2) / stt), rms: Math.sqrt(ss / n) };
}

/**
 * Where point P sits relative to the segment R→S.
 * along: 0 at R, 1 at S.  across: sideways offset, in units of |RS|.
 */
export function segmentCoords(P, R, S) {
  const ex = S.x - R.x, ey = S.y - R.y, L2 = ex * ex + ey * ey;
  const dx = P.x - R.x, dy = P.y - R.y;
  return { along: (dx * ex + dy * ey) / L2, across: (dx * ey - dy * ex) / L2 };
}

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Deterministic pseudo-random integers in [0, n), so detection results are repeatable. */
export function seededRandom(seed = 12345) {
  let s = seed;
  return n => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
}
