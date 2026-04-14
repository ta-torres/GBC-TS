import { Registers } from "./registers";
import { AddressBus } from "../memory/addressBus";
import { OPCODE_TABLE } from "./opcodes/opcodes";
import { CB_OPCODE_TABLE } from "./opcodes/opcodesCB";
import { toHex16, toHex8 } from "../utils/bitwise";
import { Interrupts, InterruptType, INTERRUPT_ADDRESSES } from "./interrupts";
import type { CpuSnapshot } from "../types/emulator";

export class CPU {
  // only setting A might be necessary for CGB mode?
  public registers: Registers;
  private bus: AddressBus;
  public programCounter: number;
  public stackPointer: number;
  private interruptMasterEnable: boolean = false;
  private imeScheduled: boolean;
  private halted: boolean;
  private stopped: boolean;
  private haltBug: boolean;

  private interrupts: Interrupts;

  private cgbMode: boolean = false;

  constructor(bus: AddressBus, interrupts: Interrupts) {
    this.registers = new Registers();
    this.bus = bus;
    this.interrupts = interrupts;

    // post-boot state
    this.programCounter = 0x0100;
    this.stackPointer = 0xfffe;
    this.interruptMasterEnable = false;
    this.imeScheduled = false;
    this.halted = false;
    this.stopped = false;
    this.haltBug = false;
  }

  step(): number {
    // handle interrupts before running current instruction
    if (this.interruptMasterEnable) {
      const interrupt = this.interrupts.getHighestPriority();
      if (interrupt !== null) {
        this.handleInterrupt(interrupt);
        return 20;
      }
    }

    if (this.stopped) {
      // wake from STOP when any interrupt becomes pending
      if (this.interrupts.getPending() !== 0) {
        this.stopped = false;
      }
      return 4;
    }

    if (this.halted) {
      /*
      https://gbdev.io/pandocs/halt.html#halt-bug
      HALT bug: pc is not incremented after running a HALT instruction if IME is disabled and an interrupt is pending. "Double read" effect happens if the next instruction reads the next value from the program counter (pc++)
      halt() checks this condition and sets haltBug = true, preventing pc from being incremented in the next step()
      */

      // wake from halted state if there is an interrupt, deal with interrupt only if IME is enabled
      if (this.interrupts.getPending() !== 0) {
        this.halted = false;
        return 4;
      }
      return 4;
    }

    const opcode = this.bus.read(this.programCounter);
    if (this.haltBug) {
      // read next byte twice
      this.haltBug = false;
    } else {
      this.programCounter = (this.programCounter + 1) & 0xffff;
    }

    if (opcode === 0xcb) {
      const cbOpcode = this.bus.read(this.programCounter);
      this.programCounter = (this.programCounter + 1) & 0xffff;

      const cbInstruction = CB_OPCODE_TABLE[cbOpcode];
      if (!cbInstruction) {
        console.warn(
          `Unimplemented CB opcode: ${toHex8(cbOpcode)} at PC: ${toHex16(this.programCounter)}`,
        );
        this.programCounter = (this.programCounter + 1) & 0xffff;
        return 4;
      }
      return cbInstruction.execute(this, this.bus);
    }

    /* console.log(
      `PC: ${toHex16(this.pc)} | Opcode: ${toHex8(opcode)} | ${this.registers.toString()}`,
    ); */
    const instruction = OPCODE_TABLE[opcode];
    if (!instruction) {
      console.warn(
        `Unimplemented opcode: ${toHex8(opcode)} at PC: ${toHex16(this.programCounter)}\n` +
          `Registers: ${this.registers.toString()}`,
      );
      this.programCounter = (this.programCounter + 1) & 0xffff;
      return 4;
    }
    //console.log(this.getRegisters().toString());

    const cycles = instruction.execute(this, this.bus);

    // if IME is scheduled after running current instruction, enable IME for next step (EI delays by 1 instruction)
    if (this.imeScheduled) {
      this.interruptMasterEnable = true;
      this.imeScheduled = false;
    }

    return cycles;
  }

