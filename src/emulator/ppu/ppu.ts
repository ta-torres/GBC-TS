import { IO_REGISTERS } from "../../types/memory";
import { Interrupts, InterruptType } from "../core/interrupts";

// hblank, vblank, oam, transfer
type PpuMode = 0 | 1 | 2 | 3;

const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 144;
const DOTS_PER_LINE = 456;
const MODE2_DOTS = 80;
const MODE3_DOTS = 172;

// STAT interrupt flags
const STAT_MODE_BITS = 0x03;
const STAT_LYC_FLAG = 0x04;
const STAT_M0_IRQ = 0x08;
const STAT_M1_IRQ = 0x10;
const STAT_M2_IRQ = 0x20;
const STAT_LYC_IRQ = 0x40;

export class PPU {
  private vram: Uint8Array;
  private oam: Uint8Array;
  private io: Uint8Array;
  private interrupts: Interrupts;
  private framebuffer: Uint32Array;
  private mode: PpuMode;
  private ly: number;
  private dotsInLine: number;
  private frameReady: boolean;

  // DEBUG
  private debugTrace: boolean;
  private debugFrameCounter: number;
  private debugFrameSamples: { ly: number; stat: number; mode: number }[];

  // cambiar a type alias?
  /*
  LCD_STAT interrupt
  Trackea que modos STAT ya activaron una interrupcion este frame,
  evita solicitudes repetidas a LCD_STAT mientras la condicion sigue siendo verdadera
  */
  private statInterruptSet: {
    m0: boolean; // hblank
    m1: boolean; // vblank
    m2: boolean; // oam
    lyc: boolean; // LYC
  };

  constructor(
    vram: Uint8Array,
    oam: Uint8Array,
    io: Uint8Array,
    interrupts: Interrupts,
  ) {
    this.vram = vram;
    this.oam = oam;
    this.io = io;
    this.interrupts = interrupts;
    this.framebuffer = new Uint32Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    this.mode = 2;
    this.ly = 0;
    this.dotsInLine = 0;
    this.frameReady = false;

    // DEBUG
    this.debugTrace = false;
    this.debugFrameCounter = 0;
    this.debugFrameSamples = [];

    this.statInterruptSet = { m0: false, m1: false, m2: false, lyc: false };

    this.io[IO_REGISTERS.LY - 0xff00] = 0;
    this.io[IO_REGISTERS.LCDC - 0xff00] |= 0x80;
    this.setMode(2);
    // dont request interrupts on class init?
  }

  step(cycles: number): void {
    if (!this.lcdEnabled()) {
      this.ly = 0;
      this.dotsInLine = 0;
      this.frameReady = false;
      this.io[IO_REGISTERS.LY - 0xff00] = 0;
      this.setMode(0);
      return;
    }

    this.evaluateLycAndCheckSTAT();

    this.dotsInLine += cycles;

    if (this.ly < 144) {
      if (this.dotsInLine < MODE2_DOTS) {
        this.setMode(2);
      } else if (this.dotsInLine < MODE2_DOTS + MODE3_DOTS) {
        this.setMode(3);
      } else if (this.dotsInLine < DOTS_PER_LINE) {
        this.setMode(0);
      }
    } else {
      this.setMode(1);
    }

    if (this.dotsInLine >= DOTS_PER_LINE) {
      this.dotsInLine -= DOTS_PER_LINE;

      // increment horizontal line counter and update ly register
      this.ly = (this.ly + 1) & 0xff;
      this.io[IO_REGISTERS.LY - 0xff00] = this.ly;

      this.evaluateLycAndCheckSTAT();

      // DEBUG
      if (this.debugTrace) {
        const statNow = this.io[IO_REGISTERS.STAT - 0xff00];
        const modeNow = statNow & 0x03;
        if (
          this.ly === 0 ||
          this.ly === 1 ||
          this.ly === 2 ||
          this.ly === 143 ||
          this.ly === 144
        ) {
          this.debugFrameSamples.push({
            ly: this.ly,
            stat: statNow,
            mode: modeNow,
          });
        }
      }

      if (this.ly === 144) {
        this.setMode(1); // enter VBlank

        // move render pattern inside VBlank rendering and request VBlank interrupt
        this.renderTestPattern();
        this.frameReady = true;
        this.interrupts.requestInterrupt(InterruptType.VBLANK);

        // DEBUG
        if (this.debugTrace) {
          if (this.debugFrameSamples.length > 0) {
            const summary = this.debugFrameSamples
              .map(
                (s) =>
                  `LY=${s.ly} STAT=${s.stat.toString(16).padStart(2, "0")} M${s.mode}`,
              )
              .join(" | ");
            console.log(`[PPU] frame ${this.debugFrameCounter++}: ${summary}`);
            this.debugFrameSamples = [];
          }
        }
      } else if (this.ly > 153) {
        this.ly = 0;
        this.io[IO_REGISTERS.LY - 0xff00] = 0;

        this.evaluateLycAndCheckSTAT();

        // hblank
        this.setMode(2);

        // DEBUG
        if (this.debugTrace) {
          const statNow2 = this.io[IO_REGISTERS.STAT - 0xff00];
          const modeNow2 = statNow2 & 0x03;
          this.debugFrameSamples.push({
            ly: this.ly,
            stat: statNow2,
            mode: modeNow2,
          });
        }
      }
    }
  }

