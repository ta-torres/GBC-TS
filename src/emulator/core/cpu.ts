import { Registers } from "./registers";
import { AddressBus } from "../memory/addressBus";
import { OPCODE_TABLE } from "./opcodes/opcodes";
import { CB_OPCODE_TABLE } from "./opcodes/opcodesCB";
import { toHex16, toHex8 } from "../utils/bitwise";
import { Interrupts, InterruptType, INTERRUPT_ADDRESSES } from "./interrupts";

export class CPU {
  public registers: Registers;
  private bus: AddressBus;
  public programCounter: number;
  public stackPointer: number;
  private interruptMasterEnable: boolean = false;
  private imeScheduled: boolean;
  private halted: boolean;
  // @ts-expect-error unused
  private stopped: boolean;
  private haltBug: boolean;

  private interrupts: Interrupts;

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

  reset(): void {
    this.registers.reset();
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
}
