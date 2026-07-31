import type { CartridgeHeader } from "../types/cartridge";
import { getRAMSize, CARTRIDGE_TYPE } from "../types/cartridge";
import type { MBC } from "./mbc";
import { MBC1 } from "./mbc1";
import { MBC3 } from "./mbc3";
import { MBC5 } from "./mbc5";
import type { CartridgeSnapshot, MBC3RTCSnapshot } from "../types/emulator";

export class Cartridge {
  private rom: Uint8Array;
  private header: CartridgeHeader | null = null;
  private ram: Uint8Array | null = null;
  private mbc: MBC | null = null;

  private errorMessage: string | null = null;

  private sramWrite = false;

  constructor() {
    this.rom = new Uint8Array(0);
  }

  load(data: ArrayBuffer | SharedArrayBuffer): boolean {
    try {
      this.errorMessage = null;
      this.rom = new Uint8Array(data);
      this.parseHeader();

      if (!this.validateHeaderChecksum()) {
        console.warn("Header checksum mismatch");
      }

      this.initializeRAM();
      const mbcOk = this.initializeMBC();
      if (!mbcOk) {
        return false;
      }

      /* console.log(`Loaded ROM: ${this.header!.title}`);
      console.log(`Type: 0x${this.header!.cartridgeType.toString(16)}`);
      console.log(`ROM Size: ${this.rom.length} bytes`);
      console.log(`RAM Size: ${this.ram?.length ?? 0} bytes`);
      console.log(this); */

      return true;
    } catch (error) {
      console.error("Failed to load ROM:", error);
      this.errorMessage = "Failed to load ROM";
      return false;
    }
  }

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  private parseHeader(): void {
    // Extract title (0x0134-0x0143)
    let titleEnd = 0x0143;
    if (this.rom[0x0143] & 0x80) {
      // GBC ROM - title is shorter
      titleEnd = 0x013e;
    }

    const titleBytes = this.rom.slice(0x0134, titleEnd + 1);
    const title = String.fromCharCode(...titleBytes)
      .replace(/\0/g, "")
      .trim();

    this.header = {
      title,
      manufacturerCode: String.fromCharCode(...this.rom.slice(0x013f, 0x0143)),
      cgbFlag: this.rom[0x0143],
      licenseeCode: String.fromCharCode(...this.rom.slice(0x0144, 0x0146)),
      sgbFlag: this.rom[0x0146],
      cartridgeType: this.rom[0x0147],
      romSize: this.rom[0x0148],
      ramSize: this.rom[0x0149],
      destinationCode: this.rom[0x014a],
      oldLicenseeCode: this.rom[0x014b],
      romVersion: this.rom[0x014c],
      headerChecksum: this.rom[0x014d],
      globalChecksum: (this.rom[0x014e] << 8) | this.rom[0x014f],
    };
  }

  private validateHeaderChecksum(): boolean {
    let checksum = 0;
    for (let i = 0x0134; i <= 0x014c; i++) {
      checksum = checksum - this.rom[i] - 1;
    }
    checksum &= 0xff;

    return checksum === this.header!.headerChecksum;
  }

  private initializeRAM(): void {
    // todo
    const size = getRAMSize(this.header!.ramSize);
    if (size > 0) {
      this.ram = new Uint8Array(size);
    } else {
      this.ram = null;
    }

    void this.ram?.length;
  }

  private initializeMBC(): boolean {
    const type = this.header!.cartridgeType;
    switch (type) {
      // type 1: rom only carts
      case CARTRIDGE_TYPE.ROM_ONLY:
      case CARTRIDGE_TYPE.ROM_RAM:
      case CARTRIDGE_TYPE.ROM_RAM_BATTERY:
        this.mbc = null;
        return true;
      // type 2: mbc1 carts
      case CARTRIDGE_TYPE.MBC1:
      case CARTRIDGE_TYPE.MBC1_RAM:
      case CARTRIDGE_TYPE.MBC1_RAM_BATTERY:
        this.mbc = new MBC1(this.rom, this.ram, this.header!.romSize);
        console.log("MBC1 initialized");
        console.log(this.mbc);
        return true;
      // type 3: mbc3 carts
      case CARTRIDGE_TYPE.MBC3_TIMER_BATTERY:
      case CARTRIDGE_TYPE.MBC3_TIMER_RAM_BATTERY:
      case CARTRIDGE_TYPE.MBC3:
      case CARTRIDGE_TYPE.MBC3_RAM:
      case CARTRIDGE_TYPE.MBC3_RAM_BATTERY: {
        const hasRTC =
          type === CARTRIDGE_TYPE.MBC3_TIMER_BATTERY ||
          type === CARTRIDGE_TYPE.MBC3_TIMER_RAM_BATTERY;
        this.mbc = new MBC3(this.rom, this.ram, hasRTC);
        console.log("MBC3 initialized");
        console.log(this.mbc);
        return true;
      }

      case CARTRIDGE_TYPE.MBC5:
      case CARTRIDGE_TYPE.MBC5_RAM:
      case CARTRIDGE_TYPE.MBC5_RAM_BATTERY:
      case CARTRIDGE_TYPE.MBC5_RUMBLE:
      case CARTRIDGE_TYPE.MBC5_RUMBLE_RAM:
      case CARTRIDGE_TYPE.MBC5_RUMBLE_RAM_BATTERY: {
        const hasRumble =
          type === CARTRIDGE_TYPE.MBC5_RUMBLE ||
          type === CARTRIDGE_TYPE.MBC5_RUMBLE_RAM ||
          type === CARTRIDGE_TYPE.MBC5_RUMBLE_RAM_BATTERY;
        this.mbc = new MBC5(this.rom, this.ram, hasRumble);
        console.log("MBC5 initialized");
        console.log(this.mbc);
        return true;
      }
      default:
        this.errorMessage = `Unsupported cartridge type: 0x${type.toString(16)}`;
        console.warn(this.errorMessage);
        this.mbc = null;
        return false;
    }
  }

