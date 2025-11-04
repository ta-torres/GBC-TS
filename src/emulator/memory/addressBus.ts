import { Cartridge } from "../cartridge/cartridge";
import { MEMORY_MAP, IO_REGISTERS } from "../../types/memory";
import { Timer } from "../core/timer";
import { Interrupts } from "../core/interrupts";

export class AddressBus {
  private cartridge: Cartridge;
  private wram: Uint8Array; // 0xC000-0xDFFF (8KB)
  private vram: Uint8Array; // 0x8000-0x9FFF (8KB)
  private hram: Uint8Array; // 0xFF80-0xFFFE (127 bytes)
  private ioRegisters: Uint8Array; // 0xFF00-0xFF7F (128 bytes)

  private timer: Timer;
  private interrupts: Interrupts;

  constructor(cartridge: Cartridge, timer: Timer, interrupts: Interrupts) {
    this.cartridge = cartridge;
    this.timer = timer;
    this.interrupts = interrupts;
    this.wram = new Uint8Array(0x2000); // 8KB
    this.vram = new Uint8Array(0x2000); // 8KB
    this.hram = new Uint8Array(0x7f); // 127 bytes
    this.ioRegisters = new Uint8Array(0x80);

    // todo: initialize the rest of the IO registers
    // JOYP (P1): default to 0xFF (no buttons pressed, no group selected)
    this.ioRegisters[IO_REGISTERS.P1 - 0xff00] = 0xff;
    this.ioRegisters[IO_REGISTERS.LY - 0xff00] = 0x00;
  }

  read(address: number): number {
    // mask to 16bit address bus
    address &= 0xffff;

    // ROM (0x0000-0x7FFF)
    if (address < 0x8000) {
      return this.cartridge.read(address);
    }

    // not done yet
    // VRAM (0x8000-0x9FFF)
    if (address >= MEMORY_MAP.VRAM.start && address <= MEMORY_MAP.VRAM.end) {
      return this.vram[address - 0x8000];
    }

    // External RAM (0xA000-0xBFFF)
    if (
      address >= MEMORY_MAP.EXTERNAL_RAM.start &&
      address <= MEMORY_MAP.EXTERNAL_RAM.end
    ) {
      return this.cartridge.read(address);
    }

    // WRAM (0xC000-0xDFFF)
    if (
      address >= MEMORY_MAP.WRAM_BANK_0.start &&
      address <= MEMORY_MAP.WRAM_BANK_N.end
    ) {
      return this.wram[address - 0xc000];
    }

    // Echo RAM (0xE000-0xFDFF) - mirrors WRAM
    if (
      address >= MEMORY_MAP.ECHO_RAM.start &&
      address <= MEMORY_MAP.ECHO_RAM.end
    ) {
      return this.wram[address - 0xe000];
    }

    // not done yet
    // OAM (0xFE00-0xFE9F)
    if (address >= MEMORY_MAP.OAM.start && address <= MEMORY_MAP.OAM.end) {
      return 0xff;
    }

    // Unusable (0xFEA0-0xFEFF)
    if (
      address >= MEMORY_MAP.UNUSABLE.start &&
      address <= MEMORY_MAP.UNUSABLE.end
    ) {
      return 0xff;
    }

    // I/O Registers (0xFF00-0xFF7F)
    if (
      address >= MEMORY_MAP.IO_REGISTERS.start &&
      address <= MEMORY_MAP.IO_REGISTERS.end
    ) {
      switch (address) {
        case IO_REGISTERS.P1: {
          // no buttons pressed, lower nibble all 1s, bits 6-7 read as 1s
          const selects = this.ioRegisters[IO_REGISTERS.P1 - 0xff00] & 0x30;
          return 0xc0 | selects | 0x0f;
        }
        case IO_REGISTERS.DIV:
          return this.timer.readDIV();
        case IO_REGISTERS.TIMA:
          return this.timer.readTIMA();
        case IO_REGISTERS.TMA:
          return this.timer.readTMA();
        case IO_REGISTERS.TAC:
          return this.timer.readTAC();
        case IO_REGISTERS.IF:
          return this.interrupts.getIF();
        default:
          return this.ioRegisters[address - 0xff00];
      }
    }

    // HRAM (0xFF80-0xFFFE)
    if (address >= MEMORY_MAP.HRAM.start && address <= 0xfffe) {
      return this.hram[address - 0xff80];
    }

    // IE Register (0xFFFF)
    if (address === MEMORY_MAP.IE_REGISTER) {
      return this.interrupts.getIE(); // store IE at last IO index
    }

    console.warn(`Read from unmapped address: 0x${address.toString(16)}`);
    return 0xff;
  }

