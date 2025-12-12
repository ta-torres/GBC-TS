import type { ReactNode } from "react";
import type { JoypadButton } from "../../emulator/input/joypad";
import { SettingsIcon } from "lucide-react";
import { VirtualDpad } from "./VirtualDpad";

interface GameBoyShellProps {
  children: ReactNode;
  batteryOn: boolean;
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
  onToggleSettings?: () => void;
  isCommandMenuOpen?: boolean;
  commandMenu?: ReactNode;
  showDpadDebug?: boolean;
}

export const GameBoyShell = ({
  children,
  batteryOn,
  onButtonDown,
  onButtonUp,
  onToggleSettings,
  isCommandMenuOpen,
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
                className={`gameboy-battery-led ${batteryOn ? "" : "gameboy-battery-led--off"}`}
              />
              <div className="gameboy-battery-label">BATTERY</div>
              <div className="relative inline-flex">
                <button
                  type="button"
                  className="gameboy-settings-button"
                  onClick={onToggleSettings}
                  aria-label="Open settings menu"
                >
                  <SettingsIcon className="h-3 w-3 text-gray-300" />
                </button>
                {isCommandMenuOpen && commandMenu && (
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
            <VirtualDpad
              onButtonDown={onButtonDown}
              onButtonUp={onButtonUp}
              showDebugBounds={showDpadDebug}
            />

            <div className="gameboy-ab-buttons">
              <button
                type="button"
                className="gameboy-button gameboy-button-a"
                onMouseDown={() => onButtonDown("a")}
                onMouseUp={() => onButtonUp("a")}
                onMouseLeave={() => onButtonUp("a")}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onButtonDown("a");
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onButtonUp("a");
                }}
              >
                <label className="a-label">X</label>
                <span>A</span>
              </button>
              <button
                type="button"
                className="gameboy-button gameboy-button-b"
                onMouseDown={() => onButtonDown("b")}
                onMouseUp={() => onButtonUp("b")}
                onMouseLeave={() => onButtonUp("b")}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onButtonDown("b");
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onButtonUp("b");
                }}
              >
                <label className="b-label">Z</label>
                <span>B</span>
              </button>
            </div>
          </div>

          <div className="gameboy-middle-row">
            <div className="gameboy-select-start">
              <button
                type="button"
                className="gameboy-pill gameboy-pill-select"
                onMouseDown={() => onButtonDown("select")}
                onMouseUp={() => onButtonUp("select")}
                onMouseLeave={() => onButtonUp("select")}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onButtonDown("select");
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onButtonUp("select");
                }}
              >
                <label>Shift</label>
                <span>SELECT</span>
              </button>
              <button
                type="button"
                className="gameboy-pill gameboy-pill-start"
                onMouseDown={() => onButtonDown("start")}
                onMouseUp={() => onButtonUp("start")}
                onMouseLeave={() => onButtonUp("start")}
                onTouchStart={(e) => {
                  e.preventDefault();
                  onButtonDown("start");
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  onButtonUp("start");
                }}
              >
                <label>Enter</label>
                <span>START</span>
              </button>
            </div>

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
