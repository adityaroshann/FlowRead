// Client for the FlowRead Access API (prefix /api/access).
// All helpers throw ApiError with a human-readable `message`; callers can show
// it directly or check `err.unavailable` to show a generic "not available" note.

export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '');

const PREFIX = '/api/access';

export class ApiError extends Error {
  constructor(message, { status = 0, detail = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    // 0 = network failure, 503 = AI off (no API key), 502 = AI call failed, 504 = timeout
    this.unavailable = status === 0 || status === 503 || status === 502 || status === 504;
  }
}

function url(path) {
  return `${API_BASE}${PREFIX}${path}`;
}

async function errorFromResponse(resp) {
  let detail = null;
  try {
    const body = await resp.json();
    detail = body?.detail ?? body?.message ?? null;
    if (Array.isArray(detail)) detail = detail.map((d) => d?.msg || String(d)).join('; ');
  } catch {
    /* not JSON */
  }
  let message;
  if (resp.status === 413) message = 'That file is too large. The limit is 25 MB.';
  else if (resp.status === 503) message = typeof detail === 'string' && detail ? detail : 'This feature is not available right now.';
  else if (typeof detail === 'string' && detail) message = detail;
  else message = `The server returned an error (${resp.status}).`;
  return new ApiError(message, { status: resp.status, detail });
}

function networkError(err) {
  if (err?.name === 'AbortError') return err;
  return new ApiError('Could not reach the FlowRead server.', { status: 0, detail: err?.message || null });
}

async function postJson(path, body, { signal } = {}) {
  let resp;
  try {
    resp = await fetch(url(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!resp.ok) throw await errorFromResponse(resp);
  try {
    return await resp.json();
  } catch {
    throw new ApiError('The server sent an unreadable response.', { status: resp.status });
  }
}

/**
 * Upload a PDF/DOCX and stream conversion progress (SSE over POST).
 * convertFile(file, { onProgress, describeImages = true, signal }) -> Promise<AccessDoc>
 * onProgress receives { type:'progress', step, message, pct }.
 */
export async function convertFile(file, { onProgress, describeImages = true, signal } = {}) {
  const form = new FormData();
  form.append('file', file);
  form.append('describeImages', describeImages ? 'true' : 'false');

  let resp;
  try {
    resp = await fetch(url('/convert'), {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      body: form,
      signal,
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!resp.ok) throw await errorFromResponse(resp);
  if (!resp.body) throw new ApiError('Streaming is not supported in this browser.', { status: resp.status });

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doc = null;

  const handleEvent = (raw) => {
    const data = raw
      .split(/\r?\n/)
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) return;
    let evt;
    try {
      evt = JSON.parse(data);
    } catch {
      return; // ignore malformed lines
    }
    if (evt.type === 'progress') {
      try {
        onProgress?.(evt);
      } catch {
        /* caller error shouldn't break the stream */
      }
    } else if (evt.type === 'done') {
      doc = evt.doc;
    } else if (evt.type === 'error') {
      throw new ApiError(evt.message || 'Conversion failed.', { status: 500, detail: evt.message || null });
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, '');
        handleEvent(raw);
        if (doc) break;
      }
      if (doc) break;
      if (done) {
        buffer += decoder.decode();
        if (buffer.trim()) handleEvent(buffer);
        break;
      }
    }
  } catch (err) {
    if (err instanceof ApiError || err?.name === 'AbortError') throw err;
    throw networkError(err);
  } finally {
    try {
      reader.cancel();
    } catch {
      /* already closed */
    }
  }

  if (!doc) throw new ApiError('The conversion ended before a document was produced.', { status: 0 });
  return doc;
}

/** plainLanguage(text, context?) -> Promise<string> */
export async function plainLanguage(text, context = '', opts) {
  const data = await postJson('/plain', { text, context: context || '' }, opts);
  if (!data || typeof data.plain !== 'string') throw new ApiError('No plain-language text was returned.', { status: 502 });
  return data.plain;
}

/** summarizeSection(heading, text) -> Promise<string> */
export async function summarizeSection(heading, text, opts) {
  const data = await postJson('/summary', { heading: heading || '', text }, opts);
  if (!data || typeof data.summary !== 'string') throw new ApiError('No summary was returned.', { status: 502 });
  return data.summary;
}

/** describeImage(src, context?) -> Promise<{ alt: string, decorative: boolean }> */
export async function describeImage(src, context = '', opts) {
  const data = await postJson('/describe-image', { src, context: context || '' }, opts);
  return { alt: typeof data?.alt === 'string' ? data.alt : '', decorative: !!data?.decorative };
}

/** Server-side report (the frontend can also use checkDoc from check.js). */
export async function checkDocRemote(doc, opts) {
  return postJson('/check', doc, opts);
}

/**
 * getHealth() -> Promise<{ status: string, ai: boolean }>
 * Never throws: an unreachable backend resolves to { status: 'offline', ai: false }.
 */
export async function getHealth({ signal } = {}) {
  try {
    const resp = await fetch(url('/health'), { headers: { Accept: 'application/json' }, signal });
    if (!resp.ok) return { status: 'error', ai: false };
    const data = await resp.json();
    return { status: String(data?.status || 'ok'), ai: !!data?.ai };
  } catch {
    return { status: 'offline', ai: false };
  }
}

/**
 * Pasted text -> AccessDoc. convertText(text, { title, signal })
 * Markdown-style `#` headings and `-` / `1.` lists are recognised by the server.
 */
export async function convertText(text, { title = '', signal } = {}) {
  const body = { text };
  if (title && title.trim()) body.title = title.trim();
  const doc = await postJson('/convert-text', body, { signal });
  if (!doc || !Array.isArray(doc.sections)) throw new ApiError('The server did not return a document.', { status: 502 });
  return doc;
}

/** Web link (article or PDF) -> AccessDoc. */
export async function convertUrl(link, { signal } = {}) {
  const doc = await postJson('/convert-url', { url: link }, { signal });
  if (!doc || !Array.isArray(doc.sections)) throw new ApiError('The server did not return a document.', { status: 502 });
  return doc;
}

/** define(term, context) -> Promise<string> (one or two plain sentences) */
export async function define(term, context = '', opts) {
  const data = await postJson('/define', { term, context: context || '' }, opts);
  if (!data || typeof data.definition !== 'string') throw new ApiError('No definition was returned.', { status: 502 });
  return data.definition;
}

/**
 * Accessible tagged PDF from the export service.
 * exportPdf(doc, settings, options, { signal }) -> Promise<Blob>
 * options: { pageSize: 'A4'|'Letter', includeSummaries, includePlain, includePageRefs, includeToc }
 */
export async function exportPdf(doc, settings, options, { signal } = {}) {
  let resp;
  try {
    resp = await fetch(`${API_BASE}/api/export/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/pdf' },
      body: JSON.stringify({ doc, settings, options }),
      signal,
    });
  } catch (err) {
    throw networkError(err);
  }
  if (!resp.ok) {
    const err = await errorFromResponse(resp);
    if (resp.status === 413) err.message = 'This document is too large for the PDF service.';
    throw err;
  }
  const blob = await resp.blob();
  if (!blob.size) throw new ApiError('The PDF service returned an empty file.', { status: resp.status });
  return blob.type === 'application/pdf' ? blob : new Blob([blob], { type: 'application/pdf' });
}
