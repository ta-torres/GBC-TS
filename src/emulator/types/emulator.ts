export interface EmulatorSnapshot {
  version: 1;
  cpu: CpuSnapshot;
  ppu: PpuSnapshot;
  timer: TimerSnapshot;
  interrupts: InterruptSnapshot;
  cartridge: CartridgeSnapshot;
  memory: MemorySnapshot;
  emuData: {
    ticks: number;
    speedMultiplier: number;
  };
}

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
  halted: boolean;
}

export interface PpuSnapshot {
  ly: number;
  mode: number;
  lcdc: number;
  stat: number;
  scx: number;
  scy: number;
  wx: number;
  wy: number;
  vblankCount: number;
}

export interface TimerSnapshot {
  div: number;
  tima: number;
  tma: number;
  tac: number;
}

export interface InterruptSnapshot {
  ie: number;
  if: number;
}

export interface CartridgeSnapshot {
  title: string;
  mbcType: string;
  romBank: number | null;
  ramBank: number | null;
  hasBattery: boolean;
}

export interface MemorySnapshot {
  wram: Uint8Array;
  vram: Uint8Array;
  hram: Uint8Array;
  ioRegisters: Uint8Array;
  oam: Uint8Array;
}
