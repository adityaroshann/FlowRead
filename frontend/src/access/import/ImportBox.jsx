import { useEffect, useId, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Tab, TabList, TabPanel, Tabs } from 'react-aria-components';
import { Check, CircleAlert, FileUp, Link2, LoaderCircle, Sunrise, Type } from 'lucide-react';
import { MAX_FILE_BYTES, kindOfFile, useImport } from './useImport.js';
import './importBox.css';

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
};
const MAX_TEXT = 200000;

function clock(ms) {
  const s = Math.floor((ms || 0) / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Progress({ state, waking, onCancel }) {
  const headRef = useRef(null);
  useEffect(() => {
    headRef.current?.focus();
  }, []);
  const activeIdx = Math.max(0, state.steps.findIndex((s) => s.id === state.step));
  const pct = Math.max(3, Math.min(100, Math.round(state.pct || 0)));
  const quick = state.kind !== 'file';

  return (
    <div className="imp-progress">
      <div className="imp-progress-head">
        <h2 className="imp-progress-title" ref={headRef} tabIndex={-1}>
          Converting {state.label}
        </h2>
        <span className="imp-clock" aria-hidden="true">
          {clock(state.elapsed)}
        </span>
      </div>

      <div
        className="meter"
        role="progressbar"
        aria-label="Conversion progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.heard ? pct : undefined}
        aria-valuetext={state.heard ? `${pct}%` : waking ? 'Waking the server' : 'Starting'}
      >
        <span style={{ width: `${state.heard ? pct : waking ? 6 : 3}%` }} className={!state.heard ? 'imp-meter-wait' : undefined} />
      </div>

      {waking && (
        <div className="imp-waking" role="status">
          <Sunrise size={20} aria-hidden="true" />
          <div>
            <p className="imp-waking-title">{quick ? 'Still working, or waking the server' : 'Waking the server'}</p>
            <p>
              The free server sleeps when nobody is using it and can take up to a minute to start. Keep this page open; the
              conversion carries on by itself.
            </p>
          </div>
        </div>
      )}

      <ol className="imp-steps" aria-label="Steps">
        {state.steps.map((s, i) => {
          const status = i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'todo';
          return (
            <li key={s.id} className={`imp-step is-${status}`} aria-current={status === 'active' ? 'step' : undefined}>
              <span className="imp-step-icon" aria-hidden="true">
                {status === 'done' ? <Check size={14} /> : status === 'active' ? <LoaderCircle size={14} className="spin" /> : null}
              </span>
              <span>
                {s.label}
                <span className="sr-only">{status === 'done' ? ' (done)' : status === 'active' ? ' (in progress)' : ''}</span>
                {status === 'active' && state.message && <span className="imp-step-msg">{state.message}</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <div className="sr-only" role="status" aria-live="polite">
        {state.steps[activeIdx]?.label}
      </div>

      <div>
        <button type="button" className="btn btn-quiet" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function FilePanel({ onFile, onError }) {
  const hintId = useId();
  const onDrop = (accepted, rejected) => {
    if (rejected?.length) {
      const code = rejected[0]?.errors?.[0]?.code;
      onError(
        code === 'file-too-large'
          ? { title: 'That file is too large', detail: 'Files can be up to 25 MB.' }
          : code === 'too-many-files'
            ? { title: 'One file at a time', detail: 'Choose a single PDF, Word or PowerPoint file.' }
            : { title: 'That file type isn’t supported', detail: 'Use a PDF, Word (.docx) or PowerPoint (.pptx) file.' },
      );
      return;
    }
    const file = accepted[0];
    if (file && kindOfFile(file)) onFile(file);
  };
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: MAX_FILE_BYTES,
    multiple: false,
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div {...getRootProps({ className: `imp-drop${isDragActive ? ' is-drag' : ''}` })}>
      <input {...getInputProps({ 'aria-label': 'Choose a file to convert', 'data-testid': 'file-input' })} />
      <FileUp size={28} strokeWidth={1.5} aria-hidden="true" className="imp-drop-icon" />
      <p className="imp-drop-title">{isDragActive ? 'Drop it here' : 'Drop a PDF, Word or PowerPoint file'}</p>
      <p className="hint" id={hintId}>
        Up to 25 MB. Headings, lists, tables and images come through.
      </p>
      <button type="button" className="btn btn-primary" onClick={open} aria-describedby={hintId}>
        Choose a file
      </button>
    </div>
  );
}

function TextPanel({ onSubmit }) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const textId = useId();
  const errId = useId();
  const empty = !text.trim();
  const tooLong = text.length > MAX_TEXT;
  const invalid = touched && (empty || tooLong);

  return (
    <form
      className="imp-form"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (empty || tooLong) return;
        onSubmit({ text, title });
      }}
      noValidate
    >
      <div className="field">
        <label className="label" htmlFor={`${textId}-t`}>
          Title <span className="imp-optional">(optional)</span>
        </label>
        <input id={`${textId}-t`} className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
      </div>
      <div className="field">
        <label className="label" htmlFor={textId}>
          Text
        </label>
        <textarea
          id={textId}
          className="textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          aria-invalid={invalid || undefined}
          aria-describedby={`${errId} ${textId}-h`}
          placeholder="Paste notes, an article or a chapter. Lines starting with # become headings."
        />
        <p className="hint" id={`${textId}-h`}>
          Markdown-style headings (#) and lists (- or 1.) are kept.
        </p>
        <p className="imp-field-error" id={errId} aria-live="polite">
          {invalid ? (empty ? 'Paste some text first.' : 'That’s over 200,000 characters. Paste a shorter part.') : ''}
        </p>
      </div>
      <div>
        <button type="submit" className="btn btn-primary">
          Convert text
        </button>
      </div>
    </form>
  );
}

function LinkPanel({ onSubmit }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const id = useId();
  return (
    <form
      className="imp-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        let parsed = null;
        try {
          parsed = new URL(url.trim());
        } catch {
          parsed = null;
        }
        if (!parsed || !/^https?:$/.test(parsed.protocol)) {
          setError('Enter a full web address starting with https://');
          return;
        }
        setError('');
        onSubmit({ url: parsed.href });
      }}
    >
      <div className="field">
        <label className="label" htmlFor={id}>
          Web page or PDF link
        </label>
        <div className="imp-inline">
          <input
            id={id}
            className="input"
            type="url"
            inputMode="url"
            autoComplete="url"
            placeholder="https://"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            aria-invalid={!!error || undefined}
            aria-describedby={`${id}-e ${id}-h`}
          />
          <button type="submit" className="btn btn-primary">
            Convert page
          </button>
        </div>
        <p className="hint" id={`${id}-h`}>
          Articles and public PDFs work best. Pages behind a login can’t be read.
        </p>
        <p className="imp-field-error" id={`${id}-e`} aria-live="polite">
          {error}
        </p>
      </div>
    </form>
  );
}

/** The single import box: file, pasted text or a link. */
export default function ImportBox() {
  const { state, waking, run, cancel, reset } = useImport();
  const [localError, setLocalError] = useState(null);
  const errRef = useRef(null);
  const error = state.phase === 'error' ? state.error : localError;

  useEffect(() => {
    if (state.phase === 'error') errRef.current?.focus();
  }, [state.phase]);

  const start = (kind, payload) => {
    setLocalError(null);
    run(kind, payload);
  };

  return (
    <section className="imp" aria-labelledby="imp-title">
      <h2 id="imp-title" className="sr-only">
        Import study material
      </h2>
      {state.phase === 'running' || state.phase === 'done' ? (
        state.phase === 'running' ? (
          <Progress state={state} waking={waking} onCancel={cancel} />
        ) : (
          <p className="imp-opening" role="status">
            <LoaderCircle size={16} className="spin" aria-hidden="true" /> Opening your document…
          </p>
        )
      ) : (
        <>
          {error && (
            <div className="notice notice-error imp-error" role="alert" tabIndex={-1} ref={errRef}>
              <CircleAlert size={18} aria-hidden="true" />
              <div>
                <p>
                  <strong>{error.title}.</strong> {error.detail}
                </p>
              </div>
              <button
                type="button"
                className="btn btn-sm btn-quiet"
                onClick={() => {
                  setLocalError(null);
                  reset();
                }}
              >
                Dismiss
              </button>
            </div>
          )}
          <Tabs className="imp-tabs" defaultSelectedKey="file">
            <TabList aria-label="How to import" className="tabs-list">
              <Tab id="file" className="tab">
                <FileUp size={16} aria-hidden="true" /> File
              </Tab>
              <Tab id="text" className="tab">
                <Type size={16} aria-hidden="true" /> Paste text
              </Tab>
              <Tab id="link" className="tab">
                <Link2 size={16} aria-hidden="true" /> Link
              </Tab>
            </TabList>
            <TabPanel id="file" className="tab-panel imp-panel">
              <FilePanel onFile={(file) => start('file', { file, label: file.name })} onError={setLocalError} />
            </TabPanel>
            <TabPanel id="text" className="tab-panel imp-panel">
              <TextPanel onSubmit={({ text, title }) => start('text', { text, title, label: title.trim() || 'your text' })} />
            </TabPanel>
            <TabPanel id="link" className="tab-panel imp-panel">
              <LinkPanel
                onSubmit={({ url }) => {
                  let host = url;
                  try {
                    host = new URL(url).hostname;
                  } catch {
                    /* keep */
                  }
                  start('url', { url, label: host });
                }}
              />
            </TabPanel>
          </Tabs>
        </>
      )}
    </section>
  );
}
