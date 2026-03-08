import { IO_REGISTERS } from "../types/memory";
import {
  getTileRowColorBytes,
  getBGPixelIndex,
  getVRAMBaseAddress,
  TILE_BYTES,
} from "./ppu";

export function getTileViewerData(
  io: Uint8Array,
  vram: Uint8Array,
): { width: number; height: number; data: Uint8Array } {
  const tilesX = 16;
  const tilesY = 12;
  const width = tilesX * 8;
  const height = tilesY * 8;
  const data = new Uint8Array(width * height);

  const { tileDataAddress: tileBase } = getVRAMBaseAddress(io);
  const maxTileCount = ((0x9800 - tileBase) / TILE_BYTES) | 0;
  const totalTiles = Math.min(maxTileCount, tilesX * tilesY);

  for (let tileIndex = 0; tileIndex < totalTiles; tileIndex += 1) {
    const tileX = tileIndex % tilesX;
    const tileY = (tileIndex / tilesX) | 0;

    for (let row = 0; row < 8; row += 1) {
      const { low, high } = getTileRowColorBytes(
        vram,
        tileBase,
        tileIndex,
        row,
      );

      for (let col = 0; col < 8; col += 1) {
        const bitIndex = 7 - col;
        const colorIndex = getBGPixelIndex(low, high, bitIndex);
        const x = tileX * 8 + col;
        const y = tileY * 8 + row;
        data[y * width + x] = colorIndex;
      }
    }
  }

  return { width, height, data };
}

export function getSpriteTileViewerData(
  io: Uint8Array,
  vram: Uint8Array,
  oam: Uint8Array,
): {
  width: number;
  height: number;
  data: Uint8Array;
} {
  const tilesX = 8;
  const tilesY = 5;
  const width = tilesX * 8;
  const height = tilesY * 8;
  const data = new Uint8Array(width * height);

  const lcdc = io[IO_REGISTERS.LCDC - 0xff00];
  const isTallSprite = (lcdc & 0x04) !== 0;

  const uniqueTiles: number[] = [];

  for (let i = 0; i < 40; i += 1) {
    const base = i * 4;
    let tile = oam[base + 2];
    if (isTallSprite) {
      tile &= 0xfe;
    }

    if (!uniqueTiles.includes(tile)) {
      uniqueTiles.push(tile);
      if (uniqueTiles.length >= tilesX * tilesY) break;
    }
  }

  const tileBaseAddress = 0x8000;
  const totalTiles = uniqueTiles.length;

  for (let index = 0; index < totalTiles; index += 1) {
    const tileIndex = uniqueTiles[index] ?? 0;
    const tileX = index % tilesX;
    const tileY = (index / tilesX) | 0;

    for (let row = 0; row < 8; row += 1) {
      const { low, high } = getTileRowColorBytes(
        vram,
        tileBaseAddress,
        tileIndex,
        row,
      );

      for (let col = 0; col < 8; col += 1) {
        const bitIndex = 7 - col;
        const colorIndex = getBGPixelIndex(low, high, bitIndex);
        const x = tileX * 8 + col;
        const y = tileY * 8 + row;
        data[y * width + x] = colorIndex;
      }
    }
  }

  return { width, height, data };
}
