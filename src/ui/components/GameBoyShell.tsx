import type { ReactNode } from "react";
import type { JoypadButton } from "../../emulator/input/joypad";
import { SettingsIcon } from "lucide-react";

interface GameBoyShellProps {
  children: ReactNode;
  batteryOn: boolean;
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
  onToggleSettings?: () => void;
  isCommandMenuOpen?: boolean;
  commandMenu?: ReactNode;
}

export const GameBoyShell = ({
  children,
  batteryOn,
  onButtonDown,
  onButtonUp,
  onToggleSettings,
  isCommandMenuOpen,
  commandMenu,
}: GameBoyShellProps) => {
  const handleFullscreen = () => {
    const container = document.querySelector(
      ".gameboy-screen-window",
    ) as HTMLElement | null;
    if (!container) return;

    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
      return;
    }

    if (container.requestFullscreen) {
      container.requestFullscreen();
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
            <div className="gameboy-dpad">
              <div className="dpad-vertical">
                <button
                  className="dpad-up"
                  type="button"
                  onMouseDown={() => onButtonDown("up")}
                  onMouseUp={() => onButtonUp("up")}
                  onMouseLeave={() => onButtonUp("up")}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    onButtonDown("up");
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    onButtonUp("up");
                  }}
                >
                  <label>{`^`}</label>
                </button>
                <button
                  className="dpad-down"
                  type="button"
                  onMouseDown={() => onButtonDown("down")}
                  onMouseUp={() => onButtonUp("down")}
                  onMouseLeave={() => onButtonUp("down")}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    onButtonDown("down");
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    onButtonUp("down");
                  }}
                >
                  <label>{`ˇ`}</label>
                </button>
              </div>
              <div className="dpad-horizontal">
                <button
                  className="dpad-left"
                  type="button"
                  onMouseDown={() => onButtonDown("left")}
                  onMouseUp={() => onButtonUp("left")}
                  onMouseLeave={() => onButtonUp("left")}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    onButtonDown("left");
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    onButtonUp("left");
                  }}
                >
                  <label>{`<`}</label>
                </button>
                <button
                  className="dpad-right"
                  type="button"
                  onMouseDown={() => onButtonDown("right")}
                  onMouseUp={() => onButtonUp("right")}
                  onMouseLeave={() => onButtonUp("right")}
                  onTouchStart={(e) => {
                    e.preventDefault();
                    onButtonDown("right");
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault();
                    onButtonUp("right");
                  }}
                >
                  <label>{`>`}</label>
                </button>
              </div>
              <div className="dpad-center" />
            </div>

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
