/**
 * VoiceButton — Floating circular button with pulse animation
 *
 * States:
 *   - idle: solid, static
 *   - connecting: spinning ring
 *   - listening: pulse glow
 *   - speaking: waveform-style pulse
 *   - processing: rotating dots
 *   - error: red pulse
 */

import { h } from 'preact';
import type { AgentState } from '../types';

interface VoiceButtonProps {
  state: AgentState;
  isOpen: boolean;
  volume: number;
  onToggle: () => void;
  brandColor: string;
  buttonSize: number;
}

export function VoiceButton({
  state,
  isOpen,
  volume,
  onToggle,
  brandColor,
  buttonSize,
}: VoiceButtonProps) {
  const stateClass = `avw-state-${state}`;
  const openClass = isOpen ? 'avw-open' : '';

  // Pulse ring size scales with volume when listening
  const pulseScale = state === 'listening' ? 1 + volume * 0.3 : 1;

  const style = {
    '--avw-brand': brandColor,
    '--avw-button-size': `${buttonSize}px`,
    '--avw-pulse-scale': String(pulseScale),
  } as h.JSX.CSSProperties;

  const label = getStateLabel(state);

  return (
    <button
      class={`avw-voice-button ${stateClass} ${openClass}`}
      style={style}
      onClick={onToggle}
      aria-label={label}
      title={label}
    >
      {/* Pulse ring */}
      <span class="avw-pulse-ring" />

      {/* Icon */}
      <span class="avw-button-icon">
        <VoiceIcon state={state} isOpen={isOpen} />
      </span>

      {/* Tooltip */}
      <span class="avw-button-tooltip">{label}</span>
    </button>
  );
}

function VoiceIcon({ state, isOpen }: { state: AgentState; isOpen: boolean }) {
  if (isOpen) {
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }

  switch (state) {
    case 'connecting':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="avw-spin">
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      );
    case 'listening':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      );
    case 'speaking':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M11 5L6 9H2v6h4l5 4V5z" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" class="avw-speaker-ring-1" />
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07" class="avw-speaker-ring-2" />
        </svg>
      );
    case 'processing':
      return (
        <span class="avw-dots">
          <span class="avw-dot" />
          <span class="avw-dot" />
          <span class="avw-dot" />
        </span>
      );
    case 'error':
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      );
    case 'idle':
    default:
      return (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
      );
  }
}

function getStateLabel(state: AgentState): string {
  switch (state) {
    case 'idle': return 'Voice chat — tap to start';
    case 'connecting': return 'Connecting...';
    case 'listening': return 'Listening...';
    case 'speaking': return 'Speaking...';
    case 'processing': return 'Thinking...';
    case 'error': return 'Error — tap to retry';
    default: return 'Voice chat';
  }
}