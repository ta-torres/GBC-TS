import type { JoypadButton } from "@/emulator/input/joypad";
import {
  createEmptyInputState,
  type InputDevice,
  type InputState,
} from "./types";

const KEY_MAP: Record<string, JoypadButton> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",

  KeyZ: "b",
  KeyX: "a",

  Enter: "start",

  ShiftLeft: "select",
  ShiftRight: "select",
};

export class KeyboardInput implements InputDevice {
  private state: InputState = createEmptyInputState();

  start(): void {
    window.addEventListener("keydown", this.handleKeyDown);
    window.addEventListener("keyup", this.handleKeyUp);
  }

  stop(): void {
    window.removeEventListener("keydown", this.handleKeyDown);
    window.removeEventListener("keyup", this.handleKeyUp);
  }

  update(): InputState {
    return this.state;
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const button = KEY_MAP[event.code];
    if (!button) return;

    event.preventDefault();
    this.state = { ...this.state, [button]: true };
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    const button = KEY_MAP[event.code];
    if (!button) return;

    event.preventDefault();
    this.state = { ...this.state, [button]: false };
  };
}
