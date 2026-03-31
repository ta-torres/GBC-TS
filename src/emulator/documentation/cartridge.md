# Cartridge & MBC

**Source:** `src/emulator/cartridge/cartridge.ts` · `src/emulator/cartridge/mbc.ts` · `src/emulator/cartridge/mbc1.ts` · `src/emulator/cartridge/mbc3.ts` · `src/emulator/cartridge/mbc5.ts`  
**Types:** `src/emulator/types/cartridge.ts`

`Cartridge` is the top-level class that loads a ROM, parses its header, allocates external RAM, and instantiates the correct MBC chip. At runtime the `AddressBus` delegates all reads and writes in `0x0000–0x7FFF` and `0xA000–0xBFFF` to `Cartridge`, which in turn delegates to the active `MBC` (or handles the access itself for ROM-only carts).

---

## Load flow

```
Cartridge.load(ArrayBuffer)
  ├─ parseHeader()          — extract CartridgeHeader from ROM bytes 0x0100–0x014F
  ├─ validateHeaderChecksum() — warn on mismatch, but continue
  ├─ initializeRAM()        — allocate ram Uint8Array from header RAM size code
  └─ initializeMBC()        — select and construct MBC; return false for unsupported types
```

`load()` returns `false` (and sets `errorMessage`) if the cartridge type is unsupported. `getErrorMessage()` surfaces this to the UI.

---

## ROM header (`CartridgeHeader`)

Parsed from fixed offsets in the ROM:

| Field | Offset | Notes |
|---|---|---|
| `title` | `0x0134–0x0143` | Trimmed ASCII; shortened to `0x013E` if CGB flag is set (bit 7 of `0x0143`) |
| `cgbFlag` | `0x0143` | `0x80` = CGB compatible, `0xC0` = CGB only |
| `cartridgeType` | `0x0147` | Determines MBC chip (see `CARTRIDGE_TYPE` constants) |
| `romSize` | `0x0148` | Code; actual size = `32768 × 2^code` bytes |
| `ramSize` | `0x0149` | Code; mapped to byte count by `getRAMSize()` |
| `headerChecksum` | `0x014D` | Validated but not enforced |
| `globalChecksum` | `0x014E–0x014F` | Used as part of the localStorage save key |

---

## MBC selection

`initializeMBC()` switches on `cartridgeType` and constructs the appropriate class. Unsupported types return `false`.

| Cartridge type(s) | MBC |
|---|---|
| `ROM_ONLY`, `ROM_RAM`, `ROM_RAM_BATTERY` | None — `Cartridge` handles reads/writes directly |
| `MBC1`, `MBC1_RAM`, `MBC1_RAM_BATTERY` | `MBC1` |
| `MBC3*` | `MBC3` (constructed with `hasRTC = true` for timer variants) |
| `MBC5*` (including rumble variants) | `MBC5` (constructed with `hasRumble = true`) |

---

## MBC interface

All MBC chips implement:

```ts
interface MBC {
  read(address: number): number;
  write(address: number, value: number): void;
  getROMBank(): number;
  getRAMBank(): number;
  hasSRAMBeenWrittenTo(): boolean;
  clearSRAMWriteFlag(): void;
}
```

`Cartridge.read/write` delegate unconditionally to `mbc.read/write` when an MBC is present. For ROM-only carts, `Cartridge` handles reads from `0x0000–0x7FFF` directly and `ram` reads from `0xA000–0xBFFF`.

---

## MBC1

Supports ROMs up to 2 MB (128 banks × 16 KB) and RAM up to 32 KB (4 banks × 8 KB).

**Register writes:**

| Address range | Effect |
|---|---|
| `0x0000–0x1FFF` | RAM enable: lower nibble `0x0A` enables, anything else disables |
| `0x2000–0x3FFF` | ROM bank low 5 bits; writing `0` is treated as `1` |
| `0x4000–0x5FFF` | Upper 2 bits (used as RAM bank or upper ROM bank bits) |
| `0x6000–0x7FFF` | Banking mode: `0` = ROM mode, `1` = RAM mode |

**Banking mode affects two things:**

- **ROM bank 0 (`0x0000–0x3FFF`):** In mode 0 always maps to physical bank 0. In mode 1 the upper 2 bits shift bank 0 for ROMs > 32 banks (rarely used).
- **RAM banking:** In mode 0, only RAM bank 0 is accessible regardless of the upper 2-bit register. In mode 1 those bits select RAM bank 0–3.

**ROM bank number** is composed of `(upperBits << 5) | lowBits`, masked to the actual bank count. The combined lower 5 bits can never be `0` — bank `0x00`, `0x20`, `0x40`, `0x60` all resolve to the next bank up.

---

## MBC3

Supports ROMs up to 2 MB (128 banks × 16 KB), RAM up to 32 KB (4 banks × 8 KB), and an optional Real-Time Clock.

