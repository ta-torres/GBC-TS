// @ts-expect-error unused
import { Interrupts, InterruptType } from "./interrupts";

export class Timer {
  // 0xFF04-0xFF07
  // switch from address bus to read/write methods?
  private div: number = 0x00;
  private tima: number = 0x00;
  private tma: number = 0x00;
  private tac: number = 0x00;

  // @ts-expect-error unused
  private divCycles: number = 0;
  // @ts-expect-error unused
  private timaCycles: number = 0;

  // @ts-expect-error unused
  private interrupts: Interrupts;

  constructor(interrupts: Interrupts) {
    this.interrupts = interrupts;
  }

  /*
    step by cycles
    check if timer is enabled before updating tima
    get the frequency from tac table?
    read/write div, tima, tma, tac
    reset to 0?
  */

  // @ts-expect-error unused
  step(cycles: number): void {
    // uhhh
  }

  readDIV(): number {
    return this.div;
  }

  writeDIV(value: number): void {
    // writing any value resets counter to 0 (cycles included?)
    this.div = value & 0xff;
    this.divCycles = 0;
  }

  readTIMA(): number {
    return this.tima;
  }

  writeTIMA(value: number): void {
    this.tima = value & 0xff;
  }

  readTMA(): number {
    return this.tma;
  }

  writeTMA(value: number): void {
    this.tma = value & 0xff;
  }

  readTAC(): number {
    /*
    upper 5 bits always set
    0-1 select clock
    2 enables TIMA increment (DIV is always counting regardless of this)
    */
    return this.tac | 0xf8;
  }

  writeTAC(value: number): void {
    // only lower 3 bits used (0000 0111)
    this.tac = value & 0x07;
    this.timaCycles = 0;
  }

  reset(): void {
    this.div = 0x00;
    this.tima = 0x00;
    this.tma = 0x00;
    this.tac = 0x00;
    this.divCycles = 0;
    this.timaCycles = 0;
  }
}
