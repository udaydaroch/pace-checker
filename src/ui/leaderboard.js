// The shared leaderboard (stored in the artifact's database) and saving a reading to it.

import { MAX_SAVE_KMH } from '../config.js';
import { selectReading, selectFps } from '../state/store.js';
import { $, show, escapeHtml, storage } from './dom.js';

const COLLECTION = 'deliveries';
const NAME_KEY = 'sg_name';
const LOAD_TIMEOUT_MS = 10000;

/** @param {import('../state/store.js').Store} store */
export function mountLeaderboard(store) {
  const board = createBoardView();
  const saver = createSaveForm(store);

  connect().then(conn => {
    if (!conn) return;
    saver.enable(conn);
    board.attach(conn);
  });

  async function connect() {
    if (!window.claude || typeof window.claude.use !== 'function') {
      board.message('The shared leaderboard only works on the published page. Speed timing still works.');
      return null;
    }
    let db = null;
    try { db = await window.claude.use('db'); } catch { db = null; }
    if (!db) { board.message('Sign in to see and add to the shared leaderboard. Speed timing still works.'); return null; }
    let canWrite = true;
    try {
      const user = await window.claude.use('user');
      if (user && typeof user.can === 'function' && (await user.can('data.write')) === false) canWrite = false;
    } catch { /* unknown: let refused writes decide */ }
    return { db, canWrite };
  }
}

/** The table of saved deliveries with Fastest / Recent tabs. */
function createBoardView() {
  const msg = $('boardMsg'), table = $('board'), tbody = table.querySelector('tbody');
  let rows = [], view = 'top', conn = null;

  const message = text => { show(table, false); show(msg); msg.textContent = text; };

  function render() {
    const list = rows.slice()
      .sort(view === 'top' ? (a, b) => b.kmh - a.kmh : (a, b) => (b.at || 0) - (a.at || 0))
      .slice(0, 25);
    if (!list.length) { message('No deliveries saved yet. Time one and save it to start the board.'); return; }
    show(msg, false); show(table);
    const medal = i => (view !== 'top' ? '' : ['<span class="medal">🥇</span>', '🥈', '🥉'][i] ?? i + 1);
    tbody.innerHTML = list.map((r, i) => `
      <tr>
        <td class="rank">${medal(i)}</td>
        <td>${escapeHtml(r.name || 'Unknown')}</td>
        <td class="n"><b>${Number(r.kmh).toFixed(1)}</b></td>
        <td class="n sub">${r.at ? new Date(r.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''}</td>
        <td class="n">${conn?.canWrite ? `<button class="x" data-del="${escapeHtml(r.id)}" title="Remove">✕</button>` : ''}</td>
      </tr>`).join('');
  }

  const setView = v => {
    view = v;
    $('tabTop').classList.toggle('on', v === 'top');
    $('tabRecent').classList.toggle('on', v === 'recent');
    render();
  };
  $('tabTop').onclick = () => setView('top');
  $('tabRecent').onclick = () => setView('recent');

  // two-tap delete: first tap asks, second confirms
  table.addEventListener('click', async e => {
    const b = e.target.closest('[data-del]');
    if (!b || !conn) return;
    if (b.dataset.confirm !== '1') {
      b.dataset.confirm = '1'; b.textContent = 'Delete?';
      setTimeout(() => { if (b.isConnected) { b.dataset.confirm = ''; b.textContent = '✕'; } }, 3000);
      return;
    }
    b.disabled = true;
    try { await conn.db.collection(COLLECTION).doc(b.dataset.del).delete(); }
    catch { b.disabled = false; b.textContent = '✕'; }
  });

  return {
    message,
    attach(c) {
      conn = c;
      const timer = setTimeout(() => message("Can't reach the leaderboard right now."), LOAD_TIMEOUT_MS);
      c.db.collection(COLLECTION).orderBy('at', 'desc').limit(500).onSnapshot(snap => {
        if (!snap.metadata.fromCache) clearTimeout(timer);
        rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => typeof r.kmh === 'number');
        render();
      }, () => { clearTimeout(timer); message("The leaderboard isn't available right now."); });
    },
  };
}

/** The "Bowler's name / Save to leaderboard" form under the reading. */
function createSaveForm(store) {
  const box = $('saveBox'), row = box.querySelector('div'), name = $('bowler'), btn = $('saveBtn'), msg = $('saveMsg');
  let conn = null, lastKey = null;
  name.value = storage.get(NAME_KEY) || '';

  /** What gets stored for the current reading, or null if there's nothing worth saving. */
  function record() {
    const s = store.get(), r = selectReading(s);
    if (!r || r.error || r.kmh > MAX_SAVE_KMH) return null;
    const rec = {
      kmh: +r.kmh.toFixed(1), mph: +r.mph.toFixed(1), distance: s.distanceM,
      seconds: +r.flightS.toFixed(4), fps: selectFps(s), frames: r.frames, method: r.method,
    };
    if (r.method === 'auto') rec.releaseKmh = +r.gun.kmh.toFixed(1);
    return rec;
  }

  function refresh() {
    const rec = record();
    show(box, !!conn && conn.canWrite && !!rec);
    // a new reading resets the form
    const key = rec && `${rec.kmh}|${rec.seconds}|${rec.distance}`;
    if (key !== lastKey) { lastKey = key; msg.textContent = ''; show(row); }
  }
  store.subscribe(refresh);

  btn.onclick = async () => {
    const rec = record();
    if (!conn || !rec) return;
    const who = name.value.trim();
    if (!who) { name.focus(); msg.textContent = 'Add a name first.'; return; }
    btn.disabled = true;
    try {
      await conn.db.collection(COLLECTION).add({ name: who.slice(0, 40), ...rec, at: Date.now() });
      storage.set(NAME_KEY, who);
      msg.textContent = 'Saved ✓';
      show(row, false);
    } catch (err) {
      if (err?.code === 'invalid_argument') { conn.canWrite = false; msg.textContent = 'You can view the board but not add to it. Ask the owner to make you a Contributor.'; }
      else if (err?.code === 'quota_exceeded') msg.textContent = 'The board is full. Delete some old entries first.';
      else msg.textContent = "Couldn't save. Try again.";
    } finally { btn.disabled = false; }
  };

  return {
    enable(c) {
      conn = c;
      if (!c.canWrite) box.remove();
      refresh();
    },
  };
}
