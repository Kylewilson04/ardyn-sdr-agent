/**
 * AudioVisualizer — Canvas-based live audio waveform
 *
 * Renders an animated bar/line visualization driven by
 * volume level and audio frequency data from AnalyserNode.
 */

import { h } from 'preact';
import { useRef, useEffect } from 'preact/hooks';

interface AudioVisualizerProps {
  analyserNode: AnalyserNode | null;
  volume: number;
  isActive: boolean;
  color?: string;
  height?: number;
  barCount?: number;
}

export function AudioVisualizer({
  analyserNode,
  volume,
  isActive,
  color = '#6366f1',
  height = 48,
  barCount = 32,
}: AudioVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const dataArrayRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.parentElement?.clientWidth ?? 300;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.scale(dpr, dpr);

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      if (!isActive) {
        // Draw flat line when inactive
        ctx.beginPath();
        ctx.moveTo(0, height / 2);
        ctx.lineTo(width, height / 2);
        ctx.strokeStyle = `${color}20`;
        ctx.lineWidth = 1;
        ctx.stroke();
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      // Get frequency data if analyser is available
      const bars: number[] = [];
      if (analyserNode) {
        const bufferLength = analyserNode.frequencyBinCount;
        if (!dataArrayRef.current || dataArrayRef.current.length !== bufferLength) {
          dataArrayRef.current = new Uint8Array(bufferLength);
        }
        const freqData = dataArrayRef.current!;
        analyserNode.getByteFrequencyData(freqData as any);

        // Downsample to barCount
        const step = Math.floor(bufferLength / barCount);
        for (let i = 0; i < barCount; i++) {
          let sum = 0;
          for (let j = 0; j < step; j++) {
            sum += freqData[i * step + j] || 0;
          }
          bars.push(sum / step / 255);
        }
      } else {
        // Fallback: generate bars from volume only
        for (let i = 0; i < barCount; i++) {
          const variance = Math.sin((i / barCount) * Math.PI) * (0.5 + Math.random() * 0.5);
          bars.push(Math.max(0.05, volume * variance));
        }
      }

      const barWidth = (width - (barCount - 1) * 2) / barCount;
      const barSpacing = 2;

      // Draw bars
      for (let i = 0; i < barCount; i++) {
        const barHeight = Math.max(2, bars[i]! * height * 0.9);
        const x = i * (barWidth + barSpacing);
        const y = (height - barHeight) / 2;

        // Gradient fill
        const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
        const alpha = 0.4 + (bars[i]! * 0.6);
        gradient.addColorStop(0, colorWithAlpha(color, alpha));
        gradient.addColorStop(1, colorWithAlpha(color, alpha * 0.6));

        ctx.fillStyle = gradient;
        ctx.beginPath();
        roundRect(ctx, x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [analyserNode, volume, isActive, color, height, barCount]);

  return (
    <canvas
      ref={canvasRef}
      class="avw-audio-visualizer"
      aria-label="Audio waveform"
      role="img"
    />
  );
}

function colorWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}