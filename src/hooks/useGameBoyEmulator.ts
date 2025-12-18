import { useCallback, useEffect, useRef, useState } from "react";
import { GBEmulator } from "@/emulator/gbEmulator";
import type { JoypadButton } from "@/emulator/input/joypad";

type PresentableGBEmulator = GBEmulator & {
  __gbPresentFront?: Uint32Array;
  __gbPresentBack?: Uint32Array;
  __gbPresentFrameId?: number;
};

export const useGameBoyEmulator = () => {
  const emulatorRef = useRef<GBEmulator | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [speedMultiplier, setSpeedMultiplier] = useState(1);

  if (!emulatorRef.current) {
    emulatorRef.current = new GBEmulator();
  }

  useEffect(() => {
    let rafId = 0;
    const CYCLES_PER_FRAME = 70224;
    const MAX_FRAMES_PER_RAF = 5;
    const SMOOTHING_ALPHA = 0.1;
    const MAX_SYNC_FPS = 60;
    const MIN_TARGET_FRAME_MS = 1000 / MAX_SYNC_FPS;

    const emuForPresentation =
      emulatorRef.current as PresentableGBEmulator | null;
    if (emuForPresentation && !emuForPresentation.__gbPresentFront) {
      emuForPresentation.__gbPresentFront = new Uint32Array(160 * 144);
      emuForPresentation.__gbPresentBack = new Uint32Array(160 * 144);
      emuForPresentation.__gbPresentFrameId = 0;
    }

    let lastTimestamp: number | null = null;
    let accumulatorMs = 0;
    let estimatedDisplayFrameMs = 1000 / 60;

    const loop = (timestamp: number) => {
      if (lastTimestamp === null) {
        lastTimestamp = timestamp;
        rafId = requestAnimationFrame(loop);
        return;
      }

      const rawDtMs = timestamp - lastTimestamp;
      lastTimestamp = timestamp;

      const dtMs = Math.min(250, rawDtMs);
      if (rawDtMs > 0 && rawDtMs < 100) {
        estimatedDisplayFrameMs +=
          (rawDtMs - estimatedDisplayFrameMs) * SMOOTHING_ALPHA;
      }

      const targetFrameMs = Math.max(
        estimatedDisplayFrameMs,
        MIN_TARGET_FRAME_MS,
      );

      const emu = emulatorRef.current;
      if (emu && emu.isRunning() && !emu.isPaused()) {
        accumulatorMs += dtMs;

        let framesStepped = 0;
        while (
          accumulatorMs >= targetFrameMs &&
          framesStepped < MAX_FRAMES_PER_RAF
        ) {
          emu.stepFrame(CYCLES_PER_FRAME);

          const presentableEmu = emu as PresentableGBEmulator;
          if (
            presentableEmu.__gbPresentFront &&
            presentableEmu.__gbPresentBack &&
            emu.consumeFrameReady()
          ) {
            presentableEmu.__gbPresentBack.set(emu.getFramebuffer());
            const previousFront = presentableEmu.__gbPresentFront;
            presentableEmu.__gbPresentFront = presentableEmu.__gbPresentBack;
            presentableEmu.__gbPresentBack = previousFront;
            presentableEmu.__gbPresentFrameId =
              (presentableEmu.__gbPresentFrameId ?? 0) + 1;
          }

          accumulatorMs -= targetFrameMs;
          framesStepped += 1;
        }

        if (framesStepped === MAX_FRAMES_PER_RAF) {
          accumulatorMs = 0;
        }
      } else {
        accumulatorMs = 0;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const keyToButton: Record<string, JoypadButton> = {
      ArrowRight: "right",
      ArrowLeft: "left",
      ArrowUp: "up",
      ArrowDown: "down",
      KeyZ: "b",
      KeyX: "a",
      Enter: "start",
      ShiftRight: "select",
      ShiftLeft: "select",
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const emu = emulatorRef.current;
      if (!emu) return;
      const button = keyToButton[event.code];
      if (!button) return;

      event.preventDefault();
      emu.pressButton(button);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      const emu = emulatorRef.current;
      if (!emu) return;
      const button = keyToButton[event.code];
      if (!button) return;

      event.preventDefault();
      emu.releaseButton(button);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const emu = emulatorRef.current;
      if (!emu) return;
      if (!emu.hasSRAMBeenWrittenTo()) return;
      saveSRAMToLocalStorage(emu);
      emu.clearSRAMWriteFlag();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  const saveSRAMToLocalStorage = (emu: GBEmulator) => {
    const saveKey = emu.getSaveKey();
    if (!saveKey || typeof window === "undefined") return;

    try {
      const sram = emu.getSRAMSnapshot();
      if (!sram) return;

      const encoded = btoa(String.fromCharCode(...sram));
      window.localStorage.setItem(saveKey, encoded);
    } catch (error) {
      console.error("Error saving SRAM", error);
    }
  };

  const handleSRAMSave = () => {
    const emu = emulatorRef.current;
    if (!emu) return;
    saveSRAMToLocalStorage(emu);
  };

  const handleButtonDown = (button: JoypadButton) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.pressButton(button);
  };

  const handleButtonUp = (button: JoypadButton) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.releaseButton(button);
  };

  const handleLoadROM = async (file: File) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    saveSRAMToLocalStorage(emu);
    const ok = await emu.loadROM(file);

    if (ok) {
      const saveKey = emu.getSaveKey();
      if (saveKey && typeof window !== "undefined") {
        try {
          const raw = window.localStorage.getItem(saveKey);
          if (raw) {
            const decoded = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
            emu.loadSRAMSnapshot(decoded);
          }
        } catch (error) {
          console.error("Failed to load SRAM from localStorage", error);
        }
      }

      setIsLoaded(ok);
      setSpeedMultiplier(emu.getSpeedMultiplier());
      emu.start();
      setIsRunning(true);
    }
  };

  const handleStart = () => {
    const emu = emulatorRef.current;
    if (!emu || !isLoaded) return;
    emu.start();
    setIsRunning(true);
  };

  const handlePause = () => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.pause();
    setIsRunning(!emu.isPaused());
  };

  const handleReset = () => {
    const emu = emulatorRef.current;
    if (!emu) return;
    saveSRAMToLocalStorage(emu);
    emu.reset();
    setIsRunning(false);
  };

  const handleStep = () => {
    const emu = emulatorRef.current;
    if (!emu || !isLoaded) return;
    emu.stepInstruction();
  };

  const handleStepFrame = () => {
    const emu = emulatorRef.current;
    if (!emu || !isLoaded) return;

    const CYCLES_PER_FRAME = 70224;
    const startTicks = emu.getTicks();
    while (emu.getTicks() - startTicks < CYCLES_PER_FRAME) {
      emu.stepInstruction();
    }
  };

  const setEmulatorSpeedMultiplier = useCallback((multiplier: number) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    emu.setSpeedMultiplier(Math.max(1, multiplier));
    setSpeedMultiplier(emu.getSpeedMultiplier());
  }, []);

  const handleIncreaseSpeed = useCallback(() => {
    setEmulatorSpeedMultiplier(speedMultiplier + 0.25);
  }, [setEmulatorSpeedMultiplier, speedMultiplier]);

  const handleDecreaseSpeed = useCallback(() => {
    setEmulatorSpeedMultiplier(Math.max(1, speedMultiplier - 0.25));
  }, [setEmulatorSpeedMultiplier, speedMultiplier]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat) return;

      if (event.key === "+" || event.code === "KeyW") {
        event.preventDefault();
        handleIncreaseSpeed();
        return;
      }

      if (event.key === "-" || event.code === "KeyQ") {
        event.preventDefault();
        handleDecreaseSpeed();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleDecreaseSpeed, handleIncreaseSpeed]);

  return {
    emulatorRef,
    isLoaded,
    isRunning,
    speedMultiplier,
    handleIncreaseSpeed,
    handleDecreaseSpeed,
    handleSRAMSave,
    handleButtonDown,
    handleButtonUp,
    handleLoadROM,
    handleStart,
    handlePause,
    handleReset,
    handleStep,
    handleStepFrame,
  };
};
