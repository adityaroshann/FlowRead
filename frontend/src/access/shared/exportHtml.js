// exportAccessibleHtml(doc) -> a complete, self-contained HTML file:
// semantic markup, inlined CSS, and a tiny vanilla-JS profile switcher
// (Standard / Dyslexia / Focus / Low vision). No network, no React, no
// external fonts. All document text is escaped.

import {
  headingLevels,
  imageAlt,
  readingMinutes,
  safeImageSrc,
  sectionLabel,
  sectionWordCount,
  tableCaption,
  tableNumbers,
} from './docModel.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}
const e = escapeHtml;

function safeLang(lang) {
  const l = String(lang || '').trim();
  return /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8})*$/.test(l) ? l : 'en';
}

function safeId(id) {
  return String(id ?? '').replace(/[^A-Za-z0-9_-]/g, '_');
}

function renderBlock(b, levels, tables) {
  const bid = safeId(b.id);
  switch (b.type) {
    case 'heading': {
      const lvl = levels.get(`blk:${b.id}`) || 3;
      return `<h${lvl} id="blk-${bid}" tabindex="-1">${e(b.text)}</h${lvl}>`;
    }
    case 'paragraph': {
      let html = `<p id="blk-${bid}">${e(b.text)}</p>`;
      if (b.plain && String(b.plain).trim()) {
        html += `<details class="plain"><summary>Plain-language version (AI rewrite)</summary><p>${e(b.plain)}</p></details>`;
      }
      return html;
    }
    case 'list': {
      const tag = b.ordered ? 'ol' : 'ul';
      return `<${tag} id="blk-${bid}">${(b.items || []).map((i) => `<li>${e(i)}</li>`).join('')}</${tag}>`;
    }
    case 'table': {
      const cap = tableCaption(b, tables.get(b.id) || 1);
      const headers = Array.isArray(b.headers) ? b.headers : [];
      const head = headers.length
        ? `<thead><tr>${headers.map((h) => `<th scope="col">${e(h)}</th>`).join('')}</tr></thead>`
        : '';
      const body = (b.rows || []).map((r) => `<tr>${(r || []).map((c) => `<td>${e(c)}</td>`).join('')}</tr>`).join('');
      return `<div class="table-wrap" role="region" aria-label="${e(`Table: ${cap}`)}" tabindex="0"><table id="blk-${bid}"><caption>${e(cap)}</caption>${head}<tbody>${body}</tbody></table></div>`;
    }
    case 'image': {
      const src = safeImageSrc(b.src);
      if (!src) return '';
      if (b.altStatus === 'decorative' && !b.caption) {
        return `<div class="decorative"><img src="${e(src)}" alt=""></div>`;
      }
      const cap = b.caption ? `<figcaption>${e(b.caption)}</figcaption>` : '';
      return `<figure id="blk-${bid}"><img src="${e(src)}" alt="${e(imageAlt(b))}">${cap}</figure>`;
    }
    case 'math': {
      const visual = b.text || b.latex || '';
      const spoken = (b.spoken || '').trim();
      if (!spoken) return `<div class="math" id="blk-${bid}"><span class="math-visual">${e(visual)}</span></div>`;
      return `<div class="math" id="blk-${bid}"><span class="math-visual" aria-hidden="true">${e(visual)}</span><span class="sr-only">Math: ${e(spoken)}</span><span class="math-spoken" aria-hidden="true">Read as: ${e(spoken)}</span></div>`;
    }
    case 'pageMarker':
      return `<p class="page" id="page-${bid}"><span class="sr-only">Printed copy, </span>Page ${e(b.n)}</p>`;
    default:
      return '';
  }
}

