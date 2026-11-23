import { useCallback, useEffect, useRef, useState } from 'react';

// Read-aloud with current-word highlighting via SpeechSynthesisUtterance
// `onboundary`. Speaks a queue of { id, text } items one utterance each
// (short utterances also avoid Chrome cutting long ones off).

const IDLE = { status: 'idle', blockId: null, start: -1, length: 0 };

export function speechSupported() {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance === 'function'
  );
}

export function useWordSpeech({ rate = 1 } = {}) {
  const [state, setState] = useState(IDLE);
  const run = useRef({ queue: [], token: 0, rate });

  useEffect(() => {
    run.current.rate = rate;
  }, [rate]);

  const speakIndex = useCallback(function speakIndex(index, token) {
    const r = run.current;
    if (token !== r.token) return;
    const item = r.queue[index];
    if (!item) {
      setState(IDLE);
      return;
    }
    const text = item.text || '';
    setState({ status: 'speaking', blockId: item.id, start: -1, length: 0 });
    const u = new window.SpeechSynthesisUtterance(text);
    u.rate = r.rate;
    if (item.lang) u.lang = item.lang;
    u.onboundary = (e) => {
      if (token !== run.current.token) return;
      if (e.name && e.name !== 'word') return;
      const start = e.charIndex ?? -1;
      let length = e.charLength;
      if (!length && start >= 0) {
        const m = /^\S+/.exec(text.slice(start));
        length = m ? m[0].length : 0;
      }
      setState((s) => ({ ...s, blockId: item.id, start, length: length || 0 }));
    };
    const next = () => {
      if (token !== run.current.token) return;
      speakIndex(index + 1, token);
    };
    u.onend = next;
    u.onerror = (e) => {
      if (e?.error === 'interrupted' || e?.error === 'canceled') return;
      next();
    };
    window.speechSynthesis.speak(u);
  }, []);

  const speak = useCallback(
    (queue) => {
      if (!speechSupported()) return;
      const items = (queue || []).filter((q) => q && q.text && q.text.trim());
      const r = run.current;
      r.token += 1;
      r.queue = items;
      window.speechSynthesis.cancel();
      if (!items.length) {
        setState(IDLE);
        return;
      }
      speakIndex(0, r.token);
    },
    [speakIndex],
  );

  const stop = useCallback(() => {
    run.current.token += 1;
    if (speechSupported()) window.speechSynthesis.cancel();
    setState(IDLE);
  }, []);

  const pause = useCallback(() => {
    if (!speechSupported()) return;
    window.speechSynthesis.pause();
    setState((s) => (s.status === 'speaking' ? { ...s, status: 'paused' } : s));
  }, []);

  const resume = useCallback(() => {
    if (!speechSupported()) return;
    window.speechSynthesis.resume();
    setState((s) => (s.status === 'paused' ? { ...s, status: 'speaking' } : s));
  }, []);

  useEffect(
    () => () => {
      run.current.token += 1;
      if (speechSupported()) window.speechSynthesis.cancel();
    },
    [],
  );

  return {
    supported: speechSupported(),
    status: state.status,
    highlight: state.status === 'idle' ? null : { blockId: state.blockId, start: state.start, length: state.length },
    speak,
    stop,
    pause,
    resume,
  };
}
