# Architecture Overview

**Emulator core:** `src/emulator/`
**Frontend bridge:** `src/hooks/useGBCEmulator.ts` · `src/emulator/frontendAudio/audioOutput.ts`

GBC-TS is a Game Boy / Game Boy Color emulator with a clear two-layer architecture: a **framework-independent emulator core** (`src/emulator/`) and a **React frontend** that drives it via a single hook. The emulator core has zero browser or framework dependencies — it operates purely on typed arrays and method calls.

---

## System block diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│ React frontend                                                      │
│                                                                     │
│  useGBCEmulator hook                                                │
│    ├─ requestAnimationFrame loop ──→ stepFrameCycle()                │
│    ├─ keyboard / touch events ─────→ pressButton() / releaseButton()│
│    ├─ AudioOutput.pump() ──────────→ consumeAudioSamples()          │
│    └─ SRAM auto-save (2 s poll) ──→ getSRAMSnapshot() → localStorage│
│                                                                     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ public API
┌──────────────────────────────▼──────────────────────────────────────┐
│ GBCEmulator (orchestrator)          src/emulator/gbcEmulator.ts     │
│                                                                     │
│  ┌───────────┐   ┌───────────────┐   ┌────────────────────────┐    │
│  │ Cartridge │   │  AddressBus   │   │     Interrupts         │    │
│  │           │◄──┤ (memory hub)  ├──►│  (shared IF/IE state)  │    │
│  └───────────┘   └──┬──┬──┬──┬──┘   └──┬───┬────┬────┬───────┘    │
│                     │  │  │  │          │   │    │    │             │
│                     │  │  │  │          │   │    │    │             │
│              ┌──────┘  │  │  └───┐      │   │    │    │             │
│              ▼         ▼  ▼      ▼      ▼   ▼    ▼    ▼             │
│          ┌──────┐  ┌─────┐ ┌───┐  ┌──────┐                        │
│          │ Timer│  │ PPU │ │APU│  │Joypad│                        │
│          └──────┘  └─────┘ └───┘  └──────┘                        │
│              │         │      │       │                             │
│              │         │      │       │  all receive Interrupts     │
│              │         │      │       │  instance via constructor   │
│              ▼         ▼      ▼       ▼                             │
│          requestInterrupt() when their hardware condition fires     │
│                                                                     │
│  ┌──────┐                                                          │
│  │ CPU  │◄─── reads/writes go through AddressBus                   │
│  │      │──── step() returns T-cycles consumed                     │
│  └──────┘                                                          │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Component inventory

| Component | Source | Role | Docs |
|---|---|---|---|
| **GBCEmulator** | `gbcEmulator.ts` | Top-level orchestrator; owns all subsystems, exposes public API | — |
| **CPU** | `core/cpu.ts` | Sharp SM83 — fetches, decodes, executes opcodes; dispatches interrupts | [cpu.md](cpu.md) |
| **AddressBus** | `memory/addressBus.ts` | Memory-mapped I/O hub; routes every read/write to the correct subsystem | [address-bus.md](address-bus.md) |
| **PPU** | `ppu/ppu.ts` | Pixel Processing Unit — scanline renderer producing a 160×144 framebuffer | [ppu.md](ppu.md) |
| **APU** | `apu/apu.ts` | Audio Processing Unit — four sound channels, mixer, sample FIFO | [apu.md](apu.md) |
| **Timer** | `core/timer.ts` | DIV / TIMA counters; fires timer interrupt on overflow | [timer.md](timer.md) |
| **Interrupts** | `core/interrupts.ts` | Shared IF/IE register state; priority resolution for the CPU | [interrupts.md](interrupts.md) |
| **Cartridge** | `cartridge/cartridge.ts` | ROM loading, header parsing, MBC delegation, SRAM persistence | [cartridge.md](cartridge.md) |
| **Joypad** | `input/joypad.ts` | Button state and joypad interrupt | [joypad.md](joypad.md) |
| **AudioOutput** | `frontendAudio/audioOutput.ts` | Web Audio API bridge — ring buffer → ScriptProcessorNode | see [apu.md](apu.md) |

---

## Construction and wiring

