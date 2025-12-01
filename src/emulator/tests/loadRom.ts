import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Cartridge } from "../cartridge/cartridge";

const main = async () => {
  const romPath = process.argv[2];
  if (!romPath) {
    console.error("Usage: npx tsx scripts/loadRom.ts <path/to/rom.gb>");
    process.exit(1);
  }

  const absolutePath = resolve(romPath);
  const fileBuffer = await readFile(absolutePath);

  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength,
  );

  const cartridge = new Cartridge();
  const ok = cartridge.load(arrayBuffer);

  if (!ok) {
    console.error("Failed to load ROM");
    process.exit(1);
  }

  const header = cartridge.getHeader();
  console.log(header);
};

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
