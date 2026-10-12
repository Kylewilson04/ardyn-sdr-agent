/**
 * Pipeline default configuration
 *
 * These are sensible defaults. All values can be overridden at mount time
 * via WidgetMountOptions.
 */

import type { DeepgramConfig, ElevenLabsConfig, LiveKitConfig, PipelineConfig } from '../types';

// ─── Default LiveKit config ────────────────────────────────────────
export const DEFAULT_LIVEKIT: Omit<LiveKitConfig, 'token'> = {
  url: 'wss://livekit.ardyn.ai',
  roomName: 'ardyn-sdr',
  participantName: 'ardyn-sdr-agent',
};

// ─── Default Deepgram config ───────────────────────────────────────
export const DEFAULT_DEEPGRAM: DeepgramConfig = {
  model: 'nova-2-general',
  language: 'en-US',
  encoding: 'linear16',
  sampleRate: 16000,
  channels: 1,
  interimResults: true,
  endpointing: 800,   // 800ms silence before finalizing transcript
  smartFormat: true,
};

// ─── Default ElevenLabs config ─────────────────────────────────────
export const DEFAULT_ELEVENLABS: Omit<ElevenLabsConfig, 'apiKey'> = {
  voiceId: '21m00Tcm4TlvDq8ikWAM', // Rachel — warm, natural
  model: 'eleven_turbo_v2_5',
  stability: 0.5,
  similarityBoost: 0.75,
  optimizeStreamingLatency: 3,
};

// ─── Full pipeline defaults ────────────────────────────────────────
export const DEFAULT_PIPELINE: Omit<PipelineConfig, 'livekit' | 'deepgram' | 'elevenlabs'> & {
  livekit: Omit<LiveKitConfig, 'token'>;
  deepgram: DeepgramConfig;
  elevenlabs: Omit<ElevenLabsConfig, 'apiKey'>;
} = {
  livekit: DEFAULT_LIVEKIT,
  deepgram: DEFAULT_DEEPGRAM,
  elevenlabs: DEFAULT_ELEVENLABS,
  ttsFallbackToBrowser: true,
  silenceTimeoutMs: 1500,
  interruptOnSpeech: true,
  greetingMessage: "Hey! I'm Ardyn, your AI SDR. How can I help?",
};

// ─── Build merged config from mount options ────────────────────────
export function buildPipelineConfig(
  options: {
    livekitToken: string;
    livekitUrl?: string;
    livekitRoom?: string;
    deepgramApiKey?: string;
    elevenlabsApiKey?: string;
    elevenlabsVoiceId?: string;
    silenceTimeoutMs?: number;
    interruptOnSpeech?: boolean;
    greetingMessage?: string;
  }
): PipelineConfig {
  return {
    livekit: {
      url: options.livekitUrl ?? DEFAULT_LIVEKIT.url,
      token: options.livekitToken,
      roomName: options.livekitRoom ?? DEFAULT_LIVEKIT.roomName,
      participantName: DEFAULT_LIVEKIT.participantName,
    },
    deepgram: {
      ...DEFAULT_DEEPGRAM,
      apiKey: options.deepgramApiKey,
    },
    elevenlabs: {
      ...DEFAULT_ELEVENLABS,
      apiKey: options.elevenlabsApiKey,
      voiceId: options.elevenlabsVoiceId ?? DEFAULT_ELEVENLABS.voiceId,
    },
    ttsFallbackToBrowser: true,
    silenceTimeoutMs: options.silenceTimeoutMs ?? 1500,
    interruptOnSpeech: options.interruptOnSpeech ?? true,
    greetingMessage: options.greetingMessage ?? DEFAULT_PIPELINE.greetingMessage,
  };
}