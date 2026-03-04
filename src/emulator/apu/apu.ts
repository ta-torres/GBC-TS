import { DEFAULT_APU_SETTINGS, type APUSettings } from "./types";
import { FrameSequencer } from "./frameSequencer";
import { Mixer } from "./mixer";
import { Channel2Pulse } from "./channels/channel2Pulse";
import { Channel3Wave } from "./channels/channel3Wave";

const NR10_ADDRESS = 0xff10;
const NR52_ADDRESS = 0xff26;
// volume/mixer registers
// https://gbdev.io/pandocs/Audio_Registers.html#ff25--nr51-sound-panning
const NR50_ADDRESS = 0xff24;
const NR51_ADDRESS = 0xff25;

const NR14_ADDRESS = 0xff14;

const NR21_ADDRESS = 0xff16;
const NR22_ADDRESS = 0xff17;
const NR23_ADDRESS = 0xff18;
const NR24_ADDRESS = 0xff19;

const NR30_ADDRESS = 0xff1a;
const NR31_ADDRESS = 0xff1b;
const NR32_ADDRESS = 0xff1c;
const NR33_ADDRESS = 0xff1d;
const NR34_ADDRESS = 0xff1e;

const NR44_ADDRESS = 0xff23;

const WAVE_RAM_START = 0xff30;
const WAVE_RAM_END = 0xff3f;

function isAudioReg(address: number): boolean {
  return address >= NR10_ADDRESS && address <= NR52_ADDRESS;
}

function isWaveRamAddr(address: number): boolean {
  return address >= WAVE_RAM_START && address <= WAVE_RAM_END;
}

export class APU {
  private sampleRate: number;
  private powered: boolean = false;

  /*
  the cpu/emulator calls apu.step(baseCycles) as instructions run
  apu.step() produces samples at a fixed sampleRate and enqueues them into sampleFifo
  useGBCEmulator calls consumeSamples(n) whenever it needs audio
  */

  private static readonly CLOCK_HZ = 4194304;
  // Sample phase accumulator in "base cycles * sampleRate" units, when it wraps CLOCK_HZ we emit one audio frame
  private samplePhaseBaseCycles: number = 0;

  // interleaved queue of stereo audio frames (left, right) produced by step()
  private sampleFifo: Float32Array;
  // fifo capacity in stereo frames (determined by sample rate and buffer size)
  private sampleFifoFrameCapacity: number;
  // fifo read/write frame index
  private sampleFifoReadFrame = 0;
  private sampleFifoWriteFrame = 0;
  private sampleFifoBufferedFrames = 0;

  private ch1Enabled = false;
  private ch2Enabled = false;
  private ch3Enabled = false;
  private ch4Enabled = false;

  // Shadow copy of NR10-NR51 (used internally)
  private nrRegisters: Uint8Array;

  private waveRam: Uint8Array;

  private apuSettings: APUSettings = DEFAULT_APU_SETTINGS;

  private frameSequencer: FrameSequencer;
  private mixer: Mixer;

  private ch2: Channel2Pulse;
  private ch3: Channel3Wave;

  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;

    this.nrRegisters = new Uint8Array(0x17);
    this.waveRam = new Uint8Array(0x10);
    this.frameSequencer = new FrameSequencer();
    this.mixer = new Mixer();
    this.ch2 = new Channel2Pulse();
    this.ch3 = new Channel3Wave(this.waveRam);

