// Page transform: reading CSS plus bold word starts on live text nodes, fully
// reversible. Framework-free and browser-API-free so it runs in jsdom tests.
//
// How bold word starts are applied (and why there is no wrapper element):
// for a text node "Hello world" we keep the ORIGINAL Text node in place and
// shorten it to its leading non-bold part (here ""), then insert the rest as
// siblings right after it: <b class="fr-b">He</b>"llo " <b class="fr-b">wo</b>"rld".
//   - No wrapper means no new box in the layout tree, so flex/grid children,
//     `:first-child`, `> span` selectors etc. behave the same as before.
//   - The page's own Text node keeps its identity and position. Frameworks
//     such as React keep references to text nodes and update `nodeValue` in
//     place; that shows up as a characterData mutation on a node we know, so
//     we drop our siblings and re-apply on the new text instead of leaving the
//     update on a detached node.
//   - OFF restores the original string into that same node and removes the
//     inserted siblings, so `body.innerHTML` is byte-identical afterwards.
// Records live in WeakMaps keyed by nodes, so content the page throws away
// is garbage-collected with it.
import { boldSegments } from '@flowread/core';

export const BOLD_CLASS = 'fr-b';
export const STYLE_ID = 'flowread-style';
export const ON_CLASS = 'flowread-on';
export const UI_ATTR = 'data-flowread-ui';

/** Never touched: form controls, code, editable regions, hidden text, our UI. */
export const SKIP_SELECTOR = [
  'script', 'style', 'noscript', 'template', 'textarea', 'input', 'select', 'option',
  'code', 'pre', 'kbd', 'samp', 'svg', 'math', 'iframe', 'canvas',
  '[contenteditable]', '[contenteditable] *', '[aria-hidden="true"]',
  `b.${BOLD_CLASS}`, `[${UI_ATTR}]`, '[data-flowread-skip]', 'flowread-ui',
].join(', ');

// Scripts where splitting a word across elements breaks letter joining or
// syllable shaping (Arabic family, Indic, South-East Asian), or where words are
// not separated by spaces (CJK). Text containing these is left as is.
const COMPLEX_SCRIPT = /[؀-ࣿऀ-෿฀-࿿က-႟ក-᢯぀-ヿ㐀-䶿一-鿿豈-﫿יִ-﷿ﹰ-﻿]/;
const HAS_TEXT = /\S/;

interface Rec {
  /** What we put in the anchor; anything else means the page changed it. */
  expected: string;
  original: string;
  inserted: Node[];
}

export interface BoldPieces {
  /** New value for the original text node (leading non-bold text, or ""). */
  anchorText: string;
  nodes: Node[];
}

/** Build the nodes for one string, or null if it has nothing to bold. */
export function boldPieces(doc: Document, text: string, boldClass = BOLD_CLASS, ratio?: number): BoldPieces | null {
  if (!HAS_TEXT.test(text) || COMPLEX_SCRIPT.test(text)) return null;
  const segs = boldSegments(text, ratio);
  const first = segs[0];
  if (!first || !segs.some((s) => s.bold)) return null;
  const lead = first.bold ? '' : first.text;
  const rest = first.bold ? segs : segs.slice(1);
  const nodes = rest.map((seg) => {
    if (!seg.bold) return doc.createTextNode(seg.text);
    const b = doc.createElement('b');
    b.className = boldClass;
    b.textContent = seg.text;
    return b;
  });
  return { anchorText: lead, nodes };
}

const isSkippedElement = (el: Element | null) => !el || el.closest(SKIP_SELECTOR) !== null;

/** One-shot, non-reversible bold word starts for a detached tree (reader view). */
export function boldifyTree(root: Node, doc: Document = root.ownerDocument ?? document, ratio?: number) {
  const walker = doc.createTreeWalker(root, 0x1 | 0x4, {
    acceptNode: (n) =>
      n.nodeType === 1
        ? (n as Element).matches(SKIP_SELECTOR) ? 2 /* REJECT */ : 3 /* SKIP */
        : HAS_TEXT.test(n.nodeValue ?? '') ? 1 : 3,
  });
  const texts: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) texts.push(n as Text);
  for (const t of texts) {
    const p = boldPieces(doc, t.nodeValue ?? '', BOLD_CLASS, ratio);
    if (!p) continue;
    t.nodeValue = p.anchorText;
    t.after(...p.nodes);
  }
}

