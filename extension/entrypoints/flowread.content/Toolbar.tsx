import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpenText,
  Bold,
  GripVertical,
  Minus,
  Move,
  Newspaper,
  Power,
  Rows3,
  Sparkles,
  Square,
  Volume2,
  X,
} from 'lucide-react';
import { PROFILES, PROFILE_ORDER, type ProfileId } from '@flowread/core';
import type { PageActions, PageState } from './state';
import type { ExtPrefs } from '../../src/lib/schema';
import { speak, stopSpeaking, canSpeak } from './speech';
import { ReaderView } from './ReaderView';

type Dock = ExtPrefs['dock'];
const DOCKS: Dock[] = ['br', 'bl', 'tl', 'tr'];
const DOCK_LABEL: Record<Dock, string> = { br: 'bottom right', bl: 'bottom left', tl: 'top left', tr: 'top right' };
const GAP = 16;

const flipH = (d: Dock): Dock => (d[0] + (d[1] === 'r' ? 'l' : 'r')) as Dock;

function dockStyle(d: Dock): React.CSSProperties {
  return {
    [d[0] === 't' ? 'top' : 'bottom']: GAP,
    [d[1] === 'l' ? 'left' : 'right']: GAP,
  };
}

const isEditable = (el: Element | null) =>
  !!el && (el.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])') || (el as HTMLElement).isContentEditable);

const isOurs = (n: Node | null) => {
  for (let x: Node | null = n; x; x = x.parentNode ?? (x as any).host ?? null) {
    if (x.nodeType === 1 && (x as Element).localName === 'flowread-ui') return true;
  }
  return false;
};

