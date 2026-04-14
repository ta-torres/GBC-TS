import type { EmulatorSnapshot, SlotInfo } from "../types/emulator";
import { db } from "@/db/saveStateDb";
import type { SaveStateRecord } from "@/db/saveStateDb";

const MAX_SLOTS = 5;

export async function saveSaveState(
  gameKey: string,
  slot: number,
  snapshot: EmulatorSnapshot,
  romIdentity: { title: string; cartridgeType: number; globalChecksum: number },
): Promise<void> {
  const record: SaveStateRecord = {
    stateKey: `${gameKey}:slot${slot}`,
    gameKey,
    slot,
    savedAt: new Date().toISOString(),
    format: "gbc-ts-save-state",
    version: 1,
    romIdentity,
    state: snapshot,
  };

  await db.saveStates.put(record);
}

export async function loadSaveState(
  gameKey: string,
  slot: number,
): Promise<EmulatorSnapshot | null> {
  const record = await db.saveStates.get(`${gameKey}:slot${slot}`);

  if (!record || record.format !== "gbc-ts-save-state") return null;
  return record.state;
}

export async function deleteSaveState(
  gameKey: string,
  slot: number,
): Promise<void> {
  await db.saveStates.delete(`${gameKey}:slot${slot}`);
}

export async function deleteAllSaveStates(): Promise<void> {
  await db.saveStates.clear();
}

export async function getSaveStateSlotInfo(
  gameKey: string,
): Promise<SlotInfo[]> {
  const records = await db.saveStates
    .where("gameKey")
    .equals(gameKey)
    .toArray();

  const slots: SlotInfo[] = [];

  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    const record = records.find((r) => r.slot === slot);

    slots.push(
      record
        ? { slot, occupied: true, savedAt: record.savedAt }
        : { slot, occupied: false, savedAt: null },
    );
  }
  return slots;
}
