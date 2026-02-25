import { useState, useRef, useCallback } from 'react';
import { getSummarizeUrl } from '../utils/api';

export function useSummarize() {
  const [summary, setSummary] = useState(null); // { tldr, bullets, readingTimeMinutes }
  const [rawStream, setRawStream] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const summarize = useCallback(async (text) => {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    setRawStream('');
    setSummary(null);

    try {
      const url = getSummarizeUrl();
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        // Parse SSE lines
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            const payload = line.slice(6).trim();
            if (payload === '[DONE]') break;
            try {
              const parsed = JSON.parse(payload);
              const text_chunk = parsed.chunk?.replace(/\\n/g, '\n') || '';
              accumulated += text_chunk;
              setRawStream(accumulated);
            } catch {
              // ignore malformed lines
            }
          }
        }
      }

      // Try to parse the final JSON summary
      try {
        const jsonMatch = accumulated.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          setSummary(JSON.parse(jsonMatch[0]));
        }
      } catch {
        setError('Could not parse summary response.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Summarization failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setLoading(false);
  }, []);

  return { summary, rawStream, loading, error, summarize, cancel };
}
