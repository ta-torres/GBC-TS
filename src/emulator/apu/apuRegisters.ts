/*
https://gbdev.io/pandocs/Audio_Registers.html
As a rule of thumb, for any x in 1, 2, 3, 4:

NRx0 is some channel-specific feature (if present),
NRx1 controls the length timer,
NRx2 controls the volume and envelope,
NRx3 controls the period (maybe only partially),
NRx4 has the channel’s trigger and length timer enable bits, as well as any leftover bits of period;
…but there are some exceptions.

CH3: no envelope, NR32 is volume code
CH4: no frequency, NR43 is the LFSR timer configuration (shift/divisor/width)
*/

export const AUDIO_REG_START = 0xff10;

export const GLOBAL = {
  // https://gbdev.io/pandocs/Audio_Registers.html#ff24--nr50-master-volume--vin-panning
  NR50: 0xff24,
  // volume/mixer registers
  // https://gbdev.io/pandocs/Audio_Registers.html#ff25--nr51-sound-panning
  NR51: 0xff25,
  NR52: 0xff26,
} as const;

export const CH1 = {
  NR10: 0xff10,
  NR11: 0xff11,
  NR12: 0xff12,
  NR13: 0xff13,
  NR14: 0xff14,
} as const;

export const CH2 = {
  NR21: 0xff16,
  NR22: 0xff17,
  NR23: 0xff18,
  NR24: 0xff19,
} as const;

export const CH3 = {
  NR30: 0xff1a,
  NR31: 0xff1b,
  NR32: 0xff1c,
  NR33: 0xff1d,
  NR34: 0xff1e,
} as const;

export const CH4 = {
  NR41: 0xff20,
  NR42: 0xff21,
  NR43: 0xff22,
  NR44: 0xff23,
} as const;

export const WAVE_RAM = {
  START: 0xff30,
  END: 0xff3f,
} as const;
