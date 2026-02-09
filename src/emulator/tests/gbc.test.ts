import { describe, it, expect } from "vitest";
import { Cartridge } from "../cartridge/cartridge";
import { AddressBus } from "../memory/addressBus";
import { CPU } from "../core/cpu";
import { Interrupts, InterruptType } from "../core/interrupts";
import { Timer } from "../core/timer";
import { IO_REGISTERS } from "../types/memory";

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
  const bus = new AddressBus(cart, timer, interrupts);
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
