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
}

interface CommandMenuProps {
  state: CommandMenuStateProps;
  actions: CommandMenuActionProps;
}

export const CommandMenu = ({ state, actions }: CommandMenuProps) => {
  const { showOverlay, showDebugTools, showDpadDebug, fileName } = state;

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
            Load game
          </CommandItem>
          <CommandItem
            value="restart-game"
            onSelect={() => handleAction(actions.onRestart)}
          >
            Restart game
          </CommandItem>
        </CommandGroup>

        <CommandGroup heading="Saves">
          <CommandItem
            value="export-sram-saves"
            onSelect={() => handleAction(actions.onExportSRAMSaves)}
          >
            Export SRAM saves
          </CommandItem>
          <CommandItem
            value="import-sram-saves"
            onSelect={() => handleAction(actions.onImportSRAMSaves)}
          >
            Import SRAM saves
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
            Debug tools: {showDebugTools ? "Visible" : "Hidden"}
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
