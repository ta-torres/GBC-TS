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

describe("channel 2", () => {
  // https://gbdev.io/pandocs/Audio_Registers.html#ff14--nr14-channel-1-period-high--control
  it("CH2 length expiry disables CH2 after a length tick", () => {
    const apu = new APU();
    // power on and enable dac
    apu.writeRegister(IO_REGISTERS.NR52, 0x80);
    apu.writeRegister(IO_REGISTERS.NR22, 0xf1);

    // Set length counter to 1 (64 - (NR21 & 0x3F) => 1 when value is 63)
    apu.writeRegister(IO_REGISTERS.NR21, 0x3f);

    // Trigger with length enabled
    apu.writeRegister(IO_REGISTERS.NR24, 0xc0);
    expect(apu.readRegister(IO_REGISTERS.NR52) & 0x02).toBe(0x02);

    // After power-on reset, next frame sequencer tick is step 0 (length clock)
    apu.step(8192);

    expect(apu.readRegister(IO_REGISTERS.NR52) & 0x02).toBe(0x00);
  });
});
