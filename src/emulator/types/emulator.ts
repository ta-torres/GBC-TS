export interface EmulatorSnapshot {
  version: 2;
  cpu: CpuSnapshot;
  ppu: PpuSnapshot;
  timer: TimerSnapshot;
  interrupts: InterruptSnapshot;
  cartridge: CartridgeSnapshot;
  memory: MemorySnapshot;
  apu: ApuSnapshot;
  joypad: JoypadSnapshot;
  emulatorState: EmulatorStateSnapshot;
}

/* CPU */

export interface CpuSnapshot {
  pc: number;
  sp: number;
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  h: number;
  l: number;
  f: number;
  ime: boolean;
  imeScheduled: boolean;
  halted: boolean;
  stopped: boolean;
  haltBug: boolean;
}

/* PPU */

export interface PpuSnapshot {
  // dont store the full internal state, the rest is covered by the io registers in MemorySnapshot.
  // the framebuffer will be re-rendered after restoring the snapshot
  mode: number;
  currentScanlineLY: number;
  cyclesInLine: number;
  windowScanline: number;
  windowDrawnThisScanline: boolean;
  enteredHBlank: boolean;
  frameReady: boolean;
  statInterruptSet: {
    m0: boolean;
    m1: boolean;
    m2: boolean;
    lyc: boolean;
  };
}

export interface TimerSnapshot {
  div: number;
  tima: number;
  tma: number;
  tac: number;
  divCycles: number;
  timaCycles: number;
}

export interface InterruptSnapshot {
  ie: number;
  if: number;
}

/* Cartridge / MBC */

export interface CartridgeSnapshot {
  title: string;
  cartridgeType: number;
  globalChecksum: number;
  ram: Uint8Array | null;
  mbc: MBCSnapshot | null;
}

export type MBCSnapshot = MBC1Snapshot | MBC3Snapshot | MBC5Snapshot;

export interface MBC1Snapshot {
  type: "MBC1";
  ramEnabled: boolean;
  romBankLow5: number;
  ramBank: number;
  bankingMode: number;
}

export interface MBC3Snapshot {
  type: "MBC3";
  ramEnabled: boolean;
  romBank: number;
  ramBank: number;
  selectedRTCReg: number | null;
  rtcS: number;
  rtcM: number;
  rtcH: number;
  rtcDL: number;
  rtcDH: number;
  latchedRtcS: number;
  latchedRtcM: number;
  latchedRtcH: number;
  latchedRtcDL: number;
  latchedRtcDH: number;
  rtcLatched: boolean;
  lastLatchWrite: number;
}

export interface MBC5Snapshot {
  type: "MBC5";
  ramEnabled: boolean;
  romBankLow8: number;
  romBankHigh1: number;
  ramBank: number;
}

/* AddressBus */

export interface MemorySnapshot {
  wramBank0: Uint8Array;
  wramBanks: Uint8Array[];
  currentWramBank: number;
  vramBanks: Uint8Array[];
  cpuVramBank: number;
  hram: Uint8Array;
  ioRegisters: Uint8Array;
  oam: Uint8Array;

  cgbMode: boolean;
  cgbDoubleSpeed: boolean;
  speedSwitchRequested: boolean;

  bgPaletteRam: Uint8Array;
  objPaletteRam: Uint8Array;
  bgPaletteIndex: number;
  bgPaletteAutoInc: boolean;
  objPaletteIndex: number;
  objPaletteAutoInc: boolean;

  hdmaActive: boolean;
  hdmaBlocksRemaining: number;
  hdmaCurrentSource: number;
  hdmaCurrentDest: number;
  hdmaSourceHigh: number;
  hdmaSourceLow: number;
  hdmaDestHigh: number;
  hdmaDestLow: number;
}

/* APU */

export interface ApuSnapshot {
  powered: boolean;
  nrRegisters: Uint8Array;
  waveRam: Uint8Array;
  ch1Enabled: boolean;
  ch2Enabled: boolean;
  ch3Enabled: boolean;
  ch4Enabled: boolean;
  frameSequencerStep: number;
  frameSequencerCycles: number;
  samplePhaseBaseCycles: number;
}

/* Joypad */

export interface JoypadSnapshot {
  directionalState: number;
  buttonState: number;
}

/* Emulator only state  */

export interface EmulatorStateSnapshot {
  cgbMode: boolean;
  ticks: number;
  speedMultiplier: number;
}

/* Storage payload */

export interface SaveStatePayload {
  format: "gbc-ts-save-state";
  version: 1;
  savedAt: string;
  romIdentity: {
    title: string;
    cartridgeType: number;
    globalChecksum: number;
  };
  state: EmulatorSnapshot;
}

export interface SlotInfo {
  slot: number;
  occupied: boolean;
  savedAt: string | null;
}
