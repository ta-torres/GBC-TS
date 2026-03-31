# AddressBus

**Source:** `src/emulator/memory/addressBus.ts`

The `AddressBus` is the single memory access point for the CPU. Every `read(address)` and `write(address, value)` from an opcode flows through here. It owns all RAM, routes I/O register accesses to the appropriate subsystem, and handles CGB-specific features (banking, HDMA, palette RAM, double-speed).

The PPU does **not** go through the bus at render time — it receives direct `Uint8Array` views of VRAM, OAM, IO registers, and palette RAM from the bus constructor. This avoids redundant dispatch overhead during scanline rendering.

---

## Memory map

| Range | Region | Handler |
|---|---|---|
| `0x0000–0x7FFF` | ROM banks 0 & N | `Cartridge.read/write` |
| `0x8000–0x9FFF` | VRAM (banked in CGB) | `vramBanks[cpuVramBank]` |
| `0xA000–0xBFFF` | External RAM (cartridge SRAM) | `Cartridge.read/write` |
| `0xC000–0xCFFF` | WRAM bank 0 | `wramBank0` |
| `0xD000–0xDFFF` | WRAM bank N (1–7 in CGB) | `wramBanks[currentWramBank - 1]` |
| `0xE000–0xFDFF` | Echo RAM | mirrors `0xC000–0xDDFF` |
| `0xFE00–0xFE9F` | OAM | `oam[]` |
| `0xFEA0–0xFEFF` | Unusable | reads `0xFF`, writes ignored |
| `0xFF00–0xFF7F` | I/O registers | see below |
| `0xFF80–0xFFFE` | HRAM | `hram[]` |
| `0xFFFF` | IE register | `Interrupts.getIE/setIE` |

All addresses are masked to 16 bits; all values to 8 bits before any action.

---

## I/O register routing

Most I/O registers fall through to `ioRegisters[]` (a 128-byte flat array). The following have special dispatch logic:

| Address(es) | Register | Handler |
|---|---|---|
| `0xFF00` | P1 (Joypad) | Synthesized on read from `Joypad`; only bits 4–5 stored on write |
| `0xFF04–0xFF07` | DIV / TIMA / TMA / TAC | Delegated to `Timer` |
| `0xFF0F` | IF | `Interrupts.setIF / getIF` |
| `0xFF10–0xFF26` | APU NR registers | `APU.readRegister / writeRegister` |
| `0xFF30–0xFF3F` | Wave RAM | `APU.readWaveRam / writeWaveRam` |
| `0xFF27–0xFF2F` | Unused APU space | reads `0xFF`, writes ignored |
| `0xFF46` | DMA | OAM DMA transfer (see below) |
| `0xFF4D` | KEY1 | CGB double-speed switch |
| `0xFF4F` | VBK | VRAM bank select |
| `0xFF51–0xFF55` | HDMA1–5 | CGB VRAM DMA (see below) |
| `0xFF68–0xFF6B` | BCPS/BCPD/OCPS/OCPD | CGB palette RAM (see below) |
| `0xFF70` | SVBK | WRAM bank select |
| `0xFFFF` | IE | `Interrupts.setIE / getIE` |

**P1 read synthesis:** bits 7–6 always read as `1`; bits 5–4 are the last-written selection bits; bits 3–0 come from `Joypad.readP1LowerNibble(selectBits)`. Active-low: `0` = pressed, `1` = not pressed.

---

## RAM banking

### WRAM (CGB)

- `0xC000–0xCFFF`: always bank 0 (`wramBank0`, fixed).
- `0xD000–0xDFFF`: switchable via SVBK (`0xFF70`). Valid banks are 1–7; writing `0` selects bank 1. DMG always uses bank 1 (no switching).

### VRAM (CGB)

- Two 8 KB banks (`vramBanks[0]` and `vramBanks[1]`).
- Bank selected by VBK (`0xFF4F`) bit 0. DMG is locked to bank 0.
- Bank 0: tile data and tile maps (both DMG and CGB).
- Bank 1: CGB tile attributes (palette ID, flip flags, priority, bank select) at the same tile map addresses.

---

## OAM DMA (`0xFF46`)

