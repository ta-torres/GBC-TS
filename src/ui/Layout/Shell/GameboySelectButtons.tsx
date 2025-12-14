import type { JoypadButton } from "../../../emulator/input/joypad";
import "./GameboySelectButtons.css";

interface GameboySelectButtonsProps {
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
}

export const GameboySelectButtons = ({
  onButtonDown,
  onButtonUp,
}: GameboySelectButtonsProps) => {
  return (
    <div className="gameboy-select-start">
      <button
        type="button"
        className="gameboy-pill gameboy-pill-select"
        onMouseDown={() => onButtonDown("select")}
        onMouseUp={() => onButtonUp("select")}
        onMouseLeave={() => onButtonUp("select")}
        onTouchStart={(e) => {
          e.preventDefault();
          navigator.vibrate(30);
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
          navigator.vibrate(30);
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
  );
};
