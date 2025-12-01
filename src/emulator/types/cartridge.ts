export interface CartridgeHeader {
  // 0x0134-0x0143: Title (16 bytes, but GBC uses some for other data)
  title: string;

  // 0x013F-0x0142: Manufacturer code (GBC only)
  manufacturerCode: string;

  // 0x0143: CGB flag
  // 0x80 = GBC compatible, 0xC0 = GBC only
  cgbFlag: number;

  // 0x0144-0x0145: New licensee code
  licenseeCode: string;

  // 0x0146: SGB flag
  sgbFlag: number;

  // 0x0147: Cartridge type
  cartridgeType: number;

  // 0x0148: ROM size
  romSize: number;

  // 0x0149: RAM size
  ramSize: number;

  // 0x014A: Destination code (0 = Japanese, 1 = Non-Japanese)
  destinationCode: number;

  // 0x014B: Old licensee code
  oldLicenseeCode: number;

  // 0x014C: Mask ROM version
  romVersion: number;

  // 0x014D: Header checksum
  headerChecksum: number;

  // 0x014E-0x014F: Global checksum
  globalChecksum: number;
}

export const CARTRIDGE_TYPE = {
  ROM_ONLY: 0x00,
  MBC1: 0x01,
  MBC1_RAM: 0x02,
  MBC1_RAM_BATTERY: 0x03,
  MBC2: 0x05,
  MBC2_BATTERY: 0x06,
  ROM_RAM: 0x08,
  ROM_RAM_BATTERY: 0x09,
  MBC3_TIMER_BATTERY: 0x0f,
  MBC3_TIMER_RAM_BATTERY: 0x10,
  MBC3: 0x11,
  MBC3_RAM: 0x12,
  MBC3_RAM_BATTERY: 0x13,
  MBC5: 0x19,
  MBC5_RAM: 0x1a,
  MBC5_RAM_BATTERY: 0x1b,
  MBC5_RUMBLE: 0x1c,
  MBC5_RUMBLE_RAM: 0x1d,
  MBC5_RUMBLE_RAM_BATTERY: 0x1e,
} as const;

export type CartridgeTypeCode =
  (typeof CARTRIDGE_TYPE)[keyof typeof CARTRIDGE_TYPE];

export const getROMSize = (code: number): number => {
  // Returns size in bytes
  return 32768 * (1 << code); // 32KB * 2^code
};

export const getRAMSize = (code: number): number => {
  // Mapping per spec guide. Some codes are reserved/unused.
  const sizes = [0, 0, 8192, 32768, 131072, 65536];
  return sizes[code] || 0;
};
