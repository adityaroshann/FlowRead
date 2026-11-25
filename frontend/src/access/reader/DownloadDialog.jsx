import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Heading, Label, Modal, ModalOverlay, Radio, RadioGroup, Switch } from 'react-aria-components';
import { CircleAlert, FileCode2, FileText, FileType2, LoaderCircle, Printer, X } from 'lucide-react';
import DocRenderer from '../shared/DocRenderer.jsx';
import { exportPdf } from '../shared/api.js';
import { exportAccessibleHtml } from '../shared/exportHtml.js';
import { printCss, readingCss } from '@flowread/core/readingCss.js';
import { sectionLabel, slugify } from '@flowread/core/docModel.js';
import { docxFilename, exportDocx, saveBlob } from '../../utils/export.js';

const PAGE_W = { A4: 794, Letter: 816 }; // CSS px at 96 dpi
const PAGE_H = { A4: 1123, Letter: 1056 };

function Toggle({ label, isSelected, onChange, isDisabled }) {
  return (
    <Switch className="switch" isSelected={isSelected} onChange={onChange} isDisabled={isDisabled}>
      <span className="switch-text">{label}</span>
      <span className="switch-track" aria-hidden="true" />
    </Switch>
  );
}

function previewDoc(doc, options) {
  const first = (doc.sections || []).slice(0, 2).map((s) => ({
    ...s,
    blocks: (s.blocks || []).filter((b) => options.includePageRefs || b.type !== 'pageMarker').slice(0, 6),
  }));
  return { ...doc, sections: first };
}

/** A scaled-down page showing roughly how the export will look in the current settings. */
function Preview({ doc, settings, options }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.3);
  const w = PAGE_W[options.pageSize];
  const h = PAGE_H[options.pageSize];
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(0.5, e.contentRect.width / w)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  const pdoc = useMemo(() => previewDoc(doc, options), [doc, options]);

  return (
    <div className="dl-preview" ref={wrapRef} aria-hidden="true" inert>
      <div className="dl-sheet" style={{ width: w * scale, height: h * scale }} data-fra-theme={settings.theme}>
        <div className="dl-sheet-inner fra-theme" data-fra-theme={settings.theme} style={{ width: w, height: h, transform: `scale(${scale})` }}>
          <p className="dl-sheet-title">{doc.title || 'Untitled document'}</p>
          {options.includeToc && (
            <div className="dl-sheet-toc">
              <p>Contents</p>
              <ol>
                {(doc.sections || []).slice(0, 8).map((s, i) => (
                  <li key={s.id}>{sectionLabel(s, i)}</li>
                ))}
              </ol>
            </div>
          )}
          <DocRenderer
            doc={pdoc}
            profile={{ ...settings, plainLanguage: false, readAloud: false, measure: Math.min(settings.measure, 80) }}
            showTitle={false}
            className="dl-sheet-doc"
            renderBeforeBlocks={(sec) =>
              options.includeSummaries && sec.summary ? <p className="dl-sheet-summary">{sec.summary}</p> : null
            }
          />
        </div>
      </div>
    </div>
  );
}

function printFallback(doc, settings, pageSize) {
  const html = exportAccessibleHtml(doc);
  const css = `${printCss(settings, { pageSize })}\n${readingCss(settings, { scope: 'html', recolor: true })}`;
  const page = html.replace('</head>', `<style>${css.replace(/<\//g, '<\\/')}</style></head>`);
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  // srcdoc holds our own escaped export (exportAccessibleHtml escapes all document text).
  frame.srcdoc = page;
  frame.onload = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } finally {
      setTimeout(() => frame.remove(), 60000);
    }
  };
  document.body.appendChild(frame);
}

