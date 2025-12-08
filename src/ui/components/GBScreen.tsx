import { useEffect, useRef, useState } from "react";
import type { GBEmulator } from "../../emulator/gbEmulator";
import { Overlay } from "./Overlay";

const GB_TARGET_FPS = 59.7;

export const GBScreen = ({ emulator }: { emulator: GBEmulator }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastFrameTimestampRef = useRef<number | null>(null);
  const intervalStartTimeRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const [fps, setFps] = useState(0);
  const [frameTime, setFrameTime] = useState(0);
  const [speedPercent, setSpeedPercent] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#0f380f";
    ctx.fillRect(0, 0, 160, 144);

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px monospace";
    ctx.fillText("GBC-TS", 60, 72);

    const width = 160;
    const height = 144;

    const imageData = ctx.createImageData(width, height);
    const screenDataBuffer = new Uint32Array(
      imageData.data.buffer,
      imageData.data.byteOffset,
      imageData.data.byteLength / 4,
    );
    let rafId = 0;

    const draw = (timestampFromRAF: number) => {
      if (emulator && emulator.consumeFrameReady()) {
        const framebuffer = emulator.getFramebuffer();
        screenDataBuffer.set(framebuffer);
        ctx.putImageData(imageData, 0, 0);

        if (lastFrameTimestampRef.current !== null) {
          if (intervalStartTimeRef.current === null) {
            intervalStartTimeRef.current = lastFrameTimestampRef.current;
            frameCountRef.current = 0;
          }

          frameCountRef.current += 1;
          const timeElapsed = timestampFromRAF - intervalStartTimeRef.current;

          if (timeElapsed >= 500 && frameCountRef.current > 0) {
            const avgDeltaTimeBetweenFrames =
              timeElapsed / frameCountRef.current;
            const currentFps = (frameCountRef.current * 1000) / timeElapsed;
            setFrameTime(avgDeltaTimeBetweenFrames);
            setFps(currentFps);
            setSpeedPercent((currentFps / GB_TARGET_FPS) * 100);
            intervalStartTimeRef.current = timestampFromRAF;
            frameCountRef.current = 0;
          }
        }
        lastFrameTimestampRef.current = timestampFromRAF;
      }

      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [emulator]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={160}
        height={144}
        className="gb-screen-canvas"
        style={{ imageRendering: "pixelated" }}
      />
      <Overlay fps={fps} frameTime={frameTime} speedPercent={speedPercent} />
    </>
  );
};
