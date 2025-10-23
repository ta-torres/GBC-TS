import { describe, it, expect } from "vitest";
import { Cartridge } from "../../emulator/cartridge/cartridge";
import { AddressBus } from "../../emulator/memory/addressBus";
import { CPU } from "../../emulator/core/cpu";

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
  const bus = new AddressBus(cart);
  const cpu = new CPU(bus);
  return cpu;
}

function setupCPUWithBus(program: number[]): { cpu: CPU; bus: AddressBus } {
  const rom = makeROM(program);
  const cart = new Cartridge();
  cart.load(rom.buffer);
  const bus = new AddressBus(cart);
  const cpu = new CPU(bus);
  return { cpu, bus };
}

describe("Opcodes", () => {
  describe("NOP", () => {
    it("increments PC by 1 and returns 4 cycles", () => {
      const cpu = setupCPU([0x00]);
      const start = cpu.getPC();
      const cycles = cpu.step();
      expect(cycles).toBe(4);
      console.log(cpu.getPC().toString(16));
      expect(cpu.getPC()).toBe((start + 1) & 0xffff);
    });
  });

  describe("LD rr,nn", () => {
    // LD BC,0x1234
    it("LD BC,nn loads immediate 16-bit", () => {
      const cpu = setupCPU([0x01, 0x34, 0x12]);
      const cycles = cpu.step();
      expect(cycles).toBe(12);
      expect(cpu.registers.getBC()).toBe(0x1234);
      expect(cpu.getPC()).toBe(0x0103);
    });
    // LD HL,0x5678
    it("LD HL,nn loads immediate 16-bit", () => {
      const cpu = setupCPU([0x21, 0x78, 0x56]);
      cpu.step();
      expect(cpu.registers.getHL()).toBe(0x5678);
      expect(cpu.getPC()).toBe(0x0103);
    });
    // LD SP,0xFFFE
    it("LD SP,nn loads immediate 16-bit", () => {
      const cpu = setupCPU([0x31, 0xfe, 0xff]);
      cpu.step();
      expect(cpu.getSP()).toBe(0xfffe);
      expect(cpu.getPC()).toBe(0x0103);
    });
  });

  describe("LD r,n", () => {
    it("LD A,n loads 8-bit immediate", () => {
      const cpu = setupCPU([0x3e, 0x42]);
      const cycles = cpu.step();
      expect(cycles).toBe(8);
      expect(cpu.registers.getA()).toBe(0x42);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("LD B,n loads 8-bit immediate", () => {
      const cpu = setupCPU([0x06, 0x99]);
      cpu.step();
      expect(cpu.registers.getB()).toBe(0x99);
      expect(cpu.getPC()).toBe(0x0102);
    });
  });

  describe("JR n", () => {
    it("JR with positive offset", () => {
      // JR +2 => to 0x0104
      const cpu = setupCPU([0x18, 0x02]);
      cpu.step();
      expect(cpu.getPC()).toBe(0x0104);
    });

    it("JR with negative offset", () => {
      // Program: JR -2, then a NOP at 0x0102 (we won't reach it in a single step)
      const cpu = setupCPU([0x18, 0xfe, 0x00]); // 0xFE = -2
      cpu.step();
      // PC before JR points to 0x0102, then add -2 => 0x0100
      expect(cpu.getPC()).toBe(0x0100);
    });
  });

  describe("JP nn", () => {
    it("JP to absolute address", () => {
      // JP 0x0200
      const cpu = setupCPU([0xc3, 0x00, 0x02]);
      cpu.step();
      expect(cpu.getPC()).toBe(0x0200);
    });
  });

  describe("AND A,n", () => {
    it("updates A and clears appropriate flags", () => {
      const cpu = setupCPU([0xe6, 0x34]);

      cpu.registers.setA(0xff);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(false);
      cpu.registers.setCarryFlag(true);

      //console.log(cpu.registers.toString());

      const cycles = cpu.step();
      //console.log(cpu.registers.toString());

      expect(cpu.registers.getA()).toBe(0x34);
      expect(cpu.getPC()).toBe(0x0102);
      expect(cycles).toBe(8);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(false);
    });

    it("sets zero flag when result is zero", () => {
      const cpu = setupCPU([0xe6, 0x0f]);

      cpu.registers.setA(0xf0);
      cpu.registers.setZeroFlag(false);

      cpu.step();

      expect(cpu.registers.getA()).toBe(0x00);
      expect(cpu.registers.getZeroFlag()).toBe(true);
    });
  });

  describe("CALL/RET 0xC9", () => {
    it("CALL pushes return address and jumps; RET returns", () => {
      // 0x0100: CALL 0x0200; 0x0103 next instr address for return
      // 0x0200: RET
      const program: number[] = [0xcd, 0x00, 0x02];
      // place RET (0xc9) at 0x0200
      const rom = makeROM(program);
      rom[0x0200] = 0xc9;

      const cart = new Cartridge();
      cart.load(rom.buffer);
      const bus = new AddressBus(cart);
      const cpu = new CPU(bus);

      // CALL
      const cycles1 = cpu.step();
      expect(cycles1).toBe(24);
      expect(cpu.getPC()).toBe(0x0200);
      expect(cpu.getSP()).toBe(0xfffc); // two bytes pushed

      // RET
      const cycles2 = cpu.step();
      expect(cycles2).toBe(16);
      expect(cpu.getPC()).toBe(0x0103);
    });
  });

  describe("LD r,r' opcodes", () => {
    it("LD B,C loads C into B", () => {
      const cpu = setupCPU([0x41]);
      cpu.registers.setB(0x00);
      cpu.registers.setC(0x99);

      const cycles = cpu.step();

      expect(cycles).toBe(4);
      expect(cpu.registers.getB()).toBe(0x99);
      expect(cpu.registers.getC()).toBe(0x99);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("LD A,(HL) loads memory into A", () => {
      const { cpu, bus } = setupCPUWithBus([0x7e]);
      cpu.registers.setHL(0xc000);
      cpu.registers.setA(0x00);
      bus.write(0xc000, 0x5a);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getA()).toBe(0x5a);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("LD (HL),A stores A in memory", () => {
      const { cpu, bus } = setupCPUWithBus([0x77]);
      cpu.registers.setHL(0xc100);
      cpu.registers.setA(0xab);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(bus.read(0xc100)).toBe(0xab);
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("ALU register opcodes", () => {
    it("ADD A,C updates accumulator and clears N flag", () => {
      const cpu = setupCPU([0x81]);
      cpu.registers.setA(0x12);
      cpu.registers.setC(0x34);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(true);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(4);
      expect(cpu.registers.getA()).toBe(0x46);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("ADC A,(HL) adds with carry from memory", () => {
      const { cpu, bus } = setupCPUWithBus([0x8e]);
      cpu.registers.setHL(0xc200);
      cpu.registers.setA(0xff);
      cpu.registers.setCarryFlag(true);
      bus.write(0xc200, 0x00);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getA()).toBe(0x00);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("CP A,E updates flags without modifying A", () => {
      const cpu = setupCPU([0xbb]);
      cpu.registers.setA(0x30);
      cpu.registers.setE(0x40);

      const cycles = cpu.step();

      expect(cycles).toBe(4);
      expect(cpu.registers.getA()).toBe(0x30);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(true);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("INC r opcodes", () => {
    it("INC B increments register and sets half-carry", () => {
      const cpu = setupCPU([0x04]);
      cpu.registers.setB(0x0f);

      const cycles = cpu.step();

      expect(cycles).toBe(4);
      expect(cpu.registers.getB()).toBe(0x10);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("INC (HL) increments memory value", () => {
      const { cpu, bus } = setupCPUWithBus([0x34]);
      cpu.registers.setHL(0xc300);
      bus.write(0xc300, 0x50);

      const cycles = cpu.step();

      expect(cycles).toBe(12);
      expect(bus.read(0xc300)).toBe(0x51);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("DEC r opcodes", () => {
    it("DEC D decrements register and sets half-carry", () => {
      const cpu = setupCPU([0x15]);
      cpu.registers.setD(0x10);

      const cycles = cpu.step();

      expect(cycles).toBe(4);
      expect(cpu.registers.getD()).toBe(0x0f);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(true);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("DEC (HL) decrements memory value to zero", () => {
      const { cpu, bus } = setupCPUWithBus([0x35]);
      cpu.registers.setHL(0xc400);
      bus.write(0xc400, 0x01);

      const cycles = cpu.step();

      expect(cycles).toBe(12);
      expect(bus.read(0xc400)).toBe(0x00);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getSubtractFlag()).toBe(true);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("16-bit INC rr", () => {
    it("INC BC increments register pair without affecting flags", () => {
      const cpu = setupCPU([0x03]);
      cpu.registers.setBC(0x1234);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getBC()).toBe(0x1235);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("INC HL wraps around without affecting flags", () => {
      const cpu = setupCPU([0x23]);
      cpu.registers.setHL(0xffff);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getHL()).toBe(0x0000);
      expect(cpu.registers.getSubtractFlag()).toBe(true);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("16-bit DEC rr", () => {
    it("DEC DE decrements register pair without affecting flags", () => {
      const cpu = setupCPU([0x1b]);
      cpu.registers.setDE(0x5000);
      cpu.registers.setZeroFlag(false);
      cpu.registers.setCarryFlag(false);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getDE()).toBe(0x4fff);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("DEC SP wraps around without affecting flags", () => {
      const cpu = setupCPU([0x3b]);
      cpu.sp = 0x0000;
      cpu.registers.setSubtractFlag(false);
      cpu.registers.setHalfCarryFlag(false);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.getSP()).toBe(0xffff);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("ADD HL,rr", () => {
    it("ADD HL,BC adds pairs and checks flags are set", () => {
      const cpu = setupCPU([0x09]);
      cpu.registers.setHL(0x0fff);
      cpu.registers.setBC(0x0002);
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getHL()).toBe(0x1001);
      expect(cpu.registers.getZeroFlag()).toBe(true);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("PUSH rr opcodes", () => {
    it("PUSH BC pushes register pair to stack", () => {
      const { cpu, bus } = setupCPUWithBus([0xc5]);
      cpu.registers.setBC(0x1234);
      const initialSP = cpu.getSP();

      const cycles = cpu.step();

      expect(cycles).toBe(16);
      expect(cpu.getSP()).toBe(initialSP - 2);
      expect(bus.read(initialSP - 1)).toBe(0x12); // high byte
      expect(bus.read(initialSP - 2)).toBe(0x34); // low byte
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("PUSH HL pushes register pair to stack", () => {
      const { cpu, bus } = setupCPUWithBus([0xe5]);
      cpu.registers.setHL(0xabcd);
      const initialSP = cpu.getSP();

      const cycles = cpu.step();

      expect(cycles).toBe(16);
      expect(cpu.getSP()).toBe(initialSP - 2);
      expect(bus.read(initialSP - 1)).toBe(0xab); // high byte
      expect(bus.read(initialSP - 2)).toBe(0xcd); // low byte
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("POP rr opcodes", () => {
    it("POP DE pops stack into register pair", () => {
      const { cpu, bus } = setupCPUWithBus([0xd1]);
      const initialSP = cpu.getSP();
      bus.write(initialSP, 0x78); // low byte
      bus.write(initialSP + 1, 0x56); // high byte

      const cycles = cpu.step();

      expect(cycles).toBe(12);
      expect(cpu.registers.getDE()).toBe(0x5678);
      // APPLY MASKING FOR TEST
      expect(cpu.getSP()).toBe((initialSP + 2) & 0xffff);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("POP AF pops stack into register pair and masks F", () => {
      const { cpu, bus } = setupCPUWithBus([0xf1]);
      const initialSP = cpu.getSP();
      bus.write(initialSP, 0xff); // low byte (F register)
      bus.write(initialSP + 1, 0x42); // high byte (A register)

      const cycles = cpu.step();

      expect(cycles).toBe(12);
      expect(cpu.registers.getA()).toBe(0x42);
      expect(cpu.registers.getF()).toBe(0xf0); // F masked to upper nibble
      // APPLY MASKING FOR TEST
      expect(cpu.getSP()).toBe((initialSP + 2) & 0xffff);
      expect(cpu.getPC()).toBe(0x0101);
    });
  });

  describe("LD (memory) and SP", () => {
    it("LD (nn),SP stores SP at 16-bit address", () => {
      const { cpu, bus } = setupCPUWithBus([0x08, 0x00, 0xc6]);
      cpu.sp = 0xfffe;

      const cycles = cpu.step();

      expect(cycles).toBe(20);
      expect(bus.read(0xc600)).toBe(0xfe);
      expect(bus.read(0xc601)).toBe(0xff);
      expect(cpu.getPC()).toBe(0x0103);
    });

    it("LD (HL+),A stores A and increments HL", () => {
      const { cpu, bus } = setupCPUWithBus([0x22]);
      cpu.registers.setHL(0xc500);
      cpu.registers.setA(0x99);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(bus.read(0xc500)).toBe(0x99);
      expect(cpu.registers.getHL()).toBe(0xc501);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("LDH A,(n) loads from high memory", () => {
      const { cpu, bus } = setupCPUWithBus([0xf0, 0x44]);
      bus.write(0xff44, 0xab);

      const cycles = cpu.step();

      expect(cycles).toBe(12);
      expect(cpu.registers.getA()).toBe(0xab);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("LD (BC),A stores A at address in BC", () => {
      const { cpu, bus } = setupCPUWithBus([0x02]);
      cpu.registers.setBC(0xc700);
      cpu.registers.setA(0x5a);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(bus.read(0xc700)).toBe(0x5a);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("LD A,(DE) loads from address in DE", () => {
      const { cpu, bus } = setupCPUWithBus([0x1a]);
      cpu.registers.setDE(0xc702);
      bus.write(0xc702, 0x7b);

      const cycles = cpu.step();

      expect(cycles).toBe(8);
      expect(cpu.registers.getA()).toBe(0x7b);
      expect(cpu.getPC()).toBe(0x0101);
    });

    it("ADD SP,e (0xE8) applies signed offset and sets H and C", () => {
      const cpu = setupCPU([0xe8, 0x01]);
      cpu.sp = 0x00ff;
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(false);
      cpu.registers.setCarryFlag(false);

      const cycles = cpu.step();

      expect(cycles).toBe(16);
      expect(cpu.getSP()).toBe(0x0100);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(true);
      expect(cpu.getPC()).toBe(0x0102);
    });

    it("LD HL,SP+e (0xF8) uses signed offset, updates HL, leaves SP, sets H only", () => {
      const cpu = setupCPU([0xf8, 0x01]);
      cpu.sp = 0x000f;
      cpu.registers.setZeroFlag(true);
      cpu.registers.setSubtractFlag(true);
      cpu.registers.setHalfCarryFlag(false);
      cpu.registers.setCarryFlag(true);

      const cycles = cpu.step();

      expect(cycles).toBe(12);
      // sp + 0x01 = 0x10
      expect(cpu.registers.getHL()).toBe(0x0010);
      expect(cpu.getSP()).toBe(0x000f);
      expect(cpu.registers.getZeroFlag()).toBe(false);
      expect(cpu.registers.getSubtractFlag()).toBe(false);
      expect(cpu.registers.getHalfCarryFlag()).toBe(true);
      expect(cpu.registers.getCarryFlag()).toBe(false);
      expect(cpu.getPC()).toBe(0x0102);
    });
  });
});
