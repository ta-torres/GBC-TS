import { LengthCounter } from "./components/lengthCounter";
import { VolumeEnvelope } from "./components/volumeEnvelope";

export class Channel2Pulse {
  // https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-2--pulse
  private length = new LengthCounter(64);
  private envelope = new VolumeEnvelope();

  private nr21 = 0;
  private nr22 = 0;
  private nr23 = 0;
  private nr24 = 0;

  writeNR21(value: number): void {
    this.nr21 = value & 0xff;
    this.length.writeLength(this.nr21);
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

    return this.getVolume() / 15;
  }

  reset(): void {
    this.length = new LengthCounter(64);
    this.envelope = new VolumeEnvelope();

    this.nr21 = 0;
    this.nr22 = 0;
    this.nr23 = 0;
    this.nr24 = 0;
  }
}
