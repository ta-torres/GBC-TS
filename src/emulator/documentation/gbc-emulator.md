# GBCEmulator (Orchestrator)

**Source:** `src/emulator/gbcEmulator.ts`

`GBCEmulator` is the top-level facade class that the frontend consumes. It constructs and wires all emulator subsystems, drives the per-instruction execution loop, and exposes a public API organized by subsystem domain (PPU, Joypad, Cartridge, APU). It has no knowledge of React, the DOM, or Web Audio — that boundary is handled entirely by `useGBCEmulator` and `AudioOutput`.

---

## Subsystem ownership

The orchestrator owns all eight subsystems as private fields:

| Field        | Class                        | Purpose                                            |
| ------------ | ---------------------------- | -------------------------------------------------- |
| `cartridge`  | [Cartridge](cartridge.md)    | ROM data, header, MBC delegation, SRAM             |
| `interrupts` | [Interrupts](interrupts.md)  | Shared IF/IE state — injected into most subsystems |
| `timer`      | [Timer](timer.md)            | DIV/TIMA counters, timer interrupt                 |
| `apu`        | [APU](apu.md)                | Sound channels, mixer, sample FIFO                 |
| `bus`        | [AddressBus](address-bus.md) | Memory-mapped I/O hub for all CPU reads/writes     |
| `joypad`     | [Joypad](joypad.md)          | Button state, joypad interrupt                     |
| `cpu`        | [CPU](cpu.md)                | Sharp SM83 — opcode execution, interrupt dispatch  |
| `ppu`        | [PPU](ppu.md)                | Scanline renderer, framebuffer                     |

---

## Construction order

Subsystems are instantiated in dependency order. Each component receives only the references it needs:

```
1.  Cartridge()                          standalone
2.  Interrupts()                         standalone (shared mutable state)
3.  Timer(interrupts)                    fires timer interrupt
4.  APU()                                standalone (clocked externally)
5.  AddressBus(cartridge, timer,         routes reads/writes; delegates
              interrupts, apu)           I/O register access
6.  Joypad(interrupts)                   fires joypad interrupt
7.  bus.attachJoypad(joypad)             late-bind for P1 register reads
8.  CPU(bus, interrupts)                 reads/writes through bus; checks interrupts
9.  PPU(vramBank0View, vramBank1View,    receives direct Uint8Array views
      oamView, ioView, interrupts,       (no bus dependency at render time)
      cgbMode, bgPaletteRamView,
      objPaletteRamView)
```

The Joypad is attached to the bus after construction (`attachJoypad`) rather than passed via the constructor, because the bus needs to synthesize the P1 register from the joypad's state on every read.

The PPU receives **shared `Uint8Array` views** of VRAM, OAM, I/O registers, and CGB palette RAM from the bus. These are live references — CPU writes through the bus mutate the same underlying buffers the PPU reads during rendering. This avoids per-pixel `bus.read()` dispatch overhead.

---

## Internal state

| Field             | Type             | Default | Description                                                 |
| ----------------- | ---------------- | ------- | ----------------------------------------------------------- |
| `cgbMode`         | `boolean`        | `false` | Set during `loadROM()` based on the ROM header CGB flag     |
| `running`         | `boolean`        | `false` | `true` after `start()`, `false` after `stop()` or `reset()` |
| `paused`          | `boolean`        | `false` | Toggled by `pause()`                                        |
| `ticks`           | `number`         | `0`     | Cumulative base-cycle counter since last reset              |
| `speedMultiplier` | `number`         | `1.0`   | Scales cycles per frame (range: 0.25–4.0)                   |
| `errorMessage`    | `string \| null` | `null`  | Last error from ROM loading                                 |

---

## ROM loading

`loadROM(file)` is `async` because it reads the file from disk via `loadROMFile()`.

```
loadROM(file: File) → Promise<boolean>
  ├─ clear errorMessage
  ├─ loadROMFile(file)              → ArrayBuffer
  ├─ cartridge.load(data)
  │    ├─ parseHeader()             → CartridgeHeader
  │    ├─ validateHeaderChecksum()
  │    ├─ initializeRAM()
  │    └─ initializeMBC()           → MBC1 / MBC3 / MBC5 / none
  │
  ├─ on failure: copy cartridge.getErrorMessage(), return false
  │
  ├─ Detect CGB mode from header:
  │    cgbFlag 0x80 → CGB compatible  → cgbMode = true
  │    cgbFlag 0xC0 → CGB only        → cgbMode = true
  │    otherwise                       → cgbMode = false
  │
  └─ reset()  → propagates cgbMode to CPU, bus, PPU
     return true
```

After `loadROM()` returns `true`, the emulator is reset and ready. The frontend is responsible for restoring any saved SRAM from `localStorage` before calling `start()`.

---

## Lifecycle methods

### `start()`

Guards against starting without a loaded ROM. Sets `running = true`, `paused = false`.

