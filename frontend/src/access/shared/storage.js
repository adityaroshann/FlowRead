// localStorage-backed document store for the demo (no database).
// Key `flowread-access:docs` holds a JSON map of id -> AccessDoc.

export const DOCS_KEY = 'flowread-access:docs';
export const DOCS_CHANGED_EVENT = 'flowread-access:docs-changed';

function isQuotaError(err) {
  if (!err) return false;
  return (
    err.name === 'QuotaExceededError' ||
    err.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    err.code === 22 ||
    err.code === 1014
  );
}

function readMap() {
  try {
    const raw = window.localStorage.getItem(DOCS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    window.localStorage.setItem(DOCS_KEY, JSON.stringify(map));
  } catch (err) {
    if (isQuotaError(err)) throw new Error('Storage full');
    throw new Error('Storage unavailable');
  }
  try {
    window.dispatchEvent(new Event(DOCS_CHANGED_EVENT));
  } catch {
    /* non-browser environment */
  }
}

/** All stored docs, newest first (by updatedAt, then createdAt). */
export function listDocs() {
  const map = readMap();
  return Object.values(map)
    .filter((d) => d && typeof d === 'object' && d.id)
    .sort((a, b) =>
      String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')),
    );
}

/** One doc by id, or null. */
export function getDoc(id) {
  if (!id) return null;
  const doc = readMap()[id];
  return doc && typeof doc === 'object' ? doc : null;
}

/**
 * Insert or replace a doc (by doc.id). Returns the saved doc.
 * Throws Error('Storage full') when the quota is exceeded.
 */
export function saveDoc(doc) {
  if (!doc || !doc.id) throw new Error('saveDoc: doc.id is required');
  const map = readMap();
  map[doc.id] = doc;
  writeMap(map);
  return doc;
}

/** Remove a doc. Returns true if something was removed. */
export function deleteDoc(id) {
  const map = readMap();
  if (!(id in map)) return false;
  delete map[id];
  writeMap(map);
  return true;
}
