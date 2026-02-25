import { useState, useCallback, useRef } from 'react';
import { transformText } from '../utils/api';

export function useBionicTransform() {
  const [result, setResult] = useState(null); // { html, wordCount, readingTimeMinutes }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const debounceTimer = useRef(null);

  const transform = useCallback(async (text, intensity = 0.45) => {
    if (!text?.trim()) {
      setResult(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await transformText(text, intensity);
      setResult(data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Transform failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const transformDebounced = useCallback((text, intensity = 0.45, delay = 400) => {
    clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => transform(text, intensity), delay);
  }, [transform]);

  return { result, loading, error, transform, transformDebounced };
}
