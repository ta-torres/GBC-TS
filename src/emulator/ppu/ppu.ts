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

const TILE_BYTES = 16;

interface OAMEntry {
  y: number;
  x: number;
  tile: number;
  attribute: number;
  index: number;
}

const readTileDataIndex = (
  io: Uint8Array,
): { base: number; signedIndex: boolean } => {
  const lcdc = io[IO_REGISTERS.LCDC - 0xff00];
  const dataSelect = (lcdc & 0x10) !== 0;
  return dataSelect
    ? { base: 0x8000, signedIndex: false }
    : { base: 0x9000, signedIndex: true };
};

const bgTileMapBase = (io: Uint8Array): number => {
  const lcdc = io[IO_REGISTERS.LCDC - 0xff00];
  return (lcdc & 0x08) !== 0 ? 0x9c00 : 0x9800;
};

const windowTileMapBase = (io: Uint8Array): number => {
  const lcdc = io[IO_REGISTERS.LCDC - 0xff00];
  return (lcdc & 0x40) !== 0 ? 0x9c00 : 0x9800;
};

const fetchTileRow = (
  vram: Uint8Array,
  tileBase: number,
  tileIndex: number,
  row: number,
): { low: number; high: number } => {
  const tileRowAddress = tileBase + tileIndex * TILE_BYTES + row * 2;
  const lowTilePlaneByte = vram[tileRowAddress - 0x8000];
  const highTilePlaneByte = vram[tileRowAddress - 0x8000 + 1];
  return { low: lowTilePlaneByte, high: highTilePlaneByte };
};

const getBGPixelIndex = (
  lowTilePlaneByte: number,
  highTilePlaneByte: number,
  bitIndex: number,
): 0 | 1 | 2 | 3 => {
  const bitPlane0 = (lowTilePlaneByte >> bitIndex) & 1;
  const bitPlane1 = (highTilePlaneByte >> bitIndex) & 1;
  return ((bitPlane1 << 1) | bitPlane0) as 0 | 1 | 2 | 3;
};

export class PPU {
  private vram: Uint8Array;
  private oam: Uint8Array;
  private io: Uint8Array;
  private interrupts: Interrupts;
  private framebuffer: Uint32Array;
  private bgIndexLine: Uint8Array;
  private mode: PpuMode;
  private ly: number;
  private dotsInLine: number;
  private frameReady: boolean;
  private windowScanline: number;

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
    this.bgIndexLine = new Uint8Array(SCREEN_WIDTH);
    this.mode = 2;
    this.ly = 0;
    this.dotsInLine = 0;
    this.frameReady = false;
    this.windowScanline = 0;

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

    const previousMode = this.mode;

    if (this.ly < 144) {
      if (this.dotsInLine < MODE2_DOTS) {
        this.setMode(2);
      } else if (this.dotsInLine < MODE2_DOTS + MODE3_DOTS) {
        this.setMode(3);
      } else if (this.dotsInLine < DOTS_PER_LINE) {
        this.setMode(0);
        // only render bg once per scanline at the start of hblank
        if (previousMode === 3 && this.ly < 144) {
          this.renderBackgroundLine();
          this.renderWindowLine();
          this.renderSpritesForScanline();
        }
      }
    } else {
      this.setMode(1);
    }

