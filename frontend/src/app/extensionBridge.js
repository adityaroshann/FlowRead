// Web side of the FlowRead extension protocol (docs/v2/CONTRACT.md).
//
// Page -> extension: { source: 'flowread-app', type: 'hello' | 'setSettings' | 'getSettings', settings? }
// Extension -> page: { source: 'flowread-ext', type: 'ready' | 'settings' | 'openDoc', settings?, doc?, version? }
//
// Only messages from this same window (the extension's content script posts
// into it) with source === 'flowread-ext' are accepted. Everything here is
// optional: without the extension, nothing happens.

import { useSyncExternalStore } from 'react';
import { resolveSettings } from '@flowread/core/profiles.js';
import { getPrefs, setPrefs, subscribePrefs } from '../access/reader/readerPrefs.js';
import { saveDoc } from '../access/shared/storage.js';
import { checkDoc } from '@flowread/core/check.js';

let status = { connected: false, version: null };
const statusListeners = new Set();
let started = false;
let navigateFn = null;

function setStatus(next) {
  status = next;
  statusListeners.forEach((l) => l());
}

function post(type, extra = {}) {
  try {
    window.postMessage({ source: 'flowread-app', type, ...extra }, window.location.origin);
  } catch {
    /* ignore */
  }
}

function isValidDoc(doc) {
  return doc && typeof doc === 'object' && typeof doc.id === 'string' && /^[\w-]{1,80}$/.test(doc.id) && Array.isArray(doc.sections);
}

async function onMessage(event) {
  if (event.source !== window) return;
  const msg = event.data;
  if (!msg || typeof msg !== 'object' || msg.source !== 'flowread-ext') return;

  switch (msg.type) {
    case 'ready': {
      const version = typeof msg.version === 'string' ? msg.version.slice(0, 32) : msg.settings?.version || null;
      setStatus({ connected: true, version });
      // The app's settings win on connect when the reader has chosen a profile;
      // otherwise adopt whatever the extension has.
      const prefs = getPrefs();
      if (prefs.chosen) post('setSettings', { settings: prefs.settings });
      else post('getSettings');
      break;
    }
    case 'settings': {
      if (!msg.settings || typeof msg.settings !== 'object') return;
      const settings = resolveSettings(msg.settings);
      const prev = getPrefs();
      if (JSON.stringify(prev.settings) === JSON.stringify(settings)) return;
      setPrefs((p) => ({ ...p, settings, chosen: true }), { source: 'extension' });
      break;
    }
    case 'openDoc': {
      if (!isValidDoc(msg.doc)) return;
      const doc = { ...msg.doc, report: checkDoc(msg.doc), updatedAt: new Date().toISOString() };
      try {
        await saveDoc(doc);
      } catch {
        return;
      }
      navigateFn?.(`/read/${encodeURIComponent(doc.id)}`);
      break;
    }
    default:
      break;
  }
}

/** Start listening (idempotent). `navigate` comes from react-router. */
export function startExtensionBridge(navigate) {
  navigateFn = navigate;
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('message', onMessage);
  // Push app-side setting changes to the extension.
  subscribePrefs(() => {
    const p = getPrefs();
    if (status.connected && p.lastSource !== 'extension') post('setSettings', { settings: p.settings });
  });
  post('hello');
}

export function useExtensionStatus() {
  return useSyncExternalStore(
    (cb) => {
      statusListeners.add(cb);
      return () => statusListeners.delete(cb);
    },
    () => status,
    () => status,
  );
}
