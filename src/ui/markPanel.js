// Marking the release and arrival frames by hand.

import { $, formatSeconds } from './dom.js';

/**
 * @param {import('../state/store.js').Store} store
 * @param {import('../video/videoController.js').VideoController} video
 */
export function mountMarkPanel(store, video) {
  // Marking by hand replaces the auto-detected path; the other end keeps its time.
  const mark = key => () => { video.pause(); store.set({ [key]: video.shownTime, track: null }); };
  $('mark1').onclick = mark('release');
  $('mark2').onclick = mark('arrival');

  store.subscribe(s => {
    $('m1t').textContent = formatSeconds(s.release);
    $('m2t').textContent = formatSeconds(s.arrival);
    $('m1').classList.toggle('set', s.release != null);
    $('m2').classList.toggle('set', s.arrival != null);
  });
}
