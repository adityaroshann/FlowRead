// IndexedDB document store (idb-keyval). Everything is async.
//
//   doc:<id>     -> AccessDoc
//   src:<id>     -> Blob (the original uploaded file, for side-by-side view)
//
// On first use, any docs left in the old localStorage map
// (`flowread-access:docs`) are copied across once and the old key removed.

import { createStore, del, entries, get, set } from 'idb-keyval';

export const DOCS_KEY = 'flowread-access:docs'; // legacy localStorage key
export const DOCS_CHANGED_EVENT = 'flowread-access:docs-changed';

const DOC_PREFIX = 'doc:';
const SRC_PREFIX = 'src:';

let store = null;
function db() {
  if (!store) store = createStore('flowread', 'docs');
  return store;
}

function isQuotaError(err) {
  if (!err) return false;
  return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22;
}

function wrapWriteError(err) {
  if (isQuotaError(err)) return new Error('Storage full');
  return new Error('Storage unavailable');
}

function changed(detail) {
  try {
    window.dispatchEvent(new CustomEvent(DOCS_CHANGED_EVENT, { detail }));
  } catch {
    /* non-browser environment */
  }
}

let migration = null;
/** Copy legacy localStorage docs into IndexedDB once. Safe to call repeatedly. */
export function migrateLegacy() {
  if (migration) return migration;
  migration = (async () => {
    let raw = null;
    try {
      raw = window.localStorage.getItem(DOCS_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    let map = null;
    try {
      map = JSON.parse(raw);
    } catch {
      map = null;
    }
    if (map && typeof map === 'object' && !Array.isArray(map)) {
      for (const doc of Object.values(map)) {
        if (doc && typeof doc === 'object' && doc.id) {
          const existing = await get(DOC_PREFIX + doc.id, db()).catch(() => null);
          if (!existing) await set(DOC_PREFIX + doc.id, doc, db()).catch(() => {});
        }
      }
    }
    try {
      window.localStorage.removeItem(DOCS_KEY);
    } catch {
      /* ignore */
    }
  })();
  return migration;
}

/** All stored docs, newest first (by updatedAt, then createdAt). */
export async function listDocs() {
  await migrateLegacy();
  let all = [];
  try {
    all = await entries(db());
  } catch {
    return [];
  }
  return all
    .filter(([k, v]) => String(k).startsWith(DOC_PREFIX) && v && typeof v === 'object' && v.id)
    .map(([, v]) => v)
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
}

/** One doc by id, or null. */
export async function getDoc(id) {
  if (!id) return null;
  await migrateLegacy();
  try {
    const doc = await get(DOC_PREFIX + id, db());
    return doc && typeof doc === 'object' ? doc : null;
  } catch {
    return null;
  }
}

/** Insert or replace a doc. Resolves to the saved doc. Rejects with Error('Storage full') on quota. */
export async function saveDoc(doc) {
  if (!doc || !doc.id) throw new Error('saveDoc: doc.id is required');
  await migrateLegacy();
  try {
    await set(DOC_PREFIX + doc.id, doc, db());
  } catch (err) {
    throw wrapWriteError(err);
  }
  changed({ id: doc.id, type: 'save' });
  return doc;
}

/** Remove a doc and its source file. Resolves true if something was removed. */
export async function deleteDoc(id) {
  if (!id) return false;
  const existing = await getDoc(id);
  try {
    await del(DOC_PREFIX + id, db());
    await del(SRC_PREFIX + id, db());
  } catch {
    return false;
  }
  changed({ id, type: 'delete' });
  return !!existing;
}

/** Keep the original file (PDF etc.) so the reader can show it side by side. */
export async function saveSource(id, blob) {
  if (!id || !(blob instanceof Blob)) return;
  try {
    await set(SRC_PREFIX + id, blob, db());
  } catch (err) {
    throw wrapWriteError(err);
  }
}

/** The original file as a Blob, or null. */
export async function getSource(id) {
  if (!id) return null;
  try {
    const blob = await get(SRC_PREFIX + id, db());
    return blob instanceof Blob ? blob : null;
  } catch {
    return null;
  }
}
