import { useState } from "react";
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/pixelact-ui/command";
import { Card } from "@/components/ui/pixelact-ui/card";
import {
  Dialog,
  DialogOverlay,
  DialogTitle,
} from "@/components/ui/pixelact-ui/dialog";
import type { SlotInfo } from "@/emulator/types/emulator";
import type { LayoutOrientation } from "@/hooks/useTouchControlLayout";
import { SiGithub } from "@icons-pack/react-simple-icons";
import { useGamepadDebugInfo } from "@/input/useGamepadDebugInfo";
import type { InputState } from "@/input/types";
import {
  DMG_COLOR_PALETTE_OPTIONS,
  type DmgColorPalette,
} from "@/emulator/ppu/palettes";

type MenuView =
  | "main"
  | "emulator-settings"
  | "input-settings"
  | "display-settings"
  | "about";

const CloseButton = ({ onClose }: { onClose?: () => void }) => (
  <button
    type="button"
    className="absolute top-4 right-4 z-10 cursor-pointer opacity-70 transition-opacity hover:opacity-100"
    onClick={onClose}
    aria-label="Close menu"
  >
    <span className="text-xl">X</span>
  </button>
);

const BackButton = ({ onBack }: { onBack: () => void }) => (
  <button
    type="button"
    className="cursor-pointer text-xs text-gray-700 hover:text-gray-900"
    onClick={onBack}
  >
    {"< Back"}
  </button>
);

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
  isEditingLayout: boolean;
  touchControlOrientation: LayoutOrientation;
  dmgColorPalette: DmgColorPalette;
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
  onSaveState: (slot: number) => void;
  onLoadState: (slot: number) => void;
  onDeleteAllSaveStates: () => void;
  onSetLayoutEditing: (isEditingLayout: boolean) => void;
  onResetTouchControls: () => void;
  onSetDMGColorPalette: (palette: DmgColorPalette) => void;
}

interface CommandMenuProps {
  state: CommandMenuStateProps;
  actions: CommandMenuActionProps;
}

const GB_BUTTON_LABELS: { key: keyof InputState; label: string }[] = [
  { key: "up", label: "↑" },
  { key: "down", label: "↓" },
  { key: "left", label: "←" },
  { key: "right", label: "→" },
  { key: "a", label: "A" },
  { key: "b", label: "B" },
  { key: "start", label: "Start" },
  { key: "select", label: "Select" },
];

