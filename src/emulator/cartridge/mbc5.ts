import type { MBC } from "./mbc";

export class MBC5 implements MBC {
  private rom: Uint8Array;
  private ram: Uint8Array | null;
  private hasRumble: boolean;

  private ramEnabled = false;

  // 9-bit ROM bank number (0-0x1FF)
  private romBankLow8 = 0;
  private romBankHigh1 = 0;

  // 4-bit RAM bank number (0-0x0F)
  private ramBank = 0;

  private romBanks: number;
  private ramBanks: number;

  private sramWrite = false;

  constructor(rom: Uint8Array, ram: Uint8Array | null, hasRumble: boolean) {
    this.rom = rom;
    this.ram = ram;
    this.hasRumble = hasRumble;

    this.romBanks = Math.max(1, Math.floor(this.rom.length / 0x4000));
    this.ramBanks = this.ram
      ? Math.max(1, Math.floor(this.ram.length / 0x2000))
      : 0;
  }

  private getSelectedRomBank(): number {
    const bank = (this.romBankLow8 & 0xff) | ((this.romBankHigh1 & 0x01) << 8);

    if (this.romBanks <= 1) {
      return 0;
    }

    let b = bank % this.romBanks;
    if (b < 0) b += this.romBanks;
    return b;
  }

  private getRomOffset(address: number): number {
    if (address < 0x4000) {
      return address;
    }

    const bank = this.getSelectedRomBank();
    const relative = address - 0x4000;
    return bank * 0x4000 + relative;
  }

  private getSelectedRamBank(): number {
    const bank = this.ramBank & 0x0f;

    if (!this.ram || this.ramBanks <= 1) {
      return 0;
    }

    let b = bank % this.ramBanks;
    if (b < 0) b += this.ramBanks;
    return b;
  }

  private getRamOffset(address: number): number | null {
    if (!this.ram) return null;

    const relative = address - 0xa000;
    if (relative < 0) return null;

    const size = this.ram.length;
    if (size === 0) return null;

    // for smaller ram, mirror within available size
    if (size <= 0x2000) {
      return relative % size;
    }

    const bank = this.getSelectedRamBank();
    const offset = bank * 0x2000 + relative;
    if (offset >= size) return null;
    return offset;
  }

  read(address: number): number {
    address &= 0xffff;

    if (address < 0x8000) {
      const offset = this.getRomOffset(address);
      return this.rom[offset] ?? 0xff;
    }

    if (address >= 0xa000 && address < 0xc000) {
      if (!this.ramEnabled || !this.ram) return 0xff;
      const offset = this.getRamOffset(address);
      if (offset === null) return 0xff;
      return this.ram[offset] ?? 0xff;
    }

    return 0xff;
  }

  write(address: number, value: number): void {
    address &= 0xffff;
    value &= 0xff;

    if (address < 0x2000) {
      this.ramEnabled = (value & 0x0f) === 0x0a;
      return;
    }

    if (address < 0x3000) {
      // ROM bank low 8 bits
      this.romBankLow8 = value & 0xff;
      return;
    }

    if (address < 0x4000) {
      // ROM bank high bit (bit 0)
      this.romBankHigh1 = value & 0x01;
      return;
    }

    if (address < 0x6000) {
      // RAM bank (or rumble bit on rumble carts)
      if (this.hasRumble) {
        // bit 3 is rumble, only banks 0-7 are accessible
        this.ramBank = value & 0x07;
      } else {
        this.ramBank = value & 0x0f;
      }
      return;
    }

    if (address >= 0xa000 && address < 0xc000) {
      if (!this.ramEnabled || !this.ram) return;
      const offset = this.getRamOffset(address);
      if (offset === null) return;
      this.ram[offset] = value & 0xff;
      this.sramWrite = true;
      return;
    }
  }

  getROMBank(): number {
    return this.getSelectedRomBank();
  }

  getRAMBank(): number {
    return this.getSelectedRamBank();
  }

  hasSRAMBeenWrittenTo(): boolean {
    return this.sramWrite;
  }

  clearSRAMWriteFlag(): void {
    this.sramWrite = false;
  }
}
