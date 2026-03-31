# APU (Audio Processing Unit)

**Source:** `src/emulator/apu/apu.ts` · `src/emulator/apu/apuRegisters.ts` · `src/emulator/apu/types.ts` · `src/emulator/apu/frameSequencer.ts` · `src/emulator/apu/mixer.ts`  
**Channels:** `src/emulator/apu/channels/channel1Pulse.ts` · `channel2Pulse.ts` · `channel3Wave.ts` · `channel4Noise.ts`  
**Components:** `src/emulator/apu/channels/components/lengthCounter.ts` · `volumeEnvelope.ts` · `sweepUnit.ts` · `noiseLfsr.ts`  
**Frontend:** `src/emulator/frontendAudio/audioOutput.ts`

The APU synthesizes the Game Boy's four sound channels, mixes them into stereo, and pushes samples into a FIFO for the frontend to consume. Sound support is work-in-progress — CH2 and CH3 are complete; CH1 and CH4 are partially implemented.

---

## Architecture overview

```
  CPU calls apu.step(baseCycles) each instruction
           │
           ▼
  ┌──────────────────────────────────────────┐
  │ APU                                      │
  │  ┌──────────┐ ┌──────────┐              │
  │  │ CH1      │ │ CH2      │  ← pulse     │
  │  │ (sweep)  │ │          │    channels   │
  │  ├──────────┤ ├──────────┤              │
  │  │ CH3      │ │ CH4      │              │
  │  │ (wave)   │ │ (noise)  │              │
  │  └──────────┘ └──────────┘              │
  │       │            │                     │
  │       ▼            ▼                     │
  │  FrameSequencer → clocks length/env/sweep│
  │       │                                  │
  │       ▼                                  │
  │  Mixer (NR50 volume, NR51 panning)       │
  │       │                                  │
  │       ▼                                  │
  │  sampleFifo (interleaved stereo)         │
  └──────────────────────────────────────────┘
           │
           ▼  consumeSamples(frameCount)
  ┌──────────────────────────────────────────┐
  │ AudioOutput (frontend)                   │
  │  StereoRingBuffer → ScriptProcessorNode  │
  │  → AudioContext.destination              │
  └──────────────────────────────────────────┘
```

---

## `step(baseCycles)` — sample generation

The APU runs in a cycle-accurate sub-stepping loop:

1. Calculate the number of base cycles until the next sample emission point using a phase accumulator (`samplePhaseBaseCycles`). The accumulator ticks in `baseCycles × sampleRate` units and wraps at `CLOCK_HZ` (4,194,304).
2. Advance each enabled channel by the chunk of cycles (channel timers decrement, duty/wave/LFSR position advances on timer expiry).
3. Feed the chunk into the `FrameSequencer`, which may emit zero or more frame sequencer ticks.
4. For each tick, clock the length counters, volume envelopes, and/or sweep unit as dictated by the tick's flags.
5. When the phase accumulator wraps: call `renderOneSample()` to sample all four channel amplitudes, route them through the `Mixer`, and push one stereo frame into the FIFO.

---

## Frame sequencer

`FrameSequencer` (`frameSequencer.ts`) divides the base clock into 8 evenly-spaced steps at 512 Hz (period = 8192 base cycles).

| Step | Length | Envelope | Sweep |
|---|---|---|---|
| 0 | ✓ | | |
| 1 | | | |
| 2 | ✓ | | ✓ |
| 3 | | | |
| 4 | ✓ | | |
| 5 | | | |
| 6 | ✓ | | ✓ |
| 7 | | ✓ | |

`stepCycles(baseCycles)` returns an array of all ticks that fired during those cycles (usually 0 or 1; occasionally 2 if a large cycle chunk spans multiple periods).

---

## Channels

### CH1 — Pulse with sweep

Generates a square wave with four selectable duty cycles (12.5%, 25%, 50%, 75%) and a frequency sweep unit.

**Registers:** NR10 (sweep), NR11 (length + duty), NR12 (volume envelope), NR13/NR14 (11-bit period + trigger).

**Timer:** period = `(2048 − freq11) × 4` base cycles. Each time the timer expires, the duty step advances (0–7 cycling).

**Sweep:** on trigger and on every sweep clock, computes `newFreq = shadowFreq ± (shadowFreq >> shift)`. If the result exceeds 2047, the channel is disabled. The sweep also performs a second overflow check after updating the shadow frequency (per hardware behaviour). When the sweep modifies the frequency, it writes back to NR13/NR14 shadow registers and the APU syncs those into `nrRegisters`.

