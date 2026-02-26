import { describe, it, expect } from "vitest";
import { Cartridge } from "../cartridge/cartridge";
import { AddressBus } from "../memory/addressBus";
import { CPU } from "../core/cpu";
import { Interrupts, InterruptType } from "../core/interrupts";
import { Timer } from "../core/timer";
import { IO_REGISTERS } from "../types/memory";
import { APU } from "../apu/apu";

function makeROM(program: number[]): Uint8Array {
  const rom = new Uint8Array(0x8000);

  for (let i = 0; i < program.length; i++) {
    rom[0x0100 + i] = program[i] & 0xff;
  }

  rom[0x0147] = 0x00;

  let checksum = 0;
  for (let i = 0x0134; i <= 0x014c; i++) {
    checksum = checksum - rom[i] - 1;
  }
  rom[0x014d] = checksum & 0xff;

  return rom;
}

function setupCPU(program: number[]): {
  cpu: CPU;
  bus: AddressBus;
  interrupts: Interrupts;
} {
  const rom = makeROM(program);
  const cart = new Cartridge();
  cart.load(rom.buffer);
  const interrupts = new Interrupts();
  const timer = new Timer(interrupts);
  const apu = new APU();
  const bus = new AddressBus(cart, timer, interrupts, apu);
  const cpu = new CPU(bus, interrupts);
  return { cpu, bus, interrupts };
}

describe("STOP opcode (0x10 0x00)", () => {
  it("enters STOP state and wakes on pending interrupt", () => {
    // cpu in stop returns 4 cycles without advancing PC even after requesting an interrupt
    const { cpu, interrupts } = setupCPU([0x10, 0x00]);

    cpu.step();
    expect(cpu.getPC()).toBe(0x0102);

    expect(cpu.step()).toBe(4);
    expect(cpu.getPC()).toBe(0x0102);

    interrupts.requestInterrupt(InterruptType.VBLANK);
    const cycles = cpu.step();
    expect(cycles).toBe(4);
    expect(cpu.getPC()).toBe(0x0102);
  });

  it("in CGB mode, performs speed switch when KEY1 bit 0 is set", () => {
    const { cpu, bus } = setupCPU([0x10, 0x00]);
    bus.setCGBMode(true);

    // prepare speed switch via KEY1 bit 0
    bus.write(IO_REGISTERS.KEY1, 0x01);
    expect(bus.isSpeedSwitchPrepared()).toBe(true);

    cpu.step();
    expect(cpu.getPC()).toBe(0x0102);
    expect(bus.isDoubleSpeed()).toBe(true);
  });

  it("ignores speed switch when not in CGB mode", () => {
    // stop should not change speed in non-CGB mode
    const { cpu, bus } = setupCPU([0x10, 0x00]);
    bus.setCGBMode(false);

    bus.write(IO_REGISTERS.KEY1, 0x01);
    expect(bus.isSpeedSwitchPrepared()).toBe(false);

    cpu.step();
    expect(cpu.getPC()).toBe(0x0102);
    expect(bus.isDoubleSpeed()).toBe(false);
  });

  it("does not perform speed switch when KEY1 bit 0 is not set", () => {
    const { cpu, bus } = setupCPU([0x10, 0x00]);
    bus.setCGBMode(true);

    bus.write(IO_REGISTERS.KEY1, 0x00);
    expect(bus.isSpeedSwitchPrepared()).toBe(false);

    cpu.step();
    expect(cpu.getPC()).toBe(0x0102);
    expect(bus.isDoubleSpeed()).toBe(false);
  });
});