  write(address: number, value: number): void {
    address &= 0xffff;
    value &= 0xff;

    // todo: mbc control
    // ROM (0x0000-0x7FFF)
    if (address < 0x8000) {
      this.cartridge.write(address, value);
      return;
    }

    // todo: vram
    // VRAM (0x8000-0x9FFF)
    if (address >= MEMORY_MAP.VRAM.start && address <= MEMORY_MAP.VRAM.end) {
      this.vram[address - 0x8000] = value;
      return;
    }

    // External RAM (0xA000-0xBFFF)
    if (
      address >= MEMORY_MAP.EXTERNAL_RAM.start &&
      address <= MEMORY_MAP.EXTERNAL_RAM.end
    ) {
      this.cartridge.write(address, value);
      return;
    }

    // WRAM (0xC000-0xDFFF)
    if (
      address >= MEMORY_MAP.WRAM_BANK_0.start &&
      address <= MEMORY_MAP.WRAM_BANK_N.end
    ) {
      this.wram[address - 0xc000] = value;
      return;
    }

    // Echo RAM (0xE000-0xFDFF)
    if (
      address >= MEMORY_MAP.ECHO_RAM.start &&
      address <= MEMORY_MAP.ECHO_RAM.end
    ) {
      this.wram[address - 0xe000] = value;
      return;
    }

    // not done yet
    // OAM (0xFE00-0xFE9F)
    if (address >= MEMORY_MAP.OAM.start && address <= MEMORY_MAP.OAM.end) {
      return;
    }

    // I/O Registers (0xFF00-0xFF7F)
    if (
      address >= MEMORY_MAP.IO_REGISTERS.start &&
      address <= MEMORY_MAP.IO_REGISTERS.end
    ) {
      switch (address) {
        case IO_REGISTERS.P1: {
          // store only selection bits (4-5), other bits are synthesized on read
          const prev = this.ioRegisters[IO_REGISTERS.P1 - 0xff00] & ~0x30;
          this.ioRegisters[IO_REGISTERS.P1 - 0xff00] = prev | (value & 0x30);
          return;
        }
        case IO_REGISTERS.DIV:
          this.timer.writeDIV(value);
          return;
        case IO_REGISTERS.TIMA:
          this.timer.writeTIMA(value);
          return;
        case IO_REGISTERS.TMA:
          this.timer.writeTMA(value);
          return;
        case IO_REGISTERS.TAC:
          this.timer.writeTAC(value);
          return;
        case IO_REGISTERS.IF:
          this.interrupts.setIF(value);
          return;
        default:
          this.ioRegisters[address - 0xff00] = value;
          return;
      }
    }

    // HRAM (0xFF80-0xFFFE)
    if (address >= MEMORY_MAP.HRAM.start && address <= 0xfffe) {
      this.hram[address - 0xff80] = value;
      return;
    }

    // IE Register (0xFFFF)
    if (address === MEMORY_MAP.IE_REGISTER) {
      this.interrupts.setIE(value);
      return;
    }

    console.warn(
      `Write to unmapped address: 0x${address.toString(16)} = 0x${value.toString(16)}`,
    );
  }

  reset(): void {
    this.wram.fill(0);
    this.vram.fill(0);
    this.hram.fill(0);
    this.ioRegisters.fill(0);
  }

  getVRAMView(): Uint8Array {
    return this.vram;
  }

  getIORegistersView(): Uint8Array {
    return this.ioRegisters;
  }

  readInstruction(address: number): number {
    return this.read(address);
  }
}
