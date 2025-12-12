import {
  Command,
  // CommandEmpty,
  CommandGroup,
  // CommandInput,
  CommandItem,
  CommandList,
  // CommandSeparator,
} from "@/components/ui/pixelact-ui/command";

interface CommandMenuProps {
  onClose?: () => void;
  onLoadGame: () => void;
  onRestart: () => void;
  onToggleOverlay: () => void;
  onToggleDebugTools: () => void;
  onToggleDpadDebug: () => void;
  showOverlay: boolean;
  showDebugTools: boolean;
  showDpadDebug: boolean;
  fileName: string | null;
}

export const CommandMenu = ({
  onClose,
  onLoadGame,
  onRestart,
  onToggleOverlay,
  onToggleDebugTools,
  onToggleDpadDebug,
  showOverlay,
  showDebugTools,
  showDpadDebug,
  fileName,
}: CommandMenuProps) => {
  const handleAction = (action: () => void) => {
    action();
    if (onClose) {
      onClose();
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
            onSelect={() => handleAction(onLoadGame)}
          >
            Load game
          </CommandItem>
          <CommandItem
            value="restart-game"
            onSelect={() => handleAction(onRestart)}
          >
            Restart game
          </CommandItem>
        </CommandGroup>

        {/* <CommandSeparator /> */}

        <CommandGroup heading="Settings">
          <CommandItem
            value="toggle-overlay"
            onSelect={() => handleAction(onToggleOverlay)}
          >
            Overlay: {showOverlay ? "On" : "Off"}
          </CommandItem>
          <CommandItem
            value="toggle-debug-tools"
            onSelect={() => handleAction(onToggleDebugTools)}
          >
            Debug tools: {showDebugTools ? "Visible" : "Hidden"}
          </CommandItem>
          <CommandItem
            value="toggle-dpad-debug-visuals"
            onSelect={() => handleAction(onToggleDpadDebug)}
          >
            D-pad debug: {showDpadDebug ? "On" : "Off"}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
