// https://www.w3schools.com/js/js_bitwise.asp
// unsigned 8-bit a hex
export const toHex8 = (value: number): string => {
  return `0x${(value & 0xff).toString(16).padStart(2, "0").toUpperCase()}`;
};

// unsigned 16-bit a hex
export const toHex16 = (value: number): string => {
  return `0x${(value & 0xffff).toString(16).padStart(4, "0").toUpperCase()}`;
};
