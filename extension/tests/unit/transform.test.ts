import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readingCss, settingsForProfile, boldSegments } from '@flowread/core';
import { createTransformer as make, boldifyTree, ON_CLASS, STYLE_ID, BOLD_CLASS, type Transformer } from '../../src/lib/transform';

const live: Transformer[] = [];
const createTransformer = (d: Document) => {
  const t = make(d);
  live.push(t);
  return t;
};

const MIXED = `
<header><nav><a href="/">Home</a> <span class="icon" aria-hidden="true">menu</span></nav></header>
<main>
  <h1>Reading on the web</h1>
  <p id="p1">Plain words with <em>nested <strong>inline</strong> text</em> and a <a href="#x">link</a>.</p>
  <p id="emoji">Emoji \u{1F389} party time \u{1F469}‍\u{1F4BB} coder</p>
  <p id="rtl-he" dir="rtl">שלום עולם</p>
  <p id="rtl-ar" dir="rtl">مرحبا بالعالم</p>
  <p id="cjk">日本語のテキスト</p>
  <form><label for="n">Your name</label><input id="n" value="keep me"><textarea id="ta">do not touch</textarea>
    <select><option>First option</option></select></form>
  <pre id="pre">const answer = 42;</pre>
  <p>Inline <code id="code">someFunction()</code> call.</p>
  <div id="ce" contenteditable="true">Editable <span>region text</span></div>
  <div id="hidden" aria-hidden="true">Hidden decorative words</div>
  <kbd>Ctrl</kbd> <samp>output text</samp>
  <svg><text>svg words</text></svg>
  <script>var inScript = "text in script";</script>
  <style>.x { color: red }</style>
  <p>   </p>
  <ul><li>First item here</li><li>Second item</li></ul>
  <table><tbody><tr><td>Cell content</td></tr></tbody></table>
</main>`;

const settings = { ...settingsForProfile('dyslexia'), boldStarts: true };
const css = readingCss(settings, { scope: 'html.flowread-on' });

