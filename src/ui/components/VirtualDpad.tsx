import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { JoypadButton } from "../../emulator/input/joypad";

interface VirtualDpadProps {
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
}

export const VirtualDpad = ({ onButtonDown, onButtonUp }: VirtualDpadProps) => {
  const dpadElementRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dpadCenterPointRef = useRef<{ x: number; y: number } | null>(null);
  const activeDirectionButtonRef = useRef<JoypadButton | null>(null);
  const [activeDirection, setActiveDirection] = useState<JoypadButton | null>(
    null,
  );

  const DEADZONE_RADIUS_PX = 16;

  const updateDirectionFromCoordinates = (x: number, y: number) => {
    const centerPoint = dpadCenterPointRef.current;
    if (!centerPoint) return;

    const deltaX = x - centerPoint.x;
    const deltaY = y - centerPoint.y;
    const distance = Math.hypot(deltaX, deltaY);

    let nextDirection: JoypadButton | null = null;

    if (distance >= DEADZONE_RADIUS_PX) {
      const angleRad = Math.atan2(deltaY, deltaX);
      let angleDeg = (angleRad * 180) / Math.PI;
      // shift so 0° is up, and wrap to [0,360)
      angleDeg = (angleDeg + 90 + 360) % 360;

      if (angleDeg >= 315 || angleDeg <= 45) {
        nextDirection = "up";
      } else if (angleDeg > 45 && angleDeg <= 135) {
        nextDirection = "right";
      } else if (angleDeg > 135 && angleDeg <= 225) {
        nextDirection = "down";
      } else if (angleDeg > 225 && angleDeg < 315) {
        nextDirection = "left";
      }
    }

    const currentDirection = activeDirectionButtonRef.current;
    if (nextDirection === currentDirection) return;

    if (currentDirection) {
      onButtonUp(currentDirection);
    }
    if (nextDirection) {
      onButtonDown(nextDirection);
    }

    activeDirectionButtonRef.current = nextDirection;
    setActiveDirection(nextDirection);
  };

  const updateDirectionFromPointer = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    updateDirectionFromCoordinates(event.clientX, event.clientY);
  };

  const resetActivePointerState = () => {
    const currentDirection = activeDirectionButtonRef.current;
    if (currentDirection) {
      onButtonUp(currentDirection);
    }
    activeDirectionButtonRef.current = null;
    activePointerIdRef.current = null;
    dpadCenterPointRef.current = null;
    setActiveDirection(null);
  };

  const handleDpadPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isTouchLike =
      event.pointerType === "touch" || event.pointerType === "pen";
    if (!isTouchLike) return;
    if (activePointerIdRef.current !== null) return;

    const dpadElement = dpadElementRef.current;
    if (!dpadElement) return;

    const rect = dpadElement.getBoundingClientRect();
    dpadCenterPointRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    activePointerIdRef.current = event.pointerId;
    (event.currentTarget as HTMLDivElement).setPointerCapture?.(
      event.pointerId,
    );
    event.preventDefault();
    updateDirectionFromPointer(event);
  };

  const handleDpadPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isTouchLike =
      event.pointerType === "touch" || event.pointerType === "pen";
    if (!isTouchLike) return;
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    updateDirectionFromPointer(event);
  };

  const handleDpadPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isTouchLike =
      event.pointerType === "touch" || event.pointerType === "pen";
    if (!isTouchLike) return;
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    (event.currentTarget as HTMLDivElement).releasePointerCapture?.(
      event.pointerId,
    );
    resetActivePointerState();
  };

  const handleDpadPointerCancel = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const isTouchLike =
      event.pointerType === "touch" || event.pointerType === "pen";
    if (!isTouchLike) return;
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    (event.currentTarget as HTMLDivElement).releasePointerCapture?.(
      event.pointerId,
    );
    resetActivePointerState();
  };

  const upClass =
    "dpad-up" + (activeDirection === "up" ? " dpad-active-up" : "");
  const downClass =
    "dpad-down" + (activeDirection === "down" ? " dpad-active-down" : "");
  const leftClass =
    "dpad-left" + (activeDirection === "left" ? " dpad-active-left" : "");
  const rightClass =
    "dpad-right" + (activeDirection === "right" ? " dpad-active-right" : "");

  return (
    <div
      className="gameboy-dpad"
      ref={dpadElementRef}
      onPointerDown={handleDpadPointerDown}
      onPointerMove={handleDpadPointerMove}
      onPointerUp={handleDpadPointerUp}
      onPointerCancel={handleDpadPointerCancel}
    >
      <div className="dpad-vertical">
        <button
          className={upClass}
          type="button"
          onMouseDown={() => onButtonDown("up")}
          onMouseUp={() => onButtonUp("up")}
          onMouseLeave={() => onButtonUp("up")}
        >
          <label>{`^`}</label>
        </button>
        <button
          className={downClass}
          type="button"
          onMouseDown={() => onButtonDown("down")}
          onMouseUp={() => onButtonUp("down")}
          onMouseLeave={() => onButtonUp("down")}
        >
          <label>{`ˇ`}</label>
        </button>
      </div>
      <div className="dpad-horizontal">
        <button
          className={leftClass}
          type="button"
          onMouseDown={() => onButtonDown("left")}
          onMouseUp={() => onButtonUp("left")}
          onMouseLeave={() => onButtonUp("left")}
        >
          <label>{`<`}</label>
        </button>
        <button
          className={rightClass}
          type="button"
          onMouseDown={() => onButtonDown("right")}
          onMouseUp={() => onButtonUp("right")}
          onMouseLeave={() => onButtonUp("right")}
        >
          <label>{`>`}</label>
        </button>
      </div>
      <div className="dpad-center" />
    </div>
  );
};
