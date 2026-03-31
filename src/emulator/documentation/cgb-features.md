# CGB (Game Boy Color) Features

**Relevant sources:** `src/emulator/memory/addressBus.ts` · `src/emulator/ppu/ppu.ts` · `src/emulator/ppu/palettes.ts` · `src/emulator/core/cpu.ts` · `src/emulator/core/registers.ts` · `src/emulator/core/opcodes/opcodes.ts` · `src/emulator/cartridge/cartridge.ts`

This document consolidates all CGB-specific features that are otherwise scattered across the component docs. The Game Boy Color extends the original DMG hardware with double-speed CPU, additional RAM banks, a richer color palette system, VRAM DMA, and modified sprite priority rules.

---

## CGB mode detection

CGB mode is determined at ROM load time from the cartridge header byte at `0x0143`:

| Value | Meaning | `cgbMode` |
|---|---|---|
| `0x80` | CGB compatible (also runs on DMG) | `true` |
| `0xC0` | CGB only | `true` |
| Any other | DMG game | `false` |

`GBCEmulator.loadROM()` reads this flag, sets `cgbMode`, and propagates it to all subsystems via `reset()`. Once set, `cgbMode` does not change until a new ROM is loaded.

**Subsystems affected by CGB mode:**

| Subsystem | What changes |
|---|---|
| CPU / Registers | Different post-boot register values |
| AddressBus | WRAM banking, VRAM banking, palette RAM, HDMA, double-speed registers |
| PPU | Tile attributes from VRAM bank 1, CGB palettes, modified priority rules |
| Timer, APU, Joypad | Unaffected — always run at base clock speed |

---

## Post-boot register state

The CPU initializes registers differently depending on mode. Games can check register `A` to detect CGB hardware:

| Register | DMG | CGB |
|---|---|---|
| A | `0x01` | `0x11` |
| F | `0xB0` | `0x80` |
| B | `0x00` | `0x00` |
| C | `0x13` | `0x00` |
| D | `0x00` | `0xFF` |
| E | `0xD8` | `0x56` |
| H | `0x01` | `0x00` |
| L | `0x4D` | `0x0D` |
| PC | `0x0100` | `0x0100` |
| SP | `0xFFFE` | `0xFFFE` |

---

## Double-speed mode

CGB games can switch the CPU between two clock speeds:

| Mode | CPU clock | Peripherals |
|---|---|---|
| Normal | 4.194 MHz (base) | 4.194 MHz |
| Double | 8.388 MHz (2× base) | 4.194 MHz (unchanged) |

Peripherals (Timer, PPU, APU) always run at the base 4.19 MHz clock. Only the CPU speeds up.

### Switching mechanism

Speed switching is a two-step process:

```
1. Write KEY1 (0xFF4D) with bit 0 = 1     → arms the speed switch
2. Execute STOP instruction (0x10 0x00)     → performs the toggle
```

**KEY1 register (`0xFF4D`):**

```
Bit 7:   Current speed (read-only)    0 = normal, 1 = double
Bit 6–1: Unused
Bit 0:   Prepare speed switch (write)  1 = armed
```

**STOP opcode handler** checks for the armed flag before entering the normal STOP idle state:

```
STOP (0x10):
  read and discard padding byte (0x00)
  if CGB mode AND speed switch prepared:
    bus.performSpeedSwitch()     ← toggles cgbDoubleSpeed, clears armed flag
    return 4 cycles
  else:
    cpu.stop()                   ← normal STOP behaviour (idle until interrupt)
    return 4 cycles
```

### Cycle normalization

The cycle adjustment happens in a single place — `GBCEmulator.stepInstruction()`:

```
tCycles = cpu.step()                         ← T-cycles at current CPU speed
baseCycles = doubleSpeed ? tCycles / 2 : tCycles
timer.step(baseCycles)
ppu.step(baseCycles)
apu.step(baseCycles)
```

In double-speed mode, the CPU executes roughly twice as many instructions per frame while the PPU still takes the same 70,224 base cycles to render one frame. This lets CGB games do more computation without affecting display or audio timing.

---

## VRAM banking

The CGB has two 8 KB VRAM banks, compared to the DMG's single bank:

| Bank | Address range | Contents |
|---|---|---|
| Bank 0 | `0x8000–0x9FFF` | Tile data + tile maps (same as DMG) |
| Bank 1 | `0x8000–0x9FFF` | CGB tile attributes (at tile map addresses) + additional tile data |

