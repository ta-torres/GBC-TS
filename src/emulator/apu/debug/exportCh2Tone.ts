import { writeFileSync } from "node:fs";
import { APU } from "../apu";
import { IO_REGISTERS } from "../../types/memory";
import {
  renderAudioToBuffer,
  type AudioHarnessWrite,
} from "./audioTestHarness";
import { encodeWavPcm16 } from "./wavWriter";

const sampleRate = 48000;
const seconds = 2.0;

const apu = new APU(sampleRate);
apu.setAPUSettings({ enabled: true });

const writes: AudioHarnessWrite[] = [
  { atSample: 0, addr: IO_REGISTERS.NR52, value: 0x80 },
  { atSample: 0, addr: IO_REGISTERS.NR50, value: 0x77 },
  { atSample: 0, addr: IO_REGISTERS.NR51, value: 0x22 },

  // CH2
  { atSample: 0, addr: IO_REGISTERS.NR21, value: 0b10_000000 },
  { atSample: 0, addr: IO_REGISTERS.NR22, value: 0xf0 },
  { atSample: 0, addr: IO_REGISTERS.NR23, value: 0x00 },
  { atSample: 0, addr: IO_REGISTERS.NR24, value: 0x80 },
];

const audio = renderAudioToBuffer({
  apu,
  seconds,
  sampleRate,
  writes,
  chunkFrames: 256,
});

const wav = encodeWavPcm16(audio, { sampleRate, numChannels: 2 });

const outPath = new URL("./ch2-tone.wav", import.meta.url);
writeFileSync(outPath, wav);

console.log(`Wrote ${wav.length} bytes to ${outPath.pathname}`);
