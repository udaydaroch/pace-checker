// The auto-detect box: choosing the camera view, tapping the two points, running detection and
// replaying the result.

import { selectFps } from '../state/store.js';
import { validateTaps } from '../core/searchRegion.js';
import { detectDelivery } from '../detect/autoDetector.js';
import { playReplay } from './replay.js';
import { $, show } from './dom.js';

const COPY = {
  side: {
    hint: "Tap two points on the video: where the ball leaves the bowler's hand, then the base of the batter's stumps. The page then finds the ball itself and times it between them.",
    tapSecond: "Now tap the base of the batter's stumps.",
    ready: 'Points set. Go back to a frame just before the ball is bowled, then tap Find the ball. Check step 1 is release → stumps (18.90 m on a full pitch).',
    found: n => `Found the ball in ${n} frames ✓ Watch the replay to check the ring stays on the ball. You can also step through it frame by frame.`,
    failTip: 'film in good light, side-on, with the whole pitch in shot',
    failLead: "Couldn't find the ball's path.",
  },
  umpire: {
    hint: 'Filmed from behind the bowler? Tap the ball as it leaves the hand, then where it reaches the batter (pads or bat). Less precise than side-on: about ±1 frame at each end, so use slo-mo.',
    tapSecond: 'Now step on to where the ball reaches the batter and tap it there.',
    ready: 'Points set. Go back to a frame just before the ball is bowled, then tap Find the ball. In step 1, "release → batter\'s crease" (17.68 m) is closest for where the ball meets the batter.',
    found: n => `Followed the ball for ${n} frames ✓ Watch the replay to check the ring stays on the ball and stops where it reaches the batter. If an end is off, step to the right frame and fix it with the buttons below.`,
    failTip: 'film in good light with the batter in shot and nothing blocking the ball',
    failLead: "Couldn't follow the ball down the pitch.",
  },
};
const SKIPPED_NOTE = " (Some frames were skipped while scanning, so it's a little less precise.)";

/**
 * @param {import('../state/store.js').Store} store
 * @param {import('../video/videoController.js').VideoController} video
 * @param {ReturnType<import('./overlay.js').createOverlay>} overlay
 * @param {{redraw:()=>void}} overlayView
 */
export function mountAutoPanel(store, video, overlay, overlayView) {
  const el = {
    tabs: [...document.querySelectorAll('#viewTabs button')],
    hint: $('autoHint'), tap: $('tapBtn'), find: $('findBtn'), replay: $('replayBtn'),
    prog: $('prog'), bar: $('progBar'), msg: $('amsg'), stage: $('stage'), canvas: overlay.canvas,
  };
  let abort = null;

  const say = (text, bad = false) => { el.msg.textContent = text; el.msg.classList.toggle('bad', bad); };
  const copy = () => COPY[store.get().view];

  // ---- render from state ----
  video.element.addEventListener('loadstart', () => say(''));   // a new clip clears any old message
  store.subscribe(s => {
    el.tabs.forEach(b => b.classList.toggle('on', b.dataset.view === s.view));
    el.hint.textContent = COPY[s.view].hint;
    el.canvas.classList.toggle('tap', s.tapping);
    el.find.disabled = !s.scanning && s.taps.length !== 2;
    el.find.textContent = s.scanning ? '✕ Stop' : '🔍 Find the ball';
    el.tap.disabled = s.scanning;
    show(el.replay, !!s.track && !s.scanning);
    el.replay.disabled = s.replaying;
    show(el.prog, s.scanning);
  });

  // ---- camera view ----
  el.tabs.forEach(b => b.onclick = () => {
    if (store.get().scanning) return;
    store.set({ view: b.dataset.view, taps: [], tapping: false, track: null });
    say('');
  });

  // ---- tapping the two points ----
  el.tap.onclick = () => {
    if (!video.ready || store.get().scanning) return;
    video.pause();
    store.set({ taps: [], tapping: true, track: null });
    say('Step to the frame where the ball leaves the hand, then tap the ball.');
    el.stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  el.canvas.addEventListener('click', e => {
    const s = store.get();
    if (!s.tapping) return;
    const p = overlay.clientToVideo(e.clientX, e.clientY);
    if (!p) return;
    const taps = [...s.taps, p];
    if (taps.length === 1) { store.set({ taps }); say(copy().tapSecond); return; }
    const check = validateTaps(s.view, taps, video.width, video.height);
    if (!check.ok) { store.set({ taps: [], tapping: false }); say(check.message, true); return; }
    store.set({ taps, tapping: false });
    say(copy().ready);
  });

  // ---- detection ----
  el.find.onclick = async () => {
    if (abort) { abort.abort(); return; }
    const s = store.get();
    if (s.taps.length !== 2 || !video.ready) return;
    if (!(s.distanceM > 0)) { say('Enter the distance in step 1 first.', true); return; }

    abort = new AbortController();
    store.set({ scanning: true, track: null });
    el.bar.style.width = '0';
    say('Scanning the video…');
    let outcome;
    try {
      outcome = await detectDelivery({
        video, view: s.view, taps: s.taps, distanceM: s.distanceM, fps: selectFps(s), slow: s.slow,
        signal: abort.signal, onProgress: f => { el.bar.style.width = (f * 100).toFixed(1) + '%'; },
      });
    } catch {
      outcome = { status: 'error' };
    } finally {
      abort = null;
      store.set({ scanning: false });
    }
    handleOutcome(outcome, s);
  };

  function handleOutcome(o, s) {
    const c = COPY[s.view];
    switch (o.status) {
      case 'cancelled': say('Stopped.'); return;
      case 'error': say("Couldn't play the video to scan it. Try tapping the video once, then Find the ball again.", true); return;
      case 'failed': {
        if (o.reason === 'tooShort') { say('Not enough video to scan from here. Go back a bit and try again.', true); return; }
        const tips = [];
        if (o.shaky) tips.push('the camera seems to be moving, so prop the phone on something');
        tips.push('make sure the scan starts before the ball is bowled', c.failTip);
        say(`${c.failLead} Try again: ${tips.join('; ')}. Or mark the frames by hand below.`, true);
        return;
      }
      case 'lostBall':
        store.set({ release: o.releaseTime, arrival: null, track: null });
        video.seek(o.lastSeenTime);
        say('Found the release, but lost the ball before it reached the batter. Step forward to the frame where it reaches the batter, then tap "Ball reaches batter" below.', true);
        return;
      case 'found':
        store.set({ release: o.track.releaseTime, arrival: o.track.arrivalTime, track: o.track });
        say(c.found(o.track.points.length) + (o.skipped ? SKIPPED_NOTE : ''));
        replay();
    }
  }

  // ---- replay ----
  async function replay() {
    const s = store.get();
    if (!s.track || s.scanning || s.replaying) return;
    store.set({ replaying: true });
    el.stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
    try { await playReplay(video, s.track, { slow: s.slow, onFrame: overlayView.redraw }); }
    catch { /* autoplay refused: the user can press Replay */ }
    finally { store.set({ replaying: false }); }
  }
  el.replay.onclick = replay;
}
