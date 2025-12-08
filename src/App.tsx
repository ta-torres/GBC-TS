import "./App.css";
import { useEffect, useRef, useState } from "react";
import { GBEmulator } from "./emulator/gbEmulator";
import type { JoypadButton } from "./emulator/input/joypad";
import { GBScreen } from "./ui/components/GBScreen";
import { EmuControllers } from "./ui/components/EmuControllers";
import { DebugData } from "./ui/components/DebugData";
import { TileViewer } from "./ui/components/TileViewer";
import { SpriteViewer } from "./ui/components/SpriteViewer";
import { GameBoyShell } from "./ui/components/GameBoyShell";
import { SpeedControl } from "./ui/components/SpeedControl";

function App() {
  const emulatorRef = useRef<GBEmulator | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);

  if (!emulatorRef.current) {
    emulatorRef.current = new GBEmulator();
  }

  useEffect(() => {
    const handleBeforeUnload = () => {
      const emu = emulatorRef.current;
      if (!emu) return;
      saveSRAMToLocalStorage(emu);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
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

  const handleLoadROM = async (file: File) => {
    const emu = emulatorRef.current;
    if (!emu) return;
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

  useEffect(() => {
    let rafId = 0;
    const CYCLES_PER_FRAME = 70224;

    const loop = () => {
      const emu = emulatorRef.current;
      if (emu && emu.isRunning() && !emu.isPaused()) {
        emu.runCycles(CYCLES_PER_FRAME);
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

  return (
    <div className="min-h-screen bg-slate-500 bg-linear-180 text-white sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="justify-center lg:col-span-2">
            {emulatorRef.current && (
              <GameBoyShell
                batteryOn={isRunning}
                onButtonDown={handleButtonDown}
                onButtonUp={handleButtonUp}
              >
                <GBScreen emulator={emulatorRef.current} />
              </GameBoyShell>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <EmuControllers
              onLoadROM={handleLoadROM}
              onStart={handleStart}
              onPause={handlePause}
              onReset={handleReset}
              onStep={handleStep}
              isLoaded={isLoaded}
              isRunning={isRunning}
            />
            {emulatorRef.current && isRunning && (
              <SpeedControl emulator={emulatorRef.current} />
            )}
            <DebugData emulator={emulatorRef.current} />
            <TileViewer emulator={emulatorRef.current} />
            <SpriteViewer emulator={emulatorRef.current} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
