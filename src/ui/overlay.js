// The canvas over the video: tap points, the search area, and the ball's tracked path.

import { COLOURS } from '../config.js';
import { searchRegion } from '../core/searchRegion.js';
import { selectFps, selectReading } from '../state/store.js';

/**
 * Maps between video pixels and the on-screen canvas, which shows the video "contained"
 * (letterboxed) inside the element.
 * @param {HTMLCanvasElement} canvas  @param {HTMLVideoElement} videoEl
 */
export function createOverlay(canvas, videoEl) {
  const ctx = canvas.getContext('2d');

  function contentRect() {
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    if (!vw) return null;
    const r = videoEl.getBoundingClientRect();
    const s = Math.min(r.width / vw, r.height / vh);
    return { x: (r.width - vw * s) / 2, y: (r.height - vh * s) / 2, s, w: r.width, h: r.height };
  }

  return {
    canvas,
    resize() {
      const r = videoEl.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = r.width + 'px';
      canvas.style.height = r.height + 'px';
    },
    /** A click position → video pixels, or null if it's outside the picture. */
    clientToVideo(clientX, clientY) {
      const cr = contentRect(); if (!cr) return null;
      const r = canvas.getBoundingClientRect();
      const x = (clientX - r.left - cr.x) / cr.s, y = (clientY - r.top - cr.y) / cr.s;
      return x < 0 || y < 0 || x > videoEl.videoWidth || y > videoEl.videoHeight ? null : { x, y };
    },
    /** @param {OverlayScene} scene */
    render(scene) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cr = contentRect(); if (!cr) return;
      const P = p => ({ x: cr.x + p.x * cr.s, y: cr.y + p.y * cr.s });
      if (scene.searchBox) drawSearchBox(ctx, scene.searchBox, P, cr.s);
      scene.taps.forEach((t, i) => drawTap(ctx, P(t), scene.tapLabels[i]));
      if (scene.track) drawTrack(ctx, scene, P, cr.w);
    },
  };
}

/**
 * @typedef {{taps:{x:number,y:number}[], tapLabels:string[], searchBox:object|null,
 *            track:{points:{t:number,x:number,y:number}[], arrivalTime:number}|null,
 *            time:number, halfFrame:number, hideFuture:boolean, speedLabel:string|null}} OverlayScene
 */

function drawSearchBox(ctx, box, P, s) {
  const p = P({ x: box.x0, y: box.y0 });
  ctx.strokeStyle = COLOURS.searchBox; ctx.setLineDash([5, 4]); ctx.lineWidth = 1;
  ctx.strokeRect(p.x, p.y, box.w * s, box.h * s);
  ctx.setLineDash([]);
}

function drawTap(ctx, { x, y }, label) {
  ctx.strokeStyle = COLOURS.accent; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x, y - 60); ctx.lineTo(x, y + 14); ctx.stroke();
  ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fillStyle = COLOURS.accent; ctx.fill();
  ctx.font = '600 12px Inter, sans-serif';
  const tw = ctx.measureText(label).width, ly = y - 80 < 2 ? y + 18 : y - 80;
  ctx.fillStyle = COLOURS.accent; ctx.fillRect(x - tw / 2 - 5, ly, tw + 10, 18);
  ctx.fillStyle = COLOURS.accentInk; ctx.fillText(label, x - tw / 2, ly + 13);
}

/** Where the ball is at time t, sliding along the path between detections. */
function positionAt(points, t) {
  const first = points[0].t, last = points[points.length - 1].t;
  const tt = Math.min(Math.max(t, first), last);
  let k = 1;
  while (k < points.length - 1 && points[k].t < tt) k++;
  const a = points[k - 1], b = points[k] || a;
  const f = b.t > a.t ? (tt - a.t) / (b.t - a.t) : 0;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

function drawTrack(ctx, { track, time: t, halfFrame, hideFuture, speedLabel }, P, canvasW) {
  const pts = track.points;
  if (!pts.length) return;
  const first = pts[0].t, last = pts[pts.length - 1].t;
  const inFlight = t >= first - halfFrame && t <= last + halfFrame;
  const cur = inFlight ? positionAt(pts, t) : null;

  // path still to come: faint dots (hidden during a replay so the trail builds up live)
  if (!hideFuture) {
    ctx.fillStyle = COLOURS.ballFaint;
    for (const p of pts) if (p.t > t + halfFrame) { const q = P(p); ctx.beginPath(); ctx.arc(q.x, q.y, 2, 0, 7); ctx.fill(); }
  }

  // trail so far
  const trail = pts.filter(p => p.t <= t).map(P);
  if (cur && t <= last) trail.push(P(cur));
  if (trail.length > 1) {
    ctx.lineJoin = ctx.lineCap = 'round';
    for (const [w, c] of [[9, COLOURS.ballGlow], [3.5, COLOURS.ball]]) {
      ctx.beginPath(); ctx.moveTo(trail[0].x, trail[0].y);
      for (const q of trail.slice(1)) ctx.lineTo(q.x, q.y);
      ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
    }
  }

  // ring on the ball
  if (cur) {
    const q = P(cur);
    for (const [c, w] of [['#ffffff', 2.5], [COLOURS.ball, 1.5]]) {
      ctx.beginPath(); ctx.arc(q.x, q.y, 11, 0, 7); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.stroke();
    }
  }

  // speed tag once the ball has arrived
  if (speedLabel && t >= Math.min(track.arrivalTime, last) - halfFrame) {
    const end = P(pts[pts.length - 1]);
    ctx.font = '800 20px "Barlow Condensed", sans-serif';
    const bw = ctx.measureText(speedLabel).width + 16, bh = 28;
    const bx = Math.min(Math.max(4, end.x - bw / 2), canvasW - bw - 4);
    const by = end.y - 112 < 4 ? end.y + 18 : end.y - 112;
    ctx.fillStyle = COLOURS.accent;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 6); else ctx.rect(bx, by, bw, bh);
    ctx.fill();
    ctx.fillStyle = COLOURS.accentInk; ctx.fillText(speedLabel, bx + 8, by + 21);
  }
}

const TAP_LABELS = { side: ['Release', 'Stumps'], umpire: ['Release', 'Batter'] };

/**
 * Keeps the overlay in step with the app state and the frame on screen.
 * @param {import('../state/store.js').Store} store
 * @param {import('../video/videoController.js').VideoController} video
 * @param {ReturnType<typeof createOverlay>} overlay
 */
export function mountOverlay(store, video, overlay) {
  const redraw = () => {
    const s = store.get();
    const reading = selectReading(s);
    overlay.render({
      taps: s.taps,
      tapLabels: TAP_LABELS[s.view],
      searchBox: s.taps.length === 2 && !s.track && video.ready ? searchRegion(s.view, s.taps, video.width, video.height) : null,
      track: s.track,
      time: video.shownTime,
      halfFrame: 0.6 / selectFps(s),
      hideFuture: s.replaying,
      speedLabel: reading && !reading.error ? `${reading.kmh.toFixed(1)} km/h` : null,
    });
  };
  const resize = () => { overlay.resize(); redraw(); };
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(video.element);
  video.element.addEventListener('loadedmetadata', resize);
  video.onFrameShown(redraw);
  store.subscribe(redraw);
  return { redraw };
}
