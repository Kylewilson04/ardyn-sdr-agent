/**
 * useAudioCapture — Microphone capture with volume detection
 *
 * Handles:
 *   - getUserMedia with permission prompts
 *   - AudioContext + MediaStreamSource
 *   - ScriptProcessorNode for PCM access (AudioWorklet when available)
 *   - Volume level detection (RMS-based, 0–1)
 *   - Graceful fallback if mic is denied (returns text-only mode flag)
 */

import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import type { AudioCaptureState } from '../types';

interface UseAudioCaptureOptions {
  sampleRate?: number;
  onAudioData?: (pcm: Int16Array) => void;
  onVolumeChange?: (volume: number) => void;
}

interface UseAudioCaptureReturn {
  state: AudioCaptureState;
  startCapture: () => Promise<MediaStreamTrack | null>;
  stopCapture: () => void;
  isPermissionDenied: boolean;
  isTextOnly: boolean;
  volume: number;
}

export function useAudioCapture(options: UseAudioCaptureOptions = {}): UseAudioCaptureReturn {
  const { sampleRate = 16000, onAudioData, onVolumeChange } = options;

  const [state, setState] = useState<AudioCaptureState>({
    isCapturing: false,
    error: null,
    permissionState: null,
    volume: 0,
    analyserNode: null,
    stream: null,
  });

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const volumeIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioTrackRef = useRef<MediaStreamTrack | null>(null);

  const [isPermissionDenied, setIsPermissionDenied] = useState(false);

  // Check initial permission state
  useEffect(() => {
    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          setState((s) => ({ ...s, permissionState: status.state }));
          status.addEventListener('change', () => {
            setState((s) => ({ ...s, permissionState: status.state }));
          });
        })
        .catch(() => {
          // Some browsers don't support mic permission query
          setState((s) => ({ ...s, permissionState: 'prompt' }));
        });
    } else {
      setState((s) => ({ ...s, permissionState: 'prompt' }));
    }

    return () => {
      stopCaptureInternal();
    };
  }, []);

  const stopCaptureInternal = useCallback(() => {
    // Clear volume interval
    if (volumeIntervalRef.current) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    // Disconnect audio graph
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Close context
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    audioTrackRef.current = null;

    setState((s) => ({
      ...s,
      isCapturing: false,
      volume: 0,
      analyserNode: null,
      stream: null,
    }));
  }, []);

  const startCapture = useCallback(async (): Promise<MediaStreamTrack | null> => {
    try {
      // Request mic access
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: { ideal: sampleRate },
          channelCount: { ideal: 1 },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      streamRef.current = stream;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        throw new Error('No audio track available');
      }
      audioTrackRef.current = audioTrack;

      // Set up AudioContext
      const ctx = new AudioContext({ sampleRate });
      audioContextRef.current = ctx;

      // Resume if suspended (autoplay policy)
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }

      // Create source
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Create analyser for volume detection
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      analyserRef.current = analyser;
      source.connect(analyser);

      // Start volume monitoring
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      volumeIntervalRef.current = setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const val = (dataArray[i]! - 128) / 128;
          sum += val * val;
        }
        const rms = Math.sqrt(sum / bufferLength);
        const volume = Math.min(1, rms * 3); // Normalize

        setState((s) => ({ ...s, volume }));
        onVolumeChange?.(volume);
      }, 50);

      // ScriptProcessorNode for PCM capture (compat)
      // Note: AudioWorklet would be preferred but ScriptProcessor works everywhere
      const bufferSize = 4096;
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1);
      processorRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!onAudioData) return;
        const input = event.inputBuffer.getChannelData(0);
        // Float32 → Int16 (PCM)
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]!));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        onAudioData(pcm);
      };

      // Connect: source → processor → destination (for monitoring)
      // We don't need to hear ourselves, so don't connect to destination
      source.connect(processor);
      // Only connect analyser, not output to avoid feedback
      // processor.connect(ctx.destination); // Uncomment for local monitoring

      setState((s) => ({
        ...s,
        isCapturing: true,
        error: null,
        permissionState: 'granted',
        volume: 0,
        analyserNode: analyser,
        stream,
      }));

      setIsPermissionDenied(false);
      return audioTrack;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      if (
        error.name === 'NotAllowedError' ||
        error.name === 'PermissionDeniedError' ||
        error.message.includes('Permission')
      ) {
        setIsPermissionDenied(true);
        setState((s) => ({
          ...s,
          error: 'Microphone access denied. Switching to text mode.',
          permissionState: 'denied',
        }));
      } else {
        setState((s) => ({
          ...s,
          error: error.message,
        }));
      }

      return null;
    }
  }, [sampleRate, onAudioData, onVolumeChange]);

  const stopCapture = useCallback(() => {
    stopCaptureInternal();
  }, [stopCaptureInternal]);

  return {
    state,
    startCapture,
    stopCapture,
    isPermissionDenied,
    isTextOnly: isPermissionDenied || state.permissionState === 'denied',
    volume: state.volume,
  };
}