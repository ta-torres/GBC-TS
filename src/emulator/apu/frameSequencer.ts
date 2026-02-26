export type FrameSequencerStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type FrameSequencerTick = {
  step: FrameSequencerStep;
  clockLength: boolean;
  clockEnvelope: boolean;
  clockSweep: boolean;
};

const FS_PERIOD_CYCLES = 8192;

export class FrameSequencer {
  private cycles = 0;
  private step: FrameSequencerStep = 0;

  stepCycles(baseCycles: number): FrameSequencerTick[] {
    this.cycles += baseCycles;
    const out: FrameSequencerTick[] = [];

    while (this.cycles >= FS_PERIOD_CYCLES) {
      this.cycles -= FS_PERIOD_CYCLES;
      this.step = ((this.step + 1) & 7) as FrameSequencerStep;

      out.push({
        step: this.step,
        clockLength: this.step === 0 || this.step === 2 || this.step === 4 || this.step === 6,
        clockSweep: this.step === 2 || this.step === 6,
        clockEnvelope: this.step === 7,
      });
    }

    return out;
  }

  resetOnApuPowerOn(): void {
    this.cycles = 0;
    this.step = 7;
  }

  getStep(): FrameSequencerStep {
    return this.step;
  }
}
