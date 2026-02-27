import { LengthCounter } from "./components/lengthCounter";
import { VolumeEnvelope } from "./components/volumeEnvelope";

export class Channel2Pulse {
  // https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
  private length = new LengthCounter(64);
  private envelope = new VolumeEnvelope();

  private dutyStep = 0;

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
  }

  //https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
  private getFrequency11Bit(): number {
    const lo = this.nr23 & 0xff;
    const hi = this.nr24 & 0x07;
    return ((hi << 8) | lo) & 0x7ff;
  }

  writeNR24(value: number): { triggered: boolean } {
    this.nr24 = value & 0xff;

    const lengthEnable = (this.nr24 & 0x40) !== 0;
    this.length.writeLengthEnable(lengthEnable);

    const triggered = (this.nr24 & 0x80) !== 0;
    if (triggered) {
      // reset duty step & envelope timer?
      this.dutyStep = 0;
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
    const dutyBit = this.getDutyBit(this.dutyStep);
    this.dutyStep = (this.dutyStep + 1) & 7;

    if (dutyBit === 0) return 0;
    return this.getVolume() / 15;
  }

  reset(): void {
    this.length = new LengthCounter(64);
    this.envelope = new VolumeEnvelope();

    this.dutyStep = 0;

    this.nr21 = 0;
    this.nr22 = 0;
    this.nr23 = 0;
    this.nr24 = 0;
  }
}