export interface TransformOptions {
  css: string;
  boldStarts: boolean;
  /** Share of each word in bold (0.35 light, 0.45 medium, 0.55 strong). */
  boldRatio?: number;
  /** Text nodes per idle slice. */
  chunkSize?: number;
}

export interface Transformer {
  readonly on: boolean;
  enable(opts: TransformOptions): void;
  update(opts: Partial<TransformOptions>): void;
  disable(): void;
  /** Resolves once queued text and pending mutations are processed. */
  whenIdle(): Promise<void>;
  /** Number of text nodes currently carrying bold word starts. */
  count(): number;
}

type IdleFn = (cb: () => void) => void;

export function createTransformer(doc: Document = document): Transformer {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  const idle: IdleFn =
    win && typeof win.requestIdleCallback === 'function'
      ? (cb) => win.requestIdleCallback(cb, { timeout: 300 })
      : (cb) => setTimeout(cb, 0);

  let on = false;
  let opts: Required<TransformOptions> = { css: '', boldStarts: false, boldRatio: 0.45, chunkSize: 200 };
  let styleEl: HTMLStyleElement | null = null;
  let htmlHadClass = false;

  // anchor Text -> record; inserted node -> its anchor
  let records = new WeakMap<Text, Rec>();
  let owner = new WeakMap<Node, Text>();
  let ours = new WeakSet<Node>();
  let live = 0;

  let queue: Text[] = [];
  let queued = new WeakSet<Text>();
  let scheduled = false;
  let observer: MutationObserver | null = null;
  let pendingMutations: MutationRecord[] = [];
  let mutationTimer: ReturnType<typeof setTimeout> | null = null;
  let waiters: (() => void)[] = [];

  const settle = () => {
    if (scheduled || mutationTimer || queue.length) return;
    const w = waiters;
    waiters = [];
    w.forEach((fn) => fn());
  };

  function apply(t: Text) {
    if (records.has(t) || ours.has(t) || !t.isConnected) return;
    if (isSkippedElement(t.parentElement)) return;
    const value = t.nodeValue ?? '';
    const p = boldPieces(doc, value, BOLD_CLASS, opts.boldRatio);
    if (!p) return;
    for (const n of p.nodes) {
      ours.add(n);
      owner.set(n, t);
      if (n.firstChild) ours.add(n.firstChild);
    }
    records.set(t, { expected: p.anchorText, original: value, inserted: p.nodes });
    t.nodeValue = p.anchorText;
    t.after(...p.nodes);
    live++;
  }

  /** Drop our siblings for `t`. restoreText: put the original string back. */
  function undo(t: Text, restoreText: boolean) {
    const rec = records.get(t);
    if (!rec) return;
    for (const n of rec.inserted) n.parentNode?.removeChild(n);
    if (restoreText && t.nodeValue === rec.expected) t.nodeValue = rec.original;
    records.delete(t);
    live--;
  }

  function enqueue(t: Text) {
    if (queued.has(t) || records.has(t) || ours.has(t)) return;
    queued.add(t);
    queue.push(t);
  }

  function collect(root: Node, out: Text[]) {
    if (root.nodeType === 3) {
      if (HAS_TEXT.test(root.nodeValue ?? '')) out.push(root as Text);
      return;
    }
    if (root.nodeType !== 1 && root.nodeType !== 11) return;
    if (root.nodeType === 1 && isSkippedElement(root as Element)) return;
    const walker = doc.createTreeWalker(root, 0x1 | 0x4, {
      acceptNode: (n) =>
        n.nodeType === 1
          ? (n as Element).matches(SKIP_SELECTOR) ? 2 : 3
          : ours.has(n) || !HAS_TEXT.test(n.nodeValue ?? '') ? 3 : 1,
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) out.push(n as Text);
  }

  /** Visible text first so the screen updates before off-screen content. */
  function viewportFirst(texts: Text[]): Text[] {
    const h = win?.innerHeight ?? 0;
    if (!h) return texts;
    const cache = new Map<Element, boolean>();
    const visible: Text[] = [];
    const rest: Text[] = [];
    for (const t of texts) {
      const el = t.parentElement;
      let v = el ? cache.get(el) : false;
      if (v === undefined && el) {
        const r = el.getBoundingClientRect();
        v = (r.width > 0 || r.height > 0) && r.bottom >= 0 && r.top <= h;
        cache.set(el, v);
      }
      (v ? visible : rest).push(t);
    }
    return visible.concat(rest);
  }

  function schedule() {
    if (scheduled || !queue.length) return settle();
    scheduled = true;
    idle(() => {
      scheduled = false;
      if (!on || !opts.boldStarts) {
        queue = [];
        return settle();
      }
      const slice = queue.splice(0, opts.chunkSize);
      for (const t of slice) {
        queued.delete(t);
        apply(t);
      }
      // Our own edits also reach the MutationObserver; handleMutations
      // recognises them (WeakSet / expected anchor value) and skips them.
      schedule();
    });
  }

  function handleMutations() {
    mutationTimer = null;
    const list = pendingMutations;
    pendingMutations = [];
    if (!on || !opts.boldStarts) return settle();
    const fresh: Text[] = [];
    for (const m of list) {
      if (m.type === 'characterData') {
        const t = m.target as Text;
        if (ours.has(t)) continue;
        const rec = records.get(t);
        if (rec) {
          if (t.nodeValue === rec.expected) continue; // our own write
          undo(t, false); // the page replaced the text: re-apply on the new value
        }
        if (t.isConnected) fresh.push(t);
        continue;
      }
      m.removedNodes.forEach((n) => {
        if (n.nodeType === 3 && records.has(n as Text)) undo(n as Text, false);
      });
      m.addedNodes.forEach((n) => {
        if (ours.has(n) || !n.isConnected) return;
        if (n.nodeType === 1 && (n as Element).hasAttribute(UI_ATTR)) return;
        collect(n, fresh);
      });
    }
    fresh.forEach(enqueue);
    schedule();
  }

  function observe() {
    if (observer || !win || !doc.body) return;
    observer = new win.MutationObserver((list) => {
      pendingMutations.push(...list);
      if (!mutationTimer) mutationTimer = setTimeout(handleMutations, 120);
    });
    observer.observe(doc.body, { childList: true, subtree: true, characterData: true });
  }

  function unobserve() {
    observer?.disconnect();
    observer = null;
    pendingMutations = [];
    if (mutationTimer) clearTimeout(mutationTimer);
    mutationTimer = null;
  }

  function startBold() {
    if (!doc.body) return;
    observe();
    const found: Text[] = [];
    collect(doc.body, found);
    viewportFirst(found).forEach(enqueue);
    schedule();
  }

  function stopBold() {
    unobserve();
    queue = [];
    queued = new WeakSet();
    // Every record has at least one <b>, so the <b>s lead us to all live anchors.
    const anchors = new Set<Text>();
    doc.querySelectorAll(`b.${BOLD_CLASS}`).forEach((b) => {
      const a = owner.get(b);
      if (a) anchors.add(a);
    });
    anchors.forEach((a) => undo(a, true));
    records = new WeakMap();
    owner = new WeakMap();
    ours = new WeakSet();
    live = 0;
    settle();
  }

  function setStyle(css: string) {
    if (!styleEl) {
      styleEl = doc.createElement('style');
      styleEl.id = STYLE_ID;
      (doc.head ?? doc.documentElement).appendChild(styleEl);
    }
    styleEl.textContent = css;
  }

  return {
    get on() {
      return on;
    },
    enable(next) {
      const wasBold = on && opts.boldStarts;
      const ratioChanged = next.boldRatio !== undefined && next.boldRatio !== opts.boldRatio;
      opts = { ...opts, ...next };
      if (!on) {
        const html = doc.documentElement;
        htmlHadClass = html.hasAttribute('class');
        html.classList.add(ON_CLASS);
        on = true;
      }
      setStyle(opts.css);
      if (opts.boldStarts && !wasBold) startBold();
      else if (!opts.boldStarts && wasBold) stopBold();
      else if (opts.boldStarts && wasBold && ratioChanged) {
        // New strength: restore the page text, then bold it again.
        stopBold();
        startBold();
      }
    },
    update(next) {
      if (!on) {
        opts = { ...opts, ...next };
        return;
      }
      this.enable({ ...opts, ...next });
    },
    disable() {
      if (!on) return;
      stopBold();
      on = false;
      styleEl?.remove();
      styleEl = null;
      const html = doc.documentElement;
      html.classList.remove(ON_CLASS);
      if (!htmlHadClass && html.getAttribute('class') === '') html.removeAttribute('class');
      settle();
    },
    whenIdle() {
      return new Promise<void>((resolve) => {
        waiters.push(resolve);
        settle();
      });
    },
    count: () => live,
  };
}
