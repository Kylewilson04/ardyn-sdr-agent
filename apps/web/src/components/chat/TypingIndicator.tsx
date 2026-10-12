'use client';

import { cn } from '@/lib/utils';
import { memo } from 'react';

function TypingIndicatorComponent() {
  return (
    <div className="flex items-start gap-3 px-4 py-3 animate-fade-in">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center">
        <svg
          className="w-4 h-4 text-brand-400"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
          <path d="M12 2a10 10 0 0 1 10 10h-5.5" />
        </svg>
      </div>
      <div className="flex items-center gap-1 h-9 px-4 rounded-2xl bg-surface-800/50 border border-surface-700/50">
        <span className="text-xs text-surface-300">Thinking</span>
        <span className="flex items-center gap-1 ml-1">
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-dot',
              '[animation-delay:0ms]'
            )}
          />
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-dot',
              '[animation-delay:200ms]'
            )}
          />
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full bg-brand-400 animate-pulse-dot',
              '[animation-delay:400ms]'
            )}
          />
        </span>
      </div>
    </div>
  );
}

export const TypingIndicator = memo(TypingIndicatorComponent);