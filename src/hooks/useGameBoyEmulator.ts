import { useEffect, useRef, useState } from "react";
import { GBEmulator } from "@/emulator/gbEmulator";
import type { JoypadButton } from "@/emulator/input/joypad";

export const useGameBoyEmulator = () => {
  const emulatorRef = useRef<GBEmulator | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  if (!emulatorRef.current) {
    emulatorRef.current = new GBEmulator();
  }

  useEffect(() => {
    let rafId = 0;
    const CYCLES_PER_FRAME = 70224;

    const CLOCK_HZ = 4194304;
    const FPS = CLOCK_HZ / CYCLES_PER_FRAME;

    const FRAME_MS = 1000 / FPS;
    const MAX_FRAMES_PER_RAF = 3;

    let previousFrameTimestamp: number | null = null;
    let accumulatedTimeMs = 0;

    const loop = (timestampMs: number) => {
      if (previousFrameTimestamp === null) {
        previousFrameTimestamp = timestampMs;
      }

      // clamp maximum time to avoid catching up when idle
      const deltaTimeMs = Math.min(250, timestampMs - previousFrameTimestamp);
      previousFrameTimestamp = timestampMs;

      const emulator = emulatorRef.current;
      if (emulator && emulator.isRunning() && !emulator.isPaused()) {
        accumulatedTimeMs += deltaTimeMs;

        // only step frames if within the current budget for a loop iteration and there is at least one emulated frame worth of time
        let catchUpFrames = 0;
        while (
          accumulatedTimeMs >= FRAME_MS &&
          catchUpFrames < MAX_FRAMES_PER_RAF
        ) {
          emulator.stepFrame(CYCLES_PER_FRAME);
          accumulatedTimeMs -= FRAME_MS;
          catchUpFrames += 1;
        }

        if (catchUpFrames === MAX_FRAMES_PER_RAF) accumulatedTimeMs = 0;
      } else {
        accumulatedTimeMs = 0;
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

  return {
    emulatorRef,
    isLoaded,
    isRunning,
    handleButtonDown,
    handleButtonUp,
    handleLoadROM,
    handleStart,
    handlePause,
    handleReset,
    handleStep,
  };
};
