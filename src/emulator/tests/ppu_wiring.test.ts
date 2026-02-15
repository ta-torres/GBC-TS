import { describe, it, expect, vi } from "vitest";

const ppuConstructorSpy = vi.fn();

vi.mock("../ppu/ppu", () => {
  class PPU {
    constructor(
      vramBank0: Uint8Array,
      vramBank1: Uint8Array,
      oam: Uint8Array,
      io: Uint8Array,
      interrupts: unknown,
      cgbMode: boolean,
      bgPaletteRam: Uint8Array,
      objPaletteRam: Uint8Array,
    ) {
      ppuConstructorSpy(
        vramBank0,
        vramBank1,
        oam,
        io,
        interrupts,
        cgbMode,
        bgPaletteRam,
        objPaletteRam,
      );
    }

    reset(): void {}
    step(): void {}
    getTileViewerData(): { width: number; height: number; data: Uint8Array } {
      return { width: 0, height: 0, data: new Uint8Array(0) };
    }
    getSpriteTileViewerData(): {
      width: number;
      height: number;
      data: Uint8Array;
    } {
      return { width: 0, height: 0, data: new Uint8Array(0) };
    }
    getFramebuffer(): Uint32Array {
      return new Uint32Array(0);
    }
    consumeFrameReady(): boolean {
      return false;
    }
  }

  return { PPU };
});

describe("PPU wiring", () => {
  it("constructs PPU with both VRAM banks (bank0, bank1) and shared OAM/IO/interrupts", async () => {
    const { GBEmulator } = await import("../gbEmulator");

    new GBEmulator();

    expect(ppuConstructorSpy).toHaveBeenCalledTimes(1);

    const [vram0, vram1, oam, io, interrupts, cgbMode, bgPal, objPal] =
      ppuConstructorSpy.mock.calls[0];

    expect(vram0).toBeInstanceOf(Uint8Array);
    expect(vram1).toBeInstanceOf(Uint8Array);
    expect(oam).toBeInstanceOf(Uint8Array);
    expect(io).toBeInstanceOf(Uint8Array);
    expect(interrupts).toBeTruthy();
    expect(typeof cgbMode).toBe("boolean");
    expect(bgPal).toBeInstanceOf(Uint8Array);
    expect(objPal).toBeInstanceOf(Uint8Array);

    expect((vram0 as Uint8Array).length).toBe(0x2000);
    expect((vram1 as Uint8Array).length).toBe(0x2000);
    expect(vram0).not.toBe(vram1);
    expect((bgPal as Uint8Array).length).toBe(0x40);
    expect((objPal as Uint8Array).length).toBe(0x40);
  });
});
