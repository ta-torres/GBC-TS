import type { CPU } from "./cpu";
import type { AddressBus } from "../memory/addressBus";
import type { OpcodeInfo } from "../../types/instructions";
import { getRegister, setRegister, REGISTER_NAMES } from "./instructions";

export const OPCODE_TABLE: Record<number, OpcodeInfo<CPU>> = {};

const register = (
  opcode: number,
  mnemonic: string,
  bytes: number,
  cycles: number,
  handler: (cpu: CPU, bus: AddressBus) => number,
) => {
  OPCODE_TABLE[opcode] = { mnemonic, bytes, cycles, handler };
};

// 0x00: NOP
register(0x00, "NOP", 1, 4, () => 4);

// n 8-bit and nn 16-bit immediates
const read8 = (cpu: CPU, bus: AddressBus): number => bus.read(cpu.pc++);
const read16 = (cpu: CPU, bus: AddressBus): number => {
  const low = read8(cpu, bus);
  const high = read8(cpu, bus);
  return (high << 8) | low;
};

register(0xe6, "AND A,n", 2, 8, (cpu, bus) => {
  const n = read8(cpu, bus);
  cpu.registers.setA(cpu.registers.getA() & n);
  cpu.registers.setZeroFlag(cpu.registers.getA() === 0);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(true);
  cpu.registers.setCarryFlag(false);
  return 8;
});

// 16-bit immediates
register(0x01, "LD BC,nn", 3, 12, (cpu, bus) => {
  const nn = read16(cpu, bus);
  cpu.registers.setBC(nn);
  return 12;
});

register(0x11, "LD DE,nn", 3, 12, (cpu, bus) => {
  const nn = read16(cpu, bus);
  cpu.registers.setDE(nn);
  return 12;
});

register(0x21, "LD HL,nn", 3, 12, (cpu, bus) => {
  const nn = read16(cpu, bus);
  cpu.registers.setHL(nn);
  return 12;
});

register(0x31, "LD SP,nn", 3, 12, (cpu, bus) => {
  const nn = read16(cpu, bus);
  cpu.sp = nn & 0xffff;
  return 12;
});

// 8-bit immediates
register(0x06, "LD B,n", 2, 8, (cpu, bus) => {
  const n = read8(cpu, bus);
  cpu.registers.setB(n);
  return 8;
});

register(0x0e, "LD C,n", 2, 8, (cpu, bus) => {
  const n = read8(cpu, bus);
  cpu.registers.setC(n);
  return 8;
});

register(0x16, "LD D,n", 2, 8, (cpu, bus) => {
  const n = read8(cpu, bus);
  cpu.registers.setD(n);
  return 8;
});

register(0x1e, "LD E,n", 2, 8, (cpu, bus) => {
  const n = read8(cpu, bus);
  cpu.registers.setE(n);
  return 8;
});

register(0x26, "LD H,n", 2, 8, (cpu, bus) => {
  const n = read8(cpu, bus);
  cpu.registers.setH(n);
  return 8;
});

register(0x2e, "LD L,n", 2, 8, (cpu, bus) => {
  const n = read8(cpu, bus);
  cpu.registers.setL(n);
  return 8;
});

register(0x3e, "LD A,n", 2, 8, (cpu, bus) => {
  const n = read8(cpu, bus);
  cpu.registers.setA(n);
  return 8;
});

// LD r,r' (0x40-0x7F)
for (let i = 0; i < 8; i++) {
  for (let j = 0; j < 8; j++) {
    if (i === 6 && j === 6) continue; // HALT 0x76

    const opcode = 0x40 | (i << 3) | j;
    const cycles = i === 6 || j === 6 ? 8 : 4;

    register(
      opcode,
      `LD ${REGISTER_NAMES[i]},${REGISTER_NAMES[j]}`,
      1,
      cycles,
      (cpu, bus) => {
        const value = getRegister(cpu, bus, j);
        setRegister(cpu, bus, i, value);
        return cycles;
      },
    );
  }
}

// relative and absolute jumps
register(0x18, "JR n", 2, 12, (cpu, bus) => {
  const offset = read8(cpu, bus);
  const signed = offset < 0x80 ? offset : offset - 0x100;
  cpu.pc = (cpu.pc + signed) & 0xffff;
  return 12;
});

register(0xc3, "JP nn", 3, 16, (cpu, bus) => {
  const nn = read16(cpu, bus);
  cpu.pc = nn & 0xffff;
  return 16;
});

// calls y returns
register(0xcd, "CALL nn", 3, 24, (cpu, bus) => {
  const nn = read16(cpu, bus);
  // Return address is current PC after reading immediate
  cpu.push(cpu.pc);
  cpu.pc = nn & 0xffff;
  return 24;
});

register(0xc9, "RET", 1, 16, (cpu) => {
  const addr = cpu.pop();
  cpu.pc = addr & 0xffff;
  return 16;
});
