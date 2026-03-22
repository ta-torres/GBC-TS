export type SweepParams = {
  // 3-bit period (0-7)
  sweepPace: number;
  // 1-bit negate flag
  subtractFrequencyDelta: boolean;
  // 3-bit shift amount (0-7)
  shiftStep: number;
};

function clampTo11BitFrequency(freq11: number): number {
  return freq11 & 0x7ff;
}

export class SweepUnit {
  // https://gbdev.io/pandocs/Audio_Registers.html#ff10--nr10-channel-1-sweep
  // wtf am i doing
  private params: SweepParams = {
    sweepPace: 0,
    subtractFrequencyDelta: false,
    shiftStep: 0,
  };

  shadowFrequency: number;
  timer: number;
  enabled: boolean;

  writeNR10(value: number): void {
    /*
      8: unused
      7-4: Period
      3: Negate
      2-0: Shift
     */
    const nr10 = value & 0xff;
    this.params = {
      sweepPace: (nr10 >> 4) & 0x07,
      subtractFrequencyDelta: (nr10 & 0x08) !== 0,
      shiftStep: nr10 & 0x07,
    };
  }

  private reloadTimer(): void {
    // value written to nr10 is loaded onto the timer but if its 0 its set to 8?
    this.timer = this.params.sweepPace === 0 ? 8 : this.params.sweepPace;
  }

  private calcNewFrequency(): number {
    /* 
    sweep formula: Lt+1 = Lt ± (Lt / 2^shift)
    hardware uses a right shift for powers of two
    Lt+1 = Lt ± (Lt >> shift)
    Lt is the shadow frequency
    shift from 0-7
    */
    const shift = this.params.shiftStep & 0x07;
    let delta: number;
    if (shift === 0) {
      delta = 0;
    } else {
      delta = this.shadowFrequency >> shift;
    }

    const nextSweepFreq = this.params.subtractFrequencyDelta
      ? this.shadowFrequency - delta
      : this.shadowFrequency + delta;

    return nextSweepFreq;
  }

  onTrigger(currentFreq11: number): { disableChannel: boolean } {
    this.shadowFrequency = clampTo11BitFrequency(currentFreq11);
    // reload before first calc or after trigger?
    this.reloadTimer();

    this.enabled = this.params.sweepPace !== 0 || this.params.shiftStep !== 0;

    if (this.params.shiftStep !== 0) {
      const nextSweepFreq = this.calcNewFrequency();
      if (nextSweepFreq > 2047) {
        this.enabled = false;
        return { disableChannel: true };
      }
    }

    return { disableChannel: false };
  }

  constructor() {
    this.shadowFrequency = 0;
    this.timer = 0;
    this.enabled = false;
  }

  clock(): { disableChannel: boolean; newFreq11?: number } {
    if (!this.enabled) return { disableChannel: false };
    if (this.params.sweepPace === 0) return { disableChannel: false };

    this.timer = (this.timer - 1) | 0;
    if (this.timer > 0) return { disableChannel: false };

    this.reloadTimer();

    const nextSweepFreq = this.calcNewFrequency();
    if (nextSweepFreq > 2047) {
      this.enabled = false;
      return { disableChannel: true };
    }

    // if shift is 0 don't change frequency
    if (this.params.shiftStep === 0) {
      return { disableChannel: false };
    }

    const next11 = clampTo11BitFrequency(nextSweepFreq);
    this.shadowFrequency = next11;

    // calculate again and check, but don't write back to shadow frequency
    const doesOverflow = this.calcNewFrequency() > 2047;
    if (doesOverflow) {
      this.enabled = false;
      return { disableChannel: true, newFreq11: next11 };
    }

    return { disableChannel: false, newFreq11: next11 };
  }
}
