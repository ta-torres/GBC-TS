import { APU } from "../apu";

export type AudioHarnessWrite = {
  atSample: number;
  addr: number;
  value: number;
};

export type RenderAudioOptions = {
  apu: APU;
  seconds: number;
  sampleRate: number;
  writes?: AudioHarnessWrite[];
  chunkFrames?: number;
};

const CPU_BASE_HZ = 4194304;

export function renderAudioToBuffer(opts: RenderAudioOptions): Float32Array {
  const seconds = Math.max(0, opts.seconds);
  const sampleRate = Math.max(1, opts.sampleRate | 0);
  const totalFrames = Math.max(0, Math.floor(seconds * sampleRate));
  const out = new Float32Array(totalFrames * 2);

  const chunkFrames = Math.max(1, (opts.chunkFrames ?? 256) | 0);

  const writes = [...(opts.writes ?? [])].sort(
    (a, b) => (a.atSample | 0) - (b.atSample | 0),
  );
  let writeIndex = 0;

  let cycleRemainder = 0;

  let frameCursor = 0;
  while (frameCursor < totalFrames) {
    const framesThisChunk = Math.min(chunkFrames, totalFrames - frameCursor);

    // Apply any writes scheduled at or before the current sample
    while (
      writeIndex < writes.length &&
      (writes[writeIndex]?.atSample ?? 0) <= frameCursor
    ) {
      const w = writes[writeIndex]!;
      opts.apu.writeRegister(w.addr, w.value);
      writeIndex++;
    }

    // Generate samples for this chunk
    const chunk = opts.apu.consumeSamples(framesThisChunk);
    out.set(chunk, frameCursor * 2);

    // Advance emulation time corresponding to this chunk
    const exactCycles = (framesThisChunk * CPU_BASE_HZ) / sampleRate;
    const wholeCycles = Math.floor(exactCycles + cycleRemainder);
    cycleRemainder = exactCycles + cycleRemainder - wholeCycles;

    if (wholeCycles > 0) opts.apu.step(wholeCycles);

    frameCursor += framesThisChunk;
  }

  return out;
}

export function rmsOfInterleavedStereo(
  interleaved: Float32Array,
  startFrame: number,
  frameCount: number,
): number {
  const frames = Math.max(0, frameCount | 0);
  const start = Math.max(0, startFrame | 0);

  let sum = 0;
  let n = 0;

  for (let i = 0; i < frames; i++) {
    const frameIndex = start + i;
    const base = frameIndex * 2;
    if (base + 1 >= interleaved.length) break;

    const l = interleaved[base] ?? 0;
    const r = interleaved[base + 1] ?? 0;
    const x = (l + r) * 0.5;

    sum += x * x;
    n++;
  }

  if (n === 0) return 0;
  return Math.sqrt(sum / n);
}
