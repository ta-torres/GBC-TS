# PPU (Pixel Processing Unit)

**Source:** `src/emulator/ppu/ppu.ts` · `src/emulator/ppu/palettes.ts` · `src/emulator/ppu/tileView.ts`

The PPU renders the Game Boy's 160×144 pixel display one scanline at a time. It is clocked by `GBCEmulator.stepInstruction()`, which calls `ppu.step(baseCycles)` after every CPU instruction.

---

## Scanline timing

Each of the 154 lines takes exactly 456 base cycles. Lines 0–143 are visible; lines 144–153 are VBlank.

```
┌─────────────────────────────────────────────────────┐  ← LY 0–143
│  Mode 2 – OAM scan    │  Mode 3 – Transfer  │ Mode 0 │
│       80 cycles        │     172 cycles      │  204 c │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐  ← LY 144–153
│                  Mode 1 – VBlank                    │
│              10 lines × 456 cycles = 4560           │
└─────────────────────────────────────────────────────┘
```

`step(baseCycles)` accumulates cycles in `cyclesInLine` and transitions modes by comparing against the thresholds above. When `cyclesInLine >= 456`, LY is incremented and the counter wraps.

**If the LCD is disabled** (LCDC bit 7 = 0), the PPU resets LY to 0, clears the cycle counter, and holds mode 0. No rendering occurs.

---

## `step()` flow

```
1. If LCD disabled → reset state, return
2. evaluateLycAndCheckSTAT()          ← update LYC=LY flag in STAT
3. cyclesInLine += baseCycles
4. Determine mode from cyclesInLine:
     < 80          → Mode 2 (OAM)
     < 252         → Mode 3 (Transfer)
     < 456         → Mode 0 (HBlank)
                     └─ on first entry (previousMode == Transfer):
                          renderBackgroundScanline()
                          renderWindowScanline()
                          renderSpritesForScanline()
                          enteredHBlank = true
5. If cyclesInLine >= 456:
     cyclesInLine -= 456
     LY++
     evaluateLycAndCheckSTAT()
     if windowDrawnThisScanline → windowScanline++
     if LY == 144:
       copy framebuffer → actualFramebufferDrawnToTheScreen
       frameReady = true
       request VBLANK interrupt
     if LY > 153:
       LY = 0, windowScanline = 0
       switch to Mode 2 (start new frame)
```

---

## Double buffering

The PPU maintains two `Uint32Array` buffers of 160 × 144 = 23,040 pixels:

- **`framebuffer`** — written to scanline by scanline during rendering.
- **`actualFramebufferDrawnToTheScreen`** — a stable snapshot copied from `framebuffer` at the start of VBlank (LY = 144).

`getFramebuffer()` always returns the stable snapshot, so the React layer never reads a partially-rendered frame.

**Pixel format:** `0xFF_BB_GG_RR` (ABGR, little-endian). Alpha is always `0xFF`. Index formula: `LY * 160 + screenX`.

---

## Rendering pipeline

Rendering fires once per scanline at the **Mode 3 → Mode 0 transition**, in this order:

### 1. Background (`renderBackgroundScanline`)

- In DMG mode with BG disabled (LCDC.0 = 0): fills the scanline with palette color 0 and skips tile fetching.
- Maps each screen pixel `(screenX, LY)` into BG space using scroll registers SCX / SCY:
  ```
  bgPixelX = (screenX + SCX) & 0xFF
  bgPixelY = (LY     + SCY) & 0xFF
  bgTileX  = bgPixelX >> 3          (tile column in 32×32 map)
  bgTileY  = bgPixelY >> 3          (tile row    in 32×32 map)
  ```
