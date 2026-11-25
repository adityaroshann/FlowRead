import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, Check, CloudOff, Copy, Download, ExternalLink, LoaderCircle, Send, TriangleAlert, Upload } from 'lucide-react';
import StaffShell from './StaffShell';
import Dialog from './Dialog';
import ReportPanel from './ReportPanel';
import StructureEditor from './StructureEditor';
import ImageQueue from './ImageQueue';
import PreviewPane from './PreviewPane';
import { getDoc, saveDoc } from '../shared/storage';
import { checkDoc } from '../shared/check';
import { exportAccessibleHtml } from '../shared/exportHtml';
import {
  SEVERITY_LABEL,
  blockingIssues,
  collectImages,
  findBlock,
  formatDate,
  slugify,
  updateBlock,
  updateSection,
} from './staffUtils';

const SAVE_DELAY = 700;
const ANNOUNCE_DELAY = 1200;
const TABS = [
  { id: 'structure', label: 'Structure' },
  { id: 'images', label: 'Images' },
  { id: 'preview', label: 'Student preview' },
];

function safeCheck(doc) {
  try {
    return checkDoc(doc);
  } catch {
    return doc?.report || { score: 0, issues: [] };
  }
}

function prefersReducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export default function ReviewPage() {
  const { id } = useParams();
  return <ReviewWorkspace key={id} id={id} mode="workspace" />;
}

function NotFound({ id, mode }) {
  useEffect(() => {
    document.title = 'Document not found · FlowRead';
  }, []);
  return (
    <StaffShell mode={mode}>
      <div className="fa-centered">
        <h1>Document not found</h1>
        <p>
          No document with the id <code>{id}</code> is stored in this browser. Documents are kept only in the
          browser where they were converted.
        </p>
        <div className="fa-btnrow">
          <Link to={mode === 'personal' ? '/library' : '/workspace'} className="fa-btn">
            <ArrowLeft size={16} aria-hidden="true" /> {mode === 'personal' ? 'Back to library' : 'Back to workspace'}
          </Link>
          <Link to={mode === 'personal' ? '/' : '/workspace/new'} className="fa-btn fa-btn--primary">
            <Upload size={16} aria-hidden="true" /> {mode === 'personal' ? 'Import a document' : 'Convert a document'}
          </Link>
        </div>
      </div>
    </StaffShell>
  );
}

export function ReviewWorkspace({ id, mode = 'workspace' }) {
  const [loaded, setLoaded] = useState({ id: null, doc: null });
  useEffect(() => {
    let alive = true;
    getDoc(id).then((doc) => {
      if (alive) setLoaded({ id, doc });
    });
    return () => {
      alive = false;
    };
  }, [id]);
  if (loaded.id !== id) {
    return (
      <StaffShell mode={mode}>
        <p className="fa-centered" role="status">
          Opening the document…
        </p>
      </StaffShell>
    );
  }
  if (!loaded.doc) return <NotFound id={id} mode={mode} />;
  return <Workspace initialDoc={loaded.doc} mode={mode} />;
}

