import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import { Square, Volume2, X } from 'lucide-react';
import { FONT_FAMILIES, settingsToStyle, type Settings } from '@flowread/core';
import { BOLD_CLASS, boldifyTree } from '../../src/lib/transform';
import { canSpeak, speak, stopSpeaking } from './speech';

interface Article {
  title: string;
  byline: string;
  body: DocumentFragment;
  text: string;
}

/** Extract the main article with Readability, sanitised with DOMPurify. Runs locally. */
export function extractArticle(doc: Document, boldStarts: boolean, boldRatio?: number): Article | null {
  const clone = doc.cloneNode(true) as Document;
  // Undo our own markup in the copy so Readability sees the page's text.
  clone.querySelectorAll('flowread-ui, [data-flowread-ui]').forEach((n) => n.remove());
  clone.querySelectorAll(`b.${BOLD_CLASS}`).forEach((b) => b.replaceWith(b.textContent ?? ''));
  clone.body?.normalize();
  const parsed = new Readability(clone, { charThreshold: 300 }).parse();
  if (!parsed?.content) return null;

  const body = DOMPurify.sanitize(parsed.content, {
    RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select', 'iframe', 'object', 'embed', 'svg', 'math'],
    FORBID_ATTR: ['style', 'class', 'id', 'srcset', 'sizes'],
  }) as DocumentFragment;
  body.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') ?? '';
    if (!/^(https?:|mailto:)/i.test(href)) a.removeAttribute('href');
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  body.querySelectorAll('img').forEach((img) => {
    if (!/^https?:/i.test(img.getAttribute('src') ?? '')) img.remove();
  });
  // We render the title ourselves. Prefer the article's own h1 (page titles
  // often carry the site name) and drop the duplicate from the body.
  let title = (parsed.title || doc.title || '').trim();
  const firstH = body.querySelector('h1');
  const hText = firstH?.textContent?.trim() ?? '';
  if (firstH && hText && (!title || title.includes(hText))) {
    title = hText;
    firstH.remove();
  }
  if (boldStarts) boldifyTree(body, document, boldRatio);
  return {
    title,
    byline: parsed.byline || parsed.siteName || '',
    body,
    text: `${title}. ${parsed.textContent ?? ''}`,
  };
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ReaderView({ settings, onClose }: { settings: Settings; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const [article] = useState(() => extractArticle(document, settings.boldStarts, settings.boldIntensity));
  const [speaking, setSpeaking] = useState(false);

  // Remember what had focus (inside our shadow root) and give it back on close.
  useEffect(() => {
    const root = dialog.current?.getRootNode() as ShadowRoot | Document | undefined;
    const prev = (root && 'activeElement' in root ? root.activeElement : null) as HTMLElement | null;
    const pageScroll = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    closeBtn.current?.focus();
    return () => {
      stopSpeaking();
      document.documentElement.style.overflow = pageScroll;
      if (!document.documentElement.getAttribute('style')) document.documentElement.removeAttribute('style');
      prev?.focus?.();
    };
  }, []);

  useLayoutEffect(() => {
    if (article && bodyRef.current && !bodyRef.current.firstChild) bodyRef.current.append(article.body);
  }, [article]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const root = dialog.current.getRootNode() as ShadowRoot;
    const active = root.activeElement;
    if (e.shiftKey && (active === first || !dialog.current.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const vars = settingsToStyle(settings) as React.CSSProperties;
  const font = FONT_FAMILIES[settings.font] ?? FONT_FAMILIES.system;

  return (
    <div
      ref={dialog}
      className="fr-reader"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fr-reader-title"
      onKeyDown={onKeyDown}
    >
      <div className="fr-reader-bar">
        {article && canSpeak() && (
          <button
            type="button"
            className="fr-btn"
            aria-pressed={speaking}
            onClick={() => {
              if (speaking) {
                stopSpeaking();
                setSpeaking(false);
              } else {
                setSpeaking(true);
                speak(article.text, () => setSpeaking(false));
              }
            }}
          >
            {speaking ? <Square size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
            {speaking ? 'Stop reading' : 'Read aloud'}
          </button>
        )}
        <button ref={closeBtn} type="button" className="fr-btn" onClick={onClose}>
          <X size={18} aria-hidden="true" /> Close reader view
        </button>
      </div>
      <article className="fr-article" style={{ ...vars, fontFamily: font }}>
        {article ? (
          <>
            <h1 id="fr-reader-title">{article.title}</h1>
            {article.byline && <p className="fr-byline">{article.byline}</p>}
            <div ref={bodyRef} />
          </>
        ) : (
          <>
            <h1 id="fr-reader-title">No article found</h1>
            <p>FlowRead could not find a main article on this page. Reader view works best on articles, blog posts and documentation.</p>
          </>
        )}
      </article>
    </div>
  );
}