    this.sampleFifoFrameCapacity = Math.max(
      1,
      Math.floor(this.sampleRate * 0.2),
    );
    this.sampleFifo = new Float32Array(this.sampleFifoFrameCapacity * 2);
  }

  reset(): void {
    this.powered = false;
    this.nrRegisters.fill(0);
    // NR52 power off does not clear wave RAM per docs?
    this.apuSettings = DEFAULT_APU_SETTINGS;
    this.frameSequencer = new FrameSequencer();
    this.mixer = new Mixer();
    this.ch2 = new Channel2Pulse();
    this.ch3 = new Channel3Wave(this.waveRam);

    this.ch1Enabled = false;
    this.ch2Enabled = false;
    this.ch3Enabled = false;
    this.ch4Enabled = false;

    this.samplePhaseBaseCycles = 0;
    this.sampleFifoReadFrame = 0;
    this.sampleFifoWriteFrame = 0;
    this.sampleFifoBufferedFrames = 0;
  }

  private pushSample(left: number, right: number): void {
    // push one interleaved stereo frame into the fifo (dropping oldest on overflow)
    if (this.sampleFifoBufferedFrames >= this.sampleFifoFrameCapacity) {
      // Drop oldest on overflow.
      this.sampleFifoReadFrame =
        (this.sampleFifoReadFrame + 1) % this.sampleFifoFrameCapacity;
      this.sampleFifoBufferedFrames -= 1;
    }

    const writeIndex = this.sampleFifoWriteFrame;

    this.sampleFifo[writeIndex * 2] = left;
    this.sampleFifo[writeIndex * 2 + 1] = right;

    this.sampleFifoWriteFrame = (writeIndex + 1) % this.sampleFifoFrameCapacity;

    this.sampleFifoBufferedFrames += 1;
  }

  private renderOneSample(): void {
    // render and enqueue one stereo output frame based on current channel amplitudes + mixer regs
    if (!this.apuSettings.enabled) {
      this.pushSample(0, 0);
      return;
    }

    if (!this.powered) {
      this.pushSample(0, 0);
      return;
    }
    /*
    NR51: routes CH1–CH4 to left/right (bits 4–7 left, 0–3 right)
    NR50: per-side master volume (0–7) as a gain
    */
    const nr50 = this.nrRegisters[NR50_ADDRESS - NR10_ADDRESS] ?? 0x00;
    const nr51 = this.nrRegisters[NR51_ADDRESS - NR10_ADDRESS] ?? 0x00;

    const ch2Amp =
      this.ch2Enabled && !this.apuSettings.muteCh2
        ? this.ch2.getAmplitude()
        : 0;

    const ch3Amp =
      this.ch3Enabled && !this.apuSettings.muteCh3
        ? this.ch3.getAmplitude()
        : 0;

    const mixed = this.mixer.mixSoundChannels(nr50, nr51, {
      ch1: 0,
      ch2: ch2Amp,
      ch3: ch3Amp,
      ch4: 0,
    });

    this.pushSample(mixed.left, mixed.right);
  }

  getAPUSettings(): APUSettings {
    return this.apuSettings;
  }

  setAPUSettings(cfg: Partial<APUSettings>): void {
    this.apuSettings = { ...this.apuSettings, ...cfg };
  }

  isPowered(): boolean {
    return this.powered;
  }

  step(baseCycles: number): void {
    // avanzar estado de APU por baseCycles y renderizar frames de audio en el FIFO a sampleRate
    if (!this.powered) return;

    let remainingCycles = Math.max(0, baseCycles | 0);
    while (remainingCycles > 0) {
      // sampleRate es entero pero CLOCK_HZ no, por lo que hay redondear hacia arriba el número de ciclos necesarios para generar una muestra, pero si la frecuencia de reloj es mayor que la frecuencia de muestreo, entonces hay que garantizar que nunca se generen más ciclos que la frecuencia de muestreo.
      const cyclesToNextSample = Math.min(
        this.sampleRate,
        Math.ceil(
          (APU.CLOCK_HZ - this.samplePhaseBaseCycles + this.sampleRate - 1) /
            this.sampleRate,
        ),
      );
      // Math.min para que nunca se exceda la cantidad de ciclos disponibles en chunkCycles
      const chunkCycles = Math.min(remainingCycles, cyclesToNextSample);

      if (this.ch2Enabled) {
        this.ch2.step(chunkCycles);
      }

      if (this.ch3Enabled) {
        this.ch3.step(chunkCycles);
      }

      const ticks = this.frameSequencer.stepCycles(chunkCycles);
      for (const tick of ticks) {
        if (tick.clockLength) {
          if (this.ch2Enabled) {
            const expired = this.ch2.clockLength();
            if (expired) this.ch2Enabled = false;
          }

          if (this.ch3Enabled) {
            const expired = this.ch3.clockLength();
            if (expired) this.ch3Enabled = false;
          }
        }

        if (tick.clockEnvelope) {
          if (this.ch2Enabled) {
            this.ch2.clockEnvelope();
          }
        }
      }

      this.samplePhaseBaseCycles += chunkCycles * this.sampleRate;
      if (this.samplePhaseBaseCycles >= APU.CLOCK_HZ) {
        this.samplePhaseBaseCycles -= APU.CLOCK_HZ;
        this.renderOneSample();
      }

      remainingCycles -= chunkCycles;
    }
  }

  consumeSamples(frameCount: number): Float32Array {
    // drain up to frameCount stereo frames from the fifo into an interleaved float32 buffer (silence-filling remainder)
    const frames = Math.max(0, frameCount | 0);
    const output = new Float32Array(frames * 2);

    const available = Math.min(frames, this.sampleFifoBufferedFrames);
    for (let i = 0; i < available; i++) {
      const readFrameIndex = this.sampleFifoReadFrame;

      output[i * 2] = this.sampleFifo[readFrameIndex * 2] ?? 0;
      output[i * 2 + 1] = this.sampleFifo[readFrameIndex * 2 + 1] ?? 0;

      this.sampleFifoReadFrame =
        (readFrameIndex + 1) % this.sampleFifoFrameCapacity;
      this.sampleFifoBufferedFrames -= 1;
    }

    return output;
  }

  readRegister(address: number): number {
    address &= 0xffff;

    if (!isAudioReg(address)) return 0xff;

    // https://gbdev.io/pandocs/Audio_Registers.html#ff26--nr52-audio-master-control
    if (address === NR52_ADDRESS) {
      const powerBit = this.powered ? 0x80 : 0x00;
      const statusBits =
        (this.ch1Enabled ? 0x01 : 0x00) |
        (this.ch2Enabled ? 0x02 : 0x00) |
        (this.ch3Enabled ? 0x04 : 0x00) |
        (this.ch4Enabled ? 0x08 : 0x00);

      return powerBit | 0x70 | statusBits;
    }

    if (!this.powered) return 0x00;

    if (address >= NR10_ADDRESS && address <= 0xff25) {
      return this.nrRegisters[address - NR10_ADDRESS] ?? 0x00;
    }

    return 0xff;
  }

  writeRegister(address: number, value: number): void {
    address &= 0xffff;
    value &= 0xff;

    if (!isAudioReg(address)) return;

    if (address === NR52_ADDRESS) {
      const wantPowered = (value & 0x80) !== 0;
      if (!wantPowered) {
        // power off clears NR10-NR51 but NOT NR52
        this.powered = false;
        this.nrRegisters.fill(0);

        this.ch1Enabled = false;
        this.ch2Enabled = false;
        this.ch3Enabled = false;
        this.ch4Enabled = false;

        this.ch2.reset();
        this.ch3.reset();
        return;
      }

      if (!this.powered) {
        this.powered = true;
        this.frameSequencer.resetOnApuPowerOn();
        this.ch2.reset();
        this.ch3.reset();
        return;
      }

      this.powered = true;
      return;
    }

    // ignore APU writes except for wave RAM when powered off
    if (!this.powered) return;

    // CH2 register handling
    if (address === NR21_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      this.ch2.writeNR21(value);
      return;
    }
    if (address === NR22_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      this.ch2.writeNR22(value);

      // if DAC is turned off force ch2 off
      if (this.ch2Enabled && !this.ch2.isDacEnabled()) {
        this.ch2Enabled = false;
      }
      return;
    }
    if (address === NR23_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      this.ch2.writeNR23(value);
      return;
    }
    if (address === NR24_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      const { triggered } = this.ch2.writeNR24(value);

      if (triggered) {
        // If DAC is off, channel is forced off on real hardware.
        this.ch2Enabled = this.ch2.isDacEnabled();
      }

      return;
    }

    // CH3 register handling
    if (address === NR30_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      this.ch3.writeNR30(value);

      if (this.ch3Enabled && !this.ch3.isDacEnabled()) {
        this.ch3Enabled = false;
      }
      return;
    }
    if (address === NR31_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      this.ch3.writeNR31(value);
      return;
    }
    if (address === NR32_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      this.ch3.writeNR32(value);
      return;
    }
    if (address === NR33_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      this.ch3.writeNR33(value);
      return;
    }
    if (address === NR34_ADDRESS) {
      this.nrRegisters[address - NR10_ADDRESS] = value;
      const { triggered } = this.ch3.writeNR34(value);
      if (triggered) {
        this.ch3Enabled = this.ch3.isDacEnabled();
      }
      return;
    }

    if (address >= NR10_ADDRESS && address <= 0xff25) {
      this.nrRegisters[address - NR10_ADDRESS] = value;

      const isTrigger = (value & 0x80) !== 0;
      if (isTrigger) {
        if (address === NR14_ADDRESS) this.ch1Enabled = true;
        else if (address === NR44_ADDRESS) this.ch4Enabled = true;
      }
      return;
    }

    // Writes to NR52 bits other than power are ignored
  }

  readWaveRam(address: number): number {
    address &= 0xffff;
    if (!isWaveRamAddr(address)) return 0xff;
    return this.waveRam[address - WAVE_RAM_START] ?? 0xff;
  }

  writeWaveRam(address: number, value: number): void {
    address &= 0xffff;
    value &= 0xff;
    if (!isWaveRamAddr(address)) return;
    this.waveRam[address - WAVE_RAM_START] = value;
  }

  /* debug only */

  _debugReadRegister(address: number): number {
    address &= 0xffff;
    if (address < NR10_ADDRESS || address > 0xff25) return 0xff;
    return this.nrRegisters[address - NR10_ADDRESS] ?? 0xff;
  }

  _debugGetInfo(): { sampleRate: number } {
    return { sampleRate: this.sampleRate };
  }
}
