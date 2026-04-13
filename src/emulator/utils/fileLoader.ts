import { unzipSync } from "fflate";

const readFileAsArrayBuffer = (file: File): Promise<ArrayBuffer> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (result instanceof ArrayBuffer) {
        resolve(result);
      } else {
        reject(new Error("Failed to read file as ArrayBuffer"));
      }
    };
    reader.onerror = () => reject(new Error("File reading failed"));
    reader.readAsArrayBuffer(file);
  });

const extractROMFromZip = (zipBuffer: ArrayBuffer): ArrayBuffer => {
  const files = unzipSync(new Uint8Array(zipBuffer));
  const romEntry = Object.entries(files).find(([name]) =>
    /\.(gb|gbc)$/i.test(name),
  );
  if (!romEntry) {
    throw new Error("No .gb or .gbc file found inside the ZIP archive");
  }
  return romEntry[1].buffer as ArrayBuffer;
};

export const loadROMFile = async (file: File): Promise<ArrayBuffer> => {
  const buffer = await readFileAsArrayBuffer(file);
  if (file.name.toLowerCase().endsWith(".zip")) {
    return extractROMFromZip(buffer);
  }
  return buffer;
};
