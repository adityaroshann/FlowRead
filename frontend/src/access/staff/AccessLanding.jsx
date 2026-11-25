import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FileText, Table, ScanEye, SlidersHorizontal, Trash2, FolderOpen, Upload, BookOpen } from 'lucide-react';
import StaffShell from './StaffShell';
import Dialog from './Dialog';
import { listDocs, deleteDoc, getDoc } from '../shared/storage';
import { seedSampleDoc } from '../shared/sampleDoc';
import { checkDoc } from '../shared/check';
import { formatDate } from './staffUtils';

const FEATURES = [
  {
    icon: FileText,
    title: 'Real structure',
    body: 'Headings, lists and reading order are rebuilt from the layout, so screen reader users can navigate by heading.',
  },
  {
    icon: Table,
    title: 'Usable tables',
    body: 'Tables become real data tables with header rows that staff can confirm or correct.',
  },
  {
    icon: ScanEye,
    title: 'Reviewed image descriptions',
    body: 'AI drafts a description for each image. Nothing is marked approved until a staff member approves it.',
  },
  {
    icon: SlidersHorizontal,
    title: 'One document, many needs',
    body: 'Students choose a reading profile for dyslexia, ADHD and focus, screen readers or low vision. The same document adapts.',
  },
];

function scoreOf(doc) {
  try {
    return (doc.report && typeof doc.report.score === 'number' ? doc.report : checkDoc(doc)).score;
  } catch {
    return null;
  }
}

async function readDocs() {
  try {
    const docs = (await listDocs()) || [];
    return [...docs].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  } catch {
    return [];
  }
}

