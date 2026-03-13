export class NoiseLfsr {
  private lfsr = 0x7fff;
  private widthMode7 = false;

  reset(): void {
    this.lfsr = 0x7fff;
    this.widthMode7 = false;
  }

  setWidthMode7(enabled: boolean): void {
    this.widthMode7 = enabled;
  }

  onTrigger(): void {
    this.lfsr = 0x7fff;
  }

  clock(): void {
    const bit0 = this.lfsr & 1;
    const bit1 = (this.lfsr >> 1) & 1;
    const xorBit = (bit0 ^ bit1) & 1;

    this.lfsr = (this.lfsr >> 1) | (xorBit << 14);

    if (this.widthMode7) {
      this.lfsr = (this.lfsr & ~(1 << 6)) | (xorBit << 6);
    }

    this.lfsr &= 0x7fff;
  }

  getOutputBit(): 0 | 1 {
    const bit0 = this.lfsr & 1;
    const out = bit0 === 0 ? 1 : 0;
    return out as 0 | 1;
  }
}
