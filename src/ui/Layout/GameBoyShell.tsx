import { useRef } from "react";
import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
  ReactNode,
} from "react";
import type { JoypadButton } from "../../emulator/input/joypad";
import type {
  ButtonCoordinates,
  CategoryId,
  CategoryCoordinates,
} from "@/hooks/useTouchControlLayout";
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

  isEditingLayout?: boolean;
  buttonLayout?: ButtonCoordinates;
  onLayoutChange?: (control: CategoryId, position: CategoryCoordinates) => void;
}

interface DraggableControlSlotProps {
  control: CategoryId;
  className: string;
  isEditing: boolean;
  position?: CategoryCoordinates;
  onPositionChange?: (
    control: CategoryId,
    position: CategoryCoordinates,
  ) => void;
  children: ReactNode;
}

const DraggableControlSlot = ({
  control,
  className,
  isEditing,
  position = { x: 0, y: 0 },
  onPositionChange,
  children,
}: DraggableControlSlotProps) => {
  const dragRef = useRef<{
    pointerId: number;
    initialPosition: CategoryCoordinates;
    startX: number;
    startY: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  } | null>(null);

  const updatePosition = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const stage = event.currentTarget.closest(".gameboy-stage");
    if (!drag || !stage || !onPositionChange) return;

    const stageRect = stage.getBoundingClientRect();
    const deltaX = ((event.clientX - drag.startX) / stageRect.width) * 100;
    const deltaY = ((event.clientY - drag.startY) / stageRect.height) * 100;

    onPositionChange(control, {
      x: Math.min(
        drag.maxX,
        Math.max(drag.minX, drag.initialPosition.x + deltaX),
      ),
      y: Math.min(
        drag.maxY,
        Math.max(drag.minY, drag.initialPosition.y + deltaY),
      ),
    });
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isEditing || !onPositionChange) return;

    const stage = event.currentTarget.closest(".gameboy-stage");
    if (!stage) return;

    const stageRect = stage.getBoundingClientRect();
    const controlRect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      initialPosition: position,
      startX: event.clientX,
      startY: event.clientY,
      minX:
        position.x +
        ((stageRect.left - controlRect.left) / stageRect.width) * 100,
      maxX:
        position.x +
        ((stageRect.right - controlRect.right) / stageRect.width) * 100,
      minY:
        position.y +
        ((stageRect.top - controlRect.top) / stageRect.height) * 100,
      maxY:
        position.y +
        ((stageRect.bottom - controlRect.bottom) / stageRect.height) * 100,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;

    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;

    event.preventDefault();
    event.stopPropagation();
  };

  const style = {
    "--touch-control-offset-x": `${position.x}cqw`,
    "--touch-control-offset-y": `${position.y}cqh`,
  } as CSSProperties;

  return (
    <div
      className={`${className} ${isEditing ? "gameboy-control-slot--editing" : ""}`}
      style={style}
      aria-label={isEditing ? `Drag ${control} control` : undefined}
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        updatePosition(event);
        event.preventDefault();
        event.stopPropagation();
      }}
      onPointerUpCapture={endDrag}
      onPointerCancelCapture={endDrag}
    >
      {children}
    </div>
  );
};

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
  isEditingLayout = false,
  buttonLayout = {},
  onLayoutChange,
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
          className="gameboy-fullscreen-button gb-slot--fullscreen"
          onClick={handleFullscreen}
          aria-label="Toggle fullscreen"
        >
          <Maximize2Icon className="h-full! w-full! text-gray-300" />
        </Button>

        <div
          className={`gameboy-battery-led gameboy-battery-led--overlay gb-slot--battery-led ${isBatteryOn ? "" : "gameboy-battery-led--off"}`}
        />

        <div className="gb-slot gb-slot-settings gb-slot--settings inline-flex">
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

        <div className="gb-slot gb-slot-screen gb-slot--screen">
          <div className="gameboy-screen-window">{children}</div>
        </div>

        {isEditingLayout && (
          <div className="gameboy-control-editing-notice" role="status">
            Drag the controls, then select Done in Input settings.
          </div>
        )}

        <DraggableControlSlot
          control="dpad"
          className="gb-slot gb-slot-dpad gb-slot--dpad"
          isEditing={isEditingLayout}
          position={buttonLayout.dpad}
          onPositionChange={onLayoutChange}
        >
          <GameboyDpad
            onButtonDown={onButtonDown}
            onButtonUp={onButtonUp}
            showDebugBounds={showDpadDebug}
          />
        </DraggableControlSlot>

        <DraggableControlSlot
          control="ab"
          className="gb-slot gb-slot-ab gb-slot--ab"
          isEditing={isEditingLayout}
          position={buttonLayout.ab}
          onPositionChange={onLayoutChange}
        >
          <GameboyActionButtons
            onButtonDown={onButtonDown}
            onButtonUp={onButtonUp}
          />
        </DraggableControlSlot>

        <DraggableControlSlot
          control="select-start"
          className="gb-slot gb-slot-select-start gb-slot--select-start"
          isEditing={isEditingLayout}
          position={buttonLayout["select-start"]}
          onPositionChange={onLayoutChange}
        >
          <GameboySelectButtons
            onButtonDown={onButtonDown}
            onButtonUp={onButtonUp}
          />
        </DraggableControlSlot>
      </div>
    </div>
  );
};
