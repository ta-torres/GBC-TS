import { useEffect, useRef } from "react";

export const GBScreen = () => {
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
  }, []);

  return (
    <div className="rounded-lg bg-gray-800 p-4">
      <canvas
        ref={canvasRef}
        width={160}
        height={144}
        className="w-full border-4 border-gray-700"
        style={{ imageRendering: "pixelated" }}
      />
    </div>
  );
};
