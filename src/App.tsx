import "./App.css";
import { useEffect, useRef, useState } from "react";
import { GBEmulator } from "./emulator/gbEmulator";
import type { JoypadButton } from "./emulator/input/joypad";
import { GBScreen } from "./ui/components/GBScreen";
import { EmuControllers } from "./ui/components/EmuControllers";
import { DebugData } from "./ui/components/DebugData";
import { TileViewer } from "./ui/components/TileViewer";
import { SpriteViewer } from "./ui/components/SpriteViewer";

function App() {
  const emulatorRef = useRef<GBEmulator | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const lastDebugUpdateRef = useRef<number>(0);

  if (!emulatorRef.current) {
    emulatorRef.current = new GBEmulator();
  }

  const updateDebugInfo = () => {
    const emu = emulatorRef.current;
    if (!emu) return;
    setDebugInfo(emu.getCPUState());
  };

  const handleLoadROM = async (file: File) => {
    const emu = emulatorRef.current;
    if (!emu) return;
    const ok = await emu.loadROM(file);
    setIsLoaded(ok);
    if (ok) updateDebugInfo();
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
    emu.reset();
    setIsRunning(false);
    updateDebugInfo();
  };

  const handleStep = () => {
    const emu = emulatorRef.current;
    if (!emu || !isLoaded) return;
    emu.stepInstruction();
    updateDebugInfo();
  };

  useEffect(() => {
    let rafId = 0;
    const CYCLES_PER_FRAME = 70224;

    const loop = () => {
      const emu = emulatorRef.current;
      if (emu && emu.isRunning() && !emu.isPaused()) {
        emu.runCycles(CYCLES_PER_FRAME);

        const now = performance.now();
        if (now - lastDebugUpdateRef.current > 250) {
          lastDebugUpdateRef.current = now;
          updateDebugInfo();
        }
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
      KeyZ: "a",
      KeyX: "b",
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
    <div className="min-h-screen bg-gray-900 p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {emulatorRef.current && <GBScreen emulator={emulatorRef.current} />}
          </div>
          <div className="space-y-4">
            <EmuControllers
              onLoadROM={handleLoadROM}
              onStart={handleStart}
              onPause={handlePause}
              onReset={handleReset}
              onStep={handleStep}
              isLoaded={isLoaded}
              isRunning={isRunning}
            />
            <DebugData info={debugInfo} />
            <TileViewer emulator={emulatorRef.current} />
            <SpriteViewer emulator={emulatorRef.current} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
