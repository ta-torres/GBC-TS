import type { JoypadButton } from "../../../emulator/input/joypad";

interface GameboyActionButtonsProps {
  onButtonDown: (button: JoypadButton) => void;
  onButtonUp: (button: JoypadButton) => void;
}

export const GameboyActionButtons = ({
  onButtonDown,
  onButtonUp,
}: GameboyActionButtonsProps) => {
  return (
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
  );
};
