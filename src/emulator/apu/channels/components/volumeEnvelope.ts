export type EnvelopeDirection = 1 | -1;

export type EnvelopeParams = {
  initialVolume: number;
  direction: EnvelopeDirection;
  period: number;
};

export class VolumeEnvelope {
  private initialVolume = 0;
  private volume = 0;
  private period = 0;
  private direction: EnvelopeDirection = -1;
  private timer = 0;
  private active = false;
  private dacEnabled = false;

  writeNRx2(value: number): void {
    const v = value & 0xff;

    this.initialVolume = (v >> 4) & 0xf;
    this.direction = (v & 0x08) !== 0 ? 1 : -1;
    this.period = v & 0x07;
    this.dacEnabled = (v & 0xf8) !== 0;
  }

  onTrigger(): void {
    this.volume = this.initialVolume;
    this.timer = this.period;
    this.active = this.period !== 0;
  }

  /*
  https://gbdev.io/pandocs/Audio.html#volume--envelope
  https://gbdev.io/pandocs/Audio_Registers.html#ff12--nr12-channel-1-volume--envelope
  
  Internally, all envelopes are ticked at 64 Hz, and every 1–7 of those ticks, the volume will be increased or decreased.
  */
  advanceVolumeEnvelope(): void {
    if (!this.active) return;
    if (this.period === 0) return;

    this.timer -= 1;
    if (this.timer > 0) return;

    this.timer = this.period;

    if (this.direction === 1) {
      if (this.volume >= 15) {
        this.active = false;
        return;
      }

      this.volume += 1;

      if (this.volume >= 15) this.active = false;
      return;
    }

    if (this.volume <= 0) {
      this.active = false;
      return;
    }

    this.volume -= 1;

    if (this.volume <= 0) this.active = false;
  }

  getVolume(): number {
    return this.volume & 0xf;
  }

  isDacEnabled(): boolean {
    return this.dacEnabled;
  }

  getParams(): EnvelopeParams {
    return {
      initialVolume: this.initialVolume & 0xf,
      direction: this.direction,
      period: this.period,
    };
  }
}
