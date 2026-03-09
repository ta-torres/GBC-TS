import { VolumeEnvelope } from "./components/volumeEnvelope";
import { LengthCounter } from "./components/lengthCounter";

export class Channel1Pulse {
  // https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-1--pulse-with-period-sweep
  // https://gbdev.io/pandocs/Audio.html#architecture
  private length = new LengthCounter(64);
  private envelope = new VolumeEnvelope();

  private dutyStep = 0;

  // initialize to 4 cycles per timer step
  private timerPeriod = 4;
  private timerCounter = 4;

  //private nr10 = 0;
  private nr11 = 0;
  private nr12 = 0;
  private nr13 = 0;
  private nr14 = 0;

  writeNR11(value: number): void {
    this.nr11 = value & 0xff;
    this.length.writeLength(this.nr11);
  }

  writeNR12(value: number): void {
    this.nr12 = value & 0xff;
    this.envelope.writeNRx2(this.nr12);
  }

  writeNR13(value: number): void {
    this.nr13 = value & 0xff;
    this.recomputeTimerPeriod();
  }

  // write NR14

  private getDutyMode(): 0 | 1 | 2 | 3 {
    const dutyMode = (this.nr11 >>> 6) & 0x03;
    return dutyMode as 0 | 1 | 2 | 3;
  }

  private getDutyBit(step: number): 0 | 1 {
    const dutyMode = this.getDutyMode();
    const bitIndex = step & 7;

    switch (dutyMode) {
      case 0:
        if (bitIndex === 7) return 1;
        return 0;
      case 1:
        if (bitIndex === 0 || bitIndex === 7) return 1;
        return 0;
      case 2:
        if (bitIndex === 0 || bitIndex >= 5) return 1;
        return 0;
      case 3:
        if (bitIndex >= 1 && bitIndex <= 6) return 1;
        return 0;
    }
  }

  private getFrequency11Bit(): number {
    const lo = this.nr13 & 0xff;
    const hi = this.nr14 & 0x07;
    return ((hi << 8) | lo) & 0x7ff;
  }

  // timerPeriod = (timer-base - freq11) * t-cycles-per-step
  // compute the 11-bit frequency from NR13 + NR14 & 0x07, derive timerPeriod = (2048 - freq) * 4 (base cycles), and advance dutyStep only when that timer elapses in step()
  private recomputeTimerPeriod(): void {
    const freq11 = this.getFrequency11Bit();
    this.timerPeriod = (2048 - freq11) * 4;
    if (this.timerPeriod <= 0) this.timerPeriod = 4;
  }

  clockLength(): boolean {
    return this.length.clock();
  }

  clockEnvelope(): void {
    this.envelope.advanceVolumeEnvelope();
  }

  step(baseCycles: number): void {
    this.timerCounter -= baseCycles;
    while (this.timerCounter <= 0) {
      // advance duty step only when timer elapses
      this.timerCounter += this.timerPeriod;
      this.dutyStep = (this.dutyStep + 1) & 7;
    }
  }

  isDacEnabled(): boolean {
    return this.envelope.isDacEnabled();
  }

  getVolume(): number {
    return this.envelope.getVolume();
  }

  getAmplitude(): number {
    void this.getFrequency11Bit();
    // todo: waveform generation
    if (!this.isDacEnabled()) return 0;

    // duty bit 1 - output the current envelope volume
    // getAmplitude only samples the duty bit, don't advance duty in here since it's called from step()
    const dutyBit = this.getDutyBit(this.dutyStep);

    /* 
    https://gbdev.io/pandocs/Audio_details.html
    The digital value produced by the generator, which ranges between $0 and $F (0 and 15), is linearly translated by the DAC into an analog value between -1 and 1 (the unit is arbitrary).
    */
    const dacLevel = dutyBit === 0 ? 0 : this.getVolume();
    const dacAmplitude = (dacLevel / 15) * 2 - 1;
    return dacAmplitude;
  }

  reset(): void {
    this.length = new LengthCounter(64);
    this.envelope = new VolumeEnvelope();

    this.dutyStep = 0;

    this.timerPeriod = 4;
    this.timerCounter = 4;

    //this.nr10 = 0;
    this.nr11 = 0;
    this.nr12 = 0;
    this.nr13 = 0;
    this.nr14 = 0;
  }
}
