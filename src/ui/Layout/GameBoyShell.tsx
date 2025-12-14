import type { ReactNode } from "react";
import type { JoypadButton } from "../../emulator/input/joypad";
import { SettingsIcon } from "lucide-react";
import { GameboyDpad } from "./Shell/GameboyDpad";
import { GameboyActionButtons } from "./Shell/GameboyActionButtons";
import { GameboySelectButtons } from "./Shell/GameboySelectButtons";
import "./GameBoyShell.css";

interface GameBoyShellProps {
  children: ReactNode;
  isBatteryOn: boolean;
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
  toggleCommandMenu?: () => void;
  showCommandMenu?: boolean;
  commandMenu?: ReactNode;
  showDpadDebug?: boolean;
}

export const GameBoyShell = ({
  children,
  isBatteryOn,
  onButtonDown,
  onButtonUp,
  toggleCommandMenu,
  showCommandMenu,
  commandMenu,
  showDpadDebug,
}: GameBoyShellProps) => {
  const handleFullscreen = () => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const isCoarsePointer =
      window.matchMedia?.("(pointer: coarse)").matches ?? false;
    const isNarrowViewport = window.innerWidth < 768;
    const isMobileLike = isCoarsePointer || isNarrowViewport;

    const fullscreenOnDesktop = document.querySelector(
      ".gameboy-screen-window",
    ) as HTMLElement | null;

    const fullscreenOnMobile = document.querySelector(
      ".gameboy-shell",
    ) as HTMLElement | null;

    const target = isMobileLike ? fullscreenOnMobile : fullscreenOnDesktop;
    if (!target) return;

    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      target.requestFullscreen?.();
    }
  };

  return (
    <div className="gameboy-shell">
      <div className="gameboy-shell-inner">
        <div className="gameboy-top-ridge">
          <span />
          <span />
          <div className="gameboy-top-ridge-bottom" />
        </div>
        {/* <div className="gameboy-top-ridge-left" />
          <div className="gameboy-top-ridge-right" /> */}
        <div className="gameboy-screen-area">
          <button
            type="button"
            className="gameboy-fullscreen-button"
            onClick={handleFullscreen}
            aria-label="Toggle fullscreen"
          >
            ⤢
          </button>

          <div className="gameboy-screen-header">
            <div className="gameboy-header-stripes">
              <span />
              <span />
            </div>
            <div className="gameboy-header-text">
              DOT MATRIX WITH STEREO SOUND
            </div>
            <div className="gameboy-header-stripes gameboy-header-stripes-right">
              <span />
              <span />
            </div>
          </div>

          <div className="gameboy-screen-shell">
            <div className="gameboy-battery">
              <div
                className={`gameboy-battery-led ${isBatteryOn ? "" : "gameboy-battery-led--off"}`}
              />
              <div className="gameboy-battery-label">BATTERY</div>
              <div className="relative inline-flex">
                <button
                  type="button"
                  className="gameboy-settings-button"
                  onClick={toggleCommandMenu}
                  aria-label="Open settings menu"
                >
                  <SettingsIcon className="h-3 w-3 text-gray-300" />
                </button>
                {showCommandMenu && commandMenu && (
                  <div className="absolute -top-35 z-500 ml-0 w-72 scale-70">
                    {commandMenu}
                  </div>
                )}
              </div>
            </div>

            <div className="gameboy-screen-window">{children}</div>
          </div>
        </div>

        <div className="gameboy-bottom-area">
          <div className="gameboy-controls-row">
            <GameboyDpad
              onButtonDown={onButtonDown}
              onButtonUp={onButtonUp}
              showDebugBounds={showDpadDebug}
            />

            <GameboyActionButtons
              onButtonDown={onButtonDown}
              onButtonUp={onButtonUp}
            />
          </div>

          <div className="gameboy-middle-row">
            <GameboySelectButtons
              onButtonDown={onButtonDown}
              onButtonUp={onButtonUp}
            />

            <div className="gameboy-speaker">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
