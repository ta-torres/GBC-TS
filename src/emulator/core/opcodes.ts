import type { CPU } from "./cpu";
import type { AddressBus } from "../memory/addressBus";
import type { OpcodeInfo } from "../../types/instructions";
import { getRegister, setRegister, REGISTER_NAMES } from "./instructions";
import { add8, sub8, and8, or8, xor8, cp8, inc8, dec8, add16 } from "./alu";

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

// ALU operations (0x80-0xBF)
const aluOps = [
  { name: "ADD", fn: (cpu: CPU, val: number) => add8(cpu, val, false) },
  { name: "ADC", fn: (cpu: CPU, val: number) => add8(cpu, val, true) },
  { name: "SUB", fn: (cpu: CPU, val: number) => sub8(cpu, val, false) },
  { name: "SBC", fn: (cpu: CPU, val: number) => sub8(cpu, val, true) },
  { name: "AND", fn: and8 },
  { name: "XOR", fn: xor8 },
  { name: "OR", fn: or8 },
  { name: "CP", fn: cp8 },
];

for (let opName = 0; opName < 8; opName++) {
  for (let reg = 0; reg < 8; reg++) {
    /*
      0xA3 = 0b10 100 011
      XX              | YYY                     | ZZZ
      start row & col | index of operation << 3 | index of register
      0x80            | 4 << 3                  | 3 => 0xA3
      0b10 000 000    | 0b100 << 3              | 0b011
    */
    const opcode = 0x80 | (opName << 3) | reg;
    const cycles = reg === 6 ? 8 : 4;

    register(
      opcode,
      `${aluOps[opName].name} A,${REGISTER_NAMES[reg]}`,
      1,
      cycles,
      (cpu, bus) => {
        const value = getRegister(cpu, bus, reg);
        aluOps[opName].fn(cpu, value);
        return cycles;
      },
    );
  }
}

// ALU n8 immediate (0xC6 - 0xF6) and (0xCE - 0xFE)
// assign based on order in aluOps from left to right & up and down
[0xc6, 0xce, 0xd6, 0xde, 0xe6, 0xee, 0xf6, 0xfe].forEach((opcode, i) => {
  register(opcode, `${aluOps[i].name} A,n`, 2, 8, (cpu, bus) => {
    const n = read8(cpu, bus);
    aluOps[i].fn(cpu, n);
    return 8;
  });
});

// INC r (0x04,0x0C,0x14,0x1C,0x24,0x2C,0x34,0x3C)
// assign based on order in REGISTER_NAMES from left to right & up and down
for (let registerIdx = 0; registerIdx < 8; registerIdx++) {
  const opcode = 0x04 | (registerIdx << 3);
  const isHL = registerIdx === 6;
  const cycles = isHL ? 12 : 4;
  register(
    opcode,
    `INC ${REGISTER_NAMES[registerIdx]}`,
    1,
    cycles,
    (cpu, bus) => {
      if (isHL) {
        const addr = cpu.registers.getHL();
        const v = bus.read(addr);
        const res = inc8(cpu, v);
        bus.write(addr, res);
      } else {
        const v = getRegister(cpu, bus, registerIdx);
        const res = inc8(cpu, v);
        setRegister(cpu, bus, registerIdx, res);
      }
      return cycles;
    },
  );
}

// DEC r (0x05,0x0D,0x15,0x1D,0x25,0x2D,0x35,0x3D)
for (let registerIdx = 0; registerIdx < 8; registerIdx++) {
  const opcode = 0x05 | (registerIdx << 3);
  const isHL = registerIdx === 6;
  const cycles = isHL ? 12 : 4;
  register(
    opcode,
    `DEC ${REGISTER_NAMES[registerIdx]}`,
    1,
    cycles,
    (cpu, bus) => {
      if (isHL) {
        const addr = cpu.registers.getHL();
        const v = bus.read(addr);
        const res = dec8(cpu, v);
        bus.write(addr, res);
      } else {
        const v = getRegister(cpu, bus, registerIdx);
        const res = dec8(cpu, v);
        setRegister(cpu, bus, registerIdx, res);
      }
      return cycles;
    },
  );
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
