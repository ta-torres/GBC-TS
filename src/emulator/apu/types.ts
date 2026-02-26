export type APUSettings = {
  enabled: boolean;
  muteCh1: boolean;
  muteCh2: boolean;
  muteCh3: boolean;
  muteCh4: boolean;
  bypassEnvelope?: boolean;
  bypassLengthCounter?: boolean;
  bypassSweep?: boolean;
};

export const DEFAULT_APU_SETTINGS: APUSettings = {
  enabled: false,
  muteCh1: false,
  muteCh2: false,
  muteCh3: false,
  muteCh4: false,
};
