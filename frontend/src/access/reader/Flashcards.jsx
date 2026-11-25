import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Dialog, Heading, Modal, ModalOverlay } from 'react-aria-components';
import { Check, Download, GraduationCap, Layers, LoaderCircle, RotateCw, Shuffle, X } from 'lucide-react';
import { sectionLabel, sectionText, slugify } from '@flowread/core/docModel.js';
import { makeFlashcards } from '../shared/api.js';
import { saveBlob } from '../../utils/export.js';
import AiBadge from '../shared/AiBadge.jsx';
import AiText from '../shared/AiText.jsx';

// "Check what you remember": AI flashcards made from this document, then
// flip-card practice (cards you don't know yet come back) or a quick
// multiple-choice quiz built from the same cards (no extra AI call).

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Anki-friendly CSV: front,back (import as "Basic" notes). */
function flashcardsCsv(cards) {
  return ['front,back', ...cards.map((c) => `${csvCell(c.front)},${csvCell(c.back)}`)].join('\r\n');
}

function Practice({ cards, sectionName, onDone, settings }) {
  const [queue, setQueue] = useState(() => cards.map((_, i) => i));
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);
  const [again, setAgain] = useState(0);
  const cardRef = useRef(null);
  const i = queue[0];
  const card = cards[i];

  useEffect(() => {
    cardRef.current?.focus();
  }, [i, flipped]);

  const answer = useCallback(
    (gotIt) => {
      if (!flipped) return;
      setFlipped(false);
      if (gotIt) {
        setKnown((k) => k + 1);
        setQueue((q) => q.slice(1));
      } else {
        setAgain((a) => a + 1);
        // Bring it back a few cards later.
        setQueue((q) => {
          const rest = q.slice(1);
          const at = Math.min(rest.length, 3);
          return [...rest.slice(0, at), q[0], ...rest.slice(at)];
        });
      }
    },
    [flipped],
  );

  if (!card) {
    return (
      <div className="fc-done" role="status">
        <p className="fc-done-title">
          <Check size={20} aria-hidden="true" /> All {cards.length} cards done
        </p>
        <p>{again === 0 ? 'You knew every card first time.' : `${again} ${again === 1 ? 'card needed' : 'cards needed'} another look.`}</p>
        <div className="fc-row">
          <button type="button" className="btn btn-primary" onClick={() => onDone('again')}>
            <RotateCw size={16} aria-hidden="true" /> Practise again
          </button>
          <button type="button" className="btn" onClick={() => onDone('quiz')}>
            <GraduationCap size={16} aria-hidden="true" /> Take the quiz
          </button>
        </div>
      </div>
    );
  }

  const onKey = (e) => {
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target === cardRef.current) {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    } else if (e.key === '1') answer(false);
    else if (e.key === '2') answer(true);
  };

  return (
    <div className="fc-practice" onKeyDown={onKey}>
      <p className="fc-progress" aria-live="polite">
        {known} of {cards.length} known · {queue.length} to go
      </p>
      <div
        ref={cardRef}
        className={`fc-card${flipped ? ' is-flipped' : ''}`}
        role="button"
        tabIndex={0}
        aria-pressed={flipped}
        onClick={() => setFlipped((f) => !f)}
      >
        {/* The visible text is the accessible name (what voice-control users say). */}
        <span className="fc-side-label">
          {flipped ? 'Answer' : card.kind === 'cloze' ? 'Fill the gap' : card.kind === 'term' ? 'Term' : 'Question'}
        </span>
        <AiText className="fc-text" text={flipped ? card.back : card.front} settings={settings} portal />
        {sectionName(card) && (
          <span className="fc-src">
            From: {sectionName(card)}
          </span>
        )}
        {!flipped && (
          <span className="fc-hint">
            Click or press Space to flip
          </span>
        )}
      </div>
      <div className="fc-row fc-answer">
        <button type="button" className="btn" onClick={() => answer(false)} disabled={!flipped} aria-keyshortcuts="1">
          Not yet <kbd className="kbd">1</kbd>
        </button>
        <button type="button" className="btn btn-primary" onClick={() => answer(true)} disabled={!flipped} aria-keyshortcuts="2">
          Got it <kbd className="kbd">2</kbd>
        </button>
      </div>
    </div>
  );
}

