import { describe, it, expect, beforeEach } from "vitest";
import { Registers } from "../emulator/core/registers";

describe("Registers", () => {
  let registers: Registers;

  beforeEach(() => {
    registers = new Registers();
  });

  describe("8-bit registers", () => {
    it("should get and set A register", () => {
      registers.setA(0x42); // 0100 0010
      expect(registers.getA()).toBe(0x42);
    });

    it("should mask values to 8 bits (truncate)", () => {
      registers.setA(0x1ff); // 1001 1111 1111
      expect(registers.getA()).toBe(0xff); // 1111 1111
    });

    it("should handle all 8-bit registers", () => {
      registers.setB(0x12);
      registers.setC(0x34);
      registers.setD(0x56);
      registers.setE(0x78);
      registers.setH(0x9a);
      registers.setL(0xbc);

      expect(registers.getB()).toBe(0x12);
      expect(registers.getC()).toBe(0x34);
      expect(registers.getD()).toBe(0x56);
      expect(registers.getE()).toBe(0x78);
      expect(registers.getH()).toBe(0x9a);
      expect(registers.getL()).toBe(0xbc);
    });
  });

  describe("F register (flags)", () => {
    it("should mask lower 4 bits when setting F", () => {
      registers.setF(0xff);
      expect(registers.getF()).toBe(0xf0); // 1111 0000
    });

    it("should preserve upper 4 bits only", () => {
      registers.setF(0xab);
      expect(registers.getF()).toBe(0xa0); // 1010 0000
    });
  });

  describe("16-bit register pairs", () => {
    it("should combine AF correctly", () => {
      registers.setA(0x12); // 0001 0010
      registers.setF(0x30); // 0011 0000
      expect(registers.getAF()).toBe(0x1230); // 0001 0010 0011 0000
    });

    it("should split AF correctly", () => {
      registers.setAF(0x1234);
      expect(registers.getA()).toBe(0x12); // 0001 0010
      expect(registers.getF()).toBe(0x30); // 0011 0000
    });

    it("should handle BC register pair", () => {
      registers.setBC(0xabcd);
      expect(registers.getB()).toBe(0xab);
      expect(registers.getC()).toBe(0xcd);
    });

    it("should handle DE register pair", () => {
      registers.setDE(0x1234);
      expect(registers.getD()).toBe(0x12);
      expect(registers.getE()).toBe(0x34);
    });

    it("should handle HL register pair", () => {
      registers.setHL(0x5678);
      expect(registers.getH()).toBe(0x56);
      expect(registers.getL()).toBe(0x78);
    });
  });

  describe("flags", () => {
    it("should set and clear Zero flag", () => {
      registers.setZeroFlag(true);
      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getF()).toBe(0x80);

      registers.setZeroFlag(false);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getF()).toBe(0x00);
    });

    it("should set and clear Subtract flag", () => {
      registers.setSubtractFlag(true);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getF()).toBe(0x40);
    });

    it("should set and clear Half-carry flag", () => {
      registers.setHalfCarryFlag(true);
      expect(registers.getHalfCarryFlag()).toBe(true);
      expect(registers.getF()).toBe(0x20);
    });

    it("should set and clear Carry flag", () => {
      registers.setCarryFlag(true);
      expect(registers.getCarryFlag()).toBe(true);
      expect(registers.getF()).toBe(0x10);
    });

    it("should handle multiple flags simultaneously", () => {
      registers.setZeroFlag(true);
      registers.setCarryFlag(true);

      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getCarryFlag()).toBe(true);
      expect(registers.getF()).toBe(0x90);

      registers.setZeroFlag(false);
      expect(registers.getCarryFlag()).toBe(true);
      expect(registers.getF()).toBe(0x10);
    });
  });
});
