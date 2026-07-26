import { Cartridge } from "./cartridge/cartridge";
import { CPU } from "./core/cpu";
import { AddressBus } from "./memory/addressBus";
import { loadROMFile } from "./utils/fileLoader";
import { toHex16 } from "./utils/bitwise";
import { Interrupts } from "./core/interrupts";
import { Timer } from "./core/timer";
import { PPU } from "./ppu/ppu";
import { Joypad } from "./input/joypad";
import type { JoypadButton } from "./input/joypad";
import { APU } from "./apu/apu";
import type { APUSettings } from "./apu/types";
import type {
  EmulatorSnapshot,
  EmulatorStateSnapshot,
  MBC3RTCSnapshot,
} from "./types/emulator";

export class GBCEmulator {
  private cartridge: Cartridge;
  private cpu: CPU;
  private bus: AddressBus;
  private interrupts: Interrupts;
  private timer: Timer;
  private ppu: PPU;
  private joypad: Joypad;
  private apu: APU;

  private cgbMode: boolean = false;

  private running = false;
  private paused = false;
  private ticks = 0;
  private speedMultiplier = 1.0;
  private errorMessage: string | null = null;

  constructor() {
    this.cartridge = new Cartridge();
    this.interrupts = new Interrupts();
    this.timer = new Timer(this.interrupts);
    this.apu = new APU();
    this.bus = new AddressBus(
      this.cartridge,
      this.timer,
      this.interrupts,
      this.apu,
    );
    this.joypad = new Joypad(this.interrupts);
    this.bus.attachJoypad(this.joypad);
    this.cpu = new CPU(this.bus, this.interrupts);
    this.ppu = new PPU(
      this.bus.getVRAMBank0View(),
      this.bus.getVRAMBank1View(),
      this.bus.getOAMView(),
      this.bus.getIORegistersView(),
      this.interrupts,
      this.cgbMode,
      this.bus.getCGBBackgroundPaletteRAMView(),
      this.bus.getCGBObjectPaletteRAMView(),
    );
  }

  getErrorMessage(): string | null {
    return this.errorMessage;
  }

  async loadROM(file: File): Promise<boolean> {
    try {
      this.errorMessage = null;
      const data = await loadROMFile(file);
      return this.loadROMFromBuffer(data);
    } catch (error) {
      console.error("Error loading ROM:", error);
      this.errorMessage = "Error loading ROM";
      return false;
    }
  }

  loadROMFromBuffer(data: ArrayBuffer | SharedArrayBuffer): boolean {
    this.errorMessage = null;
    if (!this.cartridge.load(data)) {
      this.errorMessage = this.cartridge.getErrorMessage();
      return false;
    }

    const header = this.cartridge.getHeader();
    const cgbFlag = header?.cgbFlag ?? 0x00;
    const isCgb = cgbFlag === 0x80 || cgbFlag === 0xc0;
    this.cgbMode = isCgb;

    this.reset();
    return true;
  }

  start(): void {
    if (!this.cartridge.isLoaded()) {
      console.error("No ROM loaded");
      return;
    }
    this.running = true;
    this.paused = false;
    console.log("Emulator started");
  }

  pause(): void {
    this.paused = !this.paused;
    console.log(this.paused ? "Emulator paused" : "Emulator resumed");
  }

  stop(): void {
    this.running = false;
    console.log("Emulator stopped");
  }

  reset(): void {
    this.cpu.reset(this.cgbMode);
    this.bus.reset(this.cgbMode);
    this.ppu.reset(this.cgbMode);
    this.timer.reset();
    this.interrupts.reset();
    this.joypad.reset();
    this.apu.reset();
    this.ticks = 0;
    this.running = false;
    this.paused = false;
    console.log("Emulator reset");
  }

  stepInstruction(): void {
    if (!this.cartridge.isLoaded()) return;
    try {
      const timeCycles = this.cpu.step();
      const baseCycles = this.bus.isDoubleSpeed()
        ? Math.floor(timeCycles / 2)
        : timeCycles;

      // update PPU/timer at base clock speed
      this.timer.step(baseCycles);
      this.ppu.step(baseCycles);
      this.apu.step(baseCycles);
      if (this.ppu.hasEnteredHBlank()) this.bus.stepHDMAHBlank();
      this.cartridge.step(baseCycles);

      this.ticks += baseCycles;

      //console.log(this.getCPUState());
      //console.log(this.cpu.getInstruction());
    } catch (error) {
      console.error("CPU error:", error);
      this.stop();
    }
  }

  stepFrameCycle(): void {
    /* 
    154 scanlines/frame * 456 cycles/scanline = 70224 cycles/frame 
    Each RAF iteration in useGBCEmulator calls this function by one frame worth of cpu cycles (70224)
    
    stepInstruction adds t-cycles to ticks, which are used by this function to stop running the current frame once 70224 cycles have been consumed
    */

    if (!this.running || this.paused) return;

    const CYCLES_PER_FRAME = 70224;
    const targetCycles = CYCLES_PER_FRAME * this.speedMultiplier;
    let remainingCycles = targetCycles;

    while (remainingCycles > 0 && this.running && !this.paused) {
      const ticksBeforeInstruction = this.ticks;
      this.stepInstruction();
      const cyclesSpent = this.ticks - ticksBeforeInstruction;
      if (cyclesSpent <= 0) break;

      remainingCycles -= cyclesSpent;
    }
  }

