import "./App.css";
import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { GBEmulator } from "./emulator/gbEmulator";
import type { JoypadButton } from "./emulator/input/joypad";
import { GBScreen } from "./ui/components/GBScreen";
import { DebugPanel } from "./ui/components/DebugPanel";
import { GameBoyShell } from "./ui/components/GameBoyShell";
import { CommandMenu } from "./ui/components/CommandMenu";

function App() {
  const emulatorRef = useRef<GBEmulator | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [showDpadDebug, setShowDpadDebug] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [lastFileName, setLastFileName] = useState<string | null>(null);

  if (!emulatorRef.current) {
    emulatorRef.current = new GBEmulator();
  }

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

  const handleRequestLoadRom = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastFileName(file.name);
    void handleLoadROM(file);
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

  const toggleCommandMenu = () => {
    setIsCommandMenuOpen((prev) => !prev);
  };

  const closeCommandMenu = () => {
    setIsCommandMenuOpen(false);
  };

  return (
    <div className="app-emulator-container min-h-screen bg-slate-500 bg-linear-180 text-white sm:p-8">
      <div className="mx-auto max-w-6xl">
        <input
          ref={fileInputRef}
          type="file"
          accept=".gb,.gbc"
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="app-touch-surface relative justify-center lg:col-span-2">
            {emulatorRef.current && (
              <>
                <GameBoyShell
                  batteryOn={isRunning}
                  onButtonDown={handleButtonDown}
                  onButtonUp={handleButtonUp}
                  onToggleSettings={toggleCommandMenu}
                  isCommandMenuOpen={isCommandMenuOpen}
                  commandMenu={
                    <CommandMenu
                      onClose={closeCommandMenu}
                      onLoadGame={handleRequestLoadRom}
                      onRestart={handleReset}
                      onToggleOverlay={() => setShowOverlay((prev) => !prev)}
                      onToggleDebugTools={() =>
                        setShowDebugTools((prev) => !prev)
                      }
                      onToggleDpadDebug={() =>
                        setShowDpadDebug((prev) => !prev)
                      }
                      showOverlay={showOverlay}
                      showDebugTools={showDebugTools}
                      showDpadDebug={showDpadDebug}
                      fileName={lastFileName}
                    />
                  }
                  showDpadDebug={showDpadDebug}
                >
                  <GBScreen
                    emulator={emulatorRef.current}
                    showOverlay={showOverlay}
                  />
                </GameBoyShell>
              </>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <DebugPanel
              visible={showDebugTools}
              emulator={emulatorRef.current}
              isLoaded={isLoaded}
              isRunning={isRunning}
              onLoadROMClick={handleRequestLoadRom}
              fileName={lastFileName}
              onStart={handleStart}
              onPause={handlePause}
              onReset={handleReset}
              onStep={handleStep}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