  private handleInterrupt(type: InterruptType): void {
    this.interruptMasterEnable = false;
    this.imeScheduled = false;
    this.halted = false;
    this.interrupts.clearInterrupt(type);
    this.push(this.programCounter);
    this.programCounter = INTERRUPT_ADDRESSES[type];
  }

  push(value: number): void {
    // handle overflow case when decrementing SP?
    // high byte first
    this.stackPointer = (this.stackPointer - 1) & 0xffff;
    this.bus.write(this.stackPointer, (value >> 8) & 0xff);
    // low byte second
    this.stackPointer = (this.stackPointer - 1) & 0xffff;
    this.bus.write(this.stackPointer, value & 0xff);
  }

  pop(): number {
    // handle underflow case when SP=0xFFFF?
    // low first
    const low = this.bus.read(this.stackPointer);
    this.stackPointer = (this.stackPointer + 1) & 0xffff;

    const high = this.bus.read(this.stackPointer);
    this.stackPointer = (this.stackPointer + 1) & 0xffff;

    return (high << 8) | low;
  }

  halt(): void {
    const pending = this.interrupts.getPending();
    // don't enter HALT, skip next PC increment
    if (!this.interruptMasterEnable && pending !== 0) {
      this.haltBug = true;
      this.halted = false;
      return;
    }
    // wait until an interrupt becomes pending (in this.halted)
    this.halted = true;
  }

  stop(): void {
    this.stopped = true;
  }

  reset(cgbMode: boolean = this.cgbMode): void {
    this.cgbMode = cgbMode;
    this.registers.reset(cgbMode);
    this.programCounter = 0x0100;
    this.stackPointer = 0xfffe;
    this.interruptMasterEnable = false;
    this.imeScheduled = false;
    this.halted = false;
    this.stopped = false;
    this.haltBug = false;
  }

  // backwards compatibility with opcodes/test definitions
  get pc(): number {
    return this.programCounter;
  }

  set pc(value: number) {
    this.programCounter = value & 0xffff;
  }

  get sp(): number {
    return this.stackPointer;
  }

  set sp(value: number) {
    this.stackPointer = value & 0xffff;
  }

  getPC(): number {
    return this.programCounter;
  }

  getSP(): number {
    return this.stackPointer;
  }

  getRegisters(): Registers {
    return this.registers;
  }

  getInstruction(): string {
    return this.bus.readInstruction(this.programCounter).toString(16);
  }

  enableIME(): void {
    this.interruptMasterEnable = true;
  }
  disableIME(): void {
    this.interruptMasterEnable = false;
  }
  scheduleIME(): void {
    this.imeScheduled = true;
  }

  takeSnapshot(): CpuSnapshot {
    return {
      pc: this.programCounter,
      sp: this.stackPointer,
      a: this.registers.getA(),
      b: this.registers.getB(),
      c: this.registers.getC(),
      d: this.registers.getD(),
      e: this.registers.getE(),
      h: this.registers.getH(),
      l: this.registers.getL(),
      f: this.registers.getF(),
      ime: this.interruptMasterEnable,
      imeScheduled: this.imeScheduled,
      halted: this.halted,
      stopped: this.stopped,
      haltBug: this.haltBug,
    };
  }

  restoreSnapshot(s: CpuSnapshot): void {
    this.programCounter = s.pc & 0xffff;
    this.stackPointer = s.sp & 0xffff;
    this.registers.setA(s.a);
    this.registers.setB(s.b);
    this.registers.setC(s.c);
    this.registers.setD(s.d);
    this.registers.setE(s.e);
    this.registers.setH(s.h);
    this.registers.setL(s.l);
    this.registers.setF(s.f);
    this.interruptMasterEnable = s.ime;
    this.imeScheduled = s.imeScheduled;
    this.halted = s.halted;
    this.stopped = s.stopped;
    this.haltBug = s.haltBug;
  }
}
