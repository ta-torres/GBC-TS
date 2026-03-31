# CPU

**Source:** `src/emulator/core/cpu.ts` · `src/emulator/core/registers.ts` · `src/emulator/core/interrupts.ts`

The CPU emulates the Sharp SM83 (a hybrid of the Z80 and Intel 8080 found in the original Game Boy). It fetches one opcode per `step()` call, executes it via a lookup table, and returns the number of T-cycles consumed.

---

## Registers

Defined in `Registers` (`registers.ts`).

| Register | Width | Purpose |
|---|---|---|
| A | 8-bit | Accumulator — arithmetic results land here |
| F | 8-bit | Flags (upper nibble only; lower 4 bits always 0) |
| B, C, D, E, H, L | 8-bit | General purpose; paired as BC, DE, HL for 16-bit ops |
| PC | 16-bit | Program counter (held on `CPU`, not `Registers`) |
| SP | 16-bit | Stack pointer (held on `CPU`, not `Registers`) |

**F register flag layout** (bits 7–4):

| Bit | Flag | Set when… |
|---|---|---|
| 7 | Z (Zero) | Result was zero |
| 6 | N (Subtract) | Last op was a subtraction |
| 5 | H (Half-carry) | Carry from bit 3 to bit 4 |
| 4 | C (Carry) | Carry out of bit 7 / borrow |

`setF()` masks the value to `& 0xF0` — the lower nibble can never be set.

**Post-boot register state** differs between DMG and CGB mode. `reset(cgbMode)` applies the appropriate values (e.g. `A = 0x01` for DMG, `A = 0x11` for CGB).

---

## `step()` — main execution loop

Each call to `step()` performs exactly one unit of work and returns the T-cycles taken.

```
1. If IME=1 and an interrupt is pending → handleInterrupt() → return 20 cycles
2. If STOP → idle until any interrupt becomes pending → return 4 cycles
3. If HALT → idle until any interrupt becomes pending → return 4 cycles
4. Read opcode at PC, advance PC
5. If opcode == 0xCB → read second byte, dispatch from CB_OPCODE_TABLE
6. Otherwise dispatch from OPCODE_TABLE
7. After execution: if IME was scheduled (by EI), enable IME now
8. Return cycle count from the executed instruction
```

The **halt bug** applies when HALT is executed with `IME=0` and an interrupt already pending: `haltBug` is set to `true`, causing PC *not* to advance after the next opcode fetch (the following byte is effectively read twice).

---

## Interrupt handling

Interrupts are managed by the shared `Interrupts` instance.

**Priority order** (highest first): VBlank → LCD STAT → Timer → Serial → Joypad

**Dispatch addresses:**

| Interrupt | Vector |
|---|---|
| VBlank | `0x0040` |
| LCD STAT | `0x0048` |
| Timer | `0x0050` |
| Serial | `0x0058` |
| Joypad | `0x0060` |

When `handleInterrupt()` fires it: clears IME, clears the interrupt bit in IF, pushes PC to the stack, then jumps to the vector. Cost: 20 T-cycles.

**IME scheduling:** `EI` does not enable interrupts immediately — it sets `imeScheduled`, which flips `IME` to `true` at the end of the *next* `step()`. This matches hardware behaviour where the instruction after `EI` always runs before any interrupt is serviced.

---

## Opcode tables

Opcodes are registered at module load time via a `register()` helper:

```ts
register(opcode, mnemonic, bytes, cycles, execute);
// execute: (cpu: CPU, bus: AddressBus) => number  (returns actual cycles)
```

- `OPCODE_TABLE` — standard 256-entry table (`opcodes.ts`)
- `CB_OPCODE_TABLE` — 256-entry prefix table (`opcodesCB.ts`)

Conditional instructions (e.g. `JR NZ`) return a different cycle count depending on whether the branch was taken. Unimplemented opcodes log a warning and burn 4 cycles.

---

## Stack operations

`push(value: number)`: decrements SP by 2 and writes the 16-bit value big-endian (high byte first at `SP-1`, low byte at `SP-2`).

`pop(): number`: reads low byte at SP, high byte at SP+1, increments SP by 2, returns the combined 16-bit value.

---

## Public API summary

| Method | Description |
|---|---|
| `step()` | Execute one instruction; returns T-cycles consumed |
| `reset(cgbMode?)` | Restore post-boot register state |
| `push(value)` / `pop()` | Stack operations (used by opcodes directly) |
| `halt()` | Enter HALT state (handles halt bug internally) |
| `stop()` | Enter STOP state |
| `enableIME()` / `disableIME()` | Set interrupt master enable immediately |
| `scheduleIME()` | Enable IME after next instruction (EI behaviour) |
| `getPC()` / `getSP()` | Read program counter / stack pointer |
| `getRegisters()` | Returns the `Registers` instance |
