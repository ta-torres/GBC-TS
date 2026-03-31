# Joypad (Input)

**Source:** `src/emulator/input/joypad.ts`  
**Frontend integration:** `src/hooks/useGBCEmulator.ts` · `src/ui/Layout/Shell/GameboyDpad.tsx` · `GameboyActionButtons.tsx` · `GameboySelectButtons.tsx`

The Joypad maps eight Game Boy buttons to a single I/O register (P1 / `0xFF00`), using selection lines to multiplex two groups of four buttons. Input arrives from keyboard events and touch/pointer UI components.

---

## Button mapping

Two independent 4-bit groups share the same lower nibble of P1, selected by bits 4–5:

| Bit | Direction group (bit 4 = 0) | Action group (bit 5 = 0) |
|-----|----------------------------|--------------------------|
| 0 | Right | A |
| 1 | Left | B |
| 2 | Up | SELECT |
| 3 | Down | START |

Active-low logic: **0 = pressed**, **1 = not pressed**.

---

## P1 register (`0xFF00`)

```
Bit 7–6: Always read 1 (unused)
Bit 5:   Select action buttons   (0 = select, 1 = deselect)  [write-only]
Bit 4:   Select direction buttons (0 = select, 1 = deselect) [write-only]
Bit 3–0: Button state             (0 = pressed)              [read-only]
```

**Write path:** the AddressBus stores only bits 4–5 into `ioRegisters`; bits 0–3 are ignored.

**Read path:** the AddressBus extracts the stored selection bits, calls `joypad.readP1LowerNibble(selectBits)`, and assembles the result:

```
return 0xC0 | selectBits | (lowerNibble & 0x0F)
```

If both groups are selected simultaneously, the result is the AND of both nibbles (any pressed button in either group reads as pressed).

---

## Internal state

The `Joypad` class stores two separate 4-bit values:

- **`directionalState`** — bits 0–3 for Right/Left/Up/Down
- **`buttonState`** — bits 0–3 for A/B/SELECT/START

Internally, a set bit means the button **is pressed** (1 = pressed). The inversion to Game Boy active-low happens in `readP1LowerNibble()`, which starts with `0x0F` (all unpressed) and clears bits for each pressed button.

---

## Interrupt

`pressButton()` requests a **JOYPAD interrupt** (`IF` bit 4, vector `0x0060`) on rising edge only — i.e., when a button transitions from unpressed to pressed. Releasing a button does **not** trigger an interrupt.

The interrupt is lowest priority (behind VBlank, STAT, Timer, Serial).

---

## Data flow

```
Keyboard / Touch event
        │
        ▼
useGBCEmulator hook
  keyToButton mapping / onButtonDown callback
        │
        ▼
GBCEmulator.pressButton(button) / releaseButton(button)
        │
        ▼
Joypad.pressButton(button)
  ├─ sets bit in directionalState or buttonState
  └─ if changed → interrupts.requestInterrupt(JOYPAD)
        │
        ▼
Game code writes selection bits to P1 (0xFF00)
Game code reads P1 → AddressBus calls readP1LowerNibble()
  └─ returns inverted state for selected group(s)
```

---

## Default key bindings

Defined in `useGBCEmulator.ts`:

| Key | Button |
|-----|--------|
| Arrow keys | D-Pad |
| Z | B |
| X | A |
| Enter | START |
| Left/Right Shift | SELECT |

The mapping is a hardcoded `Record<string, JoypadButton>` keyed by `event.code`. No persistent configuration exists.

---

## Touch / pointer UI

Three shell components handle mobile input, all wired through `onButtonDown` / `onButtonUp` callbacks:

- **`GameboyDpad`** — pointer tracking with dead-zone detection (20 px) and angle-based 8-direction recognition (supports diagonals within ±10°).
- **`GameboyActionButtons`** — A/B with simultaneous press support; tracks primary and secondary button under pointer.
- **`GameboySelectButtons`** — simple press/release handlers; `onMouseLeave` fires release to prevent stuck state.

---

## Public API

| Method | Description |
|--------|-------------|
| `pressButton(button)` | Set button pressed; request interrupt on rising edge |
| `releaseButton(button)` | Clear button state (no interrupt) |
| `readP1LowerNibble(selectBits)` | Return active-low nibble for the selected button group(s) |
| `reset()` | Clear both state bytes to `0x00` |

**Type:**
```ts
type JoypadButton = "right" | "left" | "up" | "down" | "a" | "b" | "select" | "start";
```