const CSS = `
:root{--bg:#fff;--surface:#f3f4f1;--text:#1a1d1a;--muted:#4a5047;--accent:#2e6b3e;--on-accent:#fff;--border:#7d8579;--rule:#d6d9d3;--focus:#1f4f2c;
--font:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;--scale:1;--lh:1.6;--ls:0;--ws:0;--measure:70ch;--gap:1.1em;--ring:3px;color-scheme:light}
html[data-profile=dyslexia]{--bg:#fbf5e6;--surface:#f2e9d3;--text:#231f17;--muted:#4f4636;--accent:#2f5e3a;--border:#857a66;--rule:#e0d5bc;
--font:'Atkinson Hyperlegible',Verdana,Tahoma,sans-serif;--scale:1.1;--lh:1.8;--ls:.12em;--ws:.16em;--measure:65ch;--gap:1.8em}
html[data-profile=focus]{--lh:1.7;--measure:65ch}
html[data-profile=lowvision]{--bg:#000;--surface:#000;--text:#fff;--muted:#fff;--accent:#ffe14d;--on-accent:#000;--border:#fff;--rule:#fff;--focus:#ffe14d;
--font:'Atkinson Hyperlegible',Verdana,Tahoma,sans-serif;--scale:1.5;--measure:60ch;--ring:5px;color-scheme:dark}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);font-size:calc(1.0625rem*var(--scale));line-height:var(--lh);overflow-wrap:break-word}
.skip{position:absolute;left:.5rem;top:-100px;background:var(--accent);color:var(--on-accent);padding:.75em 1em;border-radius:6px;z-index:10;font-weight:700}
.skip:focus{top:.5rem}
:focus-visible{outline:var(--ring) solid var(--focus);outline-offset:2px}
header.top{border-bottom:1px solid var(--rule);padding:.75rem 1rem;display:flex;flex-wrap:wrap;gap:.75rem 1.5rem;align-items:center;justify-content:space-between}
.brand{margin:0;font-weight:700}
fieldset.profiles{border:0;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}
fieldset.profiles legend{float:left;margin-right:.5rem;font-weight:600}
.chip{position:relative}
.chip input{position:absolute;opacity:0;width:1px;height:1px}
.chip label{display:inline-flex;align-items:center;min-height:44px;padding:.4em .9em;border:1px solid var(--border);border-radius:999px;cursor:pointer;background:var(--bg)}
.chip input:checked+label{background:var(--accent);color:var(--on-accent);border-color:var(--accent);font-weight:700}
.chip input:focus-visible+label{outline:var(--ring) solid var(--focus);outline-offset:2px}
.layout{display:grid;gap:1.5rem;padding:1rem;max-width:72rem;margin:0 auto}
@media (min-width:60em){.layout{grid-template-columns:15rem minmax(0,1fr)}nav.toc{position:sticky;top:1rem;align-self:start}}
nav.toc ol{margin:.25rem 0 0;padding-left:1.4em}
nav.toc li{margin:.15em 0}
nav.toc a{display:inline-block;min-height:44px;padding:.5em 0;line-height:1.3}
a{color:var(--accent)}
main{min-width:0}
main:focus{outline:none}
.doc{max-width:var(--measure);letter-spacing:var(--ls);word-spacing:var(--ws)}
h1{font-size:2em;line-height:1.2;margin:0 0 .4em}
h2,h3,h4,h5,h6{line-height:1.3;margin:1.6em 0 .5em}
h2{font-size:1.5em}h3{font-size:1.25em}h4{font-size:1.1em}h5,h6{font-size:1em}
p,ul,ol,figure,.table-wrap,.math,details{margin:0 0 var(--gap)}
.meta{color:var(--muted);margin-bottom:1.5em}
.table-wrap{max-width:100%;overflow-x:auto;border:1px solid var(--border);border-radius:6px}
table{border-collapse:collapse;min-width:100%;letter-spacing:normal;word-spacing:normal}
caption{text-align:left;font-weight:700;padding:.6em .75em}
th,td{text-align:left;vertical-align:top;padding:.5em .75em;border-top:1px solid var(--rule);min-width:8ch}
th{background:var(--surface);border-bottom:2px solid var(--border)}
figure{margin-left:0;margin-right:0}
img{max-width:100%;height:auto;display:block;background:#fff;border-radius:6px}
.decorative img{max-height:3em;margin:0 auto;background:transparent}
figcaption{color:var(--muted);font-size:.92em;margin-top:.5em}
.math{display:flex;flex-direction:column;gap:.35em;padding:.75em 1em;background:var(--surface);border-left:4px solid var(--accent)}
.math-visual{font-family:'Cambria Math','STIX Two Math',ui-monospace,monospace;white-space:pre-wrap;overflow-wrap:anywhere;letter-spacing:normal}
.math-spoken{font-size:.92em;color:var(--muted)}
.page{display:flex;align-items:center;gap:.75em;font-size:.8em;color:var(--muted)}
.page::before,.page::after{content:'';flex:1;border-top:1px solid var(--rule)}
details.plain{border-left:4px solid var(--accent);padding:.5em .9em;background:var(--surface)}
details.plain summary{cursor:pointer;min-height:44px;display:flex;align-items:center;font-weight:600;color:var(--accent)}
.stepper{display:none;flex-wrap:wrap;gap:.75rem;align-items:center;margin-top:2rem}
html.focus-on .stepper{display:flex}
.progress{display:none;font-weight:600}
html.focus-on .progress{display:block}
button{font:inherit;min-height:44px;min-width:44px;padding:.5em 1em;border-radius:8px;border:1px solid var(--border);background:var(--bg);color:var(--text);cursor:pointer}
button.primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent);font-weight:700}
button:disabled{opacity:.75;cursor:not-allowed}
.sr-only{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}
@media print{header.top,nav.toc,.stepper,.skip{display:none!important}.layout{display:block}}
`;