`GBCEmulator` wires subsystems together in its constructor. The order matters — components are injected as constructor arguments to the subsystems that depend on them:

```
1.  Cartridge           (standalone — holds ROM data)
2.  Interrupts          (standalone — shared mutable state)
3.  Timer(interrupts)
4.  APU()
5.  AddressBus(cartridge, timer, interrupts, apu)
6.  Joypad(interrupts)
7.  bus.attachJoypad(joypad)           ← late-bind for P1 register reads
8.  CPU(bus, interrupts)
9.  PPU(vramBank0View, vramBank1View, oamView, ioView,
        interrupts, cgbMode, bgPaletteRamView, objPaletteRamView)
```

The PPU does **not** receive the bus or the CPU — it reads hardware state through direct `Uint8Array` views of VRAM, OAM, I/O registers, and CGB palette RAM. These views are live references: a CPU write to VRAM via the bus mutates the same underlying `ArrayBuffer` the PPU reads at render time. This avoids per-pixel bus dispatch during scanline rendering.

---

## ROM loading and CGB mode detection

```
User selects a .gb / .gbc file
        │
        ▼
GBCEmulator.loadROM(file)
  ├─ loadROMFile(file)             → ArrayBuffer
  ├─ cartridge.load(data)
  │    ├─ parseHeader()            → CartridgeHeader
  │    ├─ validateHeaderChecksum()
  │    ├─ initializeRAM()          → Uint8Array based on header RAM size code
  │    └─ initializeMBC()          → MBC1 / MBC3 / MBC5 / none
  │
  ├─ Read CGB flag from header:
  │    cgbFlag 0x80 → CGB compatible
  │    cgbFlag 0xC0 → CGB only
  │    otherwise    → DMG mode
  │
  └─ reset()                       → propagates cgbMode to all subsystems
```

CGB mode affects nearly every subsystem:
- **CPU**: different post-boot register values (`A = 0x11` vs `A = 0x01`)
- **AddressBus**: enables WRAM banking (8 banks), VRAM banking (2 banks), palette RAM, HDMA, double-speed registers
- **PPU**: CGB tile attributes from VRAM bank 1, CGB palette RAM, CGB priority rules
- **Timer/APU/Joypad**: unaffected — they always run at base clock speed

---

## Main execution loop

### Per-frame: `stepFrameCycle()`

Called once per `requestAnimationFrame` tick by the React hook. Runs enough CPU instructions to consume one frame's worth of cycles:

```
CYCLES_PER_FRAME = 70224   (154 scanlines × 456 cycles/line)
targetCycles = CYCLES_PER_FRAME × speedMultiplier

while remainingCycles > 0:
    stepInstruction()
    remainingCycles -= cyclesConsumed
```

The speed multiplier (default 1.0, range 0.25–4.0) scales how many cycles are executed per RAF tick, effectively speeding up or slowing down emulation.

### Per-instruction: `stepInstruction()`

This is the heart of the emulation loop. Every CPU instruction triggers a synchronized update of all peripheral subsystems:

```
┌─────────────────────────────────────────────────────┐
│ cpu.step()                                           │
│   → fetch opcode → decode → execute → return T-cycles│
└──────────────────────┬──────────────────────────────┘
                       │ tCycles
                       ▼
            ┌─────────────────────┐
            │ Double-speed adjust │
            │ baseCycles =        │
            │   doubleSpeed ?     │
            │   tCycles / 2 :     │
            │   tCycles           │
            └──────────┬──────────┘
                       │ baseCycles
          ┌────────────┼────────────┐
          ▼            ▼            ▼
    timer.step()  ppu.step()   apu.step()
          │            │            │
          │            ▼            │
          │  if ppu.hasEnteredHBlank()
          │     └─→ bus.stepHDMAHBlank()
          │                         │
          └────────────┬────────────┘
                       ▼
              ticks += baseCycles
```

**Every subsystem receives base cycles.** Even in CGB double-speed mode (where the CPU runs at 8.38 MHz), peripherals still operate at 4.19 MHz. The orchestrator halves the CPU's T-cycle count before passing it to Timer, PPU, and APU.

---

## Cycle accounting

The Game Boy clock hierarchy:

```
Base clock:           4,194,304 Hz  (4.19 MHz)
CGB double-speed:     8,388,608 Hz  (8.38 MHz, CPU only)

1 machine cycle     = 4 T-cycles    (at base speed)
1 scanline          = 456 base cycles
1 frame             = 154 scanlines = 70,224 base cycles
Frame rate          = 4,194,304 / 70,224 ≈ 59.7 FPS
```

| Term | Meaning | Where used |
|---|---|---|
| **T-cycles** | CPU clock ticks; what `cpu.step()` returns | CPU only |
| **Base cycles** | T-cycles normalized to 4.19 MHz (= T-cycles / 2 in double-speed) | Timer, PPU, APU, tick counter |
| **Machine cycles** | 4 T-cycles; some docs use this unit | Not used internally |

The codebase consistently uses **base cycles** as the universal time unit for all peripheral stepping.

---

## Memory architecture

All CPU memory access flows through the AddressBus. The bus dispatches reads and writes based on address ranges:

```
0x0000 ┌───────────────────┐
       │ ROM bank 0        │ → Cartridge
0x4000 ├───────────────────┤
       │ ROM bank N        │ → Cartridge (MBC-switched)
0x8000 ├───────────────────┤
       │ VRAM              │ → vramBanks[cpuVramBank]  (2 banks in CGB)
0xA000 ├───────────────────┤
       │ External RAM      │ → Cartridge (MBC-switched SRAM)
0xC000 ├───────────────────┤
       │ WRAM bank 0       │ → wramBank0 (fixed)
0xD000 ├───────────────────┤
       │ WRAM bank N       │ → wramBanks[N-1]  (banks 1–7 in CGB)
0xE000 ├───────────────────┤
       │ Echo RAM          │ → mirrors 0xC000–0xDDFF
0xFE00 ├───────────────────┤
       │ OAM               │ → oam[]  (sprite attributes)
0xFEA0 ├───────────────────┤
       │ Unusable          │ → 0xFF on read, writes ignored
0xFF00 ├───────────────────┤
       │ I/O registers     │ → special dispatch (see address-bus.md)
0xFF80 ├───────────────────┤
       │ HRAM              │ → hram[]  (fast zero-page RAM)
0xFFFF ├───────────────────┤
       │ IE register       │ → Interrupts.setIE / getIE
       └───────────────────┘
```

I/O registers (`0xFF00–0xFF7F`) are the most complex region — individual addresses are routed to Timer, APU, Joypad, Interrupts, and CGB-specific hardware. See [address-bus.md](address-bus.md) for the full dispatch table.

### PPU shared views (zero-copy rendering)

Instead of calling `bus.read()` per pixel, the PPU holds direct `Uint8Array` references into the bus's internal memory:

```
AddressBus                          PPU
  vramBanks[0]  ─── same buffer ───→  vramBank0 (tiles + maps)
  vramBanks[1]  ─── same buffer ───→  vramBank1 (CGB attributes)
  oam           ─── same buffer ───→  oam (sprite table)
  ioRegisters   ─── same buffer ───→  io (LCDC, STAT, SCX, SCY, etc.)
  bgPaletteRam  ─── same buffer ───→  cgbBgPaletteRam
  objPaletteRam ─── same buffer ───→  cgbObjPaletteRam
```

CPU writes to VRAM via `bus.write(0x8000, ...)` mutate the same `ArrayBuffer` the PPU reads during `renderBackgroundScanline()`. No copy, no dispatch overhead.

---

## Interrupt system

Five interrupt types are multiplexed through a shared `Interrupts` instance. Every subsystem that can fire an interrupt (PPU, Timer, Joypad) receives this same instance at construction time:

```
PPU ──── requestInterrupt(VBLANK)  ─┐
PPU ──── requestInterrupt(LCD_STAT) ─┤
Timer ── requestInterrupt(TIMER)  ──┤──→ Interrupts (IF register)
Joypad ─ requestInterrupt(JOYPAD) ──┤         │
Serial ─ (not implemented)  ────────┘         │
                                              ▼
                                    CPU.step() checks:
                                      IME=1 && (IE & IF) ≠ 0
                                        → dispatch highest priority
                                        → 20 T-cycles, push PC, jump to vector
```