### VBK register (`0xFF4F`)

```
Bit 7–1: Read as 1
Bit 0:   VRAM bank select (0 or 1)
```

Writes switch which bank the CPU reads/writes to in the `0x8000–0x9FFF` range. In DMG mode, the bank is always 0.

### VRAM bank 1 tile attributes

At tile map addresses (`0x9800–0x9BFF` / `0x9C00–0x9FFF`), VRAM bank 0 holds the tile index (same as DMG). Bank 1 at the same offset holds a CGB attributes byte:

```
Bit 7:   BG-to-OBJ priority   (1 = BG tile has priority over sprites)
Bit 6:   Y-flip
Bit 5:   X-flip
Bit 4:   Unused
Bit 3:   Tile VRAM bank        (0 = bank 0, 1 = bank 1 for tile data)
Bit 2–0: BG palette number     (0–7, indexes into CGB BG palette RAM)
```

The PPU reads these attributes during background and window rendering:

```
cgbAttributes = vramBank1[tileMapBaseAddress - 0x8000 + tileMapOffset]

cgbBgPaletteId    = cgbAttributes & 0x07       ← palette 0–7
cgbUseVramBank1   = (cgbAttributes & 0x08) ≠ 0 ← fetch tile from bank 1
cgbFlipX          = (cgbAttributes & 0x20) ≠ 0
cgbFlipY          = (cgbAttributes & 0x40) ≠ 0
cgbBgHasPriority  = (cgbAttributes & 0x80) ≠ 0
```

When `cgbUseVramBank1` is set, the tile pixel data is fetched from VRAM bank 1 instead of bank 0. X-flip inverts the bit index used to extract the pixel's color from the bitplane bytes. Y-flip inverts the row offset within the tile.

### PPU shared views

The PPU receives both VRAM banks as direct `Uint8Array` views from the bus at construction time, so it can read bank 1 attributes without going through `bus.read()`:

```
bus.getVRAMBank0View() → PPU vram (tile data + maps)
bus.getVRAMBank1View() → PPU vramBank1 (CGB attributes)
```

---

## WRAM banking

The CGB has 32 KB of work RAM (8 banks × 4 KB), compared to the DMG's 8 KB (2 × 4 KB):

| Address range | Bank | Switchable |
|---|---|---|
| `0xC000–0xCFFF` | Bank 0 | Fixed — always bank 0 |
| `0xD000–0xDFFF` | Bank 1–7 | Switched via SVBK |

### SVBK register (`0xFF70`)

```
Bit 7–3: Read as 1
Bit 2–0: WRAM bank number (1–7)
```

Writing `0` selects bank 1 (bank 0 is never mapped into the switchable region). In DMG mode, the register reads `0xFF` and writes are ignored — the switchable region is always bank 1.

---

## CGB palette system

The DMG uses three 8-bit palette registers (BGP, OBP0, OBP1) that each map 4 color indices to 4 shades of gray. The CGB replaces this with a much richer system: 8 BG palettes and 8 OBJ palettes, each holding 4 RGB555 colors.

### Palette RAM layout

| Set | Palettes | Colors | Bytes | Total |
|---|---|---|---|---|
| BG palettes | 8 (0–7) | 4 per palette | 2 per color (RGB555) | 64 bytes |
| OBJ palettes | 8 (0–7) | 4 per palette | 2 per color (RGB555) | 64 bytes |

Each color is stored as a 16-bit RGB555 value (little-endian):

```
Bit 14–10: Blue  (5 bits, 0–31)
Bit  9–5:  Green (5 bits, 0–31)
Bit  4–0:  Red   (5 bits, 0–31)
Bit 15:    Unused
```

Byte address within a palette set: `palette_number × 8 + color_index × 2`.

### Access registers

Palette RAM is not memory-mapped directly — it is accessed through index/data register pairs:

| Register | Address | Role |
|---|---|---|
| BCPS | `0xFF68` | BG palette index (bits 0–5) + auto-increment flag (bit 7) |
| BCPD | `0xFF69` | BG palette data port — reads/writes `bgPaletteRam[index]` |
| OCPS | `0xFF6A` | OBJ palette index (bits 0–5) + auto-increment flag (bit 7) |
| OCPD | `0xFF6B` | OBJ palette data port — reads/writes `objPaletteRam[index]` |

When the auto-increment flag is set, the index advances by 1 (mod 64) after every write to the data port. This allows games to stream palette data efficiently without repeatedly updating the index register.

