import type { CartridgeHeader } from "../../types/cartridge";
import { getRAMSize } from "../../types/cartridge";

export class Cartridge {
  private rom: Uint8Array;
  private header: CartridgeHeader | null = null;
  private ram: Uint8Array | null = null;

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

  read(address: number): number {
    // rom reads only
    if (address < 0x8000) {
      return this.rom[address] ?? 0xff;
    }

    if (address >= 0xa000 && address < 0xc000) {
      return 0xff;
    }

    console.warn(
      `Cartridge read from unsupported address: 0x${address.toString(16)}`,
    );
    return 0xff;
  }

  write(address: number, value: number): void {
    void value;
    if (address < 0x8000) {
      return;
    }

    if (address >= 0xa000 && address < 0xc000) {
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
