// speechSynthesis wrapper with a single active utterance.
let current: SpeechSynthesisUtterance | null = null;

export const canSpeak = () => typeof window.speechSynthesis !== 'undefined';

export function speak(text: string, onEnd: () => void) {
  stopSpeaking();
  if (!canSpeak()) return onEnd();
  const u = new SpeechSynthesisUtterance(text.slice(0, 32_000));
  u.lang = document.documentElement.lang || navigator.language;
  u.rate = 0.95;
  u.onend = u.onerror = () => {
    if (current !== null && current !== u) return; // replaced by a newer one
    current = null;
    onEnd();
  };
  current = u;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (!canSpeak()) return;
  current = null;
  window.speechSynthesis.cancel();
}
