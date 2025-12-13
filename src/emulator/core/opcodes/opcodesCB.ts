import type { CPU } from "../cpu";
import type { AddressBus } from "../../memory/addressBus";
import type { OpcodeInfo } from "../../types/instructions";
import { getRegister, setRegister, REGISTER_NAMES } from "./instructions";

export const CB_OPCODE_TABLE: Record<number, OpcodeInfo<CPU>> = {};

const registerCB = (
  opcode: number,
  mnemonic: string,
  execute: (cpu: CPU, bus: AddressBus) => number,
) => {
  /*
    CB opcode structure: CB xx yyy zzz
    - bits 0-2 (zzz): register index (0-7 = B,C,D,E,H,L,(HL),A)
    - bits 3-5 (yyy): operation index
    - bits 6-7 (xx): operation category (00=rotate/shift, 01=BIT, 10=RES, 11=SET)
  */
  const registerIdx = opcode & 0x07; // 0-2
  const category = opcode & 0xc0; // 6-7
  const isHL = registerIdx === 6;

  let cycles: number;
  if (category === 0x40) {
    // BIT operations: (HL) takes 12 cycles, registers 8 cycles
    cycles = isHL ? 12 : 8;
  } else {
    // Rotate/Shift/RES/SET: (HL) takes 16 cycles, registers 8 cycles
    cycles = isHL ? 16 : 8;
  }

  CB_OPCODE_TABLE[opcode] = { mnemonic, bytes: 2, cycles, execute };
};

// Rotate/shift helpers

// RLC: Rotate left with carry
// bit 7 moves to both carry and bit 0, the rest shift left
// 0b10110001 -> 0b01100011, C -> bit 7 === 1
const rlc = (cpu: CPU, value: number): number => {
  const bit7 = (value >> 7) & 1;
  const result = ((value << 1) | bit7) & 0xff;
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(bit7 === 1);
  return result;
};

// RRC: Rotate right with carry
// bit 0 moves to both carry and bit 7, the rest shift right
// 0b10110001 -> 0b11011000, C -> bit 0 === 1
const rrc = (cpu: CPU, value: number): number => {
  const bit0 = value & 1;
  const result = ((value >> 1) | (bit0 << 7)) & 0xff;
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(bit0 === 1);
  return result;
};

// RL: Rotate left through carry
// bit 7 moves to carry, old carry moves into bit 0, rest shift left (9-bit rotation)
const rl = (cpu: CPU, value: number): number => {
  const oldCarry = cpu.registers.getCarryFlag() ? 1 : 0;
  const bit7 = (value >> 7) & 1;
  const result = ((value << 1) | oldCarry) & 0xff;
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(bit7 === 1);
  return result;
};

// RR: Rotate right through carry
// bit 0 moves to carry, old carry moves into bit 7, rest shift right (9-bit rotation)
const rr = (cpu: CPU, value: number): number => {
  const oldCarry = cpu.registers.getCarryFlag() ? 1 : 0;
  const bit0 = value & 1;
  const result = (value >> 1) | (oldCarry << 7);
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(bit0 === 1);
  return result;
};

// SLA: Shift left arithmetic
// shifts all bits left by 1, inserts 0 into bit 0, moves old bit 7 into carry
const sla = (cpu: CPU, value: number): number => {
  const bit7 = (value >> 7) & 1;
  const result = (value << 1) & 0xff;
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(bit7 === 1);
  return result;
};

// SRA: Shift right arithmetic
// shifts all bits right by 1, but preserves the sign bit (bit 7) by copying it back in, moves old bit 0 into carry
const sra = (cpu: CPU, value: number): number => {
  const bit7 = value & 0x80;
  const bit0 = value & 1;
  const result = ((value >> 1) | bit7) & 0xff;
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(bit0 === 1);
  return result;
};

// SRL: Shift right logical
// shifts all bits right by 1, inserts 0 into bit 7, moves old bit 0 into carry
const srl = (cpu: CPU, value: number): number => {
  const bit0 = value & 1;
  const result = (value >> 1) & 0xff;
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(bit0 === 1);
  return result;
};

// SWAP: Swap upper and lower nibbles
// exchange high nibble and low nibble.
// 0xAB -> 0xBA. Sets Z if result is 0, clears N/H/C.
const swap = (cpu: CPU, value: number): number => {
  const result = ((value & 0x0f) << 4) | ((value & 0xf0) >> 4);
  cpu.registers.setZeroFlag(result === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(false);
  return result & 0xff;
};

// Rotate/Shift operations (0x00-0x3F)
const rotateOps = [rlc, rrc, rl, rr, sla, sra, swap, srl];
const rotateNames = [
  "RLC",
  "RRC",
  "RL",
  "RR",
  "SLA",
  "SRA",
  "SWAP",
  "SRL",
] as const;

for (let op = 0; op < 8; op++) {
  for (let reg = 0; reg < 8; reg++) {
    const opcode = (op << 3) | reg;
    registerCB(
      opcode,
      `${rotateNames[op]} ${REGISTER_NAMES[reg]}`,
      (cpu, bus) => {
        const value = getRegister(cpu, bus, reg);
        const result = rotateOps[op](cpu, value);
        setRegister(cpu, bus, reg, result);
        return reg === 6 ? 16 : 8;
      },
    );
  }
}

// BIT operations (0x40-0x7F)
// tests bit n in target register or (HL); sets Z=1 when that bit is 0, N=0, H=1, C unchanged, no write
for (let bit = 0; bit < 8; bit++) {
  for (let reg = 0; reg < 8; reg++) {
    const opcode = 0x40 | (bit << 3) | reg;
    registerCB(opcode, `BIT ${bit},${REGISTER_NAMES[reg]}`, (cpu, bus) => {
      const value = getRegister(cpu, bus, reg);
      const bitSet = (value & (1 << bit)) !== 0;
      cpu.registers.setZeroFlag(!bitSet);
      cpu.registers.setSubtractFlag(false);
      cpu.registers.setHalfCarryFlag(true);
      return reg === 6 ? 12 : 8;
    });
  }
}

// RES operations (0x80-0xBF)
// clears bit n in target register or (HL): value & ~(1<<n), flags unchanged
// example: RES 5,(HL) on 0xFF -> 0xDF
for (let bit = 0; bit < 8; bit++) {
  for (let reg = 0; reg < 8; reg++) {
    const opcode = 0x80 | (bit << 3) | reg;
    registerCB(opcode, `RES ${bit},${REGISTER_NAMES[reg]}`, (cpu, bus) => {
      const value = getRegister(cpu, bus, reg);
      const result = value & ~(1 << bit);
      setRegister(cpu, bus, reg, result & 0xff);
      return reg === 6 ? 16 : 8;
    });
  }
}

// SET operations (0xC0-0xFF)
// sets bit n in target register or (HL): value | (1<<n), flags unchanged
// example: SET 7,(HL) on 0x00 -> 0x80
for (let bit = 0; bit < 8; bit++) {
  for (let reg = 0; reg < 8; reg++) {
    const opcode = 0xc0 | (bit << 3) | reg;
    registerCB(opcode, `SET ${bit},${REGISTER_NAMES[reg]}`, (cpu, bus) => {
      const value = getRegister(cpu, bus, reg);
      const result = value | (1 << bit);
      setRegister(cpu, bus, reg, result & 0xff);
      return reg === 6 ? 16 : 8;
    });
  }
}