Interrupts can also wake the CPU from HALT/STOP states even when IME is disabled — the CPU resumes execution without dispatching the interrupt handler (unless IME is on).

See [interrupts.md](interrupts.md) for register layout, dispatch timing, and the HALT bug.

---

## Rendering pipeline

The PPU produces frames through a scanline-by-scanline state machine:

```
Frame (70224 base cycles, ≈16.74 ms)
│
├── Lines 0–143: visible scanlines (each 456 cycles)
│     │
│     ├── Mode 2: OAM scan (80 cycles)
│     │     └─ evaluate which sprites overlap this scanline
│     │
│     ├── Mode 3: Pixel transfer (172 cycles)
│     │     └─ (data fetching modeled here in timing only)
│     │
│     └── Mode 0: HBlank (204 cycles)
│           ├─ renderBackgroundScanline()
│           ├─ renderWindowScanline()
│           ├─ renderSpritesForScanline()
│           └─ signal hasEnteredHBlank → HDMA transfer (CGB)
│
├── Line 144: VBlank begins
│     ├─ copy framebuffer → stable snapshot (double buffer swap)
│     ├─ set frameReady flag
│     └─ request VBlank interrupt
│
└── Lines 144–153: VBlank (10 lines × 456 = 4560 cycles)
      └─ CPU continues executing; no rendering
```

The React layer polls `hasFrameReady()` each RAF tick. When true, it reads the stable framebuffer via `getFramebuffer()` and paints it to a `<canvas>`.

**Pixel format:** `Uint32Array` of 23,040 elements, each `0xFF_BB_GG_RR` (ABGR little-endian). See [ppu.md](ppu.md) for rendering details.

---

## Audio pipeline

Audio flows from the emulator core to the browser speakers through three stages:

```
                Emulator core                    │        Browser
                                                 │
  apu.step(baseCycles)                           │
    ├─ advance channel timers (CH1–CH4)          │
    ├─ frame sequencer clocks                    │
    │   length / envelope / sweep                │
    ├─ phase accumulator → emit sample?          │
    │   └─ mixer: pan + master volume            │
    └─ push [L, R] into sampleFifo              │
                                                 │
                       ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┤
                                                 │
  AudioOutput.pump()      ← called each RAF tick │
    ├─ calculate needed frames                   │
    │   (target: ~60 ms buffered)                │
    ├─ apu.consumeSamples(frameCount)            │
    │   └─ drain from sampleFifo                 │
    └─ push into StereoRingBuffer                │
                     │                           │
                     ▼                           │
         ScriptProcessorNode.onaudioprocess      │
           └─ pop frames from ring buffer        │
              → output to AudioContext            │
              → speakers                         │
```

The APU generates samples at the native sample rate (typically 48 kHz). The phase accumulator inside `apu.step()` decides when to emit a sample based on cycle count, keeping the sample rate independent of emulation speed.

See [apu.md](apu.md) for channel details, frame sequencer timing, and mixer logic.

---

## Save data persistence

Save data flows through three layers:

```
MBC (SRAM write)
  └─ sets sramWrite dirty flag

useGBCEmulator (2-second poll)
  ├─ emulator.hasSRAMBeenWrittenTo()?
  ├─ yes → emulator.getSRAMSnapshot()    → Uint8Array copy
  │        btoa(binaryToString(snapshot)) → base64 string
  │        localStorage.setItem(saveKey, base64)
  └─ emulator.clearSRAMWriteFlag()

On ROM load:
  ├─ localStorage.getItem(saveKey)
  ├─ atob(base64) → Uint8Array
  └─ emulator.loadSRAMSnapshot(data)
```

**Save key format:** `gbc-save:{title}:{cartridgeType}:{globalChecksum}` — each unique game gets its own localStorage slot. Only battery-backed cartridge types produce a save key.

**Export/import** (`savesTransfer.ts`): bundles all `gbc-save:*` keys into a JSON file for backup/transfer between browsers.

See [cartridge.md](cartridge.md) for MBC details and battery-backed types.

---

## CGB double-speed mode

CGB games can switch the CPU between normal speed (4.19 MHz) and double speed (8.38 MHz):

