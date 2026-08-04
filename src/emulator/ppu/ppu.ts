import { IO_REGISTERS } from "../types/memory";
import { Interrupts, InterruptType } from "../core/interrupts";
import type { PpuSnapshot } from "../types/emulator";
import {
  DMG_COLOR_PALETTES,
  mapCGBBgPalette,
  mapCGBObjPalette,
  mapDMGPalette,
  mapOBPPalette,
} from "./palettes";
import type { DmgColorPalette, DmgRgbaPalette } from "./palettes";

import { getSpriteTileViewerData, getTileViewerData } from "./tileView";

const PpuMode = {
  HBlank: 0,
  VBlank: 1,
  OAM: 2,
  Transfer: 3,
} as const;
type PpuMode = (typeof PpuMode)[keyof typeof PpuMode];

const SCREEN_WIDTH = 160;
const SCREEN_HEIGHT = 144;
const CYCLES_PER_LINE = 456;
const MODE2_OAM_SCAN_CYCLES = 80;
const MODE3_TRANSFER_CYCLES = 172;

// STAT interrupt flags
const STAT_MODE_BITS = 0x03;
const STAT_LYC_FLAG = 0x04;
const STAT_HBLANK_BIT_ENABLE = 0x08;
const STAT_VBLANK_BIT_ENABLE = 0x10;
const STAT_OAM_BIT_ENABLE = 0x20;
const STAT_LYC_BIT_ENABLE = 0x40;

export const TILE_BYTES = 16;

interface OAMEntry {
  y: number;
  x: number;
  tile: number;
  attribute: number;
  index: number;
}

export const getVRAMBaseAddress = (
  io: Uint8Array,
): { tileDataAddress: number; usesSignedTileIds: boolean } => {
  // https://gbdev.io/pandocs/Tile_Data.html#vram-tile-data
  // https://gbdev.io/pandocs/LCDC.html#ff40--lcdc-lcd-control
  const lcdc = io[IO_REGISTERS.LCDC - 0xff00];
  const dataSelect = (lcdc & 0x10) !== 0;
  return dataSelect
    ? { tileDataAddress: 0x8000, usesSignedTileIds: false }
    : { tileDataAddress: 0x8800, usesSignedTileIds: true };
};

export const getBgTileMapAddress = (io: Uint8Array): number => {
  const lcdc = io[IO_REGISTERS.LCDC - 0xff00];
  return (lcdc & 0x08) !== 0 ? 0x9c00 : 0x9800;
};

export const getWindowTileMapAddress = (io: Uint8Array): number => {
  const lcdc = io[IO_REGISTERS.LCDC - 0xff00];
  return (lcdc & 0x40) !== 0 ? 0x9c00 : 0x9800;
};

export const getTileRowColorBytes = (
  vram: Uint8Array,
  tileBase: number,
  tileIndex: number,
  row: number,
): { low: number; high: number } => {
  const tileRowAddress = tileBase + tileIndex * TILE_BYTES + row * 2;
  const lowPlaneByte = vram[tileRowAddress - 0x8000];
  const highPlaneByte = vram[tileRowAddress - 0x8000 + 1];
  return { low: lowPlaneByte, high: highPlaneByte };
};

export const getBGPixelIndex = (
  lowPlaneByte: number,
  highPlaneByte: number,
  bitInByte: number,
): 0 | 1 | 2 | 3 => {
  const lowBit = (lowPlaneByte >> bitInByte) & 1;
  const highBit = (highPlaneByte >> bitInByte) & 1;
  return ((highBit << 1) | lowBit) as 0 | 1 | 2 | 3;
};

export class PPU {
  private vram: Uint8Array;
  private vramBank1: Uint8Array; // gbc specific
  private oam: Uint8Array;
  private io: Uint8Array;
  private interrupts: Interrupts;
  private framebuffer: Uint32Array;
  private actualFramebufferDrawnToTheScreen: Uint32Array;
  private bgIndexLine: Uint8Array;
  private bgPriorityLine: Uint8Array;
  private mode: PpuMode;
  private currentScanlineLY: number;
  private cyclesInLine: number;
  private frameReady: boolean;
  private windowScanline: number;
  private windowDrawnThisScanline: boolean;
  private enteredHBlank: boolean;

