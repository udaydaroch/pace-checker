// Step 2: picking or recording a clip, then measuring its frame rate.

import { $, show } from './dom.js';
import { clearTiming } from '../state/store.js';

/**
 * @param {import('../state/store.js').Store} store
 * @param {import('../video/videoController.js').VideoController} video
 */
export function mountVideoLoader(store, video) {
  async function load(file) {
    if (!file) return;
    store.set({ ...clearTiming(), fpsChoice: 'auto', detectedFps: null, fpsStatus: 'detecting' });
    show($('playerCard'));
    $('playerCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    await video.load(file);
    const fps = await video.detectFps();
    store.set({ detectedFps: fps, fpsStatus: fps ? 'detected' : 'unknown' });
  }
  for (const id of ['rec', 'pick']) $(id).addEventListener('change', e => load(e.target.files[0]));
}