```
Game writes KEY1 bit 0 = 1   (arm speed switch)
Game executes STOP instruction
  └─ bus.performSpeedSwitch()
       └─ toggle cgbDoubleSpeed flag

stepInstruction() adjusts:
  tCycles from cpu.step()
    │
    ├─ normal:  baseCycles = tCycles
    └─ double:  baseCycles = tCycles / 2
                  │
                  └─ Timer, PPU, APU still receive base cycles
                     (they always tick at 4.19 MHz)
```

This means the CPU effectively executes twice as many instructions per frame in double-speed mode, while all peripherals maintain their original timing. The cycle halving happens in a single place: `GBCEmulator.stepInstruction()`.

---

## Frontend integration

The emulator core is completely framework-agnostic. All browser interaction is concentrated in two files:

### `useGBCEmulator` hook

The React hook that drives everything:

| Responsibility | Mechanism |
|---|---|
| **Emulation loop** | `requestAnimationFrame` calling `stepFrameCycle()` at ~59.7 FPS; allows up to 3 catch-up frames per RAF to handle tab-switch delays |
| **Audio** | Creates `AudioOutput`, calls `audio.pump()` each RAF tick to fill the ring buffer |
| **Input** | Maps `keydown`/`keyup` events to `pressButton()`/`releaseButton()` |
| **Save persistence** | 2-second `setInterval` checking the SRAM dirty flag; base64-encodes snapshots to `localStorage` |
| **ROM loading** | Calls `emulator.loadROM()`, then restores any saved SRAM from `localStorage` |
| **Speed control** | Keyboard shortcuts (Q/W or +/−) adjust the speed multiplier |

### `AudioOutput`

Bridges the APU's sample FIFO to the Web Audio API:

| Component | Role |
|---|---|
| `StereoRingBuffer` | Fixed-size circular buffer (~120 ms capacity) holding interleaved stereo frames |
| `ScriptProcessorNode` | 1024-frame blocks; pulls from ring buffer in `onaudioprocess` callback |
| `pump()` | Each RAF tick: calculates how many frames to pull from APU to maintain ~60 ms target fill |

---

## Data flow summary

Putting it all together — one emulation frame from start to finish:

```
1. RAF fires
     │
2.   └─→ stepFrameCycle()
           │
3.         └─→ [loop: ~4000 instructions per frame]
                 │
4.               ├─ cpu.step()
                 │    └─ bus.read(PC) → opcode → execute → bus.read/write
                 │    └─ returns T-cycles
                 │
5.               ├─ baseCycles = adjust for double-speed
                 │
6.               ├─ timer.step(baseCycles)
                 │    └─ may request Timer interrupt
                 │
7.               ├─ ppu.step(baseCycles)
                 │    ├─ may render scanline (on HBlank entry)
                 │    ├─ may request VBlank / STAT interrupt
                 │    └─ may set frameReady flag (on line 144)
                 │
8.               ├─ apu.step(baseCycles)
                 │    └─ may push stereo samples into FIFO
                 │
9.               └─ if ppu.hasEnteredHBlank()
                      └─ bus.stepHDMAHBlank()  (CGB VRAM DMA)
                 │
10.  audio.pump()
       └─ pull samples from APU FIFO → ring buffer
            │
11.          └─ ScriptProcessor drains ring buffer → speakers

12.  if hasFrameReady() → paint framebuffer to <canvas>

13.  [every 2 s] if SRAM dirty → save snapshot to localStorage
```

---

## Testing architecture

Tests live in `src/emulator/tests/` and use Vitest with globals enabled (`describe`, `it`, `expect` available without imports).

Each test file constructs a minimal emulator stack manually, mirroring the same wiring order as `GBCEmulator`:

```ts
const rom = makeROM([0x00, 0x00]);  // program bytes placed at 0x0100
const cart = new Cartridge(); cart.load(rom.buffer);
const interrupts = new Interrupts();
const timer = new Timer(interrupts);
const apu = new APU();
const bus = new AddressBus(cart, timer, interrupts, apu);
const cpu = new CPU(bus, interrupts);
```

`makeROM()` creates a minimal valid ROM with a correct header checksum. This lets tests focus on individual subsystems (CPU instructions, ALU operations, timer behaviour) without needing the full emulator orchestrator.

