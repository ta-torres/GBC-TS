import { Cartridge } from "../cartridge/cartridge";
import { MEMORY_MAP, IO_REGISTERS } from "../types/memory";
import { Timer } from "../core/timer";
import { Interrupts } from "../core/interrupts";
import { Joypad } from "../input/joypad";

export class AddressBus {
  private cartridge: Cartridge;

  /* RAM BANKING */
  private wramBank0: Uint8Array;
  private wramBanks: Uint8Array[];
  private currentWramBank: number;
  private vramBanks: Uint8Array[];
  private cpuVramBank: 0 | 1;

  private hram: Uint8Array; // 0xFF80-0xFFFE (127 bytes)
  private ioRegisters: Uint8Array; // 0xFF00-0xFF7F (128 bytes)
  private oam: Uint8Array; // 0xFE00-0xFE9F (160 bytes)

  private timer: Timer;
  private interrupts: Interrupts;
  private joypad?: Joypad;

  /* GBC SPECIFIC */
  /* 
    https://gbdev.io/pandocs/Palettes.html#lcd-color-palettes-cgb-only
    https://gbdev.io/pandocs/CGB_Registers.html
  */

  private cgbMode: boolean;

  private cgbDoubleSpeed: boolean;
  private speedSwitchRequested: boolean;

  private bgPaletteRam: Uint8Array;
  private objPaletteRam: Uint8Array;
  private bgPaletteIndex: number;
  private bgPaletteAutoInc: boolean;
  private objPaletteIndex: number;
  private objPaletteAutoInc: boolean;

  /* private debugVramWriteCount = 0;
  private debugOamWriteCount = 0; */

  constructor(cartridge: Cartridge, timer: Timer, interrupts: Interrupts) {
    this.cartridge = cartridge;
    this.timer = timer;
    this.interrupts = interrupts;
    this.wramBank0 = new Uint8Array(0x1000);
    this.wramBanks = Array.from({ length: 7 }, () => new Uint8Array(0x1000));
    this.currentWramBank = 1;

    this.vramBanks = [new Uint8Array(0x2000), new Uint8Array(0x2000)];
    this.cpuVramBank = 0;

    this.hram = new Uint8Array(0x7f); // 127 bytes
    this.ioRegisters = new Uint8Array(0x80);
    this.oam = new Uint8Array(0xa0);

    /* GBC SPECIFIC */

    this.cgbMode = false;
    this.cgbDoubleSpeed = false;
    this.speedSwitchRequested = false;

    this.bgPaletteRam = new Uint8Array(0x40);
    this.objPaletteRam = new Uint8Array(0x40);
    this.bgPaletteIndex = 0;
    this.bgPaletteAutoInc = false;
    this.objPaletteIndex = 0;
    this.objPaletteAutoInc = false;
  }

  setCGBMode(enabled: boolean): void {
    this.cgbMode = enabled;
    if (!this.cgbMode) {
      this.cpuVramBank = 0;
      this.currentWramBank = 1;
    }

    this.cgbDoubleSpeed = false;
    this.speedSwitchRequested = false;

    this.bgPaletteIndex = 0;
    this.bgPaletteAutoInc = false;
    this.objPaletteIndex = 0;
    this.objPaletteAutoInc = false;
  }

  /* GBC SPECIFIC GETTERS/SETTERS */

  isCGBMode(): boolean {
    return this.cgbMode;
  }

  isDoubleSpeed(): boolean {
    return this.cgbDoubleSpeed;
  }

  isSpeedSwitchPrepared(): boolean {
    return this.speedSwitchRequested;
  }

  performSpeedSwitch(): void {
    if (!this.cgbMode) return;
    if (!this.speedSwitchRequested) return;
    this.cgbDoubleSpeed = !this.cgbDoubleSpeed;
    this.speedSwitchRequested = false;
  }

  /* RAM BANKING READ/WRITE */
  private readWram(address: number): number {
    if (address >= 0xc000 && address <= 0xcfff) {
      return this.wramBank0[address - 0xc000];
    }

    if (address >= 0xd000 && address <= 0xdfff) {
      const bankIndex = Math.max(1, Math.min(7, this.currentWramBank)) - 1;
      return this.wramBanks[bankIndex][address - 0xd000];
    }

    return 0xff;
  }

  private writeWram(address: number, value: number): void {
    if (address >= 0xc000 && address <= 0xcfff) {
      this.wramBank0[address - 0xc000] = value;
      return;
    }

    if (address >= 0xd000 && address <= 0xdfff) {
      const bankIndex = Math.max(1, Math.min(7, this.currentWramBank)) - 1;
      this.wramBanks[bankIndex][address - 0xd000] = value;
    }
  }

  attachJoypad(joypad: Joypad): void {
    this.joypad = joypad;
  }

