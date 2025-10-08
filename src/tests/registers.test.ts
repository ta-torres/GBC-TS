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
});
