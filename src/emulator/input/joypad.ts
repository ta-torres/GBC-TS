import { Interrupts, InterruptType } from "../core/interrupts";
import type { JoypadSnapshot } from "../types/emulator";

export type JoypadButton =
  | "right"
  | "left"
  | "up"
  | "down"
  | "a"
  | "b"
  | "select"
  | "start";

export class Joypad {
  /*
  bit0 = right
  bit1 = left
  bit2 = up
  bit3 = down
  */
  private directionalState = 0x00;
  /*
  bit0 = A
  bit1 = B
  bit2 = select
  bit3 = start
  */
  private buttonState = 0x00;

  private interrupts: Interrupts;

  constructor(interrupts: Interrupts) {
    this.interrupts = interrupts;
  }

  pressButton(button: JoypadButton): void {
    let changed = false;

    switch (button) {
      case "right": {
        const mask = 0x01;
        if ((this.directionalState & mask) === 0) {
          this.directionalState |= mask;
          changed = true;
        }
        break;
      }
      case "left": {
        const mask = 0x02;
        if ((this.directionalState & mask) === 0) {
          this.directionalState |= mask;
          changed = true;
        }
        break;
      }
      case "up": {
        const mask = 0x04;
        if ((this.directionalState & mask) === 0) {
          this.directionalState |= mask;
          changed = true;
        }
        break;
      }
      case "down": {
        const mask = 0x08;
        if ((this.directionalState & mask) === 0) {
          this.directionalState |= mask;
          changed = true;
        }
        break;
      }

      case "a": {
        const mask = 0x01;
        if ((this.buttonState & mask) === 0) {
          this.buttonState |= mask;
          changed = true;
        }
        break;
      }
      case "b": {
        const mask = 0x02;
        if ((this.buttonState & mask) === 0) {
          this.buttonState |= mask;
          changed = true;
        }
        break;
      }
      case "select": {
        const mask = 0x04;
        if ((this.buttonState & mask) === 0) {
          this.buttonState |= mask;
          changed = true;
        }
        break;
      }
      case "start": {
        const mask = 0x08;
        if ((this.buttonState & mask) === 0) {
          this.buttonState |= mask;
          changed = true;
        }
        break;
      }
    }

    // interrupt only on rising edge (flanco de subida, cuando se presiona al menos un botón nuevo)
    if (changed) {
      this.interrupts.requestInterrupt(InterruptType.JOYPAD);
    }
  }

  releaseButton(button: JoypadButton): void {
    switch (button) {
      case "right":
        this.directionalState &= ~0x01;
        break;
      case "left":
        this.directionalState &= ~0x02;
        break;
      case "up":
        this.directionalState &= ~0x04;
        break;
      case "down":
        this.directionalState &= ~0x08;
        break;

      case "a":
        this.buttonState &= ~0x01;
        break;
      case "b":
        this.buttonState &= ~0x02;
        break;
      case "select":
        this.buttonState &= ~0x04;
        break;
      case "start":
        this.buttonState &= ~0x08;
        break;
    }
  }

  reset(): void {
    this.directionalState = 0x00;
    this.buttonState = 0x00;
  }

  takeSnapshot(): JoypadSnapshot {
    return {
      directionalState: this.directionalState,
      buttonState: this.buttonState,
    };
  }

  restoreSnapshot(s: JoypadSnapshot): void {
    this.directionalState = s.directionalState;
    this.buttonState = s.buttonState;
  }

  readP1LowerNibble(selectBits: number): number {
    /* 
    0 = pressed
    1 = not pressed
    select bit 4 and 5, if selected apply 0 and return bits 0-3
    */
    let result = 0x0f;

    const selectDirections = (selectBits & 0x10) === 0;
    const selectButtons = (selectBits & 0x20) === 0;

    if (selectDirections) {
      // if internal state is set to 1 apply the inverted bit
      if (this.directionalState & 0x01) result &= ~0x01;
      if (this.directionalState & 0x02) result &= ~0x02;
      if (this.directionalState & 0x04) result &= ~0x04;
      if (this.directionalState & 0x08) result &= ~0x08;
    }

    if (selectButtons) {
      if (this.buttonState & 0x01) result &= ~0x01;
      if (this.buttonState & 0x02) result &= ~0x02;
      if (this.buttonState & 0x04) result &= ~0x04;
      if (this.buttonState & 0x08) result &= ~0x08;
    }

    return result & 0x0f;
  }
}