describe("CGB palette registers", () => {
  it("BCPS/BCPD writes palette RAM and auto-increments index when bit 7 is set", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(true);

    bus.write(IO_REGISTERS.BCPS, 0x80 | 0x3e);
    expect(bus.read(IO_REGISTERS.BCPS)).toBe(0x80 | 0x3e);

    bus.write(IO_REGISTERS.BCPD, 0x12);
    expect(bus.read(IO_REGISTERS.BCPS)).toBe(0x80 | 0x3f);

    bus.write(IO_REGISTERS.BCPD, 0x34);
    expect(bus.read(IO_REGISTERS.BCPS)).toBe(0x80 | 0x00);

    bus.write(IO_REGISTERS.BCPS, 0x00 | 0x3e);
    expect(bus.read(IO_REGISTERS.BCPD)).toBe(0x12);
    bus.write(IO_REGISTERS.BCPS, 0x00 | 0x3f);
    expect(bus.read(IO_REGISTERS.BCPD)).toBe(0x34);
  });

  it("OCPS/OCPD works like BCPS/BCPD for OBJ palette RAM", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(true);

    bus.write(IO_REGISTERS.OCPS, 0x80 | 0x00);
    bus.write(IO_REGISTERS.OCPD, 0xab);
    bus.write(IO_REGISTERS.OCPD, 0xcd);

    bus.write(IO_REGISTERS.OCPS, 0x00 | 0x00);
    expect(bus.read(IO_REGISTERS.OCPD)).toBe(0xab);
    bus.write(IO_REGISTERS.OCPS, 0x00 | 0x01);
    expect(bus.read(IO_REGISTERS.OCPD)).toBe(0xcd);
  });

  it("palette registers are unmapped when not in CGB mode", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(false);

    bus.write(IO_REGISTERS.BCPS, 0x80 | 0x10);
    bus.write(IO_REGISTERS.BCPD, 0x55);
    expect(bus.read(IO_REGISTERS.BCPS)).toBe(0xff);
    expect(bus.read(IO_REGISTERS.BCPD)).toBe(0xff);

    bus.write(IO_REGISTERS.OCPS, 0x80 | 0x10);
    bus.write(IO_REGISTERS.OCPD, 0x66);
    expect(bus.read(IO_REGISTERS.OCPS)).toBe(0xff);
    expect(bus.read(IO_REGISTERS.OCPD)).toBe(0xff);
  });
});

describe("CGB GDMA (HDMA1-HDMA5)", () => {
  it("HDMA1-HDMA4 store masked source/dest and read back in CGB mode", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(true);

    bus.write(IO_REGISTERS.HDMA1, 0xc0);
    bus.write(IO_REGISTERS.HDMA2, 0x0f);
    bus.write(IO_REGISTERS.HDMA3, 0xff);
    bus.write(IO_REGISTERS.HDMA4, 0x0f);

    expect(bus.read(IO_REGISTERS.HDMA1)).toBe(0xc0);
    expect(bus.read(IO_REGISTERS.HDMA2)).toBe(0x00);
    expect(bus.read(IO_REGISTERS.HDMA3)).toBe(0x1f);
    expect(bus.read(IO_REGISTERS.HDMA4)).toBe(0x00);
    expect(bus.read(IO_REGISTERS.HDMA5)).toBe(0xff);
  });

  it("GDMA copies (len = (n+1)*0x10) bytes from source to VRAM dest when HDMA5 bit7=0", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(true);

    for (let i = 0; i < 0x10; i += 1) {
      bus.write(0xc000 + i, (0x80 + i) & 0xff);
    }

    bus.write(IO_REGISTERS.HDMA1, 0xc0);
    bus.write(IO_REGISTERS.HDMA2, 0x00);
    bus.write(IO_REGISTERS.HDMA3, 0x00);
    bus.write(IO_REGISTERS.HDMA4, 0x00);

    bus.write(IO_REGISTERS.HDMA5, 0x00);

    for (let i = 0; i < 0x10; i += 1) {
      expect(bus.read(0x8000 + i)).toBe((0x80 + i) & 0xff);
    }
  });

  it("HDMA registers are unmapped when not in CGB mode", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(false);

    bus.write(IO_REGISTERS.HDMA1, 0xc0);
    bus.write(IO_REGISTERS.HDMA2, 0x00);
    bus.write(IO_REGISTERS.HDMA3, 0x00);
    bus.write(IO_REGISTERS.HDMA4, 0x00);
    bus.write(IO_REGISTERS.HDMA5, 0x00);

    expect(bus.read(IO_REGISTERS.HDMA1)).toBe(0xff);
    expect(bus.read(IO_REGISTERS.HDMA2)).toBe(0xff);
    expect(bus.read(IO_REGISTERS.HDMA3)).toBe(0xff);
    expect(bus.read(IO_REGISTERS.HDMA4)).toBe(0xff);
    expect(bus.read(IO_REGISTERS.HDMA5)).toBe(0xff);
  });
});