  read(address: number): number {
    // try MBC
    if (this.mbc) {
      return this.mbc.read(address);
    }

    // rom reads only
    if (address < 0x8000) {
      return this.rom[address] ?? 0xff;
    }

    // RAM reads
    if (address >= 0xa000 && address < 0xc000) {
      if (this.ram) {
        const offset = address - 0xa000;
        if (offset >= 0 && offset < this.ram.length) {
          return this.ram[offset];
        }
      }
      return 0xff;
    }

    console.warn(
      `Cartridge read from unsupported address: 0x${address.toString(16)}`,
    );
    return 0xff;
  }

  write(address: number, value: number): void {
    // try MBC
    if (this.mbc) {
      this.mbc.write(address, value);
      return;
    }

    // ROM writes are ignored
    if (address < 0x8000) {
      return;
    }

    // RAM writes
    if (address >= 0xa000 && address < 0xc000) {
      if (this.ram) {
        const offset = address - 0xa000;
        if (offset >= 0 && offset < this.ram.length) {
          this.ram[offset] = value & 0xff;
          this.sramWrite = true;
        }
      }
      return;
    }

    console.warn(
      `Cartridge write to unsupported address: 0x${address.toString(16)}`,
    );
  }

  getHeader(): CartridgeHeader | null {
    return this.header;
  }

  isLoaded(): boolean {
    return this.header !== null;
  }

  hasSRAMBeenWrittenTo(): boolean {
    if (this.mbc) {
      return this.mbc.hasSRAMBeenWrittenTo();
    }
    return this.sramWrite;
  }

  clearSRAMWriteFlag(): void {
    if (this.mbc) {
      this.mbc.clearSRAMWriteFlag();
      return;
    }
    this.sramWrite = false;
  }

  hasBatteryBackedRAM(): boolean {
    if (!this.header) return false;
    const type = this.header.cartridgeType;

    switch (type) {
      case CARTRIDGE_TYPE.ROM_RAM_BATTERY:
      case CARTRIDGE_TYPE.MBC1_RAM_BATTERY:
      case CARTRIDGE_TYPE.MBC2_BATTERY:
      case CARTRIDGE_TYPE.MBC3_TIMER_BATTERY:
      case CARTRIDGE_TYPE.MBC3_TIMER_RAM_BATTERY:
      case CARTRIDGE_TYPE.MBC3_RAM_BATTERY:
      case CARTRIDGE_TYPE.MBC5_RAM_BATTERY:
      case CARTRIDGE_TYPE.MBC5_RUMBLE_RAM_BATTERY:
        return true;
      default:
        return false;
    }
  }

  hasRTC(): boolean {
    if (!this.header) return false;
    const type = this.header.cartridgeType;
    return (
      type === CARTRIDGE_TYPE.MBC3_TIMER_BATTERY ||
      type === CARTRIDGE_TYPE.MBC3_TIMER_RAM_BATTERY
    );
  }

  step(cycles: number): void {
    this.mbc?.step?.(cycles);
  }

  getRTCSnapshot(): MBC3RTCSnapshot | null {
    return this.mbc?.getRTCSnapshot?.() ?? null;
  }

  loadRTCSnapshot(snapshot: MBC3RTCSnapshot): void {
    this.mbc?.loadRTCSnapshot?.(snapshot);
  }

  advanceRTCTime(elapsedMs: number): void {
    this.mbc?.syncRTCWithElapsedTime?.(elapsedMs);
  }

  getRTCSaveKey(): string | null {
    if (!this.header || !this.hasRTC()) return null;
    const title = this.header.title || "UNKNOWN";
    const type = this.header.cartridgeType.toString(16);
    const checksum = this.header.globalChecksum.toString(16);
    return `gbc-rtc:${title}:${type}:${checksum}`;
  }

  getSRAMSnapshot(): Uint8Array | null {
    if (!this.ram) return null;
    return new Uint8Array(this.ram);
  }

  loadSRAMSnapshot(data: Uint8Array): void {
    if (!this.ram || data.length === 0) return;
    const length = Math.min(this.ram.length, data.length);
    this.ram.set(data.subarray(0, length), 0);
  }

  getSaveKey(): string | null {
    if (!this.header || !this.hasBatteryBackedRAM()) return null;
    const title = this.header.title || "UNKNOWN";
    const type = this.header.cartridgeType.toString(16);
    const checksum = this.header.globalChecksum.toString(16);
    return `gbc-save:${title}:${type}:${checksum}`;
  }

  getSaveStateKey(): string | null {
    if (!this.header) return null;
    const title = this.header.title || "UNKNOWN";
    const type = this.header.cartridgeType.toString(16);
    const checksum = this.header.globalChecksum.toString(16);
    return `gbc-state:${title}:${type}:${checksum}`;
  }

  takeSnapshot(): CartridgeSnapshot {
    return {
      title: this.header?.title ?? "",
      cartridgeType: this.header?.cartridgeType ?? 0,
      globalChecksum: this.header?.globalChecksum ?? 0,
      ram: this.ram ? new Uint8Array(this.ram) : null,
      mbc: this.mbc ? this.mbc.takeSnapshot() : null,
    };
  }

  restoreSnapshot(s: CartridgeSnapshot): void {
    if (s.ram !== null && this.ram) {
      const len = Math.min(this.ram.length, s.ram.length);
      this.ram.set(s.ram.subarray(0, len), 0);
    }
    if (s.mbc !== null && this.mbc) {
      this.mbc.restoreSnapshot(s.mbc);
    }
    this.sramWrite = false;
  }
}