  isRunning(): boolean {
    return this.running;
  }

  isPaused(): boolean {
    return this.paused;
  }

  getTicks(): number {
    return this.ticks;
  }

  setSpeedMultiplier(multiplier: number): void {
    const clampedValue = Math.min(Math.max(0.25, multiplier), 4.0);
    this.speedMultiplier = clampedValue;
  }

  getSpeedMultiplier(): number {
    return this.speedMultiplier;
  }

  getCPUState(): string {
    const pc = toHex16(this.cpu.getPC());
    const sp = toHex16(this.cpu.getSP());
    const instruction = this.cpu.getInstruction();
    return `Instruction: ${instruction} | PC: ${pc} | SP: ${sp} | ${this.cpu.getRegisters().toString()}`;
  }

  /* PPU */

  getTileViewerData(): { width: number; height: number; data: Uint8Array } {
    return this.ppu.getTileViewerData();
  }

  getSpriteTileViewerData(): {
    width: number;
    height: number;
    data: Uint8Array;
  } {
    return this.ppu.getSpriteTileViewerData();
  }

  getFramebuffer(): Uint32Array {
    return this.ppu.getFramebuffer();
  }

  hasFrameReady(): boolean {
    return this.ppu.hasFrameReady();
  }

  /* JOYPAD */

  pressButton(button: JoypadButton): void {
    this.joypad.pressButton(button);
  }

  releaseButton(button: JoypadButton): void {
    this.joypad.releaseButton(button);
  }

  /* CARTRIDGE */

  getCartridgeHeader() {
    return this.cartridge.getHeader();
  }

  getSRAMSnapshot(): Uint8Array | null {
    return this.cartridge.getSRAMSnapshot();
  }

  loadSRAMSnapshot(data: Uint8Array): void {
    this.cartridge.loadSRAMSnapshot(data);
  }

  getSaveKey(): string | null {
    return this.cartridge.getSaveKey();
  }

  hasSRAMBeenWrittenTo(): boolean {
    return this.cartridge.hasSRAMBeenWrittenTo();
  }

  clearSRAMWriteFlag(): void {
    this.cartridge.clearSRAMWriteFlag();
  }

  hasRTC(): boolean {
    return this.cartridge.hasRTC();
  }

  getRTCSnapshot(): MBC3RTCSnapshot | null {
    return this.cartridge.getRTCSnapshot();
  }

  loadRTCSnapshot(snapshot: MBC3RTCSnapshot): void {
    this.cartridge.loadRTCSnapshot(snapshot);
  }

  advanceRTCTime(elapsedMs: number): void {
    this.cartridge.advanceRTCTime(elapsedMs);
  }

  getRTCSaveKey(): string | null {
    return this.cartridge.getRTCSaveKey();
  }

  /* APU */

  setAudioEnabled(enabled: boolean): void {
    this.apu.setAPUSettings({ enabled });
  }

  consumeAudioSamples(frameCount: number): Float32Array {
    return this.apu.consumeSamples(frameCount);
  }

  setAudioConfig(cfg: Partial<APUSettings>): void {
    this.apu.setAPUSettings(cfg);
  }

  getSaveStateKey(): string | null {
    return this.cartridge.getSaveStateKey();
  }

  takeSnapshot(): EmulatorSnapshot {
    const state: EmulatorStateSnapshot = {
      cgbMode: this.cgbMode,
      ticks: this.ticks,
      speedMultiplier: this.speedMultiplier,
    };

    return {
      version: 2,
      cpu: this.cpu.takeSnapshot(),
      ppu: this.ppu.takeSnapshot(),
      timer: this.timer.takeSnapshot(),
      interrupts: this.interrupts.takeSnapshot(),
      cartridge: this.cartridge.takeSnapshot(),
      memory: this.bus.takeSnapshot(),
      apu: this.apu.takeSnapshot(),
      joypad: this.joypad.takeSnapshot(),
      emulatorState: state,
    };
  }

  restoreSnapshot(snapshot: EmulatorSnapshot): void {
    /* 
    Subsystems are restored in dependency order to avoid stale reads:

    1. Interrupts - no dependencies
    2. AddressBus - owns the shared memory arrays, must be first so PPU views see correct data
    3. Timer - reads from interrupts
    4. Cartridge / MBC - ROM bank state
    5. PPU - syncs LY/STAT from already-restored IO registers
    6. APU - independent
    7. CPU - depends on bus and interrupts being ready
    8. Joypad - independent
    9. Emulator state fields (cgbMode, ticks, speedMultiplier)
    */

    this.interrupts.restoreSnapshot(snapshot.interrupts);
    this.bus.restoreSnapshot(snapshot.memory);
    this.timer.restoreSnapshot(snapshot.timer);
    this.cartridge.restoreSnapshot(snapshot.cartridge);
    this.ppu.restoreSnapshot(snapshot.ppu);
    this.apu.restoreSnapshot(snapshot.apu);
    this.cpu.restoreSnapshot(snapshot.cpu);
    this.joypad.restoreSnapshot(snapshot.joypad);

    this.cgbMode = snapshot.emulatorState.cgbMode;
    this.ticks = snapshot.emulatorState.ticks;
    this.speedMultiplier = snapshot.emulatorState.speedMultiplier;

    this.running = true;
    this.paused = false;
    this.errorMessage = null;
  }
}