function Workspace({ initialDoc, mode }) {
  const personal = mode === 'personal';
  const [doc, setDoc] = useState(initialDoc);
  const [tab, setTab] = useState('structure');
  const [profileId, setProfileId] = useState('standard');
  const [saveState, setSaveState] = useState('saved'); // saved | pending | error
  const [saveError, setSaveError] = useState('');
  const [lastSaved, setLastSaved] = useState(null);
  const [announcement, setAnnouncement] = useState('');
  const [focusRequest, setFocusRequest] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [publishedOpen, setPublishedOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const dirtyRef = useRef(false);
  const latestRef = useRef(initialDoc);
  const announcedScoreRef = useRef(null);
  const tabRefs = useRef({});
  const goBackRef = useRef(null);

  const report = useMemo(() => safeCheck(doc), [doc]);
  const blocking = useMemo(() => blockingIssues(report), [report]);
  const images = useMemo(() => collectImages(doc), [doc]);
  const imagesToReview = images.filter(({ block }) => block.altStatus === 'ai' || block.altStatus === 'missing' || !block.altStatus).length;

  useEffect(() => {
    document.title = `${personal ? 'Fix structure' : 'Review'}: ${doc.title || 'Untitled document'} · FlowRead`;
  }, [doc.title, personal]);

  /* ---------- Persistence ---------- */

  const persist = useCallback(async (d) => {
    dirtyRef.current = false;
    try {
      await saveDoc({ ...d, report: safeCheck(d), updatedAt: new Date().toISOString() });
      setSaveState('saved');
      setSaveError('');
      setLastSaved(new Date());
      return true;
    } catch (err) {
      dirtyRef.current = true;
      setSaveState('error');
      setSaveError(
        /storage full/i.test(String(err?.message))
          ? 'Not saved: browser storage is full. Delete older documents from your library, then keep editing.'
          : 'Not saved: browser storage is unavailable.'
      );
      return false;
    }
  }, []);

  useEffect(() => {
    latestRef.current = doc;
    if (!dirtyRef.current) return undefined;
    const t = setTimeout(() => persist(doc), SAVE_DELAY);
    return () => clearTimeout(t);
  }, [doc, persist]);

  // Flush unsaved edits when leaving the page or closing the tab.
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current) persist(latestRef.current);
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [persist]);

  // Announce save + score once edits settle, so screen readers aren't flooded per keystroke.
  useEffect(() => {
    if (saveState === 'pending') return undefined;
    const t = setTimeout(() => {
      const parts = [];
      if (saveState === 'error') parts.push(saveError);
      else if (lastSaved) parts.push('Saved.');
      if (announcedScoreRef.current !== null && announcedScoreRef.current !== report.score) {
        parts.push(`Accessibility check: ${report.score} out of 100, ${report.issues.length} ${report.issues.length === 1 ? 'issue' : 'issues'}.`);
      }
      announcedScoreRef.current = report.score;
      setAnnouncement(parts.join(' '));
    }, saveState === 'error' ? 0 : ANNOUNCE_DELAY - SAVE_DELAY);
    return () => clearTimeout(t);
  }, [saveState, lastSaved, saveError, report]);

  /* ---------- Editing ---------- */

  const edit = useCallback((updater) => {
    dirtyRef.current = true;
    setSaveState('pending');
    setDoc((d) => updater(d));
  }, []);

  const onChangeDoc = useCallback((patch) => edit((d) => ({ ...d, ...patch })), [edit]);
  const onChangeSection = useCallback((sid, patch) => edit((d) => updateSection(d, sid, patch)), [edit]);
  const onChangeBlock = useCallback((bid, patch) => edit((d) => updateBlock(d, bid, patch)), [edit]);
  const onSavePlain = useCallback((bid, plain) => edit((d) => updateBlock(d, bid, { plain })), [edit]);

  /* ---------- Focus navigation (report issues, image links) ---------- */

  const goTo = useCallback((targetTab, elementId) => {
    setTab(targetTab);
    setFocusRequest({ elementId, n: Date.now() });
  }, []);

  useEffect(() => {
    if (!focusRequest) return undefined;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(focusRequest.elementId);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
      el.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [focusRequest]);

  const onSelectIssue = useCallback(
    (issue) => {
      if (issue.blockId) {
        const found = findBlock(doc, issue.blockId);
        if (found?.block.type === 'image') return goTo('images', `fa-img-${issue.blockId}`);
        if (found) return goTo('structure', `fa-block-${issue.blockId}`);
      }
      if (issue.sectionId) {
        const target = issue.rule === 'heading-skip' ? `fa-sechead-${issue.sectionId}` : `fa-section-${issue.sectionId}`;
        return goTo('structure', target);
      }
      if (issue.rule === 'doc-missing-lang') return goTo('structure', 'fa-doc-lang');
      return goTo('structure', 'fa-doc-title');
    },
    [doc, goTo]
  );

  const onGoToImage = useCallback((bid) => goTo('images', `fa-img-${bid}`), [goTo]);

  const onTabKey = (e, idx) => {
    let next = null;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next].id);
    tabRefs.current[TABS[next].id]?.focus();
  };

  /* ---------- Publish ---------- */

  const studentPath = `/read/${encodeURIComponent(doc.id)}`;
  const studentUrl = `${window.location.origin}${studentPath}`;

  const doPublish = () => {
    setConfirmOpen(false);
    const next = { ...doc, publishedAt: new Date().toISOString() };
    dirtyRef.current = true;
    setDoc(next);
    persist(next).then((ok) => {
      if (ok) {
        setCopied(false);
        setPublishedOpen(true);
      }
    });
  };

  const requestPublish = () => {
    if (blocking.length > 0) setConfirmOpen(true);
    else doPublish();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(studentUrl);
      setCopied(true);
    } catch {
      const input = document.getElementById('fa-student-link');
      input?.select();
      setCopied(false);
    }
  };

  const downloadHtml = () => {
    const html = exportAccessibleHtml({ ...doc, report });
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = `${slugify(doc.title)}.html`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  };

  /* ---------- Render ---------- */

  const saveLabel =
    saveState === 'pending'
      ? 'Saving…'
      : saveState === 'error'
        ? 'Not saved'
        : lastSaved
          ? `Saved ${lastSaved.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
          : 'Saved';

  const activeIdx = TABS.findIndex((t) => t.id === tab);

  return (
    <StaffShell
      mode={mode}
      actions={
        <>
          <span className={`fa-savestatus${saveState === 'error' ? ' fa-savestatus--error' : ''}`}>
            {saveState === 'pending' ? (
              <LoaderCircle size={16} className="fa-spin" aria-hidden="true" />
            ) : saveState === 'error' ? (
              <CloudOff size={16} aria-hidden="true" />
            ) : (
              <Check size={16} aria-hidden="true" />
            )}
            {saveLabel}
          </span>
          {personal ? (
            <Link to={studentPath} className="fa-btn fa-btn--primary fa-btn--sm">
              <BookOpen size={16} aria-hidden="true" /> Back to reading
            </Link>
          ) : (
            <button type="button" className="fa-btn fa-btn--primary fa-btn--sm" onClick={requestPublish}>
              <Send size={16} aria-hidden="true" /> {doc.publishedAt ? 'Republish' : 'Publish'}
            </button>
          )}
        </>
      }
    >
      <p className="fa-visually-hidden" aria-live="polite" aria-atomic="true">
        {announcement}
      </p>

      <div className="fa-review">
        <div className="fa-review__head">
          <div style={{ minWidth: 0 }}>
            <Link to={personal ? studentPath : '/workspace'} className="fa-backlink">
              <ArrowLeft size={16} aria-hidden="true" /> {personal ? 'Back to the document' : 'All documents'}
            </Link>
            <h1>
              <span className="fa-h1-kicker">{personal ? 'Fix structure' : 'Reviewing'}</span>
              {doc.title || 'Untitled document'}
            </h1>
            <p className="fa-review__meta">
              {[doc.sourceFile, doc.createdAt && `Converted ${formatDate(doc.createdAt)}`, personal ? null : doc.publishedAt ? `Published ${formatDate(doc.publishedAt)}` : 'Not published yet']
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {saveState === 'error' && (
          <div className="fa-notice fa-notice--error" role="alert" style={{ marginBottom: '1rem' }}>
            <TriangleAlert size={18} aria-hidden="true" />
            <p>{saveError}</p>
          </div>
        )}

        <div className="fa-panes">
          <aside className="fa-side" aria-label={personal ? 'Accessibility check' : 'Accessibility check and publishing'}>
            <ReportPanel doc={doc} report={report} onSelectIssue={onSelectIssue} />

            {!personal && (
            <section className="fa-card fa-publish" aria-labelledby="fa-publish-title">
              <h2 id="fa-publish-title">Publish</h2>
              {doc.publishedAt ? (
                <p>
                  Published {formatDate(doc.publishedAt)}. Edits save to the published version automatically.
                </p>
              ) : (
                <p>Publishing marks the document ready for students and gives you a link and an accessible HTML file to share. You can publish at any score and keep editing afterwards.</p>
              )}
              {blocking.length > 0 && (
                <p className="fa-hint" style={{ marginTop: '0.4rem' }}>
                  {blocking.length} critical or serious {blocking.length === 1 ? 'issue remains' : 'issues remain'}.
                </p>
              )}
              <div className="fa-btnrow">
                <button type="button" className="fa-btn fa-btn--primary" onClick={requestPublish}>
                  <Send size={16} aria-hidden="true" /> {doc.publishedAt ? 'Republish' : 'Publish'}
                </button>
                {doc.publishedAt && (
                  <button type="button" className="fa-btn" onClick={() => setPublishedOpen(true)}>
                    Share options
                  </button>
                )}
              </div>
            </section>
            )}
          </aside>

          <div className="fa-work">
            <div className="fa-tabs" role="tablist" aria-label="Review views">
              {TABS.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`fa-tab-${t.id}`}
                  ref={(el) => {
                    tabRefs.current[t.id] = el;
                  }}
                  className="fa-tab"
                  aria-selected={tab === t.id}
                  aria-controls={`fa-panel-${t.id}`}
                  tabIndex={tab === t.id ? 0 : -1}
                  onClick={() => setTab(t.id)}
                  onKeyDown={(e) => onTabKey(e, i)}
                >
                  {t.label}
                  {t.id === 'images' && images.length > 0 && (
                    <span className={`fa-badge fa-badge--${imagesToReview ? 'ai' : 'approved'}`}>
                      {imagesToReview ? `${imagesToReview} to review` : 'Done'}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <section
              className="fa-tabpanel"
              role="tabpanel"
              id={`fa-panel-${tab}`}
              aria-labelledby={`fa-tab-${tab}`}
              tabIndex={0}
            >
              <h2 className="fa-visually-hidden">{TABS[activeIdx]?.label}</h2>
              {tab === 'structure' && (
                <StructureEditor
                  doc={doc}
                  report={report}
                  onChangeDoc={onChangeDoc}
                  onChangeSection={onChangeSection}
                  onChangeBlock={onChangeBlock}
                  onGoToImage={onGoToImage}
                />
              )}
              {tab === 'images' && <ImageQueue doc={doc} onChangeBlock={onChangeBlock} />}
              {tab === 'preview' && (
                <PreviewPane doc={doc} profileId={profileId} onProfileChange={setProfileId} onSavePlain={onSavePlain} />
              )}
            </section>
          </div>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        role="alertdialog"
        title="Publish with unresolved issues?"
        description={`${blocking.length} critical or serious ${blocking.length === 1 ? 'issue' : 'issues'} will affect students who rely on assistive technology.`}
        onClose={() => setConfirmOpen(false)}
        initialFocusRef={goBackRef}
      >
        <ul>
          {blocking.slice(0, 12).map((i, n) => (
            <li key={`${i.rule}-${i.blockId || i.sectionId || 'doc'}-${n}`}>
              <strong>{SEVERITY_LABEL[i.severity]}:</strong> {i.message}
            </li>
          ))}
          {blocking.length > 12 && <li>…and {blocking.length - 12} more.</li>}
        </ul>
        <div className="fa-dialog__actions">
          <button type="button" className="fa-btn" ref={goBackRef} onClick={() => setConfirmOpen(false)}>
            Go back and fix
          </button>
          <button type="button" className="fa-btn fa-btn--primary" onClick={doPublish}>
            Publish anyway
          </button>
        </div>
      </Dialog>

      <Dialog
        open={publishedOpen}
        title="Published"
        description="Students can open this document with the link below and choose their reading profile."
        onClose={() => setPublishedOpen(false)}
      >
        <div className="fa-field">
          <label className="fa-label" htmlFor="fa-student-link">
            Student link
          </label>
          <div className="fa-linkbox">
            <input id="fa-student-link" className="fa-input" value={studentUrl} readOnly onFocus={(e) => e.target.select()} />
            <button type="button" className="fa-btn fa-btn--sm" onClick={copyLink}>
              <Copy size={16} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
              <span className="fa-visually-hidden"> student link</span>
            </button>
          </div>
          <p className="fa-hint" aria-live="polite">
            {copied ? 'Link copied to the clipboard.' : 'Prototype: the link works in this browser, where the document is stored.'}
          </p>
        </div>
        <div className="fa-btnrow">
          <Link to={studentPath} className="fa-btn" target="_blank" rel="noopener">
            <ExternalLink size={16} aria-hidden="true" /> Open as student
            <span className="fa-visually-hidden"> (opens in a new tab)</span>
          </Link>
          <button type="button" className="fa-btn" onClick={downloadHtml}>
            <Download size={16} aria-hidden="true" /> Download accessible HTML
          </button>
        </div>
        <div className="fa-dialog__actions">
          <button type="button" className="fa-btn fa-btn--primary" onClick={() => setPublishedOpen(false)}>
            Done
          </button>
        </div>
      </Dialog>
    </StaffShell>
  );
}
