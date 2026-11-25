import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { Switch } from 'react-aria-components';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

let pdfjsPromise = null;
function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

/**
 * The original PDF page next to the text. Follows the reader's position (the
 * nearest page marker) unless "Follow my place" is switched off.
 * Loaded lazily so pdf.js never weighs on the main bundle.
 */
export default function OriginalPane({ blob, page, onClose }) {
  const [pdf, setPdf] = useState(null);
  const [error, setError] = useState('');
  const [follow, setFollow] = useState(true);
  const [manual, setManual] = useState(1);
  const [rendering, setRendering] = useState(false);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(0);

  const total = pdf?.numPages || 0;
  const shown = Math.min(Math.max(1, follow ? page || 1 : manual), total || 1);

  useEffect(() => {
    let alive = true;
    let doc = null;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const data = new Uint8Array(await blob.arrayBuffer());
        doc = await pdfjs.getDocument({ data }).promise;
        if (alive) setPdf(doc);
      } catch {
        if (alive) setError('The original file couldn’t be opened.');
      }
    })();
    return () => {
      alive = false;
      doc?.destroy?.();
    };
  }, [blob]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!pdf || !width || !canvasRef.current) return undefined;
    let cancelled = false;
    let task = null;
    (async () => {
      setRendering(true);
      try {
        const p = await pdf.getPage(shown);
        const base = p.getViewport({ scale: 1 });
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const scale = width / base.width;
        const viewport = p.getViewport({ scale: scale * dpr });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = `${Math.floor(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
        task = p.render({ canvas, canvasContext: canvas.getContext('2d'), viewport });
        await task.promise;
      } catch (err) {
        if (!cancelled && err?.name !== 'RenderingCancelledException') setError('This page couldn’t be drawn.');
      } finally {
        if (!cancelled) setRendering(false);
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel?.();
    };
  }, [pdf, shown, width]);

  const go = (n) => {
    setFollow(false);
    setManual(Math.min(Math.max(1, n), total || 1));
  };

  return (
    <aside className="orig" aria-label="Original document">
      <div className="orig-bar">
        <p className="orig-title">
          Original{total ? `, page ${shown} of ${total}` : ''}
        </p>
        <button type="button" className="btn btn-sm btn-icon btn-quiet" onClick={onClose} aria-label="Hide the original">
          <X size={16} aria-hidden="true" />
        </button>
      </div>
      <div className="orig-controls">
        <button type="button" className="btn btn-sm btn-icon" onClick={() => go(shown - 1)} disabled={shown <= 1} aria-label="Previous page">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="btn btn-sm btn-icon"
          onClick={() => go(shown + 1)}
          disabled={!total || shown >= total}
          aria-label="Next page"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <Switch className="switch orig-follow" isSelected={follow} onChange={setFollow}>
          <span className="switch-text">Follow my place</span>
          <span className="switch-track" aria-hidden="true" />
        </Switch>
      </div>
      <div className="orig-canvas-wrap" ref={wrapRef}>
        {error ? (
          <p className="notice notice-error">{error}</p>
        ) : (
          <>
            {(!pdf || rendering) && (
              <p className="orig-loading" role="status">
                <LoaderCircle size={16} className="spin" aria-hidden="true" /> Loading page…
              </p>
            )}
            <canvas ref={canvasRef} role="img" aria-label={`Page ${shown} of the original document, as printed`} className="orig-canvas" />
          </>
        )}
      </div>
    </aside>
  );
}
