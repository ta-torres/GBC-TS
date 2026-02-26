// https://gbdev.io/pandocs/Memory_Map.html
export const MEMORY_MAP = {
  ROM_BANK_0: { start: 0x0000, end: 0x3fff },
  ROM_BANK_N: { start: 0x4000, end: 0x7fff },
  VRAM: { start: 0x8000, end: 0x9fff },
  EXTERNAL_RAM: { start: 0xa000, end: 0xbfff },
  WRAM_BANK_0: { start: 0xc000, end: 0xcfff },
  WRAM_BANK_N: { start: 0xd000, end: 0xdfff },
  ECHO_RAM: { start: 0xe000, end: 0xfdff },
  OAM: { start: 0xfe00, end: 0xfe9f },
  UNUSABLE: { start: 0xfea0, end: 0xfeff },
  IO_REGISTERS: { start: 0xff00, end: 0xff7f },
  HRAM: { start: 0xff80, end: 0xfffe },
  IE_REGISTER: 0xffff,
} as const;

export const IO_REGISTERS = {
  // Joypad
  P1: 0xff00,

  // Serial
  SB: 0xff01,
  SC: 0xff02,

  // Timer
  DIV: 0xff04,
  TIMA: 0xff05,
  TMA: 0xff06,
  TAC: 0xff07,

  // Interrupts
  IF: 0xff0f,
  IE: 0xffff,

  // APU
  // https://gbdev.io/pandocs/Audio_Registers.html

  /* 
  As a rule of thumb, for any x in 1, 2, 3, 4:

  NRx0 is some channel-specific feature (if present),
  NRx1 controls the length timer,
  NRx2 controls the volume and envelope,
  NRx3 controls the period (maybe only partially),
  NRx4 has the channel’s trigger and length timer enable bits, as well as any leftover bits of period;

  …but there are some exceptions.
  */
  NR10: 0xff10,
  NR11: 0xff11,
  NR12: 0xff12,
  NR13: 0xff13,
  NR14: 0xff14,

  NR21: 0xff16,
  NR22: 0xff17,
  NR23: 0xff18,
  NR24: 0xff19,

  NR30: 0xff1a,
  NR31: 0xff1b,
  NR32: 0xff1c,
  NR33: 0xff1d,
  NR34: 0xff1e,

  NR41: 0xff20,
  NR42: 0xff21,
  NR43: 0xff22,
  NR44: 0xff23,

  NR50: 0xff24,
  NR51: 0xff25,
  // AUDENA - Audio enable bit7
  NR52: 0xff26,

  WAVE_RAM_START: 0xff30,
  WAVE_RAM_END: 0xff3f,

  // LCD
  LCDC: 0xff40,
  STAT: 0xff41,
  SCY: 0xff42,
  SCX: 0xff43,
  LY: 0xff44,
  LYC: 0xff45,
  DMA: 0xff46,
  BGP: 0xff47,
  OBP0: 0xff48,
  OBP1: 0xff49,
  WY: 0xff4a,
  WX: 0xff4b,

  // GBC specific
  KEY1: 0xff4d,
  VBK: 0xff4f,
  HDMA1: 0xff51,
  HDMA2: 0xff52,
  HDMA3: 0xff53,
  HDMA4: 0xff54,
  HDMA5: 0xff55,
  BCPS: 0xff68,
  BCPD: 0xff69,
  OCPS: 0xff6a,
  OCPD: 0xff6b,
  SVBK: 0xff70,
} as const;
