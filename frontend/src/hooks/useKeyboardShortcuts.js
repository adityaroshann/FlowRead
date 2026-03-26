import { useEffect } from 'react';

export function useKeyboardShortcuts(handlers) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts when typing in inputs
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'Escape' && handlers.onEscape) {
        e.preventDefault();
        handlers.onEscape();
      } else if (e.key === 'f' && !e.ctrlKey && !e.metaKey && handlers.onFocusMode) {
        e.preventDefault();
        handlers.onFocusMode();
      } else if (e.key === 'd' && !e.ctrlKey && !e.metaKey && handlers.onDistractionFree) {
        e.preventDefault();
        handlers.onDistractionFree();
      } else if (e.key === 's' && !e.ctrlKey && !e.metaKey && handlers.onSettings) {
        e.preventDefault();
        handlers.onSettings();
      } else if (e.key === ' ' && e.shiftKey && handlers.onTTS) {
        e.preventDefault();
        handlers.onTTS();
      } else if (e.key === '?' && handlers.onHelp) {
        e.preventDefault();
        handlers.onHelp();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}
