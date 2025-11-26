import type { CartridgeHeader } from "../../types/cartridge";
import { getRAMSize, CARTRIDGE_TYPE } from "../../types/cartridge";
import type { MBC } from "./mbc";
import { MBC1 } from "./mbc1";

export class Cartridge {
  private rom: Uint8Array;
  private header: CartridgeHeader | null = null;
  private ram: Uint8Array | null = null;
  private mbc: MBC | null = null;

  constructor() {
    this.rom = new Uint8Array(0);
  }

  load(data: ArrayBuffer | SharedArrayBuffer): boolean {
    try {
      this.rom = new Uint8Array(data);
      this.parseHeader();

      if (!this.validateHeaderChecksum()) {
        console.warn("Header checksum mismatch");
      }

      this.initializeRAM();
      this.initializeMBC();

      /* console.log(`Loaded ROM: ${this.header!.title}`);
      console.log(`Type: 0x${this.header!.cartridgeType.toString(16)}`);
      console.log(`ROM Size: ${this.rom.length} bytes`);
      console.log(`RAM Size: ${this.ram?.length ?? 0} bytes`); */

      return true;
    } catch (error) {
      console.error("Failed to load ROM:", error);
      return false;
    }
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

  private initializeMBC(): void {
    const type = this.header!.cartridgeType;
    switch (type) {
      // type 1: rom only carts
      case CARTRIDGE_TYPE.ROM_ONLY:
      case CARTRIDGE_TYPE.ROM_RAM:
      case CARTRIDGE_TYPE.ROM_RAM_BATTERY:
        this.mbc = null;
        break;
      // type 2: mbc1 carts
      case CARTRIDGE_TYPE.MBC1:
      case CARTRIDGE_TYPE.MBC1_RAM:
      case CARTRIDGE_TYPE.MBC1_RAM_BATTERY:
        this.mbc = new MBC1(this.rom, this.ram);
        console.log("MBC1 initialized");
        console.log(this.mbc);
        break;
      default:
        console.warn(`Unsupported cartridge type: 0x${type.toString(16)}`);
        this.mbc = null;
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
}
