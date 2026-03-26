import { useState, useRef, useCallback, useEffect } from 'react';

function splitIntoSentences(text) {
  const sentences = text.match(/[^.!?]+[.!?]+[\s]?|[^.!?]+$/g) || [];
  return sentences.map((s) => s.trim()).filter(Boolean);
}

export function useTTS() {
  const [speaking, setSpeaking] = useState(false);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState(-1);
  const sentencesRef = useRef([]);
  const indexRef = useRef(0);
  const cancelledRef = useRef(false);

  const speakSentence = useCallback((index) => {
    if (!window.speechSynthesis || cancelledRef.current) return;
    const sentences = sentencesRef.current;
    if (index >= sentences.length) {
      setSpeaking(false);
      setCurrentSentenceIndex(-1);
      return;
    }

    setCurrentSentenceIndex(index);
    indexRef.current = index;

    const utterance = new SpeechSynthesisUtterance(sentences[index]);
    utterance.rate = 0.9;

    utterance.onend = () => {
      if (!cancelledRef.current) {
        speakSentence(index + 1);
      }
    };

    utterance.onerror = () => {
      if (!cancelledRef.current) {
        speakSentence(index + 1);
      }
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const speak = useCallback((text) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    cancelledRef.current = false;
    sentencesRef.current = splitIntoSentences(text);
    setSpeaking(true);
    speakSentence(0);
  }, [speakSentence]);

  const stop = useCallback(() => {
    cancelledRef.current = true;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
    setCurrentSentenceIndex(-1);
  }, []);

  const toggle = useCallback((text) => {
    if (speaking) {
      stop();
    } else {
      speak(text);
    }
  }, [speaking, speak, stop]);

  useEffect(() => {
    return () => { window.speechSynthesis?.cancel(); };
  }, []);

  return {
    speaking,
    currentSentenceIndex,
    sentences: sentencesRef.current,
    speak,
    stop,
    toggle,
    supported: typeof window !== 'undefined' && !!window.speechSynthesis,
  };
}
