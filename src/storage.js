// Small wrapper around localStorage. Every call is guarded: in private windows or with
// blocked site data the browser can throw, and the app must keep working without it.

export const PREFIX = "mikardex.";

export function load(key, fallback) {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

export function save(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (err) {
    return false;
  }
}

export function remove(key) {
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch (err) {
    // nothing to do
  }
}
