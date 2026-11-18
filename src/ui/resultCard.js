// Step 4: showing the speed reading.

import { selectReading } from '../state/store.js';
import { $, show, escapeHtml } from './dom.js';

/** @param {import('../state/store.js').Store} store */
export function mountResultCard(store) {
  store.subscribe(s => render(selectReading(s)));
}

/** @param {import('../core/speed.js').SpeedReading | import('../core/speed.js').SpeedError | null} r */
function render(r) {
  show($('resultCard'), r != null);
  if (!r) return;
  const warn = $('warn');

  if (r.error) {
    for (const id of ['kmh', 'dt', 'range', 'gun']) $(id).textContent = '—';
    $('mph').textContent = '— mph';
    warn.textContent = r.error;
    show(warn);
    return;
  }

  $('kmh').textContent = r.kmh.toFixed(1);
  $('mph').textContent = r.mph.toFixed(1) + ' mph';
  $('dt').textContent = `${r.flightS.toFixed(3)} s · ${r.method === 'manual' ? r.frames + ' fr' : 'auto'}`;
  $('rangeLbl').textContent = r.range.label;
  $('range').textContent = isFinite(r.range.hi) ? `${r.range.lo.toFixed(0)}–${r.range.hi.toFixed(0)}` : '±large';
  $('gunLbl').textContent = r.gun.label;
  $('gun').textContent = (r.gun.approximate ? '~' : '') + r.gun.kmh.toFixed(0) + ' km/h';

  warn.innerHTML = r.warnings.map(escapeHtml).join('<br>');
  show(warn, r.warnings.length > 0);
}
