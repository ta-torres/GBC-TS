import { describe, it, expect } from "vitest";
import { APU } from "../apu/apu";
import { IO_REGISTERS } from "../types/memory";

describe("APU", () => {
  it("(not power dependent) NR52 power off clears NR10-NR51 shadow registers", () => {
    const apu = new APU();

    apu.writeRegister(IO_REGISTERS.NR52, 0x80);
    apu.writeRegister(IO_REGISTERS.NR10, 0x12);
    apu.writeRegister(IO_REGISTERS.NR50, 0x77);

    expect(apu._debugReadRegister(IO_REGISTERS.NR10)).toBe(0x12);
    expect(apu._debugReadRegister(IO_REGISTERS.NR50)).toBe(0x77);

    apu.writeRegister(IO_REGISTERS.NR52, 0x00);

    expect(apu._debugReadRegister(IO_REGISTERS.NR10)).toBe(0x00);
    expect(apu._debugReadRegister(IO_REGISTERS.NR50)).toBe(0x00);
  });

  it("(not power dependent) Wave RAM remains accessible across NR52 power off", () => {
    const apu = new APU();

    apu.writeWaveRam(IO_REGISTERS.WAVE_RAM_START, 0x12);
    expect(apu.readWaveRam(IO_REGISTERS.WAVE_RAM_START)).toBe(0x12);

    apu.writeRegister(IO_REGISTERS.NR52, 0x80);
    apu.writeRegister(IO_REGISTERS.NR52, 0x00);

    expect(apu.readWaveRam(IO_REGISTERS.WAVE_RAM_START)).toBe(0x12);
  });

  it("FF27-FF2F is not handled by APU register API", () => {
    const apu = new APU();

    expect(apu.readRegister(0xff27)).toBe(0xff);
    apu.writeRegister(0xff27, 0x12);
    expect(apu.readRegister(0xff27)).toBe(0xff);
  });
});