describe("CGB HDMA (HBlank DMA)", () => {
  it("does not start HDMA when PPU is already in HBlank (STAT mode 0)", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(true);

    // force STAT mode bits = 0 (HBlank)
    bus.write(IO_REGISTERS.STAT, 0x00);

    bus.write(IO_REGISTERS.HDMA1, 0xc0);
    bus.write(IO_REGISTERS.HDMA2, 0x00);
    bus.write(IO_REGISTERS.HDMA3, 0x00);
    bus.write(IO_REGISTERS.HDMA4, 0x00);

    bus.write(IO_REGISTERS.HDMA5, 0x80 | 0x00);
    expect(bus.read(IO_REGISTERS.HDMA5)).toBe(0xff);
  });

  it("copies one 0x10-byte block per HBlank when active and updates FF55 remaining", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(true);

    // LCD has to be enabled, HDMA stops when LCD is off
    bus.write(IO_REGISTERS.LCDC, 0x80);

    // not in HBlank
    bus.write(IO_REGISTERS.STAT, 0x02);

    for (let i = 0; i < 0x20; i += 1) {
      bus.write(0xc000 + i, (0x40 + i) & 0xff);
    }

    bus.write(IO_REGISTERS.HDMA1, 0xc0);
    bus.write(IO_REGISTERS.HDMA2, 0x00);
    bus.write(IO_REGISTERS.HDMA3, 0x00);
    bus.write(IO_REGISTERS.HDMA4, 0x00);

    // 2 blocks total
    bus.write(IO_REGISTERS.HDMA5, 0x80 | 0x01);
    expect(bus.read(IO_REGISTERS.HDMA5)).toBe(0x01);

    bus.stepHDMAHBlank();
    expect(bus.read(IO_REGISTERS.HDMA5)).toBe(0x00);
    for (let i = 0; i < 0x10; i += 1) {
      expect(bus.read(0x8000 + i)).toBe((0x40 + i) & 0xff);
    }

    bus.stepHDMAHBlank();
    expect(bus.read(IO_REGISTERS.HDMA5)).toBe(0xff);
    for (let i = 0; i < 0x10; i += 1) {
      expect(bus.read(0x8010 + i)).toBe((0x50 + i) & 0xff);
    }
  });

  it("aborts active HDMA when writing FF55 with bit7=0", () => {
    const { bus } = setupCPU([0x00]);
    bus.setCGBMode(true);

    // LCD has to be enabled, HDMA stops when LCD is off
    bus.write(IO_REGISTERS.LCDC, 0x80);

    // not in HBlank
    bus.write(IO_REGISTERS.STAT, 0x02);

    for (let i = 0; i < 0x20; i += 1) {
      bus.write(0xc000 + i, (0x10 + i) & 0xff);
    }

    bus.write(IO_REGISTERS.HDMA1, 0xc0);
    bus.write(IO_REGISTERS.HDMA2, 0x00);
    bus.write(IO_REGISTERS.HDMA3, 0x00);
    bus.write(IO_REGISTERS.HDMA4, 0x00);

    bus.write(IO_REGISTERS.HDMA5, 0x80 | 0x01);
    bus.stepHDMAHBlank();
    expect(bus.read(IO_REGISTERS.HDMA5)).toBe(0x00);

    bus.write(IO_REGISTERS.HDMA5, 0x00);
    expect(bus.read(IO_REGISTERS.HDMA5)).toBe(0xff);

    // second block should not be copied
    expect(bus.read(0x8010)).toBe(0x00);
  });
});
