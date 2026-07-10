import type { MBC3RTCSnapshot, MBCSnapshot } from "../types/emulator";

export interface MBC {
  read(address: number): number;
  write(address: number, value: number): void;
  getROMBank(): number;
  getRAMBank(): number;
  hasSRAMBeenWrittenTo(): boolean;
  clearSRAMWriteFlag(): void;
  takeSnapshot(): MBCSnapshot;
  restoreSnapshot(snapshot: MBCSnapshot): void;

  // MBC3 RTC only
  step?(cycles: number): void;
  getRTCSnapshot?(): MBC3RTCSnapshot | null;
  loadRTCSnapshot?(snapshot: MBC3RTCSnapshot): void;
}
