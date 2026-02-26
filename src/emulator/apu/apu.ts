import { DEFAULT_APU_SETTINGS, type APUSettings } from "./types";
import { FrameSequencer } from "./frameSequencer";
import { Mixer } from "./mixer";

const NR10_ADDRESS = 0xff10;
const NR52_ADDRESS = 0xff26;
// volume/mixer registers
// https://gbdev.io/pandocs/Audio_Registers.html#ff25--nr51-sound-panning
const NR50_ADDRESS = 0xff24;
const NR51_ADDRESS = 0xff25;

const NR14_ADDRESS = 0xff14;
const NR24_ADDRESS = 0xff19;
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

  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;

    this.nrRegisters = new Uint8Array(0x17);
    this.waveRam = new Uint8Array(0x10);
    this.frameSequencer = new FrameSequencer();
    this.mixer = new Mixer();
  }

  reset(): void {
    this.powered = false;
    this.nrRegisters.fill(0);
    // NR52 power off does not clear wave RAM per docs?
    this.apuSettings = DEFAULT_APU_SETTINGS;
    this.frameSequencer = new FrameSequencer();
    this.mixer = new Mixer();

    this.ch1Enabled = false;
    this.ch2Enabled = false;
    this.ch3Enabled = false;
    this.ch4Enabled = false;
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
    if (!this.powered) return;
    this.frameSequencer.stepCycles(baseCycles);
  }

  consumeSamples(frameCount: number): Float32Array {
    const frames = Math.max(0, frameCount | 0);
    const out = new Float32Array(frames * 2);

    if (!this.apuSettings.enabled) return out;
    if (!this.powered) return out;

    /*
    NR51: routes CH1–CH4 to left/right (bits 4–7 left, 0–3 right)
    NR50: per-side master volume (0–7) as a gain
    */
    const nr50 = this.nrRegisters[NR50_ADDRESS - NR10_ADDRESS] ?? 0x00;
    const nr51 = this.nrRegisters[NR51_ADDRESS - NR10_ADDRESS] ?? 0x00;

    const mixed = this.mixer.mixSoundChannels(nr50, nr51, {
      ch1: 0,
      ch2: 0,
      ch3: 0,
      ch4: 0,
    });

    for (let sampleIndex = 0; sampleIndex < frames; sampleIndex++) {
      out[sampleIndex * 2] = mixed.left;
      out[sampleIndex * 2 + 1] = mixed.right;
    }

    return out;
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
        return;
      }

      if (!this.powered) {
        this.powered = true;
        this.frameSequencer.resetOnApuPowerOn();
        return;
      }

      this.powered = true;
      return;
    }

    // ignore APU writes except for wave RAM when powered off
    if (!this.powered) return;

    if (address >= NR10_ADDRESS && address <= 0xff25) {
      this.nrRegisters[address - NR10_ADDRESS] = value;

      const isTrigger = (value & 0x80) !== 0;
      if (isTrigger) {
        if (address === NR14_ADDRESS) this.ch1Enabled = true;
        else if (address === NR24_ADDRESS) this.ch2Enabled = true;
        else if (address === NR34_ADDRESS) this.ch3Enabled = true;
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
