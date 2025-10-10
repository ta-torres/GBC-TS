import { describe, it, expect, beforeEach } from "vitest";
import { Cartridge } from "../emulator/cartridge/cartridge";

describe("Cartridge", () => {
  let cartridge: Cartridge;

  beforeEach(() => {
    cartridge = new Cartridge();
  });

  describe("load", () => {
    it("should load valid ROM with header", () => {
      const rom = new Uint8Array(0x8000);

      const title = "TEST ROM";
      for (let i = 0; i < title.length; i++) {
        rom[0x0134 + i] = title.charCodeAt(i);
      }

      // rom only cartridge
      rom[0x0147] = 0x00;

      let checksum = 0;
      for (let i = 0x0134; i <= 0x014c; i++) {
        checksum = checksum - rom[i] - 1;
      }
      rom[0x014d] = checksum & 0xff;

      expect(cartridge.load(rom.buffer)).toBe(true);
      expect(cartridge.isLoaded()).toBe(true);
      expect(cartridge.getHeader()?.title).toBe("TEST ROM");
    });
  });

  describe("read", () => {
    it("should read from ROM area", () => {
      const rom = new Uint8Array(0x8000);
      rom[0] = 0x31;
      rom[0x100] = 0xc3;

      rom[0x0147] = 0x00;
      let checksum = 0;
      for (let i = 0x0134; i <= 0x014c; i++) {
        checksum = checksum - rom[i] - 1;
      }
      rom[0x014d] = checksum & 0xff;

      cartridge.load(rom.buffer);

      expect(cartridge.read(0x0000)).toBe(0x31);
      expect(cartridge.read(0x0100)).toBe(0xc3);
    });

    it("should return 0xFF for unimplemented areas", () => {
      const rom = new Uint8Array(0x8000);
      rom[0x0147] = 0x00;
      let checksum = 0;
      for (let i = 0x0134; i <= 0x014c; i++) {
        checksum = checksum - rom[i] - 1;
      }
      rom[0x014d] = checksum & 0xff;

      cartridge.load(rom.buffer);

      expect(cartridge.read(0xa000)).toBe(0xff);
    });
  });
});
