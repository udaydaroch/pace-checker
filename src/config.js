// Every tunable number in one place, grouped by what it affects.

/** Distances (metres) people commonly time over. */
export const PITCH_PRESETS = [
  { metres: 18.90, label: "Full pitch: release → batter's stumps (18.90 m)" },
  { metres: 17.68, label: "Full pitch: release → batter's crease (17.68 m)" },
  { metres: 20.12, label: 'Stumps → stumps (20.12 m)' },
];
export const DEFAULT_DISTANCE_M = 18.90;

/** Physics of a cricket ball and of human bowling. */
export const BALL_DIAMETER_M = 0.072;
export const BOWLING_SPEED_MS = { min: 8, max: 50 };   // ~30–180 km/h
export const MAX_PLAUSIBLE_KMH = 165;                  // anything faster is a mis-detection
export const WARN_FAST_KMH = 170;
export const WARN_SLOW_KMH = 25;
export const MAX_SAVE_KMH = 200;
/** Speed guns read just out of the hand; average-down-the-pitch is roughly this much lower. */
export const SPEED_GUN_FACTOR = 1.1;

/** Frame-rate detection. */
export const FPS = {
  fallback: 30,
  common: [24, 25, 30, 48, 50, 60, 90, 100, 120, 240],
  snapTolerance: 0.12,          // snap to a common rate if within 12%
  sampleFrames: 40,
  sampleMs: 900,
  choices: [24, 25, 30, 60, 120, 240],
};

/** How a clip is scanned for the ball. */
export const SCAN = {
  maxCropWidth: 800,            // pixels; the crop is scaled down to this for speed
  windowSeconds: 4,             // real seconds scanned from the frame on screen…
  wholeClipUnderSeconds: 6,     // …unless the clip is shorter than this
  renderFps: 60,                // playback is slowed so roughly this many frames/s are decoded
  minPlaybackRate: 0.0625,
  skippedFrameRatio: 0.6,       // fewer frames than this share of expected = "frames were skipped"
};

/** Side-on detection (three-frame differencing + robust straight-line fit). */
export const SIDE_ON = {
  minGateSpanOfWidth: 0.2,      // the two tap points must be at least this far apart across the frame
  regionPadX: 0.12, regionPadAbove: 0.10, regionPadBelow: 0.05,  // × gate span
  diffMinThreshold: 36,
  minInliers: 4,
  minSpanOfGates: 0.35,
  shakyMaskShare: 0.15,
};

/** Umpire-view detection (background model + chain tracking). */
export const UMPIRE = {
  minTapDistanceOfFrame: 0.08,
  regionPadSide: 0.35, regionPadAbove: 0.25, regionPadBelow: 0.4, regionMinPadOfWidth: 0.05, // × tap distance
  cropAspectAllowance: 1.4,
  bgMinThreshold: 40,
  minBlobArea: 3,
  backgroundTimeConstantS: 0.25,
  historySeconds: 1 / 30,       // also compare with the frame this long ago (drops background "ghosts")
  shakyMaskShare: 0.3,
};

/** Overlay and replay. */
export const REPLAY = {
  rate: 0.25,                   // of real time
  leadInS: 0.4,
  tailS: 0.6,
};

export const COLOURS = {
  accent: '#c8f169',
  accentInk: '#13200f',
  ball: '#ff6b5a',
  ballGlow: 'rgba(255,107,90,.25)',
  ballFaint: 'rgba(255,107,90,.4)',
  searchBox: 'rgba(200,241,105,.35)',
};
