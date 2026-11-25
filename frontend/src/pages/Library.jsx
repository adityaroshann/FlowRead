import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Menu, MenuItem, MenuTrigger, Popover } from 'react-aria-components';
import { BookOpen, Ellipsis, FilePenLine, FileText, Globe, Plus, Presentation, Trash2, Type } from 'lucide-react';
import AppShell from '../app/AppShell.jsx';
import Toast from '../app/Toast.jsx';
import { DOCS_CHANGED_EVENT, deleteDoc, getSource, listDocs, saveDoc, saveSource } from '../access/shared/storage.js';
import { SAMPLE_DOC_ID, seedSampleDoc } from '../access/shared/sampleDoc.js';
import { clearProgress, loadProgress, saveProgress } from '../access/reader/readerPrefs.js';
import { readingMinutes, sectionWordCount } from '@flowread/core/docModel.js';
import './library.css';

const KIND = {
  pdf: { label: 'PDF', icon: FileText },
  docx: { label: 'Word', icon: FileText },
  pptx: { label: 'Slides', icon: Presentation },
  text: { label: 'Pasted text', icon: Type },
  url: { label: 'Web page', icon: Globe },
};

function kindOf(doc) {
  const k = doc.source?.kind;
  if (KIND[k]) return k;
  const f = String(doc.sourceFile || '').toLowerCase();
  if (f.endsWith('.pdf')) return 'pdf';
  if (f.endsWith('.docx')) return 'docx';
  if (f.endsWith('.pptx')) return 'pptx';
  if (/^https?:/.test(f)) return 'url';
  return 'text';
}

function pageCount(doc) {
  if (Number.isInteger(doc.source?.pages) && doc.source.pages > 0) return doc.source.pages;
  let n = 0;
  for (const s of doc.sections || []) for (const b of s.blocks || []) if (b.type === 'pageMarker') n += 1;
  return n || null;
}

