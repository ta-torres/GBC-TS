export type WavWriteOptions = {
  sampleRate: number;
  numChannels?: number;
};

function writeAscii(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
}

export function floatToPcm16(x: number): number {
  const clamped = Math.max(-1, Math.min(1, x));
  return clamped < 0
    ? Math.round(clamped * 32768)
    : Math.round(clamped * 32767);
}

export function encodeWavPcm16(
  interleaved: Float32Array,
  opts: WavWriteOptions,
): Uint8Array {
  const numChannels = Math.max(1, (opts.numChannels ?? 2) | 0);
  const sampleRate = Math.max(1, opts.sampleRate | 0);

  if (interleaved.length % numChannels !== 0) {
    throw new Error(
      `WAV encode: interleaved length (${interleaved.length}) not divisible by numChannels (${numChannels})`,
    );
  }

  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;

  const dataSize = interleaved.length * bytesPerSample;
  const riffSize = 36 + dataSize;

  const out = new Uint8Array(44 + dataSize);
  const view = new DataView(out.buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, riffSize, true);
  writeAscii(view, 8, "WAVE");

  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample

  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < interleaved.length; i++) {
    const s16 = floatToPcm16(interleaved[i] ?? 0);
    view.setInt16(o, s16, true);
    o += 2;
  }

  return out;
}
