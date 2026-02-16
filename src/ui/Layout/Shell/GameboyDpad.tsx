import { useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { JoypadButton } from "@/emulator/input/joypad";
import "./GameboyDpad.css";

interface VirtualDpadProps {
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
  showDebugBounds?: boolean;
}

export const GameboyDpad = ({
  onButtonDown,
  onButtonUp,
  showDebugBounds,
}: VirtualDpadProps) => {
  const dpadElementRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const dpadCenterPointRef = useRef<{ x: number; y: number } | null>(null);

  const lastCardinalDirectionRef = useRef<JoypadButton | null>(null);

  const activeDirectionButtonRef = useRef<JoypadButton[]>([]);
  const [activeDirection, setActiveDirection] = useState<JoypadButton[]>([]);
  const [touchPoint, setTouchPoint] = useState<{ x: number; y: number } | null>(
    null,
  );

  const [debugAngle, setDebugAngle] = useState<number | null>(null);
  const [debugDistance, setDebugDistance] = useState<number | null>(null);

  const DEADZONE_RADIUS_PX = 20;
  // 0 = no diagonal directions
  // 10 = -+10° 45/135/225/315 degrees
  const DIAGONAL_SLICE_WIDTH_DEG = 10;

  const updateDirectionFromCoordinates = (x: number, y: number) => {
    const centerPoint = dpadCenterPointRef.current;
    if (!centerPoint) return;

    const dpadElement = dpadElementRef.current;
    if (dpadElement) {
      const rect = dpadElement.getBoundingClientRect();
      const relativeX = x - rect.left;
      const relativeY = y - rect.top;
      setTouchPoint({ x: relativeX, y: relativeY });
    }

    const deltaX = x - centerPoint.x;
    const deltaY = y - centerPoint.y;
    const distance = Math.hypot(deltaX, deltaY);

    let nextDirection: JoypadButton[] = [];

    if (distance > 0) {
      const angleRad = Math.atan2(deltaY, deltaX);
      let angleDeg = (angleRad * 180) / Math.PI;
      // shift so 0° is up, and wrap to [0,360)
      angleDeg = (angleDeg + 90 + 360) % 360;

      if (showDebugBounds) {
        setDebugAngle(angleDeg);
        setDebugDistance(distance);
      }

      if (distance >= DEADZONE_RADIUS_PX) {
        const d = DIAGONAL_SLICE_WIDTH_DEG;

        // diagonal
        if (angleDeg >= 45 - d && angleDeg < 45 + d) {
          nextDirection = ["up", "right"];
        } else if (angleDeg >= 135 - d && angleDeg < 135 + d) {
          nextDirection = ["down", "right"];
        } else if (angleDeg >= 225 - d && angleDeg < 225 + d) {
          nextDirection = ["down", "left"];
        } else if (angleDeg >= 315 - d && angleDeg < 315 + d) {
          nextDirection = ["up", "left"];
        }
        // cardinal
        else if (angleDeg >= 315 + d || angleDeg < 45 - d) {
          nextDirection = ["up"];
        } else if (angleDeg >= 45 + d && angleDeg < 135 - d) {
          nextDirection = ["right"];
        } else if (angleDeg >= 135 + d && angleDeg < 225 - d) {
          nextDirection = ["down"];
        } else if (angleDeg >= 225 + d || angleDeg < 315 - d) {
          nextDirection = ["left"];
        }
      }
    } else {
      setDebugAngle(null);
      setDebugDistance(null);
    }

    const currentDirection = activeDirectionButtonRef.current;

    if (nextDirection.length === 1) {
      const nextCardinal = nextDirection[0];
      if (lastCardinalDirectionRef.current !== nextCardinal) {
        navigator.vibrate(30);
        lastCardinalDirectionRef.current = nextCardinal;
      }
    } else {
      lastCardinalDirectionRef.current = null;
    }

    if (
      currentDirection.length === nextDirection.length &&
      currentDirection.every((dir) => nextDirection.includes(dir))
    ) {
      return;
    }

    for (const dir of currentDirection) {
      if (!nextDirection.includes(dir)) {
        onButtonUp(dir);
      }
    }

    for (const dir of nextDirection) {
      if (!currentDirection.includes(dir)) {
        onButtonDown(dir);
      }
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
    if (currentDirection.length > 0) {
      for (const dir of currentDirection) {
        onButtonUp(dir);
      }
    }
    activeDirectionButtonRef.current = [];
    activePointerIdRef.current = null;
    dpadCenterPointRef.current = null;
    lastCardinalDirectionRef.current = null;
    setTouchPoint(null);
    setDebugAngle(null);
    setDebugDistance(null);
    setActiveDirection([]);
  };

  const handleDpadPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isTouchLike =
      event.pointerType === "touch" ||
      event.pointerType === "pen" ||
      event.pointerType === "mouse";
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
      event.pointerType === "touch" ||
      event.pointerType === "pen" ||
      event.pointerType === "mouse";
    if (!isTouchLike) return;
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    updateDirectionFromPointer(event);
  };

  const handleDpadPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const isTouchLike =
      event.pointerType === "touch" ||
      event.pointerType === "pen" ||
      event.pointerType === "mouse";
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
      event.pointerType === "touch" ||
      event.pointerType === "pen" ||
      event.pointerType === "mouse";
    if (!isTouchLike) return;
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    (event.currentTarget as HTMLDivElement).releasePointerCapture?.(
      event.pointerId,
    );
    resetActivePointerState();
  };

  const upClass =
    "dpad-up" + (activeDirection.includes("up") ? " dpad-active-up" : "");
  const downClass =
    "dpad-down" + (activeDirection.includes("down") ? " dpad-active-down" : "");
  const leftClass =
    "dpad-left" + (activeDirection.includes("left") ? " dpad-active-left" : "");
  const rightClass =
    "dpad-right" +
    (activeDirection.includes("right") ? " dpad-active-right" : "");

  const dpadClass =
    "dpad" + (activeDirection.length ? ` ${activeDirection.join(" ")}` : "");

  return (
    <div
      className="gameboy-dpad"
      ref={dpadElementRef}
      onPointerDown={handleDpadPointerDown}
      onPointerMove={handleDpadPointerMove}
      onPointerUp={handleDpadPointerUp}
      onPointerCancel={handleDpadPointerCancel}
    >
      {showDebugBounds && debugAngle !== null && (
        <div className="gameboy-dpad-debug-readout">
          <div className="gameboy-dpad-debug-line">
            angle: {Math.round(debugAngle)}°
          </div>
          <div className="gameboy-dpad-debug-line">
            direction: {activeDirection ?? "none"}
          </div>
          {debugDistance !== null && (
            <div className="gameboy-dpad-debug-line">
              distance: {Math.round(debugDistance)}
            </div>
          )}
        </div>
      )}
      {showDebugBounds && (
        <>
          <div className="gameboy-dpad-debug-boundary" />
          <div className="gameboy-dpad-debug-deadzone" />
        </>
      )}
      {touchPoint && (
        <div
          className="gameboy-dpad-touch-indicator"
          style={{
            left: `${touchPoint.x}px`,
            top: `${touchPoint.y}px`,
          }}
        />
      )}
      <div className="dpad-touch-area">
        <div className={dpadClass}>
          <div className="dpad-shadow" />
          <div className="dpad-vertical" />
          <div className="dpad-vertical-top" />
          <div className="dpad-vertical-left" />
          <div className="dpad-vertical-right" />
          <div className="dpad-vertical-bottom" />

          <div className="dpad-horizontal" />
          <div className="dpad-horizontal-top" />
          <div className="dpad-horizontal-left" />
          <div className="dpad-horizontal-right" />
          <div className="dpad-horizontal-bottom" />

          <button className={upClass} type="button">
            <label>{`^`}</label>
          </button>
          <button className={downClass} type="button">
            <label>{`ˇ`}</label>
          </button>
          <button className={leftClass} type="button">
            <label>{`<`}</label>
          </button>
          <button className={rightClass} type="button">
            <label>{`>`}</label>
          </button>

          <div className="center-circle" />
        </div>
      </div>
    </div>
  );
};