### RGB555 → RGBA conversion

The PPU converts each RGB555 value to a 32-bit RGBA pixel (`0xFF_BB_GG_RR`, ABGR little-endian) using a pre-computed lookup table of 32,768 entries (`CGB_RGB555_TO_RGBA`), built at startup.

The conversion pipeline simulates the GBC LCD's color characteristics:

```
1. Normalize 5-bit channel → [0, 1]

2. Non-linear intensity curve
     curveValue = (1 - 0.1) × channel^1.2  +  0.1 × channel^0.35
     └─ gamma (1.2) makes darks darker
     └─ highlight lift (0.35) keeps the top end smooth

3. White level cap
     intensity = curveValue × (230 / 255)
     └─ GBC max brightness is not pure white

4. Channel blending matrix (simulates LCD cross-channel bleed)
     R' = 0.78R + 0.14G + 0.08B
     G' = 0.10R + 0.80G + 0.10B
     B' = 0.08R + 0.16G + 0.76B

5. Clamp to [0, 255] and pack as 0xFF_BB_GG_RR
```

This produces colors that approximate how games look on actual GBC hardware rather than using raw RGB values, which would appear over-saturated and too bright.

### DMG palette compatibility

In CGB mode, the DMG palette registers (BGP, OBP0, OBP1) still exist but are not used for rendering — the CGB palette system takes over. The PPU checks `cgbMode` and calls the appropriate palette mapping function:

| Mode | BG palette | OBJ palette |
|---|---|---|
| DMG | `mapDMGPalette(bgp, colorIndex)` → 4 gray shades | `mapOBPPalette(obp, colorIndex)` → 4 gray shades |
| CGB | `mapCGBBgPalette(ram, paletteNumber, colorIndex)` → RGB555 | `mapCGBObjPalette(ram, paletteNumber, colorIndex)` → RGB555 |

---

## VRAM DMA (HDMA)

CGB adds a DMA engine for high-speed bulk copies into VRAM, configured through five registers:

| Register | Address | Role |
|---|---|---|
| HDMA1 | `0xFF51` | Source address high byte |
| HDMA2 | `0xFF52` | Source address low byte (lower 4 bits ignored → 16-byte aligned) |
| HDMA3 | `0xFF53` | Destination high byte (forced to `0x80–0x9F` → VRAM only) |
| HDMA4 | `0xFF54` | Destination low byte (lower 4 bits ignored → 16-byte aligned) |
| HDMA5 | `0xFF55` | Length / mode / trigger |

### HDMA5 trigger byte

```
Bit 7:   Mode select
Bit 6–0: Block count minus 1    → length = (value & 0x7F + 1) × 16 bytes
```

| Bit 7 | Mode | Behaviour |
|---|---|---|
| `0` | General DMA (GDMA) | Copies the entire length immediately in one shot |
| `1` | H-Blank DMA (HDMA) | Copies one 16-byte block per H-Blank scanline |

### General DMA (GDMA)

When bit 7 = 0, the full transfer happens instantly when HDMA5 is written. All bytes are copied from the source address to VRAM in a single operation:

```
for each byte in transfer length:
  vramBanks[cpuVramBank][dest - 0x8000] = bus.read(source)
  source++, dest++
```

The source can be any readable memory (ROM, WRAM, etc.) since it goes through `bus.read()`.

### H-Blank DMA (HDMA)

When bit 7 = 1, the transfer is spread across scanlines. Each time the PPU enters H-Blank (mode 3 → mode 0), one 16-byte block is copied:

```
GBCEmulator.stepInstruction()
  └─ if ppu.hasEnteredHBlank()       ← one-shot flag, auto-clears on read
       └─ bus.stepHDMAHBlank()
            ├─ guard: return if not CGB, not active, or LCD disabled
            ├─ copy 16 bytes: source → vramBanks[cpuVramBank]
            ├─ advance source and dest by 16
            └─ decrement hdmaBlocksRemaining
               └─ if 0 → end HDMA
```

**Guards and edge cases:**

- **LCD disabled** during transfer → HDMA is aborted immediately
- **Cannot start while in H-Blank** → writing HDMA5 with bit 7 = 1 while the PPU is already in mode 0 is a no-op
- **Abort** → writing HDMA5 with bit 7 = 0 while an H-Blank DMA is active cancels the transfer

---

## BG-to-OBJ priority (CGB rules)

