export type AudioOutputOptions = {
  bufferMs?: number;
  targetFillMs?: number;
};

class StereoRingBuffer {
  private buffer: Float32Array;
  private perChannelFrameBufferCount: number;
  private readFrame = 0;
  private writeFrame = 0;
  private numberOfFramesInBuffer = 0;

  constructor(capacityFrames: number) {
    // create a fixed-size stereo ring buffer storing interleaved [l,r] frames
    this.perChannelFrameBufferCount = Math.max(1, capacityFrames | 0);
    this.buffer = new Float32Array(this.perChannelFrameBufferCount * 2);
  }

  availableFrames(): number {
    // return how many frames can be popped without underrunning
    return this.numberOfFramesInBuffer;
  }

  pushInterleaved(data: Float32Array): void {
    // push interleaved stereo frames into the ring (dropping oldest on overflow)
    const frames = (data.length / 2) | 0;
    for (let i = 0; i < frames; i++) {
      if (this.numberOfFramesInBuffer >= this.perChannelFrameBufferCount) {
        // Drop oldest frame on overflow
        this.readFrame = (this.readFrame + 1) % this.perChannelFrameBufferCount;
        this.numberOfFramesInBuffer -= 1;
      }

      const writeIndex = this.writeFrame;
      this.buffer[writeIndex * 2] = data[i * 2] ?? 0;
      this.buffer[writeIndex * 2 + 1] = data[i * 2 + 1] ?? 0;

      this.writeFrame = (this.writeFrame + 1) % this.perChannelFrameBufferCount;
      this.numberOfFramesInBuffer += 1;
    }
  }

  popToChannels(
    frameCount: number,
    outL: Float32Array,
    outR: Float32Array,
  ): number {
    // pop up to frameCount frames into outL/outR, returning frames actually written
    const want = Math.max(0, frameCount | 0);
    const have = Math.min(want, this.numberOfFramesInBuffer);

    for (let i = 0; i < have; i++) {
      const readIndex = this.readFrame;
      outL[i] = this.buffer[readIndex * 2] ?? 0;
      outR[i] = this.buffer[readIndex * 2 + 1] ?? 0;
      this.readFrame = (this.readFrame + 1) % this.perChannelFrameBufferCount;
      this.numberOfFramesInBuffer -= 1;
    }

    return have;
  }
}

export class AudioOutput {
  private ctx: AudioContext | null = null;
  private node: ScriptProcessorNode | null = null;

  private static readonly AUDIO_BLOCK_FRAMES = 1024;
  private static readonly MIN_BUFFERED_BLOCKS = 2;

  private enabled = true;
  private underruns = 0;

  private ring: StereoRingBuffer | null = null;
  private bufferMs: number;
  private targetFillMs: number;

  private apu: { consumeSamples(numberOfFrames: number): Float32Array } | null =
    null;

  /*
  change to fix latency
  */
  constructor(opts?: AudioOutputOptions) {
    this.bufferMs = opts?.bufferMs ?? 120;
    this.targetFillMs = opts?.targetFillMs ?? 60;
  }

  attach(apu: { consumeSamples(numberOfFrames: number): Float32Array }): void {
    // attach a sample source (apu) that can produce interleaved stereo frames
    this.apu = apu;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async start(): Promise<void> {
    // create audio context + script processor and begin playback
    if (!this.enabled) return;
    if (this.ctx) return;

    const ctx = new AudioContext();
    const ctxSampleRate = ctx.sampleRate;

    const ringCapacityFrames = Math.max(
      1,
      Math.floor((ctxSampleRate * this.bufferMs) / 1000),
    );
    this.ring = new StereoRingBuffer(ringCapacityFrames);

    const scriptBufferSize = AudioOutput.AUDIO_BLOCK_FRAMES;
    const scriptNode = ctx.createScriptProcessor(scriptBufferSize, 0, 2);
    scriptNode.onaudioprocess = (audioEvent) => {
      // fill the output buffer from the ring buffer (or silence if empty)
      const outputLeft = audioEvent.outputBuffer.getChannelData(0);
      const outputRight = audioEvent.outputBuffer.getChannelData(1);

      outputLeft.fill(0);
      outputRight.fill(0);

      if (!this.enabled) return;
      if (!this.ring) return;

      const framesRead = this.ring.popToChannels(
        outputLeft.length,
        outputLeft,
        outputRight,
      );
      if (framesRead < outputLeft.length) {
        this.underruns += 1;
      }
    };

    scriptNode.connect(ctx.destination);

    this.ctx = ctx;
    this.node = scriptNode;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  }

  stop(): void {
    const scriptNode = this.node;
    const ctx = this.ctx;

    this.node = null;
    this.ctx = null;
    this.ring = null;

    if (scriptNode) scriptNode.disconnect();
    if (ctx) void ctx.close();
  }

  pump(): void {
    // pull samples from the apu into the ring buffer to maintain target fill level
    if (!this.enabled) return;
    if (!this.ctx) return;
    if (!this.ring) return;
    if (!this.apu) return;

    const ctxSampleRate = this.ctx.sampleRate;
    const targetFillFramesFromMs = Math.max(
      0,
      Math.floor((ctxSampleRate * this.targetFillMs) / 1000),
    );
    const minTargetFillFrames =
      AudioOutput.AUDIO_BLOCK_FRAMES * AudioOutput.MIN_BUFFERED_BLOCKS;
    // Whichever is larger gets used for the ring buffer
    const targetFillFrames = Math.max(
      targetFillFramesFromMs,
      minTargetFillFrames,
    );
    const bufferedFramesAvailable = this.ring.availableFrames();

    const framesNeeded = targetFillFrames - bufferedFramesAvailable;
    if (framesNeeded <= 0) return;

    const blockFrames = AudioOutput.AUDIO_BLOCK_FRAMES;
    const blocksNeeded = Math.ceil(framesNeeded / blockFrames);
    for (let i = 0; i < blocksNeeded; i++) {
      this.ring.pushInterleaved(this.apu.consumeSamples(blockFrames));
    }
  }

  getStats(): { underruns: number; bufferedMs: number } {
    const ctx = this.ctx;
    const ring = this.ring;

    if (!ctx || !ring) {
      return { underruns: this.underruns, bufferedMs: 0 };
    }

    const bufferedMs = (ring.availableFrames() / ctx.sampleRate) * 1000;
    return { underruns: this.underruns, bufferedMs };
  }
}
