import type { JoypadButton } from "../../../emulator/input/joypad";
import { useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import "./GameboyActionButtons.css";

interface GameboyActionButtonsProps {
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
}

export const GameboyActionButtons = ({
  onButtonDown,
  onButtonUp,
}: GameboyActionButtonsProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonARef = useRef<HTMLButtonElement | null>(null);
  const buttonBRef = useRef<HTMLButtonElement | null>(null);

  const activePointerIdRef = useRef<number | null>(null);
  const heldButtonRef = useRef<JoypadButton | null>(null);
  const activeSecondaryButtonRef = useRef<JoypadButton | null>(null);

  const getButtonUnderPointer = (x: number, y: number): JoypadButton | null => {
    // get current button being pressed under (x, y)
    const aButton = buttonARef.current;
    const bButton = buttonBRef.current;
    if (!aButton || !bButton) return null;

    const aRect = aButton.getBoundingClientRect();
    const bRect = bButton.getBoundingClientRect();

    const inRect = (rect: DOMRect) =>
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

    if (inRect(aRect)) return "a";
    if (inRect(bRect)) return "b";
    return null;
  };

  const syncSecondaryFromPointer = (x: number, y: number) => {
    // sync the secondary button state with the current pointer position
    const held = heldButtonRef.current;
    if (!held) return;

    const secondary: JoypadButton = held === "a" ? "b" : "a";
    const isPointerOverSecondaryButton =
      getButtonUnderPointer(x, y) === secondary;
    const currentlyActive = activeSecondaryButtonRef.current;

    if (isPointerOverSecondaryButton && currentlyActive !== secondary) {
      onButtonDown(secondary);
      activeSecondaryButtonRef.current = secondary;
      navigator.vibrate?.(40);
      return;
    }

    if (!isPointerOverSecondaryButton && currentlyActive === secondary) {
      onButtonUp(secondary);
      activeSecondaryButtonRef.current = null;
    }
  };

  const resetPointerState = () => {
    const held = heldButtonRef.current;
    const secondary = activeSecondaryButtonRef.current;

    if (secondary) {
      onButtonUp(secondary);
    }
    if (held) {
      onButtonUp(held);
    }

    activePointerIdRef.current = null;
    heldButtonRef.current = null;
    activeSecondaryButtonRef.current = null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== null) return;

    const initial = getButtonUnderPointer(event.clientX, event.clientY);
    if (!initial) return;

    activePointerIdRef.current = event.pointerId;
    heldButtonRef.current = initial;
    activeSecondaryButtonRef.current = null;

    navigator.vibrate?.(40);
    onButtonDown(initial);

    containerRef.current?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    syncSecondaryFromPointer(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    syncSecondaryFromPointer(event.clientX, event.clientY);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    containerRef.current?.releasePointerCapture?.(event.pointerId);
    resetPointerState();
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current !== event.pointerId) return;

    event.preventDefault();
    containerRef.current?.releasePointerCapture?.(event.pointerId);
    resetPointerState();
  };

  return (
    <div
      className="gameboy-ab-buttons"
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <button
        ref={buttonARef}
        type="button"
        className="gameboy-button gameboy-button-a"
        onTouchStart={(e) => {
          e.preventDefault();
          navigator.vibrate(30);
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
        ref={buttonBRef}
        type="button"
        className="gameboy-button gameboy-button-b"
        onTouchStart={(e) => {
          e.preventDefault();
          navigator.vibrate(30);
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
  );
};
