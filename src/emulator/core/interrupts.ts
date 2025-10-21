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

export class Interrupts {
  private ie: number = 0x00;
  private if: number = 0x00;

  requestInterrupt(type: InterruptType): void {
    this.if |= type;
  }

  getPendingInterrupt(): number {
    return this.ie & this.if;
  }

  getPriorityInterrupt(): InterruptType | null {
    // priority from 0 to 4
    return null;
  }

  // clear flag
  // get and set ie/if

  reset(): void {
    this.ie = 0x00;
    this.if = 0x00;
  }
}