// Static script: no document content is interpolated into it.
const SCRIPT = `
(function(){
var KEY='flowread-access-export:profile';var root=document.documentElement;
var sections=[].slice.call(document.querySelectorAll('main section.sec'));
var prog=document.getElementById('progress');var back=document.getElementById('step-back');var next=document.getElementById('step-next');
var idx=0;
function store(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function read(k){try{return localStorage.getItem(k)}catch(e){return null}}
function minsLeft(i){var w=0;for(var j=i;j<sections.length;j++){w+=+sections[j].getAttribute('data-words')||0}return w?Math.max(1,Math.ceil(w/200)):0}
function show(i,moveFocus){if(!sections.length)return;idx=Math.max(0,Math.min(sections.length-1,i));
for(var j=0;j<sections.length;j++){sections[j].hidden=root.classList.contains('focus-on')&&j!==idx}
var m=minsLeft(idx);prog.textContent='Section '+(idx+1)+' of '+sections.length+' \\u00b7 '+(m?'about '+m+' min left':'nearly done');
back.disabled=idx===0;next.disabled=idx===sections.length-1;store(KEY+':section:'+location.pathname,String(idx));
if(moveFocus){var h=sections[idx].querySelector('h2,h3,h4,h5,h6')||document.querySelector('h1');if(h){h.focus();h.scrollIntoView({block:'start'})}}}
function apply(p){root.setAttribute('data-profile',p);var focus=p==='focus';root.classList.toggle('focus-on',focus);
if(focus){var s=parseInt(read(KEY+':section:'+location.pathname),10);show(isNaN(s)?0:s,false)}else{for(var j=0;j<sections.length;j++){sections[j].hidden=false}}}
var radios=[].slice.call(document.querySelectorAll('input[name=profile]'));
var saved=read(KEY);if(!saved||!document.getElementById('p-'+saved)){saved='standard'}
radios.forEach(function(r){r.checked=r.value===saved;r.addEventListener('change',function(){if(r.checked){apply(r.value);store(KEY,r.value)}})});
back.addEventListener('click',function(){show(idx-1,true)});next.addEventListener('click',function(){show(idx+1,true)});
apply(saved);
document.querySelectorAll('nav.toc a').forEach(function(a,i){a.addEventListener('click',function(ev){if(root.classList.contains('focus-on')){ev.preventDefault();show(i,true)}})});
})();
`;

const EXPORT_PROFILES = [
  ['standard', 'Standard'],
  ['dyslexia', 'Dyslexia'],
  ['focus', 'Focus'],
  ['lowvision', 'Low vision'],
];

export function exportAccessibleHtml(doc) {
  const d = doc || {};
  const title = (d.title && String(d.title).trim()) || 'Untitled document';
  const lang = safeLang(d.lang);
  const sections = d.sections || [];
  const levels = headingLevels(sections);
  const tables = tableNumbers(d);
  const words = sections.map(sectionWordCount);
  const mins = readingMinutes(words.reduce((a, b) => a + b, 0));

  const toc = sections
    .map((s, i) => `<li><a href="#sec-${safeId(s.id)}">${e(sectionLabel(s, i))}</a></li>`)
    .join('');

  const body = sections
    .map((s, i) => {
      const lvl = levels.get(`sec:${s.id}`);
      const head = lvl ? `<h${lvl} id="h-${safeId(s.id)}" tabindex="-1">${e(s.heading)}</h${lvl}>` : '';
      const summary =
        s.summary && String(s.summary).trim()
          ? `<details class="plain"><summary>In this section (summary)</summary><p>${e(s.summary)}</p></details>`
          : '';
      const blocks = (s.blocks || []).map((b) => renderBlock(b, levels, tables)).join('\n');
      return `<section class="sec" id="sec-${safeId(s.id)}" data-words="${words[i]}">${head}${summary}\n${blocks}</section>`;
    })
    .join('\n');

  const radios = EXPORT_PROFILES.map(
    ([id, label]) =>
      `<span class="chip"><input type="radio" name="profile" id="p-${id}" value="${id}"${id === 'standard' ? ' checked' : ''}><label for="p-${id}">${label}</label></span>`,
  ).join('');

  return `<!doctype html>
<html lang="${e(lang)}" data-profile="standard">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title>
<meta name="generator" content="FlowRead Access">
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#content">Skip to content</a>
<header class="top">
<p class="brand">${e(title)}</p>
<fieldset class="profiles" role="radiogroup" aria-labelledby="profiles-legend"><legend id="profiles-legend">Reading profile</legend>${radios}</fieldset>
</header>
<div class="layout">
<nav class="toc" aria-label="Table of contents"><p><strong>Contents</strong></p><ol>${toc}</ol></nav>
<main id="content" tabindex="-1">
<article class="doc" lang="${e(lang)}">
<h1 tabindex="-1">${e(title)}</h1>
<p class="meta">${sections.length} ${sections.length === 1 ? 'section' : 'sections'} · about ${mins} min read${d.sourceFile ? ` · from ${e(d.sourceFile)}` : ''}</p>
<p class="progress" id="progress" role="status" aria-live="polite"></p>
${body}
</article>
<nav class="stepper" aria-label="Section navigation"><button type="button" id="step-back">Back</button><button type="button" id="step-next" class="primary">Next</button></nav>
</main>
</div>
<script>${SCRIPT}</script>
</body>
</html>
`;
}

export default exportAccessibleHtml;
