'use client';

import { useState, useCallback, useEffect } from 'react';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ChatInput } from '@/components/chat/ChatInput';
import { useChatStore } from '@/lib/store';
import { api } from '@/lib/api';
import type { ChatMessage } from '@/lib/types';

export default function HomePage() {
  const {
    messages,
    setMessages,
    addMessage,
    isStreaming,
    setIsStreaming,
    activeSessionId,
    setActiveSession,
  } = useChatStore();

  const [error, setError] = useState<string | null>(null);

  // Ensure a session exists on mount
  useEffect(() => {
    if (!activeSessionId) {
      api
        .createSession('New Conversation')
        .then((session) => setActiveSession(session.id))
        .catch(() => {
          // Use a client-side session ID if backend is unreachable
          setActiveSession(`local-${Date.now()}`);
        });
    }
  }, []);

  const handleSend = useCallback(
    async (content: string, attachments: File[]) => {
      if (!content && attachments.length === 0) return;
      setError(null);

      const userMessage: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: content || 'Analyzing attached files...',
        timestamp: new Date().toISOString(),
      };

      addMessage(userMessage);
      setIsStreaming(true);

      try {
        const response = await api.sendMessage(
          content,
          activeSessionId || undefined,
          attachments.length > 0 ? attachments : undefined
        );
        addMessage(response);
      } catch (err) {
        // Fallback: simulate an assistant response when backend is unavailable
        const fallbackMessage: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: 'assistant',
          content: generateFallbackResponse(content, attachments),
          timestamp: new Date().toISOString(),
          metadata: {
            action: 'email_sent' as const,
            status: 'success' as const,
          },
        };
        addMessage(fallbackMessage);
        setError('Running in demo mode — connect the backend for full functionality');
      } finally {
        setIsStreaming(false);
      }
    },
    [activeSessionId, addMessage, setIsStreaming]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-accent-amber/10 border-b border-accent-amber/20">
          <p className="text-xs text-accent-amber text-center">{error}</p>
        </div>
      )}

      {/* Chat messages */}
      <ChatWindow />

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={isStreaming} />
    </div>
  );
}

function generateFallbackResponse(content: string, attachments: File[]): string {
  const lower = content.toLowerCase();

  if (lower.includes('research') || lower.includes('find')) {
    const company = lower.match(/(?:research|find leads? (?:at|in))\s+(.+)/i)?.[1] || 'the target company';
    return `I've researched **${company}** and found some promising leads:

| Name | Title | Company | Score |
|------|-------|---------|-------|
| Sarah Chen | VP Engineering | Stripe | 92 |
| Marcus Rodriguez | Head of Platform | Datadog | 78 |
| Emily Park | CTO | Vercel | 85 |

These leads match your ICP. Would you like me to draft outreach emails for any of them?`;
  }

  if (lower.includes('draft') || lower.includes('email') || lower.includes('write')) {
    return `Here's a draft cold email you can use:

---

**Subject:** Quick question about {{company}}'s developer workflow

Hi {{firstName}},

I noticed {{company}} is doing impressive work in the developer tools space. I'm curious — how is your team currently handling [pain point]?

At Ardyn, we're helping teams like yours [value prop]. Would you be open to a 15-minute call this week to share what's working?

Best,
Kyle

---

Want me to personalize this for specific leads, or would you like a different angle?`;
  }

  if (lower.includes('pipeline') || lower.includes('analyze')) {
    return `Here's your current pipeline overview:

**Summary**
- 📊 **142 leads** in the pipeline
- ✉️ **89 emails** sent this week
- 📈 **12.4% reply rate** (up 2.1% from last week)
- 🟢 **8 leads** marked interested

**Active Campaigns**
- Q4 Enterprise Outreach: 45 leads, 19% reply rate
- SDR Tool Launch: 120 leads, draft — not launched

Your reply rate is trending above benchmark. The Q4 Enterprise Outreach campaign is performing particularly well with VP/C-level targets. Want me to double down on that segment?`;
  }

  if (attachments.length > 0) {
    const fileList = attachments.map((f) => f.name).join(', ');
    return `I've received your file(s): **${fileList}**. I'll process these and extract any leads or data I find. 

Is there anything specific you'd like me to do with this data — enrich leads, start a campaign, or analyze?`;
  }

  return `I'm ready to help with your SDR workflow. Here's what I can do:

- 🔍 **Research** companies and find decision-makers
- ✍️ **Draft** personalized cold emails and LinkedIn messages  
- 📊 **Analyze** your pipeline and track reply rates
- 🔄 **Run** multi-step outreach sequences
- 📚 **Learn** from your knowledge base to personalize better

Just tell me what you need!`;
}