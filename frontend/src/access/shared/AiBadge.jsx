import { Sparkles } from 'lucide-react';

/**
 * A small, consistent marker for anything the AI wrote (image descriptions,
 * summaries, plain-language rewrites, flashcards, suggested headings), so
 * readers can see what came from the document and what came from AI.
 */
export default function AiBadge({ what = 'This', className = '' }) {
  const tip = `${what} was written by AI. Check it against the original.`;
  return (
    <span className={`ai-badge ${className}`} title={tip}>
      <Sparkles size={12} aria-hidden="true" />
      <span aria-hidden="true">AI</span>
      <span className="fra-sr-only">{tip}</span>
    </span>
  );
}
