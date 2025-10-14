import "./App.css";
import { useEffect, useRef, useState } from "react";
import { GBEmulator } from "./emulator/gbEmulator";
import { GBScreen } from "./ui/components/GBScreen";
import { EmuControllers } from "./ui/components/EmuControllers";
import { DebugData } from "./ui/components/DebugData";

function App() {
  const emulatorRef = useRef<GBEmulator | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");

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
    const loop = () => {
      const emu = emulatorRef.current;
      if (emu && emu.isRunning() && !emu.isPaused()) {
        for (let i = 0; i < 500; i++) {
          emu.step();
        }
        updateDebugInfo();
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 p-8 text-white">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <GBScreen />
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
