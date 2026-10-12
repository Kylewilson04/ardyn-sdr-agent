'use client';

import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/lib/types';
import { Bot, User, Copy, Check, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-4 animate-slide-up group',
        isUser && 'flex-row-reverse'
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser
            ? 'bg-surface-700 text-surface-300'
            : 'bg-brand-500/20 text-brand-400'
        )}
      >
        {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
      </div>

      {/* Bubble */}
      <div
        className={cn(
          'relative max-w-[75%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-brand-600 text-white rounded-tr-md'
            : 'bg-surface-800/70 border border-surface-700/50 text-surface-100 rounded-tl-md'
        )}
      >
        {isUser ? (
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="prose prose-sm prose-invert max-w-none">
            <ReactMarkdown
              components={{
                a: ({ href, children }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-400 hover:text-brand-300 underline"
                  >
                    {children}
                  </a>
                ),
                code: ({
                  inline,
                  className,
                  children,
                  ...props
                }: {
                  inline?: boolean;
                  className?: string;
                  children?: React.ReactNode;
                }) => {
                  if (inline) {
                    return (
                      <code className="bg-surface-700/50 rounded px-1.5 py-0.5 text-xs text-brand-300">
                        {children}
                      </code>
                    );
                  }
                  return (
                    <pre className="bg-surface-950 rounded-lg p-3 overflow-x-auto text-xs">
                      <code className={className} {...props}>
                        {children}
                      </code>
                    </pre>
                  );
                },
                ul: ({ children }) => (
                  <ul className="list-disc list-inside space-y-1">{children}</ul>
                ),
                ol: ({ children }) => (
                  <ol className="list-decimal list-inside space-y-1">{children}</ol>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="border-l-2 border-brand-500 pl-3 italic text-surface-400">
                    {children}
                  </blockquote>
                ),
                table: ({ children }) => (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-xs">
                      {children}
                    </table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-surface-700 px-2 py-1 bg-surface-800 font-medium text-surface-300">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="border border-surface-700 px-2 py-1">{children}</td>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {/* Action buttons */}
        <div
          className={cn(
            'absolute -bottom-6 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity',
            isUser ? 'right-0' : 'left-0'
          )}
        >
          <button
            onClick={handleCopy}
            className="p-1 rounded hover:bg-surface-700/50 text-surface-500 hover:text-surface-300 transition-colors"
            title="Copy"
          >
            {copied ? (
              <Check className="w-3 h-3 text-accent-green" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
        </div>

        {/* Timestamp */}
        <span
          className={cn(
            'text-[10px] text-surface-500 mt-1 block',
            isUser ? 'text-right' : 'text-left'
          )}
        >
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>

      {/* Metadata actions */}
      {message.metadata?.action && (
        <div
          className={cn(
            'mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium',
            message.metadata.status === 'success' &&
              'bg-accent-green/10 text-accent-green',
            message.metadata.status === 'error' &&
              'bg-accent-red/10 text-accent-red',
            message.metadata.status === 'pending' &&
              'bg-accent-amber/10 text-accent-amber'
          )}
        >
          {message.metadata.action.replace(/_/g, ' ')}
        </div>
      )}
    </div>
  );
}