import type { FC } from "react";

interface OverlayProps {
  fps: number;
  frameTime: number;
  speedPercent: number;
}

export const Overlay: FC<OverlayProps> = ({ fps, frameTime }) => {
  const formattedFps = Number.isFinite(fps) ? fps.toFixed(1) : "-";
  const formattedFrameTime = Number.isFinite(frameTime)
    ? frameTime.toFixed(2)
    : "-";

  return (
    <div className="pointer-events-none absolute top-1 left-1 rounded bg-black/70 px-2 py-1 font-mono text-xs text-green-300">
      <div>FPS: {formattedFps}</div>
      <div>Frametime: {formattedFrameTime} ms</div>
    </div>
  );
};
