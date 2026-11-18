// Tiny DOM helpers shared by the UI modules.

export const $ = id => document.getElementById(id);

export const show = (el, visible = true) => el.classList.toggle('hidden', !visible);

export const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const formatSeconds = t => (t == null ? '—' : t.toFixed(3) + ' s');

/** Wrap localStorage: it can be missing or throw (private windows, blocked storage). */
export const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* not essential */ } },
};
