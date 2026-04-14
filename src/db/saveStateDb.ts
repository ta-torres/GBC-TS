import Dexie, { type Table } from "dexie";
import type { EmulatorSnapshot } from "@/emulator/types/emulator";

export interface SaveStateRecord {
  /* Primary key - ${gameKey}:slot${N} */
  stateKey: string;
  gameKey: string;
  slot: number;
  savedAt: string;
  format: "gbc-ts-save-state";
  version: 1;
  romIdentity: {
    title: string;
    cartridgeType: number;
    globalChecksum: number;
  };

  state: EmulatorSnapshot;
}

class GBCSaveStateDB extends Dexie {
  // saveStates! is a definite assignment assertion because Dexie initializes it at runtime,
  // strictPropertyInitialization expects properties to either be initialized in the constructor or have a default value
  saveStates!: Table<SaveStateRecord, string>;

  constructor() {
    super("GBC-TS-SaveStates");
    this.version(1).stores({
      // index gameKey to query all save states for a specific game
      saveStates: "stateKey, gameKey",
    });
  }
}

export const db = new GBCSaveStateDB();
