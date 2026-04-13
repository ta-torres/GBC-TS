import type { MBCSnapshot } from "../types/emulator";

export interface MBC {
  read(address: number): number;
  write(address: number, value: number): void;
  getROMBank(): number;
  getRAMBank(): number;
  hasSRAMBeenWrittenTo(): boolean;
  clearSRAMWriteFlag(): void;
  takeSnapshot(): MBCSnapshot;
  restoreSnapshot(snapshot: MBCSnapshot): void;
}
