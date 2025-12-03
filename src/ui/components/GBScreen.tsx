import { useEffect, useRef } from "react";
import type { GBEmulator } from "../../emulator/gbEmulator";

export const GBScreen = ({ emulator }: { emulator: GBEmulator }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    const draw = () => {
      if (emulator && emulator.consumeFrameReady()) {
        const framebuffer = emulator.getFramebuffer();
        screenDataBuffer.set(framebuffer);
        ctx.putImageData(imageData, 0, 0);
      }
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [emulator]);

  return (
    <canvas
      ref={canvasRef}
      width={160}
      height={144}
      className="gb-screen-canvas"
      style={{ imageRendering: "pixelated" }}
      /* <div className="rounded-lg bg-gray-800 p-4">
      <canvas
        ref={canvasRef}
        width={160}
        height={144}
        className="w-full border-4 border-gray-700"
        style={{ imageRendering: "pixelated" }}
      />
    </div> */
    />
  );
};
