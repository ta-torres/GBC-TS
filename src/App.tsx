import "./App.css";
import { useRef, useState, type ChangeEvent } from "react";
import { GBScreen } from "./ui/Layout/Shell/GameboyScreen";
import { DebugPanel } from "./ui/Layout/DebugPanel";
import { GameBoyShell } from "./ui/Layout/GameBoyShell";
import { CommandMenu } from "./ui/Layout/CommandMenu";
import { useGBCEmulator } from "./hooks/useGBCEmulator";
import {
  exportSRAMSavesToFile,
  importSRAMSavesFromFile,
} from "./emulator/utils/savesTransfer";

import { Toaster } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  //DialogDescription,
  //DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/pixelact-ui/dialog";
import { SiGithub } from "@icons-pack/react-simple-icons";

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const sramImportInputRef = useRef<HTMLInputElement | null>(null);
  const [showDebugTools, setShowDebugTools] = useState(false);
  const [showDpadDebug, setShowDpadDebug] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const [showCommandMenu, setShowCommandMenu] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lastFileName, setLastFileName] = useState<string | null>(null);
  const {
    emulatorRef,
    isLoaded,
    isRunning,
    speedMultiplier,
    handleIncreaseSpeed,
    handleDecreaseSpeed,
    handleButtonDown,
    handleButtonUp,
    handleLoadROM,
    handleStart,
    handlePause,
    handleReset,
    handleStep,
    handleStepFrame,
    handleSRAMSave,
  } = useGBCEmulator();

  const handleRequestLoadRom = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLastFileName(file.name);
    void handleLoadROM(file);
  };

  const handleExportSRAMSaves = () => {
    if (typeof window === "undefined") return;

    handleSRAMSave();

    try {
      exportSRAMSavesToFile();
    } catch (error) {
      console.error("Failed to export SRAM saves", error);
    }
  };

  const handleImportSRAMSaves = () => {
    sramImportInputRef.current?.click();
  };

  const loadCurrentSRAMFromLocalStorage = () => {
    const emu = emulatorRef.current;
    if (!emu || typeof window === "undefined") return;
    const saveKey = emu.getSaveKey();
    if (!saveKey) return;

    try {
      const raw = window.localStorage.getItem(saveKey);
      if (!raw) return;
      const decoded = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      emu.loadSRAMSnapshot(decoded);
    } catch (error) {
      console.error("Failed to load SRAM from localStorage", error);
    }
  };

  const handleImportSRAMFileChange = async (
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || typeof window === "undefined") return;

    try {
      await importSRAMSavesFromFile(file);

      loadCurrentSRAMFromLocalStorage();
    } catch (error) {
      console.error("Failed to import SRAM saves", error);
    }
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

  const handleOpenAbout = () => {
    setAboutOpen(true);
  };

  return (
    <div className="app-emulator-container min-h-screen bg-slate-500 bg-linear-180 text-white sm:p-8">
      <Toaster />

      <div className="mx-auto max-w-6xl">
        <input
          ref={fileInputRef}
          type="file"
          accept=".gb,.gbc"
          onChange={handleFileChange}
          className="hidden"
        />
        <input
          ref={sramImportInputRef}
          type="file"
          accept="application/json,.json"
          onChange={handleImportSRAMFileChange}
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
                        speedMultiplier,
                      }}
                      actions={{
                        onClose: closeCommandMenu,
                        onLoadGame: handleRequestLoadRom,
                        onRestart: handleReset,
                        onExportSRAMSaves: handleExportSRAMSaves,
                        onImportSRAMSaves: handleImportSRAMSaves,
                        onToggleOverlay: toggleOverlay,
                        onToggleDebugTools: toggleDebugTools,
                        onToggleDpadDebug: toggleDpadDebug,
                        onIncreaseSpeed: handleIncreaseSpeed,
                        onDecreaseSpeed: handleDecreaseSpeed,
                        onOpenAbout: handleOpenAbout,
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
                onStepFrame: handleStepFrame,
              }}
              emulator={emulatorRef.current}
            />
          </div>
        </div>
      </div>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="border-slate-500 bg-slate-400 max-sm:w-[90vw] max-sm:translate-x-[-51%] max-sm:translate-y-[-55%]">
          <DialogHeader>
            <DialogTitle className="text-muted-foreground">About</DialogTitle>
          </DialogHeader>

          <div className="text-sm text-gray-800">
            <p>GBC-TS is an open-source Game Boy and Game Boy Color emulator</p>
          </div>

          <div className="text-sm text-gray-800">
            <p>Developed by Thomás. Built with TypeScript and React.</p>
          </div>

          <div className="flex items-center gap-2 text-[0.70rem]">
            <SiGithub />
            <a
              className="text-primary underline underline-offset-4"
              href="https://github.com/ta-torres/GBC-TS"
              target="_blank"
              rel="noreferrer"
            >
              https://github.com/ta-torres/GBC-TS
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default App;
