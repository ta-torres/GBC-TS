import { Cartridge } from "./cartridge/cartridge";
import { CPU } from "./core/cpu";
import { AddressBus } from "./memory/addressBus";
import { loadROMFile } from "../utils/fileLoader";
import { toHex16 } from "@/utils/bitwise";
import { Interrupts } from "./core/interrupts";
import { Timer } from "./core/timer";

export class GBEmulator {
  private cartridge: Cartridge;
  private cpu: CPU;
  private bus: AddressBus;

  private running = false;
  private paused = false;
  private ticks = 0;

  constructor() {
    this.cartridge = new Cartridge();
    const interrupts = new Interrupts();
    const timer = new Timer(interrupts);
    this.bus = new AddressBus(this.cartridge, timer, interrupts);
    this.cpu = new CPU(this.bus);
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
    this.ticks = 0;
    this.running = false;
    this.paused = false;
    console.log("Emulator reset");
  }

  stepInstruction(): void {
    if (!this.cartridge.isLoaded()) return;
    try {
      const cycles = this.cpu.step();
      this.ticks += cycles;

      console.log(this.getCPUState());
      // log instruction
      console.log(this.cpu.getInstruction());
    } catch (error) {
      console.error("CPU error:", error);
      this.stop();
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

  getCPUState(): string {
    const pc = toHex16(this.cpu.getPC());
    const sp = toHex16(this.cpu.getSP());
    const instruction = this.cpu.getInstruction();
    return `Instruction: ${instruction} | PC: ${pc} | SP: ${sp} | ${this.cpu.getRegisters().toString()}`;
  }
}