---

## Directory structure

```
src/emulator/
├── gbcEmulator.ts           ← orchestrator
├── core/
│   ├── cpu.ts               ← Sharp SM83 CPU
│   ├── registers.ts         ← 8-bit register file
│   ├── interrupts.ts        ← shared IF/IE state
│   ├── timer.ts             ← DIV + TIMA counters
│   └── opcodes/
│       ├── opcodes.ts       ← standard 256-opcode table
│       ├── opcodesCB.ts     ← CB-prefixed 256-opcode table
│       ├── alu.ts           ← arithmetic/logic helpers
│       └── instructions.ts  ← opcode metadata
├── memory/
│   └── addressBus.ts        ← memory-mapped I/O hub
├── ppu/
│   ├── ppu.ts               ← scanline renderer
│   ├── palettes.ts          ← DMG + CGB palette conversion
│   └── tileView.ts          ← debug tile viewers
├── apu/
│   ├── apu.ts               ← audio processing unit
│   ├── apuRegisters.ts      ← NR register definitions
│   ├── frameSequencer.ts    ← 512 Hz tick distributor
│   ├── mixer.ts             ← stereo panning + volume
│   ├── types.ts             ← APUSettings
│   └── channels/
│       ├── channel1Pulse.ts
│       ├── channel2Pulse.ts
│       ├── channel3Wave.ts
│       ├── channel4Noise.ts
│       └── components/
│           ├── lengthCounter.ts
│           ├── volumeEnvelope.ts
│           ├── sweepUnit.ts
│           └── noiseLfsr.ts
├── cartridge/
│   ├── cartridge.ts         ← ROM loading, MBC delegation
│   ├── mbc.ts               ← MBC interface
│   ├── mbc1.ts
│   ├── mbc3.ts
│   └── mbc5.ts
├── input/
│   └── joypad.ts            ← button state + interrupt
├── frontendAudio/
│   └── audioOutput.ts       ← Web Audio API bridge
├── types/
│   ├── cartridge.ts         ← CartridgeHeader, cartridge type constants
│   ├── emulator.ts
│   ├── hardware.ts
│   ├── instructions.ts      ← opcode type definitions
│   └── memory.ts            ← MEMORY_MAP, IO_REGISTERS constants
├── utils/
│   ├── bitwise.ts           ← toHex8, toHex16
│   ├── fileLoader.ts        ← File → ArrayBuffer
│   └── savesTransfer.ts     ← export/import saves JSON
├── tests/
│   └── *.test.ts
└── documentation/
    ├── architecture.md      ← you are here
    ├── address-bus.md
    ├── apu.md
    ├── cartridge.md
    ├── cpu.md
    ├── interrupts.md
    ├── joypad.md
    ├── ppu.md
    └── timer.md
```

---

## Document index

| Document | Covers |
|---|---|
| **[architecture.md](architecture.md)** | System layout, data flow, execution loop, wiring (this document) |
| **[gbc-emulator.md](gbc-emulator.md)** | Orchestrator: construction, lifecycle, execution loop, full public API |
| **[cgb-features.md](cgb-features.md)** | CGB mode detection, double-speed, VRAM/WRAM banking, palettes, HDMA, priority rules |
| **[cpu.md](cpu.md)** | SM83 registers, step() loop, interrupt dispatch, opcode tables |
| **[address-bus.md](address-bus.md)** | Memory map, I/O routing, RAM banking, OAM DMA, HDMA, CGB features |
| **[ppu.md](ppu.md)** | Scanline timing, rendering pipeline, tile encoding, priority rules, STAT |
| **[apu.md](apu.md)** | Sound channels, frame sequencer, mixer, sample FIFO, frontend audio |
| **[timer.md](timer.md)** | DIV/TIMA counters, TAC frequency select, overflow interrupt |
| **[interrupts.md](interrupts.md)** | IF/IE registers, IME, dispatch sequence, HALT/STOP interaction |
| **[cartridge.md](cartridge.md)** | ROM header, MBC1/MBC3/MBC5, SRAM persistence, save keys |
| **[joypad.md](joypad.md)** | Button mapping, P1 register, input data flow, key bindings |
