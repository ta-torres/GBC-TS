import { describe, it, expect } from "vitest";
import { Mixer } from "../apu/mixer";

describe("APU Mixer (NR50/NR51)", () => {
  it("routes CH1 to left only when NR51 bit4 is set", () => {
    const mixer = new Mixer();

    // left vol = 7, right vol = 7
    const nr50 = 0x77;

    // CH1 -> left only
    const nr51 = 0x10;

    const out = mixer.mixSoundChannels(nr50, nr51, {
      ch1: 1,
      ch2: 0,
      ch3: 0,
      ch4: 0,
    });
    expect(out.left).toBeGreaterThan(0);
    expect(out.right).toBe(0);
  });

  it("applies independent left/right master volumes from NR50", () => {
    const mixer = new Mixer();

    // left vol = 7, right vol = 0
    const nr50 = 0x70;

    // CH1 -> left and right
    const nr51 = 0x11;

    const out = mixer.mixSoundChannels(nr50, nr51, {
      ch1: 1,
      ch2: 0,
      ch3: 0,
      ch4: 0,
    });
    expect(out.left).toBeGreaterThan(0);
    expect(out.right).toBe(0);
  });
});