### `pause()`

Toggles `paused`. When paused, `stepFrameCycle()` returns immediately without executing any instructions. The emulator state is frozen in place.

### `stop()`

Sets `running = false`. Also called internally when `stepInstruction()` catches a CPU error — this halts emulation on an unrecoverable fault.

### `reset()`

Propagates reset to every subsystem in sequence, passing `cgbMode` to the three subsystems that need it (CPU, bus, PPU). Clears the tick counter and sets `running = false`, `paused = false`.

```
reset()
  ├─ cpu.reset(cgbMode)          ← post-boot register state (A=0x01 DMG, A=0x11 CGB)
  ├─ bus.reset(cgbMode)          ← zero RAM, default banking, CGB register state
  ├─ ppu.reset(cgbMode)          ← clear framebuffers, reset scanline state
  ├─ timer.reset()               ← zero DIV/TIMA/TMA/TAC
  ├─ interrupts.reset()          ← clear IE and IF
  ├─ joypad.reset()              ← clear button state
  ├─ apu.reset()                 ← power off, clear channels (wave RAM preserved)
  ├─ ticks = 0
  ├─ running = false
  └─ paused = false
```

---

## Execution loop

### `stepInstruction()`

Executes exactly one CPU instruction, then synchronizes all peripherals. This is the fundamental unit of emulation — every subsystem advances in lockstep.

```
stepInstruction()
  ├─ guard: return if no ROM loaded
  │
  ├─ timeCycles = cpu.step()
  │    └─ fetch → decode → execute → return T-cycles
  │
  ├─ baseCycles = bus.isDoubleSpeed()
  │                 ? floor(timeCycles / 2)
  │                 : timeCycles
  │
  ├─ timer.step(baseCycles)      ← may request Timer interrupt
  ├─ ppu.step(baseCycles)        ← may render scanline, request VBlank/STAT
  ├─ apu.step(baseCycles)        ← may push samples into FIFO
  │
  ├─ if ppu.hasEnteredHBlank()   ← one-shot flag, auto-clears
  │    └─ bus.stepHDMAHBlank()   ← CGB: transfer one 16-byte HDMA block
  │
  └─ ticks += baseCycles
```

**Double-speed handling:** in CGB double-speed mode the CPU runs at 8.38 MHz, but peripherals stay at 4.19 MHz. The orchestrator halves the CPU's T-cycle count before passing it to Timer, PPU, and APU. This adjustment happens in exactly one place.

### `stepFrameCycle()`

Runs instructions until one frame's worth of base cycles has been consumed. Called once per `requestAnimationFrame` tick by the React hook.

```
stepFrameCycle()
  ├─ guard: return if not running or paused
  │
  ├─ CYCLES_PER_FRAME = 70224    (154 lines × 456 cycles)
  ├─ targetCycles = CYCLES_PER_FRAME × speedMultiplier
  │
  └─ while remainingCycles > 0 && running && !paused:
       ├─ record ticks before
       ├─ stepInstruction()
       ├─ cyclesSpent = ticks - ticksBefore
       ├─ if cyclesSpent <= 0 → break   (safety valve)
       └─ remainingCycles -= cyclesSpent
```

At the default speed multiplier of 1.0, this executes ~70,224 base cycles per call — exactly one Game Boy frame. At 2.0× it executes ~140,448 cycles (two frames of work per RAF tick), making the game run at double speed.

The loop also checks `running` and `!paused` each iteration, allowing `stop()` or `pause()` called from an error handler or external code to take effect mid-frame.

---

## Speed control

```ts
setSpeedMultiplier(multiplier: number): void
```

Clamps the value to the range `[0.25, 4.0]` — quarter-speed to quadruple-speed. The multiplier scales `CYCLES_PER_FRAME` in `stepFrameCycle()`, so:

| Multiplier | Cycles per RAF | Effective FPS       | Behaviour    |
| ---------- | -------------- | ------------------- | ------------ |
| 0.25       | 17,556         | ~15                 | Slow motion  |
| 0.5        | 35,112         | ~30                 | Half speed   |
| 1.0        | 70,224         | ~60                 | Normal       |
| 2.0        | 140,448        | ~60 (2× game speed) | Fast forward |
| 4.0        | 280,896        | ~60 (4× game speed) | Turbo        |

The browser still calls RAF at ~60 Hz — higher multipliers execute more cycles per tick rather than increasing the tick rate.

---

## Public API by domain

### Emulator lifecycle

| Method              | Returns            | Description                                            |
| ------------------- | ------------------ | ------------------------------------------------------ |
| `loadROM(file)`     | `Promise<boolean>` | Load a ROM file, detect CGB mode, reset all subsystems |
| `start()`           | `void`             | Begin emulation (requires loaded ROM)                  |
| `pause()`           | `void`             | Toggle pause state                                     |
| `stop()`            | `void`             | Halt emulation                                         |
| `reset()`           | `void`             | Reset all subsystems to post-boot state                |
| `isRunning()`       | `boolean`          | Whether emulation is active                            |
| `isPaused()`        | `boolean`          | Whether emulation is paused                            |
| `getErrorMessage()` | `string \| null`   | Last error from `loadROM()`                            |

