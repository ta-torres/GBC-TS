import {
  createEmptyInputState,
  type InputDevice,
  type InputState,
} from "./types";

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
