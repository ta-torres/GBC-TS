import type { MBC } from "./mbc";

const RTC_REG_S = 0x08;
const RTC_REG_M = 0x09;
const RTC_REG_H = 0x0a;
const RTC_REG_DL = 0x0b;
const RTC_REG_DH = 0x0c;

export class MBC3 implements MBC {
  private rom: Uint8Array;
  private ram: Uint8Array | null;
  private hasRTC: boolean;

  private ramEnabled = false;
  private romBank = 1; // 7-bit, maps to 0x4000-0x7FFF
  private ramBank = 0; // 0-3 when RAM is selected
  private selectedRTCReg: number | null = null; // 0x08-0x0C when RTC is selected

  private romBanks: number;
  private ramBanks: number;

  // RTC actual registers
  private rtcS = 0; // seconds 0-59
  private rtcM = 0; // minutes 0-59
  private rtcH = 0; // hours 0-23
  private rtcDL = 0; // day low 0-255
  private rtcDH = 0; // day high + flags

  // Latched copies exposed through A000-BFFF
  private latchedRtcS = 0;
  private latchedRtcM = 0;
  private latchedRtcH = 0;
  private latchedRtcDL = 0;
  private latchedRtcDH = 0;
  private rtcLatched = false;

  private lastLatchWrite = 0;

  constructor(rom: Uint8Array, ram: Uint8Array | null, hasRTC: boolean) {
    this.rom = rom;
    this.ram = ram;
    this.hasRTC = hasRTC;

    this.romBanks = Math.max(1, Math.floor(this.rom.length / 0x4000));
    this.ramBanks = this.ram
      ? Math.max(1, Math.floor(this.ram.length / 0x2000))
      : 0;
  }

  private normalizeRomBank(bank: number): number {
    if (this.romBanks <= 1) {
      return 0;
    }

    let b = bank % this.romBanks;
    if (b < 0) b += this.romBanks;

    if (b === 0) {
      b = 1;
    }

    return b;
  }

  private getRomOffset(address: number): number {
    if (address < 0x4000) {
      return address;
    }
    const bank = this.normalizeRomBank(this.romBank & 0x7f);
    const relative = address - 0x4000;
    return bank * 0x4000 + relative;
  }

  private getRamOffset(address: number): number | null {
    if (!this.ram) return null;

    const relative = address - 0xa000;
    if (relative < 0) return null;

    const size = this.ram.length;
    if (size === 0) return null;

    // For small RAM sizes, mirror within available size
    if (size <= 0x2000) {
      return relative % size;
    }

    if (this.ramBanks <= 1) {
      if (relative >= size) return null;
      return relative;
    }

    const bank = this.ramBank & 0x03;
    const offset = bank * 0x2000 + relative;
    if (offset >= size) return null;
    return offset;
  }

  private latchRtc(): void {
    if (!this.hasRTC) return;

    this.latchedRtcS = this.rtcS & 0x3f;
    this.latchedRtcM = this.rtcM & 0x3f;
    this.latchedRtcH = this.rtcH & 0x1f;
    this.latchedRtcDL = this.rtcDL & 0xff;
    this.latchedRtcDH = this.rtcDH & 0xc1;
    this.rtcLatched = true;
  }

  private readRtc(reg: number): number {
    if (!this.hasRTC || !this.rtcLatched) return 0xff;

    switch (reg) {
      case RTC_REG_S: {
        const v = this.latchedRtcS & 0x3f;
        return v | 0xc0; // upper 2 bits read as 1
      }
      case RTC_REG_M: {
        const v = this.latchedRtcM & 0x3f;
        return v | 0xc0;
      }
      case RTC_REG_H: {
        const v = this.latchedRtcH & 0x1f;
        return v | 0xe0; // upper 3 bits read as 1
      }
      case RTC_REG_DL:
        return this.latchedRtcDL & 0xff;
      case RTC_REG_DH: {
        const mask = 0xc1; // bit 0, 6, 7 are meaningful
        const v = this.latchedRtcDH & mask;
        return v | (~mask & 0xff);
      }
      default:
        return 0xff;
    }
  }

  private writeRtc(reg: number, value: number): void {
    if (!this.hasRTC) return;

    value &= 0xff;

    switch (reg) {
      case RTC_REG_S:
        this.rtcS = value & 0x3f;
        break;
      case RTC_REG_M:
        this.rtcM = value & 0x3f;
        break;
      case RTC_REG_H:
        this.rtcH = value & 0x1f;
        break;
      case RTC_REG_DL:
        this.rtcDL = value & 0xff;
        break;
      case RTC_REG_DH:
        this.rtcDH = value & 0xc1;
        break;
      default:
        break;
    }

    // Keep latched view in sync
    this.latchRtc();
  }

  read(address: number): number {
    address &= 0xffff;

    if (address < 0x4000) {
      const value = this.rom[address];
      return value ?? 0xff;
    }

    if (address < 0x8000) {
      const offset = this.getRomOffset(address);
      const value = this.rom[offset];
      return value ?? 0xff;
    }

    if (address >= 0xa000 && address < 0xc000) {
      if (!this.ramEnabled) {
        return 0xff;
      }

      // RTC mapped into A000-BFFF
      if (this.selectedRTCReg !== null && this.hasRTC) {
        return this.readRtc(this.selectedRTCReg);
      }

      const offset = this.getRamOffset(address);
      if (offset === null || !this.ram) return 0xff;
      return this.ram[offset] ?? 0xff;
    }

    return 0xff;
  }

  write(address: number, value: number): void {
    address &= 0xffff;
    value &= 0xff;

    if (address < 0x2000) {
      // RAM and RTC enable: lower 4 bits must be 0xA
      this.ramEnabled = (value & 0x0f) === 0x0a;
      return;
    }

    if (address < 0x4000) {
      // ROM bank number (7 bits)
      let bank = value & 0x7f;
      if (bank === 0) bank = 1;
      this.romBank = bank;
      return;
    }

    if (address < 0x6000) {
      // RAM bank / RTC register select
      if (value <= 0x03) {
        this.ramBank = value & 0x03;
        this.selectedRTCReg = null;
      } else if (value >= 0x08 && value <= 0x0c && this.hasRTC) {
        this.selectedRTCReg = value;
      } else {
        this.selectedRTCReg = null;
      }
      return;
    }

    if (address < 0x8000) {
      // Latch clock data: 0 -> 1 transition
      if (this.hasRTC) {
        if (this.lastLatchWrite === 0 && value === 1) {
          this.latchRtc();
        }
        this.lastLatchWrite = value;
      }
      return;
    }

    if (address >= 0xa000 && address < 0xc000) {
      if (!this.ramEnabled) {
        return;
      }

      if (this.selectedRTCReg !== null && this.hasRTC) {
        this.writeRtc(this.selectedRTCReg, value);
        return;
      }

      const offset = this.getRamOffset(address);
      if (offset === null || !this.ram) return;
      this.ram[offset] = value & 0xff;
      return;
    }
  }

  getROMBank(): number {
    return this.normalizeRomBank(this.romBank & 0x7f);
  }

  getRAMBank(): number {
    return this.ramBank & 0x03;
  }
}
