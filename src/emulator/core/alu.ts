import type { CPU } from "./cpu";

export const add8 = (cpu: CPU, value: number, useCarry: boolean): void => {
  const a = cpu.registers.getA();
  const carryIn = useCarry && cpu.registers.getCarryFlag() ? 1 : 0;
  const b = value & 0xff;
  const sum = a + b + carryIn;
  const result = sum & 0xff;
  const halfCarry = ((a & 0x0f) + (b & 0x0f) + carryIn) > 0x0f;
  const carry = sum > 0xff;

  cpu.registers.setA(result);
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(halfCarry);
  cpu.registers.setCarryFlag(carry);
};

export const sub8 = (cpu: CPU, value: number, useCarry: boolean): void => {
  const a = cpu.registers.getA();
  const carryIn = useCarry && cpu.registers.getCarryFlag() ? 1 : 0;
  const b = value & 0xff;
  const diff = a - b - carryIn;
  const result = diff & 0xff;
  const halfCarry = (a & 0x0f) < ((b & 0x0f) + carryIn);
  const carry = a < (b + carryIn);

  cpu.registers.setA(result);
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(true);
  cpu.registers.setHalfCarryFlag(halfCarry);
  cpu.registers.setCarryFlag(carry);
};

export const and8 = (cpu: CPU, value: number): void => {
  const result = cpu.registers.getA() & (value & 0xff);
  cpu.registers.setA(result);
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(true);
  cpu.registers.setCarryFlag(false);
};

export const or8 = (cpu: CPU, value: number): void => {
  const result = cpu.registers.getA() | (value & 0xff);
  cpu.registers.setA(result);
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(false);
};

export const xor8 = (cpu: CPU, value: number): void => {
  const result = cpu.registers.getA() ^ (value & 0xff);
  cpu.registers.setA(result);
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(false);
};

export const cp8 = (cpu: CPU, value: number): void => {
  const a = cpu.registers.getA();
  const b = value & 0xff;
  const diff = a - b;
  const result = diff & 0xff;
  const halfCarry = (a & 0x0f) < (b & 0x0f);
  const carry = a < b;

  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(true);
  cpu.registers.setHalfCarryFlag(halfCarry);
  cpu.registers.setCarryFlag(carry);
};

export const inc8 = (cpu: CPU, value: number): number => {
  const v = value & 0xff;
  const result = (v + 1) & 0xff;
  const halfCarry = (v & 0x0f) === 0x0f;

  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(halfCarry);
  return result;
};

export const dec8 = (cpu: CPU, value: number): number => {
  const v = value & 0xff;
  const result = (v - 1) & 0xff;
  const halfCarry = (v & 0x0f) === 0x00;

  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(true);
  cpu.registers.setHalfCarryFlag(halfCarry);
  return result;
};

export const add16 = (cpu: CPU, left: number, right: number): number => {
  const a = left & 0xffff;
  const b = right & 0xffff;
  const sum = a + b;
  const result = sum & 0xffff;
  const halfCarry = ((a & 0x0fff) + (b & 0x0fff)) > 0x0fff;
  const carry = sum > 0xffff;

  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(halfCarry);
  cpu.registers.setCarryFlag(carry);
  return result;
};
