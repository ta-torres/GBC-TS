// not used

export const HardwareMode = {
  DMG: "DMG",
  CGB: "CGB",
} as const;

export type HardwareMode = (typeof HardwareMode)[keyof typeof HardwareMode];

export interface HardwareModel {
  mode: HardwareMode;
}

export const DMG_MODEL: HardwareModel = { mode: HardwareMode.DMG };
export const CGB_MODEL: HardwareModel = { mode: HardwareMode.CGB };

export const isCGB = (model: HardwareModel): boolean =>
  model.mode === HardwareMode.CGB;
