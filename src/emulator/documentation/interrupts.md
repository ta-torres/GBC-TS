# Interrupts

**Source:** `src/emulator/core/interrupts.ts` · interrupt dispatch in `src/emulator/core/cpu.ts`

The Game Boy has five hardware interrupts multiplexed through two registers — IE (enable mask) and IF (pending flags). The CPU checks for actionable interrupts at the top of every `step()` call, before executing the next instruction.

---

## Interrupt table

| Priority | Type | Bit | IF/IE mask | Vector | Source |
|----------|------|-----|------------|--------|--------|
| 1 (highest) | VBlank | 0 | `0x01` | `0x0040` | PPU enters scanline 144 |
| 2 | LCD STAT | 1 | `0x02` | `0x0048` | PPU mode change / LYC match (per STAT enables) |
| 3 | Timer | 2 | `0x04` | `0x0050` | TIMA overflow → reload TMA |
| 4 | Serial | 3 | `0x08` | `0x0058` | *Defined but not implemented* |
| 5 (lowest) | Joypad | 4 | `0x10` | `0x0060` | Button press (rising edge) |

---

## Registers

### IE — Interrupt Enable (`0xFFFF`)

Bits 0–4 enable individual interrupts. Upper 3 bits are masked off on write and read as `0`.

### IF — Interrupt Flags (`0xFF0F`)

Bits 0–4 are pending flags, set by hardware via `requestInterrupt()` and clearable by the CPU or by software writes. Upper 3 bits always read as `1` (`0xE0`).

An interrupt is **actionable** when its bit is set in both IE and IF: `pending = ie & if`.

---

## IME (Interrupt Master Enable)

A CPU-internal flag that gates all interrupt dispatch. Not memory-mapped.

| Opcode | Effect |
|--------|--------|
| `DI` (`0xF3`) | Clears IME immediately |
| `EI` (`0xFB`) | Schedules IME enable — takes effect **after** the next instruction |
| `RETI` | Pops PC from stack and enables IME immediately |

The one-instruction EI delay is implemented via an `imeScheduled` flag: `EI` sets the flag, and the end of `step()` promotes it to `interruptMasterEnable = true`.

---

## Dispatch sequence (20 cycles)

When `step()` finds IME enabled and at least one actionable interrupt:

```
1. IME ← false              (prevent nested interrupts)
2. Cancel any pending EI     (imeScheduled ← false)
3. Exit HALT if active
4. Clear the IF bit          (acknowledge)
5. Push PC onto stack        (SP -= 2, high byte first)
6. PC ← interrupt vector
7. Return 20 cycles          (no instruction executed this step)
```

Priority is resolved by `getHighestPriority()`, which checks bits 0→4 in order and returns the first set bit.

---

## HALT and STOP interaction

### HALT (`0x76`)

Enters a low-power idle. Each `step()` while halted returns 4 cycles without executing instructions.

**Wake-up:** any bit in `ie & if` becomes nonzero → `halted = false`. The interrupt itself is serviced on the **next** `step()` call (if IME is enabled).

**HALT bug:** if IME is **disabled** and an interrupt is already pending when HALT executes, the CPU does not actually halt. Instead it sets a `haltBug` flag that suppresses the PC increment on the next instruction fetch, causing the first byte of the next opcode to be read twice.

### STOP (`0x10`)

Similar idle state. Wakes on any pending interrupt (`getPending() !== 0`), returning 4 cycles. Used for CGB speed switching.

---

## Interrupt sources

### VBlank — PPU

Requested once per frame when LY transitions to 144 (start of vertical blanking).

### LCD STAT — PPU

Requested when a STAT-enabled condition fires. Four independent sources, each with a one-shot flag to prevent duplicate requests while the condition holds:

| STAT bit | Condition |
|----------|-----------|
| 3 | Mode 0 (HBlank) entered |
| 4 | Mode 1 (VBlank) entered |
| 5 | Mode 2 (OAM scan) entered |
| 6 | LY == LYC match |

All four share the single LCD_STAT interrupt line.

### Timer

Requested when TIMA overflows from `0xFF`. TIMA is reloaded with TMA and the interrupt is flagged. Timer frequency is configured via TAC bits 0–1 (1024 / 16 / 64 / 256 T-cycles).

### Joypad

Requested on rising edge of any button press (transition from unpressed → pressed). See [Joypad docs](joypad.md).

### Serial

Vector and type constant are defined but no serial hardware is implemented.

---

## `Interrupts` class API

| Method | Description |
|--------|-------------|
| `requestInterrupt(type)` | Set bit in IF (`if |= type`) |
| `getPending()` | Return `ie & if` (actionable mask) |
| `getHighestPriority()` | First set bit in pending, by priority; `null` if none |
| `clearInterrupt(type)` | Clear bit in IF (`if &= ~type`) |
| `getIE()` / `setIE(value)` | Read/write IE (masked to 5 bits) |
| `getIF()` / `setIF(value)` | Read/write IF (upper 3 bits read as `1`) |
| `reset()` | Clear both IE and IF to `0x00` |

---

## Address bus routing

| Address | Read | Write |
|---------|------|-------|
| `0xFF0F` (IF) | `interrupts.getIF()` | `interrupts.setIF(value)` |
| `0xFFFF` (IE) | `interrupts.getIE()` | `interrupts.setIE(value)` |

All subsystems receive the shared `Interrupts` instance via constructor injection and call `requestInterrupt()` independently.