**DAC:** if `NR12` bits 7–3 are all zero, the DAC is off and the channel is forced off.

### CH2 — Pulse (no sweep)

Identical to CH1 minus the sweep unit.

**Registers:** NR21 (length + duty), NR22 (volume envelope), NR23/NR24 (period + trigger).

### CH3 — Wave

Plays back 4-bit samples from a 32-entry wave table (16 bytes at `0xFF30–0xFF3F`, each byte holding two nibbles).

**Registers:** NR30 (DAC enable), NR31 (length), NR32 (volume shift code), NR33/NR34 (period + trigger).

**Timer:** period = `(2048 − freq11) × 2` base cycles. Each expiry advances the 5-bit position counter (0–31) and loads the next 4-bit sample from wave RAM.

**Volume:** no envelope — uses a shift code instead:

| NR32 bits 6–5 | Shift | Effective volume |
|---|---|---|
| `00` | 4 (mute) | 0% |
| `01` | 0 | 100% |
| `10` | 1 | 50% |
| `11` | 2 | 25% |

### CH4 — Noise

Generates pseudo-random noise via a 15-bit LFSR.

**Registers:** NR41 (length), NR42 (volume envelope), NR43 (LFSR clock config), NR44 (trigger).

**Timer:** period = `divisor << clockShift`, where `divisor` is looked up from a table `[8, 16, 32, 48, 64, 80, 96, 112]` and `clockShift` is bits 7–4 of NR43.

**LFSR:** on each timer tick, XOR bits 0 and 1, shift right, insert the result at bit 14. If 7-bit width mode is set (NR43 bit 3), the XOR result is also written into bit 6, producing a harsher, more tonal noise. Output bit = inverted bit 0.

---

## Shared channel components

### `LengthCounter`

Counts down at 256 Hz (clocked on frame sequencer steps 0, 2, 4, 6). When the counter reaches 0, the channel is disabled. CH1/2/4 use a max of 64; CH3 uses 256.

On trigger: if the counter is zero, it reloads to max.

### `VolumeEnvelope` (CH1, CH2, CH4)

Clocked at 64 Hz (frame sequencer step 7). Every `period` ticks (1–7), the volume increments or decrements by 1. Stops when it hits 0 or 15. A period of 0 disables the envelope.

**DAC rule:** the DAC is enabled when `NR×2` bits 7–3 are not all zero (`(value & 0xF8) !== 0`). When the DAC is off, the channel is forced off.

### `SweepUnit` (CH1 only)

Clocked at 128 Hz (frame sequencer steps 2 and 6). Modifies CH1's 11-bit frequency using: `newFreq = shadow ± (shadow >> shift)`. Disables the channel on overflow (> 2047). A pace of 0 and shift of 0 both disable the sweep.

### `NoiseLfsr` (CH4 only)

A 15-bit linear feedback shift register. See CH4 section above.

---

## DAC and amplitude conversion

Each channel's `getAmplitude()` converts its internal digital level (0–15) to an analog-range float:

```ts
const dacAmplitude = (level / 15) * 2 - 1;  // range: -1.0 to +1.0
```

For pulse channels, the level is `0` when the duty bit is off, or the current envelope volume when it's on. For the wave channel it's the shifted sample. For noise it's `0` or the envelope volume based on the LFSR output bit.

---

## Mixer

`Mixer.mixSoundChannels(nr50, nr51, amplitudes)` performs:

1. **Panning** (NR51): bits 4–7 route channels to the left output, bits 0–3 to the right. Amplitude is summed per side.
2. **Normalization**: each side is divided by 4 (max number of contributing channels).
3. **Master volume** (NR50): bits 6–4 set left gain (0–7), bits 2–0 set right gain (0–7). Each side is scaled by `volume / 7`.
4. **Clamping**: output is clamped to `[-1, +1]`.

The Vin mixing bit (NR50 bits 7 and 3) is not implemented.

---

## Sample FIFO

The APU maintains a circular `Float32Array` buffer of interleaved stereo frames (`[L, R, L, R, ...]`). Capacity is `sampleRate × 0.2` frames (~200 ms at 48 kHz). On overflow, the oldest frame is silently dropped.

