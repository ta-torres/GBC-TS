import type { GBEmulator } from "@/emulator/gbEmulator";
import { EmuControllers } from "../Debug/EmuControllers";
import { DebugData } from "../Debug/DebugData";
import { TileViewer } from "../Debug/TileViewer";
import { SpriteViewer } from "../Debug/SpriteViewer";
import { SpeedControl } from "../Debug/SpeedControl";

interface DebugPanelStateProps {
  showDebugTools: boolean;
  isLoaded: boolean;
  isRunning: boolean;
  fileName: string | null;
}

interface DebugPanelActionProps {
  onLoadROMClick: () => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
}

interface DebugPanelProps {
  state: DebugPanelStateProps;
  actions: DebugPanelActionProps;
  emulator: GBEmulator | null;
}

export const DebugPanel = ({ state, actions, emulator }: DebugPanelProps) => {
  const { showDebugTools, isLoaded, isRunning, fileName } = state;
  const { onLoadROMClick, onStart, onPause, onReset, onStep } = actions;

  if (!showDebugTools) return null;

  return (
    <>
      <EmuControllers
        onLoadROMClick={onLoadROMClick}
        fileName={fileName}
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
