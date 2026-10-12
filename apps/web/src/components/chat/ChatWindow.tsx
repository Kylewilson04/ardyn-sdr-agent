'use client';

import { useEffect, useRef } from 'react';
import { MessageBubble } from './MessageBubble';
import { TypingIndicator } from './TypingIndicator';
import { useChatStore } from '@/lib/store';
import { Sparkles, MessageSquare } from 'lucide-react';

export function ChatWindow() {
  const messages = useChatStore((s) => s.messages);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-8 h-8 text-brand-400" />
          </div>
          <h2 className="text-xl font-semibold text-surface-100 mb-2">
            Ardyn SDR Agent
          </h2>
          <p className="text-sm text-surface-400 leading-relaxed">
            I can research prospects, draft personalized outreach, manage
            campaigns, and analyze your pipeline. Just tell me what you need.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3 text-left">
            {[
              { icon: '🔍', text: 'Research companies and find decision-makers' },
              { icon: '✍️', text: 'Draft and send personalized cold emails' },
              { icon: '📊', text: 'Track reply rates and pipeline progress' },
              { icon: '🔄', text: 'Run multi-step outreach sequences' },
            ].map((item, i) => (
              <div
                key={i}
                className="flex items-start gap-2 p-3 rounded-xl bg-surface-800/40 border border-surface-700/30"
              >
                <span className="text-sm">{item.icon}</span>
                <span className="text-xs text-surface-400">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-surface-700 scrollbar-track-transparent">
      <div className="max-w-3xl mx-auto py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isStreaming && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}