- Tile map address is `0x9800` or `0x9C00` (LCDC.3).
- Tile data base is `0x8000` (unsigned IDs) or `0x8800` (signed IDs, LCDC.4).
- Reads tile pixel from two bitplane bytes (see [Tile data encoding](#tile-data-encoding)).
- Writes the resolved RGBA color to `framebuffer` and records `bgIndexLine[screenX]` (raw 0–3 palette index) and `bgPriorityLine[screenX]` (CGB BG-to-OBJ priority flag) for use by the sprite renderer.

### 2. Window (`renderWindowScanline`)

Drawn on top of the background for pixels where `screenX >= WX - 7` and `LY >= WY`.

- Uses its own internal line counter `windowScanline` (incremented once per scanline where the window was actually drawn, not per LY). This is what makes the window's position relative to itself rather than to the screen.
- Tile map address is `0x9800` or `0x9C00` (LCDC.6).
- Otherwise identical to the background render, including writing to `bgIndexLine` / `bgPriorityLine`.

### 3. Sprites (`renderSpritesForScanline`)

Skipped entirely if LCDC.1 = 0.

**OAM evaluation:** scans all 40 OAM entries (4 bytes each: Y, X, tile, attributes) and collects up to **10** sprites whose Y range covers the current LY. Sprites are taken in OAM index order (lower index = higher priority on ties).

**Per-sprite attributes (byte 3):**

| Bits | Meaning |
|---|---|
| 7 | Priority: sprite drawn behind non-transparent BG/WIN pixels (DMG & CGB) |
| 6 | Y-flip |
| 5 | X-flip |
| 4 | DMG palette select (0 = OBP0, 1 = OBP1) |
| 3 | CGB VRAM bank (0 = bank 0, 1 = bank 1) |
| 2–0 | CGB OBJ palette number (0–7) |

**8×16 sprite mode** (LCDC.2): tile index bit 0 is masked off. The top half uses the given tile, the bottom half uses `tile + 1`.

**Draw order:** sprites are rendered in **reverse** OAM index order (highest index first), so lower-index sprites appear on top when they overlap.

**Palette index 0 is always transparent** — those pixels are skipped unconditionally.

---

## BG-to-OBJ priority rules

| Mode | LCDC.0 | OAM attr bit 7 | BG tile attr bit 7 | Result |
|---|---|---|---|---|
| DMG | — | 0 | — | Sprite on top |
| DMG | — | 1 | — | BG/WIN on top if BG color ≠ 0 |
| CGB | 0 | — | — | Sprite always on top |
| CGB | 1 | 0 | 0 | Sprite on top |
| CGB | 1 | 1 | — | BG/WIN on top if BG color ≠ 0 |
| CGB | 1 | 0 | 1 | BG/WIN on top if BG color ≠ 0 |

---

## Tile data encoding

Each tile is 16 bytes (2 bytes per row × 8 rows). Each row is stored as two bitplane bytes (`low`, `high`). Pixel color index for column `bit` (7 = leftmost):

```ts
const lowBit  = (low  >> bit) & 1;
const highBit = (high >> bit) & 1;
const paletteIndex = (highBit << 1) | lowBit;  // 0–3
```

In CGB mode, tile attributes from **VRAM bank 1** add: palette ID (bits 2–0), bank select (bit 3), X-flip (bit 5), Y-flip (bit 6), and BG priority (bit 7).

---

## STAT interrupts

`checkSTATInterrupts()` is called on every mode transition and on LYC evaluation. It fires an `LCD_STAT` interrupt when the corresponding STAT enable bit is set, but uses a per-condition latch (`statInterruptSet.m0/m1/m2/lyc`) to avoid firing repeatedly while the condition remains true.

| STAT bit | Condition |
|---|---|
| 6 | LYC = LY |
| 5 | Mode 2 (OAM) start |
| 4 | Mode 1 (VBlank) start |
| 3 | Mode 0 (HBlank) start |

---

## One-shot flags

Both flags auto-clear on read.

- **`hasFrameReady()`** — `true` once per VBlank (LY transitions to 144). The React canvas renderer uses this to know when to repaint.
- **`hasEnteredHBlank()`** — `true` on each Mode 3 → 0 transition. `GBCEmulator.stepInstruction()` uses this to trigger CGB H-Blank HDMA transfers.

---

## CGB-specific state

| Field | Description |
|---|---|
| `vramBank1` | Second 8 KB VRAM bank; holds BG/WIN tile attributes and alternate tile data |
| `cgbBgPaletteRam` | 64-byte RAM for 8 BG palettes × 4 colors (accessed via BCPS/BCPD) |
| `cgbObjPaletteRam` | 64-byte RAM for 8 OBJ palettes × 4 colors (accessed via OCPS/OCPD) |

See [palettes.md](./palettes.md) for the RGB555 → RGBA conversion details.

---

## Debug tile viewers (`tileView.ts`)

| Function | Output |
|---|---|
| `getTileViewerData(io, vram)` | 128×96 `Uint8Array` of raw palette indices (0–3); 16 tiles × 12 tiles from VRAM |
| `getSpriteTileViewerData(io, vram, oam)` | 64×40 `Uint8Array`; up to 40 unique sprite tiles from current OAM |

Both return `{ width, height, data }`. The data is palette indices, not RGBA — the debug UI handles colouring.

---

## Public API summary

| Method | Description |
|---|---|
| `step(baseCycles)` | Advance PPU by N base cycles |
| `reset(cgbMode?)` | Clear all state, restore post-boot defaults |
| `getFramebuffer()` | Returns stable `Uint32Array` (safe to read at any time) |
| `hasFrameReady()` | `true` once per completed frame (one-shot) |
| `hasEnteredHBlank()` | `true` once per HBlank entry (one-shot) |
| `lcdEnabled()` | Returns LCDC bit 7 |
| `getTileViewerData()` | BG tile debug data |
| `getSpriteTileViewerData()` | Sprite tile debug data |
