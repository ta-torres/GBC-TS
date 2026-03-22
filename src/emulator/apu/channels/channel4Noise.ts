import { LengthCounter } from "./components/lengthCounter";
import { NoiseLfsr } from "./components/noiseLfsr";
import { VolumeEnvelope } from "./components/volumeEnvelope";

export class Channel4Noise {
  private length = new LengthCounter(64);
  private envelope = new VolumeEnvelope();
  private lfsr = new NoiseLfsr();

  private enabled = false;

  private timerPeriod = 8;
  private timerCounter = 8;

  private nr41 = 0;
  private nr42 = 0;
  private nr43 = 0;
  private nr44 = 0;

  reset(): void {
    this.length = new LengthCounter(64);
    this.envelope = new VolumeEnvelope();
    this.lfsr = new NoiseLfsr();

    this.enabled = false;

    this.timerPeriod = 8;
    this.timerCounter = 8;

    this.nr41 = 0;
    this.nr42 = 0;
    this.nr43 = 0;
    this.nr44 = 0;
  }

  writeNR41(value: number): void {
    this.nr41 = value & 0xff;
    this.length.writeLength(this.nr41);
  }

  writeNR42(value: number): void {
    this.nr42 = value & 0xff;
    this.envelope.writeNRx2(this.nr42);

    if (!this.isDacEnabled()) {
      this.enabled = false;
    }
  }

  writeNR43(value: number): void {
    this.nr43 = value & 0xff;
    this.recomputeTimerPeriod();

    const widthMode7 = (this.nr43 & 0x08) !== 0;
    this.lfsr.setWidthMode7(widthMode7);
  }

  writeNR44(value: number): { triggered: boolean } {
    this.nr44 = value & 0xff;

    const lengthEnable = (this.nr44 & 0x40) !== 0;
    this.length.writeLengthEnable(lengthEnable);

    const triggered = (this.nr44 & 0x80) !== 0;
    if (triggered) {
      this.length.onTrigger();
      this.envelope.onTrigger();
      this.lfsr.onTrigger();
      this.recomputeTimerPeriod();
      this.timerCounter = this.timerPeriod;
      this.enabled = this.isDacEnabled();
    }

    return { triggered };
  }

  private recomputeTimerPeriod(): void {
    const clockShift = (this.nr43 >> 4) & 0x0f;
    const divisorCode = this.nr43 & 0x07;

    const divisorTable = [8, 16, 32, 48, 64, 80, 96, 112];
    const divisor = divisorTable[divisorCode] ?? 8;

    this.timerPeriod = divisor << clockShift;
    if (this.timerPeriod <= 0) this.timerPeriod = 8;
  }

  clockLength(): boolean {
    const expired = this.length.clock();
    if (expired) this.enabled = false;
    return expired;
  }

  clockEnvelope(): void {
    this.envelope.advanceVolumeEnvelope();
  }

  step(baseCycles: number): void {
    if (!this.enabled) return;

    this.timerCounter -= baseCycles;
    while (this.timerCounter <= 0) {
      this.timerCounter += this.timerPeriod;
      this.lfsr.clock();
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isDacEnabled(): boolean {
    return this.envelope.isDacEnabled();
  }

  getVolume(): number {
    return this.envelope.getVolume();
  }

  getAmplitude(): number {
    if (!this.enabled) return 0;
    if (!this.isDacEnabled()) return 0;

    const level4 = this.lfsr.getOutputBit() ? this.getVolume() : 0;
    return (level4 / 15) * 2 - 1;
  }
}
