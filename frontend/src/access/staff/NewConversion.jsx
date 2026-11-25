import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDropzone } from 'react-dropzone';
import { ArrowLeft, Upload, FileText, X, Check, Circle, LoaderCircle, TriangleAlert, BookOpen } from 'lucide-react';
import StaffShell from './StaffShell';
import { convertFile } from '../shared/api';
import { saveDoc, getDoc } from '../shared/storage';
import { seedSampleDoc } from '../shared/sampleDoc';
import { checkDoc } from '../shared/check';
import { describeConvertError } from './staffUtils';

const MAX_SIZE = 25 * 1024 * 1024;
const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

const STEPS = [
  { id: 'layout', label: 'Reading layout' },
  { id: 'tables', label: 'Finding tables' },
  { id: 'images', label: 'Describing images' },
  { id: 'structure', label: 'Building structure' },
  { id: 'check', label: 'Checking accessibility' },
];

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function NewConversion() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [describeImages, setDescribeImages] = useState(true);
  const [phase, setPhase] = useState('idle'); // idle | converting | error
  const [progress, setProgress] = useState({ step: null, message: '', pct: 0 });
  const [error, setError] = useState(null);
  const runRef = useRef(0);
  const errorRef = useRef(null);
  const statusRef = useRef(null);

  useEffect(() => {
    document.title = 'New conversion · FlowRead Access';
    return () => {
      runRef.current += 1; // ignore results that arrive after leaving the page
    };
  }, []);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const onDrop = useCallback((accepted, rejected) => {
    setError(null);
    if (rejected?.length) {
      const code = rejected[0]?.errors?.[0]?.code;
      setFile(null);
      setError(
        code === 'file-too-large'
          ? { title: 'File is too large', detail: 'Files must be 25 MB or smaller.' }
          : code === 'too-many-files'
            ? { title: 'One file at a time', detail: 'Choose a single PDF or DOCX file.' }
            : { title: 'File type not supported', detail: 'Upload a PDF (.pdf) or Word document (.docx).' }
      );
      return;
    }
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const converting = phase === 'converting';
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_SIZE,
    multiple: false,
    disabled: converting,
    noClick: true,
    noKeyboard: true,
  });

  const start = async () => {
    if (!file || converting) return;
    const run = ++runRef.current;
    setError(null);
    setPhase('converting');
    setProgress({ step: 'layout', message: 'Uploading and reading page layout…', pct: 0 });
    requestAnimationFrame(() => statusRef.current?.focus());

    let doc;
    try {
      doc = await convertFile(file, {
        describeImages,
        onProgress: (evt) => {
          if (run !== runRef.current) return;
          if (typeof evt === 'number') {
            setProgress((p) => ({ ...p, pct: evt }));
          } else if (evt) {
            setProgress((p) => ({
              step: evt.step || p.step,
              message: evt.message || p.message,
              pct: typeof evt.pct === 'number' ? evt.pct : p.pct,
            }));
          }
        },
      });
    } catch (err) {
      if (run !== runRef.current) return;
      setPhase('error');
      setError(describeConvertError(err));
      return;
    }
    if (run !== runRef.current) return;

    try {
      let report = doc.report;
      try {
        report = checkDoc(doc);
      } catch {
        /* keep the backend report */
      }
      saveDoc({ ...doc, report });
    } catch (err) {
      setPhase('error');
      setError(describeConvertError(err?.message ? err : new Error('Storage full')));
      return;
    }
    navigate(`/access/review/${encodeURIComponent(doc.id)}`);
  };

  const cancel = () => {
    runRef.current += 1;
    setPhase('idle');
    setProgress({ step: null, message: '', pct: 0 });
  };

  const openSample = () => {
    try {
      seedSampleDoc();
      if (!getDoc('doc_sample')) throw new Error('Storage full');
      navigate('/access/review/doc_sample');
    } catch (err) {
      setError(describeConvertError(err));
    }
  };

  const activeIdx = STEPS.findIndex((s) => s.id === progress.step);
  const pct = Math.max(0, Math.min(100, Math.round(progress.pct || 0)));

  return (
    <StaffShell>
      <div className="fa-narrow">
        <Link to="/access" className="fa-backlink">
          <ArrowLeft size={16} aria-hidden="true" /> Back to workspace
        </Link>
        <div>
          <h1>Convert a document</h1>
          <p className="fa-hint" style={{ fontSize: '1rem', marginTop: '0.4rem' }}>
            PDF or Word (.docx), up to 25 MB. You will review the result before anything is published.
          </p>
        </div>

        {!converting && (
          <>
            <div
              {...getRootProps({
                className: `fa-drop${isDragActive ? ' fa-drop--active' : ''}`,
                onClick: open,
              })}
            >
              <input {...getInputProps({ id: 'fa-file-input', 'aria-label': 'Choose a PDF or DOCX file', 'aria-describedby': 'fa-file-hint' })} />
              <Upload className="fa-drop__icon" size={32} aria-hidden="true" />
              <p className="fa-drop__title" aria-hidden="true">
                {isDragActive ? 'Drop the file to add it' : 'Drag a file here'}
              </p>
              <p className="fa-drop__hint" id="fa-file-hint">
                Accepted: .pdf, .docx. Maximum 25 MB.
              </p>
              <button
                type="button"
                className="fa-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  open();
                }}
              >
                <FileText size={16} aria-hidden="true" /> {file ? 'Choose a different file' : 'Choose a file'}
              </button>
            </div>

            {file && (
              <div className="fa-card fa-picked">
                <p className="fa-picked__name">
                  <span className="fa-visually-hidden">Selected file: </span>
                  {file.name} <span className="fa-hint">({formatSize(file.size)})</span>
                </p>
                <button type="button" className="fa-btn fa-btn--sm fa-btn--ghost" onClick={() => setFile(null)}>
                  <X size={16} aria-hidden="true" /> Remove<span className="fa-visually-hidden"> {file.name}</span>
                </button>
              </div>
            )}

            <label className="fa-check">
              <input
                type="checkbox"
                checked={describeImages}
                onChange={(e) => setDescribeImages(e.target.checked)}
                aria-describedby="fa-ai-hint"
              />
              <span>
                <strong>Describe images with AI</strong>
                <span className="fa-hint" id="fa-ai-hint" style={{ display: 'block' }}>
                  Drafts are marked “AI draft” until a staff member approves each one. When off, images are flagged as missing a description.
                </span>
              </span>
            </label>

            <div className="fa-btnrow">
              <button
                type="button"
                className="fa-btn fa-btn--primary fa-btn--lg"
                onClick={start}
                disabled={!file}
                aria-describedby={!file ? 'fa-start-hint' : undefined}
              >
                Convert document
              </button>
              {!file && (
                <span className="fa-hint" id="fa-start-hint">
                  Choose a file first.
                </span>
              )}
            </div>
          </>
        )}

        {converting && (
          <section className="fa-card" aria-labelledby="fa-progress-title" style={{ display: 'grid', gap: '1rem' }}>
            <h2 id="fa-progress-title" style={{ fontSize: '1.1rem' }} tabIndex={-1} ref={statusRef}>
              Converting {file?.name}
            </h2>
            <div
              className="fa-progressbar"
              role="progressbar"
              aria-label="Conversion progress"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
            >
              <div style={{ width: `${pct}%` }} />
            </div>
            <ol className="fa-progress-steps">
              {STEPS.map((s, i) => {
                const state = activeIdx === -1 ? 'pending' : i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending';
                const skipped = s.id === 'images' && !describeImages;
                return (
                  <li key={s.id} className={`is-${state}`}>
                    {state === 'done' ? (
                      <Check size={18} aria-hidden="true" />
                    ) : state === 'active' ? (
                      <LoaderCircle size={18} className="fa-spin" aria-hidden="true" />
                    ) : (
                      <Circle size={18} aria-hidden="true" />
                    )}
                    <span>
                      {s.label}
                      {skipped ? ' (AI descriptions off)' : ''}
                      <span className="fa-visually-hidden">
                        {state === 'done' ? ', done' : state === 'active' ? ', in progress' : ', waiting'}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <p aria-live="polite" role="status">
              {progress.message || STEPS[activeIdx]?.label || 'Working…'} {pct > 0 ? `(${pct}%)` : ''}
            </p>
            <div>
              <button type="button" className="fa-btn" onClick={cancel}>
                Cancel
              </button>
            </div>
          </section>
        )}

        {error && (
          <div className="fa-notice fa-notice--error" role="alert" tabIndex={-1} ref={errorRef}>
            <TriangleAlert size={20} aria-hidden="true" />
            <div className="fa-notice__body">
              <p>
                <strong>{error.title}.</strong> {error.detail}
              </p>
              <div className="fa-btnrow">
                <button type="button" className="fa-btn fa-btn--sm" onClick={openSample}>
                  <BookOpen size={16} aria-hidden="true" /> Try the sample document
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </StaffShell>
  );
}