/** Remembers the last non-empty selection on the page (outside our UI). */
function useLastSelection() {
  const last = useRef('');
  useEffect(() => {
    const onSel = () => {
      const sel = document.getSelection();
      if (!sel) return;
      const text = sel.toString().trim();
      if (text && !isOurs(sel.anchorNode)) last.current = text;
      else if (!text && !isOurs(document.activeElement)) last.current = '';
    };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);
  return () => {
    const now = document.getSelection()?.toString().trim();
    return now && !isOurs(document.getSelection()?.anchorNode ?? null) ? now : last.current;
  };
}

type Pop = { status: 'loading' } | { status: 'done'; text: string } | { status: 'error'; text: string };

export function Toolbar({ state, actions }: { state: PageState; actions: PageActions }) {
  const { settings, prefs } = state;
  const [mini, setMini] = useState(false);
  const [avoid, setAvoid] = useState(false);
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [hint, setHint] = useState('');
  const [pop, setPop] = useState<Pop | null>(null);
  const [reader, setReader] = useState(false);
  const bar = useRef<HTMLDivElement>(null);
  const miniBtn = useRef<HTMLButtonElement>(null);
  const expandBtn = useRef<HTMLButtonElement>(null);
  const getSelection = useLastSelection();
  const dock = avoid ? flipH(prefs.dock) : prefs.dock;

  useEffect(() => () => stopSpeaking(), []);

  // Never sit on top of the field someone is typing in: hop to the other side.
  useEffect(() => {
    const onIn = (e: FocusEvent) => {
      const el = e.target as Element;
      if (!isEditable(el) || !bar.current) return;
      const a = el.getBoundingClientRect();
      const b = bar.current.getBoundingClientRect();
      const overlap = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      if (overlap) setAvoid(true);
    };
    const onOut = (e: FocusEvent) => {
      if (isEditable(e.target as Element)) setAvoid(false);
    };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  const flash = useCallback((msg: string) => {
    setHint(msg);
    window.setTimeout(() => setHint((h) => (h === msg ? '' : h)), 5000);
  }, []);

  // ---- drag to move; snaps to the nearest corner ----
  const start = useRef<{ dx: number; dy: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || !bar.current) return;
    const r = bar.current.getBoundingClientRect();
    start.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ x: r.left, y: r.top });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    setDrag({ x: e.clientX - start.current.dx, y: e.clientY - start.current.dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current || !bar.current) return;
    start.current = null;
    const r = bar.current.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const next = `${cy < window.innerHeight / 2 ? 't' : 'b'}${cx < window.innerWidth / 2 ? 'l' : 'r'}` as Dock;
    setDrag(null);
    setAvoid(false);
    actions.patchPrefs({ dock: next });
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const moveNext = () => {
    const next = DOCKS[(DOCKS.indexOf(prefs.dock) + 1) % DOCKS.length] ?? 'br';
    setAvoid(false);
    actions.patchPrefs({ dock: next });
    flash(`Toolbar moved to the ${DOCK_LABEL[next]}.`);
  };

  // ---- features ----
  const readAloud = () => {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!canSpeak()) return flash('Read aloud is not available in this browser.');
    const text = getSelection();
    if (!text) return flash('Select some text on the page first.');
    setSpeaking(true);
    speak(text, () => setSpeaking(false));
  };

  const simplify = async () => {
    const text = getSelection();
    if (!text) return flash('Select a passage on the page, then choose Simplify.');
    setPop({ status: 'loading' });
    const r: { ok: boolean; plain?: string; error?: string } = await actions.simplify(text).catch(() => ({ ok: false, error: 'Could not reach FlowRead.' }));
    setPop(r.ok && r.plain ? { status: 'done', text: r.plain } : { status: 'error', text: r.error || 'Something went wrong.' });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (pop) setPop(null);
    else {
      setMini(true);
      requestAnimationFrame(() => expandBtn.current?.focus());
    }
  };

  const position: React.CSSProperties = drag
    ? { left: Math.max(0, drag.x), top: Math.max(0, drag.y) }
    : dockStyle(dock);

  if (mini) {
    return (
      <div className="fr-bar is-mini" style={position} ref={bar}>
        <button
          ref={expandBtn}
          type="button"
          className="fr-mini"
          onClick={() => {
            setMini(false);
            requestAnimationFrame(() => miniBtn.current?.focus());
          }}
          aria-label="Open the FlowRead toolbar"
          title="FlowRead"
        >
          <BookOpenText size={22} aria-hidden="true" />
        </button>
      </div>
    );
  }

  const popStyle: React.CSSProperties = {
    [dock[0] === 't' ? 'top' : 'bottom']: GAP + (bar.current?.offsetHeight ?? 260) + 10,
    [dock[1] === 'l' ? 'left' : 'right']: GAP,
  };
  const keepSelection = (e: React.MouseEvent) => e.preventDefault();

  return (
    <>
      <div
        ref={bar}
        className="fr-bar"
        style={position}
        role="region"
        aria-label="FlowRead reading tools"
        data-dragging={drag ? 'true' : 'false'}
        onKeyDown={onKeyDown}
      >
        <div className="fr-head">
          <div
            className="fr-grip"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            title="Drag to move"
          >
            <GripVertical size={16} aria-hidden="true" />
            <span className="fr-logo" aria-hidden="true">
              <BookOpenText size={14} />
            </span>
            <span>FlowRead</span>
          </div>
          <button type="button" className="fr-icon-btn" onClick={moveNext} aria-label={`Move toolbar (now ${DOCK_LABEL[dock]})`} title="Move toolbar">
            <Move size={18} aria-hidden="true" />
          </button>
          <button
            ref={miniBtn}
            type="button"
            className="fr-icon-btn"
            onClick={() => {
              setMini(true);
              requestAnimationFrame(() => expandBtn.current?.focus());
            }}
            aria-label="Minimise toolbar"
            title="Minimise"
          >
            <Minus size={18} aria-hidden="true" />
          </button>
          <button type="button" className="fr-icon-btn" onClick={actions.turnOff} aria-label="Turn FlowRead off on this page" title="Turn off">
            <Power size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="fr-field">
          <label htmlFor="fr-profile">Reading profile</label>
          <select
            id="fr-profile"
            className="fr-select"
            value={state.profileId}
            onChange={(e) => actions.setProfile(e.target.value as ProfileId)}
          >
            {PROFILE_ORDER.map((id) => (
              <option key={id} value={id}>
                {PROFILES[id].label}
              </option>
            ))}
            {state.profileId === 'custom' && <option value="custom">Custom</option>}
          </select>
        </div>

        <div className="fr-grid">
          <button
            type="button"
            className="fr-btn"
            aria-pressed={settings.boldStarts}
            onClick={() => actions.patchSettings({ boldStarts: !settings.boldStarts })}
          >
            <Bold size={18} aria-hidden="true" /> Bold word starts
          </button>
          <button
            type="button"
            className="fr-btn"
            aria-pressed={settings.focusLine}
            onClick={() => actions.patchSettings({ focusLine: !settings.focusLine })}
          >
            <Rows3 size={18} aria-hidden="true" /> Focus line
          </button>
          <button type="button" className="fr-btn" aria-pressed={speaking} onMouseDown={keepSelection} onClick={readAloud}>
            {speaking ? <Square size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            {speaking ? 'Stop reading' : 'Read selection'}
          </button>
          <button type="button" className="fr-btn" onMouseDown={keepSelection} onClick={simplify} aria-haspopup="dialog">
            <Sparkles size={18} aria-hidden="true" /> Simplify selection
          </button>
          <button type="button" className="fr-btn wide" onClick={() => setReader(true)} aria-haspopup="dialog">
            <Newspaper size={18} aria-hidden="true" /> Reader view
          </button>
        </div>
        <p className="fr-hint" role="status" aria-live="polite">
          {hint}
        </p>
      </div>

      {pop && (
        <div className="fr-pop" style={popStyle} role="dialog" aria-labelledby="fr-pop-title" onKeyDown={onKeyDown}>
          <div className="fr-head">
            <h2 id="fr-pop-title">In plain language</h2>
            <button type="button" className="fr-icon-btn" onClick={() => setPop(null)} aria-label="Close plain-language result">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <div aria-live="polite" aria-busy={pop.status === 'loading'}>
            {pop.status === 'loading' && <p>Rewriting the selection…</p>}
            {/* Rendered as text nodes only; the server's reply is never parsed as HTML. */}
            {pop.status === 'done' && pop.text.split(/\n{2,}/).map((para, i) => <p key={i}>{para}</p>)}
            {pop.status === 'error' && <p className="fr-error">{pop.text}</p>}
          </div>
          {pop.status === 'done' && (
            <p className="fr-hint">Written by AI from your selection. Check important details against the original.</p>
          )}
        </div>
      )}

      {reader && <ReaderView settings={settings} onClose={() => setReader(false)} />}
    </>
  );
}