  /* GBC SPECIFIC */
  private cgbMode: boolean;
  private cgbBgPaletteRam: Uint8Array;
  private cgbObjPaletteRam: Uint8Array;
  private dmgPalette: DmgRgbaPalette;

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
    vramBank0: Uint8Array,
    vramBank1: Uint8Array,
    oam: Uint8Array,
    io: Uint8Array,
    interrupts: Interrupts,
    cgbMode: boolean,
    cgbBgPaletteRam: Uint8Array,
    cgbObjPaletteRam: Uint8Array,
  ) {
    this.vram = vramBank0;
    this.vramBank1 = vramBank1;
    this.oam = oam;
    this.io = io;
    this.interrupts = interrupts;
    this.cgbMode = cgbMode;
    this.cgbBgPaletteRam = cgbBgPaletteRam;
    this.cgbObjPaletteRam = cgbObjPaletteRam;
    this.dmgPalette = DMG_COLOR_PALETTES.Gray;
    this.framebuffer = new Uint32Array(SCREEN_WIDTH * SCREEN_HEIGHT);
    this.actualFramebufferDrawnToTheScreen = new Uint32Array(
      SCREEN_WIDTH * SCREEN_HEIGHT,
    );
    this.bgIndexLine = new Uint8Array(SCREEN_WIDTH);
    this.bgPriorityLine = new Uint8Array(SCREEN_WIDTH);
    this.mode = PpuMode.OAM;
    this.currentScanlineLY = 0;
    this.cyclesInLine = 0;
    this.frameReady = false;
    this.windowScanline = 0;
    this.windowDrawnThisScanline = false;
    this.enteredHBlank = false;

    this.statInterruptSet = { m0: false, m1: false, m2: false, lyc: false };

    this.io[IO_REGISTERS.LY - 0xff00] = 0;
    this.io[IO_REGISTERS.LCDC - 0xff00] |= 0x80;
    this.setMode(PpuMode.OAM);
    // dont request interrupts on class init?
  }

  step(tCycles: number): void {
    if (!this.lcdEnabled()) {
      this.currentScanlineLY = 0;
      this.cyclesInLine = 0;
      this.frameReady = false;
      this.io[IO_REGISTERS.LY - 0xff00] = 0;
      this.windowScanline = 0;
      this.windowDrawnThisScanline = false;
      this.setMode(PpuMode.HBlank);
      return;
    }

    this.evaluateLycAndCheckSTAT();

    this.cyclesInLine += tCycles;

    const previousMode = this.mode;

    if (this.currentScanlineLY < 144) {
      if (this.cyclesInLine < MODE2_OAM_SCAN_CYCLES) {
        this.setMode(PpuMode.OAM);
      } else if (
        this.cyclesInLine <
        MODE2_OAM_SCAN_CYCLES + MODE3_TRANSFER_CYCLES
      ) {
        this.setMode(PpuMode.Transfer);
      } else if (this.cyclesInLine < CYCLES_PER_LINE) {
        this.setMode(PpuMode.HBlank);
        if (previousMode === PpuMode.Transfer) {
          this.enteredHBlank = true;
        }
        // scanline-based render at the start of hblank
        if (previousMode === PpuMode.Transfer && this.currentScanlineLY < 144) {
          this.renderBackgroundScanline();
          this.renderWindowScanline();
          this.renderSpritesForScanline();
        }
      }
    } else {
      this.setMode(PpuMode.VBlank);
    }

    if (this.cyclesInLine >= CYCLES_PER_LINE) {
      const previousLy = this.currentScanlineLY;

      this.cyclesInLine -= CYCLES_PER_LINE;

      // increment horizontal line counter and update ly register
      this.currentScanlineLY = (this.currentScanlineLY + 1) & 0xff;
      this.io[IO_REGISTERS.LY - 0xff00] = this.currentScanlineLY;

      this.evaluateLycAndCheckSTAT();

      // update windowScanline once for every visible line in vertical
      if (this.windowDrawnThisScanline && previousLy < 144) {
        this.windowScanline = (this.windowScanline + 1) & 0xff;
      }

      if (this.currentScanlineLY === 144) {
        this.setMode(PpuMode.VBlank);

        // this.renderTestPattern();

        this.actualFramebufferDrawnToTheScreen.set(this.framebuffer);
        this.frameReady = true;
        this.interrupts.requestInterrupt(InterruptType.VBLANK);
      } else if (this.currentScanlineLY > 153) {
        this.currentScanlineLY = 0;
        this.io[IO_REGISTERS.LY - 0xff00] = 0;

        this.evaluateLycAndCheckSTAT();

        // reset internal counter when reaching a new frame
        this.windowScanline = 0;
        this.windowDrawnThisScanline = false;

        this.setMode(PpuMode.OAM);
      }
    }
  }

  private renderBackgroundScanline(): void {
    const lcdc = this.io[IO_REGISTERS.LCDC - 0xff00];

    const cgbMasterPriorityEnabled = (lcdc & 0x01) !== 0;

    // DMG: si BG está deshabilitado, rellenar scanline con color 0
    const dmgBgEnabled = (lcdc & 0x01) !== 0;
    if (!this.cgbMode && !dmgBgEnabled) {
      const bgPalette = this.io[IO_REGISTERS.BGP - 0xff00];
      const backgroundColor = mapDMGPalette(bgPalette, 0, this.dmgPalette);
      const scanlineY = this.currentScanlineLY | 0;
      const scanlineOffset = scanlineY * SCREEN_WIDTH;
      for (let screenX = 0; screenX < SCREEN_WIDTH; screenX += 1) {
        this.framebuffer[scanlineOffset + screenX] = backgroundColor;
        this.bgIndexLine[screenX] = 0;
        this.bgPriorityLine[screenX] = 0;
      }
      return;
    }

    // mapea coordenadas de pantalla al espacio de BG y lee direcciones de tiles, tile map de BG, paleta BGP
    const bgScrollX = this.io[IO_REGISTERS.SCX - 0xff00];
    const bgScrollY = this.io[IO_REGISTERS.SCY - 0xff00];

    const { tileDataAddress, usesSignedTileIds } = getVRAMBaseAddress(this.io);
    const bgTileMapBaseAddress = getBgTileMapAddress(this.io);
    const bgPalette = this.io[IO_REGISTERS.BGP - 0xff00];

    // calcula qué fila de tiles de BG y qué fila interna del tile toca este LY
    const bgPixelY = (this.currentScanlineLY + bgScrollY) & 0xff;
    const bgTileY = (bgPixelY >> 3) & 31; // 32x32 tiles
    const rowInTileY = bgPixelY & 7;

    // recorre X en pantalla, agarra tile/píxel de BG y mapea a color
    const scanlineOffset = this.currentScanlineLY * SCREEN_WIDTH;
    for (let screenX = 0; screenX < SCREEN_WIDTH; screenX += 1) {
      // mapea screenX de pantalla actual al espacio de BG
      // selecciona columna de tile de BG e índice dentro del tile map
      const bgPixelX = (screenX + bgScrollX) & 0xff;

      const bgTileX = (bgPixelX >> 3) & 31;
      const tileMapOffset = bgTileY * 32 + bgTileX;
      const tileId = this.vram[bgTileMapBaseAddress - 0x8000 + tileMapOffset];

      // GBC SPECIFIC
      const cgbAttributes = this.cgbMode
        ? this.vramBank1[bgTileMapBaseAddress - 0x8000 + tileMapOffset]
        : 0x00;
      const cgbBgPaletteId = cgbAttributes & 0x07;
      const cgbUseVramBank1 = (cgbAttributes & 0x08) !== 0;
      const cgbFlipX = (cgbAttributes & 0x20) !== 0;
      const cgbFlipY = (cgbAttributes & 0x40) !== 0;
      // https://gbdev.io/pandocs/single.html#bg-to-obj-priority-in-cgb-mode
      const cgbBgHasPriority = (cgbAttributes & 0x80) !== 0;

      // convierte número de tile en tile data index (address con/sin signo)
      let tileDataIndex: number;
      if (usesSignedTileIds) {
        const signedTileId = (tileId << 24) >> 24;
        tileDataIndex = signedTileId + 128;
      } else {
        tileDataIndex = tileId;
      }

      // obtiene los dos bytes de bitplanes para esta tile row
      const tileRowInPattern =
        this.cgbMode && cgbFlipY ? 7 - rowInTileY : rowInTileY;

      // si está en cgbMode y tile bank 1 está habilitado, fetchea de vramBank1, sino de vram
      const { low: lowTilePlaneByte, high: highTilePlaneByte } =
        getTileRowColorBytes(
          this.cgbMode && cgbUseVramBank1 ? this.vramBank1 : this.vram,
          tileDataAddress,
          tileDataIndex,
          tileRowInPattern,
        );
      // elige qué bit dentro de la fila corresponde a este píxel, fusiona bitplane a 2-bit y mapea a color final
      const pixelBitIndex =
        this.cgbMode && cgbFlipX ? bgPixelX & 7 : 7 - (bgPixelX & 7);
      const paletteIndex = getBGPixelIndex(
        lowTilePlaneByte,
        highTilePlaneByte,
        pixelBitIndex,
      );
      const pixelColor = this.cgbMode
        ? mapCGBBgPalette(this.cgbBgPaletteRam, cgbBgPaletteId, paletteIndex)
        : mapDMGPalette(bgPalette, paletteIndex, this.dmgPalette);

      this.framebuffer[scanlineOffset + screenX] = pixelColor;
      this.bgIndexLine[screenX] = paletteIndex;
      this.bgPriorityLine[screenX] =
        this.cgbMode && cgbMasterPriorityEnabled && cgbBgHasPriority ? 1 : 0;
    }
  }

  private renderWindowScanline(): void {
    // same as renderBackground but drawn on top (uses same readTileDataIndex)
    this.windowDrawnThisScanline = false;
    const lcdc = this.io[IO_REGISTERS.LCDC - 0xff00];

    if (!this.cgbMode && (lcdc & 0x01) === 0) return;

    const windowEnabled = (lcdc & 0x20) !== 0;
    if (!windowEnabled) return;

    const windowY = this.io[IO_REGISTERS.WY - 0xff00];
    const windowX = this.io[IO_REGISTERS.WX - 0xff00];
    // LCDC bit 5
    const windowXStart = (windowX - 7) | 0;

    /* 
      if current scanline LY is ABOVE the windows starting position WY (top to bottom) don't draw the window yet
      window starts being visible on scanline ly === wy
      same check for x position 
    */
    if (this.currentScanlineLY < windowY) return;
    if (windowXStart >= SCREEN_WIDTH) return;
    this.windowDrawnThisScanline = true;

    // same as BG
    const { tileDataAddress, usesSignedTileIds } = getVRAMBaseAddress(this.io);
    const windowTileMapBaseAddress = getWindowTileMapAddress(this.io);
    const bgPalette = this.io[IO_REGISTERS.BGP - 0xff00];

    const cgbMasterPriorityEnabled = (lcdc & 0x01) !== 0;

    // same as BG but use windowScanline instead of windowY (only count lines where the window is actually drawn)
    const windowPixelY = this.windowScanline & 0xff;
    const windowTileY = (windowPixelY >> 3) & 31;
    const rowInTileY = windowPixelY & 7;

    // Same as BG but don't draw to negative framebuffer (skip off-screen pixels)
    const scanlineOffset = this.currentScanlineLY * SCREEN_WIDTH;
    for (
      let screenX = Math.max(0, windowXStart);
      screenX < SCREEN_WIDTH;
      screenX += 1
    ) {
      const windowPixelX = (screenX - windowXStart) & 0xff;

      const windowTileX = (windowPixelX >> 3) & 31;
      const tileMapOffset = windowTileY * 32 + windowTileX;
      const tileId =
        this.vram[windowTileMapBaseAddress - 0x8000 + tileMapOffset];

      // GBC SPECIFIC
      const cgbAttributes = this.cgbMode
        ? this.vramBank1[windowTileMapBaseAddress - 0x8000 + tileMapOffset]
        : 0x00;
      const cgbBgPaletteId = cgbAttributes & 0x07;
      const cgbUseVramBank1 = (cgbAttributes & 0x08) !== 0;
      const cgbFlipX = (cgbAttributes & 0x20) !== 0;
      const cgbFlipY = (cgbAttributes & 0x40) !== 0;
      const cgbBgHasPriority = (cgbAttributes & 0x80) !== 0;

      let tileDataIndex: number;
      if (usesSignedTileIds) {
        const signedTileId = (tileId << 24) >> 24;
        tileDataIndex = signedTileId + 128;
      } else {
        tileDataIndex = tileId;
      }

      const { low: lowTilePlaneByte, high: highTilePlaneByte } =
        getTileRowColorBytes(
          this.cgbMode && cgbUseVramBank1 ? this.vramBank1 : this.vram,
          tileDataAddress,
          tileDataIndex,
          this.cgbMode && cgbFlipY ? 7 - rowInTileY : rowInTileY,
        );

      const bitInTileRow =
        this.cgbMode && cgbFlipX ? windowPixelX & 7 : 7 - (windowPixelX & 7);
      const paletteIndex = getBGPixelIndex(
        lowTilePlaneByte,
        highTilePlaneByte,
        bitInTileRow,
      );
      const pixelColor = this.cgbMode
        ? mapCGBBgPalette(this.cgbBgPaletteRam, cgbBgPaletteId, paletteIndex)
        : mapDMGPalette(bgPalette, paletteIndex, this.dmgPalette);

      this.framebuffer[scanlineOffset + screenX] = pixelColor;
      this.bgIndexLine[screenX] = paletteIndex;
      this.bgPriorityLine[screenX] =
        this.cgbMode && cgbMasterPriorityEnabled && cgbBgHasPriority ? 1 : 0;
    }
  }

  private evalSpritesForScanline(): OAMEntry[] {
    const lcdc = this.io[IO_REGISTERS.LCDC - 0xff00];
    const isTallSprite = (lcdc & 0x04) !== 0;
    const currentScanlineLY = this.currentScanlineLY | 0;
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
      if (currentScanlineLY < y || currentScanlineLY >= y + spriteHeight) {
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

    const cgbMasterPriority = (lcdc & 0x01) !== 0;

    const sprites = this.evalSpritesForScanline();
    if (sprites.length === 0) return;

    const isTallSprite = (lcdc & 0x04) !== 0;
    const spriteHeight = isTallSprite ? 16 : 8;

    const obp0 = this.io[IO_REGISTERS.OBP0 - 0xff00];
    const obp1 = this.io[IO_REGISTERS.OBP1 - 0xff00];

    const currentScanlineLY = this.currentScanlineLY | 0;
    const scanlineOffset = currentScanlineLY * SCREEN_WIDTH;

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
      const cgbObjPaletteNumber = attribute & 0x07;
      const cgbVramBank1 = (attribute & 0x08) !== 0;
      const useDMGPalette = (attribute & 0x10) !== 0;
      const obp = useDMGPalette ? obp1 : obp0;

      // read from row 0-7 or 0-15
      let lineInSprite = currentScanlineLY - sprite.y;
      if (yFlip) {
        lineInSprite = spriteHeight - 1 - lineInSprite;
      }

      // lower half uses tileIndex+1 for 8x16 sprites
      let tileIndex = sprite.tile;
      if (isTallSprite && lineInSprite >= 8) {
        tileIndex += 1;
      }

      const rowInTile = lineInSprite & 7; // wrap to 0-7

      const { low: lowTilePlaneByte, high: highTilePlaneByte } =
        getTileRowColorBytes(
          this.cgbMode && cgbVramBank1 ? this.vramBank1 : this.vram,
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
        const paletteIndex = getBGPixelIndex(
          lowTilePlaneByte,
          highTilePlaneByte,
          bitIndex,
        );
        if (paletteIndex === 0) {
          continue; // color 0 is transparent for sprites
        }

        // same as bg
        const color = this.cgbMode
          ? mapCGBObjPalette(
              this.cgbObjPaletteRam,
              cgbObjPaletteNumber,
              paletteIndex,
            )
          : mapOBPPalette(obp, paletteIndex, this.dmgPalette);
        const bufIndex = scanlineOffset + screenX;

        // don't draw over non‑transparent background colors
        const bgIndex = this.bgIndexLine[screenX];
        if (bgIndex !== 0) {
          /* 
          que carajo
          https://gbdev.io/pandocs/single.html#bg-to-obj-priority-in-cgb-mode
          */

          if (!this.cgbMode) {
            if (priorityBehindBg) continue;
          } else {
            // CGB: si LCDC.0 es 0, BG/WIN pierden prioridad y el OBJ (sprite) siempre se dibuja por encima
            if (cgbMasterPriority) {
              // Si LCDC.0 es 1, el BG tiene prioridad si OAM bit7 es 1 o BG attr bit7 es 1
              if (priorityBehindBg) continue;

              // DMG: BG siempre tiene prioridad
              const bgHasPriority = this.bgPriorityLine[screenX] !== 0;
              if (bgHasPriority) continue;
            }
          }
        }

        this.framebuffer[bufIndex] = color;
      }
    }
  }

  getFramebuffer(): Uint32Array {
    return this.actualFramebufferDrawnToTheScreen;
  }

  hasFrameReady(): boolean {
    const ready = this.frameReady;
    this.frameReady = false;
    return ready;
  }

  hasEnteredHBlank(): boolean {
    const entered = this.enteredHBlank;
    this.enteredHBlank = false;
    return entered;
  }

  setCGBMode(enabled: boolean): void {
    this.cgbMode = enabled;
  }

  setDMGColorPalette(palette: DmgColorPalette): void {
    this.dmgPalette = DMG_COLOR_PALETTES[palette];
  }

  lcdEnabled(): boolean {
    return (this.io[IO_REGISTERS.LCDC - 0xff00] & 0x80) !== 0;
  }

  reset(cgbMode: boolean = this.cgbMode): void {
    this.setCGBMode(cgbMode);
    this.framebuffer.fill(0);
    this.actualFramebufferDrawnToTheScreen.fill(0);
    this.bgIndexLine.fill(0);
    this.mode = PpuMode.OAM;
    this.currentScanlineLY = 0;
    this.cyclesInLine = 0;
    this.frameReady = false;
    this.windowScanline = 0;
    this.windowDrawnThisScanline = false;
    this.enteredHBlank = false;
    this.statInterruptSet = { m0: false, m1: false, m2: false, lyc: false };

    this.io[IO_REGISTERS.LY - 0xff00] = 0;
    this.io[IO_REGISTERS.LCDC - 0xff00] |= 0x80;
    this.setMode(PpuMode.OAM);
  }

  takeSnapshot(): PpuSnapshot {
    return {
      mode: this.mode,
      currentScanlineLY: this.currentScanlineLY,
      cyclesInLine: this.cyclesInLine,
      windowScanline: this.windowScanline,
      windowDrawnThisScanline: this.windowDrawnThisScanline,
      enteredHBlank: this.enteredHBlank,
      frameReady: this.frameReady,
      statInterruptSet: { ...this.statInterruptSet },
    };
  }

  restoreSnapshot(s: PpuSnapshot): void {
    this.mode = s.mode as PpuMode;
    this.currentScanlineLY = s.currentScanlineLY;
    this.cyclesInLine = s.cyclesInLine;
    this.windowScanline = s.windowScanline;
    this.windowDrawnThisScanline = s.windowDrawnThisScanline;
    this.enteredHBlank = s.enteredHBlank;
    this.frameReady = s.frameReady;
    this.statInterruptSet = { ...s.statInterruptSet };

    // sync IO LY register with restored scanline
    this.io[IO_REGISTERS.LY - 0xff00] = this.currentScanlineLY;
    // sync STAT mode bits
    const statIdx = IO_REGISTERS.STAT - 0xff00;
    this.io[statIdx] = (this.io[statIdx] & 0xfc) | (this.mode & 0x03);
  }

  getTileViewerData(): { width: number; height: number; data: Uint8Array } {
    return getTileViewerData(this.io, this.vram);
  }

  getSpriteTileViewerData(): {
    width: number;
    height: number;
    data: Uint8Array;
  } {
    return getSpriteTileViewerData(this.io, this.vram, this.oam);
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
    const equal = this.currentScanlineLY === lyc;

    const newStat =
      (statBefore & (~STAT_LYC_FLAG & 0xff)) | (equal ? STAT_LYC_FLAG : 0);

    this.io[statIdx] = newStat;
    this.checkSTATInterrupts();
  }

  private checkSTATInterrupts(): void {
    const statIdx = IO_REGISTERS.STAT - 0xff00;
    const stat = this.io[statIdx];
    const mode = stat & STAT_MODE_BITS;
    const hblankInterruptEnabled = (stat & STAT_HBLANK_BIT_ENABLE) !== 0;
    const vblankInterruptEnabled = (stat & STAT_VBLANK_BIT_ENABLE) !== 0;
    const oamInterruptEnabled = (stat & STAT_OAM_BIT_ENABLE) !== 0;
    const lycInterruptEnabled = (stat & STAT_LYC_BIT_ENABLE) !== 0;

    if (!this.lcdEnabled()) {
      this.statInterruptSet.m0 = false;
      this.statInterruptSet.m1 = false;
      this.statInterruptSet.m2 = false;
      this.statInterruptSet.lyc = false;
      return;
    }

    // hblank
    if (hblankInterruptEnabled && mode === PpuMode.HBlank) {
      if (!this.statInterruptSet.m0) {
        this.interrupts.requestInterrupt(InterruptType.LCD_STAT);
        this.statInterruptSet.m0 = true;
      }
    } else {
      this.statInterruptSet.m0 = false;
    }

    // vblank
    if (vblankInterruptEnabled && mode === PpuMode.VBlank) {
      if (!this.statInterruptSet.m1) {
        this.interrupts.requestInterrupt(InterruptType.LCD_STAT);
        this.statInterruptSet.m1 = true;
      }
    } else {
      this.statInterruptSet.m1 = false;
    }

    // oam
    if (oamInterruptEnabled && mode === PpuMode.OAM) {
      if (!this.statInterruptSet.m2) {
        this.interrupts.requestInterrupt(InterruptType.LCD_STAT);
        this.statInterruptSet.m2 = true;
      }
    } else {
      this.statInterruptSet.m2 = false;
    }

    // LYC
    const lyc = this.io[IO_REGISTERS.LYC - 0xff00];
    const lyEqualsLYC = this.currentScanlineLY === lyc;
    if (lycInterruptEnabled && lyEqualsLYC) {
      if (!this.statInterruptSet.lyc) {
        this.interrupts.requestInterrupt(InterruptType.LCD_STAT);
        this.statInterruptSet.lyc = true;
      }
    } else {
      this.statInterruptSet.lyc = false;
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
        const color = mapDMGPalette(
          bgp,
          band as 0 | 1 | 2 | 3,
          this.dmgPalette,
        );
        this.framebuffer[y * SCREEN_WIDTH + x] = color;
      }
    }
  }
}