- **`pushSample(left, right)`** — called by `renderOneSample()` after mixing.
- **`consumeSamples(frameCount)`** — called by the React layer; returns a new `Float32Array` of `frameCount × 2` floats, silence-filling any shortfall.

---

## NR52 — power control

- **Power off** (`NR52` bit 7 = 0): clears all NR10–NR51 registers, resets all four channels, disables all channels. Wave RAM is preserved.
- **Power on** (bit 7 transitions 0 → 1): resets the frame sequencer to step 7 and resets all channels.
- **NR52 read:** bit 7 = power status; bits 3–0 = per-channel enabled status (read-only); bits 6–4 always read `1`.

When powered off, all register writes except NR52 and wave RAM are ignored.

---

## Frontend audio (`AudioOutput`)

`AudioOutput` bridges the APU's sample FIFO to the Web Audio API.

**Ring buffer:** `StereoRingBuffer` — a fixed-size interleaved circular buffer. Capacity is derived from `bufferMs` (default: 120 ms). Overflow drops the oldest frame.

**Playback pipeline:**

1. `start()` creates an `AudioContext` and a `ScriptProcessorNode` (1024-frame block size).
2. The `onaudioprocess` callback pops frames from the ring into the output channel buffers, filling with silence on underrun.
3. `pump()` is called each RAF tick by `useGBCEmulator`. It calculates how many frames are needed to maintain the target fill level (`targetFillMs`, default: 60 ms, minimum: 2 blocks) and pulls that many from `apu.consumeSamples()` into the ring.

**Latency tuning:** adjust `bufferMs` and `targetFillMs` in the constructor options. Lower values reduce latency but increase underrun risk.

---

## APU settings

```ts
type APUSettings = {
  enabled: boolean;        // master audio enable (frontend level)
  muteCh1: boolean;        // per-channel mute toggles
  muteCh2: boolean;
  muteCh3: boolean;
  muteCh4: boolean;
  bypassEnvelope?: boolean;   // debug overrides (not wired yet)
  bypassLengthCounter?: boolean;
  bypassSweep?: boolean;
};
```

`setAPUSettings(partial)` merges into current settings. When `enabled` is false, `renderOneSample()` outputs silence without disabling the internal APU state.

---

## Register map

All audio registers live at `0xFF10–0xFF26` plus wave RAM at `0xFF30–0xFF3F`. The `AddressBus` routes reads/writes in these ranges to `apu.readRegister / writeRegister` and `apu.readWaveRam / writeWaveRam`. Addresses `0xFF27–0xFF2F` are unused (read `0xFF`, writes ignored).

| Register group | Addresses | Channel |
|---|---|---|
| NR10–NR14 | `0xFF10–0xFF14` | CH1 (pulse + sweep) |
| NR21–NR24 | `0xFF16–0xFF19` | CH2 (pulse) |
| NR30–NR34 | `0xFF1A–0xFF1E` | CH3 (wave) |
| NR41–NR44 | `0xFF20–0xFF23` | CH4 (noise) |
| NR50–NR52 | `0xFF24–0xFF26` | Global (volume, panning, power) |
| Wave RAM | `0xFF30–0xFF3F` | CH3 waveform data (16 bytes, 32 × 4-bit samples) |

**Register naming convention** (per Pan Docs): for channel *x*, NR*x*0 is a channel-specific feature, NR*x*1 is length, NR*x*2 is volume/envelope, NR*x*3 is period low bits, NR*x*4 is trigger + period high bits. Exceptions: CH3 has no envelope (NR32 is a volume code), and CH4 has no frequency (NR43 is LFSR configuration).

---

## Public API summary

| Method | Description |
|---|---|
| `step(baseCycles)` | Advance APU state and generate samples into the FIFO |
| `reset()` | Power off, clear all state (wave RAM preserved) |
| `consumeSamples(frameCount)` | Drain up to N stereo frames from the FIFO |
| `readRegister(address)` | Read NR10–NR52 |
| `writeRegister(address, value)` | Write NR10–NR52 (with channel trigger/DAC logic) |
| `readWaveRam(address)` | Read `0xFF30–0xFF3F` |
| `writeWaveRam(address, value)` | Write `0xFF30–0xFF3F` |
| `isPowered()` | Whether NR52 bit 7 is set |
| `setAPUSettings(partial)` | Update frontend mute/enable flags |
| `getAPUSettings()` | Current settings |
