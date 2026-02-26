import { describe, it, expect } from "vitest";
import { FrameSequencer } from "../apu/frameSequencer";

describe("APU step timing", () => {
  it("FrameSequencer ticks every 8192 base cycles and follows step table", () => {
    const fs = new FrameSequencer();

    expect(fs.stepCycles(8191)).toHaveLength(0);

    const tick0 = fs.stepCycles(1);
    expect(tick0).toHaveLength(1);
    expect(tick0[0]).toEqual({
      step: 1,
      clockLength: false,
      clockEnvelope: false,
      clockSweep: false,
    });

    const ticks = fs.stepCycles(8192 * 7);
    expect(ticks).toHaveLength(7);
    expect(ticks[ticks.length - 1].step).toBe(0);
  });

  it("FrameSequencer resetOnApuPowerOn makes next tick step 0", () => {
    const fs = new FrameSequencer();

    fs.resetOnApuPowerOn();

    const ticks = fs.stepCycles(8192);
    expect(ticks).toHaveLength(1);
    expect(ticks[0].step).toBe(0);
    expect(ticks[0].clockLength).toBe(true);
  });
});
