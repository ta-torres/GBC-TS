# Timer

**Source:** `src/emulator/core/timer.ts`

The Timer provides two independent counters — DIV (free-running) and TIMA (configurable, interrupt-generating) — driven by the base clock. It is stepped once per CPU instruction with the same `baseCycles` given to the PPU and APU.

---

## Registers

| Address | Name | R/W | Description |
|---------|------|-----|-------------|
| `0xFF04` | DIV | R (write resets to 0) | Divider — increments at 16 384 Hz (every 256 T-cycles) |
| `0xFF05` | TIMA | R/W | Timer counter — increments at the TAC-selected frequency |
| `0xFF06` | TMA | R/W | Timer modulo — reload value loaded into TIMA on overflow |
| `0xFF07` | TAC | R/W | Timer control — enable bit + frequency select |

### TAC bit layout

```
Bit 7–3: Unused (read as 1)
Bit 2:   Timer enable (1 = TIMA counting, 0 = stopped)
Bits 1–0: Clock select
```

| Clock select | Period (T-cycles) | Frequency |
|---|---|---|
| `00` | 1024 | 4 096 Hz |
| `01` | 16 | 262 144 Hz |
| `10` | 64 | 65 536 Hz |
| `11` | 256 | 16 384 Hz |

---

## DIV counter

DIV is a simple 8-bit counter that increments every 256 base cycles regardless of the TAC enable bit. An internal accumulator (`divCycles`) tracks fractional progress.

**Write behaviour:** any write to `0xFF04` resets both `div` and `divCycles` to zero — the written value is ignored.

---

## TIMA counter and overflow

When bit 2 of TAC is set, an internal accumulator (`timaCycles`) counts base cycles. Each time it reaches the selected period:

1. TIMA increments (`(tima + 1) & 0xFF`).
2. If TIMA reaches `0xFF` after the increment, it overflows:
   - TIMA is reloaded with TMA.
   - A **Timer interrupt** (`IF` bit 2, vector `0x0050`) is requested.

The `while` loop handles cases where a large cycle chunk spans multiple TIMA ticks.

Writing to TAC resets `timaCycles` to zero, clearing any partial accumulation.

---

## `step(baseCycles)` flow

```
step(cycles)
 ├─ divCycles += cycles
 │   └─ while divCycles ≥ 256 → div++, divCycles -= 256
 │
 ├─ if timer disabled → return
 │
 └─ timaCycles += cycles
     └─ while timaCycles ≥ frequency
          ├─ tima++
          ├─ if tima == 0xFF → tima = tma, request TIMER interrupt
          └─ timaCycles -= frequency
```

Called from `GBCEmulator.stepInstruction()` after each `cpu.step()`. In CGB double-speed mode the raw CPU cycle count is halved before being passed to the timer.

---

## Public API

| Method | Description |
|--------|-------------|
| `step(cycles)` | Advance both counters by the given base cycles |
| `readDIV()` / `writeDIV(value)` | Read DIV; write resets to 0 |
| `readTIMA()` / `writeTIMA(value)` | Read/write TIMA (masked to 8 bits) |
| `readTMA()` / `writeTMA(value)` | Read/write TMA (masked to 8 bits) |
| `readTAC()` / `writeTAC(value)` | Read TAC (upper bits = 1); write stores bits 0–2 and resets `timaCycles` |
| `reset()` | Zero all registers and accumulators |
