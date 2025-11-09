import { IO_REGISTERS } from "../../types/memory";

// hblank, vblank, oam, transfer
type PpuMode = 0 | 1 | 2 | 3;

const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 144;
const DOTS_PER_LINE = 456;
//const MODE2_DOTS = 80;
//const MODE3_DOTS = 172;
const FRAME_DOTS = 70224;

export class PPU {
  //   private vram: Uint8Array;
  private io: Uint8Array;
  private framebuffer: Uint32Array;
  //private mode: PpuMode;
  private ly: number;
  private dotsInLine: number;
  private frameReady: boolean;
  private frameDots: number;

  constructor(io: Uint8Array) {
    // this.vram = vram;
    this.io = io;
    this.framebuffer = new Uint32Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    //this.mode = 2;
    this.ly = 0;
    this.dotsInLine = 0;
    this.frameReady = false;
    this.frameDots = 0;

    this.io[IO_REGISTERS.LY - 0xff00] = 0;
    this.io[IO_REGISTERS.LCDC - 0xff00] |= 0x80;
    this.setMode(2);
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

    this.dotsInLine += cycles;
    this.frameDots += cycles;

    if (this.dotsInLine >= DOTS_PER_LINE) {
      this.dotsInLine -= DOTS_PER_LINE;

      // increment horizontal line counter and update ly register
      this.ly = (this.ly + 1) & 0xff;
      this.io[IO_REGISTERS.LY - 0xff00] = this.ly;

      if (this.ly === 144)
        this.setMode(1); // enter VBlank
      else if (this.ly > 153) {
        // new frame
        this.ly = 0;
        this.io[IO_REGISTERS.LY - 0xff00] = 0;
        this.setMode(2);
      }
    }

    if (this.frameDots >= FRAME_DOTS) {
      this.frameDots -= FRAME_DOTS;
      this.renderTestPattern();
      this.frameReady = true;
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

  private setMode(mode: PpuMode): void {
    //this.mode = mode;
    const idx = IO_REGISTERS.STAT - 0xff00;
    const stat = this.io[idx];
    this.io[idx] = (stat & 0xfc) | mode;
  }

  private lcdEnabled(): boolean {
    return (this.io[IO_REGISTERS.LCDC - 0xff00] & 0x80) !== 0;
  }

  //renderScanlineBG
  private renderTestPattern(): void {
    // output to ABGR (0xAABBGGRR)
    for (let y = 0; y < SCREEN_HEIGHT; y++) {
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        const band = Math.floor(x / 20) % 4;
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
