// One place for the origins the extension talks to.
// `wxt` (dev) and `wxt build --mode e2e` use the local stack; production
// builds use the deployed services.
const MODE = import.meta.env.MODE;
const isDev = MODE === 'development' || MODE === 'e2e';

export const CONFIG = Object.freeze({
  apiBase: isDev ? 'http://localhost:8000' : 'https://flowread-backend.onrender.com',
  appOrigin: isDev ? 'http://localhost:5173' : 'https://flowread-mu.vercel.app',
  /** Every origin the bridge runs on (kept in sync with bridge.content.ts matches). */
  appOrigins: ['http://localhost:5173', 'https://flowread-mu.vercel.app'],
  /** Max characters sent to the plain-language endpoint in one request. */
  simplifyMaxChars: 4000,
  /** Matches the backend upload cap (413 above this). */
  pdfMaxBytes: 25 * 1024 * 1024,
});

export const isAppUrl = (url: string | undefined): boolean => {
  if (!url) return false;
  try {
    return CONFIG.appOrigins.includes(new URL(url).origin);
  } catch {
    return false;
  }
};
