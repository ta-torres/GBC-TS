export const InterruptType = {
  VBLANK: 0x01,
  LCD_STAT: 0x02,
  TIMER: 0x04,
  SERIAL: 0x08,
  JOYPAD: 0x10,
} as const;

export type InterruptType = (typeof InterruptType)[keyof typeof InterruptType];

export const INTERRUPT_ADDRESSES = {
  [InterruptType.VBLANK]: 0x0040,
  [InterruptType.LCD_STAT]: 0x0048,
  [InterruptType.TIMER]: 0x0050,
  [InterruptType.SERIAL]: 0x0058,
  [InterruptType.JOYPAD]: 0x0060,
} as const;

import type { InterruptSnapshot } from "../types/emulator";

export class Interrupts {
  private ie: number = 0x00;
  private if: number = 0x00;

  requestInterrupt(type: InterruptType): void {
    this.if |= type;
  }

  getPending(): number {
    return this.ie & this.if;
  }

  getHighestPriority(): InterruptType | null {
    // priority from 0 to 4
    const pending = this.getPending();
    if (pending & InterruptType.VBLANK) return InterruptType.VBLANK;
    if (pending & InterruptType.LCD_STAT) return InterruptType.LCD_STAT;
    if (pending & InterruptType.TIMER) return InterruptType.TIMER;
    if (pending & InterruptType.SERIAL) return InterruptType.SERIAL;
    if (pending & InterruptType.JOYPAD) return InterruptType.JOYPAD;

    return null;
  }

  clearInterrupt(type: InterruptType): void {
    this.if &= ~type;
  }

  getIE(): number {
    return this.ie;
  }

  setIE(value: number): void {
    // only lower 5 bits are used (00011111)
    this.ie = value & 0x1f;
  }

  getIF(): number {
    // 11100000
    return this.if | 0xe0;
  }

  setIF(value: number): void {
    this.if = value & 0x1f;
  }

  reset(): void {
    this.ie = 0x00;
    this.if = 0x00;
  }

  takeSnapshot(): InterruptSnapshot {
    return { ie: this.ie, if: this.if };
  }

  restoreSnapshot(s: InterruptSnapshot): void {
    this.ie = s.ie & 0x1f;
    this.if = s.if & 0x1f;
  }
}
