import type { GBEmulator } from "@/emulator/gbEmulator";
import { EmuControllers } from "./EmuControllers";
import { DebugData } from "./DebugData";
import { TileViewer } from "./TileViewer";
import { SpriteViewer } from "./SpriteViewer";
import { SpeedControl } from "./SpeedControl";

interface DebugPanelProps {
  visible: boolean;
  emulator: GBEmulator | null;
  isLoaded: boolean;
  isRunning: boolean;
  onLoadROM: (file: File) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
}

export const DebugPanel = ({
  visible,
  emulator,
  isLoaded,
  isRunning,
  onLoadROM,
  onStart,
  onPause,
  onReset,
  onStep,
}: DebugPanelProps) => {
  if (!visible) return null;

  return (
    <>
      <EmuControllers
        onLoadROM={onLoadROM}
        onStart={onStart}
        onPause={onPause}
        onReset={onReset}
        onStep={onStep}
        isLoaded={isLoaded}
        isRunning={isRunning}
      />
      {emulator && isRunning && <SpeedControl emulator={emulator} />}
      <DebugData emulator={emulator} />
      <TileViewer emulator={emulator} />
      <SpriteViewer emulator={emulator} />
    </>
  );
};
