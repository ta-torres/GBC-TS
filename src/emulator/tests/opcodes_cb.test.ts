import { describe, it, expect } from "vitest";
import { Cartridge } from "../cartridge/cartridge";
import { AddressBus } from "../memory/addressBus";
import { CPU } from "../core/cpu";
import { Interrupts } from "../core/interrupts";
import { Timer } from "../core/timer";

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

function setupCPU(program: number[]): CPU {
  const rom = makeROM(program);
  const cart = new Cartridge();
  cart.load(rom.buffer);
  const interrupts = new Interrupts();
  const timer = new Timer(interrupts);
  const bus = new AddressBus(cart, timer, interrupts);
  const cpu = new CPU(bus, interrupts);
  return cpu;
}

function setupCPUWithBus(program: number[]): { cpu: CPU; bus: AddressBus } {
  const rom = makeROM(program);
  const cart = new Cartridge();
  cart.load(rom.buffer);
  const interrupts = new Interrupts();
  const timer = new Timer(interrupts);
  const bus = new AddressBus(cart, timer, interrupts);
  const cpu = new CPU(bus, interrupts);
  return { cpu, bus };
}

describe("CB Opcodes", () => {
  describe("Rotate/Shift reg", () => {
    it("RLC B rotates left with carry and sets flags", () => {
      const cpu = setupCPU([0xcb, 0x00]);
      cpu.registers.setB(0x80);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(true);
      cpu.registers.setCarryFlag(false);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getB()).toBe(0x01);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("RRC A rotates right with carry and sets flags", () => {
      const cpu = setupCPU([0xcb, 0x0f]);
      cpu.registers.setA(0x01);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(true);
      cpu.registers.setCarryFlag(false);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getA()).toBe(0x80);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("RL C rotates through carry using old carry", () => {
      const cpu = setupCPU([0xcb, 0x11]);
      cpu.registers.setC(0x80);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getC()).toBe(0x01);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("SLA B shifts left arithmetic with carry from bit7", () => {
      const cpu = setupCPU([0xcb, 0x20]);
      cpu.registers.setB(0x80);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getB()).toBe(0x00);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("SRA A shifts right arithmetic and preserves bit7", () => {
      const cpu = setupCPU([0xcb, 0x2f]);
      cpu.registers.setA(0x81);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getA()).toBe(0xc0);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("SWAP A exchanges nibbles and clears flags except Z", () => {
      const cpu = setupCPU([0xcb, 0x37]);
      cpu.registers.setA(0xf0);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(true);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getA()).toBe(0x0f);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0102);
    });
  });

  describe("Rotate/Shift (HL)", () => {
    it("RR (HL) rotates through carry and writes back to memory", () => {
      const { cpu, bus } = setupCPUWithBus([0xcb, 0x1e]);
      cpu.registers.setHL(0xc000);
      bus.write(0xc000, 0x02);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(16);
      expect(bus.read(0xc000)).toBe(0x81);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("SRL (HL) shifts right logical and writes back to memory", () => {
      const { cpu, bus } = setupCPUWithBus([0xcb, 0x3e]);
      cpu.registers.setHL(0xc001);
      bus.write(0xc001, 0x01);

      const cycles = cpu.step();

      expect(cycles).toBe(16);
      expect(bus.read(0xc001)).toBe(0x00);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });
  });

  describe("BIT/RES", () => {
    it("BIT 7,B sets Z based on bit and preserves C", () => {
      const cpu = setupCPU([0xcb, 0x78]);
      cpu.registers.setB(0x7f);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("RES 0,A clears bit 0 without changing flags", () => {
      const cpu = setupCPU([0xcb, 0x87]);
      cpu.registers.setA(0xff);
      cpu.registers.setZeroFlag(false);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(true);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getA()).toBe(0xfe);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(true);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("BIT 0,(HL) sets Z based on bit and preserves C", () => {
      const { cpu, bus } = setupCPUWithBus([0xcb, 0x46]);
      cpu.registers.setHL(0xc010);
      bus.write(0xc010, 0x01);
      cpu.registers.setCarryFlag(false);

      const cycles = cpu.step();

      expect(cycles).toBe(12);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("RES 5,(HL) clears bit 5 in memory and leaves flags unchanged", () => {
      const { cpu, bus } = setupCPUWithBus([0xcb, 0xae]);
      cpu.registers.setHL(0xc011);
      bus.write(0xc011, 0xff);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(true);
      cpu.registers.setCarryFlag(false);

      const cycles = cpu.step();

      expect(cycles).toBe(16);
      expect(bus.read(0xc011)).toBe(0xdf);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getSubtractFlag()).toBe(true);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0102);
    });
  });

  describe("SET operations", () => {
    it("SET 0,B sets bit 0 in B without changing flags", () => {
      const cpu = setupCPU([0xcb, 0xc0]);
      cpu.registers.setB(0x00);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(false);
      cpu.registers.setHalfCarryFlag(true);
      cpu.registers.setCarryFlag(false);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getB()).toBe(0x01);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("SET 7,(HL) sets bit 7 in memory without changing flags", () => {
      const { cpu, bus } = setupCPUWithBus([0xcb, 0xfe]);
      cpu.registers.setHL(0xc012);
      bus.write(0xc012, 0x00);
      cpu.registers.setZeroFlag(false);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(false);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(16);
      expect(bus.read(0xc012)).toBe(0x80);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(true);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });
  });
});
