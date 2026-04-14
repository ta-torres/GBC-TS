import { describe, it, expect } from "vitest";
import { Cartridge } from "../cartridge/cartridge";
import { Interrupts } from "../core/interrupts";
import { Timer } from "../core/timer";
import { APU } from "../apu/apu";
import { AddressBus } from "../memory/addressBus";
import { CPU } from "../core/cpu";
import { PPU } from "../ppu/ppu";
import { Joypad } from "../input/joypad";
import { GBCEmulator } from "../gbcEmulator";

function makeROM(program: number[]): Uint8Array {
  const rom = new Uint8Array(0x8000);
  for (let i = 0; i < program.length; i++) rom[0x0100 + i] = program[i] & 0xff;
  rom[0x0147] = 0x00; // ROM ONLY, no MBC
  let checksum = 0;
  for (let i = 0x0134; i <= 0x014c; i++) checksum = checksum - rom[i] - 1;
  rom[0x014d] = checksum & 0xff;
  return rom;
}

describe("Save States", () => {
  describe("Subsystem round-trip snapshots", () => {
    it("Interrupts: take and restore snapshot preserves state", () => {
      const interrupts = new Interrupts();
      interrupts.setIE(0x1f);
      interrupts.setIF(0x0a);

      const snapshot = interrupts.takeSnapshot();
      const interrupts2 = new Interrupts();
      interrupts2.restoreSnapshot(snapshot);

      expect(interrupts2.getIE()).toBe(0x1f);
      // getIF() returns raw value OR'd with 0xE0 (top 3 bits always set)
      expect(interrupts2.getIF()).toBe(0x0a | 0xe0);
    });

    it("Timer: take and restore snapshot preserves state", () => {
      const interrupts = new Interrupts();
      const timer = new Timer(interrupts);
      // Step the timer to accumulate some state
      timer.step(1000);

      const snapshot = timer.takeSnapshot();
      const interrupts2 = new Interrupts();
      const timer2 = new Timer(interrupts2);
      timer2.restoreSnapshot(snapshot);

      const snap2 = timer2.takeSnapshot();
      expect(snap2.div).toBe(snapshot.div);
      expect(snap2.tima).toBe(snapshot.tima);
      expect(snap2.tma).toBe(snapshot.tma);
      expect(snap2.tac).toBe(snapshot.tac);
      expect(snap2.divCycles).toBe(snapshot.divCycles);
      expect(snap2.timaCycles).toBe(snapshot.timaCycles);
    });

    it("Joypad: take and restore snapshot preserves state", () => {
      const interrupts = new Interrupts();
      const joypad = new Joypad(interrupts);
      joypad.pressButton("a");
      joypad.pressButton("up");

      const snapshot = joypad.takeSnapshot();
      const interrupts2 = new Interrupts();
      const joypad2 = new Joypad(interrupts2);
      joypad2.restoreSnapshot(snapshot);

      const snap2 = joypad2.takeSnapshot();
      expect(snap2.directionalState).toBe(snapshot.directionalState);
      expect(snap2.buttonState).toBe(snapshot.buttonState);
    });

    it("CPU: take and restore snapshot preserves registers", () => {
      const rom = makeROM([0x00]); // NOP
      const cart = new Cartridge();
      cart.load(rom.buffer);
      const interrupts = new Interrupts();
      const timer = new Timer(interrupts);
      const apu = new APU();
      const bus = new AddressBus(cart, timer, interrupts, apu);
      const cpu = new CPU(bus, interrupts);

      // Run a NOP to advance PC
      cpu.step();

      const snapshot = cpu.takeSnapshot();

      // Create a fresh CPU and restore
      const cart2 = new Cartridge();
      cart2.load(rom.buffer);
      const interrupts2 = new Interrupts();
      const timer2 = new Timer(interrupts2);
      const apu2 = new APU();
      const bus2 = new AddressBus(cart2, timer2, interrupts2, apu2);
      const cpu2 = new CPU(bus2, interrupts2);
      cpu2.restoreSnapshot(snapshot);

      const snap2 = cpu2.takeSnapshot();
      expect(snap2.pc).toBe(snapshot.pc);
      expect(snap2.sp).toBe(snapshot.sp);
      expect(snap2.a).toBe(snapshot.a);
      expect(snap2.f).toBe(snapshot.f);
      expect(snap2.ime).toBe(snapshot.ime);
      expect(snap2.halted).toBe(snapshot.halted);
    });

    it("AddressBus: take and restore uses .set() (shared views preserved)", () => {
      const rom = makeROM([]);
      const cart = new Cartridge();
      cart.load(rom.buffer);
      const interrupts = new Interrupts();
      const timer = new Timer(interrupts);
      const apu = new APU();
      const bus = new AddressBus(cart, timer, interrupts, apu);

      // Write data to WRAM
      bus.write(0xc000, 0x42);
      bus.write(0xc001, 0xab);
      // Write data to HRAM
      bus.write(0xff80, 0x99);

      const snapshot = bus.takeSnapshot();

      // Clear the bus memory
      bus.write(0xc000, 0x00);
      bus.write(0xc001, 0x00);
      bus.write(0xff80, 0x00);

      // Get OAM view before restore
      const oamView = bus.getOAMView();
      const oamRef = oamView; // same reference

      bus.restoreSnapshot(snapshot);

      // Verify data restored
      expect(bus.read(0xc000)).toBe(0x42);
      expect(bus.read(0xc001)).toBe(0xab);
      expect(bus.read(0xff80)).toBe(0x99);

      // Verify OAM view is the SAME object (not replaced)
      expect(bus.getOAMView()).toBe(oamRef);
    });

    it("PPU: take and restore preserves internal counters (no framebuffer)", () => {
      const rom = makeROM([]);
      const cart = new Cartridge();
      cart.load(rom.buffer);
      const interrupts = new Interrupts();
      const timer = new Timer(interrupts);
      const apu = new APU();
      const bus = new AddressBus(cart, timer, interrupts, apu);

      const vram0 = bus.getVRAMBank0View();
      const vram1 = bus.getVRAMBank1View();
      const oam = bus.getOAMView();
      const io = bus.getIORegistersView();
      const bgPal = bus.getCGBBackgroundPaletteRAMView();
      const objPal = bus.getCGBObjectPaletteRAMView();
      const ppu = new PPU(vram0, vram1, oam, io, interrupts, false, bgPal, objPal);

      // Step PPU to advance scanline
      ppu.step(200);
      const snapshot = ppu.takeSnapshot();

      // Create a fresh PPU and restore
      const ppu2 = new PPU(vram0, vram1, oam, io, interrupts, false, bgPal, objPal);
      ppu2.restoreSnapshot(snapshot);

      const snap2 = ppu2.takeSnapshot();
      expect(snap2.mode).toBe(snapshot.mode);
      expect(snap2.currentScanlineLY).toBe(snapshot.currentScanlineLY);
      expect(snap2.cyclesInLine).toBe(snapshot.cyclesInLine);
      expect(snap2.windowScanline).toBe(snapshot.windowScanline);
    });

    it("APU: take and restore preserves powered state and registers", () => {
      const apu = new APU();
      // Power on the APU by writing to NR52
      apu.writeRegister(0xff26, 0x80);
      // Write some register values
      apu.writeRegister(0xff11, 0x80); // NR11: duty 50%

      const snapshot = apu.takeSnapshot();
      expect(snapshot.powered).toBe(true);

      const apu2 = new APU();
      apu2.restoreSnapshot(snapshot);

      const snap2 = apu2.takeSnapshot();
      expect(snap2.powered).toBe(true);
      expect(snap2.nrRegisters).toEqual(snapshot.nrRegisters);
      expect(snap2.waveRam).toEqual(snapshot.waveRam);
    });
  });

  describe("GBCEmulator orchestrator round-trip", () => {
    it("takeSnapshot and restoreSnapshot produce equivalent state", () => {
      const emu = new GBCEmulator();
      const rom = makeROM([
        0x3e, 0x42, // LD A, 0x42
        0x06, 0x10, // LD B, 0x10
        0x00, // NOP
      ]);
      emu.loadROMFromBuffer(rom.buffer);
      emu.start();

      // Execute a few instructions
      for (let i = 0; i < 5; i++) {
        emu.stepInstruction();
      }

      const snapshot = emu.takeSnapshot();

      // Create a second emulator with same ROM
      const emu2 = new GBCEmulator();
      emu2.loadROMFromBuffer(rom.buffer);
      emu2.start();

      emu2.restoreSnapshot(snapshot);

      const snap2 = emu2.takeSnapshot();

      // CPU state should match
      expect(snap2.cpu.a).toBe(snapshot.cpu.a);
      expect(snap2.cpu.b).toBe(snapshot.cpu.b);
      expect(snap2.cpu.pc).toBe(snapshot.cpu.pc);
      expect(snap2.cpu.sp).toBe(snapshot.cpu.sp);

      // Timer state should match
      expect(snap2.timer.divCycles).toBe(snapshot.timer.divCycles);

      // PPU state should match
      expect(snap2.ppu.cyclesInLine).toBe(snapshot.ppu.cyclesInLine);
      expect(snap2.ppu.currentScanlineLY).toBe(snapshot.ppu.currentScanlineLY);

      // Emulator state should match
      expect(snap2.emulatorState.ticks).toBe(snapshot.emulatorState.ticks);
    });
  });
});
