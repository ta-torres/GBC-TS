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

// interrupts
register(0xf3, "DI", 1, 4, (cpu) => {
  cpu.disableIME();
  return 4;
});

register(0xfb, "EI", 1, 4, (cpu) => {
  cpu.scheduleIME();
  return 4;
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

// LD (a16),SP (0x08)
register(0x08, "LD (nn),SP", 3, 20, (cpu, bus) => {
  // little-endian shift to get low byte first from SP
  const nn = read16(cpu, bus);
  const low = cpu.sp & 0xff; // mask 0-7
  // shift right 8 positions to access 8-15 then mask
  const high = (cpu.sp >> 8) & 0xff;
  bus.write(nn, low); // nn 0xFE
  bus.write((nn + 1) & 0xffff, high); // nn + 1 0xFF
  // 0xC600 = 0xFE
  // 0xC601 = 0xFF
  return 20;
});

// memory ops (02-0A | 12-1A)
register(0x02, "LD (BC),A", 1, 8, (cpu, bus) => {
  bus.write(cpu.registers.getBC(), cpu.registers.getA());
  return 8;
});

register(0x0a, "LD A,(BC)", 1, 8, (cpu, bus) => {
  cpu.registers.setA(bus.read(cpu.registers.getBC()));
  return 8;
});

register(0x12, "LD (DE),A", 1, 8, (cpu, bus) => {
  bus.write(cpu.registers.getDE(), cpu.registers.getA());
  return 8;
});

register(0x1a, "LD A,(DE)", 1, 8, (cpu, bus) => {
  cpu.registers.setA(bus.read(cpu.registers.getDE()));
  return 8;
});

// LD (HL+),A and LD A,(HL+) (0x22, 0x2A)
register(0x22, "LD (HL+),A", 1, 8, (cpu, bus) => {
  const addr = cpu.registers.getHL();
  bus.write(addr, cpu.registers.getA());
  cpu.registers.setHL((addr + 1) & 0xffff);
  return 8;
});

register(0x2a, "LD A,(HL+)", 1, 8, (cpu, bus) => {
  const addr = cpu.registers.getHL();
  const val = bus.read(addr);
  cpu.registers.setA(val);
  cpu.registers.setHL((addr + 1) & 0xffff);
  return 8;
});

// LD (HL-),A and LD A,(HL-) (0x32, 0x3A)
register(0x32, "LD (HL-),A", 1, 8, (cpu, bus) => {
  const addr = cpu.registers.getHL();
  bus.write(addr, cpu.registers.getA());
  cpu.registers.setHL((addr - 1) & 0xffff);
  return 8;
});

register(0x3a, "LD A,(HL-)", 1, 8, (cpu, bus) => {
  const addr = cpu.registers.getHL();
  const val = bus.read(addr);
  cpu.registers.setA(val);
  cpu.registers.setHL((addr - 1) & 0xffff);
  return 8;
});

// LDH (n),A and LDH A,(n) (0xE0, 0xF0)
register(0xe0, "LDH (n),A", 2, 12, (cpu, bus) => {
  const n = read8(cpu, bus);
  const addr = 0xff00 | n;
  bus.write(addr, cpu.registers.getA());
  return 12;
});

register(0xf0, "LDH A,(n)", 2, 12, (cpu, bus) => {
  const n = read8(cpu, bus);
  const addr = 0xff00 | n;
  cpu.registers.setA(bus.read(addr));
  return 12;
});

// LD (nn),A and LD A,(nn) (0xEA, 0xFA)
register(0xea, "LD (nn),A", 3, 16, (cpu, bus) => {
  const nn = read16(cpu, bus);
  bus.write(nn, cpu.registers.getA());
  return 16;
});

register(0xfa, "LD A,(nn)", 3, 16, (cpu, bus) => {
  const nn = read16(cpu, bus);
  cpu.registers.setA(bus.read(nn));
  return 16;
});

register(0x36, "LD (HL),n", 2, 12, (cpu, bus) => {
  // read immediate and write to HL address
  const n = read8(cpu, bus);
  bus.write(cpu.registers.getHL(), n);
  return 12;
});

/* LDH (or LD [$FF00+C], A) 
Copies value in A into the byte at address 0xFF00 + C (IO registers/HRAM)

0xFF00-0xFF7F: Port/Mode registers, control register, sound register
0xFF80-0xFFFE: Working & Stack RAM (127 bytes)
0xFFFF: Interrupt Enable Register
*/
register(0xe2, "LDH (C),A", 1, 8, (cpu, bus) => {
  const addr = 0xff00 | cpu.registers.getC();
  bus.write(addr, cpu.registers.getA());
  return 8;
});

register(0xf2, "LDH A,(C)", 1, 8, (cpu, bus) => {
  const addr = 0xff00 | cpu.registers.getC();
  cpu.registers.setA(bus.read(addr));
  return 8;
});

// SP ops
register(0xe8, "ADD SP,e", 2, 16, (cpu, bus) => {
  // suma desplazamiento con signo de 8 bits a SP (16 bits) y almacena el resultado en SP
  // H y C se calculan con XOR (A ^ B ^ C) y se enmascara (& 0x10 o & 0x100)
  const imm8 = read8(cpu, bus);
  const e8Signed = imm8 < 0x80 ? imm8 : imm8 - 0x100; // [-128..127]
  const sp16 = cpu.sp & 0xffff;
  const result16 = (sp16 + e8Signed) & 0xffff;

  // 16 bit para calculo de H/C con XOR
  const e8Signed16 = e8Signed & 0xffff;

  cpu.registers.setZeroFlag(false);
  cpu.registers.setSubtractFlag(false);

  /* 
  En el z80 original, para sumas de 8 bits, el half carry se activa si hay un carry desde el bit 3 al 4 (en la mitad baja del byte)
  En esta instrucción (que suma 16 bits pero con offset de 8 bits) el game boy usa la misma regla, considerando solo los 8 bits bajos de SP 
    XOR (A ^ B ^ sum) combina los tres valores y deja un 1 en los bits donde el carry ocurrió
    Se enmascara (& 0x10 o & 0x100) para quedarse solo con el resto de bit 3 → 4 (Half-Carry) o 7 → 8 (Carry).
  */
  cpu.registers.setHalfCarryFlag(((sp16 ^ e8Signed16 ^ result16) & 0x10) !== 0);
  cpu.registers.setCarryFlag(((sp16 ^ e8Signed16 ^ result16) & 0x100) !== 0);

  cpu.sp = result16;

  return 16;
});

register(0xf8, "LD HL,SP+e", 2, 12, (cpu, bus) => {
  // igual que ADD SP,e pero guarda el resultado en HL, SP no se modifica
  const imm8 = read8(cpu, bus);
  const e8Signed = imm8 < 0x80 ? imm8 : imm8 - 0x100;
  const sp16 = cpu.sp & 0xffff;
  const result16 = (sp16 + e8Signed) & 0xffff;
  const e8Signed16 = e8Signed & 0xffff;

  cpu.registers.setZeroFlag(false);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(((sp16 ^ e8Signed16 ^ result16) & 0x10) !== 0);
  cpu.registers.setCarryFlag(((sp16 ^ e8Signed16 ^ result16) & 0x100) !== 0);
  cpu.registers.setHL(result16);

  return 12;
});

register(0xf9, "LD SP,HL", 1, 8, (cpu) => {
  cpu.sp = cpu.registers.getHL() & 0xffff;
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

// 16-bit INC rr (0x03,0x13,0x23,0x33)
// flags don't change
{
  const opcodes = [0x03, 0x13, 0x23, 0x33];
  const names = ["BC", "DE", "HL", "SP"] as const;
  const getters = [
    (cpu: CPU) => cpu.registers.getBC(),
    (cpu: CPU) => cpu.registers.getDE(),
    (cpu: CPU) => cpu.registers.getHL(),
    (cpu: CPU) => cpu.sp,
  ];
  const setters = [
    (cpu: CPU, v: number) => cpu.registers.setBC(v & 0xffff),
    (cpu: CPU, v: number) => cpu.registers.setDE(v & 0xffff),
    (cpu: CPU, v: number) => cpu.registers.setHL(v & 0xffff),
    (cpu: CPU, v: number) => {
      cpu.sp = v & 0xffff;
    },
  ];

  for (let registerPairIdx = 0; registerPairIdx < 4; registerPairIdx++) {
    register(
      opcodes[registerPairIdx],
      `INC ${names[registerPairIdx]}`,
      1,
      8,
      (cpu) => {
        const val = (getters[registerPairIdx](cpu) + 1) & 0xffff;
        setters[registerPairIdx](cpu, val);
        return 8;
      },
    );
  }
}

// 16-bit DEC rr (0x0B,0x1B,0x2B,0x3B)
{
  const opcodes = [0x0b, 0x1b, 0x2b, 0x3b];
  const names = ["BC", "DE", "HL", "SP"] as const;
  const getters = [
    (cpu: CPU) => cpu.registers.getBC(),
    (cpu: CPU) => cpu.registers.getDE(),
    (cpu: CPU) => cpu.registers.getHL(),
    (cpu: CPU) => cpu.sp,
  ];
  const setters = [
    (cpu: CPU, v: number) => cpu.registers.setBC(v & 0xffff),
    (cpu: CPU, v: number) => cpu.registers.setDE(v & 0xffff),
    (cpu: CPU, v: number) => cpu.registers.setHL(v & 0xffff),
    (cpu: CPU, v: number) => {
      cpu.sp = v & 0xffff;
    },
  ];

  for (let registerPairIdx = 0; registerPairIdx < 4; registerPairIdx++) {
    register(
      opcodes[registerPairIdx],
      `DEC ${names[registerPairIdx]}`,
      1,
      8,
      (cpu) => {
        const val = (getters[registerPairIdx](cpu) - 1) & 0xffff;
        setters[registerPairIdx](cpu, val);
        return 8;
      },
    );
  }
}

// ADD HL,rr (0x09,0x19,0x29,0x39)
// Z - (doesnt change), N=0, H/C is set in add16
{
  const opcodes = [0x09, 0x19, 0x29, 0x39];
  const names = ["BC", "DE", "HL", "SP"] as const;
  const getters = [
    (cpu: CPU) => cpu.registers.getBC(),
    (cpu: CPU) => cpu.registers.getDE(),
    (cpu: CPU) => cpu.registers.getHL(),
    (cpu: CPU) => cpu.sp,
  ];

  for (let registerPairIdx = 0; registerPairIdx < 4; registerPairIdx++) {
    register(
      opcodes[registerPairIdx],
      `ADD HL,${names[registerPairIdx]}`,
      1,
      8,
      (cpu) => {
        const hl = cpu.registers.getHL();
        const val = getters[registerPairIdx](cpu) & 0xffff;
        const result = add16(cpu, hl, val);
        cpu.registers.setHL(result);
        return 8;
      },
    );
  }
}

// PUSH/POP rr (BC,DE,HL,AF)
{
  // PUSH rr (0xC5,0xD5,0xE5,0xF5)
  const pushOpcodes = [0xc5, 0xd5, 0xe5, 0xf5];
  const pushNames = ["BC", "DE", "HL", "AF"] as const;
  const pushGetters = [
    (cpu: CPU) => cpu.registers.getBC(),
    (cpu: CPU) => cpu.registers.getDE(),
    (cpu: CPU) => cpu.registers.getHL(),
    (cpu: CPU) => cpu.registers.getAF(),
  ];
  for (let i = 0; i < 4; i++) {
    register(pushOpcodes[i], `PUSH ${pushNames[i]}`, 1, 16, (cpu) => {
      cpu.push(pushGetters[i](cpu));
      return 16;
    });
  }

  // POP rr (0xC1,0xD1,0xE1,0xF1)
  const popOpcodes = [0xc1, 0xd1, 0xe1, 0xf1];
  const popNames = ["BC", "DE", "HL", "AF"] as const;
  const popSetters = [
    (cpu: CPU, v: number) => cpu.registers.setBC(v & 0xffff),
    (cpu: CPU, v: number) => cpu.registers.setDE(v & 0xffff),
    (cpu: CPU, v: number) => cpu.registers.setHL(v & 0xffff),
    // F is masked in setAF
    (cpu: CPU, v: number) => cpu.registers.setAF(v & 0xffff),
  ];
  for (let i = 0; i < 4; i++) {
    register(popOpcodes[i], `POP ${popNames[i]}`, 1, 12, (cpu) => {
      const v = cpu.pop();
      popSetters[i](cpu, v);
      return 12;
    });
  }
}

// non-cb rotate/shift
register(0x07, "RLCA", 1, 4, (cpu) => {
  // bit 7 (leftmost) becomes carry and bit 0 is added to the left (rotate left)
  const a = cpu.registers.getA();
  const carry = (a & 0x80) !== 0;
  const result = ((a << 1) & 0xff) | (carry ? 1 : 0);
  cpu.registers.setA(result);
  cpu.registers.setZeroFlag(false);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(carry);
  return 4;
});

register(0x0f, "RRCA", 1, 4, (cpu) => {
  // bit 0 (rightmost) becomes carry and bit 7 is added to the right (rotate right)
  const a = cpu.registers.getA();
  const carry = (a & 0x01) !== 0;
  const result = (a >>> 1) | (carry ? 0x80 : 0);
  cpu.registers.setA(result & 0xff);
  cpu.registers.setZeroFlag(false);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(carry);
  return 4;
});

register(0x17, "RLA", 1, 4, (cpu) => {
  // same as RLCA but uses the carry flag as the leftmost bit
  const a = cpu.registers.getA();
  const oldCarry = cpu.registers.getCarryFlag() ? 1 : 0;
  const newCarry = (a & 0x80) !== 0;
  const result = ((a << 1) & 0xff) | oldCarry;
  cpu.registers.setA(result);
  cpu.registers.setZeroFlag(false);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(newCarry);
  return 4;
});

register(0x1f, "RRA", 1, 4, (cpu) => {
  const a = cpu.registers.getA();
  const oldCarry = cpu.registers.getCarryFlag() ? 1 : 0;
  const newCarry = (a & 0x01) !== 0;
  const result = (a >>> 1) | (oldCarry ? 0x80 : 0);
  cpu.registers.setA(result & 0xff);
  cpu.registers.setZeroFlag(false);
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(newCarry);
  return 4;
});

// misc ops
register(0x2f, "CPL", 1, 4, (cpu) => {
  // ComPLement A, set N and H
  const a = cpu.registers.getA();
  cpu.registers.setA(~a & 0xff);
  cpu.registers.setSubtractFlag(true);
  cpu.registers.setHalfCarryFlag(true);
  return 4;
});

register(0x37, "SCF", 1, 4, (cpu) => {
  // Set Carry Flag, clear N and H
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(true);
  return 4;
});

register(0x3f, "CCF", 1, 4, (cpu) => {
  // Complement Carry Flag, clear N and H
  const carry = cpu.registers.getCarryFlag();
  cpu.registers.setSubtractFlag(false);
  cpu.registers.setHalfCarryFlag(false);
  cpu.registers.setCarryFlag(!carry);
  return 4;
});

/*
https://rgbds.gbdev.io/docs/v1.0.0/gbz80.7#DAA
# DAA
Decimal Adjust Accumulator.

Designed to be used after performing an arithmetic instruction (ADD, ADC, SUB, SBC) whose inputs were in Binary-Coded Decimal (BCD), adjusting the result to likewise be in BCD.

The exact behavior of this instruction depends on the state of the subtract flag N:

If the subtract flag N is set:
  1. Initialize the adjustment to 0.
  2. If the half-carry flag H is set, then add $6 to the adjustment.
  3. If the carry flag is set, then add $60 to the adjustment.
  4. Subtract the adjustment from A.

If the subtract flag N is not set:
  A. Initialize the adjustment to 0.
  B. If the half-carry flag H is set or A & $F > $9, then add $6 to the adjustment.
  C. If the carry flag is set or A > $99, then add $60 to the adjustment and set the carry flag.
  D. Add the adjustment to A.

Cycles: 4 (T-cycles)
Bytes: 1

Flags:
  Z Set if result is 0.
  H 0
  C Set or unaffected depending on the operation.
*/
register(0x27, "DAA", 1, 4, (cpu) => {
  // ajusta el resultado de una operacion aritmetica asegurando que el resultado sea un numero decimal valido (codificado en binario con 4 bits por digito)
  const oldA = cpu.registers.getA();
  const subtractFlag = cpu.registers.getSubtractFlag();
  const halfCarryFlag = cpu.registers.getHalfCarryFlag();
  const carryFlag = cpu.registers.getCarryFlag();

  let adjust = 0;
  let result = 0;

  if (subtractFlag) {
    if (halfCarryFlag) adjust += 0x06;
    if (carryFlag) adjust += 0x60;

    const subtract = oldA - adjust;
    result = subtract & 0xff;

    cpu.registers.setA(result);
    cpu.registers.setZeroFlag(result === 0);
    cpu.registers.setHalfCarryFlag(false);
    // C is unaffected
  } else {
    if (halfCarryFlag || (oldA & 0x0f) > 0x09) adjust += 0x06;
    if (carryFlag || oldA > 0x99) adjust += 0x60;

    const sum = oldA + adjust;
    result = sum & 0xff;

    cpu.registers.setA(result);
    cpu.registers.setZeroFlag(result === 0);
    cpu.registers.setHalfCarryFlag(false);
    cpu.registers.setCarryFlag(carryFlag || oldA > 0x99);
  }

  return 4;
});
/*
N=1, A=0x15, H=1, C=0
  Adjust (subtract): 
    H=1 -> adjust += 0x06
    C=0 -> no adjust
  Result: 0x15 - 0x06 = 0x0F
N=0, A=0x90, H=0, C=1
  Adjust: 
    H=0 || 0x90 & 0x0f > 0x09 = 0x00 > 0x09 = 0 -> no adjust
      (0b1001 0000 & 0b0000 1111) = 0b0000 0000
    C=1 || 0x90 > 0x99 = 0 -> adjust += 0x60
  Result: 0x90 + 0x60 = 0xF0
N=0, A=0x9A, H=0, C=0
  Adjust: 
    H=0 || 0x9A & 0x0f > 0x09 = 0x0A > 0x09 = 1 -> adjust += 0x06
    C=0 || 0x9A > 0x99 = 1 -> adjust += 0x60
  Result: 0x9A + 0x66 = 0x100 & 0xff = 0x00
*/

// jr jp call ret reti
{
  const negateZero = (cpu: CPU) => !cpu.registers.getZeroFlag();
  const zero = (cpu: CPU) => cpu.registers.getZeroFlag();
  const negateCarry = (cpu: CPU) => !cpu.registers.getCarryFlag();
  const carry = (cpu: CPU) => cpu.registers.getCarryFlag();

  // JR cc,n
  register(0x20, "JR NZ,n", 2, 8, (cpu, bus) => {
    const off = read8(cpu, bus);
    if (negateZero(cpu)) {
      const signed = off < 0x80 ? off : off - 0x100;
      cpu.pc = (cpu.pc + signed) & 0xffff;
      return 12;
    }
    return 8;
  });
  register(0x28, "JR Z,n", 2, 8, (cpu, bus) => {
    const off = read8(cpu, bus);
    if (zero(cpu)) {
      const signed = off < 0x80 ? off : off - 0x100;
      cpu.pc = (cpu.pc + signed) & 0xffff;
      return 12;
    }
    return 8;
  });
  register(0x30, "JR NC,n", 2, 8, (cpu, bus) => {
    const off = read8(cpu, bus);
    if (negateCarry(cpu)) {
      const signed = off < 0x80 ? off : off - 0x100;
      cpu.pc = (cpu.pc + signed) & 0xffff;
      return 12;
    }
    return 8;
  });
  register(0x38, "JR C,n", 2, 8, (cpu, bus) => {
    const off = read8(cpu, bus);
    if (carry(cpu)) {
      const signed = off < 0x80 ? off : off - 0x100;
      cpu.pc = (cpu.pc + signed) & 0xffff;
      return 12;
    }
    return 8;
  });

  // JP (HL)
  register(0xe9, "JP (HL)", 1, 4, (cpu) => {
    cpu.pc = cpu.registers.getHL() & 0xffff;
    return 4;
  });

  // JP cc,nn
  register(0xc2, "JP NZ,nn", 3, 12, (cpu, bus) => {
    const nn = read16(cpu, bus);
    if (negateZero(cpu)) {
      cpu.pc = nn & 0xffff;
      return 16;
    }
    return 12;
  });
  register(0xca, "JP Z,nn", 3, 12, (cpu, bus) => {
    const nn = read16(cpu, bus);
    if (zero(cpu)) {
      cpu.pc = nn & 0xffff;
      return 16;
    }
    return 12;
  });
  register(0xd2, "JP NC,nn", 3, 12, (cpu, bus) => {
    const nn = read16(cpu, bus);
    if (negateCarry(cpu)) {
      cpu.pc = nn & 0xffff;
      return 16;
    }
    return 12;
  });
  register(0xda, "JP C,nn", 3, 12, (cpu, bus) => {
    const nn = read16(cpu, bus);
    if (carry(cpu)) {
      cpu.pc = nn & 0xffff;
      return 16;
    }
    return 12;
  });

  // CALL cc,nn
  register(0xc4, "CALL NZ,nn", 3, 12, (cpu, bus) => {
    const nn = read16(cpu, bus);
    if (negateZero(cpu)) {
      cpu.push(cpu.pc);
      cpu.pc = nn & 0xffff;
      return 24;
    }
    return 12;
  });
  register(0xcc, "CALL Z,nn", 3, 12, (cpu, bus) => {
    const nn = read16(cpu, bus);
    if (zero(cpu)) {
      cpu.push(cpu.pc);
      cpu.pc = nn & 0xffff;
      return 24;
    }
    return 12;
  });
  register(0xd4, "CALL NC,nn", 3, 12, (cpu, bus) => {
    const nn = read16(cpu, bus);
    if (negateCarry(cpu)) {
      cpu.push(cpu.pc);
      cpu.pc = nn & 0xffff;
      return 24;
    }
    return 12;
  });
  register(0xdc, "CALL C,nn", 3, 12, (cpu, bus) => {
    const nn = read16(cpu, bus);
    if (carry(cpu)) {
      cpu.push(cpu.pc);
      cpu.pc = nn & 0xffff;
      return 24;
    }
    return 12;
  });

  // RET cc
  register(0xc0, "RET NZ", 1, 8, (cpu) => {
    if (negateZero(cpu)) {
      cpu.pc = cpu.pop() & 0xffff;
      return 20;
    }
    return 8;
  });
  register(0xc8, "RET Z", 1, 8, (cpu) => {
    if (zero(cpu)) {
      cpu.pc = cpu.pop() & 0xffff;
      return 20;
    }
    return 8;
  });
  register(0xd0, "RET NC", 1, 8, (cpu) => {
    if (negateCarry(cpu)) {
      cpu.pc = cpu.pop() & 0xffff;
      return 20;
    }
    return 8;
  });
  register(0xd8, "RET C", 1, 8, (cpu) => {
    if (carry(cpu)) {
      cpu.pc = cpu.pop() & 0xffff;
      return 20;
    }
    return 8;
  });

  // return from interrupt
  register(0xd9, "RETI", 1, 16, (cpu) => {
    const addr = cpu.pop();
    cpu.pc = addr & 0xffff;
    // pop from stack (RET) then enable interrupts
    cpu.enableIME();
    return 16;
  });
}

// RST (0xc7 - 0xff)
// writes PC to stack and jumps program counter to 1 of 8 addresses
const rstTable = [
  { opcode: 0xc7, address: 0x00 },
  { opcode: 0xcf, address: 0x08 },
  { opcode: 0xd7, address: 0x10 },
  { opcode: 0xdf, address: 0x18 },
  { opcode: 0xe7, address: 0x20 },
  { opcode: 0xef, address: 0x28 },
  { opcode: 0xf7, address: 0x30 },
  { opcode: 0xff, address: 0x38 },
];
for (const { opcode, address } of rstTable) {
  register(
    opcode,
    `RST ${address.toString(16).toUpperCase().padStart(2, "0")}h`,
    1,
    16,
    (cpu) => {
      cpu.push(cpu.pc);
      cpu.pc = address;
      return 16;
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
