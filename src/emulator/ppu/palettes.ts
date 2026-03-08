export const DMG_RGBA = [0xffffffff, 0xffaaaaaa, 0xff555555, 0xff000000];

export function mapDMGPalette(bgp: number, color: 0 | 1 | 2 | 3): number {
  const shift = color * 2;
  const shade = (bgp >> shift) & 0x03;
  return DMG_RGBA[shade] ?? 0xffffffff;
}

export function mapOBPPalette(obp: number, color: 0 | 1 | 2 | 3): number {
  const shift = color * 2;
  const shade = (obp >> shift) & 0x03;
  return DMG_RGBA[shade];
}

export const CGB_RGB555_TO_RGBA: Uint32Array = (() => {
  // https://gbdev.io/pandocs/Palettes.html#rgb-translation-by-cgbs
  const rgb555ToRgbaTable = new Uint32Array(0x8000);

  const clamp01 = (value: number): number => {
    if (value < 0) return 0;
    if (value > 1) return 1;
    return value;
  };

  const toCgbIntensity = (channel5: number): number => {
    // - top range (0x10-0x1F) appears very bright (compressed highlights)
    // - maximum intensity is light gray, not pure white
    const normalizedChannel = clamp01((channel5 & 0x1f) / 31);

    // Non-linear curve, gammaBase makes darks darker, highlightLift avoids gap near the top end
    const gammaBase = 1.2;
    const highlightLift = 0.1;
    const curveValue =
      (1 - highlightLift) * Math.pow(normalizedChannel, gammaBase) +
      highlightLift * Math.pow(normalizedChannel, 0.35);

    const whiteLevel = 230;
    return clamp01(curveValue) * (whiteLevel / 255);
  };

  const colorIntensityTable = new Float32Array(32);
  for (let i = 0; i < 32; i++) colorIntensityTable[i] = toCgbIntensity(i);

  for (let rgb555 = 0; rgb555 < 0x8000; rgb555++) {
    const r5 = rgb555 & 0x1f;
    const g5 = (rgb555 >> 5) & 0x1f;
    const b5 = (rgb555 >> 10) & 0x1f;

    const r = colorIntensityTable[r5] ?? 0;
    const g = colorIntensityTable[g5] ?? 0;
    const b = colorIntensityTable[b5] ?? 0;

    const rBlend = 0.78 * r + 0.14 * g + 0.08 * b;
    const gBlend = 0.1 * r + 0.8 * g + 0.1 * b;
    const bBlend = 0.08 * r + 0.16 * g + 0.76 * b;

    // Mild desaturation towards luminance
    const luminance = 0.2126 * rBlend + 0.7152 * gBlend + 0.0722 * bBlend;
    const desaturation = 0;
    const rOut = rBlend * (1 - desaturation) + luminance * desaturation;
    const gOut = gBlend * (1 - desaturation) + luminance * desaturation;
    const bOut = bBlend * (1 - desaturation) + luminance * desaturation;

    const r8 = (clamp01(rOut) * 255) | 0;
    const g8 = (clamp01(gOut) * 255) | 0;
    const b8 = (clamp01(bOut) * 255) | 0;

    rgb555ToRgbaTable[rgb555] = (0xff << 24) | (b8 << 16) | (g8 << 8) | r8;
  }

  return rgb555ToRgbaTable;
})();

export function cgbRgb555ToRgba(rgb555: number): number {
  // https://gbdev.io/pandocs/Palettes.html#rgb-translation-by-cgbs
  return CGB_RGB555_TO_RGBA[rgb555 & 0x7fff] ?? 0xff000000;
}

export function mapCGBBgPalette(
  cgbBgPaletteRam: Uint8Array,
  paletteNumber: number,
  color: 0 | 1 | 2 | 3,
): number {
  const pal = paletteNumber & 0x07;
  const idx = (pal * 8 + color * 2) & 0x3f;
  const low = cgbBgPaletteRam[idx] ?? 0x00;
  const high = cgbBgPaletteRam[(idx + 1) & 0x3f] ?? 0x00;
  const rgb555 = low | (high << 8);
  return cgbRgb555ToRgba(rgb555);
}

export function mapCGBObjPalette(
  cgbObjPaletteRam: Uint8Array,
  paletteNumber: number,
  color: 0 | 1 | 2 | 3,
): number {
  const pal = paletteNumber & 0x07;
  const idx = (pal * 8 + color * 2) & 0x3f;
  const low = cgbObjPaletteRam[idx] ?? 0x00;
  const high = cgbObjPaletteRam[(idx + 1) & 0x3f] ?? 0x00;
  const rgb555 = low | (high << 8);
  return cgbRgb555ToRgba(rgb555);
}
