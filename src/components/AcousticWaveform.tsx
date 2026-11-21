import { useEffect, useRef } from 'react';

interface AcousticWaveformProps {
  isListening: boolean;
  isSpeaking: boolean;
  audioLevel: number; // 0 to 1
}

export function AcousticWaveform({ isListening, isSpeaking, audioLevel }: AcousticWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levelRef = useRef(audioLevel);
  const activeRef = useRef({ isListening, isSpeaking });

  useEffect(() => {
    levelRef.current = audioLevel;
    activeRef.current = { isListening, isSpeaking };
  }, [audioLevel, isListening, isSpeaking]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    let phase = 0;

    const render = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      const { isListening: listening, isSpeaking: speaking } = activeRef.current;
      const lvl = levelRef.current;

      // Subtle vertical spectrum ticks on the right like the console design
      const bars = 26;
      const barWidth = 2.5;
      const spacing = width / bars;
      for (let i = 0; i < bars; i++) {
        const x = i * spacing + 4;
        const energy = listening || speaking
          ? Math.max(0.15, Math.min(1, lvl * 1.4 + Math.sin(phase * 1.8 + i * 0.6) * 0.28))
          : 0.16 + Math.abs(Math.sin(phase * 0.5 + i * 0.45)) * 0.25;
        const h = energy * (height * 0.72);
        const y = (height - h) / 2;
        ctx.fillStyle = listening
          ? 'rgba(250, 204, 21, 0.35)'
          : speaking
          ? 'rgba(245, 158, 11, 0.38)'
          : 'rgba(234, 179, 8, 0.18)';
        ctx.fillRect(x, y, barWidth, h);
      }

      // Smooth glowing golden acoustic sine wave
      const amp = listening
        ? Math.max(10, lvl * (height * 0.42))
        : speaking
        ? 14 + Math.abs(Math.sin(phase * 2.2)) * 8
        : 9;

      const freq = listening ? 0.042 : speaking ? 0.036 : 0.025;
      phase += listening ? 0.14 : speaking ? 0.11 : 0.045;

      // Primary gold curve
      ctx.beginPath();
      for (let x = 0; x <= width; x += 2) {
        const env = Math.sin((x / width) * Math.PI);
        const y =
          height / 2 +
          Math.sin(x * freq + phase) * amp * env +
          Math.cos(x * freq * 0.6 - phase * 0.8) * (amp * 0.32) * env;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = listening ? '#FDE047' : speaking ? '#FBBF24' : '#EAB308';
      ctx.lineWidth = listening || speaking ? 2.2 : 1.75;
      ctx.stroke();

      // Secondary harmonic wave
      ctx.beginPath();
      for (let x = 0; x <= width; x += 3) {
        const env = Math.sin((x / width) * Math.PI);
        const y =
          height / 2 +
          Math.sin(x * freq * 1.4 - phase * 1.15) * (amp * 0.55) * env;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(253, 224, 71, 0.35)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={360}
      height={46}
      className="w-full h-[46px] rounded-lg"
      aria-label="Live acoustic voice waveform"
    />
  );
}
