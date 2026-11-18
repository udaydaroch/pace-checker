# Bowling Speed Gun

Measure a cricket delivery's speed from a phone video. Film side-on (or from behind the bowler), tap the release point and the batter, and the page finds the ball, times it and replays the delivery with the ball's path drawn on.

## Commands

| Command | What it does |
|---|---|
| `npm install` | Installs the one dev dependency (esbuild). |
| `npm run dev` | Serves `src/` at http://localhost:5173 (native ES modules, no build). |
| `npm test` | Unit tests plus detection tests on made-up footage (`node:test`, about 10 s). |
| `npm run build` | Bundles everything into a single self-contained `dist/index.html`. |
| `npm run preview` | Builds, then serves `dist/`. |

`dist/index.html` is the file published as the artifact.

## Layout

```
src/
  main.js                 composition root: builds the pieces and wires them together
  config.js               every tunable number (physics limits, thresholds, presets, colours)
  core/                   pure logic: no DOM, unit-tested in Node
    geometry.js             line fitting, point-on-segment coordinates, seeded random
    blobs.js                finding moving blobs: frame differencing, background model
    sideOnTracker.js        robust straight-line fit and gate timing for side-on footage
    umpireTracker.js        chain tracking for footage from behind the bowler
    speed.js                timestamps + distance → speed reading, accuracy, warnings
    fps.js                  frame rate from presented-frame timestamps
    searchRegion.js         validating tap points and choosing the area to search
  video/
    videoController.js      wraps <video>: loading, exact frame on screen, stepping
    frameScanner.js         reading cropped frames out of the clip for analysis
  detect/
    autoDetector.js         one detection run; each camera view is a strategy (detector + tracker)
  state/
    store.js                single app state, subscribe/notify, selectors (fps, reading)
  ui/                       one module per part of the page; each renders from state
    pitchSetup.js  videoLoader.js  playerControls.js  overlay.js  replay.js
    autoPanel.js   markPanel.js    resultCard.js      leaderboard.js  dom.js
  index.html, styles.css
tests/
  core.test.js            speed, fps, geometry, regions, blobs, store
  trackers.test.js        full detect + track pipeline on synthetic clips (both views)
  helpers/synthetic.js    made-up footage generator
scripts/
  build.mjs  serve.mjs
```

## Design notes

- **Data flows one way.** UI modules change the app state through `store.set()`. Every module renders from state in its `subscribe` callback. Derived values (the fps in use, the speed reading) come from selectors, not stored copies, so they can't drift.
- **Pure core, thin shell.** Everything that decides a number lives in `core/` and takes plain data: RGBA arrays, timestamps, points. The browser-specific parts (`video/`, `ui/`) only move data in and out. That's why the trackers can be tested in Node on generated frames.
- **Camera views are strategies.** `detect/autoDetector.js` maps each view to a detector and a tracker. Adding a new view means adding one entry. `createPipeline()` exposes the DOM-free part, so the tests run exactly what the app runs.
- **Tunables live in `config.js`.** Change a threshold there, then run `npm test` to see what it does to accuracy.

## Accuracy (made-up footage, see `tests/trackers.test.js`)

- **Side-on:** speed out of the hand within 1.5%; average speed down the pitch within 4% (the ball slows after pitching).
- **Umpire view:** within 3% at 60 fps and 2% at 240 fps. At 30 fps, about 6%, because ±1 frame at each end is already about 5%.

It hasn't been tested on real phone footage yet.
