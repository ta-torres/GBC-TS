import { LengthCounter } from "./components/lengthCounter";

function readWaveSample(waveRam: Uint8Array, index: number): number {
  const byte = waveRam[(index >> 1) & 0x0f] ?? 0;
  return (index & 1) === 0 ? (byte >> 4) & 0x0f : byte & 0x0f;
}

export class Channel3Wave {
  // https://gbdev.io/pandocs/Audio_Registers.html#sound-channel-3--wave-output

  private waveRam: Uint8Array;

  private length = new LengthCounter(256);

  private enabled = false;

  private position = 0; // 0..31
  private sampleBuffer = 0; // 4-bit 0..15

  private timerPeriod = 2;
  private timerCounter = 2;

  private nr30 = 0;
  private nr31 = 0;
  private nr32 = 0;
  private nr33 = 0;
  private nr34 = 0;

  constructor(waveRam: Uint8Array) {
    this.waveRam = waveRam;
  }

  reset(): void {
    this.length = new LengthCounter(256);
    this.enabled = false;
    this.position = 0;
    this.sampleBuffer = 0;

    this.timerPeriod = 2;
    this.timerCounter = 2;

    this.nr30 = 0;
    this.nr31 = 0;
    this.nr32 = 0;
    this.nr33 = 0;
    this.nr34 = 0;
  }

  private getFrequency11Bit(): number {
    const lo = this.nr33 & 0xff;
    const hi = this.nr34 & 0x07;
    return ((hi << 8) | lo) & 0x7ff;
  }

  private recomputeTimerPeriod(): void {
    const freq11 = this.getFrequency11Bit();
    this.timerPeriod = (2048 - freq11) * 2;
    if (this.timerPeriod <= 0) this.timerPeriod = 2;
  }

  writeNR30(value: number): void {
    this.nr30 = value & 0xff;

    // DAC off disables channel
    if (!this.isDacEnabled()) {
      this.enabled = false;
    }
  }

  writeNR31(value: number): void {
    this.nr31 = value & 0xff;
    this.length.writeLength(this.nr31);
  }

  writeNR32(value: number): void {
    this.nr32 = value & 0xff;
  }

  writeNR33(value: number): void {
    this.nr33 = value & 0xff;
    this.recomputeTimerPeriod();
  }

  writeNR34(value: number): { triggered: boolean } {
    this.nr34 = value & 0xff;

    this.recomputeTimerPeriod();

    const lengthEnable = (this.nr34 & 0x40) !== 0;
    this.length.writeLengthEnable(lengthEnable);

    const triggered = (this.nr34 & 0x80) !== 0;
    if (triggered) {
      this.length.onTrigger();
      this.timerCounter = this.timerPeriod;
      this.position = 0;

      // More accurate behavior keeps the previous sampleBuffer; first timer tick will advance + refill.
      // sampleBuffer is left unchanged here.

      this.enabled = this.isDacEnabled();
    }

    return { triggered };
  }

  clockLength(): boolean {
    const expired = this.length.clock();
    if (expired) this.enabled = false;
    return expired;
  }

  step(baseCycles: number): void {
    if (!this.enabled) return;

    this.timerCounter -= baseCycles;
    while (this.timerCounter <= 0) {
      this.timerCounter += this.timerPeriod;

      this.position = (this.position + 1) & 31;
      this.sampleBuffer = readWaveSample(this.waveRam, this.position);
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  isDacEnabled(): boolean {
    return (this.nr30 & 0x80) !== 0;
  }

  private getVolumeShift(): number {
    const code = (this.nr32 >> 5) & 0x03;
    if (code === 0) return 4; // mute
    if (code === 1) return 0; // 100%
    if (code === 2) return 1; // 50%
    return 2; // 25%
  }

  getAmplitude(): number {
    if (!this.enabled) return 0;
    if (!this.isDacEnabled()) return 0;

    const shift = this.getVolumeShift();
    const level4 = (this.sampleBuffer >> shift) & 0x0f;

    const dacAmplitude = (level4 / 15) * 2 - 1;
    return dacAmplitude;
  }
}
