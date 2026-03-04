import { describe, it, expect } from "vitest";
import { FrameSequencer } from "../apu/frameSequencer";
import { LengthCounter } from "../apu/channels/components/lengthCounter";
import { VolumeEnvelope } from "../apu/channels/components/volumeEnvelope";

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

  it("LengthCounter loads and expires only when enabled", () => {
    const length = new LengthCounter(64);

    length.writeLength(0);
    expect(length.isZero()).toBe(false);

    expect(length.clock()).toBe(false);

    length.writeLengthEnable(true);

    for (let i = 0; i < 63; i++) {
      expect(length.clock()).toBe(false);
    }

    expect(length.clock()).toBe(true);
    expect(length.isZero()).toBe(true);
  });

  it("VolumeEnvelope changes volume every N envelope clocks", () => {
    const envelope = new VolumeEnvelope();

    // initial=5, increase, period=2
    envelope.writeNRx2(0x5a);
    envelope.onTrigger();
    expect(envelope.getVolume()).toBe(5);

    envelope.advanceVolumeEnvelope();
    expect(envelope.getVolume()).toBe(5);
    envelope.advanceVolumeEnvelope();
    expect(envelope.getVolume()).toBe(6);

    envelope.advanceVolumeEnvelope();
    envelope.advanceVolumeEnvelope();
    expect(envelope.getVolume()).toBe(7);
  });

  it("VolumeEnvelope does nothing when period is 0", () => {
    const envelope = new VolumeEnvelope();

    // initial=5, increase, period=0
    envelope.writeNRx2(0x58);
    envelope.onTrigger();

    for (let i = 0; i < 20; i++) envelope.advanceVolumeEnvelope();
    expect(envelope.getVolume()).toBe(5);
  });
});