function Quiz({ cards, onDone, settings }) {
  // Wrong options come from other cards' answers, so the quiz needs no AI call.
  const questions = useMemo(
    () =>
      shuffle(cards.map((c, i) => i)).map((i) => {
        const others = shuffle(cards.filter((_, j) => j !== i).map((c) => c.back)).slice(0, 3);
        return { card: cards[i], options: shuffle([cards[i].back, ...others]) };
      }),
    [cards],
  );
  const [at, setAt] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const q = questions[at];
  const headRef = useRef(null);
  useEffect(() => headRef.current?.focus(), [at]);

  if (!q) {
    return (
      <div className="fc-done" role="status">
        <p className="fc-done-title">
          {score} of {questions.length} right
        </p>
        <div className="fc-row">
          <button type="button" className="btn btn-primary" onClick={() => onDone('quiz')}>
            <RotateCw size={16} aria-hidden="true" /> Try again
          </button>
          <button type="button" className="btn" onClick={() => onDone('again')}>
            <Layers size={16} aria-hidden="true" /> Back to cards
          </button>
        </div>
      </div>
    );
  }

  const correct = (opt) => opt === q.card.back;
  return (
    <div className="fc-quiz">
      <p className="fc-progress">
        Question {at + 1} of {questions.length} · {score} right
      </p>
      <p className="fc-q" tabIndex={-1} ref={headRef}>
        <AiText text={q.card.front} settings={settings} portal />
      </p>
      <ul className="fc-options" role="list">
        {q.options.map((opt, k) => {
          const state = picked == null ? '' : correct(opt) ? ' is-right' : picked === k ? ' is-wrong' : '';
          return (
            <li key={k}>
              <button
                type="button"
                className={`fc-option${state}`}
                disabled={picked != null}
                onClick={() => {
                  setPicked(k);
                  if (correct(opt)) setScore((s) => s + 1);
                }}
              >
                <AiText text={opt} settings={settings} portal />
                {picked != null && correct(opt) && <span className="sr-only"> (correct answer)</span>}
                {picked === k && !correct(opt) && <span className="sr-only"> (your answer, not correct)</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="fc-row" aria-live="polite">
        {picked != null && (
          <>
            <p className="fc-verdict">{correct(q.options[picked]) ? 'Right.' : 'Not quite: the right answer is highlighted.'}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPicked(null);
                setAt((a) => a + 1);
              }}
            >
              {at + 1 < questions.length ? 'Next question' : 'See score'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function Flashcards({ isOpen, onOpenChange, doc, onSaveCards, settings }) {
  const cards = doc.flashcards?.cards || [];
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState('');
  const [mode, setMode] = useState('cards');
  const [round, setRound] = useState(0);
  const abortRef = useRef(null);

  const sectionsById = useMemo(() => {
    const m = new Map();
    (doc.sections || []).forEach((s, i) => m.set(s.id, sectionLabel(s, i)));
    return m;
  }, [doc.sections]);

  const generate = async () => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setStatus('loading');
    setError('');
    try {
      const made = await makeFlashcards(doc, sectionText, { signal: ctrl.signal });
      if (!made.length) throw new Error('No flashcards came back.');
      onSaveCards({ cards: made, createdAt: new Date().toISOString() });
      setMode('cards');
      setRound((r) => r + 1);
      setStatus('idle');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(e?.status === 503 ? 'Flashcards need the AI service, which isn’t set up on this server.' : e?.message || 'Flashcards couldn’t be made right now.');
      setStatus('error');
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  // Shuffle once per round (not on every render, or the deck would change under the reader).
  const practiceCards = useMemo(() => shuffle(cards), [cards, round]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = (next) => {
    setMode(next === 'quiz' ? 'quiz' : 'cards');
    setRound((r) => r + 1);
  };

  return (
    <ModalOverlay className="modal-overlay" isOpen={isOpen} onOpenChange={onOpenChange} isDismissable>
      <Modal className="modal modal-wide">
        <Dialog className="dialog fc">
          {({ close }) => (
            <>
              <div className="dialog-head">
                <div>
                  <Heading slot="title" className="dialog-title">
                    Check what you remember
                  </Heading>
                  <p className="dialog-desc">
                    Flashcards made from this document <AiBadge what="These flashcards" />
                  </p>
                </div>
                <Button className="btn btn-icon btn-quiet" onPress={close} aria-label="Close">
                  <X size={18} aria-hidden="true" />
                </Button>
              </div>

              {!cards.length ? (
                <div className="fc-empty">
                  <p>Make a short set of flashcards from the key points in “{doc.title || 'this document'}”. You can practise them one by one or take a quick quiz.</p>
                  <button type="button" className="btn btn-primary" onClick={generate} disabled={status === 'loading'}>
                    {status === 'loading' ? (
                      <>
                        <LoaderCircle size={16} className="spin" aria-hidden="true" /> Making flashcards…
                      </>
                    ) : (
                      <>
                        <Layers size={16} aria-hidden="true" /> Make flashcards
                      </>
                    )}
                  </button>
                  {status === 'error' && (
                    <p className="fc-error" role="alert">
                      {error}
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <div className="fc-tabs" role="group" aria-label="Practice mode">
                    <button type="button" className={`btn btn-sm${mode === 'cards' ? ' is-on' : ''}`} aria-pressed={mode === 'cards'} onClick={() => done('again')}>
                      <Layers size={15} aria-hidden="true" /> Cards
                    </button>
                    <button
                      type="button"
                      className={`btn btn-sm${mode === 'quiz' ? ' is-on' : ''}`}
                      aria-pressed={mode === 'quiz'}
                      onClick={() => done('quiz')}
                      disabled={cards.length < 4}
                      title={cards.length < 4 ? 'The quiz needs at least 4 cards' : undefined}
                    >
                      <GraduationCap size={15} aria-hidden="true" /> Quiz
                    </button>
                    <span className="fc-spacer" />
                    <button type="button" className="btn btn-sm btn-quiet" onClick={() => setRound((r) => r + 1)} title="Shuffle and start over">
                      <Shuffle size={15} aria-hidden="true" /> Restart
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-quiet"
                      onClick={() => saveBlob(new Blob([flashcardsCsv(cards)], { type: 'text/csv' }), `${slugify(doc.title)}-flashcards.csv`)}
                      title="CSV file that imports into Anki or Quizlet"
                    >
                      <Download size={15} aria-hidden="true" /> CSV
                    </button>
                    <button type="button" className="btn btn-sm btn-quiet" onClick={generate} disabled={status === 'loading'}>
                      {status === 'loading' ? <LoaderCircle size={15} className="spin" aria-hidden="true" /> : <RotateCw size={15} aria-hidden="true" />} New set
                    </button>
                  </div>
                  {status === 'error' && (
                    <p className="fc-error" role="alert">
                      {error}
                    </p>
                  )}
                  {mode === 'quiz' ? (
                    <Quiz key={`q${round}`} cards={cards} onDone={done} settings={settings} />
                  ) : (
                    <Practice key={`c${round}`} cards={practiceCards} sectionName={(c) => sectionsById.get(c.sectionId)} onDone={done} settings={settings} />
                  )}
                </>
              )}
            </>
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  );
}
