import { DEFAULT_APU_SETTINGS, type APUSettings } from "./types";
import { FrameSequencer } from "./frameSequencer";

const NR10_ADDRESS = 0xff10;
const NR52_ADDRESS = 0xff26;
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

  // Shadow copy of NR10-NR51 (used internally)
  private nrRegisters: Uint8Array;

  private waveRam: Uint8Array;

  private apuSettings: APUSettings = DEFAULT_APU_SETTINGS;

  private frameSequencer: FrameSequencer;

  constructor(sampleRate: number = 48000) {
    this.sampleRate = sampleRate;

    this.nrRegisters = new Uint8Array(0x17);
    this.waveRam = new Uint8Array(0x10);
    this.frameSequencer = new FrameSequencer();
  }

  reset(): void {
    this.powered = false;
    this.nrRegisters.fill(0);
    // NR52 power off does not clear wave RAM per docs?
    this.apuSettings = DEFAULT_APU_SETTINGS;
    this.frameSequencer = new FrameSequencer();
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

    return out;
  }

  readRegister(address: number): number {
    address &= 0xffff;

    if (!isAudioReg(address)) return 0xff;

    if (address === NR52_ADDRESS) {
      const powerBit = this.powered ? 0x80 : 0x00;
      // todo: channel status bits
      return powerBit | 0x70;
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
