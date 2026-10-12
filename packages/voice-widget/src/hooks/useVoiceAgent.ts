/**
 * useVoiceAgent — Core hook managing the voice agent lifecycle
 *
 * State machine:
 *   idle → connecting → listening → processing → speaking → idle
 *                        ↑_________________↓
 *                        (user interrupt)
 *
 * Handles:
 *   - LiveKit room connection via pipecat pipeline
 *   - Audio capture integration
 *   - Remote TTS audio playback
 *   - Text fallback mode (when mic unavailable)
 *   - Transcript tracking
 *   - Interrupt handling
 *
 * The server-side pipecat pipeline handles:
 *   Deepgram STT → LLM → ElevenLabs TTS
 * The client handles audio I/O and signaling.
 */

import { useState, useRef, useCallback, useEffect } from 'preact/hooks';
import type { AgentState, ChatMessage, TranscriptSegment } from '../types';
import type { PipelineConfig } from '../types';
import { useAudioCapture } from './useAudioCapture';
import {
  connectPipecatPipeline,
  sendTextMessage,
  sendInterrupt,
  type RoomConnection,
} from '../pipeline/pipecat';

interface UseVoiceAgentOptions {
  config: PipelineConfig;
  onStateChange?: (state: AgentState) => void;
  onMessage?: (message: ChatMessage) => void;
  onTranscript?: (segment: TranscriptSegment) => void;
  onError?: (error: Error) => void;
}

interface UseVoiceAgentReturn {
  state: AgentState;
  messages: ChatMessage[];
  transcript: TranscriptSegment[];
  isTextOnly: boolean;
  volume: number;
  connect: () => Promise<void>;
  disconnect: () => void;
  sendMessage: (text: string) => void;
  interrupt: () => void;
  clearMessages: () => void;
}

