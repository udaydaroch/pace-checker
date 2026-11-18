// Finding small moving things ("blobs") in video frames. Pure functions, no DOM.
// Frames are RGBA byte arrays (as from canvas getImageData), width × height.

/** @typedef {{x:number, y:number, area:number, w:number, h:number}} Blob  centre, pixel count, bounding size */
/** @typedef {{t:number, blobs:Blob[], shaky:boolean}} Detection  blobs found in the frame at media time t */

/** Sum of absolute R, G and B differences at byte offset p. Colour (not brightness) so a red ball on green grass shows. */
const colourDiff = (a, b, p) => Math.abs(a[p] - b[p]) + Math.abs(a[p + 1] - b[p + 1]) + Math.abs(a[p + 2] - b[p + 2]);

/** Threshold well above the frame's typical difference (sensor noise), but never below `floor`. */
function noiseThreshold(values, floor) {
  let sum = 0, sum2 = 0;
  for (const v of values) { sum += v; sum2 += v * v; }
  const mean = sum / values.length;
  const sd = Math.sqrt(Math.max(0, sum2 / values.length - mean * mean));
  return Math.max(floor, mean + 4 * sd);
}

/**
 * 8-connected groups of set pixels. Clears `mask` as it goes.
 * @param {Uint8Array} mask  1 = set
 * @returns {Blob[]}
 */
export function findComponents(mask, width, height) {
  const stack = new Int32Array(width * height), out = [];
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s]) continue;
    let sp = 0; stack[sp++] = s; mask[s] = 0;
    let area = 0, sx = 0, sy = 0, x0 = width, x1 = 0, y0 = height, y1 = 0;
    while (sp) {
      const i = stack[--sp], x = i % width, y = (i / width) | 0;
      area++; sx += x; sy += y;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy; if (yy < 0 || yy >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx; if (xx < 0 || xx >= width) continue;
          const j = yy * width + xx;
          if (mask[j]) { mask[j] = 0; stack[sp++] = j; }
        }
      }
    }
    out.push({ x: sx / area, y: sy / area, area, w: x1 - x0 + 1, h: y1 - y0 + 1 });
  }
  return out;
}

/**
 * Three-frame differencing: a pixel belongs to a moving object in the middle frame if it changed
 * both from the frame before and to the frame after. Good when the object moves more than its own
 * size per frame (side-on footage).
 *
 * @param {{width:number, height:number, minThreshold:number, shakyShare:number,
 *          accept:(b:Blob)=>boolean, maxBlobs?:number}} opts
 * @returns {{process(frame:Uint8ClampedArray, t:number): Detection|null}}  result lags one frame behind
 */
export function createFrameDiffDetector({ width, height, minThreshold, shakyShare, accept, maxBlobs = 12 }) {
  const N = width * height;
  let before = null, middle = null, middleT = 0;

  function detect(prev, cur, next) {
    const d1 = new Uint16Array(N), d2 = new Uint16Array(N);
    for (let i = 0, p = 0; i < N; i++, p += 4) { d1[i] = colourDiff(cur, prev, p); d2[i] = colourDiff(next, cur, p); }
    const T = noiseThreshold(d1, minThreshold);
    const mask = new Uint8Array(N);
    let on = 0;
    for (let i = 0; i < N; i++) if (d1[i] > T && d2[i] > T) { mask[i] = 1; on++; }
    if (on > N * shakyShare) return { blobs: [], shaky: true };
    const blobs = findComponents(mask, width, height).filter(accept).sort((a, b) => a.area - b.area);
    return { blobs: blobs.slice(0, maxBlobs), shaky: false };
  }

  return {
    process(frame, t) {
      const out = before && middle ? { t: middleT, ...detect(before, middle, frame) } : null;
      before = middle; middle = frame; middleT = t;
      return out;
    },
  };
}

/**
 * Background subtraction: a pixel is foreground if it differs from a slowly-updated picture of the
 * scene AND from the frame `lag` frames ago (the second test drops "ghosts" the background still
 * remembers). Good when the object barely moves between frames (far end of an umpire-view clip).
 *
 * @param {{width:number, height:number, alpha:number, lag:number, minThreshold:number,
 *          shakyShare:number, minArea:number, maxDimAt:(x:number,y:number)=>number, maxBlobs?:number}} opts
 * @returns {{process(frame:Uint8ClampedArray, t:number): Detection|null}}  null for the first frame
 */
export function createBackgroundDetector({ width, height, alpha, lag, minThreshold, shakyShare, minArea, maxDimAt, maxBlobs = 40 }) {
  const N = width * height;
  let bg = null;
  const history = [];

  function seed(frame) {
    bg = new Float32Array(N * 3);
    for (let i = 0, p = 0; i < N; i++, p += 4) { bg[i * 3] = frame[p]; bg[i * 3 + 1] = frame[p + 1]; bg[i * 3 + 2] = frame[p + 2]; }
  }

  function detect(cur, old) {
    const d = new Uint16Array(N);
    for (let i = 0, p = 0, q = 0; i < N; i++, p += 4, q += 3) {
      d[i] = Math.abs(cur[p] - bg[q]) + Math.abs(cur[p + 1] - bg[q + 1]) + Math.abs(cur[p + 2] - bg[q + 2]);
      bg[q] += alpha * (cur[p] - bg[q]); bg[q + 1] += alpha * (cur[p + 1] - bg[q + 1]); bg[q + 2] += alpha * (cur[p + 2] - bg[q + 2]);
    }
    const T = noiseThreshold(d, minThreshold);
    const mask = new Uint8Array(N);
    let on = 0;
    for (let i = 0, p = 0; i < N; i++, p += 4) {
      if (d[i] <= T) continue;
      if (old && colourDiff(cur, old, p) <= T) continue;
      mask[i] = 1; on++;
    }
    if (on > N * shakyShare) return { blobs: [], shaky: true };
    const blobs = findComponents(mask, width, height).filter(b => {
      if (b.area < minArea) return false;
      const m = maxDimAt(b.x, b.y);
      return b.w <= m && b.h <= m && b.area <= m * m * 0.8;
    }).sort((a, b) => a.area - b.area);
    return { blobs: blobs.slice(0, maxBlobs), shaky: false };
  }

  return {
    process(frame, t) {
      let out = null;
      if (!bg) seed(frame);
      else out = { t, ...detect(frame, history.length >= lag ? history[history.length - lag] : null) };
      history.push(frame);
      if (history.length > lag) history.shift();
      return out;
    },
  };
}
