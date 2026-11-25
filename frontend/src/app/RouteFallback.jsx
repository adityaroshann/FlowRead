/** Shown while a route's code loads. Quiet on purpose; usually under 100 ms. */
export default function RouteFallback() {
  return (
    <div className="route-fallback" role="status" aria-live="polite">
      <span className="sr-only">Loading…</span>
    </div>
  );
}
