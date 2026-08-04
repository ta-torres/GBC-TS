import { useState } from "react";
import type { RefObject } from "react";
import type { GBCEmulator } from "../emulator/gbcEmulator";
import {
  DMG_COLOR_PALETTES,
  CGB_COLOR_PALETTES,
  CGB_DEFAULT,
  type CgbColorPalette,
  type DmgColorPalette,
} from "../emulator/ppu/palettes";
import {
  exportSRAMSavesToFile,
  importSRAMSavesFromFile,
} from "../emulator/utils/savesTransfer";

const initializeDmgPalette = (): DmgColorPalette => {
  if (typeof window === "undefined") return "Gray";

  const savedPalette = window.localStorage.getItem("gbc-dmg-palette");
  return savedPalette && savedPalette in DMG_COLOR_PALETTES
    ? (savedPalette as DmgColorPalette)
    : "Gray";
};

const initializeCgbPalette = (): CgbColorPalette => {
  if (typeof window === "undefined") return CGB_DEFAULT;

  const saved = window.localStorage.getItem("gbc-cgb-color-correction");
  if (saved === "true") return "LCD Corrected";
  if (saved === "false") return "Original";
  return saved && saved in CGB_COLOR_PALETTES
    ? (saved as CgbColorPalette)
    : CGB_DEFAULT;
};

interface UseLocalStorageOptions {
  emulatorRef: RefObject<GBCEmulator | null>;
}

export const useLocalStorage = ({ emulatorRef }: UseLocalStorageOptions) => {
  const [dmgColorPalette, setDmgColorPalette] =
    useState<DmgColorPalette>(initializeDmgPalette);
  const [cgbColorPalette, setCgbColorPaletteState] =
    useState<CgbColorPalette>(initializeCgbPalette);

  const saveSRAM = (emu: GBCEmulator) => {
    const saveKey = emu.getSaveKey();
    if (!saveKey || typeof window === "undefined") return;

    try {
      const sram = emu.getSRAMSnapshot();
      if (!sram) return;

      const encoded = btoa(String.fromCharCode(...sram));
      window.localStorage.setItem(saveKey, encoded);
    } catch (error) {
      console.error("Error saving SRAM", error);
    }
  };

  const saveRTC = (emu: GBCEmulator) => {
    const rtcKey = emu.getRTCSaveKey();
    if (!rtcKey || typeof window === "undefined") return;

    try {
      const snapshot = emu.getRTCSnapshot();
      if (!snapshot) return;

      window.localStorage.setItem(rtcKey, JSON.stringify(snapshot));
    } catch (error) {
      console.error("Error saving RTC state", error);
    }
  };

  const saveMemory = () => {
    const emu = emulatorRef.current;
    if (!emu) return;
    saveSRAM(emu);
    if (emu.hasRTC()) saveRTC(emu);
  };

  const loadSRAM = () => {
    const emu = emulatorRef.current;
    if (!emu || typeof window === "undefined") return;
    const saveKey = emu.getSaveKey();
    if (!saveKey) return;

    try {
      const raw = window.localStorage.getItem(saveKey);
      if (!raw) return;
      const decoded = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
      emu.loadSRAMSnapshot(decoded);
    } catch (error) {
      console.error("Failed to load SRAM from localStorage", error);
    }
  };

  const loadRTC = () => {
    const emu = emulatorRef.current;
    if (!emu || !emu.hasRTC() || typeof window === "undefined") return;
    const rtcKey = emu.getRTCSaveKey();
    if (!rtcKey) return;

    try {
      const raw = window.localStorage.getItem(rtcKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && parsed.version === 1) {
        emu.loadRTCSnapshot(parsed);
      }
    } catch (error) {
      console.error("Failed to load RTC state from localStorage", error);
    }
  };

  const setDisplayPalette = (palette: DmgColorPalette) => {
    window.localStorage.setItem("gbc-dmg-palette", palette);
    setDmgColorPalette(palette);
  };

  const setCgbColorPalette = (palette: CgbColorPalette) => {
    window.localStorage.setItem("gbc-cgb-color-correction", palette);
    setCgbColorPaletteState(palette);
  };

  const exportSRAMSaves = () => {
    if (typeof window === "undefined") return;

    saveMemory();

    try {
      exportSRAMSavesToFile();
    } catch (error) {
      console.error("Failed to export SRAM saves", error);
    }
  };

  const importSRAMSave = async (file: File) => {
    if (typeof window === "undefined") return;

    try {
      await importSRAMSavesFromFile(file);
      loadSRAM();
    } catch (error) {
      console.error("Failed to import SRAM saves", error);
    }
  };

  return {
    dmgColorPalette,
    cgbColorPalette,
    saveSRAM,
    saveRTC,
    saveMemory,
    loadSRAM,
    loadRTC,
    setDisplayPalette,
    setCgbColorPalette,
    exportSRAMSaves,
    importSRAMSave,
  };
};
