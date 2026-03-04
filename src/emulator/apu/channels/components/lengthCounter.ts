export class LengthCounter {
  /*
  https://gbdev.io/pandocs/Audio.html#length-timer
  https://gbdev.io/pandocs/Audio_Registers.html#ff11--nr11-channel-1-length-timer--duty-cycle

  If the functionality is enabled, a channel’s length timer ticks up5 at 256 Hz (tied to DIV-APU) from the value it’s initially set at.

  Internally, the length timer is inverted when written, and that ticks down until it reaches 0. But the effect is as if the counter ticked up.
  */
  private enabled = false;
  private counter = 0;
  private max: 64 | 256;

  constructor(max: 64 | 256) {
    this.max = max;
  }

  writeLength(value: number): void {
    const v = value & 0xff;

    if (this.max === 64) {
      this.counter = 64 - (v & 0x3f);
      return;
    }

    this.counter = 256 - v;
  }

  writeLengthEnable(enabled: boolean): void {
    this.enabled = enabled;
  }

  clock(): boolean {
    if (!this.enabled) return false;
    if (this.counter === 0) return false;

    this.counter = (this.counter - 1) | 0;
    return this.counter === 0;
  }

  onTrigger(): void {
    if (this.counter === 0) this.counter = this.max;
  }

  isZero(): boolean {
    return this.counter === 0;
  }
}
