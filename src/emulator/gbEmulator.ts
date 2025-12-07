import { Cartridge } from "./cartridge/cartridge";
import { CPU } from "./core/cpu";
import { AddressBus } from "./memory/addressBus";
import { loadROMFile } from "./utils/fileLoader";
import { toHex16 } from "@/emulator/utils/bitwise";
import { Interrupts } from "./core/interrupts";
import { Timer } from "./core/timer";
import { PPU } from "./ppu/ppu";
import { Joypad } from "./input/joypad";
import type { JoypadButton } from "./input/joypad";

export class GBEmulator {
  private cartridge: Cartridge;
  private cpu: CPU;
  private bus: AddressBus;
  private interrupts: Interrupts;
  private timer: Timer;
  private ppu: PPU;
  private joypad: Joypad;

  private running = false;
  private paused = false;
  private ticks = 0;
  private speedMultiplier = 1.0;

  constructor() {
    this.cartridge = new Cartridge();
    // use class fields instead of const for global scope access
    this.interrupts = new Interrupts();
    this.timer = new Timer(this.interrupts);
    this.bus = new AddressBus(this.cartridge, this.timer, this.interrupts);
    this.joypad = new Joypad(this.interrupts);
    this.bus.attachJoypad(this.joypad);
    this.cpu = new CPU(this.bus, this.interrupts);
    this.ppu = new PPU(
      this.bus.getVRAMView(),
      this.bus.getOAMView(),
      this.bus.getIORegistersView(),
      this.interrupts,
    );
  }

  async loadROM(file: File): Promise<boolean> {
    try {
      const data = await loadROMFile(file);
      if (!this.cartridge.load(data)) {
        console.error("Failed to load cartridge");
        return false;
      }

      this.reset();
      return true;
    } catch (error) {
      console.error("Error loading ROM:", error);
      return false;
    }
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
    this.cpu.reset();
    this.bus.reset();
    this.timer.reset();
    this.interrupts.reset();
    this.joypad.reset();
    this.ppu.reset();
    this.ticks = 0;
    this.running = false;
    this.paused = false;
    console.log("Emulator reset");
  }

  stepInstruction(): void {
    if (!this.cartridge.isLoaded()) return;
    try {
      const cycles = this.cpu.step();
      // update timer based on t-cycles from opcodes
      this.timer.step(cycles);
      this.ppu.step(cycles);
      this.ticks += cycles;

      //console.log(this.getCPUState());
      //console.log(this.cpu.getInstruction());
    } catch (error) {
      console.error("CPU error:", error);
      this.stop();
    }
  }

  runCycles(cyclesPerFrame: number): void {
    /* 
    154 scanlines/frame * 456 cycles/scanline = 70224 cycles/frame 
    Each RAF iteration in App.tsx calls runCycles by one frame worth of cpu cycles (70224)
    
    stepInstruction adds t-cycles to ticks, which are used by runCycles to stop running the current frame once 70224 cycles have been consumed
    */

    if (!this.running || this.paused) return;

    const targetCycles = cyclesPerFrame * this.speedMultiplier;
    let remainingCycles = targetCycles;
    while (remainingCycles > 0 && this.running && !this.paused) {
      const ticks = this.ticks;
      this.stepInstruction();
      const cyclesSpent = this.ticks - ticks;
      if (cyclesSpent <= 0) break;

      remainingCycles -= cyclesSpent;
    }
  }

  runInstructions(count: number): void {
    for (let i = 0; i < count; i++) {
      if (!this.running) break;
      this.stepInstruction();
    }
  }

  step(): void {
    if (this.running && !this.paused) {
      this.stepInstruction();
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

  consumeFrameReady(): boolean {
    return this.ppu.consumeFrameReady();
  }

  pressButton(button: JoypadButton): void {
    this.joypad.pressButton(button);
  }

  releaseButton(button: JoypadButton): void {
    this.joypad.releaseButton(button);
  }
}
