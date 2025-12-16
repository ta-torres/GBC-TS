import { useEffect, useRef, useState } from "react";
import type { GBEmulator } from "../../../emulator/gbEmulator";
import { Overlay } from "./Overlay";
import "./GameboyScreen.css";

const GB_TARGET_FPS = 4194304 / 70224;

export const GBScreen = ({
  emulator,
  showOverlay,
}: {
  emulator: GBEmulator;
  showOverlay: boolean;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPresentedFrameIdRef = useRef<number | null>(null);
  const lastFrameTimestampRef = useRef<number | null>(null);
  const intervalStartTimeRef = useRef<number | null>(null);
  const frameCountRef = useRef(0);
  const [overlayStats, setOverlayStats] = useState({
    fps: 0,
    frameTime: 0,
    speedPercent: 0,
  });

  useEffect(() => {
    const presentationCanvas = canvasRef.current;
    if (!presentationCanvas) return;

    const presentationCtx = presentationCanvas.getContext("2d");
    if (!presentationCtx) return;

    presentationCtx.imageSmoothingEnabled = false;

    presentationCtx.fillStyle = "#0f380f";
    presentationCtx.fillRect(0, 0, 160, 144);

    presentationCtx.fillStyle = "#ffffff";
    presentationCtx.font = "12px monospace";
    presentationCtx.fillText("GBC-TS", 60, 72);

    const width = 160;
    const height = 144;

    const offscreenCanvas = document.createElement("canvas");
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
    const offscreenCtx = offscreenCanvas.getContext("2d");
    if (!offscreenCtx) return;
    offscreenCtx.imageSmoothingEnabled = false;

    const offscreenImageData = offscreenCtx.createImageData(width, height);
    const offscreenPixelBuffer = new Uint32Array(
      offscreenImageData.data.buffer,
      offscreenImageData.data.byteOffset,
      offscreenImageData.data.byteLength / 4,
    );
    let rafId = 0;

    const readEmulatorFrontBuffer = (): {
      frameId: number;
      buffer: Uint32Array;
    } | null => {
      const emulatorPresentApi = emulator as unknown as {
        __gbPresentFrameId?: number;
        __gbPresentFront?: Uint32Array;
      };

      if (
        typeof emulatorPresentApi.__gbPresentFrameId === "number" &&
        emulatorPresentApi.__gbPresentFront instanceof Uint32Array
      ) {
        return {
          frameId: emulatorPresentApi.__gbPresentFrameId,
          buffer: emulatorPresentApi.__gbPresentFront,
        };
      }

      return null;
    };

    const draw = (timestampFromRAF: number) => {
      const presentedFrame = readEmulatorFrontBuffer();
      if (
        presentedFrame &&
        lastPresentedFrameIdRef.current !== presentedFrame.frameId
      ) {
        offscreenPixelBuffer.set(presentedFrame.buffer);
        offscreenCtx.putImageData(offscreenImageData, 0, 0);
        presentationCtx.drawImage(offscreenCanvas, 0, 0);

        lastPresentedFrameIdRef.current = presentedFrame.frameId;

        if (showOverlay && lastFrameTimestampRef.current !== null) {
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

            setOverlayStats({
              fps: currentFps,
              frameTime: avgDeltaTimeBetweenFrames,
              speedPercent: (currentFps / GB_TARGET_FPS) * 100,
            });

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
  }, [emulator, showOverlay]);

  return (
    <div className="gb-screen-inner">
      <canvas
        ref={canvasRef}
        width={160}
        height={144}
        className="gb-screen-canvas"
        style={{ imageRendering: "pixelated" }}
      />
      {showOverlay && <Overlay overlay={overlayStats} />}
    </div>
  );
};
