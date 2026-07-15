import type { JoypadButton } from "@/emulator/input/joypad";
import {
  createEmptyInputState,
  type InputDevice,
  type InputState,
} from "./types";

const STICK_DEADZONE_RADIUS = 0.25;
// 0 = no diagonal directions
// 10 = -+10° 45/135/225/315 degrees
const STICK_DIAGONAL_SLICE_WIDTH_DEG = 10;

function mapLeftStickToDirections(pad: Gamepad): JoypadButton[] {
  const deltaX = pad.axes[0] ?? 0;
  const deltaY = pad.axes[1] ?? 0;
  const distance = Math.hypot(deltaX, deltaY);

  let nextDirection: JoypadButton[] = [];

  if (distance >= STICK_DEADZONE_RADIUS) {
    const angleRad = Math.atan2(deltaY, deltaX);
    let angleDeg = (angleRad * 180) / Math.PI;
    // shift so 0° is up, and wrap to [0,360)
    angleDeg = (angleDeg + 90 + 360) % 360;

    const d = STICK_DIAGONAL_SLICE_WIDTH_DEG;

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

  return nextDirection;
}

// https://w3c.github.io/gamepad/#remapping
export function mapStandardGamepadToInputState(pad: Gamepad): InputState {
  const state = createEmptyInputState();

  // In the Game Boy layout, the right button is "A" (button[1]) and the bottom button is "B" (button[0])
  state.b = pad.buttons[0]?.pressed ?? false;
  state.a = pad.buttons[1]?.pressed ?? false;

  state.select = pad.buttons[8]?.pressed ?? false;
  state.start = pad.buttons[9]?.pressed ?? false;

  state.up = pad.buttons[12]?.pressed ?? false;
  state.down = pad.buttons[13]?.pressed ?? false;
  state.left = pad.buttons[14]?.pressed ?? false;
  state.right = pad.buttons[15]?.pressed ?? false;

  for (const direction of mapLeftStickToDirections(pad)) {
    state[direction] = true;
  }

  return state;
}

export function getConnectedStandardGamepad(): Gamepad | null {
  if (typeof navigator === "undefined" || !navigator.getGamepads) {
    return null;
  }

  const pads = navigator.getGamepads();
  for (const pad of pads) {
    if (pad && pad.connected && pad.mapping === "standard") {
      return pad;
    }
  }

  return null;
}

// poll in each frame from main loop, because navigator.getGamepads() doesn't fire events
export class GamepadInput implements InputDevice {
  update(): InputState {
    const pad = getConnectedStandardGamepad();
    if (!pad) return createEmptyInputState();
    return mapStandardGamepadToInputState(pad);
  }
}
