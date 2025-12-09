import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/pixelact-ui/command";

interface CommandMenuProps {
  onClose?: () => void;
  onLoadGame: () => void;
  onRestart: () => void;
  onToggleOverlay: () => void;
  onToggleDebugTools: () => void;
  showOverlay: boolean;
  showDebugTools: boolean;
}

export const CommandMenu = ({
  onClose,
  onLoadGame,
  onRestart,
  onToggleOverlay,
  onToggleDebugTools,
  showOverlay,
  showDebugTools,
}: CommandMenuProps) => {
  const handleAction = (action: () => void) => {
    action();
    if (onClose) {
      onClose();
    }
  };

  return (
    <Command>
      <CommandInput placeholder="Type a command..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

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

        <CommandSeparator />

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
        </CommandGroup>
      </CommandList>
    </Command>
  );
};
