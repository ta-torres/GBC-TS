import { useEffect, useRef } from "react";
import type { GBEmulator } from "@/emulator/gbEmulator";
import { Card } from "@/components/ui/pixelact-ui/card";

interface SpriteViewerProps {
  emulator: GBEmulator | null;
}

export const SpriteViewer = ({ emulator }: SpriteViewerProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let rafId = 0;

    const render = () => {
      const emu = emulator;
      const canvas = canvasRef.current;
      if (!emu || !canvas) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const { width, height, data } = emu.getSpriteTileViewerData();

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

      const tilesX = width / 8;
      const tilesY = height / 8;
      let count = 0;

      for (let ty = 0; ty < tilesY; ty += 1) {
        for (let tx = 0; tx < tilesX; tx += 1) {
          let nonZero = false;
          for (let row = 0; row < 8 && !nonZero; row += 1) {
            for (let col = 0; col < 8; col += 1) {
              const x = tx * 8 + col;
              const y = ty * 8 + row;
              if (data[y * width + x] !== 0) {
                nonZero = true;
                break;
              }
            }
          }
          if (nonZero) count += 1;
        }
      }

      if (count === 0) {
        ctx.fillStyle = "#0f380f";
        ctx.fillRect(0, 0, width, height);
      }

      if (labelRef.current) {
        labelRef.current.textContent = `Sprites: ${count}`;
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [emulator]);

  return (
    <Card className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
      <Card className="m-0 p-0">
        <canvas
          ref={canvasRef}
          className="gb-screen-canvas h-64 w-full"
          style={{ imageRendering: "pixelated" }}
        />
      </Card>
      <div className="text-xs text-gray-700" ref={labelRef}>
        Sprites: 0
      </div>
    </Card>
  );
};
