import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { checkDoc } from '@flowread/core/check.js';
import { convertFile, convertText, convertUrl } from '../shared/api.js';
import { saveDoc, saveSource } from '../shared/storage.js';

export const WAKE_AFTER_MS = 5000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const FILE_STEPS = [
  { id: 'upload', label: 'Uploading' },
  { id: 'layout', label: 'Reading the page layout' },
  { id: 'tables', label: 'Finding tables' },
  { id: 'images', label: 'Describing images' },
  { id: 'structure', label: 'Rebuilding headings and lists' },
  { id: 'check', label: 'Checking accessibility' },
];
export const QUICK_STEPS = [
  { id: 'upload', label: 'Sending' },
  { id: 'structure', label: 'Rebuilding headings and lists' },
  { id: 'check', label: 'Checking accessibility' },
];

export function kindOfFile(file) {
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.pdf') || file?.type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx')) return 'docx';
  if (name.endsWith('.pptx')) return 'pptx';
  return null;
}

export function describeImportError(err, kind) {
  const status = err?.status;
  const msg = String(err?.message || '');
  if (/storage full/i.test(msg)) {
    return {
      title: 'This browser is out of space',
      detail: 'The document converted but could not be saved. Delete a document from your library and try again.',
    };
  }
  if (status === 413) return { title: 'That file is too large', detail: 'Files can be up to 25 MB. Split or compress it and try again.' };
  if (status === 415) return { title: 'That file type isn’t supported', detail: 'Use a PDF, Word (.docx) or PowerPoint (.pptx) file.' };
  if (status === 0) {
    return {
      title: 'The FlowRead server can’t be reached',
      detail: 'Check your connection and try again. If the server was asleep, a second try usually works.',
    };
  }
  if (status === 404 && kind !== 'file') {
    return { title: 'This import option isn’t available yet', detail: 'The server doesn’t support it yet. Try uploading a file instead.' };
  }
  if (kind === 'url' && (status === 400 || status === 422)) {
    return { title: 'That page couldn’t be read', detail: msg || 'Check that the link is a public web page or PDF and try again.' };
  }
  return { title: 'The conversion didn’t finish', detail: msg || 'Something went wrong on the server. Try again.' };
}

/**
 * Runs one import (file, text or link) with progress, a "waking the server"
 * state for cold starts, cancel, and save-then-open.
 */
export function useImport() {
  const navigate = useNavigate();
  const [state, setState] = useState({ phase: 'idle' });
  const abortRef = useRef(null);
  const timerRef = useRef(null);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(
    () => () => {
      abortRef.current?.abort();
      clearTimer();
    },
    [],
  );

  const run = useCallback(
    async (kind, payload) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const startedAt = Date.now();
      const steps = kind === 'file' ? FILE_STEPS : QUICK_STEPS;
      setState({
        phase: 'running',
        kind,
        steps,
        step: 'upload',
        message: '',
        pct: 2,
        startedAt,
        elapsed: 0,
        heard: false,
        label: payload.label,
      });

      clearTimer();
      timerRef.current = setInterval(() => {
        setState((s) => (s.phase === 'running' ? { ...s, elapsed: Date.now() - startedAt } : s));
      }, 1000);

      let doc;
      try {
        if (kind === 'file') {
          doc = await convertFile(payload.file, {
            signal: ctrl.signal,
            onProgress: (evt) =>
              setState((s) =>
                s.phase === 'running'
                  ? {
                      ...s,
                      heard: true,
                      step: evt.step || s.step,
                      message: evt.message || s.message,
                      pct: typeof evt.pct === 'number' ? Math.max(s.pct, evt.pct) : s.pct,
                    }
                  : s,
              ),
          });
        } else if (kind === 'text') {
          doc = await convertText(payload.text, { title: payload.title, signal: ctrl.signal });
        } else {
          doc = await convertUrl(payload.url, { signal: ctrl.signal });
        }
      } catch (err) {
        clearTimer();
        if (err?.name === 'AbortError') {
          setState({ phase: 'idle' });
          return;
        }
        setState({ phase: 'error', kind, error: describeImportError(err, kind) });
        return;
      }
      if (ctrl.signal.aborted) return;

      const now = new Date().toISOString();
      const fileKind = kind === 'file' ? kindOfFile(payload.file) : kind;
      const saved = {
        ...doc,
        source: doc.source || { kind: fileKind, pages: null, url: kind === 'url' ? payload.url : null },
        sourceFile: doc.sourceFile || (kind === 'file' ? payload.file.name : kind === 'url' ? payload.url : null),
        createdAt: doc.createdAt || now,
        updatedAt: now,
      };
      try {
        saved.report = checkDoc(saved);
      } catch {
        /* keep the server report */
      }
      try {
        await saveDoc(saved);
        if (kind === 'file' && fileKind === 'pdf') {
          await saveSource(saved.id, payload.file).catch(() => {});
        }
      } catch (err) {
        clearTimer();
        setState({ phase: 'error', kind, error: describeImportError(err, kind) });
        return;
      }
      clearTimer();
      setState({ phase: 'done', kind });
      navigate(`/read/${encodeURIComponent(saved.id)}`);
    },
    [navigate],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    clearTimer();
    setState({ phase: 'idle' });
  }, []);

  const reset = useCallback(() => setState({ phase: 'idle' }), []);

  const waking = state.phase === 'running' && !state.heard && state.elapsed >= WAKE_AFTER_MS;
  return { state, waking, run, cancel, reset };
}
