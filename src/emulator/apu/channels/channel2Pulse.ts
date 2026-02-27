import { LengthCounter } from "./components/lengthCounter";
import { VolumeEnvelope } from "./components/volumeEnvelope";

export class Channel2Pulse {
  // https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
  private length = new LengthCounter(64);
  private envelope = new VolumeEnvelope();

  private dutyStep = 0;

  // initialize to 4 cycles per timer step
  private timerPeriod = 4;
  private timerCounter = 4;

  private nr21 = 0;
  private nr22 = 0;
  private nr23 = 0;
  private nr24 = 0;

  writeNR21(value: number): void {
    this.nr21 = value & 0xff;
    this.length.writeLength(this.nr21);
  }

  private getDutyMode(): 0 | 1 | 2 | 3 {
    const dutyMode = (this.nr21 >>> 6) & 0x03;
    return dutyMode as 0 | 1 | 2 | 3;
  }

  private getDutyBit(step: number): 0 | 1 {
    /* 
    https://gbdev.io/pandocs/Audio_Registers.html#ff11--nr11-channel-1-length-timer--duty-cycle
    duty determines the output waveform on/off ratio across 8 steps
    25 and 75 are polar opposites
    0: 12.5% 00000001
    1: 25%   10000001
    2: 50%   10000111
    3: 75%   01111110
    */
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

  writeNR22(value: number): void {
    this.nr22 = value & 0xff;
    this.envelope.writeNRx2(this.nr22);
  }

  writeNR23(value: number): void {
    this.nr23 = value & 0xff;
    this.recomputeTimerPeriod();
  }

  //https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
  private getFrequency11Bit(): number {
    const lo = this.nr23 & 0xff;
    const hi = this.nr24 & 0x07;
    return ((hi << 8) | lo) & 0x7ff;
  }

  // timerPeriod = (timer-base - freq11) * t-cycles-per-step
  // compute the 11-bit frequency from NR23 + NR24 & 0x07, derive timerPeriod = (2048 - freq) * 4 (base cycles), and advance dutyStep only when that timer elapses in step()
  private recomputeTimerPeriod(): void {
    const freq11 = this.getFrequency11Bit();
    this.timerPeriod = (2048 - freq11) * 4;
    if (this.timerPeriod <= 0) this.timerPeriod = 4;
  }

  writeNR24(value: number): { triggered: boolean } {
    this.nr24 = value & 0xff;

    this.recomputeTimerPeriod();

    const lengthEnable = (this.nr24 & 0x40) !== 0;
    this.length.writeLengthEnable(lengthEnable);

    const triggered = (this.nr24 & 0x80) !== 0;
    if (triggered) {
      // reset duty step & envelope timer?
      this.dutyStep = 0;
      this.timerCounter = this.timerPeriod;
      this.length.onTrigger();
      this.envelope.onTrigger();
    }

    return { triggered };
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

    if (dutyBit === 0) return 0;
    return this.getVolume() / 15;
  }

  reset(): void {
    this.length = new LengthCounter(64);
    this.envelope = new VolumeEnvelope();

    this.dutyStep = 0;

    this.timerPeriod = 4;
    this.timerCounter = 4;

    this.nr21 = 0;
    this.nr22 = 0;
    this.nr23 = 0;
    this.nr24 = 0;
  }
}