Writing a value `v` to `0xFF46` triggers an immediate copy of 160 bytes from `(v << 8)` to OAM (`0xFE00–0xFE9F`). The copy uses `read()` so it respects the full memory map (ROM, WRAM, etc. are all valid sources). The CPU should be blocked during this transfer on real hardware; this is not currently emulated.

---

## CGB VRAM DMA (HDMA)

Configured by writing HDMA1–4 then triggering with HDMA5.

**Source** (`HDMA1`:`HDMA2`): upper byte full, lower byte masked to `& 0xF0` (16-byte aligned).  
**Destination** (`HDMA3`:`HDMA4`): forced into `0x8000–0x9FF0` (VRAM), lower byte masked to `& 0xF0`.  
**HDMA5** trigger byte:

| Bit 7 | Mode |
|---|---|
| `0` | **General DMA** — copies the entire length immediately, in one shot |
| `1` | **H-Blank DMA** — copies one 16-byte block per HBlank, spread across scanlines |

Length = `(HDMA5 & 0x7F + 1) × 16` bytes.

**H-Blank DMA** is driven by `stepHDMAHBlank()`, called by `GBCEmulator.stepInstruction()` whenever `ppu.hasEnteredHBlank()` returns `true`. Each call transfers exactly one 16-byte block and decrements `hdmaBlocksRemaining`.

**Abort:** writing HDMA5 with bit 7 = `0` while an H-Blank DMA is active cancels the transfer.  
**Guard:** H-Blank DMA cannot be started while the PPU is already in HBlank mode 0 — writing HDMA5 in that state is a no-op.

---

## CGB palette RAM (BCPS/BCPD, OCPS/OCPD)

| Register | Address | Role |
|---|---|---|
| BCPS | `0xFF68` | BG palette index (bits 0–5) + auto-increment flag (bit 7) |
| BCPD | `0xFF69` | BG palette data port — reads/writes `bgPaletteRam[index]` |
| OCPS | `0xFF6A` | OBJ palette index + auto-increment flag |
| OCPD | `0xFF6B` | OBJ palette data port — reads/writes `objPaletteRam[index]` |

When the auto-increment flag is set, the index advances by 1 (mod 64) after every write to the data port. Each palette RAM is 64 bytes: 8 palettes × 4 colors × 2 bytes (RGB555, little-endian).

The PPU receives direct `Uint8Array` views of both palette RAMs and reads from them at render time — no bus round-trip required.

---

## CGB double-speed mode

Triggered by: writing `KEY1` (`0xFF4D`) with bit 0 = `1` (arms the switch), then executing a `STOP` instruction. The bus handles the switch in `performSpeedSwitch()`, toggling `cgbDoubleSpeed`.

`isDoubleSpeed()` is read by `GBCEmulator.stepInstruction()` to halve the base cycle count passed to PPU, Timer, and APU, since those peripherals always run at the base 4.19 MHz clock regardless of CPU speed.

---

## Shared views (bus → PPU)

The bus exposes several `Uint8Array` views so the PPU can read hardware state without going through `read()`:

| Method | Returns |
|---|---|
| `getVRAMBank0View()` | `vramBanks[0]` — tile data / maps |
| `getVRAMBank1View()` | `vramBanks[1]` — CGB tile attributes |
| `getOAMView()` | `oam` — sprite attribute table |
| `getIORegistersView()` | `ioRegisters` — LCD control and status registers |
| `getCGBBackgroundPaletteRAMView()` | `bgPaletteRam` |
| `getCGBObjectPaletteRAMView()` | `objPaletteRam` |

These are **live references** — mutations via `write()` are immediately visible to the PPU.

---

## Public API summary

| Method | Description |
|---|---|
| `read(address)` | Read one byte; routes to the appropriate subsystem |
| `write(address, value)` | Write one byte; routes with side effects |
| `readInstruction(address)` | Alias for `read()` used by the CPU for opcode fetch |
| `reset(cgbMode?)` | Zero all RAM, restore default banking state |
| `attachJoypad(joypad)` | Connect the `Joypad` instance (called once at startup) |
| `stepHDMAHBlank()` | Transfer one HDMA block; called each HBlank |
| `isCGBMode()` | Whether CGB mode is active |
| `isDoubleSpeed()` | Whether double-speed mode is active |
| `isSpeedSwitchPrepared()` | Whether KEY1 has been armed |
| `performSpeedSwitch()` | Toggle double-speed; called by the STOP opcode handler |
