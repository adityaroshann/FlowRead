import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Popover } from 'react-aria-components';
import AiText from '../shared/AiText.jsx';
import { BookA, Copy, LoaderCircle, Sparkles, Volume2, X } from 'lucide-react';
import { define, plainLanguage } from '../shared/api.js';

const MAX_CHARS = 1500;

function sentenceAround(sel) {
  const node = sel.anchorNode;
  const block = (node?.nodeType === 1 ? node : node?.parentElement)?.closest('.fra-p, li, td, th, .fra-h');
  const text = block?.textContent || '';
  return text.slice(0, 600);
}

function sectionHeadingFor(node) {
  const sec = (node?.nodeType === 1 ? node : node?.parentElement)?.closest('.fra-section');
  return sec?.querySelector('.fra-section-heading')?.textContent || '';
}

/** Reads the current selection if it is inside `root`. */
function readSelection(root) {
  const sel = window.getSelection?.();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null;
  const text = sel.toString().replace(/\s+/g, ' ').trim();
  if (!text) return null;
  const range = sel.getRangeAt(0);
  if (!root || !root.contains(range.commonAncestorContainer)) return null;
  const rect = range.getBoundingClientRect();
  return {
    text: text.slice(0, MAX_CHARS),
    context: sentenceAround(sel),
    heading: sectionHeadingFor(sel.anchorNode),
    rect: { top: rect.top + window.scrollY, left: rect.left + window.scrollX, width: rect.width, height: rect.height },
  };
}

/**
 * Tools for selected text: Explain simply, Define, Read aloud, Copy.
 * Opens next to a mouse or keyboard selection inside `rootRef` without taking
 * focus; Ctrl/Cmd+Shift+E (or the command palette) opens it with focus.
 */
const SelectionPopover = forwardRef(function SelectionPopover({ rootRef, onSpeak, enabled = true, settings }, ref) {
  const [sel, setSel] = useState(null);
  const [result, setResult] = useState(null); // { kind, status, text }
  const anchorRef = useRef(null);
  const firstBtnRef = useRef(null);
  const panelRef = useRef(null);

  const close = useCallback(() => {
    setSel(null);
    setResult(null);
  }, []);

  const openFromSelection = useCallback(
    (focus) => {
      const s = readSelection(rootRef.current);
      if (!s) return false;
      setSel(s);
      setResult(null);
      if (focus) setTimeout(() => firstBtnRef.current?.focus(), 30);
      return true;
    },
    [rootRef],
  );

  useImperativeHandle(ref, () => ({ open: () => openFromSelection(true), hasSelection: () => !!readSelection(rootRef.current) }), [
    openFromSelection,
    rootRef,
  ]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onUp = (e) => {
      if (panelRef.current?.contains(e.target)) return;
      setTimeout(() => openFromSelection(false), 10);
    };
    const onKeyUp = (e) => {
      if (e.shiftKey && /^Arrow|^Home$|^End$/.test(e.key)) openFromSelection(false);
    };
    const onSelChange = () => {
      const s = window.getSelection?.();
      if ((!s || s.isCollapsed) && !panelRef.current?.contains(document.activeElement)) {
        setResult((r) => {
          if (!r) setSel(null);
          return r;
        });
      }
    };
    document.addEventListener('pointerup', onUp);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('selectionchange', onSelChange);
    return () => {
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('selectionchange', onSelChange);
    };
  }, [enabled, openFromSelection]);

  const explain = async () => {
    setResult({ kind: 'explain', status: 'loading' });
    try {
      const text = await plainLanguage(sel.text, sel.heading);
      setResult({ kind: 'explain', status: 'done', text });
    } catch {
      setResult({ kind: 'explain', status: 'error', text: 'Explanations aren’t available right now.' });
    }
  };
  const lookUp = async () => {
    setResult({ kind: 'define', status: 'loading' });
    try {
      const text = await define(sel.text.slice(0, 120), sel.context);
      setResult({ kind: 'define', status: 'done', text });
    } catch {
      setResult({ kind: 'define', status: 'error', text: 'Definitions aren’t available right now.' });
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sel.text);
      setResult({ kind: 'copy', status: 'done', text: 'Copied.' });
    } catch {
      setResult({ kind: 'copy', status: 'error', text: 'Copy didn’t work here. Use Ctrl+C instead.' });
    }
  };

  const isOpen = !!sel;
  const short = sel && sel.text.split(/\s+/).length <= 4;

  return (
    <>
      {isOpen &&
        createPortal(
          <span
            ref={anchorRef}
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: sel.rect.top,
              left: sel.rect.left,
              width: Math.max(1, sel.rect.width),
              height: Math.max(1, sel.rect.height),
              pointerEvents: 'none',
            }}
          />,
          document.body,
        )}
      {isOpen && (
        <Popover
          className="popover selpop"
          triggerRef={anchorRef}
          isOpen
          isNonModal
          placement="top"
          offset={10}
          shouldFlip
          onOpenChange={(o) => {
            if (!o) close();
          }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-label="Selection tools"
            className="selpop-body"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                close();
              }
            }}
          >
            <div className="selpop-actions" role="group" aria-label="Actions">
              <button type="button" className="selpop-btn" ref={firstBtnRef} onClick={explain}>
                <Sparkles size={16} aria-hidden="true" /> Explain simply
              </button>
              {short && (
                <button type="button" className="selpop-btn" onClick={lookUp}>
                  <BookA size={16} aria-hidden="true" /> Define
                </button>
              )}
              <button type="button" className="selpop-btn" onClick={() => onSpeak?.(sel.text)}>
                <Volume2 size={16} aria-hidden="true" /> Read aloud
              </button>
              <button type="button" className="selpop-btn" onClick={copy}>
                <Copy size={16} aria-hidden="true" /> Copy
              </button>
              <button type="button" className="selpop-btn selpop-close" onClick={close} aria-label="Close selection tools">
                <X size={16} aria-hidden="true" />
              </button>
            </div>
            <div className="selpop-result" aria-live="polite">
              {result?.status === 'loading' && (
                <p className="selpop-status">
                  <LoaderCircle size={16} className="spin" aria-hidden="true" />
                  {result.kind === 'define' ? 'Looking it up…' : 'Writing a simpler version…'}
                </p>
              )}
              {result && result.status !== 'loading' && result.kind !== 'copy' && (
                <div className={`selpop-answer${result.status === 'error' ? ' is-error' : ''}`}>
                  {result.status === 'done' && (
                    <p className="selpop-answer-label">
                      {result.kind === 'define' ? `“${sel.text.slice(0, 40)}”` : 'In simpler words'}
                      <span> · written by AI</span>
                    </p>
                  )}
                  {result.status === 'done' ? <AiText as="p" text={result.text} settings={settings} portal /> : <p>{result.text}</p>}
                </div>
              )}
              {result?.kind === 'copy' && <p className="selpop-status">{result.text}</p>}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
});

export default SelectionPopover;