let messageIdCounter = 0;
function nextId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`;
}

export function useVoiceAgent(options: UseVoiceAgentOptions): UseVoiceAgentReturn {
  const { config, onStateChange, onMessage, onTranscript, onError } = options;

  const [state, setState] = useState<AgentState>('idle');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);

  const connectionRef = useRef<RoomConnection | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const remoteAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const currentAssistantMsgRef = useRef<string>('');
  const stateRef = useRef<AgentState>('idle');

  // Keep state ref in sync for interrupt handler
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Set up audio element for remote TTS playback
  useEffect(() => {
    const el = new Audio();
    el.autoplay = true;
    audioElRef.current = el;

    return () => {
      el.pause();
      el.srcObject = null;
      audioElRef.current = null;
    };
  }, []);

  // ─── Audio capture ───────────────────────────────────────────
  const {
    startCapture,
    stopCapture,
    isTextOnly,
    volume,
  } = useAudioCapture({
    sampleRate: config.deepgram.sampleRate ?? 16000,
  });

  // ─── State transition helper ──────────────────────────────────
  const transition = useCallback(
    (newState: AgentState) => {
      setState(newState);
      stateRef.current = newState;
      onStateChange?.(newState);
    },
    [onStateChange],
  );

  // ─── Handle remote audio track ────────────────────────────────
  const handleRemoteAudio = useCallback(
    (track: MediaStreamTrack) => {
      remoteAudioTrackRef.current = track;

      if (audioElRef.current) {
        const stream = new MediaStream([track]);
        audioElRef.current.srcObject = stream;
        audioElRef.current.play().catch(() => {
          // Autoplay may be blocked; user will need to interact
        });
      }

      // Detect when AI starts speaking (track produces audio)
      transition('speaking');

      // Watch track to detect when speech ends
      const endedHandler = () => {
        transition('listening');
        remoteAudioTrackRef.current = null;

        // Finalize any pending assistant transcript
        const finalText = currentAssistantMsgRef.current;
        if (finalText) {
          const msg: ChatMessage = {
            id: nextId(),
            role: 'agent',
            content: finalText,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, msg]);
          onMessage?.(msg);
          currentAssistantMsgRef.current = '';

          setTranscript((prev) => [
            ...prev,
            { role: 'agent', text: finalText, timestamp: Date.now(), isFinal: true },
          ]);
          onTranscript?.({ role: 'agent', text: finalText, timestamp: Date.now(), isFinal: true });
        }
      };

      track.addEventListener('ended', endedHandler, { once: true });

      // Fallback: if no ended event, look for silence
      // Tracks from LiveKit typically end cleanly when the remote stops publishing
    },
    [transition, onMessage, onTranscript],
  );

  // ─── Connection ───────────────────────────────────────────────
  const connect = useCallback(async () => {
    if (stateRef.current !== 'idle') return;

    transition('connecting');

    try {
      // If text-only, skip audio capture and connect without mic
      let audioTrack: MediaStreamTrack | null = null;
      if (!isTextOnly) {
        audioTrack = await startCapture();

        // If capture failed (permission denied), switch to text-only
        if (!audioTrack) {
          // Still connect — text-only mode
          console.log('[Ardyn] No mic available. Running in text-only mode.');
        }
      }

      // Connect to pipecat pipeline via LiveKit
      const connection = await connectPipecatPipeline(
        config,
        audioTrack || new MediaStreamTrack(), // Empty track for text-only
        handleRemoteAudio,
        (connectionState: string) => {
          if (connectionState === 'connected') {
            transition('listening');

            // Send greeting
            const greeting: ChatMessage = {
              id: nextId(),
              role: 'agent',
              content: config.greetingMessage,
              timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, greeting]);
            onMessage?.(greeting);
          } else if (connectionState === 'disconnected') {
            transition('idle');
          } else if (connectionState === 'failed' || connectionState === 'error') {
            transition('error');
          }
        },
        (error: Error) => {
          transition('error');
          onError?.(error);
        },
      );

      connectionRef.current = connection;

      // Start listening to remote data channel for transcripts
      // LiveKit data messages from pipecat come through the room
      if (connection.room) {
        connection.room.on('dataReceived', (_payload: Uint8Array, _participant: any, _kind: any, topic?: string) => {
          if (topic !== 'pipecat-out') return;

          try {
            const decoder = new TextDecoder();
            const json = JSON.parse(decoder.decode(_payload));

            // Handle different message types from pipecat
            if (json.type === 'transcript') {
              const segment: TranscriptSegment = {
                role: json.role || 'agent',
                text: json.text,
                timestamp: Date.now(),
                isFinal: json.isFinal ?? true,
              };

              if (segment.role === 'agent') {
                currentAssistantMsgRef.current += segment.text;
              }

              if (segment.isFinal && segment.role === 'user') {
                const msg: ChatMessage = {
                  id: nextId(),
                  role: 'user',
                  content: segment.text,
                  timestamp: Date.now(),
                };
                setMessages((prev) => [...prev, msg]);
                onMessage?.(msg);
              }

              setTranscript((prev) => [...prev, segment]);
              onTranscript?.(segment);
            } else if (json.type === 'state') {
              // Server signaling state changes
              const serverState = json.state;
              if (json.state === 'agent_speaking') {
                transition('speaking');
              } else if (json.state === 'agent_thinking') {
                transition('processing');
              } else if (json.state === 'listening') {
                transition('listening');
              }
            } else if (json.type === 'error') {
              onError?.(new Error(json.message || 'Pipeline error'));
            }
          } catch {
            // Ignore malformed messages
          }
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      transition('error');
      onError?.(error);
    }
  }, [
    config,
    isTextOnly,
    startCapture,
    handleRemoteAudio,
    transition,
    onMessage,
    onTranscript,
    onError,
  ]);

  // ─── Disconnect ───────────────────────────────────────────────
  const disconnect = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.cleanup();
      connectionRef.current = null;
    }
    stopCapture();
    remoteAudioTrackRef.current = null;

    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.srcObject = null;
    }

    transition('idle');
  }, [stopCapture, transition]);

  // ─── Send text message (fallback / text-only mode) ────────────
  const sendMessage = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      const userMsg: ChatMessage = {
        id: nextId(),
        role: 'user',
        content: text.trim(),
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg]);
      onMessage?.(userMsg);

      setTranscript((prev) => [
        ...prev,
        { role: 'user', text: text.trim(), timestamp: Date.now(), isFinal: true },
      ]);
      onTranscript?.({ role: 'user', text: text.trim(), timestamp: Date.now(), isFinal: true });

      // Send through LiveKit data channel to pipecat
      if (connectionRef.current?.room) {
        sendTextMessage(connectionRef.current.room, text.trim());
        transition('processing');
      } else {
        // Not connected — echo a fallback response
        setTimeout(() => {
          const fallbackMsg: ChatMessage = {
            id: nextId(),
            role: 'agent',
            content: "I'm not connected right now. Please try reconnecting.",
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, fallbackMsg]);
          onMessage?.(fallbackMsg);
        }, 500);
      }
    },
    [transition, onMessage, onTranscript],
  );

  // ─── Interrupt ────────────────────────────────────────────────
  const interrupt = useCallback(() => {
    if (stateRef.current === 'speaking' || stateRef.current === 'processing') {
      if (connectionRef.current?.room) {
        sendInterrupt(connectionRef.current.room);
      }

      // Stop local playback
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.currentTime = 0;
      }

      // Finalize any pending assistant text
      if (currentAssistantMsgRef.current) {
        const msg: ChatMessage = {
          id: nextId(),
          role: 'agent',
          content: currentAssistantMsgRef.current + ' [interrupted]',
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, msg]);
        onMessage?.(msg);
        currentAssistantMsgRef.current = '';
      }

      transition('listening');
    }
  }, [transition, onMessage]);

  // ─── Clear messages ───────────────────────────────────────────
  const clearMessages = useCallback(() => {
    setMessages([]);
    setTranscript([]);
  }, []);

  // ─── Cleanup on unmount ───────────────────────────────────────
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    state,
    messages,
    transcript,
    isTextOnly,
    volume,
    connect,
    disconnect,
    sendMessage,
    interrupt,
    clearMessages,
  };
}