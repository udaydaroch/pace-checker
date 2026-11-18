// Step 1: the distance being timed over.

import { PITCH_PRESETS, DEFAULT_DISTANCE_M } from '../config.js';
import { $ } from './dom.js';

/** @param {import('../state/store.js').Store} store */
export function mountPitchSetup(store) {
  const preset = $('preset'), dist = $('dist');

  preset.innerHTML = '';
  for (const p of PITCH_PRESETS) preset.add(new Option(p.label, p.metres.toFixed(2)));
  preset.add(new Option('Custom distance…', 'custom'));
  preset.value = DEFAULT_DISTANCE_M.toFixed(2);
  dist.value = DEFAULT_DISTANCE_M.toFixed(2);

  const commit = () => store.set({ distanceM: parseFloat(dist.value) });

  preset.addEventListener('change', () => {
    if (preset.value === 'custom') { dist.focus(); return; }
    dist.value = preset.value;
    commit();
  });
  dist.addEventListener('input', () => {
    const match = [...preset.options].find(o => o.value === dist.value);
    preset.value = match ? match.value : 'custom';
    commit();
  });
}
