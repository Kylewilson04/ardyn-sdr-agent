/**
 * ChatPanel — Expandable chat panel with message history,
 * audio visualization, and text input fallback.
 */

import { h } from 'preact';
import { useState, useRef, useEffect } from 'preact/hooks';
import type { AgentState, ChatMessage } from '../types';
import { AudioVisualizer } from './AudioVisualizer';
import { TypingIndicator } from './TypingIndicator';

interface ChatPanelProps {
  state: AgentState;
  messages: ChatMessage[];
  isTextOnly: boolean;
  volume: number;
  analyserNode: AnalyserNode | null;
  brandColor: string;
  brandName: string;
  avatarUrl?: string;
  onSendMessage: (text: string) => void;
  onInterrupt: () => void;
  onClose: () => void;
}

export function ChatPanel({
  state,
  messages,
  isTextOnly,
  volume,
  analyserNode,
  brandColor,
  brandName,
  avatarUrl,
  onSendMessage,
  onInterrupt,
  onClose,
}: ChatPanelProps) {
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on mount for text-only mode
  useEffect(() => {
    if (isTextOnly) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isTextOnly]);

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const text = inputValue.trim();
    if (!text) return;
    onSendMessage(text);
    setInputValue('');
  };

  return (
    <div class="avw-chat-panel">
      {/* Header */}
      <div class="avw-chat-header">
        <div class="avw-chat-header-left">
          {avatarUrl ? (
            <img src={avatarUrl} alt={brandName} class="avw-avatar" />
          ) : (
            <div class="avw-avatar avw-avatar-placeholder" style={{ backgroundColor: brandColor }}>
              {brandName.charAt(0)}
            </div>
          )}
          <div>
            <h3 class="avw-chat-title">{brandName}</h3>
            <StateBadge state={state} />
          </div>
        </div>

        <div class="avw-chat-header-right">
          {isTextOnly && (
            <span class="avw-text-only-badge" title="Voice unavailable — mic access denied">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="1" y1="1" x2="23" y2="23" />
                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
              </svg>
              Text mode
            </span>
          )}
          <button
            class="avw-close-btn"
            onClick={onClose}
            aria-label="Close chat"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Audio visualizer area */}
      {state === 'speaking' || state === 'listening' ? (
        <div class="avw-visualizer-area">
          <AudioVisualizer
            analyserNode={analyserNode}
            volume={volume}
            isActive={state === 'speaking' || state === 'listening'}
            color={brandColor}
            height={40}
          />
          {state === 'speaking' && (
            <button
              class="avw-interrupt-btn"
              onClick={onInterrupt}
              aria-label="Interrupt"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
              Tap to interrupt
            </button>
          )}
        </div>
      ) : null}

      {/* Messages */}
      <div class="avw-messages">
        {messages.length === 0 && state === 'idle' && (
          <div class="avw-empty-state">
            <div class="avw-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={brandColor} stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
            </div>
            <p class="avw-empty-text">
              {isTextOnly
                ? 'Type a message to start'
                : 'Tap the mic or type to start'}
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            class={`avw-message avw-message-${msg.role}`}
          >
            <div class="avw-message-bubble">
              <p>{msg.content}</p>
              <span class="avw-message-time">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          </div>
        ))}

        {state === 'processing' && (
          <div class="avw-message avw-message-agent">
            <div class="avw-message-bubble">
              <TypingIndicator brandColor={brandColor} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <form class="avw-input-area" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          class="avw-input"
          value={inputValue}
          onInput={(e) => setInputValue((e.target as HTMLInputElement).value)}
          placeholder={
            state === 'listening'
              ? 'Listening... or type here'
              : 'Type a message...'
          }
          disabled={state === 'connecting'}
          aria-label="Message input"
        />
        <button
          type="submit"
          class="avw-send-btn"
          disabled={!inputValue.trim() || state === 'connecting'}
          aria-label="Send message"
          style={{ color: inputValue.trim() ? brandColor : undefined }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </form>
    </div>
  );
}

function StateBadge({ state }: { state: AgentState }) {
  const config = STATE_BADGE_CONFIG[state] ?? STATE_BADGE_CONFIG.idle;
  return (
    <span class={`avw-state-badge avw-state-badge-${state}`}>
      <span class="avw-state-dot" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  );
}

const STATE_BADGE_CONFIG: Record<AgentState, { label: string; color: string }> = {
  idle: { label: 'Ready', color: '#6b7280' },
  connecting: { label: 'Connecting', color: '#f59e0b' },
  listening: { label: 'Listening', color: '#22c55e' },
  processing: { label: 'Thinking', color: '#8b5cf6' },
  speaking: { label: 'Speaking', color: '#6366f1' },
  error: { label: 'Error', color: '#ef4444' },
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}