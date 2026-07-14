import { useEffect, useState } from "react";
import { createEmptyInputState, type InputState } from "./types";
import { mapStandardGamepadToInputState } from "./gamepadInput";

export interface GamepadDebugInfo {
  connected: boolean;
  id: string | null;
  index: number | null;
  mapping: string | null;
  // only valid if mapping === "standard")
  mappedButtons: InputState;
  // Raw state of physical buttons on the pad (by index)
  rawButtons: boolean[];
  axes: number[];
}

const DISCONNECTED_INFO: GamepadDebugInfo = {
  connected: false,
  id: null,
  index: null,
  mapping: null,
  mappedButtons: createEmptyInputState(),
  rawButtons: [],
  axes: [],
};

export function useGamepadDebugInfo(): GamepadDebugInfo {
  const [info, setInfo] = useState<GamepadDebugInfo>(DISCONNECTED_INFO);

  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.getGamepads) {
      return;
    }

    let rafId = 0;

    const poll = () => {
      const pads = navigator.getGamepads();
      const pad = Array.from(pads).find((p) => p && p.connected) ?? null;

      if (!pad) {
        setInfo(DISCONNECTED_INFO);
      } else {
        setInfo({
          connected: true,
          id: pad.id,
          index: pad.index,
          mapping: pad.mapping || "non-standard",
          mappedButtons:
            pad.mapping === "standard"
              ? mapStandardGamepadToInputState(pad)
              : createEmptyInputState(),
          rawButtons: pad.buttons.map((b) => b.pressed),
          axes: Array.from(pad.axes),
        });
      }

      rafId = requestAnimationFrame(poll);
    };

    rafId = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return info;
}