  getFramebuffer(): Uint32Array {
    return this.framebuffer;
  }

  consumeFrameReady(): boolean {
    const ready = this.frameReady;
    this.frameReady = false;
    return ready;
  }

  setDebugTrace(enabled: boolean): void {
    this.debugTrace = enabled;
    this.debugFrameSamples = [];
    this.debugFrameCounter = 0;
  }

  private evaluateLycAndCheckSTAT(): void {
    /* 
    syncs LYC = LY status into STAT and forwards that state to the STAT interrupt logic

    read LYC and check if LYC == LY
    set/clear STAT bit 2 (LYC flag) to mirror the result
    check for STAT interrupts when LYC=LY is true and STAT bit 6 (LYC interrupt) is enabled
    */
    const statIdx = IO_REGISTERS.STAT - 0xff00;
    const statBefore = this.io[statIdx];

    const lyc = this.io[IO_REGISTERS.LYC - 0xff00];
    const equal = this.ly === lyc;

    const newStat =
      (statBefore & (~STAT_LYC_FLAG & 0xff)) | (equal ? STAT_LYC_FLAG : 0);

    this.io[statIdx] = newStat;
    this.checkSTATInterrupts();
  }

  private checkSTATInterrupts(): void {
    const statIdx = IO_REGISTERS.STAT - 0xff00;
    const stat = this.io[statIdx];
    const mode = stat & STAT_MODE_BITS;
    const wantM0 = (stat & STAT_M0_IRQ) !== 0;
    const wantM1 = (stat & STAT_M1_IRQ) !== 0;
    const wantM2 = (stat & STAT_M2_IRQ) !== 0;
    const wantLYC = (stat & STAT_LYC_IRQ) !== 0;

    if (!this.lcdEnabled()) {
      this.statInterruptSet.m0 = false;
      this.statInterruptSet.m1 = false;
      this.statInterruptSet.m2 = false;
      this.statInterruptSet.lyc = false;
      return;
    }

    // hblank
    if (wantM0 && mode === 0) {
      if (!this.statInterruptSet.m0) {
        this.interrupts.requestInterrupt(InterruptType.LCD_STAT);
        this.statInterruptSet.m0 = true;
      }
    } else {
      this.statInterruptSet.m0 = false;
    }

    // vblank
    if (wantM1 && mode === 1) {
      if (!this.statInterruptSet.m1) {
        this.interrupts.requestInterrupt(InterruptType.LCD_STAT);
        this.statInterruptSet.m1 = true;
      }
    } else {
      this.statInterruptSet.m1 = false;
    }

    // oam
    if (wantM2 && mode === 2) {
      if (!this.statInterruptSet.m2) {
        this.interrupts.requestInterrupt(InterruptType.LCD_STAT);
        this.statInterruptSet.m2 = true;
      }
    } else {
      this.statInterruptSet.m2 = false;
    }

    // LYC
    const lyc = this.io[IO_REGISTERS.LYC - 0xff00];
    const lyEqualsLYC = this.ly === lyc;
    if (wantLYC && lyEqualsLYC) {
      if (!this.statInterruptSet.lyc) {
        this.interrupts.requestInterrupt(InterruptType.LCD_STAT);
        this.statInterruptSet.lyc = true;
      }
    } else {
      this.statInterruptSet.lyc = false;
    }
  }

  private setMode(mode: PpuMode): void {
    const idx = IO_REGISTERS.STAT - 0xff00;
    const stat = this.io[idx];

    if (this.mode !== mode) {
      this.mode = mode;
      this.io[idx] = (stat & (~STAT_MODE_BITS & 0xff)) | mode;
      this.checkSTATInterrupts();
      return;
    }
    this.io[idx] = (stat & (~STAT_MODE_BITS & 0xff)) | mode;
  }

  private lcdEnabled(): boolean {
    return (this.io[IO_REGISTERS.LCDC - 0xff00] & 0x80) !== 0;
  }

  //renderScanlineBG
  private renderTestPattern(): void {
    // output to ABGR (0xAABBGGRR)
    const tweak = (this.vram[0] ^ this.oam[0]) & 3;
    for (let y = 0; y < SCREEN_HEIGHT; y++) {
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        const band = (Math.floor(x / 20) + tweak) % 4;
        let color: number;

        switch (band) {
          case 0:
            color = 0xffd0f8e0;
            break;
          case 1:
            color = 0xff70c088;
            break;
          case 2:
            color = 0xff566834;
            break;
          default:
            color = 0xff201808;
            break;
        }
        this.framebuffer[y * SCREEN_WIDTH + x] = color;
      }
    }
  }
}
