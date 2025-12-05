import { useRef, useState, type ChangeEvent } from "react";

interface EmuControllersProps {
  onLoadROM: (file: File) => void;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  onStep: () => void;
  isLoaded: boolean;
  isRunning: boolean;
}

export const EmuControllers = ({
  onLoadROM,
  onStart,
  onPause,
  onReset,
  onStep,
  isLoaded,
  isRunning,
}: EmuControllersProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setFileName(file.name);
      onLoadROM(file);
    }
  };

  return (
    <div className="space-y-4 rounded-lg bg-gray-800 p-4">
      <h2 className="mb-4 text-xl font-bold">Controls</h2>

      <div>
        <label className="mb-2 block text-sm font-medium">Load ROM</label>
        <input
          ref={fileInputRef}
          type="file"
          accept=".gb,.gbc"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full cursor-pointer bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
        >
          Load Game
        </button>
        {fileName && <div className="mt-1 text-xs">{fileName}</div>}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={onStart}
          disabled={!isLoaded || isRunning}
          className="rounded bg-green-600 px-4 py-2 font-medium hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Start
        </button>

        <button
          onClick={onPause}
          disabled={!isRunning}
          className="rounded bg-yellow-600 px-4 py-2 font-medium hover:bg-yellow-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Pause
        </button>

        <button
          onClick={onReset}
          disabled={!isLoaded}
          className="rounded bg-red-600 px-4 py-2 font-medium hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Reset
        </button>

        <button
          onClick={onStep}
          disabled={!isLoaded || isRunning}
          className="rounded bg-blue-600 px-4 py-2 font-medium hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-600"
        >
          Step
        </button>
      </div>
    </div>
  );
};