export default function AccessLanding() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [message, setMessage] = useState('');
  const [sampleError, setSampleError] = useState('');
  const cancelRef = useRef(null);
  const listHeadingRef = useRef(null);

  useEffect(() => {
    document.title = 'FlowRead for institutions: accessible course materials';
    readDocs().then(setDocs);
  }, []);

  const openSample = async () => {
    setSampleError('');
    try {
      await seedSampleDoc();
      if (!(await getDoc('doc_sample'))) throw new Error('Storage full');
      navigate('/workspace/review/doc_sample');
    } catch (err) {
      setSampleError(
        /storage full/i.test(String(err?.message))
          ? 'The sample could not be saved because browser storage is full. Delete a document below and try again.'
          : 'The sample document could not be opened.'
      );
    }
  };

  const confirmDelete = async () => {
    const doc = pendingDelete;
    setPendingDelete(null);
    if (!doc) return;
    try {
      await deleteDoc(doc.id);
      setDocs(await readDocs());
      setMessage(`Deleted “${doc.title || 'Untitled document'}”.`);
    } catch {
      setMessage('The document could not be deleted.');
    }
    // The delete button is gone, so move focus somewhere predictable.
    requestAnimationFrame(() => listHeadingRef.current?.focus());
  };

  return (
    <StaffShell
      actions={
        <Link to="/workspace/new" className="fa-btn fa-btn--sm">
          <Upload size={16} aria-hidden="true" /> New conversion
        </Link>
      }
    >
      <section className="fa-hero" aria-labelledby="fa-hero-title">
        <div className="fa-container">
          <p className="fa-eyebrow">For accessibility and disability services offices</p>
          <h1 id="fa-hero-title">Accessible course materials in minutes, not days</h1>
          <p className="fa-hero__lede">
            Upload a course PDF, Word file or slide deck. FlowRead rebuilds its structure, tables and image descriptions,
            your team reviews the result, and every student gets one document that adapts to how they read.
          </p>
          <div className="fa-btnrow">
            <Link to="/workspace/new" className="fa-btn fa-btn--primary fa-btn--lg">
              <Upload size={18} aria-hidden="true" /> Convert a document
            </Link>
            <button type="button" className="fa-btn fa-btn--lg" onClick={openSample}>
              <BookOpen size={18} aria-hidden="true" /> Open sample document
            </button>
          </div>
          {sampleError && (
            <p className="fa-notice fa-notice--error" role="alert" style={{ marginTop: '1rem' }}>
              {sampleError}
            </p>
          )}
        </div>
      </section>

      <section className="fa-section" aria-labelledby="fa-features-title">
        <div className="fa-container">
          <h2 id="fa-features-title">What your team gets</h2>
          <ul className="fa-features">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              const { title, body } = feature;
              return (
              <li key={title} className="fa-card fa-feature">
                <span className="fa-feature__icon" aria-hidden="true">
                  <Icon size={18} aria-hidden="true" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="fa-section" aria-labelledby="fa-how-title">
        <div className="fa-container">
          <h2 id="fa-how-title">How it works</h2>
          <ol className="fa-steps">
            <li>
              <h3>Upload</h3>
              <p>Add a PDF, DOCX or PPTX up to 25 MB. FlowRead reads the layout, finds tables and drafts image descriptions.</p>
            </li>
            <li>
              <h3>Review</h3>
              <p>Fix headings, tables and descriptions. An accessibility check updates as you edit and points to each issue.</p>
            </li>
            <li>
              <h3>Publish</h3>
              <p>Share a student link or download a self-contained accessible HTML file that works offline.</p>
            </li>
          </ol>
        </div>
      </section>

      <section className="fa-section" aria-labelledby="fa-recent-title">
        <div className="fa-container">
          <h2 id="fa-recent-title" ref={listHeadingRef} tabIndex={-1}>
            Recent documents
          </h2>
          <p role="status" className="fa-visually-hidden">{message}</p>
          {docs.length === 0 ? (
            <p className="fa-empty">
              No documents yet. Convert a document or open the sample to get started.
            </p>
          ) : (
            <ul className="fa-doclist">
              {docs.map((doc) => {
                const score = scoreOf(doc);
                const title = doc.title || 'Untitled document';
                return (
                  <li key={doc.id} className="fa-card fa-docrow">
                    <div className="fa-docrow__main">
                      <p className="fa-docrow__title">{title}</p>
                      <p className="fa-docrow__meta">
                        {doc.sourceFile && <span>{doc.sourceFile}</span>}
                        {doc.createdAt && <span>Converted {formatDate(doc.createdAt)}</span>}
                        {score !== null && <span>Check: {score}/100</span>}
                        <span>{doc.publishedAt ? `Published ${formatDate(doc.publishedAt)}` : 'Draft'}</span>
                      </p>
                    </div>
                    <div className="fa-btnrow">
                      <Link to={`/workspace/review/${encodeURIComponent(doc.id)}`} className="fa-btn fa-btn--sm">
                        <FolderOpen size={16} aria-hidden="true" /> Open<span className="fa-visually-hidden"> {title}</span>
                      </Link>
                      <button
                        type="button"
                        className="fa-btn fa-btn--sm fa-btn--danger"
                        onClick={() => setPendingDelete(doc)}
                      >
                        <Trash2 size={16} aria-hidden="true" /> Delete<span className="fa-visually-hidden"> {title}</span>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="fa-footnote">
            Prototype: documents are stored only in this browser. Clearing site data removes them.
          </p>
        </div>
      </section>

      <Dialog
        open={Boolean(pendingDelete)}
        role="alertdialog"
        title="Delete this document?"
        description={`“${pendingDelete?.title || 'Untitled document'}” will be removed from this browser. Any student link to it will stop working. This cannot be undone.`}
        onClose={() => setPendingDelete(null)}
        initialFocusRef={cancelRef}
      >
        <div className="fa-dialog__actions">
          <button type="button" className="fa-btn" ref={cancelRef} onClick={() => setPendingDelete(null)}>
            Cancel
          </button>
          <button type="button" className="fa-btn fa-btn--primary" onClick={confirmDelete}>
            <Trash2 size={16} aria-hidden="true" /> Delete document
          </button>
        </div>
      </Dialog>
    </StaffShell>
  );
}
