import type { CPU } from "./cpu";
import type { AddressBus } from "../memory/addressBus";
import type { OpcodeInfo } from "../../types/instructions";

export const OPCODE_TABLE: Record<number, OpcodeInfo<CPU>> = {};

const register = (
  opcode: number,
  mnemonic: string,
  bytes: number,
  cycles: number,
  handler: (cpu: CPU, bus: AddressBus) => number,
) => {
  OPCODE_TABLE[opcode] = { mnemonic, bytes, cycles, handler };
};

// 0x00: NOP
register(0x00, "NOP", 1, 4, () => 4);
