/**
 * TypingIndicator — Animated dots while the AI is processing
 */

import { h } from 'preact';

interface TypingIndicatorProps {
  brandColor?: string;
}

export function TypingIndicator({ brandColor = '#6366f1' }: TypingIndicatorProps) {
  const dotStyle = {
    backgroundColor: brandColor,
  };

  return (
    <div class="avw-typing-indicator" aria-label="AI is thinking" role="status">
      <span class="avw-typing-dot" style={dotStyle} />
      <span class="avw-typing-dot" style={dotStyle} />
      <span class="avw-typing-dot" style={dotStyle} />
    </div>
  );
}