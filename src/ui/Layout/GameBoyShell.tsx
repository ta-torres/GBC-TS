import type { ReactNode } from "react";
import type { JoypadButton } from "../../emulator/input/joypad";
import { Maximize2Icon, SettingsIcon } from "lucide-react";
import { GameboyDpad } from "./Shell/GameboyDpad";
import { GameboyActionButtons } from "./Shell/GameboyActionButtons";
import { GameboySelectButtons } from "./Shell/GameboySelectButtons";
import "./GameBoyShell.css";
import { Button } from "@/components/ui/pixelact-ui/button";

import shellImageUrl from "./Shell/GameBoy.png?url";
import shellFullscreenImageUrl from "./Shell/GameBoy-Fullscreen.png?url";

const SHELL_IMAGE_URL = shellImageUrl;
const SHELL_FULLSCREEN_IMAGE_URL = shellFullscreenImageUrl;

type LayoutRect = {
  left: number;
  top: number;
  width?: number | "auto";
  height?: number | "auto";
  translateX?: number;
  translateY?: number;
  rotateDeg?: number;
};

const rectStyle = (rect: LayoutRect) => {
  const style: Record<string, string> = {
    left: `${rect.left}%`,
    top: `${rect.top}%`,
  };

  if (typeof rect.width === "number") {
    style.width = `${rect.width}%`;
  }

  if (typeof rect.height === "number") {
    style.height = `${rect.height}%`;
  }

  const translateX = rect.translateX ?? 0;
  const translateY = rect.translateY ?? 0;
  const rotateDeg = rect.rotateDeg ?? 0;
  if (translateX !== 0 || translateY !== 0 || rotateDeg !== 0) {
    style.transform = `translate(${translateX}px, ${translateY}px) rotate(${rotateDeg}deg)`;
  }

  return style;
};

const DEFAULT_LAYOUT = {
  screen: { left: 24, top: 12.9, width: 55, height: "auto" },
  fullscreen: { left: 86, top: 9.5 },
  dpad: { left: 12, top: 58 },
  ab: { left: 64, top: 55, rotateDeg: 45 },
  selectStart: { left: 20, top: 82, rotateDeg: -25 },
  batteryLed: { left: 12.3, top: 22 },
  settings: { left: 11.5, top: 15 },
} satisfies Record<string, LayoutRect>;

interface GameBoyShellProps {
  children: ReactNode;
  isBatteryOn: boolean;
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
  toggleCommandMenu?: () => void;
  showCommandMenu?: boolean;
  commandMenu?: ReactNode;
  showDpadDebug?: boolean;
  speedMultiplier?: number;
  onIncreaseSpeed?: () => void;
  onDecreaseSpeed?: () => void;
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
  speedMultiplier = 1,
  onIncreaseSpeed,
  onDecreaseSpeed,
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
    <div className="gameboy-shell gameboy-shell--image">
      <div className="gameboy-stage" role="presentation">
        <img
          className="gameboy-shell-bg gameboy-shell-bg--normal"
          src={SHELL_IMAGE_URL}
          alt="Game Boy shell"
          draggable={false}
        />

        <img
          className="gameboy-shell-bg gameboy-shell-bg--fullscreen"
          src={SHELL_FULLSCREEN_IMAGE_URL}
          alt="Game Boy shell (fullscreen)"
          draggable={false}
        />

        <Button
          variant="default"
          className="gameboy-fullscreen-button"
          onClick={handleFullscreen}
          aria-label="Toggle fullscreen"
          style={rectStyle(DEFAULT_LAYOUT.fullscreen)}
        >
          <Maximize2Icon className="h-full! w-full! text-gray-300" />
        </Button>

        <div
          className={`gameboy-battery-led gameboy-battery-led--overlay ${isBatteryOn ? "" : "gameboy-battery-led--off"}`}
          style={rectStyle(DEFAULT_LAYOUT.batteryLed)}
        />

        <div
          className="gb-slot gb-slot-settings inline-flex"
          style={rectStyle(DEFAULT_LAYOUT.settings)}
        >
          <div className="relative inline-flex">
            <Button
              variant="default"
              className="gameboy-settings-button"
              onClick={toggleCommandMenu}
              aria-label="Open settings menu"
            >
              <SettingsIcon className="h-full! w-full! text-gray-300" />
            </Button>
            {showCommandMenu && commandMenu && (
              <div className="absolute -top-15 z-500 ml-0 w-72 scale-70 max-sm:-top-10 max-sm:left-5">
                {commandMenu}
              </div>
            )}
            <div className="speed-button-wrapper flex w-20 justify-end">
              {speedMultiplier > 1 && (
                <Button
                  variant="default"
                  className="speed-button"
                  onClick={onDecreaseSpeed}
                  aria-label="Decrease speed"
                >
                  -
                </Button>
              )}
              <Button
                variant="default"
                className="speed-button"
                onClick={onIncreaseSpeed}
                aria-label="Increase speed"
              >
                +
              </Button>
            </div>
          </div>
        </div>

        <div
          className="gb-slot gb-slot-screen"
          style={rectStyle(DEFAULT_LAYOUT.screen)}
        >
          <div className="gameboy-screen-window">{children}</div>
        </div>

        <div
          className="gb-slot gb-slot-dpad"
          style={rectStyle(DEFAULT_LAYOUT.dpad)}
        >
          <GameboyDpad
            onButtonDown={onButtonDown}
            onButtonUp={onButtonUp}
            showDebugBounds={showDpadDebug}
          />
        </div>

        <div
          className="gb-slot gb-slot-ab"
          style={rectStyle(DEFAULT_LAYOUT.ab)}
        >
          <GameboyActionButtons
            onButtonDown={onButtonDown}
            onButtonUp={onButtonUp}
          />
        </div>

        <div
          className="gb-slot gb-slot-select-start"
          style={rectStyle(DEFAULT_LAYOUT.selectStart)}
        >
          <GameboySelectButtons
            onButtonDown={onButtonDown}
            onButtonUp={onButtonUp}
          />
        </div>
      </div>
    </div>
  );
};
