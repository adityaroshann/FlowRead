import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Calculator, FileDown, Hash, Heading, Image as ImageIcon, ListTree, ScanLine } from 'lucide-react';
import AppShell from '../app/AppShell.jsx';
import ImportBox from '../access/import/ImportBox.jsx';
import Specimen from './Specimen.jsx';
import { getHealth } from '../access/shared/api.js';
import { listDocs } from '../access/shared/storage.js';
import { SAMPLE_DOC_ID, seedSampleDoc } from '../access/shared/sampleDoc.js';
import { loadProgress } from '../access/reader/readerPrefs.js';
import './home.css';

const KEPT = [
  { icon: Heading, term: 'Headings', text: 'A contents list you can jump around, and headings a screen reader can find.' },
  { icon: ListTree, term: 'Lists and tables', text: 'Real lists, and tables that keep their header rows.' },
  { icon: ImageIcon, term: 'Images', text: 'Each one with a description you can open. AI-written ones say so.' },
  { icon: Calculator, term: 'Maths', text: 'Expressions keep their layout and come with a spoken reading.' },
  { icon: Hash, term: 'Page and slide numbers', text: 'So “turn to page 12” in class still lands you in the right place.' },
  { icon: ScanLine, term: 'Scanned pages', text: 'Shown as pictures and clearly marked when they can’t be read as text.' },
];

function useRecent() {
  const [docs, setDocs] = useState([]);
  useEffect(() => {
    let alive = true;
    listDocs().then((all) => {
      if (!alive) return;
      const withProgress = all.map((d) => ({ doc: d, progress: loadProgress(d.id) }));
      withProgress.sort((a, b) =>
        String(b.progress?.updatedAt || b.doc.updatedAt || '').localeCompare(String(a.progress?.updatedAt || a.doc.updatedAt || '')),
      );
      setDocs(withProgress.slice(0, 3));
    });
    return () => {
      alive = false;
    };
  }, []);
  return docs;
}

export default function Home() {
  const navigate = useNavigate();
  const recent = useRecent();

  useEffect(() => {
    document.title = 'FlowRead: study material, rebuilt for the way you read';
    // Wake the conversion server early; the free tier sleeps when idle.
    getHealth();
  }, []);

  const openSample = async () => {
    await seedSampleDoc();
    navigate(`/read/${SAMPLE_DOC_ID}`);
  };

  return (
    <AppShell mainClass="home">
      <div className="home-hero">
        <div className="home-intro">
          <h1 className="display home-title">Study material, rebuilt for the way you read.</h1>
          <p className="home-lede">
            Bring a PDF, slides, a Word file, a web page or your own notes. FlowRead rebuilds it as a proper document, with its
            headings, lists, tables and images in place, then sets it in the spacing, font and colours that suit you.
          </p>
          <ImportBox />
          <p className="home-sample">
            No file to hand?{' '}
            <button type="button" className="linklike" onClick={openSample}>
              Open a sample biology handout
            </button>
          </p>
        </div>
        <div className="home-demo">
          <Specimen />
        </div>
      </div>

      <section className="home-kept" aria-labelledby="kept-title">
        <div className="home-kept-intro">
          <h2 id="kept-title" className="home-h2">
            The structure comes through
          </h2>
          <p>
            Most converters flatten a handout into one long run of text. FlowRead keeps the shape of the original, so you can
            still find your place, and your downloads keep it too.
          </p>
          <p className="home-formats">
            <FileDown size={18} aria-hidden="true" />
            <span>
              Download as a tagged PDF in your reading settings, as accessible HTML that works offline, or as a Word file.
            </span>
          </p>
        </div>
        <dl className="home-kept-list">
          {KEPT.map((item) => {
            const { icon: Icon, term, text } = item;
            return (
            <div key={term} className="home-kept-item">
              <dt>
                <Icon size={18} aria-hidden="true" />
                {term}
              </dt>
              <dd>{text}</dd>
            </div>
            );
          })}
        </dl>
      </section>

      {recent.length > 0 && (
        <section className="home-recent" aria-labelledby="recent-title">
          <div className="home-recent-head">
            <h2 id="recent-title" className="home-h2">
              Carry on reading
            </h2>
            <Link to="/library">All documents</Link>
          </div>
          <ul className="home-recent-list">
            {recent.map(({ doc, progress }) => {
              const pct = Math.round(progress?.pct || 0);
              return (
                <li key={doc.id}>
                  <Link to={`/read/${encodeURIComponent(doc.id)}`} className="home-recent-link">
                    <BookOpen size={18} aria-hidden="true" />
                    <span className="home-recent-title">{doc.title || 'Untitled document'}</span>
                    <span className="home-recent-pct">{pct > 0 ? `${pct}% read` : 'Not started'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
