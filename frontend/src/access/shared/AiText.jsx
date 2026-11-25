import { settingsToStyle } from '@flowread/core/profiles.js';
import { RichText } from './DocRenderer.jsx';

/**
 * Text written by AI (summaries, explanations, definitions, flashcards).
 * With the "AI answers in my reading style" setting on (the default), it uses
 * the reader's font, spacing and bold word starts; off, it uses the interface
 * font. `portal` is for content rendered outside the reader (popovers,
 * dialogs), which doesn't inherit the reader's style variables.
 */
export default function AiText({ text, settings, as = 'span', className = '', portal = false }) {
  const Tag = as;
  const on = settings && settings.aiReadingStyle !== false;
  const bold = on && settings.boldStarts ? Number(settings.boldIntensity) || true : false;
  return (
    <Tag className={`${on ? 'ai-text ai-reading' : ''} ${className}`.trim()} style={on && portal ? settingsToStyle(settings) : undefined}>
      <RichText text={text} boldStarts={bold} />
    </Tag>
  );
}