**Register writes:**

| Address range | Effect |
|---|---|
| `0x0000–0x1FFF` | RAM + RTC enable (lower nibble `0x0A`) |
| `0x2000–0x3FFF` | 7-bit ROM bank number; writing `0` becomes `1` |
| `0x4000–0x5FFF` | `0x00–0x03`: select RAM bank; `0x08–0x0C`: map RTC register to `0xA000–0xBFFF` |
| `0x6000–0x7FFF` | RTC latch: writing `0` then `1` snapshots the live RTC registers into latched copies |

**RTC registers** (mapped into `0xA000–0xBFFF` when selected):

| Value | Register | Bits |
|---|---|---|
| `0x08` | Seconds | 0–5 (0–59) |
| `0x09` | Minutes | 0–5 (0–59) |
| `0x0A` | Hours | 0–4 (0–23) |
| `0x0B` | Day counter low | 0–7 (bits 0–7 of day count) |
| `0x0C` | Day counter high + flags | bit 0 = day bit 8, bit 6 = halt, bit 7 = day overflow |

Reads return the **latched** copies; the live registers are only snapshotted when the latch sequence fires. Unused bits read as `1`. RTC registers are read/written through the same `0xA000–0xBFFF` window that normally serves RAM — the active selection (RAM bank 0–3 vs. RTC reg 0x08–0x0C) is tracked in `selectedRTCReg`.

---

## MBC5

Supports ROMs up to 8 MB (512 banks × 16 KB) and RAM up to 128 KB (16 banks × 8 KB). The largest ROM bank count of any supported MBC.

**Register writes:**

| Address range | Effect |
|---|---|
| `0x0000–0x1FFF` | RAM enable (lower nibble `0x0A`) |
| `0x2000–0x2FFF` | ROM bank low 8 bits |
| `0x3000–0x3FFF` | ROM bank bit 8 (only bit 0 used) |
| `0x4000–0x5FFF` | RAM bank (4-bit, 0–15); on rumble carts bit 3 controls the rumble motor |
| `0xA000–0xBFFF` | RAM read/write when enabled |

The 9-bit ROM bank allows bank 0 to be selected for `0x4000–0x7FFF` (unlike MBC1/MBC3). ROM bank 0 is always fixed at `0x0000–0x3FFF`.

---

## SRAM dirty flag

Each MBC maintains its own `sramWrite` boolean. It is set to `true` on any RAM write. `Cartridge` delegates `hasSRAMBeenWrittenTo()` and `clearSRAMWriteFlag()` to the active MBC (or handles the flag itself for ROM-only carts with RAM).

`useGBCEmulator` polls this flag every 2 seconds and persists SRAM to `localStorage` when set. See [address-bus.md](./address-bus.md) for the full save flow.

**Save key format:**
```
gbc-save:{title}:{cartridgeType hex}:{globalChecksum hex}
```
Only produced by `getSaveKey()` when `hasBatteryBackedRAM()` returns `true`.

**Battery-backed types:** `ROM_RAM_BATTERY`, `MBC1_RAM_BATTERY`, `MBC2_BATTERY`, `MBC3_TIMER_BATTERY`, `MBC3_TIMER_RAM_BATTERY`, `MBC3_RAM_BATTERY`, `MBC5_RAM_BATTERY`, `MBC5_RUMBLE_RAM_BATTERY`.

---

## SRAM snapshot API

| Method | Description |
|---|---|
| `getSRAMSnapshot()` | Returns a **copy** of `ram` as a new `Uint8Array`, or `null` if no RAM |
| `loadSRAMSnapshot(data)` | Copies `data` into `ram`, clamped to `min(ram.length, data.length)` |

The snapshot is base64-encoded for `localStorage` storage and decoded on restore.

---

## Public API summary

| Method | Description |
|---|---|
| `load(data)` | Parse ROM, init RAM and MBC; returns `false` on failure |
| `read(address)` | ROM / external RAM read; delegates to MBC if present |
| `write(address, value)` | ROM control / external RAM write; delegates to MBC if present |
| `isLoaded()` | `true` after a successful `load()` |
| `getHeader()` | Returns parsed `CartridgeHeader` or `null` |
| `getErrorMessage()` | Last error string from a failed `load()` |
| `hasBatteryBackedRAM()` | Whether the cartridge type includes a battery |
| `getSaveKey()` | localStorage key, or `null` if not battery-backed |
| `getSRAMSnapshot()` | Copy of current RAM contents |
| `loadSRAMSnapshot(data)` | Restore RAM from a snapshot |
| `hasSRAMBeenWrittenTo()` | Dirty flag; delegated to MBC |
| `clearSRAMWriteFlag()` | Clear dirty flag; delegated to MBC |