  reset(cgbMode: boolean = this.cgbMode): void {
    this.setCGBMode(cgbMode);
    this.wramBank0.fill(0);
    this.wramBanks.forEach((bank) => bank.fill(0));
    this.vramBanks.forEach((bank) => bank.fill(0));
    this.hram.fill(0);
    this.ioRegisters.fill(0);
    this.oam.fill(0);

    this.currentWramBank = 1;
    this.cpuVramBank = 0;

    this.cgbDoubleSpeed = false;
    this.speedSwitchRequested = false;

    this.bgPaletteRam.fill(0);
    this.objPaletteRam.fill(0);
    this.bgPaletteIndex = 0;
    this.bgPaletteAutoInc = false;
    this.objPaletteIndex = 0;
    this.objPaletteAutoInc = false;
  }

  read(address: number): number {
    address &= 0xffff;

    // ROM (0x0000-0x7FFF)
    if (address < 0x8000) {
      return this.cartridge.read(address);
    }

    // VRAM (0x8000-0x9FFF)
    if (address >= MEMORY_MAP.VRAM.start && address <= MEMORY_MAP.VRAM.end) {
      return this.vramBanks[this.cpuVramBank][address - 0x8000];
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
      return this.readWram(address);
    }

    // Echo RAM (0xE000-0xFDFF) - mirrors WRAM
    if (
      address >= MEMORY_MAP.ECHO_RAM.start &&
      address <= MEMORY_MAP.ECHO_RAM.end
    ) {
      const mirrored = (address - 0x2000) & 0xffff; // E000->C000, FDFF->DDFF
      return this.readWram(mirrored);
    }

    // OAM (0xFE00-0xFE9F)
    if (address >= MEMORY_MAP.OAM.start && address <= MEMORY_MAP.OAM.end) {
      return this.oam[address - 0xfe00];
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
          const currentP1 = this.ioRegisters[IO_REGISTERS.P1 - 0xff00];
          const selectBits = currentP1 & 0x30;
          const lowerNibble = this.joypad
            ? this.joypad.readP1LowerNibble(selectBits)
            : 0x0f;
          /* 
          P1 = 11 XY ZZZZ
          bits 7-6 always 1, bit 5 select buttons, bit 4 select d-pad, bits 3-0 depend on joypad
          0 is active and 1 is not pressed
          */
          return 0xc0 | selectBits | (lowerNibble & 0x0f);
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

        /* GBC SPECIFIC REGISTERS */

        // speed switch
        // https://gbdev.io/pandocs/CGB_Registers.html#ff4d--key1spd-cgb-mode-only-prepare-speed-switch
        case IO_REGISTERS.KEY1: {
          if (!this.cgbMode) return 0xff;
          const speedBit = this.cgbDoubleSpeed ? 0x80 : 0x00;
          const prepareBit = this.speedSwitchRequested ? 0x01 : 0x00;
          return 0x7e | speedBit | prepareBit;
        }
        // background palette index
        // https://gbdev.io/pandocs/Palettes.html#lcd-color-palettes-cgb-only
        case IO_REGISTERS.BCPS: {
          if (!this.cgbMode) return 0xff;
          return (
            (this.bgPaletteAutoInc ? 0x80 : 0x00) | (this.bgPaletteIndex & 0x3f)
          );
        }
        // background palette data
        case IO_REGISTERS.BCPD: {
          if (!this.cgbMode) return 0xff;
          return this.bgPaletteRam[this.bgPaletteIndex & 0x3f];
        }
        // object palette index
        case IO_REGISTERS.OCPS: {
          if (!this.cgbMode) return 0xff;
          return (
            (this.objPaletteAutoInc ? 0x80 : 0x00) |
            (this.objPaletteIndex & 0x3f)
          );
        }
        // object palette data
        case IO_REGISTERS.OCPD: {
          if (!this.cgbMode) return 0xff;
          return this.objPaletteRam[this.objPaletteIndex & 0x3f];
        }
        // vram bank
        case IO_REGISTERS.VBK: {
          // bit 0: VRAM bank, upper bits read as 1
          return 0xfe | (this.cpuVramBank & 0x01);
        }
        // wram bank
        case IO_REGISTERS.SVBK: {
          // bits 0-2: WRAM bank (1-7), upper bits read as 1
          // in DMG mode, this register doesnt exist
          if (!this.cgbMode) return 0xff;
          return 0xf8 | (this.currentWramBank & 0x07);
        }
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

    // ROM (0x0000-0x7FFF)
    if (address < 0x8000) {
      this.cartridge.write(address, value);
      return;
    }

    // VRAM (0x8000-0x9FFF)
    if (address >= MEMORY_MAP.VRAM.start && address <= MEMORY_MAP.VRAM.end) {
      this.vramBanks[this.cpuVramBank][address - 0x8000] = value;

      /* if (this.debugVramWriteCount < 64) {
        console.log(
          "VRAM write",
          "addr=0x" + address.toString(16),
          "val=0x" + value.toString(16),
        );
        this.debugVramWriteCount += 1;
      } */
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
      this.writeWram(address, value);
      return;
    }

    // Echo RAM (0xE000-0xFDFF)
    if (
      address >= MEMORY_MAP.ECHO_RAM.start &&
      address <= MEMORY_MAP.ECHO_RAM.end
    ) {
      const mirrored = (address - 0x2000) & 0xffff;
      this.writeWram(mirrored, value);
      return;
    }

    // OAM (0xFE00-0xFE9F)
    if (address >= MEMORY_MAP.OAM.start && address <= MEMORY_MAP.OAM.end) {
      this.oam[address - 0xfe00] = value;

      /* if (this.debugOamWriteCount < 64) {
        console.log(
          "OAM write",
          "addr=0x" + address.toString(16),
          "val=0x" + value.toString(16),
        );
        this.debugOamWriteCount += 1;
      } */
      return;
    }

    // Unusable (0xFEA0-0xFEFF)
    if (
      address >= MEMORY_MAP.UNUSABLE.start &&
      address <= MEMORY_MAP.UNUSABLE.end
    ) {
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
        case IO_REGISTERS.KEY1: {
          // bit 0: prepare speed switch (CGB only). bits 1-6 unused. bit 7 read-only speed.
          if (!this.cgbMode) {
            this.ioRegisters[address - 0xff00] = value;
            return;
          }
          this.speedSwitchRequested = (value & 0x01) === 0x01;
          this.ioRegisters[address - 0xff00] = value & 0x01;
          return;
        }

        /* GBC SPECIFIC */

        case IO_REGISTERS.BCPS: {
          if (!this.cgbMode) {
            this.ioRegisters[address - 0xff00] = value;
            return;
          }
          this.bgPaletteIndex = value & 0x3f;
          this.bgPaletteAutoInc = (value & 0x80) !== 0;
          this.ioRegisters[address - 0xff00] = value;
          return;
        }
        case IO_REGISTERS.BCPD: {
          if (!this.cgbMode) {
            this.ioRegisters[address - 0xff00] = value;
            return;
          }
          this.bgPaletteRam[this.bgPaletteIndex & 0x3f] = value;
          if (this.bgPaletteAutoInc) {
            this.bgPaletteIndex = (this.bgPaletteIndex + 1) & 0x3f;
          }
          return;
        }
        case IO_REGISTERS.OCPS: {
          if (!this.cgbMode) {
            this.ioRegisters[address - 0xff00] = value;
            return;
          }
          this.objPaletteIndex = value & 0x3f;
          this.objPaletteAutoInc = (value & 0x80) !== 0;
          this.ioRegisters[address - 0xff00] = value;
          return;
        }
        case IO_REGISTERS.OCPD: {
          if (!this.cgbMode) {
            this.ioRegisters[address - 0xff00] = value;
            return;
          }
          this.objPaletteRam[this.objPaletteIndex & 0x3f] = value;
          if (this.objPaletteAutoInc) {
            this.objPaletteIndex = (this.objPaletteIndex + 1) & 0x3f;
          }
          return;
        }
        case IO_REGISTERS.DMA: {
          /* copy 160 bytes from source page value << 8 to OAM
          TODO: CPU is blocked during DMA?
          https://gbdev.io/pandocs/OAM_DMA_Transfer.html
          */
          const srcBase = (value & 0xff) << 8;
          for (let i = 0; i < 0xa0; i += 1) {
            const byte = this.read((srcBase + i) & 0xffff);
            this.write(0xfe00 + i, byte);
          }
          return;
        }
        case IO_REGISTERS.VBK: {
          // only bit 0 is used
          this.ioRegisters[address - 0xff00] = value & 0x01;
          if (this.cgbMode) {
            this.cpuVramBank = (value & 0x01) as 0 | 1;
          }
          return;
        }
        case IO_REGISTERS.SVBK: {
          this.ioRegisters[address - 0xff00] = value & 0x07;
          if (this.cgbMode) {
            let bank = value & 0x07;
            if (bank === 0) bank = 1;
            this.currentWramBank = bank;
          }
          return;
        }
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

  getVRAMBank0View(): Uint8Array {
    return this.vramBanks[0];
  }

  getVRAMBank1View(): Uint8Array {
    return this.vramBanks[1];
  }

  // DMG-only view, change when cgb is enabled?
  getVRAMView(): Uint8Array {
    return this.vramBanks[0];
  }

  getIORegistersView(): Uint8Array {
    return this.ioRegisters;
  }

  getCGBBackgroundPaletteRAMView(): Uint8Array {
    return this.bgPaletteRam;
  }

  getCGBObjectPaletteRAMView(): Uint8Array {
    return this.objPaletteRam;
  }

  getOAMView(): Uint8Array {
    return this.oam;
  }

  readInstruction(address: number): number {
    return this.read(address);
  }
}
