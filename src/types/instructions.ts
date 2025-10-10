import type { AddressBus } from "../emulator/memory/addressBus";

export type OpcodeHandler<TCpu> = (cpu: TCpu, bus: AddressBus) => number;

export interface OpcodeInfo<TCpu> {
  mnemonic: string;
  bytes: number;
  cycles: number;
  handler: OpcodeHandler<TCpu>;
}
