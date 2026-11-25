import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Timer } from 'lucide-react';

// Pomodoro-style reading timer, as in the original FlowRead: 25 minutes of
// reading, then a 5-minute break. A quiet chip in the reading bar.
const READ_MIN = 25;
const BREAK_MIN = 5;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function ReadingTimer({ onAnnounce }) {
  const [t, setT] = useState({ phase: 'read', left: READ_MIN * 60 });
  const [running, setRunning] = useState(false);
  const { phase, left } = t;
  const announce = useRef(onAnnounce);
  useEffect(() => {
    announce.current = onAnnounce;
  }, [onAnnounce]);

  // One tick a second; at zero, switch between reading and a break.
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(
      () =>
        setT((cur) => {
          if (cur.left > 1) return { ...cur, left: cur.left - 1 };
          const next = cur.phase === 'read' ? 'break' : 'read';
          return { phase: next, left: (next === 'read' ? READ_MIN : BREAK_MIN) * 60 };
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [running]);

  // Announce the switch (no state change here).
  const firstPhase = useRef(true);
  useEffect(() => {
    if (firstPhase.current) {
      firstPhase.current = false;
      return;
    }
    announce.current?.(phase === 'break' ? `Time for a ${BREAK_MIN}-minute break.` : 'Break over. Back to reading.');
  }, [phase]);

  const reset = () => {
    setRunning(false);
    setT({ phase: 'read', left: READ_MIN * 60 });
  };

  const label = phase === 'read' ? 'Reading' : 'Break';
  return (
    <div className={`rtimer${phase === 'break' ? ' is-break' : ''}`} role="group" aria-label="Reading timer">
      <Timer size={15} aria-hidden="true" />
      <span className="rtimer-time" aria-live="off">
        <span className="sr-only">{label}, </span>
        {fmt(left)}
      </span>
      <button
        type="button"
        className="btn btn-icon btn-quiet btn-xs"
        onClick={() => setRunning((r) => !r)}
        aria-label={running ? 'Pause timer' : `Start ${READ_MIN}-minute reading timer`}
        title={running ? 'Pause timer' : `Start ${READ_MIN} min`}
      >
        {running ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
      </button>
      {(running || left !== READ_MIN * 60 || phase !== 'read') && (
        <button type="button" className="btn btn-icon btn-quiet btn-xs" onClick={reset} aria-label="Reset timer" title="Reset">
          <RotateCcw size={13} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
