import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000',
});

export default api;

export async function transformText(text, intensity = 0.45) {
  const { data } = await api.post('/api/transform', { text, intensity });
  return data; // { html, wordCount, readingTimeMinutes }
}

export async function extractFile(file) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post('/api/extract', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data; // { title, pages: [{ pageNum, paragraphs }] }
}

export async function scrapeUrl(url) {
  const { data } = await api.post('/api/scrape', { url });
  return data; // { title, sourceUrl, paragraphs }
}

export async function simplifyParagraph(paragraph) {
  const { data } = await api.post('/api/simplify', { paragraph });
  return data.simplified;
}

/** Returns the full EventSource URL for SSE streaming */
export function getSummarizeUrl() {
  return (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000') + '/api/summarize';
}