const rtf = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' }) : null;
function ago(iso) {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  const diff = (t - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (!rtf) return new Date(iso).toLocaleDateString();
  if (abs < 60) return 'just now';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function DocCard({ doc, onDelete }) {
  const navigate = useNavigate();
  const progress = loadProgress(doc.id);
  const pct = Math.min(100, Math.round(progress?.pct || 0));
  const kind = kindOf(doc);
  const { label, icon: Icon } = KIND[kind];
  const pages = pageCount(doc);
  const minutes = readingMinutes((doc.sections || []).reduce((n, s) => n + sectionWordCount(s), 0));
  const opened = ago(progress?.updatedAt);
  const title = doc.title || 'Untitled document';
  const href = `/read/${encodeURIComponent(doc.id)}`;

  return (
    <li className="lib-card">
      <div className="lib-card-kind">
        <Icon size={16} aria-hidden="true" />
        <span>{label}</span>
        {pages ? <span className="lib-card-pages">{kind === 'pptx' ? `${pages} slides` : `${pages} ${pages === 1 ? 'page' : 'pages'}`}</span> : null}
      </div>
      <h2 className="lib-card-title">
        <Link to={href}>{title}</Link>
      </h2>
      <p className="lib-card-meta">
        {opened ? `Opened ${opened}` : 'Not opened yet'}. About {minutes} min to read.
      </p>
      <div className="lib-card-progress">
        <div
          className="meter"
          role="progressbar"
          aria-label={`Reading progress for ${title}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <span style={{ width: `${pct}%` }} />
        </div>
        <span className="lib-card-pct" aria-hidden="true">
          {pct > 0 ? `${pct}%` : 'New'}
        </span>
      </div>
      <div className="lib-card-actions">
        <Link to={href} className={`btn btn-sm ${pct > 0 ? 'btn-primary' : ''}`}>
          <BookOpen size={14} aria-hidden="true" />
          {pct > 0 ? 'Resume' : 'Start reading'}
          <span className="sr-only"> {title}</span>
        </Link>
        <MenuTrigger>
          <Button className="btn btn-sm btn-icon btn-quiet" aria-label={`More actions for ${title}`}>
            <Ellipsis size={18} aria-hidden="true" />
          </Button>
          <Popover className="popover" placement="bottom end">
            <Menu
              className="menu"
              onAction={(key) => {
                if (key === 'edit') navigate(`${href}/edit`);
                if (key === 'delete') onDelete(doc);
              }}
            >
              <MenuItem id="edit" className="menu-item" textValue="Fix structure">
                <FilePenLine size={16} aria-hidden="true" /> Fix structure
              </MenuItem>
              <MenuItem id="delete" className="menu-item lib-danger" textValue="Delete">
                <Trash2 size={16} aria-hidden="true" /> Delete
              </MenuItem>
            </Menu>
          </Popover>
        </MenuTrigger>
      </div>
    </li>
  );
}

export default function Library() {
  const navigate = useNavigate();
  const [docs, setDocs] = useState(null);
  const [toast, setToast] = useState(null);
  const headingRef = useRef(null);

  const refresh = useCallback(() => {
    listDocs().then(setDocs);
  }, []);

  useEffect(() => {
    document.title = 'Library · FlowRead';
    refresh();
    window.addEventListener(DOCS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DOCS_CHANGED_EVENT, refresh);
  }, [refresh]);

  const sorted = useMemo(() => {
    if (!docs) return null;
    return [...docs].sort((a, b) => {
      const pa = loadProgress(a.id)?.updatedAt || a.updatedAt || a.createdAt || '';
      const pb = loadProgress(b.id)?.updatedAt || b.updatedAt || b.createdAt || '';
      return String(pb).localeCompare(String(pa));
    });
  }, [docs]);

  const onDelete = async (doc) => {
    const source = await getSource(doc.id);
    const progress = loadProgress(doc.id);
    await deleteDoc(doc.id);
    clearProgress(doc.id);
    requestAnimationFrame(() => headingRef.current?.focus());
    setToast({
      id: Date.now(),
      message: `Deleted “${doc.title || 'Untitled document'}”.`,
      action: {
        label: 'Undo',
        onAction: async () => {
          await saveDoc(doc);
          if (source) await saveSource(doc.id, source).catch(() => {});
          if (progress) saveProgress(doc.id, progress.section, progress.pct);
        },
      },
    });
  };

  const openSample = async () => {
    await seedSampleDoc();
    navigate(`/read/${SAMPLE_DOC_ID}`);
  };

  return (
    <AppShell mainClass="lib">
      <div className="lib-head">
        <div>
          <h1 className="display lib-title" ref={headingRef} tabIndex={-1}>
            Library
          </h1>
          <p className="lib-sub">
            {sorted == null
              ? 'Loading your documents…'
              : sorted.length === 0
                ? 'Documents you import appear here.'
                : `${sorted.length} ${sorted.length === 1 ? 'document' : 'documents'}, most recently read first. Saved in this browser only.`}
          </p>
        </div>
        <Link to="/" className="btn btn-primary">
          <Plus size={16} aria-hidden="true" /> Import
        </Link>
      </div>

      {sorted && sorted.length === 0 && (
        <div className="lib-empty">
          <p className="lib-empty-title">Nothing here yet</p>
          <p>Import a handout, slides or a web page and it will be kept here with your place in it.</p>
          <div className="lib-empty-actions">
            <Link to="/" className="btn btn-primary">
              Import a document
            </Link>
            <button type="button" className="btn" onClick={openSample}>
              Open the sample handout
            </button>
          </div>
        </div>
      )}

      {sorted && sorted.length > 0 && (
        <ul className="lib-grid" aria-label="Documents">
          {sorted.map((doc) => (
            <DocCard key={doc.id} doc={doc} onDelete={onDelete} />
          ))}
        </ul>
      )}

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </AppShell>
  );
}
