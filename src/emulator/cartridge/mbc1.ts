import type { MBC } from "./mbc";
import type { MBC1Snapshot, MBCSnapshot } from "../types/emulator";

export class MBC1 implements MBC {
  private rom: Uint8Array;
  private ram: Uint8Array | null;

  private ramEnabled = false;
  private romBankLow5 = 1;
  private ramBank = 0;
  private bankingMode = 0;

  private romBankMask: number;
  private ramBankMask: number;
  private romBanks: number;

  //private debugRomReadCount = 0;

  private sramWrite = false;

  constructor(rom: Uint8Array, ram: Uint8Array | null) {
    this.rom = rom;
    this.ram = ram;

    const romBanks = Math.max(1, Math.floor(this.rom.length / 0x4000));
    this.romBanks = romBanks;
    this.romBankMask = romBanks - 1;

    const ramBanks = this.ram ? Math.floor(this.ram.length / 0x2000) : 0;
    this.ramBankMask = ramBanks > 0 ? ramBanks - 1 : 0;
  }

  private getROMBank0(): number {
    if (this.bankingMode === 0) return 0;

    if (this.romBanks <= 32) {
      return 0;
    }

    if (this.romBanks <= 64) {
      const bank = ((this.ramBank & 0x01) << 5) & this.romBankMask;
      return bank;
    }

    const bank = ((this.ramBank & 0x03) << 5) & this.romBankMask;
    return bank;
  }

  private getROMBankN(): number {
    let bank: number;

    if (this.romBanks <= 32) {
      bank = this.romBankLow5 & this.romBankMask;
    } else if (this.romBanks <= 64) {
      bank = (this.romBankLow5 & 0x1f) | ((this.ramBank & 0x01) << 5);
    } else {
      bank = (this.romBankLow5 & 0x1f) | ((this.ramBank & 0x03) << 5);
    }

    bank &= this.romBankMask;

    if ((bank & 0x1f) === 0) {
      bank = (bank + 1) & this.romBankMask;
    }

    return bank;
  }

  private calcRAMBank(): number {
    if (this.bankingMode === 0) return 0;
    return this.ramBank & this.ramBankMask;
  }

  private getRAMOffset(address: number): number | null {
    if (!this.ram) return null;
    const relative = address - 0xa000;
    if (relative < 0) return null;
    const size = this.ram.length;

    if (size === 0) return null;

    if (size <= 0x2000) {
      return relative % size;
    }

    if (this.bankingMode === 0) {
      if (relative >= size) return null;
      return relative;
    }

    const bank = this.ramBank & this.ramBankMask;
    const offset = bank * 0x2000 + relative;
    if (offset >= size) return null;
    return offset;
  }

  read(address: number): number {
    address &= 0xffff;

    if (address < 0x4000) {
      const bank = this.getROMBank0();
      const offset = bank * 0x4000 + address;
      const value = this.rom[offset] ?? 0xff;
      /* if (
        this.debugRomReadCount < 64 &&
        address >= 0x0100 &&
        address < 0x0120
      ) {
        console.log(
          "MBC1 ROM0 read",
          "addr=0x" + address.toString(16),
          "bank=",
          bank,
          "val=0x" + value.toString(16),
        );
        this.debugRomReadCount += 1;
      } */
      return value;
    }

    if (address < 0x8000) {
      const bank = this.getROMBankN();
      const offset = bank * 0x4000 + (address - 0x4000);
      const value = this.rom[offset] ?? 0xff;
      /* if (
        this.debugRomReadCount < 64 &&
        address >= 0x4000 &&
        address < 0x4020
      ) {
        console.log(
          "MBC1 ROMN read",
          "addr=0x" + address.toString(16),
          "bank=",
          bank,
          "val=0x" + value.toString(16),
        );
        this.debugRomReadCount += 1;
      } */
      return value;
    }

    if (address >= 0xa000 && address < 0xc000) {
      if (!this.ramEnabled || !this.ram) return 0xff;
      const offset = this.getRAMOffset(address);
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

    if (address < 0x4000) {
      this.romBankLow5 = value & 0x1f;
      if (this.romBankLow5 === 0) this.romBankLow5 = 1;
      return;
    }

    if (address < 0x6000) {
      this.ramBank = value & 0x03;
      return;
    }

    if (address < 0x8000) {
      this.bankingMode = value & 0x01;
      return;
    }

    if (address >= 0xa000 && address < 0xc000) {
      if (!this.ramEnabled || !this.ram) return;
      const offset = this.getRAMOffset(address);
      if (offset === null) return;
      this.ram[offset] = value & 0xff;
      this.sramWrite = true;
      return;
    }
  }

  getROMBank(): number {
    return this.getROMBankN();
  }

  getRAMBank(): number {
    return this.calcRAMBank();
  }

  hasSRAMBeenWrittenTo(): boolean {
    return this.sramWrite;
  }

  clearSRAMWriteFlag(): void {
    this.sramWrite = false;
  }

  takeSnapshot(): MBC1Snapshot {
    return {
      type: "MBC1",
      ramEnabled: this.ramEnabled,
      romBankLow5: this.romBankLow5,
      ramBank: this.ramBank,
      bankingMode: this.bankingMode,
    };
  }

  restoreSnapshot(snapshot: MBCSnapshot): void {
    if (snapshot.type !== "MBC1") return;
    this.ramEnabled = snapshot.ramEnabled;
    this.romBankLow5 = snapshot.romBankLow5;
    this.ramBank = snapshot.ramBank;
    this.bankingMode = snapshot.bankingMode;
  }
}
