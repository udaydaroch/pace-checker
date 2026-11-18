// Made-up footage for the tracker tests: a textured field, sensor noise, a moving bowler and
// batter, and a red ball with motion blur that bounces and slows after pitching.

const rng = seed => { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; };

function canvas(W, H, rnd, noise, base) {
  const img = new Uint8ClampedArray(base);
  for (let i = 0; i < W * H * 4; i += 4) { const e = (rnd() - 0.5) * 2 * noise; img[i] += e; img[i + 1] += e; img[i + 2] += e; }
  const rect = (x0, y0, w, h, c) => {
    for (let y = Math.max(0, y0 | 0); y < Math.min(H, y0 + h); y++)
      for (let x = Math.max(0, x0 | 0); x < Math.min(W, x0 + w); x++) { const p = (y * W + x) * 4; img[p] = c[0]; img[p + 1] = c[1]; img[p + 2] = c[2]; }
  };
  const disc = (cx, cy, r, c) => {
    for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H || (x - cx) ** 2 + (y - cy) ** 2 > r * r + 0.5) continue;
      const p = (y * W + x) * 4; img[p] = c[0]; img[p + 1] = c[1]; img[p + 2] = c[2];
    }
  };
  return { img, rect, disc };
}

function grass(W, H, rnd, skyRows = 0) {
  const bg = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const k = rnd() * 40, sky = (i / W | 0) < skyRows;
    bg[i * 4] = sky ? 140 : 50 + k; bg[i * 4 + 1] = sky ? 180 : 110 + k; bg[i * 4 + 2] = sky ? 215 : 40 + k * 0.5; bg[i * 4 + 3] = 255;
  }
  return bg;
}

const RED = [190, 25, 30];

/**
 * Side-on clip. Release at x=releaseX, batter's stumps at arrivalX, 18.9 m apart.
 * @returns {{frames:{t:number,img:Uint8ClampedArray}[], W:number, H:number, releaseX:number, arrivalX:number,
 *            distanceM:number, trueReleaseKmh:number, trueAverageKmh:number}}
 */
export function sideOnClip({ fps, kmh, dir = 1, noise = 6, seed = 1 }) {
  const W = 800, H = 160, rnd = rng(seed);
  const releaseX = dir > 0 ? 60 : 740, arrivalX = dir > 0 ? 740 : 60, distanceM = 18.9;
  const span = Math.abs(arrivalX - releaseX), ppm = span / distanceM, v = (kmh / 3.6) * ppm * dir;
  const bg = grass(W, H, rnd);
  const tRel = 0.5, flight = span / Math.abs(v), bounceAt = 0.75, slowAfter = 0.85;
  const r = Math.max(1, 0.036 * ppm), exposure = 1 / Math.max(fps * 2, 120);
  const frames = [];
  for (let f = 0; f < Math.round((tRel + flight * 1.3 + 0.3) * fps); f++) {
    const t = f / fps;
    const c = canvas(W, H, rnd, noise, bg);
    const bx = releaseX - dir * 30 + dir * Math.min(t, tRel) * 40;
    c.rect(bx - 15, 40, 30, 120, [200, 190, 170]);
    c.rect(bx + Math.cos(t * 14) * 35 - 4, 60 + Math.sin(t * 14) * 35 - 4, 8, 8, [210, 170, 140]);
    c.rect(arrivalX + dir * 15 - 10, 30, 20, 130, [230, 230, 230]);
    if (t > tRel + flight * 0.9) c.rect(arrivalX - dir * 10 + Math.sin(t * 20) * 25, 100, 6, 40, [180, 140, 90]);
    for (let k = 0; k < 6; k++) {   // motion blur
      const tt = t - tRel + exposure * k / 5;
      if (tt < 0) continue;
      const tb = flight * bounceAt;
      const x = releaseX + v * (tt < tb ? tt : tb + (tt - tb) * slowAfter);
      if ((x - releaseX) * dir > span * 1.25) continue;
      const y = tt < tb ? 50 + 95 * (tt / tb) ** 2 : 145 - 60 * (tt - tb) / flight;
      c.disc(x, y, r, RED);
    }
    frames.push({ t, img: c.img });
  }
  const trueT = flight * bounceAt + (span * (1 - bounceAt)) / (Math.abs(v) * slowAfter);
  return { frames, W, H, releaseX, arrivalX, distanceM, trueReleaseKmh: kmh, trueAverageKmh: (distanceM / trueT) * 3.6 };
}

/**
 * Umpire-view clip: perspective camera behind the bowler; the ball disappears into the batter 17.5 m away.
 */
export function umpireClip({ fps, kmh, noise = 5, seed = 3, camX = 0.6 }) {
  const W = 800, H = 450, f = 700, cam = { X: camX, Y: 1.7, Z: -2.5 }, rnd = rng(seed);
  const proj = (X, Y, Z) => ({ x: 400 + f * (X - cam.X) / (Z - cam.Z), y: 225 - f * (Y - cam.Y) / (Z - cam.Z), r: f * 0.036 / (Z - cam.Z) });
  const v = kmh / 3.6, distanceM = 17.5, tRel = 0.4, flight = distanceM / v;
  const bg = grass(W, H, rnd, 200);
  const frames = [];
  for (let fi = 0; fi < Math.round((tRel + flight + 0.4) * fps); fi++) {
    const t = fi / fps;
    const c = canvas(W, H, rnd, noise, bg);
    const b = proj(0.1, 1.0, 18.2);
    c.rect(b.x - 12, b.y - 30, 24, 60, [235, 235, 235]);
    c.rect(b.x + 10 + Math.sin(t * 9) * 6, b.y, 4, 20, [180, 140, 90]);
    const bw = proj(0.25, 1.2, -0.5 + Math.min(t, tRel) * 2);
    c.rect(bw.x - 45, bw.y - 110, 90, 260, [225, 225, 225]);
    c.rect(bw.x + Math.cos(t * 10) * 80 - 10, bw.y - 120 + Math.sin(t * 10) * 60 - 10, 20, 20, [210, 170, 140]);
    const tb = t - tRel;
    if (tb >= 0) {
      const Z = v * tb;
      if (Z < distanceM) {
        const bz = 13.5;
        const Y = Z < bz ? 2.2 - (2.2 - 0.036) * (Z / bz) ** 2 : 0.036 + 0.6 * (Z - bz) / (distanceM - bz);
        const P = proj(0.3 - 0.2 * Z / distanceM, Y, Z);
        c.disc(P.x, P.y, Math.max(1, P.r), RED);
      }
    }
    frames.push({ t, img: c.img });
  }
  return { frames, W, H, distanceM, release: proj(0.3, 2.2, 0), arrival: proj(0.1, 0.6, distanceM), trueKmh: kmh, trueReleaseTime: tRel };
}
