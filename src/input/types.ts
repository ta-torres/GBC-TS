import type { JoypadButton } from "@/emulator/input/joypad";

export type InputState = Record<JoypadButton, boolean>;

export function createEmptyInputState(): InputState {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    a: false,
    b: false,
    start: false,
    select: false,
  };
}

export interface InputDevice {
  update(): InputState;
}
