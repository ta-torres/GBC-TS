import {
  Command,
  // CommandEmpty,
  CommandGroup,
  // CommandInput,
  CommandItem,
  CommandList,
  // CommandSeparator,
} from "@/components/ui/pixelact-ui/command";
import { Dialog, DialogContent } from "@/components/ui/pixelact-ui/dialog";
import type { SlotInfo } from "@/emulator/types/emulator";

interface CommandMenuStateProps {
  showOverlay: boolean;
  showDebugTools: boolean;
  showDpadDebug: boolean;
  fileName: string | null;
  speedMultiplier: number;
  audioEnabled: boolean;
  audioChannels: {
    ch1: boolean;
    ch2: boolean;
    ch3: boolean;
    ch4: boolean;
  };
  slotInfo: SlotInfo[];
}

interface CommandMenuActionProps {
  onClose?: () => void;
  onLoadGame: () => void;
  onRestart: () => void;
  onExportSRAMSaves: () => void;
  onImportSRAMSaves: () => void;
  onToggleOverlay: () => void;
  onToggleDebugTools: () => void;
  onToggleDpadDebug: () => void;
  onToggleAudioEnabled: () => void;
  onToggleAudioChannel: (channel: "ch1" | "ch2" | "ch3" | "ch4") => void;
  onIncreaseSpeed: () => void;
  onDecreaseSpeed: () => void;
  onOpenAbout: () => void;
  onSaveState: (slot: number) => void;
  onLoadState: (slot: number) => void;
  onDeleteAllSaveStates: () => void;
}

interface CommandMenuProps {
  state: CommandMenuStateProps;
  actions: CommandMenuActionProps;
}

