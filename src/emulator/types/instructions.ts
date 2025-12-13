import type { AddressBus } from "../memory/addressBus";

export type OpcodeHandler<TCpu> = (cpu: TCpu, bus: AddressBus) => number;

export interface OpcodeInfo<TCpu> {
  mnemonic: string;
  bytes: number;
  cycles: number;
  execute: OpcodeHandler<TCpu>;
}
