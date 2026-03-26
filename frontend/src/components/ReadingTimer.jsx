import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WORK_MINUTES = 25;
const BREAK_MINUTES = 5;

export default function ReadingTimer({ active, onStop }) {
  const [secondsLeft, setSecondsLeft] = useState(WORK_MINUTES * 60);
  const [isBreak, setIsBreak] = useState(false);
  const [showNotification, setShowNotification] = useState(false);
  const intervalRef = useRef(null);

  const resetTimer = useCallback((breakMode) => {
    setSecondsLeft((breakMode ? BREAK_MINUTES : WORK_MINUTES) * 60);
    setIsBreak(breakMode);
  }, []);

  useEffect(() => {
    if (!active) {
      clearInterval(intervalRef.current);
      resetTimer(false);
      return;
    }

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setShowNotification(true);
          // Auto-hide notification after 8s
          setTimeout(() => setShowNotification(false), 8000);
          // Toggle between work and break
          setIsBreak((wasBreak) => {
            const nextIsBreak = !wasBreak;
            return nextIsBreak;
          });
          return isBreak ? WORK_MINUTES * 60 : BREAK_MINUTES * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalRef.current);
  }, [active, isBreak, resetTimer]);

  if (!active) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const total = isBreak ? BREAK_MINUTES * 60 : WORK_MINUTES * 60;
  const progress = ((total - secondsLeft) / total) * 100;

  return (
    <>
      {/* Timer pill */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          position: 'fixed',
          top: 12,
          right: 16,
          background: 'var(--panel-bg)',
          border: '1px solid var(--border)',
          borderRadius: 20,
          padding: '0.35rem 0.85rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 95,
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
        }}
      >
        {/* Mini progress ring */}
        <svg width="16" height="16" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" fill="none" stroke="var(--border)" strokeWidth="2" />
          <circle
            cx="8" cy="8" r="6" fill="none"
            stroke={isBreak ? '#4CAF50' : 'var(--accent)'}
            strokeWidth="2"
            strokeDasharray={`${(progress / 100) * 37.7} 37.7`}
            transform="rotate(-90 8 8)"
            style={{ transition: 'stroke-dasharray 1s linear' }}
          />
        </svg>
        <span style={{ color: isBreak ? '#4CAF50' : 'var(--text)' }}>
          {isBreak ? 'Break' : 'Focus'} {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </span>
        <button
          onClick={onStop}
          style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '0.7rem', padding: 0, lineHeight: 1,
          }}
          aria-label="Stop timer"
        >
          ✕
        </button>
      </motion.div>

      {/* Notification toast */}
      <AnimatePresence>
        {showNotification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'fixed',
              top: 48,
              left: '50%',
              transform: 'translateX(-50%)',
              background: isBreak ? '#4CAF50' : 'var(--accent)',
              color: '#1A1A1A',
              borderRadius: 12,
              padding: '0.75rem 1.5rem',
              fontFamily: 'var(--font-body)',
              fontSize: '0.9rem',
              fontWeight: 600,
              zIndex: 300,
              boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
              textAlign: 'center',
            }}
          >
            {isBreak ? 'Time for a break! Stand up, stretch, look away from the screen.' : 'Break over — ready to read again?'}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
