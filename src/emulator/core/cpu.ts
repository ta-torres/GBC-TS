import { Registers } from "./registers";
import { AddressBus } from "../memory/addressBus";
import { OPCODE_TABLE } from "./opcodes";
import { toHex16, toHex8 } from "../../utils/bitwise";

export class CPU {
  public registers: Registers;
  private bus: AddressBus;
  public pc: number;
  public sp: number;
  //private ime: boolean;
  private halted: boolean;

  constructor(bus: AddressBus) {
    this.registers = new Registers();
    this.bus = bus;

    // post-boot state
    this.pc = 0x0100; // start of cartridge
    this.sp = 0xfffe; // top of stack
    //this.ime = false;
    this.halted = false;
  }

  step(): number {
    if (this.halted) {
      // how does this interact with ime?
      // default halt cycle
      return 4;
    }

    const opcode = this.bus.read(this.pc);

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

    // check and increase program counter
    this.pc = (this.pc + 1) & 0xffff;
    const cycles = info.handler(this, this.bus);
    return cycles;
  }

  push(value: number): void {
    // high byte first
    this.sp = (this.sp - 1) & 0xffff;
    this.bus.write(this.sp, (value >> 8) & 0xff);
    // low byte second
    this.sp = (this.sp - 1) & 0xffff;
    this.bus.write(this.sp, value & 0xff);
  }

  pop(): number {
    // low first
    const low = this.bus.read(this.sp);
    this.sp = (this.sp + 1) & 0xffff;

    const high = this.bus.read(this.sp);
    this.sp = (this.sp + 1) & 0xffff;

    return (high << 8) | low;
  }

  reset(): void {
    this.registers.reset();
    this.pc = 0x0100;
    this.sp = 0xfffe;
    //this.ime = false;
    this.halted = false;
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
}
