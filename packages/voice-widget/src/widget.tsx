/**
 * Ardyn SDR Voice Widget — Main Entry
 *
 * Renders the floating voice button and expandable chat panel.
 * Export mount/unmount functions for integrators.
 *
 * Usage:
 *   import { mount } from '@ardyn/voice-widget';
 *   mount(document.getElementById('widget'), {
 *     livekitToken: '...',
 *     brandName: 'Ardyn',
 *   });
 */

import { h, render } from 'preact';
import { useState, useCallback, useEffect, useMemo } from 'preact/hooks';
import type { AgentState, ChatMessage, WidgetMountOptions, WidgetAPI } from './types';
import { WidgetConfigSchema } from './types';
import { buildPipelineConfig } from './pipeline/config';
import { useVoiceAgent } from './hooks/useVoiceAgent';
import { VoiceButton } from './components/VoiceButton';
import { ChatPanel } from './components/ChatPanel';
import './styles/widget.css';

// ─── Widget Component ───────────────────────────────────────────

interface WidgetProps {
  options: WidgetMountOptions;
}

function Widget({ options }: WidgetProps) {
  const [isOpen, setIsOpen] = useState(options.initialOpen ?? false);

  // Validate and build config
  const config = useMemo(() => {
    const parsed = WidgetConfigSchema.safeParse({
      ...options,
    });
    if (!parsed.success) {
      console.error('[Ardyn] Invalid widget config:', parsed.error.flatten());
      throw new Error('Invalid widget config');
    }
    return buildPipelineConfig({
      livekitToken: options.livekitToken,
      livekitUrl: options.livekitUrl,
      deepgramApiKey: options.deepgramApiKey,
      elevenlabsApiKey: options.elevenlabsApiKey,
      elevenlabsVoiceId: options.elevenlabsVoiceId,
      silenceTimeoutMs: options.silenceTimeoutMs,
      interruptOnSpeech: options.interruptOnSpeech,
      greetingMessage: options.greetingMessage,
    });
  }, [options]);

  // Voice agent
  const {
    state,
    messages,
    isTextOnly,
    volume,
    connect,
    disconnect,
    sendMessage,
    interrupt,
  } = useVoiceAgent({
    config,
    onStateChange: options.onStateChange,
    onMessage: options.onMessage,
    onTranscript: options.onTranscript,
    onError: options.onError,
  });

  // Auto-connect
  useEffect(() => {
    if (options.autoConnect && state === 'idle') {
      connect();
    }
  }, []);

  // Handle toggle
  const handleToggle = useCallback(() => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsOpen(true);

    // Connect on first open if not already connected
    if (state === 'idle') {
      connect();
    }
  }, [isOpen, state, connect]);

  // Handle close
  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Position class
  const position = options.position ?? 'bottom-right';
  const positionClass = `avw-position-${position}`;
  const openClass = isOpen ? 'avw-widget-open' : '';

  return (
    <div
      class={`avw-widget-container ${positionClass} ${openClass}`}
      data-ardyn-voice-widget
    >
      {/* Chat panel */}
      {isOpen && (
        <ChatPanel
          state={state}
          messages={messages}
          isTextOnly={isTextOnly}
          volume={volume}
          analyserNode={null}
          brandColor={options.brandColor ?? '#6366f1'}
          brandName={options.brandName ?? 'Ardyn'}
          avatarUrl={options.avatarUrl}
          onSendMessage={sendMessage}
          onInterrupt={interrupt}
          onClose={handleClose}
        />
      )}

      {/* Voice button */}
      <VoiceButton
        state={state}
        isOpen={isOpen}
        volume={volume}
        onToggle={handleToggle}
        brandColor={options.brandColor ?? '#6366f1'}
        buttonSize={options.buttonSize ?? 56}
      />
    </div>
  );
}

// ─── Public API — mount / unmount ──────────────────────────────

