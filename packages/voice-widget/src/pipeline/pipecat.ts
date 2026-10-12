/**
 * Pipecat pipeline setup
 *
 * Manages the real-time voice pipeline:
 *   User mic → Deepgram STT → LLM → ElevenLabs TTS → User speaker
 *
 * Uses LiveKit as the WebRTC transport layer. The client publishes
 * its audio track to the LiveKit room; the server-side pipecat pipeline
 * handles STT/LLM/TTS and sends TTS audio back.
 *
 * Architecture:
 *   - Audio is captured locally via getUserMedia
 *   - Audio track is published to LiveKit room
 *   - Server-side pipecat process handles STT/LLM/TTS
 *   - TTS audio is received back via LiveKit remote track
 *   - We play it through an Audio element
 */

import type { PipelineConfig } from '../types';

// ─── Room connection state ─────────────────────────────────────────
export interface RoomConnection {
  room: any; // LiveKit Room
  localParticipant: any;
  audioTrack: MediaStreamTrack | null;
  cleanup: () => void;
}

/**
 * Connect to the LiveKit room and publish the local audio track.
 */
export async function connectPipecatPipeline(
  config: PipelineConfig,
  audioTrack: MediaStreamTrack,
  onRemoteAudio: (track: MediaStreamTrack) => void,
  onConnectionStateChange: (state: string) => void,
  onError: (error: Error) => void,
): Promise<RoomConnection> {
  // Dynamic import: LiveKit stays out of the critical path until needed
  const LiveKit = await import('livekit-client');

  const room = new LiveKit.Room({
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      videoEncoding: undefined,
      // Audio config set per-track
    },
  });

  // ── Connection lifecycle ──────────────────────────────────────
  const onCS = (state: string) => {
    onConnectionStateChange(state);
  };

  room
    .on(LiveKit.RoomEvent.ConnectionStateChanged, onCS)
    .on(LiveKit.RoomEvent.TrackSubscribed, (track: any, _publication: any, _participant: any) => {
      if (track.kind === 'audio') {
        const mediaTrack: MediaStreamTrack | undefined = track.mediaStreamTrack;
        if (mediaTrack) {
          onRemoteAudio(mediaTrack);
        }
      }
    })
    .on(LiveKit.RoomEvent.Disconnected, (reason?: any) => {
      console.log('[Ardyn] LiveKit disconnected:', reason ?? 'no reason');
    });

  try {
    await room.connect(config.livekit.url, config.livekit.token, {
      autoSubscribe: true,
    });

    // Publish local audio track if one was provided
    let localPublication: any = null;
    const hasAudio = audioTrack && audioTrack.readyState === 'live';

    if (hasAudio) {
      localPublication = await room.localParticipant.publishTrack(
        audioTrack,
        {
          source: LiveKit.Track.Source.Microphone as any,
          name: 'microphone',
        } as any,
      );
    }

    const cleanup = () => {
      room.off(LiveKit.RoomEvent.ConnectionStateChanged, onCS);
      if (localPublication) {
        room.localParticipant.unpublishTrack(localPublication);
        localPublication.track?.stop();
      }
      room.disconnect(true);
    };

    return {
      room,
      localParticipant: room.localParticipant,
      audioTrack: hasAudio ? audioTrack : null,
      cleanup,
    };
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    onError(error);
    throw error;
  }
}

/**
 * Send a text message through the LiveKit data channel to the pipecat pipeline.
 * Used as fallback when mic isn't available (text-only mode).
 */
export function sendTextMessage(room: any, text: string): void {
  if (!room?.localParticipant) return;

  const encoder = new TextEncoder();
  const data = encoder.encode(
    JSON.stringify({ type: 'user_message', text, timestamp: Date.now() }),
  );

  try {
    room.localParticipant.publishData(data, {
      reliable: true,
      topic: 'pipecat-in',
    });
  } catch (err) {
    console.error('[Ardyn] Failed to send text message:', err);
  }
}

/**
 * Interrupt the AI mid-speech by sending an interrupt signal
 * through the data channel. The server-side pipecat pipeline
 * should clear its TTS queue and stop speaking.
 */
export function sendInterrupt(room: any): void {
  if (!room?.localParticipant) return;

  const encoder = new TextEncoder();
  const data = encoder.encode(
    JSON.stringify({ type: 'interrupt', timestamp: Date.now() }),
  );

  try {
    room.localParticipant.publishData(data, {
      reliable: true,
      topic: 'pipecat-control',
    });
  } catch (err) {
    console.error('[Ardyn] Failed to send interrupt:', err);
  }
}