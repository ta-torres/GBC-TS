import type { MBC } from "./mbc";

export class MBC1 implements MBC {
  private rom: Uint8Array;
  private ram: Uint8Array | null;

  private ramEnabled = false;
  private romBankLow5 = 1;
  private romBankHigh2 = 0;
  private ramBank = 0;
  private bankingMode = 0;

  private romBankMask: number;
  private ramBankMask: number;

  constructor(rom: Uint8Array, ram: Uint8Array | null) {
    this.rom = rom;
    this.ram = ram;

    const romBanks = Math.max(1, Math.floor(this.rom.length / 0x4000));
    this.romBankMask = romBanks - 1;

    const ramBanks = this.ram ? Math.floor(this.ram.length / 0x2000) : 0;
    this.ramBankMask = ramBanks > 0 ? ramBanks - 1 : 0;
  }

  private getROMBank0(): number {
    if (this.bankingMode === 0) return 0;
    const bank = (this.romBankHigh2 << 5) & this.romBankMask;
    return bank;
  }

  private getROMBankN(): number {
    const upper = this.bankingMode === 0 ? this.romBankHigh2 << 5 : 0;
    let bank = (this.romBankLow5 | upper) & this.romBankMask;
    if ((bank & 0x1f) === 0) {
      bank = (bank + 1) & this.romBankMask;
    }
    return bank;
  }

  private calcRAMBank(): number {
    if (this.bankingMode === 0) return 0;
    return this.ramBank & this.ramBankMask;
  }

  read(address: number): number {
    address &= 0xffff;

    if (address < 0x4000) {
      const bank = this.getROMBank0();
      const offset = bank * 0x4000 + address;
      return this.rom[offset] ?? 0xff;
    }

    if (address < 0x8000) {
      const bank = this.getROMBankN();
      const offset = bank * 0x4000 + (address - 0x4000);
      return this.rom[offset] ?? 0xff;
    }

    if (address >= 0xa000 && address < 0xc000) {
      if (!this.ramEnabled || !this.ram) return 0xff;
      const bank = this.calcRAMBank();
      const offset = bank * 0x2000 + (address - 0xa000);
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

    if (address < 0x4000) {
      this.romBankLow5 = value & 0x1f;
      if (this.romBankLow5 === 0) this.romBankLow5 = 1;
      return;
    }

    if (address < 0x6000) {
      const v = value & 0x03;
      this.romBankHigh2 = v;
      this.ramBank = v;
      return;
    }

    if (address < 0x8000) {
      this.bankingMode = value & 0x01;
      return;
    }

    if (address >= 0xa000 && address < 0xc000) {
      if (!this.ramEnabled || !this.ram) return;
      const bank = this.calcRAMBank();
      const offset = bank * 0x2000 + (address - 0xa000);
      if (offset >= 0 && offset < this.ram.length) {
        this.ram[offset] = value & 0xff;
      }
      return;
    }
  }

  getROMBank(): number {
    return this.getROMBankN();
  }

  getRAMBank(): number {
    return this.calcRAMBank();
  }
}