export default function DownloadDialog({ isOpen, onOpenChange, doc, settings, onDone, initialFormat = 'pdf' }) {
  const [format, setFormat] = useState(initialFormat);
  const [options, setOptions] = useState({
    pageSize: typeof navigator !== 'undefined' && /^en-(US|CA)/.test(navigator.language || '') ? 'Letter' : 'A4',
    includeToc: true,
    includeSummaries: true,
    includePlain: false,
    includePageRefs: true,
  });
  const [status, setStatus] = useState({ phase: 'idle' });
  const abortRef = useRef(null);
  const errRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setFormat(initialFormat);
      setStatus({ phase: 'idle' });
    } else {
      abortRef.current?.abort();
    }
  }, [isOpen, initialFormat]);

  useEffect(() => {
    if (status.phase === 'error') errRef.current?.focus();
  }, [status.phase]);

  const opt = (k) => (v) => setOptions((o) => ({ ...o, [k]: v }));
  const hasSummaries = (doc.sections || []).some((s) => s.summary);
  const hasPlain = (doc.sections || []).some((s) => (s.blocks || []).some((b) => b.plain));

  const download = async () => {
    if (status.phase === 'working') return;
    const name = slugify(doc.title);
    if (format === 'html') {
      const html = exportAccessibleHtml(doc);
      saveBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `${name}-accessible.html`);
      onDone?.('Accessible HTML downloaded.');
      onOpenChange(false);
      return;
    }
    if (format === 'docx') {
      setStatus({ phase: 'working', startedAt: Date.now() });
      try {
        const blob = await exportDocx(doc, settings, options);
        saveBlob(blob, docxFilename(doc));
        onDone?.('Word file downloaded.');
        onOpenChange(false);
      } catch {
        setStatus({ phase: 'error', message: 'The Word file couldn’t be built from this document.', fallback: false });
      }
      return;
    }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus({ phase: 'working', startedAt: Date.now() });
    const slow = setTimeout(() => setStatus((s) => (s.phase === 'working' ? { ...s, slow: true } : s)), 5000);
    try {
      const blob = await exportPdf(doc, settings, options, { signal: ctrl.signal });
      saveBlob(blob, `${name}.pdf`);
      onDone?.('PDF downloaded.');
      onOpenChange(false);
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setStatus({
        phase: 'error',
        message:
          err?.status === 0 || err?.status === 404 || err?.status >= 500
            ? 'The PDF service isn’t available right now.'
            : err?.message || 'The PDF couldn’t be made.',
        fallback: true,
      });
    } finally {
      clearTimeout(slow);
    }
  };

  const working = status.phase === 'working';

  return (
    <ModalOverlay className="modal-overlay" isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={!working}>
      <Modal className="modal modal-wide">
        <Dialog className="dialog dl">
          {({ close }) => (
            <>
              <div className="dialog-head">
                <div>
                  <Heading slot="title" className="dialog-title">
                    Download
                  </Heading>
                  <p className="dialog-desc">Your copy keeps the headings, lists and tables, set in your current reading settings.</p>
                </div>
                <Button className="btn btn-icon btn-quiet" onPress={close} aria-label="Close" isDisabled={working}>
                  <X size={18} aria-hidden="true" />
                </Button>
              </div>

              <div className="dl-body">
                <div className="dl-options">
                  <RadioGroup className="dl-formats" value={format} onChange={setFormat}>
                    <Label className="set-label">Format</Label>
                    <Radio value="pdf" className="dl-format">
                      <FileText size={18} aria-hidden="true" />
                      <span>
                        <span className="dl-format-name">PDF</span>
                        <span className="dl-format-desc">Tagged, with bookmarks. Good for printing and annotating.</span>
                      </span>
                    </Radio>
                    <Radio value="html" className="dl-format">
                      <FileCode2 size={18} aria-hidden="true" />
                      <span>
                        <span className="dl-format-name">Accessible HTML</span>
                        <span className="dl-format-desc">One file that opens offline, with profile switching built in.</span>
                      </span>
                    </Radio>
                    <Radio value="docx" className="dl-format">
                      <FileType2 size={18} aria-hidden="true" />
                      <span>
                        <span className="dl-format-name">Word</span>
                        <span className="dl-format-desc">Real headings and lists you can edit.</span>
                      </span>
                    </Radio>
                  </RadioGroup>

                  {format === 'pdf' && (
                    <RadioGroup className="dl-size" value={options.pageSize} onChange={opt('pageSize')} orientation="horizontal">
                      <Label className="set-label">Page size</Label>
                      <div className="seg">
                        <Radio value="A4" className="seg-item">
                          A4
                        </Radio>
                        <Radio value="Letter" className="seg-item">
                          Letter
                        </Radio>
                      </div>
                    </RadioGroup>
                  )}

                  {format !== 'html' && (
                    <div className="dl-switches">
                      <p className="set-label">Include</p>
                      {format === 'pdf' && <Toggle label="Contents page" isSelected={options.includeToc} onChange={opt('includeToc')} />}
                      <Toggle
                        label={hasSummaries ? 'Section summaries' : 'Section summaries (none yet)'}
                        isSelected={options.includeSummaries}
                        onChange={opt('includeSummaries')}
                      />
                      <Toggle
                        label={hasPlain ? 'Plain-language versions' : 'Plain-language versions (none yet)'}
                        isSelected={options.includePlain}
                        onChange={opt('includePlain')}
                      />
                      <Toggle label="Original page numbers" isSelected={options.includePageRefs} onChange={opt('includePageRefs')} />
                    </div>
                  )}
                </div>
                <Preview doc={doc} settings={settings} options={format === 'pdf' ? options : { ...options, includeToc: false, pageSize: 'A4' }} />
              </div>

              {status.phase === 'error' && (
                <div className="notice notice-error" role="alert" tabIndex={-1} ref={errRef}>
                  <CircleAlert size={18} aria-hidden="true" />
                  <div>
                    <p>
                      <strong>{status.message}</strong>
                      {status.fallback && ' You can still save a PDF with your browser’s print dialog. It keeps your colours and fonts, but it won’t be tagged.'}
                    </p>
                  </div>
                </div>
              )}

              <div className="dialog-actions">
                {working && (
                  <p className="dl-working" role="status">
                    <LoaderCircle size={16} className="spin" aria-hidden="true" />
                    {format === 'pdf'
                      ? status.slow
                        ? 'Still building. If the server was asleep, this can take up to a minute.'
                        : 'Building your PDF…'
                      : 'Building your Word file…'}
                  </p>
                )}
                {status.phase === 'error' && status.fallback && (
                  <Button
                    className="btn"
                    onPress={() => {
                      printFallback(doc, settings, options.pageSize);
                      onOpenChange(false);
                    }}
                  >
                    <Printer size={16} aria-hidden="true" /> Print to PDF instead
                  </Button>
                )}
                <Button className="btn btn-primary" onPress={download} isDisabled={working}>
                  {status.phase === 'error' ? 'Try again' : format === 'pdf' ? 'Download PDF' : format === 'html' ? 'Download HTML' : 'Download Word file'}
                </Button>
              </div>
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