const boldIn = (sel: string) => document.querySelectorAll(`${sel} b.${BOLD_CLASS}`).length;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('page transform', () => {
  let original: string;
  beforeEach(() => {
    document.head.innerHTML = '<title>t</title>';
    document.body.innerHTML = MIXED;
    document.documentElement.removeAttribute('class');
    original = document.body.innerHTML;
  });
  afterEach(() => {
    live.splice(0).forEach((t) => t.disable());
  });

  it('applies style, class and bold word starts only where allowed', async () => {
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: true });
    await tr.whenIdle();

    expect(document.documentElement.classList.contains(ON_CLASS)).toBe(true);
    const style = document.getElementById(STYLE_ID)!;
    expect(style.textContent).toContain('html.flowread-on');
    expect(document.querySelectorAll(`#${STYLE_ID}`).length).toBe(1);

    expect(boldIn('#p1')).toBeGreaterThan(5);
    expect(boldIn('#p1 strong')).toBe(1); // nested inline handled
    expect(document.querySelector('#p1')!.textContent).toBe('Plain words with nested inline text and a link.');
    expect(boldIn('h1')).toBe(4);
    expect(boldIn('li')).toBe(5);
    expect(boldIn('td')).toBe(2);
    expect(boldIn('#emoji')).toBe(4); // emoji themselves are not words
    expect(document.querySelector('#emoji')!.textContent).toBe('Emoji \u{1F389} party time \u{1F469}‍\u{1F4BB} coder');
    expect(boldIn('#rtl-he')).toBe(2); // Hebrew letters do not join
    expect(boldIn('#rtl-ar')).toBe(0); // splitting Arabic would break letter joining
    expect(boldIn('#cjk')).toBe(0);

    expect(boldIn('label')).toBe(2); // labels are ordinary text
    for (const sel of ['select', 'textarea', '#pre', '#code', '#ce', '#hidden', 'kbd', 'samp', 'svg', 'script', 'style', 'header .icon']) {
      expect(boldIn(sel), sel).toBe(0);
    }
    expect((document.getElementById('n') as HTMLInputElement).value).toBe('keep me');
    expect(document.getElementById('ta')!.textContent).toBe('do not touch');

    // segments match the shared algorithm exactly
    const li = document.querySelector('li')!;
    const got = [...li.querySelectorAll(`b.${BOLD_CLASS}`)].map((b) => b.textContent);
    expect(got).toEqual(boldSegments('First item here').filter((s) => s.bold).map((s) => s.text));
  });

  it('restores body.innerHTML exactly on disable', async () => {
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: true });
    await tr.whenIdle();
    expect(document.body.innerHTML).not.toBe(original);
    tr.disable();
    expect(document.body.innerHTML).toBe(original);
    expect(document.getElementById(STYLE_ID)).toBeNull();
    expect(document.documentElement.hasAttribute('class')).toBe(false);
  });

  it('can be toggled repeatedly', async () => {
    const tr = createTransformer(document);
    for (let i = 0; i < 3; i++) {
      tr.enable({ css, boldStarts: true });
      await tr.whenIdle();
      tr.disable();
      expect(document.body.innerHTML).toBe(original);
    }
  });

  it('keeps an existing <html> class attribute intact', () => {
    document.documentElement.className = 'js';
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: false });
    expect(document.documentElement.className).toBe(`js ${ON_CLASS}`);
    tr.disable();
    expect(document.documentElement.className).toBe('js');
  });

  it('keeps the original Text nodes (identity) and restores them', async () => {
    const li = document.querySelector('li')!;
    const text = li.firstChild as Text;
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: true });
    await tr.whenIdle();
    expect(li.firstChild).toBe(text);
    tr.disable();
    expect(li.firstChild).toBe(text);
    expect(li.childNodes.length).toBe(1);
    expect(text.nodeValue).toBe('First item here');
  });

  it('processes appended SPA content and ignores its own mutations', async () => {
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: true });
    await tr.whenIdle();
    const before = tr.count();

    const card = document.createElement('article');
    card.innerHTML = '<h2>Loaded later</h2><p>Fresh content arrives</p><code>no()</code>';
    document.querySelector('main')!.appendChild(card);
    await wait(200);
    await tr.whenIdle();
    expect(boldIn('article h2')).toBe(2);
    expect(boldIn('article p')).toBe(3);
    expect(boldIn('article code')).toBe(0);
    const after = tr.count();
    expect(after).toBe(before + 2);

    // no runaway re-processing of our own nodes
    await wait(300);
    await tr.whenIdle();
    expect(tr.count()).toBe(after);
    expect(document.querySelectorAll(`b.${BOLD_CLASS} b`).length).toBe(0);

    tr.disable();
    card.remove();
    expect(document.body.innerHTML).toBe(original);
  });

  it('re-applies when the page rewrites a text node it owns (framework update)', async () => {
    const li = document.querySelector('li')!;
    const text = li.firstChild as Text;
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: true });
    await tr.whenIdle();
    text.nodeValue = 'Updated words'; // what React does on re-render
    await wait(200);
    await tr.whenIdle();
    expect(li.textContent).toBe('Updated words');
    expect(li.querySelectorAll(`b.${BOLD_CLASS}`).length).toBe(2);
    tr.disable();
    expect(li.innerHTML).toBe('Updated words');
  });

  it('cleans up when the page removes a transformed node', async () => {
    const li = document.querySelector('li')!;
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: true });
    await tr.whenIdle();
    li.removeChild(li.firstChild!); // framework unmount of its own text node
    await wait(200);
    await tr.whenIdle();
    expect(li.childNodes.length).toBe(0);
    tr.disable();
  });

  it('toggles bold word starts live without touching the style', async () => {
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: true });
    await tr.whenIdle();
    tr.update({ boldStarts: false });
    expect(document.body.innerHTML).toBe(original);
    expect(document.getElementById(STYLE_ID)).not.toBeNull();
    tr.update({ boldStarts: true, css: 'html.flowread-on{}' });
    await tr.whenIdle();
    expect(boldIn('h1')).toBe(4);
    expect(document.getElementById(STYLE_ID)!.textContent).toBe('html.flowread-on{}');
    tr.disable();
    expect(document.body.innerHTML).toBe(original);
  });

  it('processes large pages in idle chunks', async () => {
    document.body.innerHTML = Array.from({ length: 1500 }, (_, i) => `<p>Paragraph number ${i}</p>`).join('');
    const big = document.body.innerHTML;
    const tr = createTransformer(document);
    tr.enable({ css, boldStarts: true, chunkSize: 200 });
    expect(tr.count()).toBe(0); // nothing synchronous
    await tr.whenIdle();
    expect(tr.count()).toBe(1500);
    tr.disable();
    expect(document.body.innerHTML).toBe(big);
  });

  it('boldifyTree works on detached content', () => {
    const div = document.createElement('div');
    div.innerHTML = '<p>Reader view text</p><pre>code here</pre>';
    boldifyTree(div, document);
    expect(div.querySelectorAll('p b.fr-b').length).toBe(3);
    expect(div.querySelectorAll('pre b').length).toBe(0);
  });
});
