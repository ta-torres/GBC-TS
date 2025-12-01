import { describe, it, expect, beforeEach } from "vitest";
import {
  add8,
  sub8,
  and8,
  or8,
  xor8,
  cp8,
  inc8,
  dec8,
  add16,
} from "../core/opcodes/alu";
import { Registers } from "../core/registers";
import type { CPU } from "../core/cpu";

describe("ALU", () => {
  let registers: Registers;
  let cpu: CPU;

  beforeEach(() => {
    registers = new Registers();
    registers.setZeroFlag(false);
    registers.setSubtractFlag(false);
    registers.setHalfCarryFlag(false);
    registers.setCarryFlag(false);
    cpu = { registers } as unknown as CPU;
  });

  describe("add8", () => {
    it("adds without carry", () => {
      registers.setA(0x14);

      add8(cpu, 0x22, false);

      expect(registers.getA()).toBe(0x36);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(false);
      expect(registers.getCarryFlag()).toBe(false);
    });

    it("adds with carry-in and wraps", () => {
      registers.setA(0xff);
      registers.setCarryFlag(true);

      add8(cpu, 0x00, true);

      expect(registers.getA()).toBe(0x00);
      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(true);
      expect(registers.getCarryFlag()).toBe(true);
    });
  });

  describe("sub8", () => {
    it("subtracts without borrow", () => {
      registers.setA(0x30);

      sub8(cpu, 0x10, false);

      expect(registers.getA()).toBe(0x20);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getHalfCarryFlag()).toBe(false);
      expect(registers.getCarryFlag()).toBe(false);
    });

    it("subtracts with borrow", () => {
      registers.setA(0x00);
      registers.setCarryFlag(true);

      sub8(cpu, 0x01, true);

      expect(registers.getA()).toBe(0xfe);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getHalfCarryFlag()).toBe(true);
      expect(registers.getCarryFlag()).toBe(true);
    });
  });

  describe("and8", () => {
    it("performs bitwise AND and sets flags", () => {
      registers.setA(0xf0);
      registers.setZeroFlag(true);
      registers.setCarryFlag(true);

      and8(cpu, 0x0f);

      expect(registers.getA()).toBe(0x00);
      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(true);
      expect(registers.getCarryFlag()).toBe(false);
    });
  });

  describe("or8", () => {
    it("performs bitwise OR and clears flags", () => {
      registers.setA(0x0f);

      or8(cpu, 0xf0);

      expect(registers.getA()).toBe(0xff);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(false);
      expect(registers.getCarryFlag()).toBe(false);
    });
  });

  describe("xor8", () => {
    it("performs bitwise XOR and clears flags", () => {
      registers.setA(0xaa);

      xor8(cpu, 0xaa);

      expect(registers.getA()).toBe(0x00);
      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(false);
      expect(registers.getCarryFlag()).toBe(false);
    });
  });

  describe("cp8", () => {
    it("compares without modifying A", () => {
      registers.setA(0x3c);

      cp8(cpu, 0x2f);

      expect(registers.getA()).toBe(0x3c);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getHalfCarryFlag()).toBe(true);
      expect(registers.getCarryFlag()).toBe(false);
    });

    it("sets zero flag when values match", () => {
      registers.setA(0x77);

      cp8(cpu, 0x77);

      expect(registers.getA()).toBe(0x77);
      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getHalfCarryFlag()).toBe(false);
      expect(registers.getCarryFlag()).toBe(false);
    });

    it("sets carry when comparison underflows", () => {
      registers.setA(0x00);

      cp8(cpu, 0x01);

      expect(registers.getA()).toBe(0x00);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getHalfCarryFlag()).toBe(true);
      expect(registers.getCarryFlag()).toBe(true);
    });
  });

  describe("inc8", () => {
    it("increments value without wrapping", () => {
      const result = inc8(cpu, 0x1e);

      expect(result).toBe(0x1f);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(false);
    });

    it("wraps and sets half-carry", () => {
      const result = inc8(cpu, 0xff);

      expect(result).toBe(0x00);
      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(true);
    });
  });

  describe("dec8", () => {
    it("decrements value without wrapping", () => {
      const result = dec8(cpu, 0x10);

      expect(result).toBe(0x0f);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getHalfCarryFlag()).toBe(true);
    });

    it("wraps to zero without half-carry", () => {
      const result = dec8(cpu, 0x01);

      expect(result).toBe(0x00);
      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getHalfCarryFlag()).toBe(false);
    });

    it("wraps to 0xFF with half-carry", () => {
      const result = dec8(cpu, 0x00);

      expect(result).toBe(0xff);
      expect(registers.getZeroFlag()).toBe(false);
      expect(registers.getSubtractFlag()).toBe(true);
      expect(registers.getHalfCarryFlag()).toBe(true);
    });
  });

  describe("add16", () => {
    it("adds 16-bit values without carry", () => {
      registers.setZeroFlag(true);

      const result = add16(cpu, 0x1234, 0x1111);

      expect(result).toBe(0x2345);
      expect(registers.getZeroFlag()).toBe(true);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(false);
      expect(registers.getCarryFlag()).toBe(false);
    });

    it("adds 16-bit values with carry", () => {
      const result = add16(cpu, 0xffff, 0x0001);

      expect(result).toBe(0x0000);
      expect(registers.getSubtractFlag()).toBe(false);
      expect(registers.getHalfCarryFlag()).toBe(true);
      expect(registers.getCarryFlag()).toBe(true);
    });
  });
});
