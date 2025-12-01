import { Registers } from "./registers";
import { AddressBus } from "../memory/addressBus";
import { OPCODE_TABLE } from "./opcodes/opcodes";
import { CB_OPCODE_TABLE } from "./opcodes/opcodesCB";
import { toHex16, toHex8 } from "../utils/bitwise";
import { Interrupts, InterruptType, INTERRUPT_ADDRESSES } from "./interrupts";

export class CPU {
  public registers: Registers;
  private bus: AddressBus;
  public pc: number;
  public sp: number;
  private ime: boolean = false;
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
    this.pc = 0x0100;
    this.sp = 0xfffe;
    this.ime = false;
    this.imeScheduled = false;
    this.halted = false;
    this.stopped = false;
    this.haltBug = false;
  }

  step(): number {
    // handle interrupts before running current instruction
    if (this.ime) {
      const interrupt = this.interrupts.getHighestPriority();
      if (interrupt !== null) {
        this.handleInterrupt(interrupt);
        return 20;
      }
    }

    if (this.halted) {
      /*
      https://gbdev.io/pandocs/halt.html#halt-bug
      HALT bug: pc is not incremented after a HALT instruction when IME is disabled and an interrupt is pending
      check for disabled IME and pending interrupt
      */

      // wake from halted state if there is an interrupt, deal with interrupt only if IME is enabled
      if (this.interrupts.getPending() !== 0) {
        this.halted = false;
        return 4;
      }
      return 4;
    }

    const opcode = this.bus.read(this.pc);
    if (this.haltBug) {
      // read next byte twice
      this.haltBug = false;
    } else {
      this.pc = (this.pc + 1) & 0xffff;
    }

    if (opcode === 0xcb) {
      const cbOpcode = this.bus.read(this.pc);
      this.pc = (this.pc + 1) & 0xffff;

      const cbInfo = CB_OPCODE_TABLE[cbOpcode];
      if (!cbInfo) {
        throw new Error(
          `Unimplemented CB opcode: ${toHex8(cbOpcode)} at PC: ${toHex16(this.pc)}`,
        );
      }
      return cbInfo.handler(this, this.bus);
    }

    /* console.log(
      `PC: ${toHex16(this.pc)} | Opcode: ${toHex8(opcode)} | ${this.registers.toString()}`,
    ); */
    const info = OPCODE_TABLE[opcode];
    if (!info) {
      throw new Error(
        `Unimplemented opcode: ${toHex8(opcode)} at PC: ${toHex16(this.pc)}\n` +
          `Registers: ${this.registers.toString()}`,
      );
    }
    //console.log(this.getRegisters().toString());

    const cycles = info.handler(this, this.bus);

    // if IME is scheduled after running current instruction, enable IME for next step (EI delays by 1 instruction)
    if (this.imeScheduled) {
      this.ime = true;
      this.imeScheduled = false;
    }

    return cycles;
  }

  private handleInterrupt(type: InterruptType): void {
    this.ime = false;
    this.imeScheduled = false;
    this.halted = false;
    this.interrupts.clearInterrupt(type);
    this.push(this.pc);
    this.pc = INTERRUPT_ADDRESSES[type];
  }

  push(value: number): void {
    // handle overflow case when decrementing SP?
    // high byte first
    this.sp = (this.sp - 1) & 0xffff;
    this.bus.write(this.sp, (value >> 8) & 0xff);
    // low byte second
    this.sp = (this.sp - 1) & 0xffff;
    this.bus.write(this.sp, value & 0xff);
  }

  pop(): number {
    // handle underflow case when SP=0xFFFF?
    // low first
    const low = this.bus.read(this.sp);
    this.sp = (this.sp + 1) & 0xffff;

    const high = this.bus.read(this.sp);
    this.sp = (this.sp + 1) & 0xffff;

    return (high << 8) | low;
  }

  halt(): void {
    const pending = this.interrupts.getPending();
    // don't enter HALT, skip next PC increment
    if (!this.ime && pending !== 0) {
      this.haltBug = true;
      this.halted = false;
      return;
    }
    // wait until an interrupt becomes pending (in this.halted)
    this.halted = true;
  }

  reset(): void {
    this.registers.reset();
    this.pc = 0x0100;
    this.sp = 0xfffe;
    this.ime = false;
    this.imeScheduled = false;
    this.halted = false;
    this.stopped = false;
    this.haltBug = false;
  }

  getPC(): number {
    return this.pc;
  }

  getSP(): number {
    return this.sp;
  }

  getRegisters(): Registers {
    return this.registers;
  }

  getInstruction(): string {
    return this.bus.readInstruction(this.pc).toString(16);
  }

  enableIME(): void {
    this.ime = true;
  }
  disableIME(): void {
    this.ime = false;
  }
  scheduleIME(): void {
    this.imeScheduled = true;
  }
}
