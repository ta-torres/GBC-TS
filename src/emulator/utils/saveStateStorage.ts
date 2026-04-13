import type {
  EmulatorSnapshot,
  SaveStatePayload,
  SlotInfo,
  MemorySnapshot,
  CartridgeSnapshot,
  ApuSnapshot,
} from "../types/emulator";

const SAVE_STATE_PREFIX = "gbc-state:";
const MAX_SLOTS = 5;

/* Base64 helpers for typed arrays */

function encodeTypedArray(arr: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]!);
  }
  return btoa(binary);
}

function decodeToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

/* Serialization */

function serializeSnapshot(snapshot: EmulatorSnapshot): unknown {
  return {
    ...snapshot,
    cartridge: serializeCartridge(snapshot.cartridge),
    memory: serializeMemory(snapshot.memory),
    apu: serializeApu(snapshot.apu),
  };
}

function serializeCartridge(c: CartridgeSnapshot): unknown {
  return {
    ...c,
    ram: c.ram ? encodeTypedArray(c.ram) : null,
  };
}

function serializeMemory(m: MemorySnapshot): unknown {
  return {
    ...m,
    wramBank0: encodeTypedArray(m.wramBank0),
    wramBanks: m.wramBanks.map(encodeTypedArray),
    vramBanks: m.vramBanks.map(encodeTypedArray),
    hram: encodeTypedArray(m.hram),
    ioRegisters: encodeTypedArray(m.ioRegisters),
    oam: encodeTypedArray(m.oam),
    bgPaletteRam: encodeTypedArray(m.bgPaletteRam),
    objPaletteRam: encodeTypedArray(m.objPaletteRam),
  };
}

function serializeApu(a: ApuSnapshot): unknown {
  return {
    ...a,
    nrRegisters: encodeTypedArray(a.nrRegisters),
    waveRam: encodeTypedArray(a.waveRam),
  };
}

/* Deserialization */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeSnapshot(raw: any): EmulatorSnapshot {
  return {
    ...raw,
    cartridge: deserializeCartridge(raw.cartridge),
    memory: deserializeMemory(raw.memory),
    apu: deserializeApu(raw.apu),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeCartridge(raw: any): CartridgeSnapshot {
  return {
    ...raw,
    ram: raw.ram ? decodeToUint8Array(raw.ram) : null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeMemory(raw: any): MemorySnapshot {
  return {
    ...raw,
    wramBank0: decodeToUint8Array(raw.wramBank0),
    wramBanks: raw.wramBanks.map(decodeToUint8Array),
    vramBanks: raw.vramBanks.map(decodeToUint8Array),
    hram: decodeToUint8Array(raw.hram),
    ioRegisters: decodeToUint8Array(raw.ioRegisters),
    oam: decodeToUint8Array(raw.oam),
    bgPaletteRam: decodeToUint8Array(raw.bgPaletteRam),
    objPaletteRam: decodeToUint8Array(raw.objPaletteRam),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deserializeApu(raw: any): ApuSnapshot {
  return {
    ...raw,
    nrRegisters: decodeToUint8Array(raw.nrRegisters),
    waveRam: decodeToUint8Array(raw.waveRam),
  };
}

/* Public storage API */

export function saveSaveState(
  baseKey: string,
  slot: number,
  snapshot: EmulatorSnapshot,
  romIdentity: { title: string; cartridgeType: number; globalChecksum: number },
): void {
  const key = `${baseKey}:slot${slot}`;
  const payload: SaveStatePayload = {
    format: "gbc-ts-save-state",
    version: 1,
    savedAt: new Date().toISOString(),
    romIdentity,
    state: snapshot as EmulatorSnapshot,
  };

  const serialized = JSON.stringify({
    ...payload,
    state: serializeSnapshot(payload.state),
  });

  localStorage.setItem(key, serialized);
}

export function loadSaveState(
  baseKey: string,
  slot: number,
): EmulatorSnapshot | null {
  const key = `${baseKey}:slot${slot}`;
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const payload = JSON.parse(raw);

    if (payload.format !== "gbc-ts-save-state") return null;

    return deserializeSnapshot(payload.state);
  } catch {
    return null;
  }
}

export function deleteSaveState(baseKey: string, slot: number): void {
  const key = `${baseKey}:slot${slot}`;
  localStorage.removeItem(key);
}

export function deleteAllSaveStates(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);

    if (key?.startsWith(SAVE_STATE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}

export function getSaveStateSlotInfo(baseKey: string): SlotInfo[] {
  const slots: SlotInfo[] = [];
  for (let slot = 1; slot <= MAX_SLOTS; slot++) {
    const key = `${baseKey}:slot${slot}`;
    const raw = localStorage.getItem(key);

    if (raw) {
      try {
        const payload = JSON.parse(raw);

        slots.push({
          slot,
          occupied: true,
          savedAt: payload.savedAt ?? null,
        });
      } catch {
        slots.push({ slot, occupied: false, savedAt: null });
      }
    } else {
      slots.push({ slot, occupied: false, savedAt: null });
    }
  }
  return slots;
}
