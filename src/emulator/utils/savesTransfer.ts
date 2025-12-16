export type SRAMSavesExport = {
  format: "gbc-ts-sram-saves";
  version: 1;
  exportedAt: string;
  saves: Record<string, string>;
};

export const exportSRAMSavesToFile = () => {
  if (typeof window === "undefined") return;

  const saves: Record<string, string> = {};
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (!key || !key.startsWith("gbc-save:")) continue;
    const value = window.localStorage.getItem(key);
    if (!value) continue;
    saves[key] = value;
  }

  const payload: SRAMSavesExport = {
    format: "gbc-ts-sram-saves",
    version: 1,
    exportedAt: new Date().toISOString(),
    saves,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `gbc-ts-sram-saves-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

export const importSRAMSavesFromFile = async (file: File) => {
  if (typeof window === "undefined") return;

  const text = await file.text();
  const parsed: unknown = JSON.parse(text);

  const payload = parsed as {
    format?: unknown;
    version?: unknown;
    saves?: unknown;
  };

  if (payload.format !== "gbc-ts-sram-saves") {
    throw new Error("Unsupported save file format");
  }

  const saves = payload.saves as Record<string, unknown>;
  for (const [key, value] of Object.entries(saves)) {
    if (!key.startsWith("gbc-save:")) continue;
    if (typeof value !== "string") continue;

    try {
      atob(value);
    } catch {
      continue;
    }

    window.localStorage.setItem(key, value);
  }
};