### Execution

| Method                  | Returns  | Description                                                 |
| ----------------------- | -------- | ----------------------------------------------------------- |
| `stepInstruction()`     | `void`   | Execute one CPU instruction and synchronize all peripherals |
| `stepFrameCycle()`      | `void`   | Execute instructions until one frame of cycles is consumed  |
| `getTicks()`            | `number` | Cumulative base-cycle counter since last reset              |
| `setSpeedMultiplier(n)` | `void`   | Set emulation speed (0.25–4.0)                              |
| `getSpeedMultiplier()`  | `number` | Current speed multiplier                                    |

### Debug

| Method          | Returns  | Description                                              |
| --------------- | -------- | -------------------------------------------------------- |
| `getCPUState()` | `string` | Formatted string: instruction, PC, SP, and all registers |

### PPU (rendering)

| Method                      | Returns                   | Description                                       |
| --------------------------- | ------------------------- | ------------------------------------------------- |
| `getFramebuffer()`          | `Uint32Array`             | Stable 160×144 ABGR framebuffer (double-buffered) |
| `hasFrameReady()`           | `boolean`                 | One-shot flag — `true` once per completed frame   |
| `getTileViewerData()`       | `{ width, height, data }` | Debug: raw palette indices for BG tiles           |
| `getSpriteTileViewerData()` | `{ width, height, data }` | Debug: raw palette indices for sprite tiles       |

### Joypad (input)

| Method                  | Returns | Description                                         |
| ----------------------- | ------- | --------------------------------------------------- |
| `pressButton(button)`   | `void`  | Register a button press (may fire joypad interrupt) |
| `releaseButton(button)` | `void`  | Register a button release                           |

`button` is a `JoypadButton`: `"right"` · `"left"` · `"up"` · `"down"` · `"a"` · `"b"` · `"select"` · `"start"`

### Cartridge (saves)

| Method                   | Returns                   | Description                                                          |
| ------------------------ | ------------------------- | -------------------------------------------------------------------- |
| `getCartridgeHeader()`   | `CartridgeHeader \| null` | Parsed ROM header                                                    |
| `getSaveKey()`           | `string \| null`          | `localStorage` key for this game's SRAM (null if not battery-backed) |
| `getSRAMSnapshot()`      | `Uint8Array \| null`      | Copy of current SRAM contents                                        |
| `loadSRAMSnapshot(data)` | `void`                    | Restore SRAM from a saved snapshot                                   |
| `hasSRAMBeenWrittenTo()` | `boolean`                 | Dirty flag — set on any write to `0xA000–0xBFFF`                     |
| `clearSRAMWriteFlag()`   | `void`                    | Reset the dirty flag after saving                                    |

### APU (audio)

| Method                            | Returns        | Description                                              |
| --------------------------------- | -------------- | -------------------------------------------------------- |
| `setAudioEnabled(enabled)`        | `void`         | Enable/disable audio output (frontend-level mute)        |
| `consumeAudioSamples(frameCount)` | `Float32Array` | Drain stereo samples from the APU FIFO                   |
| `setAudioConfig(cfg)`             | `void`         | Partial update of `APUSettings` (per-channel mute, etc.) |

---

## Relationship to the frontend

`GBCEmulator` is a plain TypeScript class with no framework dependencies. The React layer interacts with it exclusively through the methods above:

```
useGBCEmulator hook
  │
  ├─ Construction:   new GBCEmulator()
  ├─ ROM loading:    emulator.loadROM(file) → emulator.start()
  ├─ Game loop:      RAF → emulator.stepFrameCycle()
  ├─ Frame output:   emulator.hasFrameReady() → emulator.getFramebuffer() → canvas
  ├─ Audio:          AudioOutput.pump() → emulator.consumeAudioSamples(n) → ring buffer
  ├─ Input:          keydown → emulator.pressButton(button)
  ├─ Saves:          setInterval → emulator.hasSRAMBeenWrittenTo() → getSRAMSnapshot()
  └─ Controls:       emulator.pause() / reset() / setSpeedMultiplier()
```

The orchestrator is deliberately thin — it delegates all real work to the subsystems it owns. Its primary responsibilities are:

1. **Wiring** — constructing subsystems in the right order with the right dependencies
2. **Synchronization** — ensuring Timer, PPU, and APU advance in lockstep after each CPU instruction
3. **Cycle normalization** — the single place where T-cycles are converted to base cycles for double-speed mode
4. **Facade** — presenting a clean, domain-organized API that hides the subsystem graph from the frontend
