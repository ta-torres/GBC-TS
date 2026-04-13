import { Interrupts, InterruptType } from "./interrupts";
import type { TimerSnapshot } from "../types/emulator";

export class Timer {
  // 0xFF04-0xFF07
  // switch from address bus to read/write methods?
  private div: number = 0x00;
  private tima: number = 0x00;
  private tma: number = 0x00;
  private tac: number = 0x00;

  private divCycles: number = 0;
  private timaCycles: number = 0;

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

  step(cycles: number): void {
    // uhhh
    // div aumenta cada 256 t-cycles
    this.divCycles += cycles;
    // si la cantidad de ciclos es mayor o igual a 256 reiniciar a 0? y aumentar div en 1
    // hacer lo mismo con tima
    while (this.divCycles >= 256) {
      this.div = (this.div + 1) & 0xff;
      this.divCycles -= 256;
    }

    // aumentar tima si tac es 1
    if (!this.isTimerEnabled()) return;

    this.timaCycles += cycles;
    const frequency = this.getTimerFrequency();

    while (this.timaCycles >= frequency) {
      this.timaCycles -= frequency;
      this.tima = (this.tima + 1) & 0xff;

      if (this.tima === 0xff) {
        // si hay overflow cargar tma y pedir interrupcion de timer
        this.tima = this.tma;
        this.interrupts.requestInterrupt(InterruptType.TIMER);
      }
    }
  }

  private isTimerEnabled(): boolean {
    return (this.tac & 0x04) !== 0;
  }

  private getTimerFrequency(): number {
    /* 
    TIMA increment frequency
    get cycles per increment threshold in T-cycles (M-cycles * 4)
    00 - 1024
    01 - 16
    10 - 64
    11 - 256
    */
    const frequency = this.tac & 0x03;
    switch (frequency) {
      case 0:
        return 1024;
      case 1:
        return 16;
      case 2:
        return 64;
      case 3:
        return 256;
      default:
        return 1024;
    }
  }

  readDIV(): number {
    return this.div;
  }

  writeDIV(value: number): void {
    // writing any value resets counter to 0 (cycles included?)
    void value;
    this.div = 0x00;
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

  takeSnapshot(): TimerSnapshot {
    return {
      div: this.div,
      tima: this.tima,
      tma: this.tma,
      tac: this.tac,
      divCycles: this.divCycles,
      timaCycles: this.timaCycles,
    };
  }

  restoreSnapshot(s: TimerSnapshot): void {
    this.div = s.div;
    this.tima = s.tima;
    this.tma = s.tma;
    this.tac = s.tac;
    this.divCycles = s.divCycles;
    this.timaCycles = s.timaCycles;
  }
}
