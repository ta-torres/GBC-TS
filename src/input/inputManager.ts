import type { GBCEmulator } from "@/emulator/gbcEmulator";
import type { JoypadButton } from "@/emulator/input/joypad";
import {
  createEmptyInputState,
  type InputDevice,
  type InputState,
} from "./types";

const ALL_BUTTONS = Object.keys(createEmptyInputState()) as JoypadButton[];

/*
  Combine the state of all registered InputDevices (logical OR between devices: if any reports the button pressed, it is considered pressed)
  and translate that combined state into pressButton/releaseButton calls to the emulator, but ONLY when there is a real transition. 
  This avoids "spamming" the Joypad every frame and maintains the same semantics as the original keyboard listeners (keydown -> press once, keyup -> release once).
  The emulator never knows what physical devices exist: it only receives pressButton/releaseButton, just like before.
*/
export class InputManager {
  private devices: InputDevice[] = [];
  private previous: InputState = createEmptyInputState();
  private emulator: GBCEmulator;

  constructor(emulator: GBCEmulator) {
    this.emulator = emulator;
  }

  addDevice(device: InputDevice): void {
    if (this.devices.includes(device)) return;
    this.devices.push(device);
  }

  removeDevice(device: InputDevice): void {
    this.devices = this.devices.filter((d) => d !== device);
  }

  // update() gets called once per frame (or at least frequently enough to not miss short gamepad presses)
  update(): void {
    const merged = createEmptyInputState();

    for (const device of this.devices) {
      const deviceState = device.update();
      for (const button of ALL_BUTTONS) {
        merged[button] = merged[button] || deviceState[button];
      }
    }

    this.sync(merged);
  }

  private sync(state: InputState): void {
    for (const button of ALL_BUTTONS) {
      const isPressed = state[button];
      const wasPressed = this.previous[button];

      if (isPressed && !wasPressed) {
        this.emulator.pressButton(button);
      } else if (!isPressed && wasPressed) {
        this.emulator.releaseButton(button);
      }
    }

    this.previous = state;
  }
}