let mountedApp: HTMLElement | null = null;
let unmountFn: (() => void) | null = null;

/**
 * Mount the voice widget into a DOM container.
 *
 * @param container - DOM element to mount into
 * @param options - Widget configuration (LiveKit token required)
 */
export function mount(container: HTMLElement | string, options: WidgetMountOptions): void {
  const el = typeof container === 'string' ? document.querySelector(container) : container;

  if (!el) {
    throw new Error('[Ardyn] Container element not found');
  }

  // Unmount any existing instance
  if (mountedApp && unmountFn) {
    unmountFn();
  }

  // Create a wrapper element for isolation
  const wrapper = document.createElement('div');
  wrapper.setAttribute('data-ardyn-root', '');
  el.appendChild(wrapper);

  const vnode = h(Widget, { options });
  render(vnode, wrapper);

  mountedApp = wrapper;
  unmountFn = () => {
    render(null, wrapper);
    wrapper.remove();
    mountedApp = null;
    unmountFn = null;
  };
}

/**
 * Unmount the voice widget.
 */
export function unmount(): void {
  if (unmountFn) {
    unmountFn();
  }
}

/**
 * Create a programmatic API for a mounted widget.
 * Returns methods to control the widget.
 */
export function createAPI(): WidgetAPI {
  return {
    mount,
    unmount,
    open: () => {
      // Triggers via DOM — the widget listens internally
      const btn = document.querySelector('.avw-voice-button') as HTMLButtonElement;
      if (btn && !document.querySelector('.avw-widget-open')) {
        btn.click();
      }
    },
    close: () => {
      const closeBtn = document.querySelector('.avw-close-btn') as HTMLButtonElement;
      closeBtn?.click();
    },
    toggle: () => {
      const btn = document.querySelector('.avw-voice-button') as HTMLButtonElement;
      btn?.click();
    },
    getState: (): AgentState => {
      return 'idle'; // State is internal to Preact; full API would need a store
    },
    getTranscript: (): ChatMessage[] => {
      return [];
    },
    sendMessage: (text: string) => {
      const input = document.querySelector('.avw-input') as HTMLInputElement;
      if (input) {
        input.value = text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const form = input.closest('form');
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
    },
  };
}

// ─── Auto-mount via data attributes ────────────────────────────

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const elements = document.querySelectorAll('[data-ardyn-voice-widget]');
    elements.forEach((el) => {
      const token = el.getAttribute('data-ardyn-token');
      if (!token) {
        console.warn('[Ardyn] Missing data-ardyn-token on widget element');
        return;
      }

      const options: WidgetMountOptions = {
        livekitToken: token,
        livekitUrl: el.getAttribute('data-ardyn-livekit-url') ?? undefined,
        brandName: el.getAttribute('data-ardyn-brand') ?? undefined,
        brandColor: el.getAttribute('data-ardyn-color') ?? undefined,
        deepgramApiKey: el.getAttribute('data-ardyn-deepgram-key') ?? undefined,
        elevenlabsApiKey: el.getAttribute('data-ardyn-elevenlabs-key') ?? undefined,
        position: (el.getAttribute('data-ardyn-position') as any) ?? undefined,
        autoConnect: el.getAttribute('data-ardyn-auto-connect') === 'true',
        initialOpen: el.getAttribute('data-ardyn-initial-open') === 'true',
        greetingMessage: el.getAttribute('data-ardyn-greeting') ?? undefined,
      };

      mount(el as HTMLElement, options);
    });
  });
}

// ─── Named exports for tree-shaking ─────────────────────────────

export { VoiceButton } from './components/VoiceButton';
export { ChatPanel } from './components/ChatPanel';
export { AudioVisualizer } from './components/AudioVisualizer';
export { TypingIndicator } from './components/TypingIndicator';
export { useVoiceAgent } from './hooks/useVoiceAgent';
export { useAudioCapture } from './hooks/useAudioCapture';
export * from './types';