    if (this.dotsInLine >= DOTS_PER_LINE) {
      const previousLy = this.ly;

      this.dotsInLine -= DOTS_PER_LINE;

      // increment horizontal line counter and update ly register
      this.ly = (this.ly + 1) & 0xff;
      this.io[IO_REGISTERS.LY - 0xff00] = this.ly;

      this.evaluateLycAndCheckSTAT();

      // update windowScanline once for every visible line in vertical
      const lcdcWindow = this.io[IO_REGISTERS.LCDC - 0xff00];
      const windowEnabled = (lcdcWindow & 0x20) !== 0;
      const wy = this.io[IO_REGISTERS.WY - 0xff00];

      if (windowEnabled && previousLy >= wy && previousLy < 144) {
        this.windowScanline = (this.windowScanline + 1) & 0xff;
      }

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
        /* if (this.debugTrace) {
          this.renderTestPattern();
        } */
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

        // reset internal counter when reaching a new frame
        this.windowScanline = 0;

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

  private DMG_RGBA = [0xffffffff, 0xffaaaaaa, 0xff555555, 0xff000000];

  private mapDMGPalette(bgp: number, color: 0 | 1 | 2 | 3): number {
    const shift = color * 2;
    const shade = (bgp >> shift) & 0x03;
    return this.DMG_RGBA[shade];
  }

  private mapOBPPalette(obp: number, color: 0 | 1 | 2 | 3): number {
    const shift = color * 2;
    const shade = (obp >> shift) & 0x03;
    return this.DMG_RGBA[shade];
  }

  private evalSpritesForScanline(): OAMEntry[] {
    const lcdc = this.io[IO_REGISTERS.LCDC - 0xff00];
    const isTallSprite = (lcdc & 0x04) !== 0;
    const ly = this.ly | 0;
    const sprites: OAMEntry[] = [];

    const spriteHeight = isTallSprite ? 16 : 8;

    // max 10 sprites per line, 40 total
    // prioritize in a scanline by OAM index (lower index) on ties
    // push in index order
    for (let i = 0; i < 40; i += 1) {
      const base = i * 4;
      const y = this.oam[base] - 16;
      const x = this.oam[base + 1] - 8;
      let tile = this.oam[base + 2];
      const attribute = this.oam[base + 3];

      // don't render on this scanline
      if (ly < y || ly >= y + spriteHeight) {
        continue;
      }

      // ignore lower bits for 8x16
      if (isTallSprite) {
        tile &= 0xfe;
      }

      sprites.push({ y, x, tile, attribute, index: i });

      if (sprites.length === 10) break;
    }

    return sprites;
  }

  private renderSpritesForScanline(): void {
    const lcdc = this.io[IO_REGISTERS.LCDC - 0xff00];
    const isObjEnabled = (lcdc & 0x02) !== 0;
    if (!isObjEnabled) return;

    const sprites = this.evalSpritesForScanline();
    if (sprites.length === 0) return;

    const isTallSprite = (lcdc & 0x04) !== 0;
    const spriteHeight = isTallSprite ? 16 : 8;

    const obp0 = this.io[IO_REGISTERS.OBP0 - 0xff00];
    const obp1 = this.io[IO_REGISTERS.OBP1 - 0xff00];

    const ly = this.ly | 0;
    const scanlineOffset = ly * SCREEN_WIDTH;

    const tileBaseAddress = 0x8000;

    // render sprites in reverse priority order
    // if two sprites overlap, sprite closer to the origin appears on top
    for (let s = sprites.length - 1; s >= 0; s -= 1) {
      const sprite = sprites[s];
      const attribute = sprite.attribute;

      // byte 3 attributes/flags
      const priorityBehindBg = (attribute & 0x80) !== 0;
      const yFlip = (attribute & 0x40) !== 0;
      const xFlip = (attribute & 0x20) !== 0;
      const useDMGPalette = (attribute & 0x10) !== 0;
      const obp = useDMGPalette ? obp1 : obp0;

      // read from row 0-7 or 0-15
      let lineInSprite = ly - sprite.y;
      if (yFlip) {
        lineInSprite = spriteHeight - 1 - lineInSprite;
      }

      // lower half uses tileIndex+1 for 8x16 sprites
      let tileIndex = sprite.tile;
      if (isTallSprite && lineInSprite >= 8) {
        tileIndex += 1;
      }

      const rowInTile = lineInSprite & 7; // wrap to 0-7

      const { low, high } = fetchTileRow(
        this.vram,
        tileBaseAddress,
        tileIndex,
        rowInTile,
      );

      // draw 8 pixel columns for this sprite row
      for (let x = 0; x < 8; x += 1) {
        const screenX = sprite.x + x;
        // dont render offscreen
        if (screenX < 0 || screenX >= SCREEN_WIDTH) {
          continue;
        }

        // palette bit depends on X flip, palette index = 0-3
        const bitIndex = xFlip ? x : 7 - x;
        const paletteIndex = getBGPixelIndex(low, high, bitIndex);
        if (paletteIndex === 0) {
          continue; // color 0 is transparent for sprites
        }

        // same as bg
        const color = this.mapOBPPalette(obp, paletteIndex);
        const bufIndex = scanlineOffset + screenX;

        // don't draw over non‑transparent background colors
        if (priorityBehindBg) {
          const bgIndex = this.bgIndexLine[screenX];
          if (bgIndex !== 0) {
            continue;
          }
        }

        this.framebuffer[bufIndex] = color;
      }
    }
  }

  private renderBackgroundLine(): void {
    // si BG está deshabilitado, rellenar scanline con color 0
    const lcdc = this.io[IO_REGISTERS.LCDC - 0xff00];
    const bgEnabled = (lcdc & 0x01) !== 0;
    if (!bgEnabled) {
      const bgPalette = this.io[IO_REGISTERS.BGP - 0xff00];
      const backgroundColor = this.mapDMGPalette(bgPalette, 0);
      const scanlineY = this.ly | 0;
      const scanlineOffset = scanlineY * SCREEN_WIDTH;
      for (let screenX = 0; screenX < SCREEN_WIDTH; screenX += 1) {
        this.framebuffer[scanlineOffset + screenX] = backgroundColor;
        this.bgIndexLine[screenX] = 0;
      }
      return;
    }

    // mapea coordenadas de pantalla al espacio de BG y lee direcciones de tiles, tile map de BG, paleta BGP
    const scrollX = this.io[IO_REGISTERS.SCX - 0xff00];
    const scrollY = this.io[IO_REGISTERS.SCY - 0xff00];

    const { base: tileDataBaseAddress, signedIndex } = readTileDataIndex(
      this.io,
    );
    const bgTileMapBaseAddress = bgTileMapBase(this.io);
    const bgPalette = this.io[IO_REGISTERS.BGP - 0xff00];

    // calcula qué fila de tiles de BG y qué fila interna del tile toca este LY
    const bgY = (this.ly + scrollY) & 0xff;
    const bgTileRowIndex = (bgY >> 3) & 31; // 32x32 tiles
    const tileRowOffset = bgY & 7;

    // recorre X en pantalla, agarra tile/píxel de BG y mapea a color
    const scanlineOffset = this.ly * SCREEN_WIDTH;
    for (let screenX = 0; screenX < SCREEN_WIDTH; screenX += 1) {
      // mapea screenX de pantalla actual al espacio de BG
      // selecciona columna de tile de BG e índice dentro del tile map
      const bgX = (screenX + scrollX) & 0xff;

      const bgTileColumnIndex = (bgX >> 3) & 31;
      const tileMapIndex = bgTileRowIndex * 32 + bgTileColumnIndex;
      const tileNumber =
        this.vram[bgTileMapBaseAddress - 0x8000 + tileMapIndex];

      // convierte número de tile en tile data index (address con/sin signo)
      let tileIndex: number;
      if (signedIndex) {
        const tileNumberSigned = (tileNumber << 24) >> 24;
        tileIndex = tileNumberSigned + 128;
      } else {
        tileIndex = tileNumber;
      }

      // obtiene los dos bytes de bitplanes para esta tile row
      const { low: lowTilePlaneByte, high: highTilePlaneByte } = fetchTileRow(
        this.vram,
        tileDataBaseAddress,
        tileIndex,
        tileRowOffset,
      );
      // elige qué bit dentro de la fila corresponde a este píxel, fusiona bitplane a 2-bit y mapea a color final
      const pixelBitIndex = 7 - (bgX & 7);

      const paletteIndex = getBGPixelIndex(
        lowTilePlaneByte,
        highTilePlaneByte,
        pixelBitIndex,
      );
      const pixelColor = this.mapDMGPalette(bgPalette, paletteIndex);

      this.framebuffer[scanlineOffset + screenX] = pixelColor;
      this.bgIndexLine[screenX] = paletteIndex;
    }
  }

  private renderWindowLine(): void {
    // same as renderBackground but drawn on top (uses same readTileDataIndex)
    const lcdc = this.io[IO_REGISTERS.LCDC - 0xff00];
    const windowEnabled = (lcdc & 0x20) !== 0;
    if (!windowEnabled) return;

    const wy = this.io[IO_REGISTERS.WY - 0xff00];
    const wx = this.io[IO_REGISTERS.WX - 0xff00];
    // LCDC bit 5
    const windowXStart = (wx - 7) | 0;

    // if current scanline LY is ABOVE the windows starting position WY (top to bottom) don't draw the window yet
    // window starts being visible on scanline ly === wy
    if (this.ly < wy) return;

    // same as BG
    const { base: tileDataBaseAddress, signedIndex } = readTileDataIndex(
      this.io,
    );
    const windowTileMapBaseAddress = windowTileMapBase(this.io);
    const bgPalette = this.io[IO_REGISTERS.BGP - 0xff00];

    // same as BG but use windowScanline instead of windowY (only count lines where the window is actually drawn)
    const windowRowInPixels = this.windowScanline & 0xff;
    const windowTileRowIndex = (windowRowInPixels >> 3) & 31;
    const windowTileRowOffset = windowRowInPixels & 7;

    // Same as BG but don't draw to negative framebuffer (skip off-screen pixels)
    const scanlineOffset = this.ly * SCREEN_WIDTH;
    for (
      let screenX = Math.max(0, windowXStart);
      screenX < SCREEN_WIDTH;
      screenX += 1
    ) {
      const windowX = (screenX - windowXStart) & 0xff;

      const windowTileColumnIndex = (windowX >> 3) & 31;
      const tileMapIndex = windowTileRowIndex * 32 + windowTileColumnIndex;
      const tileNumber =
        this.vram[windowTileMapBaseAddress - 0x8000 + tileMapIndex];

      let tileIndex: number;
      if (signedIndex) {
        const tileNumberSigned = (tileNumber << 24) >> 24;
        tileIndex = tileNumberSigned + 128;
      } else {
        tileIndex = tileNumber;
      }

      const { low: lowTilePlaneByte, high: highTilePlaneByte } = fetchTileRow(
        this.vram,
        tileDataBaseAddress,
        tileIndex,
        windowTileRowOffset,
      );

      const pixelBitIndex = 7 - (windowX & 7);
      const paletteIndex = getBGPixelIndex(
        lowTilePlaneByte,
        highTilePlaneByte,
        pixelBitIndex,
      );
      const pixelColor = this.mapDMGPalette(bgPalette, paletteIndex);

      this.framebuffer[scanlineOffset + screenX] = pixelColor;
    }
  }

  // @ts-expect-error unused
  private renderTestPattern(): void {
    // output to ABGR (0xAABBGGRR)
    const tweak = (this.vram[0] ^ this.oam[0]) & 3;
    for (let y = 0; y < SCREEN_HEIGHT; y++) {
      for (let x = 0; x < SCREEN_WIDTH; x++) {
        const band = (Math.floor(x / 20) + tweak) % 4;
        const bgp = this.io[IO_REGISTERS.BGP - 0xff00] || 0xe4;
        const color = this.mapDMGPalette(bgp, band as 0 | 1 | 2 | 3);
        this.framebuffer[y * SCREEN_WIDTH + x] = color;
      }
    }
  }
}
