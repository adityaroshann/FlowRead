import { useState, useRef, useCallback } from 'react';

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef(null);

  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, []);

  const toggle = useCallback((text) => {
    if (speaking) {
      stop();
    } else {
      speak(text);
    }
  }, [speaking, speak, stop]);

  return { speaking, speak, stop, toggle, supported: !!window.speechSynthesis };
}
