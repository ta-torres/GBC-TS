import "./App.css";
import { useRef, useState, type ChangeEvent } from "react";
import { GBScreen } from "./ui/components/GBScreen";
import { DebugPanel } from "./ui/components/DebugPanel";
import { GameBoyShell } from "./ui/components/GameBoyShell";
import { CommandMenu } from "./ui/components/CommandMenu";
import { useGameBoyEmulator } from "./hooks/useGameBoyEmulator";

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [showDpadDebug, setShowDpadDebug] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const {
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
  } = useGameBoyEmulator();

  const handleRequestLoadRom = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastFileName(file.name);
    void handleLoadROM(file);
  };

  const toggleOverlay = () => {
    setShowOverlay((prev) => !prev);
  };

  const toggleDebugTools = () => {
    setShowDebugTools((prev) => !prev);
  };

  const toggleDpadDebug = () => {
    setShowDpadDebug((prev) => !prev);
  };

  const toggleCommandMenu = () => {
    setShowCommandMenu((prev) => !prev);
  };

  const closeCommandMenu = () => {
    setShowCommandMenu(false);
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
                  isBatteryOn={isRunning}
                  onButtonDown={handleButtonDown}
                  onButtonUp={handleButtonUp}
                  toggleCommandMenu={toggleCommandMenu}
                  showCommandMenu={showCommandMenu}
                  commandMenu={
                    <CommandMenu
                      state={{
                        showOverlay,
                        showDebugTools,
                        showDpadDebug,
                        fileName: lastFileName,
                      }}
                      actions={{
                        onClose: closeCommandMenu,
                        onLoadGame: handleRequestLoadRom,
                        onRestart: handleReset,
                        onToggleOverlay: toggleOverlay,
                        onToggleDebugTools: toggleDebugTools,
                        onToggleDpadDebug: toggleDpadDebug,
                      }}
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
              state={{
                showDebugTools,
                isLoaded,
                isRunning,
                fileName: lastFileName,
              }}
              actions={{
                onLoadROMClick: handleRequestLoadRom,
                onStart: handleStart,
                onPause: handlePause,
                onReset: handleReset,
                onStep: handleStep,
              }}
              emulator={emulatorRef.current}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
