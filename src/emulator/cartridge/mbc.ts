export interface MBC {
  read(address: number): number;
  write(address: number, value: number): void;
  getROMBank(): number;
  getRAMBank(): number;
}
