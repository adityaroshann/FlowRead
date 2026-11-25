/** Only http(s) and mailto links survive. Anything else renders as plain text. */
export function safeHref(href) {
  if (typeof href !== 'string') return null;
  const h = href.trim();
  if (/^(https?:\/\/|mailto:)/i.test(h)) {
    try {
      const u = new URL(h);
      if (u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:') return u.href;
    } catch {
      return null;
    }
  }
  return null;
}