The CGB modifies how background/window pixels interact with sprite pixels. Three factors determine which layer appears on top:

1. **LCDC bit 0** — master BG/WIN priority enable
2. **OAM attribute bit 7** — per-sprite "draw behind BG" flag
3. **BG tile attribute bit 7** (VRAM bank 1) — per-tile "BG has priority" flag

### Priority resolution

```
For each sprite pixel at screenX:
  bgIndex = background color index at screenX (0–3)
  
  if bgIndex == 0:
    → draw sprite (BG color 0 is always transparent)
  
  if DMG mode:
    if OAM bit 7 set:
      → BG/WIN on top (sprite hidden behind non-transparent BG)
    else:
      → sprite on top
  
  if CGB mode:
    if LCDC bit 0 == 0:
      → sprite always on top (BG/WIN lose all priority)
    
    if LCDC bit 0 == 1:
      if OAM bit 7 set:
        → BG/WIN on top
      if BG tile attribute bit 7 set:
        → BG/WIN on top
      else:
        → sprite on top
```

Summary table:

| Mode | LCDC.0 | OAM bit 7 | BG attr bit 7 | Result |
|---|---|---|---|---|
| DMG | — | 0 | — | Sprite on top |
| DMG | — | 1 | — | BG/WIN on top if BG color ≠ 0 |
| CGB | 0 | — | — | Sprite always on top |
| CGB | 1 | 0 | 0 | Sprite on top |
| CGB | 1 | 1 | — | BG/WIN on top if BG color ≠ 0 |
| CGB | 1 | 0 | 1 | BG/WIN on top if BG color ≠ 0 |

The PPU tracks per-pixel BG priority via `bgPriorityLine[screenX]`, which is set to `1` during background/window rendering when the CGB tile attribute bit 7 is set and LCDC bit 0 is enabled.

---

## OAM sprite attributes (CGB additions)

The OAM attribute byte (byte 3 of each sprite entry) gains CGB-specific fields:

```
Bit 7:   Priority (same as DMG — sprite behind BG if set)
Bit 6:   Y-flip   (same as DMG)
Bit 5:   X-flip   (same as DMG)
Bit 4:   DMG palette select (OBP0/OBP1) — ignored in CGB mode
Bit 3:   CGB VRAM bank (0 = bank 0, 1 = bank 1 for tile data)
Bit 2–0: CGB OBJ palette number (0–7)
```

In CGB mode, sprite tile data can come from either VRAM bank (selected by bit 3), and the palette is one of 8 CGB OBJ palettes (bits 2–0) instead of the two DMG palettes.

---

## CGB register summary

All CGB-specific registers at a glance:

| Address | Name | R/W | Purpose | DMG behaviour |
|---|---|---|---|---|
| `0xFF4D` | KEY1 | R/W | Speed switch arm (bit 0) / current speed (bit 7) | Ignored |
| `0xFF4F` | VBK | R/W | VRAM bank select (bit 0) | Always bank 0 |
| `0xFF51` | HDMA1 | W | DMA source high byte | Ignored |
| `0xFF52` | HDMA2 | W | DMA source low byte | Ignored |
| `0xFF53` | HDMA3 | W | DMA dest high byte | Ignored |
| `0xFF54` | HDMA4 | W | DMA dest low byte | Ignored |
| `0xFF55` | HDMA5 | R/W | DMA length / mode / trigger | Ignored |
| `0xFF68` | BCPS | R/W | BG palette index + auto-increment | Ignored |
| `0xFF69` | BCPD | R/W | BG palette data port | Ignored |
| `0xFF6A` | OCPS | R/W | OBJ palette index + auto-increment | Ignored |
| `0xFF6B` | OCPD | R/W | OBJ palette data port | Ignored |
| `0xFF70` | SVBK | R/W | WRAM bank select (bits 0–2) | Reads `0xFF` |

---

## Cross-references

- **Double-speed cycle normalization:** [gbc-emulator.md](gbc-emulator.md) → `stepInstruction()`
- **VRAM/WRAM banking and I/O routing:** [address-bus.md](address-bus.md)
- **Palette usage in rendering:** [ppu.md](ppu.md) → rendering pipeline, BG-to-OBJ priority
- **CGB flag in ROM header:** [cartridge.md](cartridge.md) → `CartridgeHeader.cgbFlag`
- **Post-boot registers:** [cpu.md](cpu.md) → `reset(cgbMode)`
