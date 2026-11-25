import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Sparkles } from 'lucide-react';
import AppShell from '../app/AppShell.jsx';
import ImportBox from '../access/import/ImportBox.jsx';
import Specimen from './Specimen.jsx';
import { getHealth } from '../access/shared/api.js';
import { listDocs } from '../access/shared/storage.js';
import { SAMPLE_DOC_ID, seedSampleDoc } from '../access/shared/sampleDoc.js';
import { loadProgress } from '../access/reader/readerPrefs.js';
import './home.css';

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
    document.title = 'FlowRead: read faster, focus better';
    // Wake the conversion server early; the free tier sleeps when idle.
    getHealth();
  }, []);

  const openSample = async () => {
    await seedSampleDoc();
    navigate(`/read/${SAMPLE_DOC_ID}`);
  };

  return (
    <AppShell mainClass="home">
      <section className="home-hero" aria-labelledby="home-title">
        <h1 id="home-title" className="display home-title">
          Read faster. <span className="home-accent">Focus better.</span>
        </h1>
        <p className="home-lede">Turn any document into a calm, accessible reading experience. Built with ADHD and dyslexic readers in mind.</p>
        <p className="home-kicker" aria-hidden="true">
          Try it live
        </p>
        <Specimen />
      </section>

      <section className="home-start" aria-labelledby="start-title">
        <h2 id="start-title" className="display home-h2">
          Start reading
        </h2>
        <ImportBox />
        <p className="home-note">
          <Sparkles size={14} aria-hidden="true" /> AI describes images, reads scanned pages and makes flashcards. Anything it writes is
          labelled.{' '}
          <button type="button" className="linklike" onClick={openSample}>
            Try a sample handout
          </button>
        </p>
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