const ControllerDebugPanel = () => {
  const info = useGamepadDebugInfo();

  return (
    <div className="space-y-2 px-2 py-1 text-xs text-gray-800">
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${
            info.connected ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span>
          {info.connected ? "Controller connected" : "No controller detected"}
        </span>
      </div>

      {!info.connected && (
        <p className="text-[0.65rem] text-gray-600">
          Connect a controller and press any button to test it.
        </p>
      )}

      {info.connected && (
        <>
          <div
            className="truncate text-[0.65rem] text-gray-600"
            title={info.id ?? undefined}
          >
            {info.id}
          </div>

          <div className="text-[0.65rem] text-gray-600">
            Mapping:{" "}
            <span
              className={
                info.mapping === "standard"
                  ? "text-green-700"
                  : "text-amber-700"
              }
            >
              {info.mapping}
            </span>
            {info.mapping !== "standard" && (
              <span className="ml-1">(buttons may not map correctly)</span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-1 pt-1">
            {GB_BUTTON_LABELS.map(({ key, label }) => (
              <div
                key={key}
                className={`flex h-6 items-center justify-center rounded text-[0.65rem] text-white transition-colors ${
                  info.mappedButtons[key] ? "bg-green-600" : "bg-slate-600"
                }`}
              >
                {label}
              </div>
            ))}
          </div>

          {info.axes.length > 0 && (
            <div className="pt-1">
              <div className="text-[0.65rem] text-gray-600">Axes</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                {info.axes.map((axis, i) => (
                  <div key={i} className="text-[0.6rem] text-gray-700">
                    A{i}: {axis.toFixed(2)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

const renderMenuView = (
  activeView: MenuView,
  state: CommandMenuStateProps,
  actions: CommandMenuActionProps,
  setActiveView: (view: MenuView) => void,
  handleAction: (action: () => void) => void,
) => {
  const {
    showOverlay,
    showDebugTools,
    showDpadDebug,
    fileName,
    speedMultiplier,
    audioEnabled,
    audioChannels,
    slotInfo,
    isEditingLayout,
    touchControlOrientation,
    dmgColorPalette,
  } = state;

  if (activeView === "display-settings") {
    return (
      <Card className="border-none bg-slate-400 p-0 shadow-none">
        <div className="relative">
          <CloseButton onClose={actions.onClose} />
          <Command className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
            <div className="mb-2 flex items-center gap-2 pr-6">
              <BackButton onBack={() => setActiveView("main")} />
              <span className="text-xs text-gray-600">/ Display</span>
            </div>
            <CommandList>
              <CommandGroup heading="Game Boy Palette">
                {DMG_COLOR_PALETTE_OPTIONS.map((palette) => (
                  <CommandItem
                    key={palette}
                    value={`dmg-palette-${palette}`}
                    onSelect={() =>
                      handleAction(() => actions.onSetDMGColorPalette(palette))
                    }
                  >
                    {palette}
                    {palette === dmgColorPalette ? " (Active)" : ""}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Card>
    );
  }

  if (activeView === "emulator-settings") {
    return (
      <Card className="border-none bg-slate-400 p-0 shadow-none">
        <div className="relative">
          <CloseButton onClose={actions.onClose} />

          <Command className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
            <div className="mb-2 flex items-center gap-2 pr-6">
              <BackButton onBack={() => setActiveView("main")} />
              <span className="text-xs text-gray-600">/ Emulator </span>
            </div>
            <CommandList>
              <CommandGroup heading="Battery Saves (SRAM)">
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

              <CommandGroup heading="Debug">
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

              <CommandGroup heading="Save States">
                <CommandItem
                  value="delete-all-save-states"
                  onSelect={() => handleAction(actions.onDeleteAllSaveStates)}
                >
                  Delete all save states
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Card>
    );
  }

  if (activeView === "input-settings") {
    return (
      <Card className="border-none bg-slate-400 p-0 shadow-none">
        <div className="relative">
          <CloseButton onClose={actions.onClose} />
          <Command className="border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
            <div className="mb-2 flex items-center gap-2 pr-6">
              <BackButton onBack={() => setActiveView("main")} />
              <span className="text-xs text-gray-600">/ Input </span>
            </div>
            <CommandList>
              <CommandGroup heading="Touch">
                <CommandItem
                  value="toggle-touch-control-editing"
                  onSelect={() =>
                    handleAction(() =>
                      actions.onSetLayoutEditing(!isEditingLayout),
                    )
                  }
                >
                  {isEditingLayout
                    ? "Done editing layout"
                    : "Edit button layout"}
                </CommandItem>
                <CommandItem
                  value="reset-touch-control-layout"
                  onSelect={() => handleAction(actions.onResetTouchControls)}
                >
                  Reset {touchControlOrientation} layout
                </CommandItem>
              </CommandGroup>
              <CommandGroup heading="Controller">
                <ControllerDebugPanel />
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      </Card>
    );
  }

  if (activeView === "about") {
    return (
      <Card className="border-none bg-slate-400 p-0 shadow-none">
        <div className="relative">
          <CloseButton onClose={actions.onClose} />
          <Command className="gap-4 border-r-4 border-b-4 border-slate-500 bg-slate-400 p-4">
            <div className="mb-2 flex items-center gap-2 pr-6">
              <BackButton onBack={() => setActiveView("main")} />
              <span className="text-xs text-gray-600">/ About </span>
            </div>

            <Dialog>
              <DialogTitle className="text-muted-foreground text-center">
                About
              </DialogTitle>
            </Dialog>
            <div className="text-sm text-gray-800">
              <p>
                GBC-TS is an open-source Game Boy and Game Boy Color emulator
              </p>
            </div>

            <div className="text-sm text-gray-800">
              <p>To play, load a game backup in a .gb, .gbc or .zip format</p>
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
          </Command>
        </div>
      </Card>
    );
  }

  return (
    <Card className="border-none bg-slate-400 p-0 shadow-none">
      <div className="relative">
        <CloseButton onClose={actions.onClose} />
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

              <CommandItem
                value="toggle-audio-enabled"
                onSelect={() => handleAction(actions.onToggleAudioEnabled)}
              >
                Sound: {audioEnabled ? "On" : "Off"}
              </CommandItem>

              {audioEnabled && (
                <div className="mt-1 grid grid-cols-4 gap-2 px-2 pb-2">
                  {(["ch1", "ch2", "ch3", "ch4"] as const).map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      className={`h-7 rounded text-xs text-white ${
                        audioChannels[ch]
                          ? "bg-slate-700 hover:bg-slate-600"
                          : "bg-slate-500 hover:bg-slate-600"
                      }`}
                      onClick={() => actions.onToggleAudioChannel(ch)}
                    >
                      {ch.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </CommandGroup>

            <CommandGroup heading="Settings">
              <CommandItem
                value="emulator-settings"
                onSelect={() => setActiveView("emulator-settings")}
              >
                Emulator {">"}
              </CommandItem>
              <CommandItem
                value="input-settings"
                onSelect={() => setActiveView("input-settings")}
              >
                Input {">"}
              </CommandItem>
              <CommandItem
                value="display-settings"
                onSelect={() => setActiveView("display-settings")}
              >
                Display {">"}
              </CommandItem>
            </CommandGroup>

            <CommandGroup heading="About">
              <CommandItem
                value="about"
                onSelect={() => setActiveView("about")}
              >
                About GBC-TS {">"}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </Card>
  );
};

export const CommandMenu = ({ state, actions }: CommandMenuProps) => {
  const [activeView, setActiveView] = useState<MenuView>("main");

  const handleAction = (action: () => void) => {
    action();
    actions.onClose?.();
  };

  return (
    <>
      <Dialog>
        <DialogOverlay
          className="animate-in fade-in-0 z-40 duration-200"
          onClick={actions.onClose}
        />
      </Dialog>
      <div className="animate-in fade-in-0 zoom-in-95 h-[25vh] w-[25vw] max-w-sm translate-x-[-20%] translate-y-[10%] border-none bg-transparent p-0 shadow-none duration-200 max-sm:w-[90vw] max-sm:translate-x-[-15%] max-sm:translate-y-[100%] max-sm:scale-140 md:max-w-md md:min-w-sm">
        {renderMenuView(
          activeView,
          state,
          actions,
          setActiveView,
          handleAction,
        )}
      </div>
    </>
  );
};
