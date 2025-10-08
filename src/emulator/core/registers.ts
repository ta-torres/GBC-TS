export class Registers {
  /* 
    https://gbdev.io/pandocs/Power_Up_Sequence.html
  // https://gbdev.io/pandocs/CPU_Registers_and_Flags.html
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

  // get 16bit access and flag ops
  // reset to power on state
  reset(): void {
    this.a = 0x01;
    this.f = 0xb0;
    this.b = 0x00;
    this.c = 0x13;
    this.d = 0x00;
    this.e = 0xd8;
    this.h = 0x01;
    this.l = 0x4d;
  }
}