export const CommandMenu = ({ state, actions }: CommandMenuProps) => {
  const {
    showOverlay,
    showDebugTools,
    showDpadDebug,
    fileName,
    speedMultiplier,
    audioEnabled,
    audioChannels,
    slotInfo,
  } = state;

  // render command menu inside the screen/shell if in fullscreen, otherwise render in body
  const portalContainer =
    typeof document !== "undefined"
      ? (document.fullscreenElement as HTMLElement | null)
      : null;

  const handleAction = (action: () => void) => {
    action();
    if (actions.onClose) {
      actions.onClose();
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      actions.onClose?.();
    }
  };

  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <DialogContent
        portalContainer={portalContainer}
        className="w-[25vw] border-none bg-transparent p-0 shadow-none max-sm:w-[90vw] max-sm:translate-x-[-52%]"
      >
        <Command className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
          <CommandList>
            {fileName && (
              <div className="mt-1 text-xs text-gray-700">{fileName}</div>
            )}

            <CommandGroup heading="Game">
              <CommandItem
                value="load-game"
                onSelect={() => handleAction(actions.onLoadGame)}
              >
                Load
              </CommandItem>
              <CommandItem
                value="restart-game"
                onSelect={() => handleAction(actions.onRestart)}
              >
                Restart
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Save State">
              <div className="grid grid-cols-5 gap-1 px-2 py-1">
                {[1, 2, 3, 4, 5].map((slot) => {
                  const info = slotInfo.find((s) => s.slot === slot);
                  return (
                    <button
                      key={`save-${slot}`}
                      type="button"
                      className={`h-7 rounded text-xs text-white ${
                        info?.occupied
                          ? "bg-slate-700 hover:bg-slate-600"
                          : "bg-slate-500 hover:bg-slate-600"
                      }`}
                      title={
                        info?.savedAt
                          ? `Saved: ${new Date(info.savedAt).toLocaleString()}`
                          : `Empty slot ${slot}`
                      }
                      onClick={() =>
                        handleAction(() => actions.onSaveState(slot))
                      }
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </CommandGroup>

            <CommandGroup heading="Load State">
              <div className="grid grid-cols-5 gap-1 px-2 py-1">
                {[1, 2, 3, 4, 5].map((slot) => {
                  const info = slotInfo.find((s) => s.slot === slot);
                  const occupied = info?.occupied ?? false;
                  return (
                    <button
                      key={`load-${slot}`}
                      type="button"
                      disabled={!occupied}
                      className={`h-7 rounded text-xs text-white ${
                        occupied
                          ? "bg-slate-700 hover:bg-slate-600"
                          : "cursor-not-allowed bg-slate-400 opacity-50"
                      }`}
                      title={
                        info?.savedAt
                          ? `Saved: ${new Date(info.savedAt).toLocaleString()}`
                          : `Empty slot ${slot}`
                      }
                      onClick={() => {
                        if (occupied)
                          handleAction(() => actions.onLoadState(slot));
                      }}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </CommandGroup>

            <CommandGroup heading="Emulator">
              <div className="flex items-center justify-between rounded px-2 py-1.5 text-sm">
                <div className="flex items-center gap-1">
                  <span>Speed:</span>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded bg-slate-500 text-white hover:bg-slate-600"
                    onClick={actions.onDecreaseSpeed}
                  >
                    -
                  </button>
                  <span className="w-18 text-center">{speedMultiplier}x</span>
                  <button
                    type="button"
                    className="inline-flex h-6 w-6 items-center justify-center rounded bg-slate-500 text-white hover:bg-slate-600"
                    onClick={actions.onIncreaseSpeed}
                  >
                    +
                  </button>
                </div>
              </div>
            </CommandGroup>

            <CommandGroup heading="SRAM Savedata">
              <CommandItem
                value="export-sram-saves"
                onSelect={() => handleAction(actions.onExportSRAMSaves)}
              >
                Export
              </CommandItem>
              <CommandItem
                value="import-sram-saves"
                onSelect={() => handleAction(actions.onImportSRAMSaves)}
              >
                Import
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="Settings">
              <CommandItem
                value="toggle-audio-enabled"
                onSelect={() => handleAction(actions.onToggleAudioEnabled)}
              >
                Sound: {audioEnabled ? "On" : "Off"}
              </CommandItem>

              {audioEnabled && (
                <div className="mt-1 grid grid-cols-4 gap-2 px-2 pb-2">
                  <button
                    type="button"
                    className={`h-7 rounded text-xs text-white ${
                      audioChannels.ch1
                        ? "bg-slate-700 hover:bg-slate-600"
                        : "bg-slate-500 hover:bg-slate-600"
                    }`}
                    onClick={() => actions.onToggleAudioChannel("ch1")}
                  >
                    CH1
                  </button>
                  <button
                    type="button"
                    className={`h-7 rounded text-xs text-white ${
                      audioChannels.ch2
                        ? "bg-slate-700 hover:bg-slate-600"
                        : "bg-slate-500 hover:bg-slate-600"
                    }`}
                    onClick={() => actions.onToggleAudioChannel("ch2")}
                  >
                    CH2
                  </button>
                  <button
                    type="button"
                    className={`h-7 rounded text-xs text-white ${
                      audioChannels.ch3
                        ? "bg-slate-700 hover:bg-slate-600"
                        : "bg-slate-500 hover:bg-slate-600"
                    }`}
                    onClick={() => actions.onToggleAudioChannel("ch3")}
                  >
                    CH3
                  </button>
                  <button
                    type="button"
                    className={`h-7 rounded text-xs text-white ${
                      audioChannels.ch4
                        ? "bg-slate-700 hover:bg-slate-600"
                        : "bg-slate-500 hover:bg-slate-600"
                    }`}
                    onClick={() => actions.onToggleAudioChannel("ch4")}
                  >
                    CH4
                  </button>
                </div>
              )}

              <CommandItem
                value="toggle-overlay"
                onSelect={() => handleAction(actions.onToggleOverlay)}
              >
                Overlay: {showOverlay ? "On" : "Off"}
              </CommandItem>
              <CommandItem
                value="toggle-debug-tools"
                onSelect={() => handleAction(actions.onToggleDebugTools)}
              >
                {showDebugTools ? "Hide debug tools" : "Show debug tools"}
              </CommandItem>
              <CommandItem
                value="toggle-dpad-debug-visuals"
                onSelect={() => handleAction(actions.onToggleDpadDebug)}
              >
                D-pad debug: {showDpadDebug ? "On" : "Off"}
              </CommandItem>
              <CommandItem
                value="delete-all-save-states"
                onSelect={() => handleAction(actions.onDeleteAllSaveStates)}
              >
                Delete all save states
              </CommandItem>
            </CommandGroup>
            <CommandGroup heading="About">
              <CommandItem
                value="about"
                onSelect={() => handleAction(actions.onOpenAbout)}
              >
                About GBC-TS
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
