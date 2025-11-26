import { useEffect, useRef } from "react";
import type { GBEmulator } from "@/emulator/gbEmulator";

interface TileViewerProps {
  emulator: GBEmulator | null;
}

export const TileViewer = ({ emulator }: TileViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let rafId = 0;

    const render = () => {
      const emu = emulator;
      const canvas = canvasRef.current;
      if (!emu || !canvas) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const { width, height, data } = emu.getTileViewerData();

      if (canvas.width !== width) {
        canvas.width = width;
      }
      if (canvas.height !== height) {
        canvas.height = height;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const imageData = ctx.createImageData(width, height);
      const buf = imageData.data;

      for (let i = 0; i < data.length; i += 1) {
        const v = data[i];
        let shade = 255;
        if (v === 1) shade = 192;
        else if (v === 2) shade = 128;
        else if (v === 3) shade = 64;
        const idx = i * 4;
        buf[idx] = shade;
        buf[idx + 1] = shade;
        buf[idx + 2] = shade;
        buf[idx + 3] = 255;
      }

      ctx.putImageData(imageData, 0, 0);

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [emulator]);

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <canvas
        ref={canvasRef}
        className="h-64 w-80 border border-gray-600"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
};
