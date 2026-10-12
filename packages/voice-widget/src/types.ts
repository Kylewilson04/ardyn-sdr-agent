/**
 * Ardyn SDR Voice Widget — TypeScript types
 */

import { z } from 'zod';

// ─── Agent State Machine ───────────────────────────────────────────
export type AgentState =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

// ─── Message ───────────────────────────────────────────────────────
export interface TranscriptSegment {
  role: 'user' | 'agent';
  text: string;
  timestamp: number;
  isFinal: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  audioUrl?: string;
}

// ─── Widget Config (Zod-validated) ─────────────────────────────────
export const WidgetConfigSchema = z.object({
  // LiveKit
  livekitUrl: z.string().url().default('wss://livekit.ardyn.ai'),
  livekitToken: z.string().min(1, 'LiveKit token is required'),

  // Deepgram STT
  deepgramApiKey: z.string().optional(),
  deepgramModel: z.string().default('nova-2-general'),
  deepgramLanguage: z.string().default('en-US'),

  // ElevenLabs TTS
  elevenlabsApiKey: z.string().optional(),
  elevenlabsVoiceId: z.string().default('21m00Tcm4TlvDq8ikWAM'),
  elevenlabsModel: z.string().default('eleven_turbo_v2_5'),

  // Use browser SpeechSynthesis as TTS fallback
  ttsFallbackToBrowser: z.boolean().default(true),

  // UI
  position: z.enum(['bottom-right', 'bottom-left', 'top-right', 'top-left']).default('bottom-right'),
  theme: z.enum(['dark', 'light']).default('dark'),
  buttonSize: z.number().min(40).max(80).default(56),
  initialOpen: z.boolean().default(false),

  // Behaviour
  autoConnect: z.boolean().default(false),
  greetingMessage: z.string().default('Hey! I\'m Ardyn, your AI SDR. How can I help?'),
  interruptOnSpeech: z.boolean().default(true),
  silenceTimeoutMs: z.number().min(500).max(5000).default(1500),

  // Branding
  brandName: z.string().default('Ardyn'),
  brandColor: z.string().default('#6366f1'),
  avatarUrl: z.string().optional(),

  // Callbacks
  onMessage: z.function().optional(),
  onStateChange: z.function().optional(),
  onError: z.function().optional(),
  onTranscript: z.function().optional(),
});

export type WidgetConfig = z.infer<typeof WidgetConfigSchema>;

// ─── Partial config for mount (token typically provided separately) ─
export type WidgetMountOptions = Partial<Omit<WidgetConfig, 'livekitToken'>> & {
  livekitToken: string;
};

// ─── Pipeline service configs ──────────────────────────────────────
export interface LiveKitConfig {
  url: string;
  token: string;
  roomName?: string;
  participantName?: string;
}

export interface DeepgramConfig {
  apiKey?: string;
  model: string;
  language: string;
  encoding?: string;
  sampleRate?: number;
  channels?: number;
  interimResults?: boolean;
  endpointing?: number; // ms of silence before finalizing
  smartFormat?: boolean;
}

export interface ElevenLabsConfig {
  apiKey?: string;
  voiceId: string;
  model: string;
  stability?: number;
  similarityBoost?: number;
  optimizeStreamingLatency?: number;
}

export interface PipelineConfig {
  livekit: LiveKitConfig;
  deepgram: DeepgramConfig;
  elevenlabs: ElevenLabsConfig;
  ttsFallbackToBrowser: boolean;
  silenceTimeoutMs: number;
  interruptOnSpeech: boolean;
  greetingMessage: string;
}

// ─── Audio capture ─────────────────────────────────────────────────
export interface AudioCaptureState {
  isCapturing: boolean;
  error: string | null;
  permissionState: PermissionState | 'prompt' | null;
  volume: number; // 0–1
  analyserNode: AnalyserNode | null;
  stream: MediaStream | null;
}

// ─── Widget public API ─────────────────────────────────────────────
export interface WidgetAPI {
  mount: (container: HTMLElement, options: WidgetMountOptions) => void;
  unmount: () => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
  getState: () => AgentState;
  getTranscript: () => ChatMessage[];
  sendMessage: (text: string) => void;
}

// ─── Internal event types ──────────────────────────────────────────
export type WidgetEvent =
  | { type: 'state_change'; state: AgentState }
  | { type: 'message'; message: ChatMessage }
  | { type: 'transcript'; segment: TranscriptSegment }
  | { type: 'error'; error: Error }
  | { type: 'volume'; level: number }
  | { type: 'mic_permission'; granted: boolean };