// Minimal reader for `text/event-stream` responses to POST requests (fetch +
// ReadableStream; EventSource cannot POST). Yields the JSON in each `data:`.
export async function* readSse(res: Response): AsyncGenerator<unknown> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    buf += decoder.decode(value ?? new Uint8Array(), { stream: !done }) + (done ? '\n\n' : '');
    let cut: number;
    while ((cut = buf.search(/\r?\n\r?\n/)) >= 0) {
      const block = buf.slice(0, cut);
      buf = buf.slice(cut).replace(/^\r?\n\r?\n/, '');
      const data = block
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).replace(/^ /, ''))
        .join('\n');
      if (!data) continue;
      try {
        yield JSON.parse(data);
      } catch {
        /* ignore keep-alives and malformed events */
      }
    }
    if (done) break;
  }
}
