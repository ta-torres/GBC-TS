export class Registers {
  /* 
    https://gbdev.io/pandocs/Power_Up_Sequence.html
    https://gbdev.io/pandocs/CPU_Registers_and_Flags.html
    https://www.w3schools.com/js/js_bitwise.asp
    */
  private a: number = 0x01; // accumulator
  private f: number = 0x00; // flags
  private b: number = 0x00;
  private c: number = 0x13;
  private d: number = 0x00;
  private e: number = 0xd8;
  private h: number = 0x01;
  private l: number = 0x4d;

  // f register flags (Z N H C)
  private static readonly FLAG_Z = 0x80; // Zero (1000 0000)
  private static readonly FLAG_N = 0x40; // Subtract (0100 0000)
  private static readonly FLAG_H = 0x20; // Half-carry (0010 0000)
  private static readonly FLAG_C = 0x10; // Carry (0001 0000)

  // 8bit access
  getA(): number {
    return this.a;
  }
  setA(value: number): void {
    this.a = value & 0xff;
  }

  getF(): number {
    return this.f;
  }
  setF(value: number): void {
    this.f = value & 0xf0;
  }

  getB(): number {
    return this.b;
  }
  setB(value: number): void {
    this.b = value & 0xff;
  }

  getC(): number {
    return this.c;
  }
  setC(value: number): void {
    this.c = value & 0xff;
  }

  getD(): number {
    return this.d;
  }
  setD(value: number): void {
    this.d = value & 0xff;
  }

  getE(): number {
    return this.e;
  }
  setE(value: number): void {
    this.e = value & 0xff;
  }

  getH(): number {
    return this.h;
  }
  setH(value: number): void {
    this.h = value & 0xff;
  }

  getL(): number {
    return this.l;
  }
  setL(value: number): void {
    this.l = value & 0xff;
  }

  //16bit access
  getAF(): number {
    return (this.a << 8) | this.f;
  }
  setAF(value: number): void {
    this.a = (value >> 8) & 0xff;
    // mask lower 4 bits only (A | F)
    this.f = value & 0xf0;
  }

  getBC(): number {
    return (this.b << 8) | this.c;
  }
  setBC(value: number): void {
    this.b = (value >> 8) & 0xff;
    this.c = value & 0xff;
  }

  getDE(): number {
    return (this.d << 8) | this.e;
  }
  setDE(value: number): void {
    this.d = (value >> 8) & 0xff;
    this.e = value & 0xff;
  }

  getHL(): number {
    return (this.h << 8) | this.l;
  }
  setHL(value: number): void {
    this.h = (value >> 8) & 0xff;
    this.l = value & 0xff;
  }

  // flag ops
  getZeroFlag(): boolean {
    return (this.f & Registers.FLAG_Z) !== 0;
  }
  setZeroFlag(value: boolean): void {
    if (value) {
      this.f |= Registers.FLAG_Z;
    } else {
      this.f &= ~Registers.FLAG_Z;
    }
  }

  getSubtractFlag(): boolean {
    return (this.f & Registers.FLAG_N) !== 0;
  }
  setSubtractFlag(value: boolean): void {
    if (value) {
      this.f |= Registers.FLAG_N;
    } else {
      this.f &= ~Registers.FLAG_N;
    }
  }

  getHalfCarryFlag(): boolean {
    return (this.f & Registers.FLAG_H) !== 0;
  }
  setHalfCarryFlag(value: boolean): void {
    if (value) {
      this.f |= Registers.FLAG_H;
    } else {
      this.f &= ~Registers.FLAG_H;
    }
  }

  getCarryFlag(): boolean {
    return (this.f & Registers.FLAG_C) !== 0;
  }
  setCarryFlag(value: boolean): void {
    if (value) {
      this.f |= Registers.FLAG_C;
    } else {
      this.f &= ~Registers.FLAG_C;
    }
  }

  // reset to power on state
  reset(cgbMode: boolean = false): void {
    // only setting A might be necessary for CGB mode?
    this.a = cgbMode ? 0x11 : 0x01;
    this.f = cgbMode ? 0x80 : 0xb0;
    this.b = 0x00;
    this.c = cgbMode ? 0x00 : 0x13;
    this.d = cgbMode ? 0xff : 0x00;
    this.e = cgbMode ? 0x56 : 0xd8;
    this.h = cgbMode ? 0x00 : 0x01;
    this.l = cgbMode ? 0x0d : 0x4d;
  }

  toString(): string {
    return [
      `AF: ${this.getAF().toString(16).padStart(4, "0")}`,
      `BC: ${this.getBC().toString(16).padStart(4, "0")}`,
      `DE: ${this.getDE().toString(16).padStart(4, "0")}`,
      `HL: ${this.getHL().toString(16).padStart(4, "0")}`,
      `Z flag: ${this.getZeroFlag() ? "1" : "0"}`,
      `N flag: ${this.getSubtractFlag() ? "1" : "0"}`,
      `H flag: ${this.getHalfCarryFlag() ? "1" : "0"}`,
      `C flag: ${this.getCarryFlag() ? "1" : "0"}`,
    ].join(" | ");
  }
}
