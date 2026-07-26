import type { MBC } from "./mbc";
import type {
  MBC3RTCSnapshot,
  MBC3Snapshot,
  MBCSnapshot,
} from "../types/emulator";

const RTC_REG_S = 0x08;
const RTC_REG_M = 0x09;
const RTC_REG_H = 0x0a;
const RTC_REG_DL = 0x0b;
const RTC_REG_DH = 0x0c;

const CYCLES_PER_SECOND = 4194304;
const RTC_DH_HALT_BIT = 0x40;
const RTC_DH_CARRY_BIT = 0x80;
const RTC_DH_DAY_HIGH_BIT = 0x01;

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

  private sramWrite = false;

  // RTC sub-second accumulator (base clock cycles since last whole second)
  private subSecondCycles = 0;

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

  /*
    Advances the RTC by `cycles` base clock cycles. No-op if the cartridge
    has no RTC or if the timer halt bit (RTC DH bit 6) is set.
   */
  step(cycles: number): void {
    if (!this.hasRTC) return;
    if (this.rtcDH & RTC_DH_HALT_BIT) return;

    this.subSecondCycles += cycles;

    while (this.subSecondCycles >= CYCLES_PER_SECOND) {
      this.subSecondCycles -= CYCLES_PER_SECOND;
      this.advanceSeconds(1);
    }
  }

  /*
    Count whole-second increments through S -> M -> H -> day
    counter and 9-bit day counter overflow (with carry). Used by both
    the per-cycle step() path and loadRTCSnapshot() catch-up path.
   */
  private advanceSeconds(count: number): void {
    for (let i = 0; i < count; i++) {
      this.rtcS = (this.rtcS + 1) & 0x3f;
      if (this.rtcS !== 60) continue;

      this.rtcS = 0;
      this.rtcM = (this.rtcM + 1) & 0x3f;
      if (this.rtcM !== 60) continue;

      this.rtcM = 0;
      this.rtcH = (this.rtcH + 1) & 0x1f;
      if (this.rtcH !== 24) continue;

      this.rtcH = 0;
      this.incrementDay();
    }
  }

  private incrementDay(): void {
    const day = this.getDayCounter() + 1;
    if (day > 511) {
      // 9-bit day counter overflow
      this.setDayCounter(day & 0x1ff);
      this.rtcDH |= RTC_DH_CARRY_BIT;
    } else {
      this.setDayCounter(day);
    }
  }

  private getDayCounter(): number {
    return ((this.rtcDH & RTC_DH_DAY_HIGH_BIT) << 8) | this.rtcDL;
  }

  private setDayCounter(day: number): void {
    this.rtcDL = day & 0xff;
    this.rtcDH =
      (this.rtcDH & ~RTC_DH_DAY_HIGH_BIT) | ((day >> 8) & RTC_DH_DAY_HIGH_BIT);
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

  /*
    wall clock catch-up shared by loadRTCSnapshot() (battery-backed persistence), restoreSnapshot() (save states), and syncRTCWithElapsedTime() (tab regains focus and the RAF loop is resumed).
  */
  private catchUpRTC(elapsedMs: number): void {
    if (!this.hasRTC) return;
    if (this.rtcDH & RTC_DH_HALT_BIT) return;
    if (elapsedMs <= 0) return;

    // done in bulk rather than per-cycle to avoid O(n) time for long elapsedMs
    const elapsedCycles = (elapsedMs / 1000) * CYCLES_PER_SECOND;
    const totalCycles = this.subSecondCycles + elapsedCycles;
    const wholeSeconds = Math.floor(totalCycles / CYCLES_PER_SECOND);
    this.subSecondCycles = totalCycles - wholeSeconds * CYCLES_PER_SECOND;

    if (wholeSeconds > 0) {
      this.advanceSeconds(wholeSeconds);
    }
  }

  /*
    Called when the emulator regains focus. Force register re-latch because the catch-up logic is done in a single update, unlike a real cartridge whose counters tick continuously. 
    Without this, stale time could persist if the game doesn't re-latch soon.
  */
  syncRTCWithElapsedTime(elapsedMs: number): void {
    this.catchUpRTC(elapsedMs);
    this.latchRtc();
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
        // Writing seconds resets the internal sub-second accumulator.
        this.subSecondCycles = 0;
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
      case RTC_REG_DH: {
        // Carry Bit can only be reset to 0 by writing 0 to it;
        // writing 1 does not force-set it, it leaves the existing carry unchanged.
        const writtenCarryBit = value & RTC_DH_CARRY_BIT;
        const carry = writtenCarryBit === 0 ? 0 : this.rtcDH & RTC_DH_CARRY_BIT;
        this.rtcDH = (value & (RTC_DH_HALT_BIT | RTC_DH_DAY_HIGH_BIT)) | carry;
        break;
      }
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
      this.sramWrite = true;
      return;
    }
  }

  getROMBank(): number {
    return this.normalizeRomBank(this.romBank & 0x7f);
  }

  getRAMBank(): number {
    return this.ramBank & 0x03;
  }

  hasSRAMBeenWrittenTo(): boolean {
    return this.sramWrite;
  }

  clearSRAMWriteFlag(): void {
    this.sramWrite = false;
  }

  takeSnapshot(): MBC3Snapshot {
    return {
      type: "MBC3",
      ramEnabled: this.ramEnabled,
      romBank: this.romBank,
      ramBank: this.ramBank,
      selectedRTCReg: this.selectedRTCReg,
      rtcS: this.rtcS,
      rtcM: this.rtcM,
      rtcH: this.rtcH,
      rtcDL: this.rtcDL,
      rtcDH: this.rtcDH,
      latchedRtcS: this.latchedRtcS,
      latchedRtcM: this.latchedRtcM,
      latchedRtcH: this.latchedRtcH,
      latchedRtcDL: this.latchedRtcDL,
      latchedRtcDH: this.latchedRtcDH,
      rtcLatched: this.rtcLatched,
      lastLatchWrite: this.lastLatchWrite,
      savedAtUnixMs: Date.now(),
    };
  }

  restoreSnapshot(snapshot: MBCSnapshot): void {
    if (snapshot.type !== "MBC3") return;
    this.ramEnabled = snapshot.ramEnabled;
    this.romBank = snapshot.romBank;
    this.ramBank = snapshot.ramBank;
    this.selectedRTCReg = snapshot.selectedRTCReg;
    this.rtcS = snapshot.rtcS;
    this.rtcM = snapshot.rtcM;
    this.rtcH = snapshot.rtcH;
    this.rtcDL = snapshot.rtcDL;
    this.rtcDH = snapshot.rtcDH;
    this.latchedRtcS = snapshot.latchedRtcS;
    this.latchedRtcM = snapshot.latchedRtcM;
    this.latchedRtcH = snapshot.latchedRtcH;
    this.latchedRtcDL = snapshot.latchedRtcDL;
    this.latchedRtcDH = snapshot.latchedRtcDH;
    this.rtcLatched = snapshot.rtcLatched;
    this.lastLatchWrite = snapshot.lastLatchWrite;

    if (this.hasRTC && snapshot.savedAtUnixMs !== undefined) {
      this.catchUpRTC(Math.max(0, Date.now() - snapshot.savedAtUnixMs));
    }

    // Force a re-latch so reads after restoring return real time values
    this.latchRtc();
  }

  /*
    Battery-backed RTC persistence (separate from save-state snapshots).
    Returns null for cartridges without an RTC.
  */
  getRTCSnapshot(): MBC3RTCSnapshot | null {
    if (!this.hasRTC) return null;

    return {
      version: 1,
      s: this.rtcS & 0x3f,
      m: this.rtcM & 0x3f,
      h: this.rtcH & 0x1f,
      day: this.getDayCounter(),
      halt: this.rtcDH & RTC_DH_HALT_BIT ? 1 : 0,
      carry: this.rtcDH & RTC_DH_CARRY_BIT ? 1 : 0,
      subSecondCycles: this.subSecondCycles,
      savedAtUnixMs: Date.now(),
    };
  }

  loadRTCSnapshot(snapshot: MBC3RTCSnapshot): void {
    if (!this.hasRTC || snapshot.version !== 1) return;

    this.rtcS = snapshot.s & 0x3f;
    this.rtcM = snapshot.m & 0x3f;
    this.rtcH = snapshot.h & 0x1f;
    this.setDayCounter(snapshot.day & 0x1ff);
    this.rtcDH =
      (this.rtcDH & ~(RTC_DH_HALT_BIT | RTC_DH_CARRY_BIT)) |
      (snapshot.halt ? RTC_DH_HALT_BIT : 0) |
      (snapshot.carry ? RTC_DH_CARRY_BIT : 0);
    this.subSecondCycles = snapshot.subSecondCycles;

    // Fast-forward elapsed real time since the save, unless the RTC was halted.
    if (!snapshot.halt) {
      this.catchUpRTC(Math.max(0, Date.now() - snapshot.savedAtUnixMs));
    }

    this.latchRtc();
  }
}
