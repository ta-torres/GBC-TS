import { describe, it, expect } from "vitest";
import { Cartridge } from "../cartridge/cartridge";
import { AddressBus } from "../memory/addressBus";
import { Interrupts } from "../core/interrupts";
import { Timer } from "../core/timer";
import { IO_REGISTERS } from "../types/memory";
import { APU } from "../apu/apu";

function makeROM(): Uint8Array {
  const rom = new Uint8Array(0x8000);
  rom[0x0147] = 0x00;

  let checksum = 0;
  for (let i = 0x0134; i <= 0x014c; i++) {
    checksum = checksum - rom[i] - 1;
  }
  rom[0x014d] = checksum & 0xff;

  return rom;
}

function setupBus(): AddressBus {
  const rom = makeROM();
  const cart = new Cartridge();
  cart.load(rom.buffer);
  const interrupts = new Interrupts();
  const timer = new Timer(interrupts);
  const apu = new APU();
  return new AddressBus(cart, timer, interrupts, apu);
}

describe("AddressBus banking", () => {
  describe("WRAM banking", () => {
    it("maps C000-CFFF to fixed bank 0 and D000-DFFF to switchable bank (CGB)", () => {
      const bus = setupBus();
      bus.setCGBMode(true);

      bus.write(0xc000, 0x11);
      bus.write(0xd000, 0x22);

      expect(bus.read(0xc000)).toBe(0x11);
      expect(bus.read(0xd000)).toBe(0x22);

      bus.write(IO_REGISTERS.SVBK, 0x02);
      expect(bus.read(0xd000)).toBe(0x00);

      bus.write(0xd000, 0x33);
      expect(bus.read(0xd000)).toBe(0x33);

      bus.write(IO_REGISTERS.SVBK, 0x01);
      expect(bus.read(0xd000)).toBe(0x22);
      expect(bus.read(0xc000)).toBe(0x11);
    });

    it("SVBK write uses bank 1 when written value is 0 (CGB)", () => {
      const bus = setupBus();
      bus.setCGBMode(true);

      bus.write(IO_REGISTERS.SVBK, 0x00);
      bus.write(0xd000, 0x44);

      bus.write(IO_REGISTERS.SVBK, 0x01);
      expect(bus.read(0xd000)).toBe(0x44);
    });

    it("SVBK reads 0xFF in DMG mode and writes do not change WRAM bank", () => {
      const bus = setupBus();

      expect(bus.read(IO_REGISTERS.SVBK)).toBe(0xff);

      bus.write(0xd000, 0x10);
      bus.write(IO_REGISTERS.SVBK, 0x03);
      expect(bus.read(IO_REGISTERS.SVBK)).toBe(0xff);

      bus.write(0xd000, 0x20);
      expect(bus.read(0xd000)).toBe(0x20);
    });

    it("Echo RAM mirrors C000-DDFF (including banked region)", () => {
      const bus = setupBus();
      bus.setCGBMode(true);

      bus.write(0xc123, 0xaa);
      expect(bus.read(0xe123)).toBe(0xaa);

      bus.write(0xe123, 0xbb);
      expect(bus.read(0xc123)).toBe(0xbb);

      bus.write(IO_REGISTERS.SVBK, 0x03);
      bus.write(0xd123, 0x77);
      expect(bus.read(0xf123)).toBe(0x77);

      bus.write(0xf123, 0x88);
      expect(bus.read(0xd123)).toBe(0x88);

      bus.write(IO_REGISTERS.SVBK, 0x01);
      expect(bus.read(0xd123)).toBe(0x00);
      expect(bus.read(0xf123)).toBe(0x00);
    });
  });

  describe("VRAM banking", () => {
    it("VBK read returns 0xFE | bankBit", () => {
      const bus = setupBus();

      expect(bus.read(IO_REGISTERS.VBK)).toBe(0xfe);
      bus.setCGBMode(true);
      bus.write(IO_REGISTERS.VBK, 0x01);
      expect(bus.read(IO_REGISTERS.VBK)).toBe(0xff);
    });

    it("VBK write only changes CPU VRAM bank when CGB mode is enabled", () => {
      const bus = setupBus();

      bus.write(IO_REGISTERS.VBK, 0x01);
      bus.write(0x8000, 0x12);

      bus.setCGBMode(true);
      expect(bus.read(0x8000)).toBe(0x12);

      bus.write(IO_REGISTERS.VBK, 0x01);
      bus.write(0x8000, 0x34);

      bus.write(IO_REGISTERS.VBK, 0x00);
      expect(bus.read(0x8000)).toBe(0x12);

      bus.write(IO_REGISTERS.VBK, 0x01);
      expect(bus.read(0x8000)).toBe(0x34);
    });
  });
});
