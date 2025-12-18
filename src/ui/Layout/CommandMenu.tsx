import {
  Command,
  // CommandEmpty,
  CommandGroup,
  // CommandInput,
  CommandItem,
  CommandList,
  // CommandSeparator,
} from "@/components/ui/pixelact-ui/command";

interface CommandMenuStateProps {
  showOverlay: boolean;
  showDebugTools: boolean;
  showDpadDebug: boolean;
  fileName: string | null;
  speedMultiplier: number;
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
  onIncreaseSpeed: () => void;
  onDecreaseSpeed: () => void;
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
  } = state;

  const handleAction = (action: () => void) => {
    action();
    if (actions.onClose) {
      actions.onClose();
    }
  };

  return (
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
              <span className="min-w-10 text-center">{speedMultiplier}x</span>
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

        {/* <CommandSeparator /> */}

        <CommandGroup heading="Settings">
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
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
